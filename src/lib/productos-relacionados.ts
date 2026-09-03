import { prisma } from "@/lib/prisma";
import { getActiveProducts, type ProductListItem } from "@/lib/products";

/** Tipos de relación producto ↔ producto (cross-sell desde Odoo). */
export const TIPO_RELACION_ACCESORIO = "accesorio" as const;

export type TipoRelacionProducto = typeof TIPO_RELACION_ACCESORIO;

const MAX_RELATED = 8;

/** IDs de productos relacionados (accesorios Odoo), respetando el orden de la tabla. */
export async function getRelatedProductIds(
  id_producto: number,
  take = MAX_RELATED
): Promise<number[]> {
  const relaciones = await prisma.productos_relacionados.findMany({
    where: {
      id_producto,
      tipo_relacion: TIPO_RELACION_ACCESORIO,
      id_producto_relacionado: { not: id_producto },
    },
    orderBy: { orden: "asc" },
    select: { id_producto_relacionado: true },
    take,
  });
  return relaciones.map((r) => r.id_producto_relacionado);
}

/** Productos activos relacionados para listados (PDP, etc.). */
export async function getRelatedProductsForPdp(
  id_producto: number,
  take = MAX_RELATED
): Promise<ProductListItem[]> {
  const relatedIds = await getRelatedProductIds(id_producto, take);
  if (!relatedIds.length) return [];

  const { items } = await getActiveProducts({
    ids: relatedIds,
    take: Math.min(take, relatedIds.length),
  });
  const byId = new Map(items.map((p) => [p.id_producto, p]));
  return relatedIds
    .map((id) => byId.get(id))
    .filter((p): p is ProductListItem => p != null)
    .slice(0, take);
}
