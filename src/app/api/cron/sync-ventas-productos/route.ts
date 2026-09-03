import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { runVentasProductosSyncCron } from "@/lib/odoo-ventas-producto";

/**
 * Cron diario: actualiza producto.cantidad_vendida para orden "Más vendidos".
 * Auth: Authorization: Bearer $CRON_SECRET
 *
 * Recomendado: 1× al día a las 04:00 ART (America/Argentina/Buenos_Aires).
 * Ejemplo crontab VPS:
 *   0 4 * * * TZ=America/Argentina/Buenos_Aires curl -sf -X POST \
 *     -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/sync-ventas-productos
 *
 * POST /api/cron/sync-ventas-productos
 * POST /api/cron/sync-ventas-productos?dryRun=1
 *
 * Env: VENTAS_SYNC_SOURCE=odoo|web (default odoo; fallback automático a web si Odoo falla)
 */
export async function POST(req: Request) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const dryRun = new URL(req.url).searchParams.get("dryRun") === "1";
  const stats = await runVentasProductosSyncCron({ dryRun });
  return NextResponse.json(stats);
}
