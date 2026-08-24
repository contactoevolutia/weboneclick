import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CategoryShopListing } from "@/components/category-shop-listing";
import { PromoShopListing } from "@/components/promo-shop-listing";
import { getCategoryBySlugPath } from "@/lib/products";
import { getPromoBySlug } from "@/lib/promos";
import {
  listingSeoFromSearchParams,
  pageMetadata,
} from "@/lib/seo/build-metadata";
import { getSeoPageContent } from "@/lib/seo/pages-content";

type Params = Promise<{ path: string[] }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const RESERVED = new Set([
  "shop",
  "producto",
  "marca",
  "etiqueta",
  "familia",
  "group",
  "beneficio",
  "tarjeta-adherida",
  "carrito",
  "checkout",
  "catalogo",
  "contacto",
  "cuenta",
  "admin",
  "api",
  "mi-cuenta",
  "lista-deseos",
  "finalizar-compra",
  "ocbeneficios",
  "tiendas",
  "nosotros",
  "faqs",
  "empresas",
  "servicio-tecnico",
  "reemplazo-de-pantalla-o-bateria",
  "programas-de-calidad",
  "programa-exchange",
]);

function withTitleSuffix(title: string, suffix: string): string {
  if (!suffix) return title;
  const parts = title.split(" | ");
  if (parts.length > 1) {
    parts[0] = `${parts[0]}${suffix}`;
    return parts.join(" | ");
  }
  return `${title}${suffix}`;
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}): Promise<Metadata> {
  const { path } = await params;
  const sp = await searchParams;
  if (!path?.length || RESERVED.has(path[0])) return {};

  const basePath = `/${path.join("/")}`;
  const listing = listingSeoFromSearchParams(basePath, sp);

  if (path.length === 1) {
    const promo = await getPromoBySlug(path[0]);
    if (promo) {
      return pageMetadata({
        title: withTitleSuffix(`${promo.nombre} | OneClick`, listing.titleSuffix),
        description: promo.subtitulo || `Promoción ${promo.nombre} en OneClick.`,
        path: basePath,
        canonicalPath: listing.canonicalPath,
        robots: listing.robots,
      });
    }
  }

  const category = await getCategoryBySlugPath(path);
  if (!category) return {};

  const seo = path.length === 1 ? getSeoPageContent(basePath) : undefined;
  const title = withTitleSuffix(
    seo?.title ?? `${category.nombre} | OneClick Argentina`,
    listing.titleSuffix
  );
  const description =
    seo?.description ??
    `Comprá ${category.nombre} en OneClick, Apple Premium Reseller Argentina. Garantía oficial, financiación y envío a todo el país.`;

  return pageMetadata({
    title,
    description,
    path: basePath,
    canonicalPath: listing.canonicalPath,
    robots: listing.robots,
  });
}

export default async function CategoryCatchAllPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { path } = await params;
  const sp = await searchParams;

  if (!path?.length || RESERVED.has(path[0])) notFound();

  if (path.length === 1) {
    const promo = await getPromoBySlug(path[0]);
    if (promo) {
      return <PromoShopListing promo={promo} searchParams={sp} />;
    }
  }

  const category = await getCategoryBySlugPath(path);
  if (!category) notFound();

  return (
    <CategoryShopListing category={category} path={path} searchParams={sp} />
  );
}
