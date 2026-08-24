import type { Metadata } from "next";
import { absoluteUrl, DEFAULT_OG_IMAGE, SITE_NAME, SITE_URL } from "./site";

export type PageMetadataInput = {
  title: string;
  description: string;
  /** Pathname sin query, p.ej. /iphone o /producto/foo */
  path: string;
  image?: string | null;
  /** Si true (default), title se usa como absolute (no aplica template %s | OneClick). */
  absoluteTitle?: boolean;
  robots?: Metadata["robots"];
  /** Canonical override (pathname o URL). Default = path. */
  canonicalPath?: string;
};

export function pageMetadata({
  title,
  description,
  path,
  image,
  absoluteTitle = true,
  robots,
  canonicalPath,
}: PageMetadataInput): Metadata {
  const canonical = absoluteUrl(canonicalPath ?? path);
  const ogImage = absoluteUrl(image || DEFAULT_OG_IMAGE);

  return {
    metadataBase: new URL(SITE_URL),
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: { canonical },
    robots: robots ?? { index: true, follow: true },
    openGraph: {
      type: "website",
      locale: "es_AR",
      url: canonical,
      siteName: SITE_NAME,
      title,
      description,
      images: [{ url: ogImage, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}

/** Params de faceta/orden que disparan noindex (no incluye page). */
const FACET_KEYS = ["q", "cat", "marca", "min", "max", "stock", "orden"] as const;

export type ListingSearchParams = Record<string, string | string[] | undefined>;

function firstParam(sp: ListingSearchParams, key: string): string | undefined {
  const v = sp[key];
  return typeof v === "string" ? v : Array.isArray(v) ? v[0] : undefined;
}

export type ListingSeoDecision = {
  /** Canonical pathname+query (solo page si aplica). */
  canonicalPath: string;
  robots: Metadata["robots"];
  /** Sufijo de title para paginación, p.ej. " — Página 2" */
  titleSuffix: string;
  page: number;
  isFiltered: boolean;
};

/**
 * Reglas §6b:
 * - limpia / page=1 → index + canonical limpio
 * - page>1 → index + self-canonical ?page=N + sufijo title
 * - facetas/orden → noindex,follow + canonical limpio
 */
export function listingSeoFromSearchParams(
  basePath: string,
  searchParams: ListingSearchParams
): ListingSeoDecision {
  const cleanBase = basePath.replace(/\/$/, "") || "/";
  const pageRaw = firstParam(searchParams, "page");
  const page = Math.max(1, Number(pageRaw || 1) || 1);

  const isFiltered = FACET_KEYS.some((k) => {
    const v = firstParam(searchParams, k);
    return v != null && String(v).trim() !== "";
  });

  if (isFiltered) {
    return {
      canonicalPath: cleanBase,
      robots: { index: false, follow: true },
      titleSuffix: "",
      page,
      isFiltered: true,
    };
  }

  if (page > 1) {
    return {
      canonicalPath: `${cleanBase}?page=${page}`,
      robots: { index: true, follow: true },
      titleSuffix: ` — Página ${page}`,
      page,
      isFiltered: false,
    };
  }

  return {
    canonicalPath: cleanBase,
    robots: { index: true, follow: true },
    titleSuffix: "",
    page: 1,
    isFiltered: false,
  };
}

export const NOINDEX_ROBOTS: Metadata["robots"] = { index: false, follow: false };
export const NOINDEX_FOLLOW_ROBOTS: Metadata["robots"] = { index: false, follow: true };
