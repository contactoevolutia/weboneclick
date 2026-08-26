/**
 * Sincronización de ventas pagadas hacia Odoo:
 * res.partner → sale.order → account.payment
 */

import { prisma } from "@/lib/prisma";
import { getShippingWarehouseOdooId } from "@/lib/almacenes";
import {
  checkStockOdooWarehouse,
  formatStockShortageMessage,
} from "@/lib/odoo-stock";
import { getOdooConfig, isOdooSyncEnabled, type OdooConfig } from "@/lib/odoo-config";
import { grossToNet, round2 } from "@/lib/odoo-amount";
import { getOdooUid } from "@/lib/odoo";
import {
  odooCallMethod,
  odooCreate,
  odooRead,
  odooSearch,
  odooSearchRead,
  odooWrite,
} from "@/lib/odoo-write";

type VentaFull = Awaited<ReturnType<typeof loadVentaForOdoo>>;

async function loadVentaForOdoo(id_venta: number) {
  return prisma.venta.findUniqueOrThrow({
    where: { id_venta },
    include: {
      cliente: true,
      detalles: { include: { producto: true } },
      pagos: true,
      envios: { include: { direccion: true } },
      direccion_facturacion: true,
      tienda_retiro: true,
      cupon: true,
    },
  });
}

/** Resuelve odoo_id del almacén destino según tipo de entrega. */
export async function resolveWarehouseOdooId(
  tipo_entrega: string,
  id_tienda_retiro: number | null
): Promise<number> {
  if (tipo_entrega === "envio") return getShippingWarehouseOdooId();
  if (!id_tienda_retiro) {
    throw new Error("Falta tienda de retiro");
  }
  const almacen = await prisma.almacen.findFirst({
    where: { id_tienda: id_tienda_retiro, odoo_id: { not: null } },
    select: { odoo_id: true },
  });
  if (!almacen?.odoo_id) {
    throw new Error("La tienda seleccionada no tiene almacén Odoo configurado");
  }
  return almacen.odoo_id;
}

// ─── Provincias AR → state_id Odoo ───────────────────────────────────────────

let cachedArStates: { id: number; name: string }[] | null = null;

async function getArgentinaStates(cfg: OdooConfig): Promise<{ id: number; name: string }[]> {
  if (cachedArStates) return cachedArStates;
  const rows = await odooSearchRead<{ id: number; name: string }>(
    "res.country.state",
    [["country_id", "=", cfg.countryArgentina]],
    ["id", "name"],
    { limit: 50 }
  );
  cachedArStates = rows;
  return rows;
}

function normalizeProvince(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\(.*\)/g, "")
    .trim();
}

async function resolveStateId(provincia: string, cfg: OdooConfig): Promise<number | false> {
  const states = await getArgentinaStates(cfg);
  const norm = normalizeProvince(provincia);
  const found = states.find((st) => {
    const sn = normalizeProvince(st.name);
    return sn === norm || sn.includes(norm) || norm.includes(sn);
  });
  return found?.id ?? false;
}

function buildStreet(d: {
  calle: string;
  numero: string;
  piso?: string | null;
  departamento?: string | null;
}): string {
  let street = `${d.calle} ${d.numero}`.trim();
  const extra = [d.piso, d.departamento].filter(Boolean).join(" ");
  if (extra) street += ` ${extra}`;
  return street;
}

// ─── Partner ─────────────────────────────────────────────────────────────────

type DireccionData = {
  calle: string;
  numero: string;
  piso?: string | null;
  departamento?: string | null;
  barrio?: string | null;
  localidad: string;
  provincia: string;
  pais?: string | null;
  codigo_postal?: string | null;
  referencias?: string | null;
};

function partnerAddressValues(d: DireccionData, cfg: OdooConfig) {
  return {
    street: buildStreet(d),
    street2: d.barrio || false,
    city: d.localidad,
    zip: d.codigo_postal || false,
    country_id: cfg.countryArgentina,
  };
}

function normAddr(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function addressesMatch(
  a: DireccionData | null | undefined,
  b: DireccionData | null | undefined,
): boolean {
  if (!a || !b) return false;
  return (
    normAddr(a.calle) === normAddr(b.calle) &&
    normAddr(a.numero) === normAddr(b.numero) &&
    normAddr(a.piso) === normAddr(b.piso) &&
    normAddr(a.departamento) === normAddr(b.departamento) &&
    normAddr(a.codigo_postal) === normAddr(b.codigo_postal) &&
    normAddr(a.localidad) === normAddr(b.localidad)
  );
}

/**
 * Partner ya facturado (AFIP): campos en hash → Odoo rechaza write.
 * Reutilizar el contacto y seguir con la orden.
 */
function isOdooPartnerLockedError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return /no puede editar|ya est[aá]n en un hash|fields already hashed|cannot modify/i.test(
    msg,
  );
}

