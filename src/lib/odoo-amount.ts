/**
 * Simula el total con IVA que Odoo produce (redondeo global por alícuota)
 * y alinea brutos de checkout/MP para que coincidan con ese total.
 */

export const ODOO_SHIPPING_TAX_RATE = 0.21;

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Bruto (IVA incluido) → neto unitario, misma fórmula que odoo-venta. */
export function grossToNet(gross: number, taxRate: number): number {
  if (taxRate <= 0) return round2(gross);
  return round2(gross / (1 + taxRate));
}

export type OdooAmountLine = {
  /** Precio unitario bruto (IVA incluido). */
  grossUnit: number;
  qty: number;
  /** Alícuota (0.21 | 0.105). */
  rate: number;
};

/**
 * Predice `sale.order.amount_total` con redondeo de impuesto global
 * (suma nets por alícuota → tax = round2(U * rate) → U + tax).
 */
export function predictOdooAmountTotal(lines: OdooAmountLine[]): number {
  const byRate = new Map<number, number>();
  for (const line of lines) {
    if (line.qty <= 0 || line.grossUnit <= 0) continue;
    const net = round2(grossToNet(line.grossUnit, line.rate) * line.qty);
    byRate.set(line.rate, round2((byRate.get(line.rate) ?? 0) + net));
  }
  let total = 0;
  for (const [rate, untaxed] of byRate) {
    const tax = round2(untaxed * rate);
    total = round2(total + untaxed + tax);
  }
  return total;
}

export type AlignGrossItem = {
  id_producto: number;
  titulo: string;
  cantidad: number;
  unit_price: number;
  rate: number;
};

export type AlignGrossesInput = {
  items: AlignGrossItem[];
  costo_envio: number;
};

export type AlignGrossesResult = {
  items: AlignGrossItem[];
  costo_envio: number;
  total: number;
};

function sumGross(items: AlignGrossItem[], costo_envio: number): number {
  const products = items.reduce(
    (acc, i) => acc + i.unit_price * i.cantidad,
    0,
  );
  return round2(products + Math.max(0, costo_envio));
}

function toPredictLines(
  items: AlignGrossItem[],
  costo_envio: number,
): OdooAmountLine[] {
  const lines: OdooAmountLine[] = items
    .filter((i) => i.unit_price > 0.009 && i.cantidad > 0)
    .map((i) => ({
      grossUnit: i.unit_price,
      qty: i.cantidad,
      rate: i.rate,
    }));
  if (costo_envio > 0.009) {
    lines.push({
      grossUnit: costo_envio,
      qty: 1,
      rate: ODOO_SHIPPING_TAX_RATE,
    });
  }
  return lines;
}

function largestItemIndex(items: AlignGrossItem[]): number {
  let idx = -1;
  let maxLine = -1;
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    if (item.unit_price <= 0.009 || item.cantidad <= 0) continue;
    const line = item.unit_price * item.cantidad;
    if (line > maxLine) {
      maxLine = line;
      idx = i;
    }
  }
  return idx;
}

/**
 * Ajusta envío (preferido) o la línea de mayor importe para que la suma
 * de brutos iguale el total que Odoo calculará con esos nets.
 *
 * Invariante: el `total` devuelto siempre es la suma de los brutos devueltos.
 * Es lo que Mercado Pago cobra (preference = ítems + envío) y lo que se guarda
 * en `venta.total`; si difieren, el webhook rechaza el pago por monto inválido.
 */
export function alignGrossesToOdooTotal(
  input: AlignGrossesInput,
): AlignGrossesResult {
  const originalItems = input.items.map((i) => ({ ...i }));
  const originalEnvio = round2(Math.max(0, input.costo_envio));

  const items = input.items.map((i) => ({ ...i }));
  let costo_envio = originalEnvio;

  for (let attempt = 0; attempt < 5; attempt++) {
    const predicted = predictOdooAmountTotal(
      toPredictLines(items, costo_envio),
    );
    const grossSum = sumGross(items, costo_envio);
    const diff = round2(predicted - grossSum);
    if (Math.abs(diff) < 0.01) {
      return { items, costo_envio, total: predicted };
    }

    if (costo_envio > 0.009) {
      costo_envio = round2(Math.max(0, costo_envio + diff));
      continue;
    }

    const idx = largestItemIndex(items);
    if (idx < 0) break;

    // Con cantidad > 1 el diff de 1 centavo no es divisible: mover el unitario
    // cambia la línea de a `cantidad` centavos y el lazo oscila sin converger.
    const item = items[idx]!;
    if (item.cantidad !== 1) break;
    item.unit_price = round2(Math.max(0, item.unit_price + diff));
  }

  // Sin convergencia se vuelve a los brutos originales y manda lo cobrado:
  // la orden de Odoo puede quedar unos centavos arriba, pero MP, `venta.total`
  // y el recibo siguen coincidiendo entre sí.
  return {
    items: originalItems,
    costo_envio: originalEnvio,
    total: sumGross(originalItems, originalEnvio),
  };
}
