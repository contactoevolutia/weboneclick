import { auth } from "@/auth";
import { canAccessAdminPanel, isAdmin, VENDEDOR_ROLE } from "@/lib/auth-guard";
import { resolveLegacyRedirect } from "@/lib/seo/legacy-redirects";
import { NextResponse } from "next/server";

/**
 * Auth.js usa cookies `__Host-*` (host-only). Si el usuario entra por www y
 * AUTH_URL es apex (o al revés), el callback OAuth pierde las cookies y termina
 * en error=Configuration. Unificamos al origen de AUTH_URL / SITE_URL.
 */
function redirectToCanonicalHost(req: { nextUrl: URL }) {
  const raw = (process.env.AUTH_URL || process.env.NEXT_PUBLIC_SITE_URL || "").trim();
  if (!raw) return null;

  let canonical: URL;
  try {
    canonical = new URL(raw);
  } catch {
    return null;
  }

  const host = canonical.hostname;
  if (!host || host === "localhost" || host.startsWith("127.")) return null;
  if (req.nextUrl.hostname === host) return null;

  const url = new URL(req.nextUrl.href);
  url.protocol = canonical.protocol;
  url.host = canonical.host;
  return NextResponse.redirect(url, 308);
}

export default auth((req) => {
  const canonical = redirectToCanonicalHost(req);
  if (canonical) return canonical;

  const { pathname } = req.nextUrl;

  // Redirects permanentes WooCommerce/legacy (mapa en lib/seo/legacy-redirects).
  // Solo cuando el pathname difiere del destino para evitar loops.
  const legacyTo = resolveLegacyRedirect(pathname);
  if (legacyTo && legacyTo !== pathname.replace(/\/$/, "") && legacyTo !== pathname) {
    const url = req.nextUrl.clone();
    url.pathname = legacyTo;
    url.search = "";
    return NextResponse.redirect(url, 308);
  }

  const isLogin = pathname.startsWith("/admin/login");
  const isAdminPath = pathname.startsWith("/admin");

  if (!isAdminPath || isLogin) {
    return NextResponse.next();
  }

  const role = req.auth?.user?.role;
  if (!req.auth || !canAccessAdminPanel(role)) {
    const url = new URL("/admin/login", req.nextUrl.origin);
    url.searchParams.set("error", "AccessDenied");
    return NextResponse.redirect(url);
  }

  if (isAdmin(role)) {
    return NextResponse.next();
  }

  // Vendedor: solo /admin/ventas*
  const isVentasPath =
    pathname === "/admin/ventas" || pathname.startsWith("/admin/ventas/");
  if (role === VENDEDOR_ROLE && !isVentasPath) {
    return NextResponse.redirect(new URL("/admin/ventas", req.nextUrl.origin));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|woff2?|otf|ttf)$).*)",
  ],
};
