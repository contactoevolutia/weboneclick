import { cookies } from "next/headers";
import { Prisma } from "@prisma/client";
import { shopCookieOptions } from "@/lib/cookie-options";
import { prisma } from "@/lib/prisma";
import { pickCurrentPriceInfo, precioEfectivo, resolveStockAvailability } from "@/lib/products";
import {
  ALMACEN_WEB_SELECT,
  getShippingWarehouseOdooId,
  getStoreWarehouseOdooIds,
  stockByWarehouseOdooId,
  type StockRow,
} from "@/lib/almacenes";

export const CART_COOKIE = "cart";
export const CART_MAX_AGE = 60 * 60 * 24 * 14; // 14 días

export type CartLine = {
  id_producto: number;
  cantidad: number;
};

export type ResolvedCartItem = {
  id_producto: number;
  titulo: string;
  slug: string | null;
  cantidad: number;
  /** Precio de venta (con descuento pricelist si aplica). */
  precio: number | null;
  /** Precio de lista original; distinto de `precio` solo si hay promo. */
  precioLista: number | null;
  /** % descuento pricelist; null si no aplica. */
  porcentajeDesc: number | null;
  /** Tope comercial de cuotas sin interés (Odoo x_studio_installments). */
  cuotas_max: number | null;
  /** Alícuota IVA (0.105 | 0.21): la real de Odoo si el sync la trajo, si no estimada */
  ivaRate: number;
  stockTotal: number;
  stockTracked: boolean;
  /** Stock por odoo_id de almacén vendible */
  stockPorAlmacen: Map<number, number>;
  imagen: string | null;
  subtotal: number | null;
  disponible: boolean;
};

/** Default comercial cuando el producto no tiene tope cargado (paridad PDP). */
export const DEFAULT_CUOTAS_MAX = 12;

/** Mercado Pago acepta 1–36 en `payment_methods.installments`. */
export function clampMpInstallments(n: number): number {
  const v = Math.floor(n);
  if (!Number.isFinite(v) || v < 1) return 1;
  return Math.min(36, v);
}

/**
 * Tope comercial a partir de `cuotas_max` de productos.
 * Sin valores, o con null/0, usa DEFAULT_CUOTAS_MAX.
 */
export function maxInstallmentsFromCuotas(
  cuotas: Array<number | null | undefined>,
): number {
  if (cuotas.length === 0) return DEFAULT_CUOTAS_MAX;
  return Math.min(
    ...cuotas.map((c) => (c != null && c > 0 ? c : DEFAULT_CUOTAS_MAX)),
  );
}

/**
 * Máximo de cuotas del carrito: el menor `cuotas_max` entre ítems disponibles
 * (carrito mixto no puede superar el producto más restrictivo).
 */
export function cartMaxInstallments(items: ResolvedCartItem[]): number {
  return maxInstallmentsFromCuotas(
    items.filter((i) => i.disponible).map((i) => i.cuotas_max),
  );
}

/** Fallback si falta el parámetro valor_para_envio_gratis. */
export const FREE_SHIPPING_THRESHOLD = 200_000;

/**
 * Alícuota IVA aproximada según tipo de producto (paridad visual WooCommerce).
 * Fallback: preferir `producto.iva_rate` (la real de Odoo) vía `productIvaRate`.
 */
export function estimateIvaRate(titulo: string): number {
  const t = titulo.toLowerCase();
  if (/\b(macbook|imac|mac mini|mac studio|mac pro|ipad|apple watch|watch series)\b/.test(t)) {
    return 0.105;
  }
  return 0.21;
}

/**
 * Alícuota IVA del producto. Usa la sincronizada desde Odoo; si falta (producto
 * viejo o sin impuesto AR), cae a la heurística por título.
 *
 * Importa que sea la real: el checkout alinea los brutos al redondeo de Odoo
 * con esta alícuota, y si no coincide con la del producto en Odoo el total de
 * la orden queda unos centavos arriba de lo cobrado en Mercado Pago.
 */
export function productIvaRate(product: {
  titulo: string;
  iva_rate?: Prisma.Decimal | number | null;
}): number {
  const rate = product.iva_rate != null ? Number(product.iva_rate) : null;
  if (rate != null && rate > 0) return rate;
  return estimateIvaRate(product.titulo);
}

/** IVA incluido en un precio bruto. */
export function ivaIncluded(gross: number, rate: number): number {
  return Math.round(((gross * rate) / (1 + rate)) * 100) / 100;
}

export type ResolvedCart = {
  lines: CartLine[];
  items: ResolvedCartItem[];
  itemCount: number;
  subtotal: number;
  canCheckout: boolean;
};

function parseCart(raw: string | undefined): CartLine[] {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return [];
    const map = new Map<number, number>();
    for (const row of data) {
      if (!row || typeof row !== "object") continue;
      const id = Number((row as CartLine).id_producto);
      const qty = Number((row as CartLine).cantidad);
      if (!Number.isInteger(id) || id <= 0) continue;
      if (!Number.isFinite(qty) || qty <= 0) continue;
      map.set(id, Math.min(999, Math.floor(qty)));
    }
    return [...map.entries()].map(([id_producto, cantidad]) => ({ id_producto, cantidad }));
  } catch {
    return [];
  }
}

export async function readCartLines(): Promise<CartLine[]> {
  const jar = await cookies();
  return parseCart(jar.get(CART_COOKIE)?.value);
}

export async function writeCartLines(lines: CartLine[]): Promise<void> {
  const jar = await cookies();
  const cleaned = lines.filter((l) => l.cantidad > 0);
  if (cleaned.length === 0) {
    jar.delete(CART_COOKIE);
    return;
  }
  jar.set(CART_COOKIE, JSON.stringify(cleaned), shopCookieOptions(CART_MAX_AGE));
}

