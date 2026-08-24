/**
 * Genera / amplía `src/lib/seo/legacy-redirects.ts` matcheando URLs legacy
 * contra productos activos (slug / título).
 *
 * Uso:
 *   npx tsx scripts/build-legacy-redirects.ts
 *
 * Lee `data/legacy-urls.txt` (pathnames o URLs completas).
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const ROOT = resolve(__dirname, "..");
const INPUT = resolve(ROOT, "data/legacy-urls.txt");
const OUTPUT = resolve(ROOT, "src/lib/seo/legacy-redirects.ts");

function normalizeSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function toPathname(line: string): string | null {
  const t = line.trim();
  if (!t || t.startsWith("#")) return null;
  try {
    if (t.startsWith("http://") || t.startsWith("https://")) {
      return new URL(t).pathname;
    }
  } catch {
    return null;
  }
  return t.startsWith("/") ? t : `/${t}`;
}

function stripTrailingSlash(p: string): string {
  if (p.length > 1 && p.endsWith("/")) return p.slice(0, -1);
  return p;
}

function extractProductSlug(pathname: string): string | null {
  const m = pathname.match(/^\/producto\/([^/?#]+)/i);
  return m ? decodeURIComponent(m[1]) : null;
}

function scoreMatch(legacySlug: string, productSlug: string, titulo: string): number {
  const L = normalizeSlug(legacySlug);
  const S = normalizeSlug(productSlug);
  const T = normalizeSlug(titulo);

  if (S === L) return 100;
  if (S.endsWith(`-${L}`) || S.includes(`-${L}-`)) return 90;
  if (S.includes(L) && L.length >= 8) return 80;
  if (T === L) return 70;
  if (T.includes(L) && L.length >= 8) return 60;

  // token overlap
  const lTokens = new Set(L.split("-").filter((t) => t.length > 2));
  const sTokens = S.split("-").filter((t) => t.length > 2);
  if (!lTokens.size) return 0;
  let hit = 0;
  for (const t of sTokens) if (lTokens.has(t)) hit++;
  const ratio = hit / lTokens.size;
  if (ratio >= 0.85 && hit >= 3) return Math.round(50 * ratio);
  return 0;
}

async function main() {
  if (!existsSync(INPUT)) {
    console.error(`No existe ${INPUT}`);
    process.exit(1);
  }

  const lines = readFileSync(INPUT, "utf8").split(/\r?\n/);
  const pathnames = [
    ...new Set(
      lines
        .map(toPathname)
        .filter((p): p is string => Boolean(p))
        .map((p) => stripTrailingSlash(p.toLowerCase()))
    ),
  ];

  const products = await prisma.producto.findMany({
    where: { activo: true },
    select: {
      slug: true,
      titulo: true,
      categorias: {
        include: { categoria: { select: { slug: true, id_cat_superior: true } } },
        take: 1,
      },
    },
  });

  const redirects: Record<string, string> = {
    "/catalogo": "/shop",
    "/finalizar-compra": "/checkout",
    "/mi-cuenta": "/cuenta",
  };
  const fallbacks: Record<string, string> = {};
  let matched = 0;
  let unmatched = 0;

  for (const path of pathnames) {
    if (redirects[path]) continue;

    const productSlug = extractProductSlug(path);
    if (!productSlug) {
      // category-like paths: if exact category slug exists as /{slug}, keep for manual review
      continue;
    }

    let best: { slug: string; score: number; cat?: string } | null = null;
    for (const p of products) {
      const score = scoreMatch(productSlug, p.slug, p.titulo);
      if (!best || score > best.score) {
        const cat = p.categorias[0]?.categoria.slug;
        best = { slug: p.slug, score, cat };
      }
    }

    if (best && best.score >= 60) {
      redirects[path] = `/producto/${best.slug}`;
      matched++;
    } else {
      fallbacks[path] = best?.cat ? `/${best.cat}` : "/shop";
      unmatched++;
      console.warn(`Sin match fuerte (${best?.score ?? 0}): ${path}`);
    }
  }

  const file = `/**
 * AUTO-GENERADO por scripts/build-legacy-redirects.ts — no editar a mano salvo overrides.
 * Regenerar: npx tsx scripts/build-legacy-redirects.ts
 *
 * Matched: ${matched} | Fallback: ${unmatched} | Total input: ${pathnames.length}
 */
export const LEGACY_REDIRECTS: Record<string, string> = ${JSON.stringify(redirects, null, 2)};

export const LEGACY_PRODUCT_FALLBACK: Record<string, string> = ${JSON.stringify(fallbacks, null, 2)};

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

export function resolveLegacyRedirect(pathname: string): string | null {
  const key = normalizeLegacyPath(pathname);
  if (LEGACY_REDIRECTS[key]) return LEGACY_REDIRECTS[key];
  if (LEGACY_PRODUCT_FALLBACK[key]) return LEGACY_PRODUCT_FALLBACK[key];
  return null;
}
`;

  writeFileSync(OUTPUT, file, "utf8");
  console.log(`Escrito ${OUTPUT}`);
  console.log(`Matched: ${matched}, fallback: ${unmatched}, input paths: ${pathnames.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
