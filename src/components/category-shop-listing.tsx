import Link from "next/link";
import { JsonLdScript } from "@/components/json-ld";
import { ProductCard } from "@/components/product-card";
import { ShopSidebar } from "@/components/shop-sidebar";
import { ShopToolbar } from "@/components/shop-toolbar";
import { buildShopHref, type ShopQuery } from "@/lib/shop-query";
import {
  getActiveProducts,
  getShopFacets,
  resolveCategoryFilterIdsBySlug,
  resolveCategoryProductIds,
  type ShopOrder,
} from "@/lib/products";
import { prisma } from "@/lib/prisma";
import { getDescuentoContadoConfig } from "@/lib/parametros";
import { breadcrumbJsonLd, itemListJsonLd } from "@/lib/seo/json-ld";

function param(sp: Record<string, string | string[] | undefined>, key: string) {
  const v = sp[key];
  return typeof v === "string" ? v : undefined;
}

function parseOrder(raw?: string): ShopOrder {
  if (
    raw === "mas-vendidos" ||
    raw === "precio-asc" ||
    raw === "precio-desc" ||
    raw === "nombre" ||
    raw === "ultimos"
  ) {
    return raw;
  }
  return "mas-vendidos";
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

type CategoryRef = {
  id_categoria: number;
  nombre: string;
  slug: string;
};

type Props = {
  category: CategoryRef;
  /** URL path segments, e.g. ["mac"] or ["mac", "macbook-air"] */
  path: string[];
  searchParams: Record<string, string | string[] | undefined>;
};

/** Listado de categoría con sidebar de filtros (precio, categoría, marca). */
export async function CategoryShopListing({ category, path, searchParams }: Props) {
  const basePath = `/${path.join("/")}`;
  const query: ShopQuery = {
    q: param(searchParams, "q"),
    cat: param(searchParams, "cat"),
    marca: param(searchParams, "marca"),
    min: param(searchParams, "min"),
    max: param(searchParams, "max"),
    stock: param(searchParams, "stock"),
    orden: param(searchParams, "orden"),
    page: param(searchParams, "page"),
  };

  const page = Math.max(1, Number(query.page || 1) || 1);
  const take = 20;
  const skip = (page - 1) * take;
  const orden = parseOrder(query.orden);
  const minPrice = query.min != null && query.min !== "" ? Number(query.min) : undefined;
  const maxPrice = query.max != null && query.max !== "" ? Number(query.max) : undefined;

  const categoryIds = await resolveCategoryProductIds(category.id_categoria);

  const [facets, catFilter, marca, descuentoContado, pathCats] = await Promise.all([
    getShopFacets({ ids: categoryIds }),
    query.cat ? resolveCategoryFilterIdsBySlug(query.cat) : Promise.resolve(null),
    query.marca
      ? prisma.marca.findUnique({
          where: { slug: query.marca },
          select: { id_marca: true, nombre: true },
        })
      : Promise.resolve(null),
    getDescuentoContadoConfig(),
    prisma.categoria.findMany({
      where: { slug: { in: path } },
      select: { slug: true, nombre: true },
    }),
  ]);

  const catBySlug = new Map(pathCats.map((c) => [c.slug, c.nombre]));

  const { items, total } = await getActiveProducts({
    ids: categoryIds,
    q: query.q,
    categoriaId: catFilter?.id,
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

  const h1 = category.nombre;

  const crumbItems = [
    { name: "Inicio", path: "/" },
    ...path.map((slug, i) => ({
      name: catBySlug.get(slug) || slug,
      path: `/${path.slice(0, i + 1).join("/")}`,
    })),
  ];

  return (
    <div className="oc-shop-page">
      <JsonLdScript
        data={[
          breadcrumbJsonLd(crumbItems),
          itemListJsonLd(
            items.map((p) => ({ name: p.titulo, path: `/producto/${p.slug}` }))
          ),
        ]}
      />
      <div className="container">
        <div className="oc-page-header">
          <nav className="oc-breadcrumb" aria-label="Breadcrumb">
            {crumbItems.map((c, i) => (
              <span key={c.path} className="oc-breadcrumb-item">
                {i > 0 ? <span>/</span> : null}
                {i < crumbItems.length - 1 ? (
                  <Link href={c.path}>{c.name}</Link>
                ) : (
                  <span>{c.name}</span>
                )}
              </span>
            ))}
          </nav>
          <h1>{h1}</h1>
        </div>

        <div className="oc-shop-layout">
          <ShopSidebar facets={facets} query={query} basePath={basePath} />

          <div className="oc-shop-main">
            <ShopToolbar
              query={query}
              from={from}
              to={to}
              total={total}
              basePath={basePath}
            />

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
                  <Link href={buildShopHref(query, { page: String(page - 1) }, basePath)}>
                    ←
                  </Link>
                )}
                {pageNumbers.map((n, i) =>
                  n === "…" ? (
                    <span key={`e-${i}`} className="oc-shop-pagination-ellipsis">
                      …
                    </span>
                  ) : (
                    <Link
                      key={n}
                      href={buildShopHref(query, { page: String(n) }, basePath)}
                      className={n === page ? "is-active" : undefined}
                      aria-current={n === page ? "page" : undefined}
                    >
                      {n}
                    </Link>
                  )
                )}
                {page < pages && (
                  <Link href={buildShopHref(query, { page: String(page + 1) }, basePath)}>
                    →
                  </Link>
                )}
              </nav>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
