import type { RegaloTipo } from "@prisma/client";
import type { ResolvedCart } from "@/lib/cart";
import { prisma } from "@/lib/prisma";
import { uploadPublicUrl } from "@/lib/utils";

export function regaloTipoLabel(tipo: RegaloTipo): string {
  switch (tipo) {
    case "monto":
      return "Monto";
    case "sku":
      return "Lista SKU";
    case "categoria":
      return "Categoría";
    default:
      return tipo;
  }
}

export type RegaloProductoOption = {
  id_producto: number;
  titulo: string;
  sku: string | null;
  imagen: string | null;
  odoo_id: number | null;
};

export type RegaloApplicable = {
  id_regalo: number;
  nombre: string;
  tipo: RegaloTipo;
  monto_minimo: number | null;
  productos: RegaloProductoOption[];
};

export type RegaloCartContext = {
  subtotal: number;
  /** id_producto de ítems disponibles en el carrito */
  productIds: number[];
};

export function regaloCartContext(cart: ResolvedCart): RegaloCartContext {
  return {
    subtotal: cart.subtotal,
    productIds: cart.items.filter((i) => i.disponible).map((i) => i.id_producto),
  };
}

function isVigente(
  desde: Date,
  hasta: Date | null,
  now: Date,
): boolean {
  if (desde > now) return false;
  if (hasta && hasta < now) return false;
  return true;
}

function mapProductoOptions(
  productos: Array<{
    producto: {
      id_producto: number;
      titulo: string;
      sku: string | null;
      odoo_id: number | null;
      archivos: Array<{ archivo: { link: string } }>;
    };
  }>,
): RegaloProductoOption[] {
  return productos.map((row) => {
    const link = row.producto.archivos[0]?.archivo.link ?? null;
    return {
      id_producto: row.producto.id_producto,
      titulo: row.producto.titulo,
      sku: row.producto.sku,
      odoo_id: row.producto.odoo_id,
      imagen: link ? uploadPublicUrl(link) : null,
    };
  });
}

async function cartCategoryIds(productIds: number[]): Promise<Set<number>> {
  if (!productIds.length) return new Set();
  const rows = await prisma.categoria_producto.findMany({
    where: { id_producto: { in: productIds } },
    select: { id_categoria: true },
  });
  return new Set(rows.map((r) => r.id_categoria));
}

type RegaloCandidate = Awaited<
  ReturnType<
    typeof prisma.regalo.findMany<{
      include: {
        productos: {
          include: {
            producto: {
              select: {
                id_producto: true;
                titulo: true;
                sku: true;
                odoo_id: true;
                archivos: {
                  where: { archivo: { tipo: "imagen_principal" } };
                  take: 1;
                  select: { archivo: { select: { link: true } } };
                };
              };
            };
          };
        };
        trigger_productos: { select: { id_producto: true } };
        trigger_categorias: { select: { id_categoria: true } };
      };
    }>
  >
>[number];

function regaloQualifies(
  regalo: RegaloCandidate,
  cart: RegaloCartContext,
  cartCategoryIdsSet: Set<number>,
): boolean {
  switch (regalo.tipo) {
    case "monto":
      return (
        regalo.monto_minimo != null &&
        cart.subtotal >= Number(regalo.monto_minimo)
      );
    case "sku":
      return regalo.trigger_productos.some((tp) =>
        cart.productIds.includes(tp.id_producto),
      );
    case "categoria":
      return regalo.trigger_categorias.some((tc) =>
        cartCategoryIdsSet.has(tc.id_categoria),
      );
    default:
      return false;
  }
}

function compareRegaloCandidates(a: RegaloCandidate, b: RegaloCandidate): number {
  if (a.prioridad !== b.prioridad) return b.prioridad - a.prioridad;
  if (a.tipo === "monto" && b.tipo === "monto") {
    const ma = a.monto_minimo != null ? Number(a.monto_minimo) : 0;
    const mb = b.monto_minimo != null ? Number(b.monto_minimo) : 0;
    if (ma !== mb) return mb - ma;
  }
  return b.fecha_creacion.getTime() - a.fecha_creacion.getTime();
}

/**
 * Regla activa vigente que califica según tipo (monto, sku o categoría).
 * Desempate: prioridad desc, monto_minimo desc (solo tipo monto), fecha_creacion desc.
 */
export async function getRegaloApplicable(
  cart: RegaloCartContext,
  now = new Date(),
): Promise<RegaloApplicable | null> {
  if (!(cart.subtotal > 0) || !Number.isFinite(cart.subtotal)) return null;

  const candidates = await prisma.regalo.findMany({
    where: {
      activo: true,
      vigencia_desde: { lte: now },
      OR: [{ vigencia_hasta: null }, { vigencia_hasta: { gte: now } }],
    },
    include: {
      productos: {
        include: {
          producto: {
            select: {
              id_producto: true,
              titulo: true,
              sku: true,
              odoo_id: true,
              archivos: {
                where: { archivo: { tipo: "imagen_principal" } },
                take: 1,
                select: { archivo: { select: { link: true } } },
              },
            },
          },
        },
      },
      trigger_productos: { select: { id_producto: true } },
      trigger_categorias: { select: { id_categoria: true } },
    },
  });

  const vigentes = candidates.filter((r) =>
    isVigente(r.vigencia_desde, r.vigencia_hasta, now),
  );
  if (!vigentes.length) return null;

  const needsCategories = vigentes.some((r) => r.tipo === "categoria");
  const categoryIds = needsCategories
    ? await cartCategoryIds(cart.productIds)
    : new Set<number>();

  const qualifying = vigentes
    .filter((r) => r.productos.length > 0)
    .filter((r) => regaloQualifies(r, cart, categoryIds))
    .sort(compareRegaloCandidates);

  const regalo = qualifying[0];
  if (!regalo) return null;

  const productos = mapProductoOptions(regalo.productos);
  if (!productos.length) return null;

  return {
    id_regalo: regalo.id_regalo,
    nombre: regalo.nombre,
    tipo: regalo.tipo,
    monto_minimo:
      regalo.monto_minimo != null ? Number(regalo.monto_minimo) : null,
    productos,
  };
}

/** Valida que el producto elegido pertenezca al regalo aplicable al carrito. */
export async function resolveSelectedRegaloProducto(
  cart: RegaloCartContext,
  idProductoRegalo: number | null,
): Promise<RegaloProductoOption | null> {
  const regalo = await getRegaloApplicable(cart);
  if (!regalo) {
    if (idProductoRegalo) {
      throw new Error("El carrito ya no califica para un regalo");
    }
    return null;
  }

  if (!idProductoRegalo || idProductoRegalo <= 0) {
    throw new Error("Elegí tu regalo para continuar");
  }

  const selected = regalo.productos.find((p) => p.id_producto === idProductoRegalo);
  if (!selected) {
    throw new Error("El regalo seleccionado no es válido para esta promoción");
  }

  return selected;
}