export async function clearCartCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(CART_COOKIE);
}

export async function getCartItemCount(): Promise<number> {
  const lines = await readCartLines();
  return lines.reduce((acc, l) => acc + l.cantidad, 0);
}

export async function resolveCart(lines?: CartLine[]): Promise<ResolvedCart> {
  const cartLines = lines ?? (await readCartLines());
  if (cartLines.length === 0) {
    return { lines: [], items: [], itemCount: 0, subtotal: 0, canCheckout: false };
  }

  const products = await prisma.producto.findMany({
    where: {
      id_producto: { in: cartLines.map((l) => l.id_producto) },
      activo: true,
    },
    include: {
      precios: true,
      stocks: { include: { almacen: { select: ALMACEN_WEB_SELECT } } },
      archivos: {
        where: { archivo: { tipo: "imagen_principal" } },
        include: { archivo: true },
        take: 1,
      },
    },
  });

  const byId = new Map(products.map((p) => [p.id_producto, p]));
  const items: ResolvedCartItem[] = [];
  let subtotal = 0;
  let canCheckout = cartLines.length > 0;

  for (const line of cartLines) {
    const product = byId.get(line.id_producto);
    if (!product) {
      items.push({
        id_producto: line.id_producto,
        titulo: `Producto #${line.id_producto}`,
        slug: null,
        cantidad: line.cantidad,
        precio: null,
        precioLista: null,
        porcentajeDesc: null,
        cuotas_max: null,
        ivaRate: 0.21,
        stockTotal: 0,
        stockTracked: false,
        stockPorAlmacen: new Map(),
        imagen: null,
        subtotal: null,
        disponible: false,
      });
      canCheckout = false;
      continue;
    }

    const priceInfo = pickCurrentPriceInfo(product.precios);
    const precio = precioEfectivo(priceInfo.precio, priceInfo.precio_con_desc);
    const precioLista = priceInfo.precio;
    const porcentajeDesc =
      priceInfo.precio_con_desc != null && priceInfo.porcentaje_desc != null
        ? priceInfo.porcentaje_desc
        : null;
    const stock = resolveStockAvailability(product.stocks as StockRow[]);
    const stockPorAlmacen = stockByWarehouseOdooId(product.stocks as StockRow[]);
    const disponible =
      precio != null &&
      stock.inStock &&
      line.cantidad > 0 &&
      (!stock.stockTracked || line.cantidad <= stock.stockTotal);
    const lineSubtotal = precio != null ? precio * line.cantidad : null;
    if (lineSubtotal != null && disponible) subtotal += lineSubtotal;
    if (!disponible) canCheckout = false;

    items.push({
      id_producto: product.id_producto,
      titulo: product.titulo,
      slug: product.slug,
      cantidad: line.cantidad,
      precio,
      precioLista,
      porcentajeDesc,
      cuotas_max: product.cuotas_max,
      ivaRate: productIvaRate(product),
      stockTotal: stock.stockTotal,
      stockTracked: stock.stockTracked,
      stockPorAlmacen,
      imagen: product.archivos[0]?.archivo.link ?? null,
      subtotal: lineSubtotal,
      disponible,
    });
  }

  return {
    lines: cartLines,
    items,
    itemCount: cartLines.reduce((acc, l) => acc + l.cantidad, 0),
    subtotal,
    canCheckout,
  };
}

/** Descuenta stock del almacén destino (por odoo_id). */
export async function deductStock(
  tx: Prisma.TransactionClient,
  id_producto: number,
  cantidad: number,
  warehouseOdooId: number
) {
  const almacen = await tx.almacen.findFirst({
    where: { odoo_id: warehouseOdooId },
    select: { id_almacen: true },
  });
  if (!almacen) {
    throw new Error(`Almacén Odoo ${warehouseOdooId} no encontrado localmente`);
  }

  const row = await tx.stock.findUnique({
    where: {
      id_producto_id_almacen: {
        id_producto,
        id_almacen: almacen.id_almacen,
      },
    },
  });

  const available = row ? Number(row.cantidad) : 0;
  if (available < cantidad) {
    throw new Error(`Stock insuficiente para el producto ${id_producto}`);
  }

  await tx.stock.update({
    where: {
      id_producto_id_almacen: {
        id_producto,
        id_almacen: almacen.id_almacen,
      },
    },
    data: { cantidad: available - cantidad },
  });
}

/** Verifica si todos los ítems del carrito tienen stock en un almacén (odoo_id). */
export function cartHasStockInWarehouse(
  items: ResolvedCartItem[],
  warehouseOdooId: number
): boolean {
  return items.every((item) => {
    if (!item.disponible && item.precio == null) return false;
    const qty = item.stockPorAlmacen.get(warehouseOdooId) ?? 0;
    return qty >= item.cantidad;
  });
}

/** Disponibilidad de envío a domicilio y retiro en tienda según stock por almacén. */
export async function resolveCheckoutEntregaDisponibilidad(
  items: ResolvedCartItem[]
): Promise<{ envioDisponible: boolean; retiroDisponible: boolean }> {
  let envioDisponible = false;
  try {
    const shippingWh = await getShippingWarehouseOdooId();
    envioDisponible = cartHasStockInWarehouse(items, shippingWh);
  } catch {
    envioDisponible = false;
  }

  const storeWhIds = await getStoreWarehouseOdooIds();
  const retiroDisponible = storeWhIds.some((id) =>
    cartHasStockInWarehouse(items, id)
  );

  return { envioDisponible, retiroDisponible };
}
