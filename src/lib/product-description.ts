/**
 * Parte la descripción HTML del producto en las secciones del desplegable.
 *
 * Las descripciones vienen de Odoo con dos formatos reconocibles:
 *
 *   A) <p><strong>Transductores</strong></p><ul><li>70 mm × 2 piezas</li></ul>
 *      — encabezado y valor alternados, bajo "Características generales".
 *
 *   B) <p><strong>Características</strong></p><ul><li>» Marca: mophie</li>…</ul>
 *      — pares clave/valor en una sola lista.
 *
 * Lo que no encaja en ninguno de los dos no se descarta: vuelve como HTML
 * dentro de `specsExtraHtml`, para no perder información por culpa del parser.
 */

export type SpecPair = { key: string; label: string; value: string };

/** Un bloque de características: un subtítulo con su texto. */
export type FeatureBlock = { title: string; html: string };

export type ParsedDescription = {
  /** Texto editorial suelto, sin subtítulo propio. */
  introHtml: string;
  /** Bloques editoriales con subtítulo, para la sección de características. */
  features: FeatureBlock[];
  /** Pares etiqueta/valor de la ficha técnica. */
  specs: SpecPair[];
  /** Bloques de la zona de specs que no se pudieron parsear como pares. */
  specsExtraHtml: string;
  /** Ítems del contenido de la caja. */
  boxItems: string[];
};

const OPEN_RE = /<(p|ul|ol|div|h[1-6])\b[^>]*>/gi;
const LI_RE = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
const STRONG_RE = /<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi;

const RE_CAJA = /contenido de la caja/i;
const RE_SPECS = /caracter[ií]sticas|especificaciones|ficha t[eé]cnica|datos t[eé]cnicos/i;
const RE_LEGAL = /aviso legal|legales|garant[ií]a limitada/i;

/** Texto plano de un fragmento HTML, con las entidades más comunes resueltas. */
export function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

type Block = { tag: string; html: string; inner: string; text: string; heading: boolean };

/** Un <p> cuyo texto está enteramente en negrita funciona como encabezado. */
function esEncabezado(tag: string, inner: string, text: string): boolean {
  if (/^h[1-6]$/i.test(tag)) return true;
  const t = tag.toLowerCase();
  if (t !== "p" && t !== "div") return false;
  if (!text || text.length > 70) return false;
  const negrita = [...inner.matchAll(STRONG_RE)].map((m) => htmlToText(m[2])).join(" ").trim();
  return negrita.length > 0 && htmlToText(negrita) === text;
}

/** Cierre de `tag` contando anidamiento, desde `desde`. */
function buscarCierre(html: string, tag: string, desde: number): { inicio: number; fin: number } | null {
  const re = new RegExp(`<(/)?${tag}\\b[^>]*>`, "gi");
  re.lastIndex = desde;
  let nivel = 1;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    nivel += m[1] ? -1 : 1;
    if (nivel === 0) return { inicio: m.index, fin: re.lastIndex };
  }
  return null;
}

/**
 * Bloques de texto en orden de lectura. Los contenedores (el <section> y los
 * <div> con los que Odoo envuelve todo) no se emiten: se baja adentro hasta
 * llegar a las hojas, que son las que tienen contenido. Las listas sí son
 * hoja, porque sus <li> pueden traer <h3> adentro.
 */
function leerBloques(html: string): Block[] {
  const bloques: Block[] = [];

  const recorrer = (fragmento: string) => {
    const re = new RegExp(OPEN_RE.source, "gi");
    let m: RegExpExecArray | null;
    while ((m = re.exec(fragmento))) {
      const tag = m[1].toLowerCase();
      const cierre = buscarCierre(fragmento, tag, re.lastIndex);
      if (!cierre) continue;
      const inner = fragmento.slice(re.lastIndex, cierre.inicio);
      const esLista = tag === "ul" || tag === "ol";
      if (!esLista && /<(p|ul|ol|div|h[1-6])\b/i.test(inner)) {
        recorrer(inner);
      } else {
        const text = htmlToText(inner);
        bloques.push({
          tag,
          html: fragmento.slice(m.index, cierre.fin),
          inner,
          text,
          heading: esEncabezado(tag, inner, text),
        });
      }
      re.lastIndex = cierre.fin;
    }
  };

  recorrer(html);
  return bloques;
}

function itemsDeLista(inner: string): string[] {
  return [...inner.matchAll(LI_RE)].map((m) => htmlToText(m[1])).filter(Boolean);
}

/** Un texto corto y sin números es más etiqueta que valor. */
function pareceEtiqueta(texto: string): boolean {
  return !/\d/.test(texto) && texto.length <= 45;
}

/** "» Marca: mophie" → { label: "Marca", value: "mophie" } */
function parClaveValor(texto: string): { label: string; value: string } | null {
  const limpio = texto.replace(/^[»•▪\-–·\s]+/, "").trim();
  const i = limpio.indexOf(":");
  if (i <= 0 || i === limpio.length - 1) return null;
  const label = limpio.slice(0, i).trim();
  const value = limpio.slice(i + 1).trim();
  if (!label || !value || label.length > 40) return null;
  return { label, value };
}

/** Normaliza para comparar títulos: sin acentos, signos ni mayúsculas. */
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

