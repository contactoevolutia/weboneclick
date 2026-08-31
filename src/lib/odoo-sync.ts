import { createHash } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeProductHtml } from "@/lib/normalize-product-html";
import {
  executeKw,
  getOdooReadContext,
  m2oId,
  readGroup,
  searchCount,
  searchRead,
  type OdooMany2One,
} from "@/lib/odoo";
import { getOdooConfig } from "@/lib/odoo-config";
import { TIPO_RELACION_ACCESORIO } from "@/lib/productos-relacionados";
import { slugify } from "@/lib/slug";
import { withCronLock } from "@/lib/cron-lock";
import type {
  SyncBatchResult,
  SyncProductoBySkuResult,
  SyncStats,
  SyncType,
} from "@/lib/odoo-sync-types";

export type {
  SyncBatchResult,
  SyncProductoBySkuResult,
  SyncStats,
  SyncType,
} from "@/lib/odoo-sync-types";

const PAGE = 200;
const STOCK_CHUNK = 80;
const IMAGE_CHUNK = 5;

const PRODUCT_DOMAIN: unknown[] = [["x_studio_publicado_web", "=", true]];
const PRODUCT_FIELDS = [
  "id",
  "name",
  "display_name",
  "default_code",
  "list_price",
  "taxed_lst_price",
  "taxes_id",
  "x_studio_installments",
  "description_sale",
  "description_ecommerce",
  "website_description",
  "categ_id",
  "product_tmpl_id",
  "product_brand_id",
  "product_tag_ids",
  "x_studio_publicado_web",
];

/** Mapeo odoo warehouse id → slug de tienda (solo para sync de almacenes). */
const TIENDA_SLUG_BY_WAREHOUSE_ODOO_ID: Record<number, string> = {
  1: "alto-rosario",
  7: "rosario-centro",
  8: "palermo",
  9: "dot-baires",
  10: "cordoba-shopping",
  11: "el-solar",
};

type OdooCategory = {
  id: number;
  name: string;
  parent_id: OdooMany2One;
  complete_name?: string;
};

type OdooWarehouse = {
  id: number;
  name: string;
  code: string;
};

type OdooBrand = {
  id: number;
  name: string;
};

type OdooTag = {
  id: number;
  name: string;
};

type OdooProduct = {
  id: number;
  name: string;
  display_name: string;
  default_code: string | false;
  list_price: number;
  /** Precio de venta con impuestos incluidos (campo Odoo `taxed_lst_price`). */
  taxed_lst_price?: number;
  /** Impuestos de venta del producto; de acá sale la alícuota IVA real. */
  taxes_id?: number[];
  /** Límite de cuotas (Studio: "Límite de Cuotas"). Selection string p.ej. "12"|"18"|"24". */
  x_studio_installments?: string | false;
  description_sale: string | false;
  /** UI es_AR: "Descripción para comercio electrónico" */
  description_ecommerce?: string | false;
  /** UI es_AR: "Descripción para el sitio web" — HTML largo del PDP */
  website_description?: string | false;
  categ_id: OdooMany2One;
  product_tmpl_id: OdooMany2One;
  product_brand_id?: OdooMany2One;
  product_tag_ids?: number[];
  image_1920?: string | false;
  x_studio_publicado_web?: boolean;
  qty_available?: number;
  product_template_image_ids?: number[];
};

type OdooCompanyPrice = {
  id: number;
  product_tmpl_id: OdooMany2One;
  company_id: OdooMany2One;
  price: number;
};

/** Regla de descuento de product.pricelist.item (Promociones Vigentes). */
type OdooPricelistItem = {
  id: number;
  product_id: OdooMany2One;
  product_tmpl_id: OdooMany2One;
  compute_price: string;
  percent_price: number;
  fixed_price: number;
  min_quantity: number;
  date_start: string | false;
  date_end: string | false;
};

type PromoRule = {
  percent: number | null;
  fixed: number | null;
};

type PromoMaps = {
  byProductId: Map<number, PromoRule>;
  byTmplId: Map<number, PromoRule>;
};

type ResolvedPromo = {
  porcentaje_desc: number | null;
  precio_con_desc: number | null;
};

function emptyStats(dryRun: boolean): SyncStats {
  return {
    categorias: { created: 0, updated: 0 },
    almacenes: { created: 0, updated: 0 },
    marcas: { created: 0, updated: 0 },
    etiquetas: { created: 0, updated: 0 },
    productos: { created: 0, updated: 0, deactivated: 0, images: 0 },
    precios: { inserted: 0 },
    stock: { upserted: 0 },
    relaciones: { updated: 0 },
    errors: [],
    dryRun,
  };
}

async function ensureUniqueSlug(
  base: string,
  exists: (slug: string) => Promise<boolean>,
  suffix?: string | number
): Promise<string> {
  let candidate = slugify(base) || `item-${suffix ?? Date.now()}`;
  if (!(await exists(candidate))) return candidate;
  const withSuffix = `${candidate}-${suffix ?? "x"}`;
  if (!(await exists(withSuffix))) return withSuffix;
  let i = 2;
  while (await exists(`${withSuffix}-${i}`)) i += 1;
  return `${withSuffix}-${i}`;
}

/** HTML de descripción eCommerce desde Odoo → `producto.descripcion`. */
function pickEcommerceDescription(row: OdooProduct, fallbackTitle: string): string {
  const candidates = [row.description_ecommerce, row.website_description, row.description_sale];
  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) return normalizeProductHtml(value);
  }
  return fallbackTitle;
}

/** Título de producto sin SKU (`name` de Odoo; no `display_name`). */
function pickProductTitle(row: {
  id: number;
  name?: string | false;
  display_name?: string | false;
}): string {
  const raw =
    (typeof row.name === "string" && row.name.trim()) ||
    (typeof row.display_name === "string" && row.display_name.trim()) ||
    "";
  // Por si algún registro trae el prefijo [SKU] en name
  const withoutSku = raw.replace(/^\[[^\]]+\]\s*/, "").trim();
  return withoutSku || `Producto ${row.id}`;
}

