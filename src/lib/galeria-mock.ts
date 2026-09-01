import { readdir } from "fs/promises";
import path from "path";
import { getUploadsRoot } from "./uploads";

/**
 * Fotos de muestra para productos con la galería curada a mano.
 *
 * MOCKUP, mismo criterio que `getMacbookNeoGalleryExtras`: hay productos que
 * en la base traen una sola imagen, así que la galería se dibuja sin carrusel
 * (`ProductGallery` sólo muestra flechas y miniaturas con más de una foto) y
 * los bloques de características de la plantilla se quedan sin imagen.
 *
 * Son dos juegos de fotos distintos, y no se mezclan:
 *
 *   uploads/mock/<carpeta>/              → carrusel: ángulos y vistas del
 *                                          producto sobre fondo limpio.
 *   uploads/mock/<carpeta>/experiencia/  → bloques de abajo: el producto en
 *                                          uso, fotos de contexto.
 *
 * A diferencia de la Neo, acá no se listan los archivos uno por uno: se lee la
 * carpeta y entra lo que haya, en orden alfabético. Alcanza con dejar las
 * fotos numeradas (`01-frente.png`, `02-…`) — sin tocar la base ni volver a
 * este archivo.
 *
 * Cuando el cliente cargue las fotos de verdad en Odoo, esto se borra y la
 * galería vuelve a salir entera de `archivo_producto`.
 */
const CARPETA_POR_SLUG: Record<string, string> = {
  "jbltouronem3lttam-auriculares-inalambricos-jbl-tour-one-m3-moca": "jbl-tour-one-m3",
};

const EXTENSIONES = [".jpg", ".jpeg", ".png", ".webp", ".gif"];

/** Imágenes de una carpeta de mock, ordenadas por nombre. Vacío si no existe. */
async function leerCarpeta(partes: string[]): Promise<string[]> {
  try {
    const archivos = await readdir(path.join(getUploadsRoot(), ...partes));
    return archivos
      .filter((f) => EXTENSIONES.includes(path.extname(f).toLowerCase()))
      .sort((a, b) => a.localeCompare(b, "es", { numeric: true }))
      .map((f) => [...partes, f].join("/"));
  } catch {
    return [];
  }
}

/** El producto tiene su galería armada a mano acá, no en la base. */
export function tieneGaleriaCurada(slug: string): boolean {
  return slug in CARPETA_POR_SLUG;
}

/** Ángulos y vistas para el carrusel, después de la foto principal. */
export async function getGalleryExtras(slug: string): Promise<string[]> {
  const carpeta = CARPETA_POR_SLUG[slug];
  if (!carpeta) return [];
  return leerCarpeta(["mock", carpeta]);
}

/** Fotos de producto en uso, para los bloques de características. */
export async function getExperienceImages(slug: string): Promise<string[]> {
  const carpeta = CARPETA_POR_SLUG[slug];
  if (!carpeta) return [];
  return leerCarpeta(["mock", carpeta, "experiencia"]);
}