/** write de res.partner; si está bloqueado por factura AFIP, no aborta el sync. */
async function writePartnerUnlessLocked(
  ids: number[],
  values: Record<string, unknown>,
): Promise<"ok" | "locked"> {
  try {
    await odooWrite("res.partner", ids, values);
    return "ok";
  } catch (error) {
    if (isOdooPartnerLockedError(error)) return "locked";
    throw error;
  }
}

/**
 * Contacto hijo (invoice/delivery) con la dirección indicada.
 * Si ya existe uno con misma calle+CP, lo reutiliza y actualiza datos.
 */
async function upsertChildAddressContact(
  partnerId: number,
  type: "invoice" | "delivery",
  dir: DireccionData,
  name: string,
  cfg: OdooConfig,
): Promise<number> {
  const street = buildStreet(dir);
  const zip = dir.codigo_postal || "";
  const stateId = await resolveStateId(dir.provincia, cfg);
  const values: Record<string, unknown> = {
    name,
    type,
    parent_id: partnerId,
    ...partnerAddressValues(dir, cfg),
    state_id: stateId,
    comment: dir.referencias || false,
  };

  const existing = await odooSearch("res.partner", [
    ["parent_id", "=", partnerId],
    ["type", "=", type],
    ["street", "=", street],
    ["zip", "=", zip],
  ]);
  if (existing[0]) {
    await writePartnerUnlessLocked([existing[0]], values);
    return existing[0];
  }
  return odooCreate("res.partner", values);
}

/**
 * Normaliza documento AR para Odoo (l10n_ar).
 * DNI: 7–8 dígitos. CUIT/CUIL: 11 dígitos. Si es inválido, no se envía
 * (evita "Longitud invalida para DNI" y permite igual crear la orden).
 */
function resolvePartnerIdentification(
  tipoDocumento: string | null | undefined,
  numeroDocumento: string | null | undefined,
  cfg: OdooConfig,
): {
  vat: string | false;
  docType: number | false;
  companyType: "person" | "company";
} {
  const tipo = (tipoDocumento ?? "").toUpperCase().trim();
  const digits = String(numeroDocumento ?? "").replace(/\D/g, "");
  const isCuit = tipo === "CUIT" || tipo === "CUIL";

  if (isCuit && digits.length === 11) {
    return {
      vat: digits,
      docType: cfg.identificationTypeCuit,
      companyType: tipo === "CUIT" ? "company" : "person",
    };
  }
  if (!isCuit && (digits.length === 7 || digits.length === 8)) {
    return {
      vat: digits,
      docType: cfg.identificationTypeDni,
      companyType: "person",
    };
  }

  return { vat: false, docType: false, companyType: "person" };
}

