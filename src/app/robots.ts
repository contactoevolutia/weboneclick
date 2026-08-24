import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo/site";

const AI_BOTS = [
  "GPTBot",
  "ClaudeBot",
  "Google-Extended",
  "Applebot-Extended",
] as const;

const DISALLOW = [
  "/admin",
  "/api",
  "/carrito",
  "/checkout",
  "/cuenta",
  "/mi-cuenta",
  "/lista-deseos",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: DISALLOW,
      },
      ...AI_BOTS.map((userAgent) => ({
        userAgent,
        allow: "/" as const,
      })),
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
