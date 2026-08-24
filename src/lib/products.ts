import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import {
  isSellableAlmacen,
  sumSellableStock,
  type StockRow,
} from "@/lib/almacenes";

export type ProductListItem = {
  id_producto: number;
  titulo: string;
  slug: string;
  descripcion: string;
  /** Precio de lista bruto (IVA incluido). */
  precio: number | null;
  /** % descuento pricelist Promociones Vigentes; null si no aplica. */
  porcentaje_desc: number | null;
  /** Precio bruto con descuento; null si no aplica. */
  precio_con_desc: number | null;
  imagen: string | null;
  stockTotal: number;
  /** true si hay filas de stock en DB (sincronizado); false = stock desconocido */
  stockTracked: boolean;
  cuotas_max: number | null;
  /** Ruta de imagen de etiqueta de promo (esquina superior derecha de la card) */
  promoBadge?: string | null;
};

export type CurrentPriceInfo = {
  /** Precio de lista bruto. */
  precio: number | null;
  porcentaje_desc: number | null;
  precio_con_desc: number | null;
};

/** Precio de venta: con descuento de pricelist si existe. */
export function precioEfectivo(
  precio: number | null | undefined,
  precioConDesc?: number | null
): number | null {
  if (precioConDesc != null && Number(precioConDesc) > 0) {
    return Number(precioConDesc);
  }
  if (precio == null) return null;
  return Number(precio);
}

/**
 * Disponibilidad de stock (solo almacenes vendibles).
 * - Sin filas vendibles → aún no sincronizado: se considera disponible (como el carrito).
 * - Con filas → inStock solo si la suma de cantidades vendibles es > 0.
 */
export function resolveStockAvailability(stocks: StockRow[]) {
  const sellable = stocks.filter((s) => isSellableAlmacen(s.almacen));
  const stockTotal = sumSellableStock(stocks);
  const stockTracked = sellable.length > 0;
  return {
    stockTotal,
    stockTracked,
    inStock: !stockTracked || stockTotal > 0,
  };
}

