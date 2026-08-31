import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { runStockAlerts } from "@/lib/stock-alerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cron: avisa por mail a quienes pidieron notificación cuando el producto
 * vuelve a tener stock vendible.
 * Auth: Authorization: Bearer $CRON_SECRET
 *
 * Recomendado: cada 10-15 minutos, después del sync de stock.
 * `?dryRun=1` reporta cuántos avisos saldrían sin enviar mails.
 */
export async function POST(req: Request) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const dryRun = new URL(req.url).searchParams.get("dryRun") === "1";
  try {
    const stats = await runStockAlerts({ dryRun });
    return NextResponse.json(stats);
  } catch (err) {
    console.error("[cron/avisos-stock] failed", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error inesperado" },
      { status: 500 },
    );
  }
}
