/**
 * Sync cantidad_vendida para orden "Más vendidos".
 * Pensado para cron diario 04:00 ART (POST /api/cron/sync-ventas-productos).
 *
 *   npm run sync:ventas-productos
 *   npm run sync:ventas-productos -- --dry-run
 */
import "dotenv/config";
import { runVentasProductosSync } from "../src/lib/odoo-ventas-producto";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  console.log("Sincronizando cantidad_vendida...", { dryRun });

  const stats = await runVentasProductosSync({ dryRun });
  console.log(JSON.stringify(stats, null, 2));

  if (stats.errors.length) {
    console.error(`Completed with ${stats.errors.length} errors`);
    process.exitCode = stats.fallbackUsed ? 0 : 1;
  } else {
    console.log(
      `Sync ventas productos OK (${stats.source}, ${stats.updated} productos, ${stats.durationMs}ms)`
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
