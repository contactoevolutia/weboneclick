import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PromoShopListing } from "@/components/promo-shop-listing";
import { getPromoBySlug } from "@/lib/promos";
import {
  listingSeoFromSearchParams,
  pageMetadata,
} from "@/lib/seo/build-metadata";
import { SEO_PAGES } from "@/lib/seo/pages-content";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const outletSeo = SEO_PAGES["/outlet"];

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const sp = await searchParams;
  const listing = listingSeoFromSearchParams("/outlet", sp);
  const title = listing.titleSuffix
    ? outletSeo.title.replace(" | ", `${listing.titleSuffix} | `)
    : outletSeo.title;
  return pageMetadata({
    title,
    description: outletSeo.description,
    path: "/outlet",
    canonicalPath: listing.canonicalPath,
    robots: listing.robots,
  });
}

export default async function OutletPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const promo = await getPromoBySlug("outlet-promo");
  if (!promo) notFound();

  return <PromoShopListing promo={promo} searchParams={sp} basePath="/outlet" />;
}