async function upsertOdooPartner(
  venta: NonNullable<VentaFull>,
  cfg: OdooConfig
): Promise<number> {
  const cliente = venta.cliente;
  const { vat, docType, companyType } = resolvePartnerIdentification(
    cliente.tipo_documento,
    cliente.numero_documento,
    cfg,
  );
  const afipType =
    cliente.responsabilidad_impositiva === "RI"
      ? cfg.afipResponsibilityRi
      : cfg.afipResponsibilityCf;

  let partnerId: number | null = cliente.odoo_partner_id ?? null;

  if (!partnerId && vat && docType) {
    const ids = await odooSearch("res.partner", [
      ["vat", "=", vat],
      ["l10n_latam_identification_type_id", "=", docType],
      ["company_id", "in", [cfg.companyId, false]],
      ["parent_id", "=", false],
    ]);
    if (ids[0]) partnerId = ids[0];
  }

  if (!partnerId && cliente.mail) {
    const ids = await odooSearch("res.partner", [
      ["email", "=ilike", cliente.mail],
      ["parent_id", "=", false],
      ["company_id", "in", [cfg.companyId, false]],
    ]);
    if (ids[0]) partnerId = ids[0];
  }

  // Dirección comercial = facturación (nunca la de envío).
  const factDir = venta.direccion_facturacion;
  const stateId = factDir ? await resolveStateId(factDir.provincia, cfg) : false;

  const baseValues: Record<string, unknown> = {
    name: `${cliente.nombre} ${cliente.apellido}`.trim(),
    email: cliente.mail,
    phone: cliente.telefono || false,
    vat,
    l10n_latam_identification_type_id: docType,
    l10n_ar_afip_responsibility_type_id: afipType,
    lang: "es_AR",
    company_type: companyType,
    customer_rank: 1,
    company_id: false,
    ...(factDir
      ? {
          ...partnerAddressValues(factDir, cfg),
          state_id: stateId,
        }
      : {}),
  };

  if (partnerId) {
    // Actualizar identidad + dirección de facturación si Odoo lo permite.
    // Si el partner ya tiene factura AFIP (campos en hash), reutilizar sin write.
    const patch: Record<string, unknown> = { ...baseValues };
    for (const [k, v] of Object.entries(patch)) {
      if (v === false || v == null) delete patch[k];
    }
    if (Object.keys(patch).length) {
      await writePartnerUnlessLocked([partnerId], patch);
    }
  } else {
    partnerId = await odooCreate("res.partner", baseValues);
  }

  // Un partner Odoo solo puede estar en un cliente local (unique). Si otro
  // registro ya lo tiene (mismo DNI, mail distinto), no pisar: solo stamp en venta.
  const partnerOwner = await prisma.cliente.findFirst({
    where: { odoo_partner_id: partnerId },
    select: { id_cliente: true },
  });
  if (!partnerOwner) {
    await prisma.cliente.update({
      where: { id_cliente: cliente.id_cliente },
      data: { odoo_partner_id: partnerId },
    });
  }

  await prisma.venta.update({
    where: { id_venta: venta.id_venta },
    data: { odoo_partner_id: partnerId },
  });

  return partnerId;
}

async function upsertInvoiceContact(
  venta: NonNullable<VentaFull>,
  partnerId: number,
  cfg: OdooConfig,
): Promise<number> {
  const factDir = venta.direccion_facturacion;
  if (!factDir) return partnerId;

  const name = `${venta.cliente.nombre} ${venta.cliente.apellido}`.trim();
  return upsertChildAddressContact(partnerId, "invoice", factDir, name, cfg);
}

let cachedCompanyPartnerId: number | null = null;

async function getCompanyPartnerId(cfg: OdooConfig): Promise<number> {
  if (cachedCompanyPartnerId) return cachedCompanyPartnerId;
  const [company] = await odooRead<{
    partner_id: [number, string] | false;
  }>("res.company", [cfg.companyId], ["partner_id"]);
  const id = Array.isArray(company?.partner_id) ? company.partner_id[0] : null;
  if (!id) {
    throw new Error("La compañía Odoo no tiene partner_id");
  }
  cachedCompanyPartnerId = id;
  return id;
}

/**
 * Retiro: contacto delivery hijo de Oneclick Argentino SRL
 * (display "Oneclick Argentino SRL, OneClick Córdoba Shopping").
 *
 * No usar `stock.warehouse.partner_id`: ese contacto de almacén tiene
 * `property_stock_customer` = Tránsito entre almacenes y al confirmar
 * el pedido Odoo busca reglas de reabastecimiento en esa ubicación.
 */
async function resolvePickupShippingPartnerId(
  warehouseOdooId: number,
  cfg: OdooConfig
): Promise<number> {
  const companyPartnerId = await getCompanyPartnerId(cfg);
  const [wh] = await odooRead<{
    name: string;
    partner_id: [number, string] | false;
  }>("stock.warehouse", [warehouseOdooId], ["name", "partner_id"]);

  const storeName = Array.isArray(wh?.partner_id) ? wh.partner_id[1] : null;
  if (storeName) {
    const exact = await odooSearch("res.partner", [
      ["parent_id", "=", companyPartnerId],
      ["type", "=", "delivery"],
      ["name", "=", storeName],
    ]);
    if (exact[0]) return exact[0];
  }

  if (wh?.name) {
    const fuzzy = await odooSearch("res.partner", [
      ["parent_id", "=", companyPartnerId],
      ["type", "=", "delivery"],
      ["name", "ilike", wh.name],
    ]);
    if (fuzzy[0]) return fuzzy[0];
  }

  throw new Error(
    `No hay contacto de entrega de compañía para el almacén ${wh?.name ?? warehouseOdooId} (esperado: Oneclick Argentino SRL, OneClick …)`
  );
}