/** Ordena imágenes del PDP: principal de Odoo primero, luego galería. */
export function sortProductImageLinks(
  archivos: { link: string | null; tipo: string; id_archivo: number }[]
): string[] {
  const sorted = [...archivos]
    .filter((a): a is { link: string; tipo: string; id_archivo: number } => Boolean(a.link))
    .sort((a, b) => {
      const pa = a.tipo === "imagen_principal" ? 0 : 1;
      const pb = b.tipo === "imagen_principal" ? 0 : 1;
      if (pa !== pb) return pa - pb;
      return a.id_archivo - b.id_archivo;
    })
    .map((a) => a.link);

  // Evitar duplicar la principal si Odoo la repite en product.image
  const seen = new Set<string>();
  return sorted.filter((link) => {
    const key = link.split("/").pop() ?? link;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Sucursales visibles en el PDP (mismas etiquetas que el sitio actual). */
export const PDP_STORE_LOCATIONS: {
  name: string;
  match: RegExp[];
  warehouseOdooId?: number;
  shipping?: boolean;
}[] = [
  { name: "Alto Rosario", match: [/alto\s*rosario/i] },
  { name: "Palermo Soho", match: [/palermo/i] },
  { name: "Rosario Centro", match: [/rosario\s*centro/i] },
  {
    name: "Envío a Domicilio",
    match: [/warehouse/i, /\(WH\)/i, /\bWH\b/],
    shipping: true,
  },
  { name: "Solar Shopping", match: [/\bsolar\b/i] },
  { name: "DOT Baires Shopping", match: [/\bdot\b/i] },
  { name: "Cordoba Shopping", match: [/c[oó]rdoba/i] },
];

export type StoreAvailabilityItem = {
  name: string;
  available: boolean;
};

/** Disponibilidad por sucursal a partir del stock desglosado por almacén. */
export function resolveStoreAvailability(
  stocks: (StockRow & { almacen?: { odoo_id: number | null; descripcion?: string; es_envio_domicilio?: boolean } | null })[]
): StoreAvailabilityItem[] {
  return PDP_STORE_LOCATIONS.map((loc) => {
    const qty = stocks
      .filter((s) => {
        if ("shipping" in loc && loc.shipping) {
          return Boolean(s.almacen?.es_envio_domicilio);
        }
        const odooId = s.almacen?.odoo_id;
        if ("warehouseOdooId" in loc && loc.warehouseOdooId != null) {
          return odooId === loc.warehouseOdooId;
        }
        const desc = s.almacen?.descripcion ?? "";
        return loc.match.some((re) => re.test(desc));
      })
      .reduce((acc, s) => acc + Number(s.cantidad || 0), 0);
    return { name: loc.name, available: qty > 0 };
  });
}

export type CharacteristicFilterDef = {
  id_caracteristica: number;
  nombre: string;
  tipo: "numerico" | "cualitativo";
  valores: string[];
  min: number | null;
  max: number | null;
};

export type AppliedCharacteristicFilter = {
  id_caracteristica: number;
  tipo: "numerico" | "cualitativo";
  valores?: string[];
  min?: number;
  max?: number;
};

function pickCurrentPriceInfo(
  precios: {
    fecha_desde: Date;
    precio: Prisma.Decimal;
    porcentaje_desc?: Prisma.Decimal | null;
    precio_con_desc?: Prisma.Decimal | null;
  }[],
  today = new Date()
): CurrentPriceInfo {
  const eligible = precios
    .filter((p) => p.fecha_desde <= today)
    .sort((a, b) => b.fecha_desde.getTime() - a.fecha_desde.getTime());
  if (!eligible.length) {
    return { precio: null, porcentaje_desc: null, precio_con_desc: null };
  }
  const row = eligible[0];
  const porcentaje_desc =
    row.porcentaje_desc != null ? Number(row.porcentaje_desc) : null;
  const precio_con_desc =
    row.precio_con_desc != null ? Number(row.precio_con_desc) : null;
  return {
    precio: Number(row.precio),
    porcentaje_desc:
      porcentaje_desc != null && porcentaje_desc > 0 ? porcentaje_desc : null,
    precio_con_desc:
      precio_con_desc != null && precio_con_desc > 0 ? precio_con_desc : null,
  };
}

/** Precio de lista vigente (max fecha_desde ≤ hoy). */
function pickCurrentPrice(
  precios: {
    fecha_desde: Date;
    precio: Prisma.Decimal;
    porcentaje_desc?: Prisma.Decimal | null;
    precio_con_desc?: Prisma.Decimal | null;
  }[],
  today = new Date()
): number | null {
  return pickCurrentPriceInfo(precios, today).precio;
}

let categoryTreeCache: { id_categoria: number; id_cat_superior: number | null }[] | null = null;

async function getCategoryEdges() {
  if (!categoryTreeCache) {
    categoryTreeCache = await prisma.categoria.findMany({
      select: { id_categoria: true, id_cat_superior: true },
    });
  }
  return categoryTreeCache;
}

export async function getCategoryFilterDefinitions(
  categoriaId: number
): Promise<CharacteristicFilterDef[]> {
  const categoryIds = await getCategoryAndDescendantIds(categoriaId);

  const linked = await prisma.caracteristica_categoria.findMany({
    where: { id_categoria: { in: categoryIds } },
    include: { caracteristica: true },
  });

  const uniqueChars = new Map<number, string>();
  for (const row of linked) {
    uniqueChars.set(row.id_caracteristica, row.caracteristica.nombre);
  }
  if (!uniqueChars.size) return [];

  const values = await prisma.producto_caracteristica.findMany({
    where: {
      id_caracteristica: { in: [...uniqueChars.keys()] },
      producto: {
        activo: true,
        categorias: { some: { id_categoria: { in: categoryIds } } },
      },
    },
    select: {
      id_caracteristica: true,
      valor: true,
      valor_numerico: true,
    },
  });

  const byChar = new Map<
    number,
    { valores: Set<string>; numericCount: number; total: number; nums: number[] }
  >();

  for (const id of uniqueChars.keys()) {
    byChar.set(id, { valores: new Set(), numericCount: 0, total: 0, nums: [] });
  }

  for (const row of values) {
    const bucket = byChar.get(row.id_caracteristica);
    if (!bucket) continue;
    bucket.total += 1;
    if (row.valor_numerico) {
      bucket.numericCount += 1;
      const n = Number(row.valor.replace(",", "."));
      if (!Number.isNaN(n)) bucket.nums.push(n);
    } else if (row.valor.trim()) {
      bucket.valores.add(row.valor.trim());
    }
  }

  const defs: CharacteristicFilterDef[] = [];
  for (const [id, nombre] of uniqueChars) {
    const bucket = byChar.get(id)!;
    const isNumeric = bucket.total > 0 && bucket.numericCount >= bucket.total / 2;
    if (isNumeric) {
      defs.push({
        id_caracteristica: id,
        nombre,
        tipo: "numerico",
        valores: [],
        min: bucket.nums.length ? Math.min(...bucket.nums) : null,
        max: bucket.nums.length ? Math.max(...bucket.nums) : null,
      });
    } else {
      defs.push({
        id_caracteristica: id,
        nombre,
        tipo: "cualitativo",
        valores: [...bucket.valores].sort((a, b) => a.localeCompare(b, "es")),
        min: null,
        max: null,
      });
    }
  }

  return defs.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

async function productIdsMatchingNumericFilters(
  filters: AppliedCharacteristicFilter[],
  categoryIds?: number[]
): Promise<number[] | null> {
  const numeric = filters.filter((f) => f.tipo === "numerico");
  if (!numeric.length) return null;

  let ids: number[] | null = null;

  for (const filter of numeric) {
    const rows = await prisma.producto_caracteristica.findMany({
      where: {
        id_caracteristica: filter.id_caracteristica,
        valor_numerico: true,
        producto: {
          activo: true,
          ...(categoryIds
            ? { categorias: { some: { id_categoria: { in: categoryIds } } } }
            : {}),
        },
      },
      select: { id_producto: true, valor: true },
    });

    const matching: number[] = [];
    for (const row of rows) {
      const n = Number(row.valor.replace(",", "."));
      if (Number.isNaN(n)) continue;
      if (filter.min != null && n < filter.min) continue;
      if (filter.max != null && n > filter.max) continue;
      matching.push(row.id_producto);
    }

    if (!ids) {
      ids = matching;
    } else {
      const allow = new Set(matching);
      ids = ids.filter((id) => allow.has(id));
    }
  }

  return ids ?? [];
}

export type ShopOrder = "ultimos" | "precio-asc" | "precio-desc" | "nombre";

export type ShopCategoryNode = {
  id_categoria: number;
  nombre: string;
  slug: string;
  count: number;
  children: ShopCategoryNode[];
};

export type ShopBrandFacet = {
  id_marca: number;
  nombre: string;
  slug: string;
  count: number;
};

export type ShopFacets = {
  categories: ShopCategoryNode[];
  brands: ShopBrandFacet[];
  priceMin: number;
  priceMax: number;
};

/** IDs de categoría a filtrar: incluye hijos por jerarquía Prisma o por nombre "Padre / Hijo". */
export async function resolveCategoryFilterIds(categoriaId: number): Promise<number[]> {
  const cat = await prisma.categoria.findUnique({
    where: { id_categoria: categoriaId },
    select: { id_categoria: true, nombre: true },
  });
  if (!cat) return [];

  const byTree = await getCategoryAndDescendantIds(categoriaId);
  if (!cat.nombre.includes(" / ")) {
    const byName = await prisma.categoria.findMany({
      where: { nombre: { startsWith: `${cat.nombre} /` } },
      select: { id_categoria: true },
    });
    return [...new Set([...byTree, ...byName.map((c) => c.id_categoria)])];
  }
  return byTree.length ? byTree : [categoriaId];
}

export async function resolveCategoryFilterIdsBySlug(
  slug: string
): Promise<{ id: number; nombre: string; slug: string } | null> {
  const cat = await prisma.categoria.findUnique({
    where: { slug },
    select: { id_categoria: true, nombre: true, slug: true },
  });
  if (!cat) return null;
  return { id: cat.id_categoria, nombre: cat.nombre, slug: cat.slug };
}

/** IDs de productos activos en una categoría y sus descendientes. */
export async function resolveCategoryProductIds(categoriaId: number): Promise<number[]> {
  const catIds = await resolveCategoryFilterIds(categoriaId);
  if (!catIds.length) return [];

  const rows = await prisma.categoria_producto.findMany({
    where: {
      id_categoria: { in: catIds },
      producto: { activo: true },
    },
    select: { id_producto: true },
  });

  return [...new Set(rows.map((r) => r.id_producto))];
}

/** Facetas del sidebar de /shop: categorías con conteo, marcas y rango de precios.
 *  Si se pasa `ids`, los conteos y rangos se restringen a ese conjunto de productos. */
export async function getShopFacets(options?: { ids?: number[] }): Promise<ShopFacets> {
  const ids = options?.ids;
  if (ids && ids.length === 0) {
    return { categories: [], brands: [], priceMin: 0, priceMax: 0 };
  }

  const productWhere: Prisma.productoWhereInput = {
    activo: true,
    ...(ids ? { id_producto: { in: ids } } : {}),
  };

  const [categories, brands, priceRows] = await Promise.all([
    prisma.categoria.findMany({
      select: {
        id_categoria: true,
        nombre: true,
        slug: true,
        id_cat_superior: true,
        productos: {
          where: { producto: productWhere },
          select: { id_producto: true },
        },
      },
      orderBy: { nombre: "asc" },
    }),
    prisma.marca.findMany({
      where: { activo: true },
      select: {
        id_marca: true,
        nombre: true,
        slug: true,
        _count: { select: { productos: { where: productWhere } } },
      },
      orderBy: { nombre: "asc" },
    }),
    ids
      ? prisma.$queryRaw<{ min_p: Prisma.Decimal | null; max_p: Prisma.Decimal | null }[]>`
          SELECT
            MIN(COALESCE(pp.precio_con_desc, pp.precio)) AS min_p,
            MAX(COALESCE(pp.precio_con_desc, pp.precio)) AS max_p
          FROM precio_producto pp
          INNER JOIN producto p ON p.id_producto = pp.id_producto
          WHERE p.activo = 1
            AND p.id_producto IN (${Prisma.join(ids)})
            AND pp.fecha_desde = (
              SELECT MAX(pp2.fecha_desde)
              FROM precio_producto pp2
              WHERE pp2.id_producto = pp.id_producto
                AND pp2.fecha_desde <= CURDATE()
            )
        `
      : prisma.$queryRaw<{ min_p: Prisma.Decimal | null; max_p: Prisma.Decimal | null }[]>`
          SELECT
            MIN(COALESCE(pp.precio_con_desc, pp.precio)) AS min_p,
            MAX(COALESCE(pp.precio_con_desc, pp.precio)) AS max_p
          FROM precio_producto pp
          INNER JOIN producto p ON p.id_producto = pp.id_producto
          WHERE p.activo = 1
            AND pp.fecha_desde = (
              SELECT MAX(pp2.fecha_desde)
              FROM precio_producto pp2
              WHERE pp2.id_producto = pp.id_producto
                AND pp2.fecha_desde <= CURDATE()
            )
        `,
  ]);

  type Flat = {
    id_categoria: number;
    nombre: string;
    slug: string;
    id_cat_superior: number | null;
    count: number;
    displayName: string;
    parentKey: string | null;
  };

  const flat: Flat[] = categories.map((c) => {
    const parts = c.nombre.split(" / ");
    const isChild = parts.length > 1;
    return {
      id_categoria: c.id_categoria,
      nombre: c.nombre,
      slug: c.slug,
      id_cat_superior: c.id_cat_superior,
      count: c.productos.length,
      displayName: isChild ? parts.slice(1).join(" / ") : c.nombre,
      parentKey: isChild ? parts[0].trim() : null,
    };
  });

  const roots: ShopCategoryNode[] = [];
  const childrenByParent = new Map<string, Flat[]>();

  for (const c of flat) {
    if (c.parentKey) {
      const list = childrenByParent.get(c.parentKey) ?? [];
      list.push(c);
      childrenByParent.set(c.parentKey, list);
    }
  }

  const rootCandidates = flat.filter((c) => !c.parentKey);
  for (const root of rootCandidates) {
    // Ocultar categorías técnicas vacías poco útiles en la tienda
    if (["all", "parts", "servicio"].includes(root.slug)) continue;

    const namedChildren = childrenByParent.get(root.nombre) ?? [];
    const treeChildren = flat.filter(
      (c) => c.id_cat_superior === root.id_categoria && c.id_categoria !== root.id_categoria
    );
    const childMap = new Map<number, Flat>();
    for (const ch of [...namedChildren, ...treeChildren]) {
      childMap.set(ch.id_categoria, ch);
    }
    const children = [...childMap.values()]
      .filter((ch) => ch.count > 0)
      .map((ch) => ({
        id_categoria: ch.id_categoria,
        nombre: ch.displayName,
        slug: ch.slug,
        count: ch.count,
        children: [] as ShopCategoryNode[],
      }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

    const rolled = root.count + children.reduce((acc, ch) => acc + ch.count, 0);
    if (rolled <= 0 && children.length === 0) continue;

    roots.push({
      id_categoria: root.id_categoria,
      nombre: root.displayName,
      slug: root.slug,
      count: rolled,
      children,
    });
  }

  // Hojas huérfanas "Padre / Hijo" cuyo padre no existe como categoría raíz
  for (const [parentName, kids] of childrenByParent) {
    if (roots.some((r) => r.nombre === parentName)) continue;
    const parent = flat.find((c) => c.nombre === parentName);
    const children = kids
      .filter((ch) => ch.count > 0)
      .map((ch) => ({
        id_categoria: ch.id_categoria,
        nombre: ch.displayName,
        slug: ch.slug,
        count: ch.count,
        children: [] as ShopCategoryNode[],
      }));
    if (!children.length) continue;
    roots.push({
      id_categoria: parent?.id_categoria ?? kids[0].id_categoria,
      nombre: parentName,
      slug: parent?.slug ?? kids[0].slug,
      count: children.reduce((a, c) => a + c.count, 0),
      children,
    });
  }

  roots.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  const brandFacets = brands
    .filter((b) => b._count.productos > 0)
    .map((b) => ({
      id_marca: b.id_marca,
      nombre: b.nombre,
      slug: b.slug,
      count: b._count.productos,
    }));

  const priceMin = Number(priceRows[0]?.min_p ?? 0);
  const priceMax = Number(priceRows[0]?.max_p ?? 0);

  return {
    categories: roots,
    brands: brandFacets,
    priceMin: Number.isFinite(priceMin) ? Math.floor(priceMin) : 0,
    priceMax: Number.isFinite(priceMax) ? Math.ceil(priceMax) : 0,
  };
}

async function currentPricesByProductIds(
  ids: number[]
): Promise<Map<number, number>> {
  if (!ids.length) return new Map();
  const rows = await prisma.precio_producto.findMany({
    where: {
      id_producto: { in: ids },
      fecha_desde: { lte: new Date() },
    },
    orderBy: { fecha_desde: "desc" },
    select: {
      id_producto: true,
      precio: true,
      precio_con_desc: true,
    },
  });
  const map = new Map<number, number>();
  for (const row of rows) {
    if (!map.has(row.id_producto)) {
      const efectivo = precioEfectivo(
        Number(row.precio),
        row.precio_con_desc != null ? Number(row.precio_con_desc) : null
      );
      if (efectivo != null) map.set(row.id_producto, efectivo);
    }
  }
  return map;
}

const PRODUCT_LIST_SELECT = {
  id_producto: true,
  titulo: true,
  slug: true,
  cuotas_max: true,
  precios: {
    orderBy: { fecha_desde: "desc" as const },
    take: 1,
    select: {
      fecha_desde: true,
      precio: true,
      porcentaje_desc: true,
      precio_con_desc: true,
    },
  },
  archivos: {
    where: { archivo: { tipo: "imagen_principal" } },
    take: 1,
    select: { archivo: { select: { link: true } } },
  },
  stocks: {
    include: {
      almacen: {
        select: {
          odoo_id: true,
          descripcion: true,
          id_tienda: true,
          es_envio_domicilio: true,
        },
      },
    },
  },
} as const;

/** Mínimo de caracteres para que la búsqueda considere el prefijo de SKU */
const SKU_SEARCH_MIN_LEN = 5;

export async function getActiveProducts(options?: {
  q?: string;
  categoriaId?: number;
  marcaId?: number;
  /** Restringir a un conjunto de IDs (p.ej. productos de una promoción) */
  ids?: number[];
  characteristicFilters?: AppliedCharacteristicFilter[];
  take?: number;
  skip?: number;
  order?: ShopOrder;
  minPrice?: number;
  maxPrice?: number;
  /** Solo productos con stock (misma regla que resolveStockAvailability) */
  inStockOnly?: boolean;
  /** Si false, no carga badges de promo (default true) */
  withPromoBadges?: boolean;
}): Promise<{ items: ProductListItem[]; total: number }> {
  const cacheKey = JSON.stringify({
    q: options?.q ?? null,
    categoriaId: options?.categoriaId ?? null,
    marcaId: options?.marcaId ?? null,
    ids: options?.ids?.slice().sort((a, b) => a - b) ?? null,
    characteristicFilters: options?.characteristicFilters ?? null,
    take: options?.take ?? 24,
    skip: options?.skip ?? 0,
    order: options?.order ?? "ultimos",
    minPrice: options?.minPrice ?? null,
    maxPrice: options?.maxPrice ?? null,
    inStockOnly: options?.inStockOnly ?? false,
    withPromoBadges: options?.withPromoBadges !== false,
  });

  return unstable_cache(
    () => getActiveProductsUncached(options),
    ["active-products", cacheKey],
    { tags: ["products"], revalidate: 300 }
  )();
}

async function getActiveProductsUncached(options?: {
  q?: string;
  categoriaId?: number;
  marcaId?: number;
  ids?: number[];
  characteristicFilters?: AppliedCharacteristicFilter[];
  take?: number;
  skip?: number;
  order?: ShopOrder;
  minPrice?: number;
  maxPrice?: number;
  inStockOnly?: boolean;
  withPromoBadges?: boolean;
}): Promise<{ items: ProductListItem[]; total: number }> {
  const where: Prisma.productoWhereInput = {
    activo: true,
  };

  if (options?.ids) {
    if (options.ids.length === 0) {
      return { items: [], total: 0 };
    }
    where.id_producto = { in: options.ids };
  }

  if (options?.q) {
    const q = options.q.trim();
    if (q) {
      const or: Prisma.productoWhereInput[] = [{ titulo: { contains: q } }];
      // Búsqueda por SKU: alcanza con escribir el prefijo del código
      // (los primeros 5 caracteres, p. ej. "MTP03" → "MTP03BE/A").
      if (q.length >= SKU_SEARCH_MIN_LEN) or.push({ sku: { startsWith: q } });
      where.OR = or;
    }
  }

  if (options?.marcaId) {
    where.id_marca = options.marcaId;
  }

  let categoryIds: number[] | undefined;
  if (options?.categoriaId) {
    categoryIds = await resolveCategoryFilterIds(options.categoriaId);
    where.categorias = {
      some: { id_categoria: { in: categoryIds } },
    };
  }

  const filters = options?.characteristicFilters ?? [];
  const qualitative = filters.filter((f) => f.tipo === "cualitativo" && f.valores?.length);

  if (qualitative.length) {
    where.AND = qualitative.map((f) => ({
      caracteristicas: {
        some: {
          id_caracteristica: f.id_caracteristica,
          valor: { in: f.valores },
        },
      },
    }));
  }

  const numericIds = await productIdsMatchingNumericFilters(filters, categoryIds);
  if (numericIds) {
    const intersect = options?.ids
      ? numericIds.filter((id) => options.ids!.includes(id))
      : numericIds;
    where.id_producto = { in: intersect.length ? intersect : [-1] };
  }

  const take = options?.take ?? 24;
  const skip = options?.skip ?? 0;
  const order = options?.order ?? "ultimos";
  const needsPrice =
    order === "precio-asc" ||
    order === "precio-desc" ||
    options?.minPrice != null ||
    options?.maxPrice != null;

  async function attachBadges(items: ProductListItem[]): Promise<ProductListItem[]> {
    if (options?.withPromoBadges === false || !items.length) return items;
    const { getPromoBadges } = await import("@/lib/promos");
    const badges = await getPromoBadges(items.map((i) => i.id_producto));
    return items.map((item) => ({
      ...item,
      promoBadge: badges.get(item.id_producto) ?? null,
    }));
  }

  // Ranking en memoria: stock primero, luego criterio de orden; luego paginar
  const candidates = await prisma.producto.findMany({
    where,
    select: {
      id_producto: true,
      titulo: true,
      stocks: {
        include: {
          almacen: {
            select: {
              odoo_id: true,
              id_tienda: true,
              es_envio_domicilio: true,
            },
          },
        },
      },
    },
  });

  const priceMap = needsPrice
    ? await currentPricesByProductIds(candidates.map((c) => c.id_producto))
    : null;

  type Ranked = {
    id_producto: number;
    titulo: string;
    inStock: boolean;
    precio: number | null;
  };

  let ranked: Ranked[] = candidates.map((c) => {
    const stock = resolveStockAvailability(c.stocks);
    return {
      id_producto: c.id_producto,
      titulo: c.titulo,
      inStock: stock.inStock,
      precio: priceMap?.get(c.id_producto) ?? null,
    };
  });

  if (options?.inStockOnly) {
    ranked = ranked.filter((r) => r.inStock);
  }

  if (options?.minPrice != null) {
    ranked = ranked.filter((r) => r.precio != null && r.precio >= options.minPrice!);
  }
  if (options?.maxPrice != null) {
    ranked = ranked.filter((r) => r.precio != null && r.precio <= options.maxPrice!);
  }

  ranked.sort((a, b) => {
    if (a.inStock !== b.inStock) return a.inStock ? -1 : 1;
    if (order === "precio-asc") {
      return (a.precio ?? Number.POSITIVE_INFINITY) - (b.precio ?? Number.POSITIVE_INFINITY);
    }
    if (order === "precio-desc") {
      return (b.precio ?? Number.NEGATIVE_INFINITY) - (a.precio ?? Number.NEGATIVE_INFINITY);
    }
    if (order === "nombre") {
      return a.titulo.localeCompare(b.titulo, "es");
    }
    // ultimos: id desc
    return b.id_producto - a.id_producto;
  });

  const total = ranked.length;
  const pageIds = ranked.slice(skip, skip + take).map((r) => r.id_producto);
  if (!pageIds.length) return { items: [], total };

  const rows = await prisma.producto.findMany({
    where: { id_producto: { in: pageIds } },
    select: PRODUCT_LIST_SELECT,
  });
  const byId = new Map(rows.map((r) => [r.id_producto, r]));
  const items: ProductListItem[] = pageIds
    .map((id) => byId.get(id))
    .filter(Boolean)
    .map((p) => {
      const stock = resolveStockAvailability(p!.stocks);
      const priceInfo = pickCurrentPriceInfo(p!.precios);
      return {
        id_producto: p!.id_producto,
        titulo: p!.titulo,
        slug: p!.slug,
        descripcion: "",
        precio: priceInfo.precio,
        porcentaje_desc: priceInfo.porcentaje_desc,
        precio_con_desc: priceInfo.precio_con_desc,
        imagen: p!.archivos[0]?.archivo.link ?? null,
        stockTotal: stock.stockTotal,
        stockTracked: stock.stockTracked,
        cuotas_max: p!.cuotas_max,
      };
    });

  return { items: await attachBadges(items), total };
}

export async function getProductById(id: number) {
  const product = await prisma.producto.findFirst({
    where: { id_producto: id, activo: true },
    include: {
      precios: { orderBy: { fecha_desde: "desc" } },
      archivos: { include: { archivo: true } },
      stocks: { include: { almacen: true } },
      categorias: { include: { categoria: true } },
      caracteristicas: { include: { caracteristica: true } },
      marca: true,
      etiquetas: { include: { etiqueta: true } },
    },
  });
  if (!product) return null;

  const stock = resolveStockAvailability(product.stocks);
  const priceInfo = pickCurrentPriceInfo(product.precios);
  return {
    ...product,
    precio: priceInfo.precio,
    porcentaje_desc: priceInfo.porcentaje_desc,
    precio_con_desc: priceInfo.precio_con_desc,
    stockTotal: stock.stockTotal,
    stockTracked: stock.stockTracked,
    inStock: stock.inStock,
  };
}

export async function getProductBySlug(slug: string) {
  return unstable_cache(
    () => getProductBySlugUncached(slug),
    ["product-by-slug", slug],
    { tags: ["products", `product-${slug}`], revalidate: 300 }
  )();
}

async function getProductBySlugUncached(slug: string) {
  const product = await prisma.producto.findFirst({
    where: { slug, activo: true },
    include: {
      precios: { orderBy: { fecha_desde: "desc" } },
      archivos: { include: { archivo: true } },
      stocks: { include: { almacen: true } },
      categorias: { include: { categoria: true } },
      caracteristicas: { include: { caracteristica: true } },
      marca: true,
      etiquetas: { include: { etiqueta: true } },
    },
  });
  if (!product) return null;

  const stock = resolveStockAvailability(product.stocks);
  const priceInfo = pickCurrentPriceInfo(product.precios);
  return {
    ...product,
    precio: priceInfo.precio,
    porcentaje_desc: priceInfo.porcentaje_desc,
    precio_con_desc: priceInfo.precio_con_desc,
    stockTotal: stock.stockTotal,
    stockTracked: stock.stockTracked,
    inStock: stock.inStock,
  };
}

export async function getActiveBanners(ubicacion?: string) {
  return unstable_cache(
    () => getActiveBannersUncached(ubicacion),
    ["active-banners", ubicacion ?? "all"],
    { tags: ["banners"], revalidate: 300 }
  )();
}

async function getActiveBannersUncached(ubicacion?: string) {
  const now = new Date();
  return prisma.banner.findMany({
    where: {
      activo: true,
      vigencia_desde: { lte: now },
      OR: [{ vigencia_hasta: null }, { vigencia_hasta: { gte: now } }],
      ...(ubicacion ? { ubicacion } : {}),
    },
    orderBy: [{ orden: "asc" }, { id_banner: "asc" }],
  });
}

export async function getCategoryBySlugPath(slugs: string[]) {
  if (!slugs.length) return null;
  return unstable_cache(
    () => getCategoryBySlugPathUncached(slugs),
    ["category-by-path", slugs.join("/")],
    { tags: ["categories"], revalidate: 3600 }
  )();
}

async function getCategoryBySlugPathUncached(slugs: string[]) {
  if (!slugs.length) return null;

  // Prefer exact hierarchical match
  let parentId: number | null = null;
  let found = null;
  let hierarchicalOk = true;
  for (const slug of slugs) {
    found = await prisma.categoria.findFirst({
      where: {
        slug,
        ...(parentId == null ? {} : { id_cat_superior: parentId }),
      },
      include: { subcategorias: { orderBy: { nombre: "asc" } } },
    });
    if (!found) {
      hierarchicalOk = false;
      break;
    }
    parentId = found.id_categoria;
  }
  if (hierarchicalOk && found) return found;

  // Fallback: match deepest slug regardless of parent (Odoo paths may differ from web)
  const last = slugs[slugs.length - 1];
  const byLast = await prisma.categoria.findFirst({
    where: { slug: last },
    include: { subcategorias: { orderBy: { nombre: "asc" } } },
  });
  if (byLast) return byLast;

  // Fallback: Woo-style path → Odoo flat slug (accesorios/fundas-y-cobertores → accesorios-fundas-y-cobertores)
  return prisma.categoria.findFirst({
    where: { slug: slugs.join("-") },
    include: { subcategorias: { orderBy: { nombre: "asc" } } },
  });
}

export async function getMegaMenuCategories() {
  return prisma.categoria.findMany({
    where: { nivel: 1 },
    orderBy: { nombre: "asc" },
    take: 12,
    select: {
      id_categoria: true,
      nombre: true,
      slug: true,
      subcategorias: {
        orderBy: { nombre: "asc" },
        take: 20,
        select: { id_categoria: true, nombre: true, slug: true },
      },
    },
  });
}

export async function getCategoryTree() {
  return prisma.categoria.findMany({
    orderBy: [{ nivel: "asc" }, { nombre: "asc" }],
  });
}

export async function getCategoryAndDescendantIds(rootId: number): Promise<number[]> {
  const all = await getCategoryEdges();
  const ids = new Set<number>([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const c of all) {
      if (c.id_cat_superior != null && ids.has(c.id_cat_superior) && !ids.has(c.id_categoria)) {
        ids.add(c.id_categoria);
        changed = true;
      }
    }
  }
  return [...ids];
}

/** Parsea query params c{id}=valor y c{id}_min / c{id}_max */
export function parseCharacteristicFilters(
  params: Record<string, string | string[] | undefined>,
  defs: CharacteristicFilterDef[]
): AppliedCharacteristicFilter[] {
  const applied: AppliedCharacteristicFilter[] = [];

  for (const def of defs) {
    if (def.tipo === "cualitativo") {
      const key = `c${def.id_caracteristica}`;
      const raw = params[key];
      const valores = (Array.isArray(raw) ? raw : raw ? [raw] : [])
        .map((v) => String(v).trim())
        .filter(Boolean)
        .filter((v) => def.valores.includes(v));
      if (valores.length) {
        applied.push({
          id_caracteristica: def.id_caracteristica,
          tipo: "cualitativo",
          valores,
        });
      }
    } else {
      const minRaw = params[`c${def.id_caracteristica}_min`];
      const maxRaw = params[`c${def.id_caracteristica}_max`];
      const minStr = Array.isArray(minRaw) ? minRaw[0] : minRaw;
      const maxStr = Array.isArray(maxRaw) ? maxRaw[0] : maxRaw;
      const min = minStr != null && minStr !== "" ? Number(minStr) : undefined;
      const max = maxStr != null && maxStr !== "" ? Number(maxStr) : undefined;
      if ((min != null && !Number.isNaN(min)) || (max != null && !Number.isNaN(max))) {
        applied.push({
          id_caracteristica: def.id_caracteristica,
          tipo: "numerico",
          min: min != null && !Number.isNaN(min) ? min : undefined,
          max: max != null && !Number.isNaN(max) ? max : undefined,
        });
      }
    }
  }

  return applied;
}

export { pickCurrentPrice, pickCurrentPriceInfo };
