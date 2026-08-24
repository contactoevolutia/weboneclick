/**
 * Mapa de redirects permanentes desde URLs WooCommerce/WordPress legacy
 * hacia las URLs actuales de Next.js.
 *
 * Generar / ampliar con: `npx tsx scripts/build-legacy-redirects.ts`
 * (lee `data/legacy-urls.txt` y matchea contra producto.slug / titulo).
 *
 * Claves: pathname sin trailing slash, lowercase.
 * Valores: pathname destino (también sin trailing slash).
 */
export const LEGACY_REDIRECTS: Record<string, string> = {
  // Aliases internos ya migrados (también declarados en next.config por si el proxy no corre)
  "/catalogo": "/shop",
  "/finalizar-compra": "/checkout",
  "/mi-cuenta": "/cuenta",
};

/** Normaliza pathname para lookup (sin query, sin trailing slash, lowercase). */
export function normalizeLegacyPath(pathname: string): string {
  let p = pathname.trim().toLowerCase();
  try {
    p = decodeURIComponent(p);
  } catch {
    // keep raw
  }
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return p || "/";
}

/**
 * Busca redirect legacy exacto (mapa) o fallback explícito de producto.
 * No redirige productos válidos actuales: solo entradas del mapa.
 */
export function resolveLegacyRedirect(pathname: string): string | null {
  const key = normalizeLegacyPath(pathname);
  if (LEGACY_REDIRECTS[key]) return LEGACY_REDIRECTS[key];
  if (LEGACY_PRODUCT_FALLBACK[key]) return LEGACY_PRODUCT_FALLBACK[key];
  return null;
}

/**
 * Fallbacks específicos producto→categoría cuando no hay match 1:1.
 * Se completa al correr el script de mapeo.
 */
export const LEGACY_PRODUCT_FALLBACK: Record<string, string> = {};
