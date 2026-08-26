/**
 * Odoo puede envolver HTML pegado como texto y escapar sus etiquetas:
 * `<p>&lt;h2&gt;Título&lt;/h2&gt;</p>`.
 *
 * Decodificamos únicamente etiquetas de formato conocidas y sin atributos.
 * Así evitamos convertir contenido arbitrario (por ejemplo, un `<script>`
 * escapado) en HTML ejecutable.
 */
const ESCAPED_FORMATTING_TAG =
  /&lt;\s*(\/?)\s*(h[1-6]|p|strong|em|b|i|u|s|ul|ol|li|br|blockquote|pre|code|hr|sub|sup)\s*(\/?)\s*&gt;/gi;

const BLOCK_TAG = /<(?:h[1-6]|p|ul|ol|blockquote|pre)\b/i;
const OUTER_ODOO_PARAGRAPH = /^<p(?:\s[^>]*)?>\s*([\s\S]*)\s*<\/p>$/i;

export function normalizeProductHtml(value: string): string {
  const source = value.trim();
  let decodedTag = false;

  const normalized = source.replace(
    ESCAPED_FORMATTING_TAG,
    (_match, closing: string, tag: string, selfClosing: string) => {
      decodedTag = true;
      const slash = selfClosing && !closing ? " /" : "";
      return `<${closing ? "/" : ""}${tag.toLowerCase()}${slash}>`;
    }
  );

  if (!decodedTag) return source;

  // El editor de Odoo suele agregar un único <p> alrededor de todo el HTML
  // escapado. Luego de decodificarlo, ese wrapper produciría HTML inválido
  // como `<p><h2>…</h2><p>…</p></p>`.
  const outerParagraph = normalized.match(OUTER_ODOO_PARAGRAPH);
  if (outerParagraph && BLOCK_TAG.test(outerParagraph[1])) {
    return outerParagraph[1].trim();
  }

  return normalized;
}