async function upsertDeliveryContact(
  venta: NonNullable<VentaFull>,
  partnerId: number,
  invoicePartnerId: number,
  warehouseOdooId: number,
  cfg: OdooConfig
): Promise<number> {
  // Retiro en tienda: dirección de la sucursal como hijo de la compañía,
  // no el partner del almacén ni el del cliente.
  if (venta.tipo_entrega === "retiro") {
    return resolvePickupShippingPartnerId(warehouseOdooId, cfg);
  }

  if (venta.tipo_entrega !== "envio") return partnerId;

  const envio = venta.envios[0];
  if (!envio?.direccion) return partnerId;

  const deliveryDir = envio.direccion;
  const factDir = venta.direccion_facturacion;

  // Misma dirección que facturación y sin receptor distinto → usar contacto invoice.
  if (addressesMatch(deliveryDir, factDir) && !venta.receptor_nombre) {
    return invoicePartnerId;
  }

  const deliveryName =
    venta.receptor_nombre ||
    `${venta.cliente.nombre} ${venta.cliente.apellido}`.trim();

  return upsertChildAddressContact(
    partnerId,
    "delivery",
    deliveryDir,
    deliveryName,
    cfg,
  );
}

// ─── Sale order ──────────────────────────────────────────────────────────────

/**
 * El tipo de pedido Ecommerce (`sale.order.type`) trae `warehouse_id=Ecommerce`.
 * En Odoo, `sale.order.warehouse_id` depende de `type_id` / partner / company:
 * un create/write puede dejar el almacén del tipo aunque enviemos WH/DOT/sucursal.
 * Las entregas ya generadas no se mueven, pero el pedido queda mal etiquetado.
 * Re-escribimos el almacén destino real después de create/confirm.
 */
async function ensureSaleOrderWarehouse(
  orderId: number,
  warehouseOdooId: number,
): Promise<void> {
  const [row] = await odooRead<{
    warehouse_id: [number, string] | false;
  }>("sale.order", [orderId], ["warehouse_id"]);
  const current = Array.isArray(row?.warehouse_id) ? row.warehouse_id[0] : null;
  if (current === warehouseOdooId) return;
  await odooWrite("sale.order", [orderId], {
    warehouse_id: warehouseOdooId,
  });
}

async function ensureSaleOrderShippingPartner(
  orderId: number,
  shippingPartnerId: number,
): Promise<void> {
  const [row] = await odooRead<{
    partner_shipping_id: [number, string] | false;
  }>("sale.order", [orderId], ["partner_shipping_id"]);
  const current = Array.isArray(row?.partner_shipping_id)
    ? row.partner_shipping_id[0]
    : null;
  if (current === shippingPartnerId) return;
  await odooWrite("sale.order", [orderId], {
    partner_shipping_id: shippingPartnerId,
  });
}

/**
 * Si el partner ya existe con Comercial distinto (ej. vendedor de tienda),
 * Odoo puede copiarlo a la sale.order. Forzamos el UID de la API (ApiSync).
 */
async function ensureSaleOrderSalesperson(
  orderId: number,
  salespersonUid: number,
): Promise<void> {
  const [row] = await odooRead<{
    user_id: [number, string] | false;
  }>("sale.order", [orderId], ["user_id"]);
  const current = Array.isArray(row?.user_id) ? row.user_id[0] : null;
  if (current === salespersonUid) return;
  await odooWrite("sale.order", [orderId], {
    user_id: salespersonUid,
  });
}

/** Comentarios de entrega → `stock.picking.note` (campo Notas de la entrega). */
async function writePickingDeliveryNotes(
  orderId: number,
  comments: string[],
): Promise<void> {
  if (!comments.length) return;
  const [order] = await odooRead<{ picking_ids: number[] }>(
    "sale.order",
    [orderId],
    ["picking_ids"],
  );
  const pickingIds = order?.picking_ids ?? [];
  if (!pickingIds.length) return;
  await odooWrite("stock.picking", pickingIds, {
    note: comments.map((n) => `<p>${n}</p>`).join(""),
  });
}

type OdooTax = { id: number; amount: number };
type OdooProduct = { id: number; taxes_id: number[] };

async function loadOdooProductTaxes(
  odooProductIds: number[]
): Promise<Map<number, OdooProduct>> {
  const map = new Map<number, OdooProduct>();
  if (!odooProductIds.length) return map;

  const rows = await odooRead<{ id: number; taxes_id: number[] }>(
    "product.product",
    odooProductIds,
    ["id", "taxes_id"]
  );
  for (const row of rows) {
    map.set(row.id, { id: row.id, taxes_id: row.taxes_id ?? [] });
  }
  return map;
}

