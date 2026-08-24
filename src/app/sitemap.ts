import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";
import { SITEMAP_STATIC_PATHS } from "@/lib/seo/pages-content";
import { absoluteUrl } from "@/lib/seo/site";

/**
 * Sitemap de URLs limpias e indexables.
 * Sin lastModified: producto/categoria no tienen timestamps reales.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = SITEMAP_STATIC_PATHS.map((path) => ({
    url: absoluteUrl(path === "/" ? "/" : path),
    changeFrequency: path === "/" ? "daily" : "weekly",
    priority: path === "/" ? 1 : 0.8,
  }));

  const [categorias, productos, marcas, familias] = await Promise.all([
    prisma.categoria.findMany({
      select: { id_categoria: true, slug: true, id_cat_superior: true },
    }),
    prisma.producto.findMany({
      where: { activo: true },
      select: { slug: true },
    }),
    prisma.marca.findMany({
      where: { activo: true },
      select: { slug: true },
    }),
    prisma.familia.findMany({
      where: { activo: true },
      select: { slug: true },
    }),
  ]);

  const byId = new Map(categorias.map((c) => [c.id_categoria, c]));

  function categoryPath(id: number): string {
    const parts: string[] = [];
    let cur = byId.get(id);
    const guard = new Set<number>();
    while (cur && !guard.has(cur.id_categoria)) {
      guard.add(cur.id_categoria);
      parts.unshift(cur.slug);
      cur = cur.id_cat_superior != null ? byId.get(cur.id_cat_superior) : undefined;
    }
    return `/${parts.join("/")}`;
  }

  const staticSet = new Set(SITEMAP_STATIC_PATHS);
  const catEntries: MetadataRoute.Sitemap = categorias
    .map((c) => categoryPath(c.id_categoria))
    .filter((path) => !staticSet.has(path))
    .map((path) => ({
      url: absoluteUrl(path),
      changeFrequency: "daily" as const,
      priority: 0.7,
    }));

  const productEntries: MetadataRoute.Sitemap = productos.map((p) => ({
    url: absoluteUrl(`/producto/${p.slug}`),
    changeFrequency: "daily" as const,
    priority: 0.6,
  }));

  const marcaEntries: MetadataRoute.Sitemap = marcas.map((m) => ({
    url: absoluteUrl(`/marca/${m.slug}`),
    changeFrequency: "weekly" as const,
    priority: 0.5,
  }));

  const familiaEntries: MetadataRoute.Sitemap = familias.map((f) => ({
    url: absoluteUrl(`/familia/${f.slug}`),
    changeFrequency: "weekly" as const,
    priority: 0.5,
  }));

  const seen = new Set<string>();
  const all = [
    ...staticEntries,
    ...catEntries,
    ...productEntries,
    ...marcaEntries,
    ...familiaEntries,
  ];
  return all.filter((e) => {
    if (seen.has(e.url)) return false;
    seen.add(e.url);
    return true;
  });
}
