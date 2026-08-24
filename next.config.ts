import type { NextConfig } from "next";

/**
 * Auth.js pone cookies `__Host-*` atadas al host. Si AUTH_URL es apex
 * (oneclickstore.com) y el usuario entra por www, el callback OAuth pierde
 * las cookies → error=Configuration. Forzamos un solo host canónico.
 */
function hostCanonicalRedirects() {
  const raw = (process.env.AUTH_URL || process.env.NEXT_PUBLIC_SITE_URL || "").trim();
  if (!raw) return [];

  let canonical: URL;
  try {
    canonical = new URL(raw);
  } catch {
    return [];
  }

  const host = canonical.hostname;
  if (!host || host === "localhost" || host.startsWith("127.")) return [];

  const other = host.startsWith("www.") ? host.slice(4) : `www.${host}`;
  if (!other || other === host) return [];

  return [
    {
      source: "/:path*",
      has: [{ type: "host" as const, value: other }],
      destination: `${canonical.origin}/:path*`,
      permanent: true,
    },
  ];
}

const nextConfig: NextConfig = {
  // Sin "standalone": Hostinger Node Apps usa `next start -p $PORT`.
  experimental: {
    serverActions: {
      // PDFs fiscales (p. ej. legajos) suelen superar el default de 1 MB.
      bodySizeLimit: "10mb",
    },
  },
  async redirects() {
    return [
      ...hostCanonicalRedirects(),
      // Aliases legacy → permanentes (308). Antes eran redirect() 307 en page stubs.
      { source: "/catalogo", destination: "/shop", permanent: true },
      { source: "/catalogo/:path*", destination: "/shop", permanent: true },
      { source: "/finalizar-compra", destination: "/checkout", permanent: true },
      { source: "/finalizar-compra/:path*", destination: "/checkout", permanent: true },
      { source: "/mi-cuenta", destination: "/cuenta", permanent: true },
      { source: "/mi-cuenta/:path*", destination: "/cuenta", permanent: true },
    ];
  },
};

export default nextConfig;
