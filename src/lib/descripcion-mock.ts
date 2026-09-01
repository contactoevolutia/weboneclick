import type { FeatureBlock } from "./product-description";

/**
 * Ajustes de contenido de la descripción para productos de muestra.
 *
 * MOCKUP, mismo criterio que `galeria-mock`: las descripciones bajan de Odoo
 * y a veces traen frases que no van en la ficha del revendedor — remates
 * publicitarios de la marca, referencias a apps propias, etc. Sacarlas de la
 * base no sirve: el próximo `sync-odoo` las vuelve a escribir. El arreglo
 * definitivo es editar el producto en Odoo; hasta entonces se recortan acá.
 *
 * El match es por texto exacto: si Odoo cambia la redacción, la frase vuelve
 * a aparecer en la ficha en vez de romper nada.
 */
const FRASES_A_QUITAR: Record<string, string[]> = {
  "jbltouronem3lttam-auriculares-inalambricos-jbl-tour-one-m3-moca": [
    "Usa la aplicación JBL Headphones para personalizar el sonido y tener un control total sobre todas las funciones de la aplicación.",
    // Spatial 360 y la cancelación de ruido tienen bloque propio más abajo:
    // acá el párrafo de apertura las repetía.
    "El sonido JBL Spatial 360 con seguimiento de cabeza integrado hace que la música y las películas sean aún más envolventes. La cancelación de ruido True Adaptive 2.0 elimina el ruido ambiente en tiempo real para que puedas concentrarte en tu trabajo o en tu lista de reproducción favorita.",
  ],
};

export function limpiarDescripcion(
  slug: string,
  html: string | null | undefined,
): string | null {
  const frases = FRASES_A_QUITAR[slug];
  if (!html) return html ?? null;
  if (!frases) return html;

  let salida = html;
  for (const frase of frases) {
    salida = salida.split(frase).join("");
  }
  // La frase suele cerrar un párrafo: queda un espacio colgando antes del
  // </p>, y a veces el párrafo entero vacío.
  return salida
    .replace(/\s+<\/p>/g, "</p>")
    .replace(/<p>\s*<\/p>/g, "");
}

/**
 * Bloques de características escritos a mano.
 *
 * `parseProductDescription` saca los bloques de la descripción de Odoo, que
 * casi siempre trae uno solo. Los que faltan para completar la plantilla se
 * escriben acá y se agregan a continuación de los parseados, en orden: el
 * primero de esta lista ocupa el bloque siguiente al último que vino de Odoo.
 *
 * Va junto con la foto correspondiente en
 * `uploads/mock/<carpeta>/experiencia/`, que se ordena por nombre — el bloque
 * N se lleva la foto N.
 */
const BLOQUES_EXTRA: Record<string, FeatureBlock[]> = {
  "jbltouronem3lttam-auriculares-inalambricos-jbl-tour-one-m3-moca": [
    {
      title: "Cancelación de ruido True Adaptive 2.0",
      html:
        "<p>Haz desaparecer los ruidos del viento, de la calle y las voces de las " +
        "personas en el trabajo. 8 micrófonos (4 encima y dentro de cada auricular) " +
        "capturan los ruidos ambientales a tu alrededor en tiempo real y los cancelan " +
        "automáticamente invirtiendo su fase, para que apenas escuches nada más que tu " +
        "música. Pero si no quieres perder de vista totalmente tu entorno, utiliza " +
        "Ambient Aware y TalkThru en la aplicación JBL Headphones para personalizar lo " +
        "que quieres oír y cuánto quieres oír.</p>",
    },
    {
      title: "Sonido envolvente JBL Spatial 360 con seguimiento de la cabeza",
      html:
        "<p>Te presentamos JBL Spatial 360. Ya sea para escuchar música, ver " +
        "películas o jugar, el sonido JBL Spatial de última generación es una " +
        "experiencia envolvente más natural, realista y precisa que nunca. Esta " +
        "tecnología permite procesar cualquier contenido estéreo con mucho más " +
        "detalle para generar señales sonoras reflejadas y reverberantes. Crea una " +
        "experiencia de escucha más realista al aplicar parámetros distintos a los " +
        "diferentes rangos de frecuencia.</p>",
    },
  ],
};

export function completarBloques(slug: string, bloques: FeatureBlock[]): FeatureBlock[] {
  const extra = BLOQUES_EXTRA[slug];
  return extra ? [...bloques, ...extra] : bloques;
}
