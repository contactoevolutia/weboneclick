/**
 * Sync de cantidad vendida por producto para orden "Más vendidos".
 * Fuente preferida: Odoo (todos los canales). Fallback: ventas web locales.
 */

import { readGroup, m2oId } from "@/lib/odoo";
import { withCronLock } from "@/lib/cron-lock";
import { prisma } from "@/lib/prisma";

/** Líneas de pedido confirmadas / entregadas en Odoo. */
const SALE_LINE_DOMAIN: unknown[] = [
  ["state", "in", ["sale", "done"]],
  ["product_id", "!=", false],
];

const ODOO_SYNC_TIMEOUT_MS = 90_000;
const UPDATE_BATCH = 100;

export type VentasProductoSyncStats = {
  source: "odoo" | "web";
  updated: number;
  durationMs: number;
  odooGroups: number;
  fallbackUsed: boolean;
  dryRun: boolean;
  skipped?: boolean;
  errors: string[];
};

function emptyStats(dryRun: boolean): VentasProductoSyncStats {
  return {
    source: "odoo",
    updated: 0,
    durationMs: 0,
    odooGroups: 0,
    fallbackUsed: false,
    dryRun,
    errors: [],
  };
}

function resolveSyncSource(): "odoo" | "web" {
  const raw = (process.env.VENTAS_SYNC_SOURCE ?? "odoo").trim().toLowerCase();
  return raw === "web" ? "web" : "odoo";
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} superó ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Agrega unidades vendidas por product_id en Odoo (histórico total). */
export async function fetchVentasFromOdoo(): Promise<Map<number, number>> {
  const rows = await readGroup(
    "sale.order.line",
    SALE_LINE_DOMAIN,
    ["product_uom_qty:sum"],
    ["product_id"],
    { lazy: false }
  );

  const map = new Map<number, number>();
  for (const row of rows) {
    const odooId = m2oId(row.product_id as [number, string] | false);
    if (!odooId) continue;
    const qty = Number(row.product_uom_qty ?? 0);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    map.set(odooId, (map.get(odooId) ?? 0) + Math.round(qty));
  }
  return map;
}

/** Agrega unidades vendidas por id_producto desde ventas web pagadas. */
export async function fetchVentasFromWeb(): Promise<Map<number, number>> {
  const rows = await prisma.$queryRaw<{ id_producto: number; total: number }[]>`
    SELECT vd.id_producto, CAST(SUM(vd.cantidad) AS DECIMAL(18, 2)) AS total
    FROM venta_detalle vd
    INNER JOIN venta v ON v.id_venta = vd.id_venta
    WHERE v.estado = 'pagada'
    GROUP BY vd.id_producto
  `;

  const map = new Map<number, number>();
  for (const row of rows) {
    const qty = Math.round(Number(row.total));
    if (qty > 0) map.set(row.id_producto, qty);
  }
  return map;
}

async function applyOdooVentasMap(
  odooQty: Map<number, number>,
  dryRun: boolean
): Promise<number> {
  const locals = await prisma.producto.findMany({
    where: { odoo_id: { not: null } },
    select: { id_producto: true, odoo_id: true },
  });

  const updates = locals.map((p) => ({
    id_producto: p.id_producto,
    cantidad_vendida: odooQty.get(p.odoo_id!) ?? 0,
  }));

  if (dryRun) return updates.length;

  for (let i = 0; i < updates.length; i += UPDATE_BATCH) {
    const batch = updates.slice(i, i + UPDATE_BATCH);
    await prisma.$transaction(
      batch.map((u) =>
        prisma.producto.update({
          where: { id_producto: u.id_producto },
          data: { cantidad_vendida: u.cantidad_vendida },
        })
      )
    );
  }
  return updates.length;
}

async function applyWebVentasMap(
  webQty: Map<number, number>,
  dryRun: boolean
): Promise<number> {
  const locals = await prisma.producto.findMany({
    select: { id_producto: true },
  });

  const updates = locals.map((p) => ({
    id_producto: p.id_producto,
    cantidad_vendida: webQty.get(p.id_producto) ?? 0,
  }));

  if (dryRun) return updates.length;

  for (let i = 0; i < updates.length; i += UPDATE_BATCH) {
    const batch = updates.slice(i, i + UPDATE_BATCH);
    await prisma.$transaction(
      batch.map((u) =>
        prisma.producto.update({
          where: { id_producto: u.id_producto },
          data: { cantidad_vendida: u.cantidad_vendida },
        })
      )
    );
  }
  return updates.length;
}

export async function syncVentasProductosFromOdoo(options?: {
  dryRun?: boolean;
}): Promise<VentasProductoSyncStats> {
  const dryRun = Boolean(options?.dryRun);
  const stats = emptyStats(dryRun);
  stats.source = "odoo";
  const started = Date.now();

  const odooQty = await withTimeout(
    fetchVentasFromOdoo(),
    ODOO_SYNC_TIMEOUT_MS,
    "syncVentasProductosFromOdoo"
  );
  stats.odooGroups = odooQty.size;
  stats.updated = await applyOdooVentasMap(odooQty, dryRun);
  stats.durationMs = Date.now() - started;
  return stats;
}

export async function syncVentasProductosFromWeb(options?: {
  dryRun?: boolean;
}): Promise<VentasProductoSyncStats> {
  const dryRun = Boolean(options?.dryRun);
  const stats = emptyStats(dryRun);
  stats.source = "web";
  const started = Date.now();

  const webQty = await fetchVentasFromWeb();
  stats.odooGroups = webQty.size;
  stats.updated = await applyWebVentasMap(webQty, dryRun);
  stats.durationMs = Date.now() - started;
  return stats;
}

/**
 * Sync diario: Odoo por defecto; fallback a web si falla o supera timeout.
 * `VENTAS_SYNC_SOURCE=web` fuerza solo ventas web.
 */
export async function runVentasProductosSync(options?: {
  dryRun?: boolean;
}): Promise<VentasProductoSyncStats> {
  const dryRun = Boolean(options?.dryRun);
  const forced = resolveSyncSource();

  if (forced === "web") {
    return syncVentasProductosFromWeb({ dryRun });
  }

  try {
    return await syncVentasProductosFromOdoo({ dryRun });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[syncVentasProductos] Odoo falló, fallback web:", message);
    const fallback = await syncVentasProductosFromWeb({ dryRun });
    fallback.fallbackUsed = true;
    fallback.errors.push(`Odoo: ${message}`);
    return fallback;
  }
}

/** Cron con lock anti-solapamiento (stale 45 min para backfill largo). */
export async function runVentasProductosSyncCron(options?: {
  dryRun?: boolean;
}): Promise<VentasProductoSyncStats> {
  const dryRun = Boolean(options?.dryRun);
  const locked = await withCronLock(
    "sync-ventas-productos",
    async () => runVentasProductosSync({ dryRun }),
    { staleMs: 45 * 60 * 1000 }
  );

  if (!locked.acquired) {
    const stats = emptyStats(dryRun);
    stats.skipped = true;
    stats.errors.push("sync ventas productos omitido: ya hay una sincronización en curso");
    return stats;
  }
  return locked.result;
}