async function loadTaxRates(taxIds: number[]): Promise<Map<number, OdooTax>> {
  const map = new Map<number, OdooTax>();
  if (!taxIds.length) return map;
  const rows = await odooRead<OdooTax>("account.tax", taxIds, ["id", "amount"]);
  for (const row of rows) map.set(row.id, row);
  return map;
}

/**
 * En instancias de prueba a veces hay impuestos duplicados (ej. IVA 21% + 19%).
 * Nos quedamos con un solo IVA AR de venta (21 o 10.5).
 */
function pickSaleTaxes(
  taxIds: number[],
  taxRateMap: Map<number, OdooTax>
): number[] {
  const ar = taxIds.filter((id) => {
    const amount = taxRateMap.get(id)?.amount;
    return amount === 21 || amount === 10.5;
  });
  if (ar.length === 1) return ar;
  if (ar.length > 1) {
    const t21 = ar.find((id) => taxRateMap.get(id)?.amount === 21);
    return [t21 ?? ar[0]];
  }
  if (!taxIds.length) return [];
  return [
    taxIds.reduce((best, id) =>
      (taxRateMap.get(id)?.amount ?? 0) > (taxRateMap.get(best)?.amount ?? 0)
        ? id
        : best
    ),
  ];
}

async function createOdooSaleOrder(
  venta: NonNullable<VentaFull>,
  partnerId: number,
  invoicePartnerId: number,
  shippingPartnerId: number,
  warehouseOdooId: number,
  cfg: OdooConfig
): Promise<{ orderId: number; orderName: string }> {
  const orderName = `${cfg.orderPrefix}-${venta.id_venta}`;

  if (venta.odoo_order_id) {
    const [existing] = await odooRead<{ name: string }>(
      "sale.order",
      [venta.odoo_order_id],
      ["name"]
    );
    return {
      orderId: venta.odoo_order_id,
      orderName: existing?.name ?? venta.odoo_order_name ?? orderName,
    };
  }

  const existingIds = await odooSearch("sale.order", [
    ["name", "=", orderName],
    ["company_id", "=", cfg.companyId],
  ]);
  if (existingIds[0]) {
    const [existing] = await odooRead<{ name: string; state: string }>(
      "sale.order",
      [existingIds[0]],
      ["name", "state"]
    );
    await ensureSaleOrderWarehouse(existingIds[0], warehouseOdooId);
    await ensureSaleOrderShippingPartner(existingIds[0], shippingPartnerId);
    await prisma.venta.update({
      where: { id_venta: venta.id_venta },
      data: {
        odoo_order_id: existingIds[0],
        odoo_order_name: existing?.name ?? orderName,
        odoo_warehouse_id: warehouseOdooId,
      },
    });
    return { orderId: existingIds[0], orderName: existing?.name ?? orderName };
  }

  const odooProductIds = venta.detalles
    .map((d) => d.producto.odoo_id)
    .filter((id): id is number => id != null);

  const productTaxMap = await loadOdooProductTaxes(odooProductIds);
  const allTaxIds = [
    ...new Set([...productTaxMap.values()].flatMap((p) => p.taxes_id)),
  ];
  const taxRateMap = await loadTaxRates(allTaxIds);

  const orderLines: [number, number, Record<string, unknown>][] = [];

  /**
   * Odoo sale.order.line solo tiene `discount` (%), no monto fijo.
   * El cupón se aplica en el precio cobrado (price_unit) y una línea
   * de referencia a $0 con el código (sin impuestos).
   */
  for (const det of venta.detalles) {
    const odooId = det.producto.odoo_id;
    if (!odooId) throw new Error(`Producto sin odoo_id: ${det.nombre_producto}`);

    const gross = Number(det.precio_cobrado ?? det.precio_unitario);
    const isGift = gross <= 0.009;
    // Misma selección de IVA que productos pagos: si tax_id queda en false,
    // Odoo aplica los taxes del producto y puede fallar por IVA duplicado.
    const taxes = pickSaleTaxes(
      productTaxMap.get(odooId)?.taxes_id ?? [],
      taxRateMap
    );
    const taxRate = taxes.reduce(
      (acc, tid) => acc + (taxRateMap.get(tid)?.amount ?? 0) / 100,
      0
    );

    orderLines.push([
      0,
      0,
      {
        product_id: odooId,
        name: isGift
          ? det.nombre_producto.includes("(Regalo)")
            ? det.nombre_producto
            : `${det.nombre_producto} (Regalo)`
          : det.nombre_producto,
        product_uom_qty: Number(det.cantidad),
        price_unit: isGift ? 0 : grossToNet(gross, taxRate),
        discount: 0,
        tax_id: taxes.length ? [[6, 0, taxes]] : false,
      },
    ]);
  }

  const costoEnvio = Number(venta.costo_envio);
  if (venta.tipo_entrega === "envio" && costoEnvio > 0) {
    orderLines.push([
      0,
      0,
      {
        product_id: cfg.shippingProductId,
        name: "Envío a Domicilio",
        product_uom_qty: 1,
        price_unit: grossToNet(costoEnvio, 0.21),
        discount: 0,
        tax_id: [[6, 0, [116]]],
      },
    ]);
  }

  /**
   * En Odoo `sale.order.note` = "Términos y condiciones" (no es comentario).
   * Comentarios operativos (retiro / receptor / referencias) van a:
   * - `internal_notes` (Notas internas del pedido)
   * - `stock.picking.note` (Notas/comentario de la entrega), post-confirm
   * Igual que pedidos legacy OCW.
   */
  const deliveryComments: string[] = [];
  if (venta.tipo_entrega === "retiro" && venta.tienda_retiro) {
    deliveryComments.push(
      `Retiro en tienda: ${venta.tienda_retiro.nombre} — ${venta.tienda_retiro.direccion}`
    );
  }
  if (venta.receptor_nombre) {
    deliveryComments.push(
      `Retira/recibe: ${venta.receptor_nombre}${venta.receptor_dni ? ` (DNI ${venta.receptor_dni})` : ""}`
    );
  }
  const envioRefs = venta.envios[0]?.direccion?.referencias?.trim();
  if (envioRefs) {
    deliveryComments.push(envioRefs);
  }

  const internalNotes: string[] = [...deliveryComments];
  if (venta.cupon && Number(venta.cupon.monto) > 0.009) {
    const monto = Number(venta.cupon.monto).toLocaleString("es-AR", {
      minimumFractionDigits: 2,
    });
    internalNotes.push(`Cupón web ${venta.cupon.codigo}: −$${monto}`);
  }

  // Comercial = ApiSync (ODOO_UID), no el vendedor del partner existente.
  const salespersonUid = await getOdooUid();

  const orderId = await odooCreate("sale.order", {
    name: orderName,
    partner_id: partnerId,
    partner_invoice_id: invoicePartnerId,
    partner_shipping_id: shippingPartnerId,
    user_id: salespersonUid,
    type_id: cfg.saleOrderTypeId,
    team_id: cfg.saleTeamId,
    company_id: cfg.companyId,
    warehouse_id: warehouseOdooId,
    pricelist_id: cfg.pricelistId,
    currency_id: cfg.currencyId,
    payment_term_id: cfg.paymentTermId,
    fiscal_position_id: cfg.fiscalPositionId,
    picking_policy: "direct",
    client_order_ref: orderName,
    date_order: venta.fecha_hora.toISOString().slice(0, 19).replace("T", " "),
    order_line: orderLines,
    // No tocar `note`: es términos/condiciones; Odoo puede copiarlo a picking.observations.
    internal_notes: internalNotes.length
      ? internalNotes.map((n) => `<p>${n}</p>`).join("")
      : false,
  });

  // El tipo Ecommerce puede pisar warehouse_id al crear; lo reafirmamos ya.
  await ensureSaleOrderWarehouse(orderId, warehouseOdooId);
  await ensureSaleOrderShippingPartner(orderId, shippingPartnerId);
  await ensureSaleOrderSalesperson(orderId, salespersonUid);

  // La pricelist de Odoo puede aplicar descuentos promocionales; forzamos
  // price_unit + discount=0 (el cupón web ya está en el precio cobrado).
  const intendedByProduct = new Map<
    number,
    { price_unit: number; discount: number }
  >();
  for (const [, , vals] of orderLines) {
    const productId = Number(vals.product_id);
    const priceUnit = Number(vals.price_unit);
    if (productId && Number.isFinite(priceUnit)) {
      intendedByProduct.set(productId, {
        price_unit: priceUnit,
        discount: Number(vals.discount ?? 0),
      });
    }
  }

  let [created] = await odooRead<{
    amount_total: number;
    order_line: number[];
    name: string;
    state: string;
  }>("sale.order", [orderId], ["amount_total", "order_line", "name", "state"]);

  if (created?.order_line?.length) {
    const lines = await odooRead<{
      id: number;
      product_id: [number, string] | false;
      price_unit: number;
      discount: number;
    }>("sale.order.line", created.order_line, [
      "id",
      "product_id",
      "price_unit",
      "discount",
    ]);
    for (const ln of lines) {
      const productId = Array.isArray(ln.product_id) ? ln.product_id[0] : null;
      if (!productId) continue;
      const intended = intendedByProduct.get(productId);
      if (intended == null) continue;
      if (
        Math.abs(Number(ln.discount) - intended.discount) > 0.01 ||
        Math.abs(Number(ln.price_unit) - intended.price_unit) > 0.01
      ) {
        await odooWrite("sale.order.line", [ln.id], {
          discount: intended.discount,
          price_unit: intended.price_unit,
        });
      }
    }
    [created] = await odooRead<{
      amount_total: number;
      order_line: number[];
      name: string;
      state: string;
    }>("sale.order", [orderId], ["amount_total", "order_line", "name", "state"]);
  }

  const targetTotal = Number(venta.total);
  const odooTotal = Number(created?.amount_total ?? 0);
  const diff = round2(targetTotal - odooTotal);

  // El total cobrado en MP ya se alinea en checkout al redondeo Odoo
  // (alignGrossesToOdooTotal). No ajustar price_unit neto acá: sumar el
  // diff bruto al neto empeora el desvío (p.ej. OCWN-42: 83→85).
  if (Math.abs(diff) > 1) {
    throw new Error(
      `Total Odoo (${odooTotal}) no coincide con venta (${targetTotal}), diff=${diff}`
    );
  }

  if (created?.state === "draft") {
    await odooCallMethod("sale.order", "action_confirm", [orderId]);
  }

  // Por si confirm / writes disparan el recompute desde type_id.
  await ensureSaleOrderWarehouse(orderId, warehouseOdooId);
  await ensureSaleOrderShippingPartner(orderId, shippingPartnerId);
  await ensureSaleOrderSalesperson(orderId, salespersonUid);
  await writePickingDeliveryNotes(orderId, deliveryComments);

  const finalName = created?.name ?? orderName;
  await prisma.venta.update({
    where: { id_venta: venta.id_venta },
    data: {
      odoo_order_id: orderId,
      odoo_order_name: finalName,
      odoo_warehouse_id: warehouseOdooId,
    },
  });

  return { orderId, orderName: finalName };
}