export function parseProductDescription(
  html: string | null | undefined,
  opts: { titulo?: string } = {},
): ParsedDescription {
  const vacio: ParsedDescription = {
    introHtml: "",
    features: [],
    specs: [],
    specsExtraHtml: "",
    boxItems: [],
  };
  if (!html) return vacio;

  const bloques = leerBloques(html);
  if (bloques.length === 0) return { ...vacio, introHtml: html };

  const intro: string[] = [];
  const features: FeatureBlock[] = [];
  let featureActual: { title: string; html: string[] } | null = null;
  const cerrarFeature = () => {
    if (!featureActual) return;
    const html = featureActual.html.join("\n").trim();
    if (html) features.push({ title: featureActual.title, html });
    featureActual = null;
  };
  const extra: string[] = [];
  const specs: SpecPair[] = [];
  const boxItems: string[] = [];

  let modo: "intro" | "specs" | "caja" | "descarte" = "intro";
  let etiquetaPendiente: string | null = null;
  let pendienteDeEncabezado = false;
  let primerEncabezado = true;
  const tituloNormalizado = opts.titulo ? normalizar(opts.titulo) : "";

  const emitir = (label: string, value: string) => {
    if (!label || !value) return;
    const key = `${label}-${specs.length}`;
    specs.push({ key, label, value });
  };

  for (const b of bloques) {
    if (!b.text) continue;

    if (b.heading) {
      // Los encabezados que repiten el título del producto no aportan nada.
      if (tituloNormalizado && normalizar(b.text) === tituloNormalizado) {
        primerEncabezado = false;
        continue;
      }
      if (RE_CAJA.test(b.text)) {
        cerrarFeature();
        modo = "caja";
        etiquetaPendiente = null;
        continue;
      }
      if (RE_LEGAL.test(b.text)) {
        cerrarFeature();
        modo = "descarte";
        etiquetaPendiente = null;
        continue;
      }
      if (RE_SPECS.test(b.text)) {
        // "Características generales" abre la ficha; "Características de control
        // y conexión" es un subtítulo dentro de ella. En los dos casos, specs.
        cerrarFeature();
        modo = "specs";
        etiquetaPendiente = null;
        continue;
      }
      // Sin título a mano, el primer encabezado suele ser el nombre del producto.
      if (primerEncabezado && modo === "intro") {
        primerEncabezado = false;
        continue;
      }
      if (modo === "specs") {
        // Un <h*> de verdad cierra la ficha: lo que sigue vuelve a ser texto.
        if (/^h[1-6]$/.test(b.tag)) {
          modo = "intro";
          etiquetaPendiente = null;
          featureActual = { title: b.text, html: [] };
          continue;
        }
        etiquetaPendiente = b.text;
        pendienteDeEncabezado = true;
        continue;
      }
      cerrarFeature();
      featureActual = { title: b.text, html: [] };
      continue;
    }

    if (modo === "descarte") continue;

    if (modo === "caja") {
      if (b.tag === "ul" || b.tag === "ol") {
        boxItems.push(...itemsDeLista(b.inner));
      } else if (b.text) {
        boxItems.push(b.text);
      }
      continue;
    }

    if (modo === "specs") {
      if (b.tag === "ul" || b.tag === "ol") {
        const items = itemsDeLista(b.inner);
        const pares = items.map(parClaveValor);
        // Formato B: la lista entera son pares "clave: valor".
        if (items.length > 1 && pares.every(Boolean)) {
          pares.forEach((p) => p && emitir(p.label, p.value));
          etiquetaPendiente = null;
          continue;
        }
        if (items.length === 0) {
          extra.push(b.html);
          continue;
        }
        for (const item of items) {
          const par = parClaveValor(item);
          if (par) {
            emitir(par.label, par.value);
            etiquetaPendiente = null;
            continue;
          }
          if (!etiquetaPendiente) {
            etiquetaPendiente = item;
            pendienteDeEncabezado = false;
            continue;
          }
          // "Medidas" seguido de "Dimensión (ancho × alto × profundidad)": el
          // encabezado era del grupo y la etiqueta real vino en la lista.
          if (pendienteDeEncabezado && items.length === 1 && pareceEtiqueta(item)) {
            etiquetaPendiente = item;
            pendienteDeEncabezado = false;
            continue;
          }
          // Formato A: varios ítems son un único valor del encabezado.
          if (pendienteDeEncabezado && items.length > 1) {
            emitir(etiquetaPendiente, items.join(" · "));
            etiquetaPendiente = null;
            break;
          }
          emitir(etiquetaPendiente, item);
          etiquetaPendiente = null;
        }
        continue;
      }

      if (etiquetaPendiente) {
        emitir(etiquetaPendiente, b.text);
        etiquetaPendiente = null;
        continue;
      }

      const par = parClaveValor(b.text);
      if (par) {
        emitir(par.label, par.value);
        continue;
      }

      // Continuación de un valor cortado en el origen:
      // "<div>Longitud: 1,8 metros (</div><div> metros)</div>".
      const ultima = specs[specs.length - 1];
      if (
        ultima &&
        b.text.length <= 25 &&
        (ultima.value.match(/\(/g)?.length ?? 0) > (ultima.value.match(/\)/g)?.length ?? 0)
      ) {
        ultima.value = `${ultima.value}${b.text}`.replace(/\(\s+/g, "(");
        continue;
      }

      // Una frase larga dentro de la ficha es texto, no una spec.
      if (b.text.length >= 60) {
        if (featureActual) featureActual.html.push(b.html);
        else intro.push(b.html);
        continue;
      }

      extra.push(b.html);
      continue;
    }

    if (featureActual) featureActual.html.push(b.html);
    else intro.push(b.html);
  }

  cerrarFeature();

  return {
    introHtml: intro.join("\n").trim(),
    features,
    specs,
    specsExtraHtml: extra.join("\n").trim(),
    boxItems,
  };
}
