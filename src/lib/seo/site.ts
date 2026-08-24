/** Site-wide SEO constants for oneclickstore.com */

export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.AUTH_URL ||
  "https://oneclickstore.com"
)
  .trim()
  .replace(/\/$/, "");

export const SITE_NAME = "OneClick";
export const SITE_LEGAL_NAME = "OneClick — Apple Premium Reseller Argentina";

export const DEFAULT_TITLE = "OneClick — Apple Premium Reseller Argentina | Tienda Oficial";
export const DEFAULT_DESCRIPTION =
  "Tienda oficial Apple en Argentina. iPhone, Mac, iPad, AirPods y Apple Watch con garantía oficial, financiación y envío a todo el país. 6 sucursales.";

export const DEFAULT_OG_IMAGE = "/opengraph-image";

export const SOCIAL_SAME_AS = [
  "https://www.instagram.com/oneclickarg/",
  "https://www.facebook.com/oneclickarg/",
  "https://www.linkedin.com/company/oneclick-store-argentina/",
  "https://www.youtube.com/channel/UCMsgXUs_cV622LcAwzLghhA",
] as const;

export const ORG_PHONE = "+54-0800-345-1663";
export const ORG_EMAIL = "info@oneclickstore.com";

export function absoluteUrl(path: string): string {
  if (!path) return SITE_URL;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
