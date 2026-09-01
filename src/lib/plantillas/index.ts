/**
 * Registro de plantillas de ficha de producto y asignación por producto.
 *
 * Cada plantilla vive en su propio archivo de esta carpeta y declara qué
 * componentes muestra. Acá se resuelve cuál le toca a cada producto.
 *
 * MOCKUP: hoy la asignación es una lista explícita de slugs, para poder ver
 * las plantillas terminadas en productos reales sin tocar el resto del
 * catálogo. El criterio definitivo — por categoría, por un campo en la base o
 * por riqueza de contenido — lo define el cliente más adelante; cuando llegue,
 * se cambia solamente ASIGNACION_POR_SLUG y getPdpTemplate.
 *
 * Lo que no está asignado devuelve "actual": la ficha se renderiza como viene
 * haciéndolo hasta hoy, sin cambios.
 */

import { basica } from "./basica";
import { intermedia } from "./intermedia";
import { premiumSinComparativa } from "./premium-sin-comparativa";
import { premium } from "./premium";
import type { Plantilla, PlantillaId } from "./tipos";

export type { Plantilla, PlantillaId } from "./tipos";

/** "actual" no es una plantilla: es el render histórico de la ficha. */
export type PdpTemplate = PlantillaId | "actual";

export const PLANTILLAS: Record<PlantillaId, Plantilla> = {
  premium,
  "premium-sin-comparativa": premiumSinComparativa,
  intermedia,
  basica,
};

/** Las cuatro, en orden de mayor a menor contenido. */
export const PLANTILLAS_ORDENADAS: Plantilla[] = [
  premium,
  premiumSinComparativa,
  intermedia,
  basica,
];

const ASIGNACION_POR_SLUG: Record<string, PlantillaId> = {
  "mdha4ll-a-macbook-air-13-m5-10cpu-8gpu-16gb-512gb-blanco-estelar-teclado-ingles":
    "premium",
  "mgea4le-a-macbook-pro-16-m5-pro-18cpu-20gpu-24gb-1tb-space-black":
    "premium-sin-comparativa",
  "jbltouronem3lttam-auriculares-inalambricos-jbl-tour-one-m3-moca": "intermedia",
  "63893pg-cable-puregear-1-8-m-usb-a-a-usb-c-blanco": "basica",
};

export function getPdpTemplate(slug: string, esMacbookNeo: boolean): PdpTemplate {
  if (esMacbookNeo) return "premium";
  return ASIGNACION_POR_SLUG[slug] ?? "actual";
}

function definicion(t: PdpTemplate): Plantilla | null {
  return t === "actual" ? null : PLANTILLAS[t];
}

/** Una de las plantillas nuevas; el resto del catálogo usa el render de siempre. */
export function usaPlantillaNueva(t: PdpTemplate): boolean {
  return t !== "actual";
}

export function bloquesCaracteristicas(t: PdpTemplate): number {
  return definicion(t)?.bloquesCaracteristicas ?? 0;
}

export function mostrarSelectoresVariante(t: PdpTemplate): boolean {
  return definicion(t)?.selectoresVariante ?? false;
}

export function mostrarComparativa(t: PdpTemplate): boolean {
  return definicion(t)?.desplegable.comparativa ?? false;
}

export function mostrarAccesorios(t: PdpTemplate): boolean {
  return definicion(t)?.desplegable.accesorios ?? false;
}