// ─── Receipt ─────────────────────────────────────────────────────────────────

async function createOdooReceipt(
  venta: NonNullable<VentaFull>,
  partnerId: number,
  mpPaymentId: string,
  cfg: OdooConfig
): Promise<{ paymentId: number; paymentName: string }> {
  if (venta.odoo_payment_id) {
    const [existing] = await odooRead<{ name: string }>(
      "account.payment",
      [venta.odoo_payment_id],
      ["name"]
    );
    return {
      paymentId: venta.odoo_payment_id,
      paymentName: existing?.name ?? venta.odoo_payment_name ?? "",
    };
  }

  const existingIds = await odooSearch("account.payment", [
    ["memo", "=", mpPaymentId],
    ["partner_id", "=", partnerId],
    ["company_id", "=", cfg.companyId],
  ]);
  if (existingIds[0]) {
    const [existing] = await odooRead<{ name: string; state: string }>(
      "account.payment",
      [existingIds[0]],
      ["name", "state"]
    );
    await prisma.venta.update({
      where: { id_venta: venta.id_venta },
      data: {
        odoo_payment_id: existingIds[0],
        odoo_payment_name: existing?.name ?? null,
      },
    });
    return {
      paymentId: existingIds[0],
      paymentName: existing?.name ?? "",
    };
  }

  const pago = venta.pagos.find(
    (p) => p.tipo_pago === "mercado_pago" || p.tipo_pago === "tarjeta"
  );
  const paymentDate = new Date().toISOString().slice(0, 10);

  const paymentId = await odooCreate("account.payment", {
    payment_type: "inbound",
    partner_type: "customer",
    partner_id: partnerId,
    amount: Number(venta.total),
    date: paymentDate,
    journal_id: cfg.paymentJournalId,
    payment_method_line_id: cfg.paymentMethodLineId,
    receiptbook_id: cfg.receiptbookId,
    currency_id: cfg.currencyId,
    memo: mpPaymentId,
    company_id: cfg.companyId,
  });

  if (cfg.createInvoice && venta.odoo_order_id) {
    try {
      await odooCallMethod("sale.order", "_create_invoices", [venta.odoo_order_id]);
      const invoiceIds = await odooSearch("account.move", [
        ["invoice_origin", "=", venta.odoo_order_name ?? ""],
        ["move_type", "=", "out_invoice"],
      ]);
      if (invoiceIds[0]) {
        const inv = await odooRead<{ state: string; line_ids: number[] }>(
          "account.move",
          [invoiceIds[0]],
          ["state", "line_ids"]
        );
        if (inv[0]?.state === "draft") {
          await odooCallMethod("account.move", "action_post", [invoiceIds[0]]);
        }
        const moveLines = await odooRead<{
          id: number;
          account_type: string;
          reconciled: boolean;
        }>("account.move.line", inv[0]?.line_ids ?? [], [
          "account_type",
          "reconciled",
        ]);
        const receivableLines = moveLines
          .filter((l) => l.account_type === "asset_receivable" && !l.reconciled)
          .map((l) => l.id);
        if (receivableLines.length) {
          await odooWrite("account.payment", [paymentId], {
            to_pay_move_line_ids: [[6, 0, receivableLines]],
          });
        }
      }
    } catch {
      // factura automática en Odoo; no bloquear el recibo
    }
  }

  const [beforePost] = await odooRead<{ state: string }>(
    "account.payment",
    [paymentId],
    ["state"]
  );
  if (beforePost?.state === "draft") {
    await odooCallMethod("account.payment", "action_post", [paymentId]);
  }

  const [posted] = await odooRead<{ name: string }>(
    "account.payment",
    [paymentId],
    ["name"]
  );

  await prisma.venta.update({
    where: { id_venta: venta.id_venta },
    data: {
      odoo_payment_id: paymentId,
      odoo_payment_name: posted?.name ?? null,
    },
  });

  return { paymentId, paymentName: posted?.name ?? "" };
}

