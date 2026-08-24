import type { Metadata } from "next";
import Link from "next/link";
import { ProductCard } from "@/components/product-card";
import { ShopSidebar } from "@/components/shop-sidebar";
import { ShopToolbar } from "@/components/shop-toolbar";
import { buildShopHref, type ShopQuery } from "@/lib/shop-query";
import {
  getActiveProducts,
  getShopFacets,
  resolveCategoryFilterIdsBySlug,
  type ShopOrder,
} from "@/lib/products";
import { prisma } from "@/lib/prisma";
import { getDescuentoContadoConfig } from "@/lib/parametros";
import {
  listingSeoFromSearchParams,
  pageMetadata,
} from "@/lib/seo/build-metadata";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function param(sp: Record<string, string | string[] | undefined>, key: string) {
  const v = sp[key];
  return typeof v === "string" ? v : undefined;
}

function parseOrder(raw?: string): ShopOrder {
  if (raw === "precio-asc" || raw === "precio-desc" || raw === "nombre" || raw === "ultimos") {
    return raw;
  }
  return "ultimos";
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const sp = await searchParams;
  const listing = listingSeoFromSearchParams("/shop", sp);
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const baseTitle = q ? `Buscar “${q}”` : "Tienda Apple y Audio";
  return pageMetadata({
    title: `${baseTitle}${listing.titleSuffix} | OneClick`,
    description:
      "Explorá el catálogo completo de OneClick: iPhone, Mac, iPad, AirPods, Apple Watch, JBL y accesorios con garantía oficial.",
    path: "/shop",
    canonicalPath: listing.canonicalPath,
    robots: listing.robots,
  });
}

export default async function ShopPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const query: ShopQuery = {
    q: param(sp, "q"),
    cat: param(sp, "cat"),
    marca: param(sp, "marca"),
    min: param(sp, "min"),
    max: param(sp, "max"),
    stock: param(sp, "stock"),
    orden: param(sp, "orden"),
    page: param(sp, "page"),
  };

  const page = Math.max(1, Number(query.page || 1) || 1);
  const take = 20;
  const skip = (page - 1) * take;
  const orden = parseOrder(query.orden);
  const minPrice = query.min != null && query.min !== "" ? Number(query.min) : undefined;
  const maxPrice = query.max != null && query.max !== "" ? Number(query.max) : undefined;

  const [facets, category, marca, descuentoContado] = await Promise.all([
    getShopFacets(),
    query.cat ? resolveCategoryFilterIdsBySlug(query.cat) : Promise.resolve(null),
    query.marca
      ? prisma.marca.findUnique({
          where: { slug: query.marca },
          select: { id_marca: true, nombre: true },
        })
      : Promise.resolve(null),
    getDescuentoContadoConfig(),
  ]);

  const { items, total } = await getActiveProducts({
    q: query.q,
    categoriaId: category?.id,
    marcaId: marca?.id_marca,
    take,
    skip,
    order: orden,
    minPrice: Number.isFinite(minPrice) ? minPrice : undefined,
    maxPrice: Number.isFinite(maxPrice) ? maxPrice : undefined,
    inStockOnly: query.stock === "1",
  });

  const pages = Math.max(1, Math.ceil(total / take));
  const from = total === 0 ? 0 : skip + 1;
  const to = Math.min(skip + items.length, total);

  const pageNumbers = paginationWindow(page, pages);

  return (
    <div className="oc-shop-page">
      <div className="container">
        <div className="oc-page-header">
          <nav className="oc-breadcrumb">
            <Link href="/">Inicio</Link>
            <span>/</span>
            <span>Tienda</span>
            {category && (
              <>
                <span>/</span>
                <span>{category.nombre}</span>
              </>
            )}
          </nav>
          <h1>Tienda</h1>
        </div>

        <div className="oc-shop-layout">
          <ShopSidebar facets={facets} query={query} />

          <div className="oc-shop-main">
            <ShopToolbar query={query} from={from} to={to} total={total} />

            <div className="oc-product-grid">
              {items.map((p) => (
                <ProductCard
                  key={p.id_producto}
                  product={p}
                  descuentoContado={descuentoContado}
                />
              ))}
            </div>

            {!items.length && (
              <p className="oc-shop-empty">No hay productos para mostrar con estos filtros.</p>
            )}

            {pages > 1 && (
              <nav className="oc-shop-pagination" aria-label="Paginación">
                {page > 1 && (
                  <Link href={buildShopHref(query, { page: String(page - 1) })}>←</Link>
                )}
                {pageNumbers.map((n, i) =>
                  n === "…" ? (
                    <span key={`e-${i}`} className="oc-shop-pagination-ellipsis">
                      …
                    </span>
                  ) : (
                    <Link
                      key={n}
                      href={buildShopHref(query, { page: String(n) })}
                      className={n === page ? "is-active" : undefined}
                      aria-current={n === page ? "page" : undefined}
                    >
                      {n}
                    </Link>
                  )
                )}
                {page < pages && (
                  <Link href={buildShopHref(query, { page: String(page + 1) })}>→</Link>
                )}
              </nav>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function paginationWindow(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const items: (number | "…")[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) items.push("…");
  for (let n = start; n <= end; n++) items.push(n);
  if (end < total - 1) items.push("…");
  items.push(total);
  return items;
}