/** Límite de cuotas desde selection Odoo `x_studio_installments` ("12", "18", …). */
function pickCuotasMax(row: { x_studio_installments?: string | false }): number | null {
  const raw = row.x_studio_installments;
  if (typeof raw !== "string" || !raw.trim()) return null;
  const n = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function paginateAll<T extends Record<string, unknown>>(
  model: string,
  domain: unknown[],
  fields: string[],
  order = "id asc"
): Promise<T[]> {
  const total = await searchCount(model, domain);
  const rows: T[] = [];
  for (let offset = 0; offset < total; offset += PAGE) {
    const page = await searchRead<T>(model, domain, fields, { limit: PAGE, offset, order });
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return rows;
}

export async function syncCategorias(stats: SyncStats) {
  const rows = await paginateAll<OdooCategory>(
    "product.category",
    [],
    ["id", "name", "parent_id", "complete_name"]
  );

  // Parents first by sorting: those without parent, then children
  const byId = new Map(rows.map((r) => [r.id, r]));
  const depth = (id: number, seen = new Set<number>()): number => {
    if (seen.has(id)) return 0;
    seen.add(id);
    const parent = m2oId(byId.get(id)?.parent_id);
    return parent ? 1 + depth(parent, seen) : 1;
  };
  rows.sort((a, b) => depth(a.id) - depth(b.id));

  const odooToLocal = new Map<number, number>();
  for (const row of rows) {
    try {
      const existing = await prisma.categoria.findUnique({ where: { odoo_id: row.id } });
      const parentOdoo = m2oId(row.parent_id);
      const parentLocal = parentOdoo ? odooToLocal.get(parentOdoo) ?? null : null;
      // resolve parent from DB if already synced
      let id_cat_superior = parentLocal;
      if (parentOdoo && !id_cat_superior) {
        const p = await prisma.categoria.findUnique({ where: { odoo_id: parentOdoo } });
        id_cat_superior = p?.id_categoria ?? null;
      }
      const nivel = id_cat_superior
        ? ((await prisma.categoria.findUnique({ where: { id_categoria: id_cat_superior } }))
            ?.nivel ?? 0) + 1
        : 1;

      if (stats.dryRun) {
        if (existing) stats.categorias.updated += 1;
        else stats.categorias.created += 1;
        odooToLocal.set(row.id, existing?.id_categoria ?? row.id);
        continue;
      }

      if (existing) {
        await prisma.categoria.update({
          where: { id_categoria: existing.id_categoria },
          data: { nombre: row.name, nivel, id_cat_superior },
        });
        stats.categorias.updated += 1;
        odooToLocal.set(row.id, existing.id_categoria);
      } else {
        const slug = await ensureUniqueSlug(row.name, async (s) =>
          Boolean(await prisma.categoria.findUnique({ where: { slug: s } }))
        , row.id);
        const created = await prisma.categoria.create({
          data: {
            nombre: row.name,
            slug,
            nivel,
            id_cat_superior,
            odoo_id: row.id,
          },
        });
        stats.categorias.created += 1;
        odooToLocal.set(row.id, created.id_categoria);
      }
    } catch (e) {
      stats.errors.push(`categoria ${row.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return odooToLocal;
}

export async function syncAlmacenes(stats: SyncStats) {
  const rows = await paginateAll<OdooWarehouse>("stock.warehouse", [], ["id", "name", "code"]);

  const tiendaSlugs = [...new Set(Object.values(TIENDA_SLUG_BY_WAREHOUSE_ODOO_ID))];
  const tiendas = await prisma.tienda.findMany({
    where: { slug: { in: tiendaSlugs } },
    select: { id_tienda: true, slug: true },
  });
  const tiendaBySlug = new Map(tiendas.map((t) => [t.slug, t.id_tienda]));

  for (const row of rows) {
    try {
      const existing = await prisma.almacen.findUnique({ where: { odoo_id: row.id } });
      const descripcion = row.code ? `${row.name} (${row.code})` : row.name;
      const tiendaSlug = TIENDA_SLUG_BY_WAREHOUSE_ODOO_ID[row.id];
      const id_tienda = tiendaSlug ? tiendaBySlug.get(tiendaSlug) ?? null : null;
      const es_envio_domicilio = row.code === "WH";

      if (stats.dryRun) {
        if (existing) stats.almacenes.updated += 1;
        else stats.almacenes.created += 1;
        continue;
      }
      if (existing) {
        await prisma.almacen.update({
          where: { id_almacen: existing.id_almacen },
          data: { descripcion, id_tienda, es_envio_domicilio },
        });
        stats.almacenes.updated += 1;
      } else {
        await prisma.almacen.create({
          data: { descripcion, odoo_id: row.id, id_tienda, es_envio_domicilio },
        });
        stats.almacenes.created += 1;
      }
    } catch (e) {
      stats.errors.push(`almacen ${row.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

export async function syncMarcas(stats: SyncStats) {
  const rows = await paginateAll<OdooBrand>("product.brand", [], ["id", "name"]);
  for (const row of rows) {
    try {
      const existing = await prisma.marca.findUnique({ where: { odoo_id: row.id } });
      if (stats.dryRun) {
        if (existing) stats.marcas.updated += 1;
        else stats.marcas.created += 1;
        continue;
      }
      if (existing) {
        await prisma.marca.update({
          where: { id_marca: existing.id_marca },
          data: { nombre: row.name },
        });
        stats.marcas.updated += 1;
      } else {
        const slug = await ensureUniqueSlug(row.name, async (s) =>
          Boolean(await prisma.marca.findUnique({ where: { slug: s } }))
        , row.id);
        await prisma.marca.create({
          data: { nombre: row.name, slug, odoo_id: row.id },
        });
        stats.marcas.created += 1;
      }
    } catch (e) {
      stats.errors.push(`marca ${row.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

export async function syncEtiquetas(stats: SyncStats) {
  const rows = await paginateAll<OdooTag>("product.tag", [], ["id", "name"]);
  for (const row of rows) {
    try {
      const existing = await prisma.etiqueta.findUnique({ where: { odoo_id: row.id } });
      if (stats.dryRun) {
        if (existing) stats.etiquetas.updated += 1;
        else stats.etiquetas.created += 1;
        continue;
      }
      if (existing) {
        await prisma.etiqueta.update({
          where: { id_etiqueta: existing.id_etiqueta },
          data: { nombre: row.name },
        });
        stats.etiquetas.updated += 1;
      } else {
        const slug = await ensureUniqueSlug(row.name, async (s) =>
          Boolean(await prisma.etiqueta.findUnique({ where: { slug: s } }))
        , row.id);
        await prisma.etiqueta.create({
          data: { nombre: row.name, slug, odoo_id: row.id },
        });
        stats.etiquetas.created += 1;
      }
    } catch (e) {
      stats.errors.push(`etiqueta ${row.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

async function saveProductImage(
  folderKey: string | number,
  base64: string,
  titulo: string
): Promise<string | null> {
  try {
    const buf = Buffer.from(base64, "base64");
    const hash = createHash("md5").update(buf).digest("hex").slice(0, 10);
    const uploadsDir = process.env.UPLOADS_DIR || "uploads";
    const relDir = path.join("productos", String(folderKey));
    const absDir = path.join(process.cwd(), uploadsDir, relDir);
    await mkdir(absDir, { recursive: true });
    const filename = `${hash}.jpg`;
    await writeFile(path.join(absDir, filename), buf);
    return path.posix.join(relDir.replace(/\\/g, "/"), filename);
  } catch (e) {
    console.error(`image save failed for product ${folderKey} (${titulo}):`, e);
    return null;
  }
}

async function upsertProductImage(
  id_producto: number,
  odooId: number,
  base64: string,
  titulo: string
): Promise<boolean> {
  if (typeof base64 !== "string" || base64.length < 100) return false;
  const link = await saveProductImage(odooId, base64, titulo);
  if (!link) return false;

  const existingFile = await prisma.archivo_producto.findFirst({
    where: { id_producto, archivo: { tipo: "imagen_principal" } },
    include: { archivo: true },
  });
  if (existingFile) {
    await prisma.archivo.update({
      where: { id_archivo: existingFile.id_archivo },
      data: { link, descripcion: titulo },
    });
  } else {
    const archivo = await prisma.archivo.create({
      data: {
        link,
        tipo: "imagen_principal",
        descripcion: titulo,
      },
    });
    await prisma.archivo_producto.create({
      data: { id_archivo: archivo.id_archivo, id_producto },
    });
  }
  return true;
}

/** Reemplaza imágenes de galería (`product.image`) manteniendo la principal. */
async function replaceGalleryImages(
  id_producto: number,
  odooProductId: number,
  imageIds: number[],
  titulo: string
): Promise<number> {
  const existing = await prisma.archivo_producto.findMany({
    where: { id_producto, archivo: { tipo: "imagen_galeria" } },
    select: { id_archivo: true },
  });
  if (existing.length) {
    const ids = existing.map((e) => e.id_archivo);
    await prisma.archivo_producto.deleteMany({
      where: { id_producto, id_archivo: { in: ids } },
    });
    await prisma.archivo.deleteMany({ where: { id_archivo: { in: ids } } });
  }

  if (!imageIds.length) return 0;

  const rows = await executeKw<
    { id: number; name?: string; image_1920?: string | false; sequence?: number }[]
  >("product.image", "read", [imageIds], {
    fields: ["id", "name", "image_1920", "sequence"],
    context: getOdooReadContext(),
  });

  // Preservar orden de imageIds / sequence
  const byId = new Map(rows.map((r) => [r.id, r]));
  let saved = 0;
  for (const imageId of imageIds) {
    const row = byId.get(imageId);
    if (!row || typeof row.image_1920 !== "string" || row.image_1920.length < 100) continue;
    const link = await saveProductImage(
      `${odooProductId}-g${imageId}`,
      row.image_1920,
      typeof row.name === "string" ? row.name : titulo
    );
    if (!link) continue;
    const archivo = await prisma.archivo.create({
      data: {
        link,
        tipo: "imagen_galeria",
        descripcion: typeof row.name === "string" ? row.name : `${titulo} (${saved + 1})`,
      },
    });
    await prisma.archivo_producto.create({
      data: { id_archivo: archivo.id_archivo, id_producto },
    });
    saved += 1;
  }
  return saved;
}

/** Productos que se muestran hoy en la home (destacados Apple/JBL/Accesorios + JBL + Potenciá). */
export async function getHomeVisibleProductIds(): Promise<number[]> {
  const { getHomeSeccionProductIds } = await import("@/lib/secciones");
  return getHomeSeccionProductIds();
}

/**
 * Descarga image_1920 de Odoo solo para los productos indicados (o los visibles en home).
 * Guarda en uploads/ y actualiza archivo / archivo_producto.
 */
export async function syncImagesForProducts(options?: {
  productIds?: number[];
  dryRun?: boolean;
}): Promise<{
  requested: number;
  withOdooId: number;
  downloaded: number;
  skipped: number;
  errors: string[];
}> {
  const productIds = options?.productIds ?? (await getHomeVisibleProductIds());
  const result = {
    requested: productIds.length,
    withOdooId: 0,
    downloaded: 0,
    skipped: 0,
    errors: [] as string[],
  };

  if (!productIds.length) return result;

  const products = await prisma.producto.findMany({
    where: { id_producto: { in: productIds }, odoo_id: { not: null } },
    select: { id_producto: true, odoo_id: true, titulo: true },
  });
  result.withOdooId = products.length;

  const odooIds = products.map((p) => p.odoo_id!).filter(Boolean);
  if (!odooIds.length) return result;

  // Odoo read por ids (incluye image_1920 solo de estos)
  const rows = await executeKw<
    { id: number; image_1920?: string | false; display_name?: string; name?: string }[]
  >("product.product", "read", [odooIds], {
    fields: ["id", "image_1920", "display_name", "name"],
    context: getOdooReadContext(),
  });

  const byOdoo = new Map(products.map((p) => [p.odoo_id!, p]));

  for (const row of rows) {
    const local = byOdoo.get(row.id);
    if (!local) continue;
    const titulo = pickProductTitle(row);

    if (typeof row.image_1920 !== "string" || row.image_1920.length < 100) {
      result.skipped += 1;
      continue;
    }

    if (options?.dryRun) {
      result.downloaded += 1;
      continue;
    }

    try {
      const ok = await upsertProductImage(
        local.id_producto,
        row.id,
        row.image_1920,
        titulo
      );
      if (ok) result.downloaded += 1;
      else result.skipped += 1;
    } catch (e) {
      result.errors.push(
        `producto ${local.id_producto} odoo=${row.id}: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  return result;
}

async function loadCompanyPriceMap(): Promise<Map<number, number>> {
  const companyPrices = await paginateAll<OdooCompanyPrice>(
    "sk.product.price.by.company",
    [["company_id", "=", 1]],
    ["id", "product_tmpl_id", "company_id", "price"]
  );
  const priceByTmpl = new Map<number, number>();
  for (const cp of companyPrices) {
    const tmplId = m2oId(cp.product_tmpl_id);
    if (tmplId && cp.price > 0) priceByTmpl.set(tmplId, Number(cp.price));
  }
  return priceByTmpl;
}

function todayIsoDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Carga ítems vigentes de la pricelist “Promociones Vigentes” (odoo_pricelist_id).
 * Preferencia: regla por variante (product_id) sobre regla por template.
 */
async function loadPromoPricelistMap(pricelistId: number): Promise<PromoMaps> {
  const today = todayIsoDate();
  const domain: unknown[] = [
    ["pricelist_id", "=", pricelistId],
    ["min_quantity", "<=", 1],
    "|",
    ["date_start", "=", false],
    ["date_start", "<=", today],
    "|",
    ["date_end", "=", false],
    ["date_end", ">=", today],
  ];
  const items = await paginateAll<OdooPricelistItem>(
    "product.pricelist.item",
    domain,
    [
      "id",
      "product_id",
      "product_tmpl_id",
      "compute_price",
      "percent_price",
      "fixed_price",
      "min_quantity",
      "date_start",
      "date_end",
    ]
  );

  const byProductId = new Map<number, PromoRule>();
  const byTmplId = new Map<number, PromoRule>();

  for (const item of items) {
    const compute = String(item.compute_price || "");
    let rule: PromoRule | null = null;
    if (compute === "percentage") {
      const percent = Number(item.percent_price);
      if (Number.isFinite(percent) && percent > 0) {
        rule = { percent, fixed: null };
      }
    } else if (compute === "fixed") {
      const fixed = Number(item.fixed_price);
      if (Number.isFinite(fixed) && fixed > 0) {
        rule = { percent: null, fixed };
      }
    }
    if (!rule) continue;

    const productId = m2oId(item.product_id);
    const tmplId = m2oId(item.product_tmpl_id);
    if (productId) {
      if (!byProductId.has(productId)) byProductId.set(productId, rule);
    } else if (tmplId) {
      if (!byTmplId.has(tmplId)) byTmplId.set(tmplId, rule);
    }
  }

  return { byProductId, byTmplId };
}

function resolvePromoDiscount(
  odooProductId: number,
  tmplId: number,
  precioLista: number,
  promoMaps: PromoMaps
): ResolvedPromo {
  if (precioLista <= 0) {
    return { porcentaje_desc: null, precio_con_desc: null };
  }
  const rule =
    promoMaps.byProductId.get(odooProductId) ?? promoMaps.byTmplId.get(tmplId);
  if (!rule) {
    return { porcentaje_desc: null, precio_con_desc: null };
  }

  if (rule.percent != null && rule.percent > 0) {
    const porcentaje_desc = Math.round(rule.percent * 100) / 100;
    const precio_con_desc =
      Math.round(precioLista * (1 - porcentaje_desc / 100) * 100) / 100;
    if (precio_con_desc <= 0 || precio_con_desc >= precioLista) {
      return { porcentaje_desc: null, precio_con_desc: null };
    }
    return { porcentaje_desc, precio_con_desc };
  }

  if (rule.fixed != null && rule.fixed > 0 && rule.fixed < precioLista) {
    const precio_con_desc = Math.round(rule.fixed * 100) / 100;
    const porcentaje_desc =
      Math.round((1 - precio_con_desc / precioLista) * 10000) / 100;
    return { porcentaje_desc, precio_con_desc };
  }

  return { porcentaje_desc: null, precio_con_desc: null };
}

function promoFieldsEqual(
  latest: {
    porcentaje_desc: Prisma.Decimal | null;
    precio_con_desc: Prisma.Decimal | null;
  } | null,
  promo: ResolvedPromo
): boolean {
  if (!latest) return false;
  const latestPct =
    latest.porcentaje_desc != null && Number(latest.porcentaje_desc) > 0
      ? Number(latest.porcentaje_desc)
      : null;
  const latestDesc =
    latest.precio_con_desc != null && Number(latest.precio_con_desc) > 0
      ? Number(latest.precio_con_desc)
      : null;
  const pctEqual =
    latestPct == null && promo.porcentaje_desc == null
      ? true
      : latestPct != null &&
        promo.porcentaje_desc != null &&
        Math.abs(latestPct - promo.porcentaje_desc) < 0.005;
  const descEqual =
    latestDesc == null && promo.precio_con_desc == null
      ? true
      : latestDesc != null &&
        promo.precio_con_desc != null &&
        Math.abs(latestDesc - promo.precio_con_desc) < 0.015;
  return pctEqual && descEqual;
}

async function loadProductLookupMaps() {
  const [brands, tags, cats, taxRateByOdoo] = await Promise.all([
    prisma.marca.findMany({ where: { odoo_id: { not: null } } }),
    prisma.etiqueta.findMany({ where: { odoo_id: { not: null } } }),
    prisma.categoria.findMany({ where: { odoo_id: { not: null } } }),
    loadSaleTaxRates(),
  ]);
  return {
    brandByOdoo: new Map(brands.map((b) => [b.odoo_id!, b.id_marca])),
    tagByOdoo: new Map(tags.map((t) => [t.odoo_id!, t.id_etiqueta])),
    catByOdoo: new Map(cats.map((c) => [c.odoo_id!, c.id_categoria])),
    taxRateByOdoo,
  };
}

/** `account.tax.id` → alícuota en porcentaje (21, 10.5, …) de impuestos de venta. */
async function loadSaleTaxRates(): Promise<Map<number, number>> {
  const rows = await searchRead<{ id: number; amount: number }>(
    "account.tax",
    [["type_tax_use", "=", "sale"]],
    ["id", "amount"]
  );
  return new Map(rows.map((r) => [r.id, Number(r.amount)]));
}

/**
 * Reemplaza productos_relacionados tipo "accesorio" desde
 * product.template.accessory_product_ids (IDs de product.product).
 */
async function syncAccesoriosRelaciones(
  items: { id_producto: number; product_tmpl_id: number }[],
  stats: SyncStats
): Promise<void> {
  if (!items.length) return;

  const tmplIds = [...new Set(items.map((i) => i.product_tmpl_id))];
  const templates = await executeKw<
    { id: number; accessory_product_ids: number[] }[]
  >("product.template", "read", [tmplIds, ["accessory_product_ids"]], {
    context: getOdooReadContext(),
  });

  const accByTmpl = new Map(
    templates.map((t) => [t.id, t.accessory_product_ids ?? []])
  );

  const allAccOdooIds = [
    ...new Set(templates.flatMap((t) => t.accessory_product_ids ?? [])),
  ];
  const locals =
    allAccOdooIds.length > 0
      ? await prisma.producto.findMany({
          where: { odoo_id: { in: allAccOdooIds } },
          select: { id_producto: true, odoo_id: true },
        })
      : [];
  const localByOdoo = new Map(
    locals
      .filter((p): p is { id_producto: number; odoo_id: number } => p.odoo_id != null)
      .map((p) => [p.odoo_id, p.id_producto])
  );

  for (const item of items) {
    const accOdooIds = accByTmpl.get(item.product_tmpl_id) ?? [];
    const relatedOrdered: number[] = [];
    const seen = new Set<number>();
    for (const oid of accOdooIds) {
      const idRel = localByOdoo.get(oid);
      if (idRel == null || idRel === item.id_producto || seen.has(idRel)) continue;
      seen.add(idRel);
      relatedOrdered.push(idRel);
    }

    if (stats.dryRun) {
      stats.relaciones.updated += 1;
      continue;
    }

    await prisma.productos_relacionados.deleteMany({
      where: {
        id_producto: item.id_producto,
        tipo_relacion: TIPO_RELACION_ACCESORIO,
      },
    });
    if (relatedOrdered.length) {
      await prisma.productos_relacionados.createMany({
        data: relatedOrdered.map((id_producto_relacionado, orden) => ({
          id_producto: item.id_producto,
          id_producto_relacionado,
          tipo_relacion: TIPO_RELACION_ACCESORIO,
          orden,
        })),
      });
    }
    stats.relaciones.updated += 1;
  }
}

async function upsertProductoRow(
  row: OdooProduct,
  stats: SyncStats,
  maps: {
    brandByOdoo: Map<number, number>;
    tagByOdoo: Map<number, number>;
    catByOdoo: Map<number, number>;
    priceByTmpl: Map<number, number>;
    promoMaps: PromoMaps;
    taxRateByOdoo: Map<number, number>;
  }
): Promise<number | null> {
  const titulo = pickProductTitle(row);
  const descripcion = pickEcommerceDescription(row, titulo);
  const sku = typeof row.default_code === "string" ? row.default_code : null;
  const id_marca = maps.brandByOdoo.get(m2oId(row.product_brand_id) ?? -1) ?? null;
  const cuotas_max = pickCuotasMax(row);
  const iva_rate = resolveIvaRate(row, maps.taxRateByOdoo);
  const existing = await prisma.producto.findUnique({ where: { odoo_id: row.id } });

  if (stats.dryRun) {
    if (existing) stats.productos.updated += 1;
    else stats.productos.created += 1;
    return existing?.id_producto ?? null;
  }

  let id_producto: number;
  if (existing) {
    // No reactivar: si el producto está inactivo en el sitio, el sync no lo vuelve a activar.
    await prisma.producto.update({
      where: { id_producto: existing.id_producto },
      data: { titulo, descripcion, sku, id_marca, cuotas_max, iva_rate },
    });
    id_producto = existing.id_producto;
    stats.productos.updated += 1;
  } else {
    const slug = await ensureUniqueSlug(
      titulo,
      async (s) => Boolean(await prisma.producto.findUnique({ where: { slug: s } })),
      row.id
    );
    const created = await prisma.producto.create({
      data: {
        titulo,
        slug,
        descripcion,
        sku,
        id_marca,
        cuotas_max,
        iva_rate,
        odoo_id: row.id,
        activo: true,
      },
    });
    id_producto = created.id_producto;
    stats.productos.created += 1;
  }

  const categOdoo = m2oId(row.categ_id);
  if (categOdoo && maps.catByOdoo.has(categOdoo)) {
    const id_categoria = maps.catByOdoo.get(categOdoo)!;
    await prisma.categoria_producto.upsert({
      where: { id_categoria_id_producto: { id_categoria, id_producto } },
      create: { id_categoria, id_producto },
      update: {},
    });
  }

  if (Array.isArray(row.product_tag_ids)) {
    for (const tagOdoo of row.product_tag_ids) {
      const id_etiqueta = maps.tagByOdoo.get(tagOdoo);
      if (!id_etiqueta) continue;
      await prisma.etiqueta_producto.upsert({
        where: { id_etiqueta_id_producto: { id_etiqueta, id_producto } },
        create: { id_etiqueta, id_producto },
        update: {},
      });
    }
  }

  const tmplId = m2oId(row.product_tmpl_id) ?? row.id;
  const precio = computePrecioListaBruto(row, maps.priceByTmpl);
  if (precio > 0) {
    await upsertPrecioProductoFromOdoo({
      id_producto,
      odooProductId: row.id,
      tmplId,
      precio,
      promoMaps: maps.promoMaps,
      stats,
      dryRun: stats.dryRun,
    });
  }

  return id_producto;
}

/**
 * Alícuota IVA real del producto, con la misma selección que usa el alta de
 * la orden en Odoo (`pickSaleTaxes` en odoo-venta): un solo IVA AR de venta,
 * priorizando 21% si el producto tiene ambos. Sin eso, se deduce del cociente
 * bruto/neto de la lista. Que este valor difiera del que aplica Odoo desalinea
 * el total cobrado en MP contra la orden (diferencias de centavos).
 */
function resolveIvaRate(
  row: { taxes_id?: number[]; taxed_lst_price?: number; list_price: number },
  taxRateByOdoo: Map<number, number>
): Prisma.Decimal | null {
  const rates = (row.taxes_id ?? [])
    .map((id) => taxRateByOdoo.get(id))
    .filter((amount): amount is number => amount != null);

  const ar = rates.filter((a) => a === 21 || a === 10.5);
  if (ar.length) {
    const amount = ar.includes(21) ? 21 : ar[0]!;
    return new Prisma.Decimal(amount / 100);
  }

  const taxed = Number(row.taxed_lst_price ?? 0);
  const net = Number(row.list_price ?? 0);
  if (taxed > 0 && net > 0) {
    const ratio = taxed / net - 1;
    if (Math.abs(ratio - 0.105) < 0.002) return new Prisma.Decimal("0.105");
    if (Math.abs(ratio - 0.21) < 0.002) return new Prisma.Decimal("0.21");
  }

  return null;
}

/**
 * Precio web bruto (IVA incluido) a partir de taxed_lst_price / company / list_price.
 */
function computePrecioListaBruto(
  row: {
    id: number;
    taxed_lst_price?: number;
    list_price: number;
    product_tmpl_id: OdooMany2One;
  },
  priceByTmpl: Map<number, number>
): number {
  const tmplId = m2oId(row.product_tmpl_id) ?? row.id;
  const taxed =
    typeof row.taxed_lst_price === "number" && row.taxed_lst_price > 0
      ? Number(row.taxed_lst_price)
      : 0;
  const companyNet =
    priceByTmpl.get(tmplId) ?? priceByTmpl.get(row.id) ?? 0;
  const listNet = Number(row.list_price) > 0 ? Number(row.list_price) : 0;
  let precio = taxed;
  if (
    precio > 0 &&
    companyNet > 0 &&
    listNet > 0 &&
    Math.abs(companyNet - listNet) >= 0.02
  ) {
    precio = Math.round(((companyNet * taxed) / listNet) * 100) / 100;
  } else if (!precio) {
    precio = companyNet || listNet;
  }
  return precio;
}

/**
 * Escribe precio de lista + descuento pricelist en la fila de hoy.
 * Si el producto no está en la pricelist, limpia porcentaje_desc / precio_con_desc.
 */
async function upsertPrecioProductoFromOdoo(args: {
  id_producto: number;
  odooProductId: number;
  tmplId: number;
  precio: number;
  promoMaps: PromoMaps;
  stats: SyncStats;
  dryRun: boolean;
}): Promise<void> {
  const { id_producto, odooProductId, tmplId, precio, promoMaps, stats, dryRun } =
    args;
  if (precio <= 0) return;

  const promo = resolvePromoDiscount(odooProductId, tmplId, precio, promoMaps);
  const latest = await prisma.precio_producto.findFirst({
    where: { id_producto },
    orderBy: { fecha_desde: "desc" },
  });
  const priceChanged = !latest || Number(latest.precio) !== precio;
  const promoChanged = !promoFieldsEqual(latest, promo);
  if (!priceChanged && !promoChanged) return;

  if (dryRun) {
    stats.precios.inserted += 1;
    return;
  }

  const fechaHoy = new Date();
  fechaHoy.setHours(0, 0, 0, 0);
  await prisma.precio_producto.upsert({
    where: {
      id_producto_fecha_desde: {
        id_producto,
        fecha_desde: fechaHoy,
      },
    },
    create: {
      id_producto,
      fecha_desde: fechaHoy,
      precio,
      porcentaje_desc: promo.porcentaje_desc,
      precio_con_desc: promo.precio_con_desc,
    },
    update: {
      precio,
      porcentaje_desc: promo.porcentaje_desc,
      precio_con_desc: promo.precio_con_desc,
    },
  });
  stats.precios.inserted += 1;
}

async function deactivateUnpublishedProducts(stats: SyncStats) {
  if (stats.dryRun) return;
  const publishedRows = await paginateAll<{ id: number }>(
    "product.product",
    PRODUCT_DOMAIN,
    ["id"]
  );
  const publishedOdooIds = publishedRows.map((r) => r.id);
  const publishedSet = new Set(publishedOdooIds);

  const locals = await prisma.producto.findMany({
    where: { odoo_id: { not: null }, activo: true },
    select: { id_producto: true, odoo_id: true },
  });
  const toDeactivate = locals
    .filter((p) => p.odoo_id != null && !publishedSet.has(p.odoo_id))
    .map((p) => p.id_producto);

  if (!toDeactivate.length) return;

  // updateMany evita N round-trips (el último lote del sync suele estar al límite de timeout)
  const result = await prisma.producto.updateMany({
    where: { id_producto: { in: toDeactivate } },
    data: { activo: false },
  });
  stats.productos.deactivated += result.count;
}

/**
 * Lote de productos: en offset 0 sincroniza maestro (categorías, almacenes, marcas, etiquetas).
 * Luego páginas de productos + precios. En el último lote desactiva no publicados. Sin imágenes.
 */
export async function runProductosSyncBatch(options?: {
  offset?: number;
  dryRun?: boolean;
  stats?: SyncStats;
}): Promise<SyncBatchResult> {
  const offset = Math.max(0, options?.offset ?? 0);
  const stats = options?.stats ?? emptyStats(Boolean(options?.dryRun));
  stats.dryRun = Boolean(options?.dryRun ?? stats.dryRun);

  let message: string | undefined;

  if (offset === 0) {
    message = "Sincronizando categorías, almacenes, marcas y etiquetas…";
    await syncCategorias(stats);
    await syncAlmacenes(stats);
    await syncMarcas(stats);
    await syncEtiquetas(stats);
  }

  const total = await searchCount("product.product", PRODUCT_DOMAIN);
  // Aunque no haya publicados, hay que desactivar los locales que quedaron fuera del dominio.
  if (total === 0) {
    message = "Desactivando productos no publicados…";
    await deactivateUnpublishedProducts(stats);
    return {
      type: "productos",
      processed: 0,
      total: 0,
      done: true,
      nextOffset: 0,
      message:
        stats.productos.deactivated > 0
          ? `Sin publicados en Odoo; desactivados ${stats.productos.deactivated} en el sitio`
          : "No hay productos publicados web en Odoo",
      stats,
      errors: stats.errors,
    };
  }

  const [priceByTmpl, promoMaps, maps] = await Promise.all([
    loadCompanyPriceMap(),
    getOdooConfig().then((cfg) => loadPromoPricelistMap(cfg.pricelistId)),
    loadProductLookupMaps(),
  ]);

  // No incluir image_1920 en search_read masivo: 200 imágenes base64 tumba el socket del proxy.
  const rows = await searchRead<OdooProduct>("product.product", PRODUCT_DOMAIN, PRODUCT_FIELDS, {
    limit: PAGE,
    offset,
    order: "id asc",
  });

  message = `Sincronizando productos ${offset + 1}–${Math.min(offset + rows.length, total)} de ${total}…`;

  const forRelaciones: { id_producto: number; product_tmpl_id: number }[] = [];
  for (const row of rows) {
    try {
      const id_producto = await upsertProductoRow(row, stats, {
        ...maps,
        priceByTmpl,
        promoMaps,
      });
      const tmplId = m2oId(row.product_tmpl_id);
      if (id_producto && tmplId) {
        forRelaciones.push({ id_producto, product_tmpl_id: tmplId });
      }
    } catch (e) {
      stats.errors.push(`producto ${row.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (forRelaciones.length) {
    try {
      await syncAccesoriosRelaciones(forRelaciones, stats);
    } catch (e) {
      stats.errors.push(
        `accesorios lote offset=${offset}: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  const processed = offset + rows.length;
  const done = processed >= total || rows.length < PAGE;
  const nextOffset = processed;

  if (done) {
    message = "Desactivando productos no publicados…";
    await deactivateUnpublishedProducts(stats);
    message =
      stats.productos.deactivated > 0
        ? `Productos y precios sincronizados (${stats.productos.deactivated} desactivados)`
        : "Productos y precios sincronizados";
  }

  return {
    type: "productos",
    processed: Math.min(processed, total),
    total,
    done,
    nextOffset,
    message,
    stats,
    errors: stats.errors,
  };
}

/** Sync completo de productos/precios/maestro (cron / CLI). Sin imágenes ni stock. */
export async function runProductosSync(options?: { dryRun?: boolean }): Promise<SyncStats> {
  const stats = emptyStats(Boolean(options?.dryRun));
  let offset = 0;
  for (;;) {
    const batch = await runProductosSyncBatch({ offset, dryRun: options?.dryRun, stats });
    if (batch.done) break;
    offset = batch.nextOffset;
  }
  return stats;
}

export async function syncProductos(stats: SyncStats, options?: { skipImages?: boolean }) {
  let offset = 0;
  for (;;) {
    const batch = await runProductosSyncBatch({
      offset,
      dryRun: stats.dryRun,
      stats,
    });
    if (batch.done) break;
    offset = batch.nextOffset;
  }

  if (!options?.skipImages) {
    const locals = await prisma.producto.findMany({
      where: { odoo_id: { not: null }, activo: true },
      select: { odoo_id: true },
    });
    const odooIds = locals.map((p) => p.odoo_id!).filter(Boolean);
    if (odooIds.length) {
      const img = await syncProductImagesForOdooIds(odooIds, { dryRun: stats.dryRun });
      stats.productos.images += img.images;
      stats.errors.push(...img.errors);
    }
  }
}

/** Stock desde Odoo para un subconjunto de productos locales con odoo_id. */
async function syncStockForProducts(
  productos: { id_producto: number; odoo_id: number }[],
  stats: SyncStats,
  options?: { chunkLabel?: string }
) {
  if (!productos.length) return;

  /** Solo almacenes vendibles en la web (retiro con tienda o envío a domicilio). */
  const sellableAlmacenes = await prisma.almacen.findMany({
    where: {
      odoo_id: { not: null },
      OR: [{ id_tienda: { not: null } }, { es_envio_domicilio: true }],
    },
    select: { id_almacen: true, odoo_id: true },
  });
  const almacenByOdoo = new Map(
    sellableAlmacenes
      .filter((a): a is { id_almacen: number; odoo_id: number } => a.odoo_id != null)
      .map((a) => [a.odoo_id, a.id_almacen])
  );
  const sellableAlmacenIds = [...new Set(almacenByOdoo.values())];
  const sellableWarehouseOdooIds = [...almacenByOdoo.keys()];
  const label = options?.chunkLabel ?? "stock";

  if (!sellableWarehouseOdooIds.length) {
    stats.errors.push(
      "stock: no hay almacenes vendibles con odoo_id (id_tienda o es_envio_domicilio)"
    );
    return;
  }

  const productoByOdoo = new Map(productos.map((p) => [p.odoo_id, p.id_producto]));
  const odooIds = [...productoByOdoo.keys()];

  /** productLocalId → (almacenLocalId → qty) */
  const byProduct = new Map<number, Map<number, number>>();
  for (const p of productos) byProduct.set(p.id_producto, new Map());

  try {
    const groups = await readGroup(
      "stock.quant",
      [
        ["product_id", "in", odooIds],
        ["location_id.usage", "=", "internal"],
        ["warehouse_id", "in", sellableWarehouseOdooIds],
      ],
      ["quantity:sum", "reserved_quantity:sum", "product_id", "warehouse_id"],
      ["product_id", "warehouse_id"]
    );

    for (const row of groups) {
      const productOdoo = m2oId(row.product_id as OdooMany2One | false);
      const warehouseOdoo = m2oId(row.warehouse_id as OdooMany2One | false);
      if (!productOdoo || !warehouseOdoo) continue;

      const id_producto = productoByOdoo.get(productOdoo);
      const id_almacen = almacenByOdoo.get(warehouseOdoo);
      if (!id_producto || !id_almacen) continue;

      const quantity = Number(row.quantity ?? 0);
      const reserved = Number(row.reserved_quantity ?? 0);
      const available = Math.max(0, quantity - reserved);
      const map = byProduct.get(id_producto)!;
      map.set(id_almacen, (map.get(id_almacen) ?? 0) + available);
    }
  } catch (e) {
    stats.errors.push(`${label}: ${e instanceof Error ? e.message : String(e)}`);
    return;
  }

  // Garantizar fila (qty 0) en cada almacén vendible para que el PDP no asuma "sin sync".
  for (const p of productos) {
    const map = byProduct.get(p.id_producto)!;
    for (const id_almacen of sellableAlmacenIds) {
      if (!map.has(id_almacen)) map.set(id_almacen, 0);
    }
  }

  if (!stats.dryRun) {
    const productIds = productos.map((p) => p.id_producto);
    const rows: { id_producto: number; id_almacen: number; cantidad: number }[] = [];
    for (const p of productos) {
      const map = byProduct.get(p.id_producto)!;
      for (const [id_almacen, cantidad] of map.entries()) {
        rows.push({ id_producto: p.id_producto, id_almacen, cantidad });
      }
    }

    try {
      if (rows.length) {
        const values = rows.map(
          (r) =>
            Prisma.sql`(${r.id_producto}, ${r.id_almacen}, ${r.cantidad})`
        );
        await prisma.$executeRaw`
          INSERT INTO stock (id_producto, id_almacen, cantidad)
          VALUES ${Prisma.join(values)}
          ON DUPLICATE KEY UPDATE cantidad = VALUES(cantidad)
        `;
      }

      // Quitar filas de almacenes no vendibles (deja de mostrar Corp/etc. stale en admin).
      await prisma.stock.deleteMany({
        where: {
          id_producto: { in: productIds },
          id_almacen: { notIn: sellableAlmacenIds },
        },
      });

      stats.stock.upserted += productos.length;
    } catch (e) {
      stats.errors.push(`${label} persist: ${e instanceof Error ? e.message : String(e)}`);
    }
  } else {
    stats.stock.upserted += productos.length;
  }
}

/**
 * Lote de stock: chunk de productos, read_group (solo almacenes vendibles) + upsert.
 */
export async function runStockSyncBatch(options?: {
  offset?: number;
  dryRun?: boolean;
  stats?: SyncStats;
}): Promise<SyncBatchResult> {
  const offset = Math.max(0, options?.offset ?? 0);
  const stats = options?.stats ?? emptyStats(Boolean(options?.dryRun));
  stats.dryRun = Boolean(options?.dryRun ?? stats.dryRun);

  const productos = await prisma.producto.findMany({
    where: { odoo_id: { not: null }, activo: true },
    select: { id_producto: true, odoo_id: true },
    orderBy: { id_producto: "asc" },
  });

  if (!productos.length) {
    stats.errors.push("stock: no hay productos con odoo_id para sincronizar");
    return {
      type: "stock",
      processed: 0,
      total: 0,
      done: true,
      nextOffset: 0,
      message: "No hay productos con odoo_id",
      stats,
      errors: stats.errors,
    };
  }

  const sellableCount = await prisma.almacen.count({
    where: {
      odoo_id: { not: null },
      OR: [{ id_tienda: { not: null } }, { es_envio_domicilio: true }],
    },
  });
  if (!sellableCount) {
    stats.errors.push(
      "stock: no hay almacenes vendibles con odoo_id (id_tienda o es_envio_domicilio)"
    );
    return {
      type: "stock",
      processed: 0,
      total: productos.length,
      done: true,
      nextOffset: 0,
      message: "Faltan almacenes vendibles sincronizados",
      stats,
      errors: stats.errors,
    };
  }

  const total = productos.length;
  const chunk = productos
    .slice(offset, offset + STOCK_CHUNK)
    .filter((p): p is { id_producto: number; odoo_id: number } => p.odoo_id != null);

  await syncStockForProducts(chunk, stats, { chunkLabel: `stock chunk ${offset}` });

  const processed = Math.min(offset + chunk.length, total);
  const done = processed >= total;
  return {
    type: "stock",
    processed,
    total,
    done,
    nextOffset: processed,
    message: done
      ? "Stock sincronizado"
      : `Sincronizando stock ${offset + 1}–${processed} de ${total}…`,
    stats,
    errors: stats.errors,
  };
}

/**
 * Llena `stock` desde `stock.quant` agrupado por almacén vendible (warehouse_id).
 * Persiste con upsert (quantity − reserved); no borra filas vendibles a mitad de sync.
 */
export async function syncStock(stats: SyncStats) {
  let offset = 0;
  for (;;) {
    const batch = await runStockSyncBatch({ offset, dryRun: stats.dryRun, stats });
    if (batch.done) break;
    offset = batch.nextOffset;
  }
}

export async function runFullSync(options?: {
  dryRun?: boolean;
  skipImages?: boolean;
  skipStock?: boolean;
}): Promise<SyncStats> {
  const stats = await runProductosSync({ dryRun: options?.dryRun });
  if (!options?.skipImages) {
    let offset = 0;
    for (;;) {
      const batch = await runImagesSyncBatch({ offset, dryRun: options?.dryRun, stats });
      if (batch.done) break;
      offset = batch.nextOffset;
    }
  }
  if (!options?.skipStock) {
    const locked = await withCronLock("sync-stock", async () => {
      await syncStock(stats);
    });
    if (!locked.acquired) {
      stats.skipped = true;
      stats.errors.push("stock sync omitido: ya hay una sincronización en curso");
    }
  }
  return stats;
}

/** Solo sincroniza stock por almacén desde Odoo (`stock.quant`). Para cron/CLI. */
export async function runStockSync(options?: { dryRun?: boolean }): Promise<SyncStats> {
  const stats = emptyStats(Boolean(options?.dryRun));
  const locked = await withCronLock("sync-stock", async () => {
    await syncStock(stats);
  });
  if (!locked.acquired) {
    stats.skipped = true;
    stats.errors.push("stock sync omitido: ya hay una sincronización en curso");
  }
  return stats;
}

const PRECIO_PROMO_FIELDS = [
  "id",
  "list_price",
  "taxed_lst_price",
  "product_tmpl_id",
] as const;

/**
 * Solo precios de lista + descuentos de pricelist “Promociones Vigentes”.
 * No toca títulos, categorías, stock ni imágenes. Pensado para cron diario.
 */
export async function runPreciosPromoSync(options?: {
  dryRun?: boolean;
}): Promise<SyncStats> {
  const stats = emptyStats(Boolean(options?.dryRun));
  // Catálogo completo puede tardar; stale > default de stock.
  const locked = await withCronLock(
    "sync-precios-promo",
    async () => {
      await syncPreciosPromo(stats);
    },
    { staleMs: 45 * 60 * 1000 }
  );
  if (!locked.acquired) {
    stats.skipped = true;
    stats.errors.push(
      "sync precios/promo omitido: ya hay una sincronización en curso"
    );
  }
  return stats;
}

async function syncPreciosPromo(stats: SyncStats) {
  const locals = await prisma.producto.findMany({
    where: { odoo_id: { not: null }, activo: true },
    select: { id_producto: true, odoo_id: true },
  });
  if (!locals.length) return;

  const byOdoo = new Map(
    locals
      .filter((p): p is { id_producto: number; odoo_id: number } => p.odoo_id != null)
      .map((p) => [p.odoo_id, p.id_producto])
  );
  const odooIds = [...byOdoo.keys()];

  const [priceByTmpl, promoMaps] = await Promise.all([
    loadCompanyPriceMap(),
    getOdooConfig().then((cfg) => loadPromoPricelistMap(cfg.pricelistId)),
  ]);

  for (let i = 0; i < odooIds.length; i += PAGE) {
    const chunk = odooIds.slice(i, i + PAGE);
    let rows: OdooProduct[];
    try {
      rows = await searchRead<OdooProduct>(
        "product.product",
        [["id", "in", chunk]],
        [...PRECIO_PROMO_FIELDS],
        { limit: PAGE, order: "id asc" }
      );
    } catch (e) {
      stats.errors.push(
        `precios chunk ${i}: ${e instanceof Error ? e.message : String(e)}`
      );
      continue;
    }

    const seen = new Set<number>();
    for (const row of rows) {
      seen.add(row.id);
      const id_producto = byOdoo.get(row.id);
      if (!id_producto) continue;
      try {
        const tmplId = m2oId(row.product_tmpl_id) ?? row.id;
        const precio = computePrecioListaBruto(row, priceByTmpl);
        await upsertPrecioProductoFromOdoo({
          id_producto,
          odooProductId: row.id,
          tmplId,
          precio,
          promoMaps,
          stats,
          dryRun: stats.dryRun,
        });
      } catch (e) {
        stats.errors.push(
          `precio odoo_id=${row.id}: ${e instanceof Error ? e.message : String(e)}`
        );
      }
    }

    for (const oid of chunk) {
      if (!seen.has(oid)) {
        stats.errors.push(`precio odoo_id=${oid}: no encontrado en Odoo`);
      }
    }
  }
}

/** Sincroniza imagen principal + galería para un conjunto de odoo_id de product.product. */
export async function syncProductImagesForOdooIds(
  odooIds: number[],
  options?: { dryRun?: boolean }
): Promise<{ images: number; errors: string[] }> {
  const result = { images: 0, errors: [] as string[] };
  if (!odooIds.length) return result;

  const locals = await prisma.producto.findMany({
    where: { odoo_id: { in: odooIds } },
    select: { id_producto: true, odoo_id: true },
  });
  const localByOdoo = new Map(locals.map((p) => [p.odoo_id!, p.id_producto]));

  for (let i = 0; i < odooIds.length; i += IMAGE_CHUNK) {
    const chunk = odooIds.slice(i, i + IMAGE_CHUNK);
    try {
      const rows = await executeKw<
        {
          id: number;
          name: string;
          image_1920?: string | false;
          product_template_image_ids?: number[];
        }[]
      >("product.product", "read", [chunk], {
        fields: ["id", "name", "image_1920", "product_template_image_ids"],
        context: getOdooReadContext(),
      });

      for (const row of rows) {
        const id_producto = localByOdoo.get(row.id);
        if (!id_producto) continue;
        const titulo = pickProductTitle(row);

        if (options?.dryRun) {
          result.images += 1;
          continue;
        }

        try {
          if (typeof row.image_1920 === "string" && row.image_1920.length > 100) {
            if (await upsertProductImage(id_producto, row.id, row.image_1920, titulo)) {
              result.images += 1;
            }
          }
          const galleryIds = Array.isArray(row.product_template_image_ids)
            ? row.product_template_image_ids.filter((id): id is number => typeof id === "number")
            : [];
          result.images += await replaceGalleryImages(id_producto, row.id, galleryIds, titulo);
        } catch (e) {
          result.errors.push(
            `producto ${row.id}: ${e instanceof Error ? e.message : String(e)}`
          );
        }
      }
    } catch (e) {
      result.errors.push(`chunk ${i}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return result;
}

/**
 * Lote de imágenes (principal + galería) sobre productos activos locales.
 */
export async function runImagesSyncBatch(options?: {
  offset?: number;
  dryRun?: boolean;
  stats?: SyncStats;
}): Promise<SyncBatchResult> {
  const offset = Math.max(0, options?.offset ?? 0);
  const stats = options?.stats ?? emptyStats(Boolean(options?.dryRun));
  stats.dryRun = Boolean(options?.dryRun ?? stats.dryRun);

  const products = await prisma.producto.findMany({
    where: { odoo_id: { not: null }, activo: true },
    select: { odoo_id: true },
    orderBy: { id_producto: "asc" },
  });
  const odooIds = products.map((p) => p.odoo_id!).filter(Boolean);
  const total = odooIds.length;

  if (!total) {
    return {
      type: "imagenes",
      processed: 0,
      total: 0,
      done: true,
      nextOffset: 0,
      message: "No hay productos activos con odoo_id",
      stats,
      errors: stats.errors,
    };
  }

  const chunk = odooIds.slice(offset, offset + IMAGE_CHUNK);
  const img = await syncProductImagesForOdooIds(chunk, { dryRun: stats.dryRun });
  stats.productos.images += img.images;
  stats.errors.push(...img.errors);

  const processed = Math.min(offset + chunk.length, total);
  const done = processed >= total;
  return {
    type: "imagenes",
    processed,
    total,
    done,
    nextOffset: processed,
    message: done
      ? "Imágenes sincronizadas"
      : `Sincronizando imágenes ${offset + 1}–${processed} de ${total}…`,
    stats,
    errors: stats.errors,
  };
}

/**
 * Sincroniza un producto por SKU (default_code Odoo): datos/precios, stock e imágenes.
 * No exige `x_studio_publicado_web` para permitir forzar sync desde admin,
 * pero si no está publicado deja el producto local inactivo.
 */
export async function syncProductoBySku(
  rawSku: string,
  options?: { dryRun?: boolean }
): Promise<SyncProductoBySkuResult> {
  const sku = rawSku.trim();
  const stats = emptyStats(Boolean(options?.dryRun));

  if (!sku) {
    return {
      ok: false,
      sku,
      message: "Ingresá un SKU",
      stats,
      errors: ["SKU vacío"],
    };
  }

  const rows = await searchRead<OdooProduct>(
    "product.product",
    [["default_code", "=", sku]],
    PRODUCT_FIELDS,
    { limit: 5, order: "id asc" }
  );

  if (!rows.length) {
    return {
      ok: false,
      sku,
      message: `No se encontró el SKU "${sku}" en Odoo`,
      stats,
      errors: [`SKU no encontrado en Odoo: ${sku}`],
    };
  }

  if (rows.length > 1) {
    stats.errors.push(
      `Hay ${rows.length} variantes con SKU "${sku}" en Odoo; se sincroniza odoo_id=${rows[0].id}`
    );
  }

  const row = rows[0];
  const titulo = pickProductTitle(row);
  const isPublishedWeb = row.x_studio_publicado_web === true;

  try {
    const [priceByTmpl, promoMaps, maps] = await Promise.all([
      loadCompanyPriceMap(),
      getOdooConfig().then((cfg) => loadPromoPricelistMap(cfg.pricelistId)),
      loadProductLookupMaps(),
    ]);
    const id_producto = await upsertProductoRow(row, stats, {
      ...maps,
      priceByTmpl,
      promoMaps,
    });

    if (!id_producto && !stats.dryRun) {
      return {
        ok: false,
        sku,
        odoo_id: row.id,
        titulo,
        message: "No se pudo crear/actualizar el producto local",
        stats,
        errors: stats.errors,
      };
    }

    const localId =
      id_producto ??
      (await prisma.producto.findUnique({ where: { odoo_id: row.id } }))?.id_producto;

    if (localId) {
      if (!isPublishedWeb && !stats.dryRun) {
        const wasActive = await prisma.producto.findUnique({
          where: { id_producto: localId },
          select: { activo: true },
        });
        if (wasActive?.activo) {
          await prisma.producto.update({
            where: { id_producto: localId },
            data: { activo: false },
          });
          stats.productos.deactivated += 1;
        }
      }

      const tmplId = m2oId(row.product_tmpl_id);
      if (tmplId) {
        try {
          await syncAccesoriosRelaciones(
            [{ id_producto: localId, product_tmpl_id: tmplId }],
            stats
          );
        } catch (e) {
          stats.errors.push(
            `accesorios sku ${sku}: ${e instanceof Error ? e.message : String(e)}`
          );
        }
      }

      await syncStockForProducts(
        [{ id_producto: localId, odoo_id: row.id }],
        stats,
        { chunkLabel: `stock sku ${sku}` }
      );

      const img = await syncProductImagesForOdooIds([row.id], { dryRun: stats.dryRun });
      stats.productos.images += img.images;
      stats.errors.push(...img.errors);
    }

    const unpublishedNote = !isPublishedWeb
      ? " (sin publicar en web → inactivo en el sitio)"
      : "";

    return {
      ok: Boolean(localId),
      sku,
      id_producto: localId ?? undefined,
      odoo_id: row.id,
      titulo,
      message: localId
        ? stats.errors.filter((e) => !e.includes("variantes con SKU")).length
          ? `Producto "${titulo}" sincronizado con advertencias${unpublishedNote}`
          : `Producto "${titulo}" sincronizado (datos, stock e imágenes)${unpublishedNote}`
        : `Error al sincronizar SKU "${sku}"`,
      stats,
      errors: stats.errors,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    stats.errors.push(msg);
    return {
      ok: false,
      sku,
      odoo_id: row.id,
      titulo,
      message: `Error al sincronizar SKU "${sku}"`,
      stats,
      errors: stats.errors,
    };
  }
}

/** Dispatch de un lote según tipo (API admin). */
export async function runSyncBatch(options: {
  type: SyncType;
  offset?: number;
  dryRun?: boolean;
}): Promise<SyncBatchResult> {
  switch (options.type) {
    case "productos":
      return runProductosSyncBatch({ offset: options.offset, dryRun: options.dryRun });
    case "stock":
      return runStockSyncBatch({ offset: options.offset, dryRun: options.dryRun });
    case "imagenes":
      return runImagesSyncBatch({ offset: options.offset, dryRun: options.dryRun });
    default:
      throw new Error(`Tipo de sync desconocido: ${options.type as string}`);
  }
}
