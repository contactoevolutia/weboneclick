/**
 * Inspección rápida de modelos Odoo relevantes para el sync.
 * Uso: npx tsx scripts/inspect-odoo.ts
 */
import "dotenv/config";
import { executeKw, readGroup, searchCount, searchRead } from "../src/lib/odoo";

async function main() {
  const models = [
    { model: "product.category", domain: [] as unknown[] },
    { model: "stock.warehouse", domain: [] as unknown[] },
    { model: "product.brand", domain: [] as unknown[] },
    { model: "product.tag", domain: [] as unknown[] },
    {
      model: "product.product",
      domain: [["x_studio_publicado_web", "=", true]] as unknown[],
    },
  ];

  for (const m of models) {
    const count = await searchCount(m.model, m.domain);
    console.log(`${m.model}: ${count}`);
  }

  const sample = await searchRead(
    "product.product",
    [["x_studio_publicado_web", "=", true]],
    [
      "id",
      "display_name",
      "default_code",
      "list_price",
      "categ_id",
      "product_brand_id",
      "product_tag_ids",
      "x_studio_publicado_web",
    ],
    { limit: 3 }
  );
  console.log("\nSample products:");
  console.log(JSON.stringify(sample, null, 2));

  try {
    const fields = await executeKw<Record<string, { string: string; type: string }>>(
      "product.product",
      "fields_get",
      [],
      { attributes: ["string", "type"] }
    );
    const interesting = Object.entries(fields)
      .filter(
        ([k, v]) =>
          /brand|tag|publicado|image|categ|price|web|sold|venta|sales|qty/i.test(k) ||
          /brand|tag|publicado|web|vend|sales/i.test(v.string)
      )
      .map(([k, v]) => `${k} [${v.type}] ${v.string}`);
    console.log("\nRelevant product.product fields:");
    interesting.forEach((l) => console.log(" ", l));
  } catch (e) {
    console.warn("fields_get product.product failed", e);
  }

  // Validación dominio ventas (sync cantidad_vendida)
  const saleLineDomain: unknown[] = [
    ["state", "in", ["sale", "done"]],
    ["product_id", "!=", false],
  ];

  try {
    const lineCount = await searchCount("sale.order.line", saleLineDomain);
    console.log(`\nsale.order.line (state sale|done): ${lineCount} líneas`);

    const started = Date.now();
    const groups = await readGroup(
      "sale.order.line",
      saleLineDomain,
      ["product_uom_qty:sum"],
      ["product_id"],
      { lazy: false }
    );
    const durationMs = Date.now() - started;
    console.log(`read_group product_id: ${groups.length} grupos en ${durationMs}ms`);

    const top = groups
      .slice()
      .sort(
        (a, b) =>
          Number(b.product_uom_qty ?? 0) - Number(a.product_uom_qty ?? 0)
      )
      .slice(0, 5);
    console.log("\nTop 5 productos por unidades (Odoo):");
    for (const row of top) {
      console.log(
        " ",
        JSON.stringify({
          product_id: row.product_id,
          qty: row.product_uom_qty,
        })
      );
    }
  } catch (e) {
    console.warn("sale.order.line inspection failed", e);
  }

  try {
    const orderStates = await executeKw<
      Record<string, { string: string; type: string; selection?: [string, string][] }>
    >("sale.order", "fields_get", [["state"]], {
      attributes: ["string", "type", "selection"],
    });
    console.log("\nsale.order state selection:", orderStates.state?.selection);
  } catch (e) {
    console.warn("sale.order fields_get failed", e);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
