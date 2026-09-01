/**
 * Separa la ficha técnica en dos: las 3 specs que se muestran como tarjeta
 * destacada (procesador, RAM + almacenamiento, batería) y el resto, que sigue
 * yendo en la lista de siempre. Las specs promovidas a tarjeta salen de la
 * lista para no repetir el dato.
 */

export type SpecRow = { key: string; label: string; value: string };
export type SpecHighlight = { key: string; value: string; caption: string };

const RE_PROCESADOR = /\b(chip|procesador|cpu)\b/i;
const RE_BATERIA = /\b(bater[ií]a|autonom[ií]a)\b/i;
const RE_RAM = /\bram\b|^\s*memoria\s*$/i;
const RE_ALMACENAMIENTO = /\b(almacenamiento|disco|ssd|capacidad)\b|memoria\s+interna/i;

/** "Hasta 15 horas de uso inalámbrico" → "15 horas". */
function resumirBateria(value: string): string | null {
  const m = value.match(/(\d+(?:[.,]\d+)?)\s*(horas?|hs\b|h\b)/i);
  if (!m) return null;
  const n = m[1];
  return `${n} ${Number(n.replace(",", ".")) === 1 ? "hora" : "horas"}`;
}

/** "256GB SSD" → "256GB" (el detalle completo queda en la lista). */
function resumirAlmacenamiento(value: string): string {
  return value.replace(/\s*(ssd|hdd|emmc)\s*$/i, "").trim();
}

export function splitSpecHighlights(
  rows: SpecRow[],
  opts: { procesadorCaption?: string } = {},
): { highlights: SpecHighlight[]; rest: SpecRow[] } {
  const highlights: SpecHighlight[] = [];
  const usados = new Set<string>();

  // Cada fila entra en una sola categoría. El orden importa: "Capacidad de la
  // batería" es batería, no almacenamiento.
  const find = (re: RegExp) => {
    const row = rows.find((r) => !usados.has(r.key) && re.test(r.label));
    if (row) usados.add(row.key);
    return row;
  };

  const procesador = find(RE_PROCESADOR);
  // La tarjeta de batería sólo tiene sentido con una autonomía real ("15
  // horas"). Una fila como "Tipo de batería: Batería" vuelve a la lista.
  const bateriaCandidata = find(RE_BATERIA);
  const bateriaResumen = bateriaCandidata ? resumirBateria(bateriaCandidata.value) : null;
  if (bateriaCandidata && !bateriaResumen) usados.delete(bateriaCandidata.key);
  const bateria = bateriaResumen ? bateriaCandidata : undefined;
  const ram = find(RE_RAM);
  const almacenamiento = find(RE_ALMACENAMIENTO);

  if (procesador) {
    const caption = opts.procesadorCaption?.trim();
    highlights.push({
      key: "procesador",
      // Con caption propia ("6 CPU · 5 GPU") el paréntesis del valor sobra.
      value: caption ? procesador.value.replace(/\s*\([^)]*\)\s*$/, "") : procesador.value,
      caption: caption || procesador.label,
    });
  }

  if (ram || almacenamiento) {
    const partes: string[] = [];
    const captions: string[] = [];
    if (ram) {
      partes.push(ram.value);
      captions.push("RAM");
    }
    if (almacenamiento) {
      partes.push(resumirAlmacenamiento(almacenamiento.value));
      captions.push("Almacenamiento");
    }
    highlights.push({
      key: "memoria",
      value: partes.join(" · "),
      caption: captions.join(" · "),
    });
  }

  if (bateria && bateriaResumen) {
    highlights.push({ key: "bateria", value: bateriaResumen, caption: "de autonomía" });
  }

  return { highlights, rest: rows.filter((r) => !usados.has(r.key)) };
}