// ─── Orquestador ─────────────────────────────────────────────────────────────

export type OdooSyncResult = "ok" | "skipped" | "disabled" | "error";

export async function syncVentaToOdoo(id_venta: number): Promise<OdooSyncResult> {
  if (!(await isOdooSyncEnabled())) return "disabled";

  const cfg = await getOdooConfig();

  const claimed = await prisma.venta.updateMany({
    where: {
      id_venta,
      estado: "pagada",
      odoo_sync_estado: { in: ["pendiente", "error"] },
    },
    data: {
      odoo_sync_estado: "en_proceso",
      odoo_sync_intentos: { increment: 1 },
    },
  });
  if (claimed.count === 0) return "skipped";

  try {
    const venta = await loadVentaForOdoo(id_venta);
    const warehouseOdooId =
      venta.odoo_warehouse_id ??
      (await resolveWarehouseOdooId(
        venta.tipo_entrega,
        venta.id_tienda_retiro
      ));

    if (!venta.odoo_warehouse_id) {
      await prisma.venta.update({
        where: { id_venta },
        data: { odoo_warehouse_id: warehouseOdooId },
      });
    }

    const stockItems = venta.detalles
      .filter((d) => d.producto.odoo_id)
      .map((d) => ({
        odooProductId: d.producto.odoo_id!,
        cantidad: Number(d.cantidad),
        titulo: d.nombre_producto,
      }));

    const shortages = await checkStockOdooWarehouse(stockItems, warehouseOdooId);
    if (shortages.length) {
      throw new Error(formatStockShortageMessage(shortages));
    }

    const partnerId = await upsertOdooPartner(venta, cfg);
    const invoicePartnerId = await upsertInvoiceContact(venta, partnerId, cfg);
    const shippingPartnerId = await upsertDeliveryContact(
      venta,
      partnerId,
      invoicePartnerId,
      warehouseOdooId,
      cfg,
    );
    await createOdooSaleOrder(
      venta,
      partnerId,
      invoicePartnerId,
      shippingPartnerId,
      warehouseOdooId,
      cfg
    );

    const mpIds = venta.pagos
      .filter(
        (p) =>
          (p.tipo_pago === "mercado_pago" || p.tipo_pago === "tarjeta") &&
          p.estado === "aprobado" &&
          p.transaction_id,
      )
      .map((p) => p.transaction_id as string);
    if (mpIds.length === 0) {
      throw new Error("Pago aprobado sin transaction_id de Mercado Pago");
    }
    // Una o más tarjetas: todos los payment id van en el memo del recibo.
    await createOdooReceipt(venta, partnerId, mpIds.join(","), cfg);

    await prisma.venta.update({
      where: { id_venta },
      data: {
        odoo_sync_estado: "ok",
        odoo_sync_error: null,
        odoo_sync_at: new Date(),
      },
    });
    return "ok";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.venta.update({
      where: { id_venta },
      data: {
        odoo_sync_estado: "error",
        odoo_sync_error: message.slice(0, 4000),
      },
    });
    return "error";
  }
}

export { loadVentaForOdoo };
