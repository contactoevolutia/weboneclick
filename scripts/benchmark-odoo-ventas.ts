/**
 * Diagnóstico Odoo + sync ventas con medición de tiempo.
 * Uso: npx tsx scripts/benchmark-odoo-ventas.ts
 */
import "dotenv/config";
import { fetchVentasFromOdoo, syncVentasProductosFromOdoo } from "../src/lib/odoo-ventas-producto";

async function probeJsonRpc() {
  const url = process.env.ODOO_URL ?? "(unset)";
  const db = process.env.ODOO_DB ?? "(unset)";
  const uid = process.env.ODOO_UID ?? "(unset)";
  const hasKey = Boolean(process.env.ODOO_API_KEY);

  console.log("=== Config Odoo (sin secretos) ===");
  console.log({ ODOO_URL: url, ODOO_DB: db, ODOO_UID: uid, hasApiKey: hasKey });

  const endpoint = `${url.replace(/\/$/, "")}/jsonrpc`;
  const body = {
    jsonrpc: "2.0",
    method: "call",
    params: {
      service: "object",
      method: "execute_kw",
      args: [
        db,
        Number(uid),
        process.env.ODOO_API_KEY,
        "product.product",
        "search_count",
        [[["x_studio_publicado_web", "=", true]]],
        { context: { lang: "es_AR" } },
      ],
    },
    id: 1,
  };

  const started = Date.now();
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  const durationMs = Date.now() - started;

  console.log("\n=== Probe JSON-RPC ===");
  console.log({
    endpoint,
    httpStatus: res.status,
    contentType: res.headers.get("content-type"),
    durationMs,
    bodyLength: raw.length,
    bodyPreview: raw.slice(0, 300).replace(/\s+/g, " "),
  });

  try {
    const json = JSON.parse(raw) as { result?: unknown; error?: { message: string } };
    if (json.error) {
      console.log("RPC error:", json.error.message);
    } else {
      console.log("search_count productos web:", json.result);
    }
  } catch {
    console.log("Respuesta NO es JSON válido");
  }
}

async function main() {
  await probeJsonRpc();

  console.log("\n=== Sync ventas desde Odoo (read_group) ===");
  const t0 = Date.now();
  try {
    const odooQty = await fetchVentasFromOdoo();
    const fetchMs = Date.now() - t0;
    console.log(`fetchVentasFromOdoo: ${odooQty.size} productos con ventas en ${fetchMs}ms`);

    const top = [...odooQty.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    console.log("\nTop 10 Odoo (odoo_id → unidades):");
    for (const [id, qty] of top) console.log(`  ${qty}x  odoo_id=${id}`);

    const t1 = Date.now();
    const stats = await syncVentasProductosFromOdoo({ dryRun: true });
    const totalMs = Date.now() - t0;
    console.log("\n=== syncVentasProductosFromOdoo (dry-run) ===");
    console.log({ ...stats, totalMsIncludingFetch: totalMs });
  } catch (err) {
    console.error("\nSync Odoo falló:", err instanceof Error ? err.message : err);
    console.error(`Tiempo hasta fallo: ${Date.now() - t0}ms`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
