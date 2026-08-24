import {
  absoluteUrl,
  ORG_EMAIL,
  ORG_PHONE,
  SITE_LEGAL_NAME,
  SITE_NAME,
  SITE_URL,
  SOCIAL_SAME_AS,
} from "./site";
import type { TiendaSeed } from "@/lib/tiendas-data";

export type JsonLd = Record<string, unknown>;

export function organizationJsonLd(): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${SITE_URL}/#organization`,
    name: SITE_LEGAL_NAME,
    alternateName: SITE_NAME,
    url: SITE_URL,
    logo: absoluteUrl("/oneclick/logo.svg"),
    email: ORG_EMAIL,
    telephone: ORG_PHONE,
    sameAs: [...SOCIAL_SAME_AS],
  };
}

export function websiteJsonLd(): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    name: SITE_NAME,
    url: SITE_URL,
    publisher: { "@id": `${SITE_URL}/#organization` },
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${SITE_URL}/shop?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

export function breadcrumbJsonLd(
  items: { name: string; path: string }[]
): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: absoluteUrl(it.path),
    })),
  };
}

export type ProductOfferInput = {
  name: string;
  description?: string;
  slug: string;
  sku?: string | null;
  image?: string | null;
  brandName?: string | null;
  price: number | null;
  inStock: boolean;
  /** Outlet / open box */
  refurbished?: boolean;
};

export function productJsonLd(p: ProductOfferInput): JsonLd {
  const url = absoluteUrl(`/producto/${p.slug}`);
  const offer: JsonLd = {
    "@type": "Offer",
    url,
    priceCurrency: "ARS",
    availability: p.inStock
      ? "https://schema.org/InStock"
      : "https://schema.org/OutOfStock",
    itemCondition: p.refurbished
      ? "https://schema.org/RefurbishedCondition"
      : "https://schema.org/NewCondition",
    seller: { "@id": `${SITE_URL}/#organization` },
  };
  if (p.price != null && Number.isFinite(p.price)) {
    offer.price = Number(p.price.toFixed(2));
  }

  const ld: JsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    url,
    description: p.description || undefined,
    sku: p.sku || undefined,
    image: p.image ? [absoluteUrl(p.image)] : undefined,
    brand: p.brandName
      ? { "@type": "Brand", name: p.brandName }
      : { "@type": "Brand", name: "Apple" },
    offers: offer,
  };
  return ld;
}

export function faqPageJsonLd(
  items: { question: string; answer: string }[]
): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((it) => ({
      "@type": "Question",
      name: it.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: it.answer,
      },
    })),
  };
}

export function howToJsonLd(name: string, steps: string[]): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name,
    step: steps.map((text, i) => ({
      "@type": "HowToStep",
      position: i + 1,
      name: `Paso ${i + 1}`,
      text,
    })),
  };
}

function parseOpeningHours(lines: string[]): string[] {
  // Rough mapping; schema expects OpeningHoursSpecification or simple strings.
  // Keep as text description via openingHours for simplicity.
  return lines.filter(Boolean);
}

export function localBusinessJsonLd(tienda: TiendaSeed): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "Store",
    "@id": `${SITE_URL}/tiendas#${tienda.slug}`,
    name: `OneClick ${tienda.nombre_mapa}`,
    image: absoluteUrl(tienda.imagen),
    url: `${SITE_URL}/tiendas`,
    telephone: tienda.telefono,
    email: tienda.email,
    address: {
      "@type": "PostalAddress",
      streetAddress: tienda.direccion_corta || tienda.direccion,
      addressLocality: tienda.localidad,
      addressRegion: tienda.provincia,
      postalCode: tienda.codigo_postal,
      addressCountry: "AR",
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: tienda.latitud,
      longitude: tienda.longitud,
    },
    openingHours: parseOpeningHours(tienda.horario_ventas),
    parentOrganization: { "@id": `${SITE_URL}/#organization` },
  };
}

export function itemListJsonLd(
  items: { name: string; path: string }[]
): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      url: absoluteUrl(it.path),
    })),
  };
}
