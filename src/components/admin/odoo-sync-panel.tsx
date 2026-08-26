"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { SyncBatchResult, SyncStats, SyncType } from "@/lib/odoo-sync-types";

type SyncAction = {
  type: SyncType;
  label: string;
  help: string;
  primary?: boolean;
};

const ACTIONS: SyncAction[] = [
  {
    type: "stock",
    label: "Sincronizar stock",
    help: "Actualiza cantidades por depósito. Uso frecuente.",
    primary: true,
  },
  {
    type: "productos",
    label: "Sincronizar productos",
    help: "Precios, altas/bajas, categorías, almacenes, marcas, etiquetas y accesorios.",
  },
  {
    type: "imagenes",
    label: "Sincronizar imágenes",
    help: "Solo cuando cambien fotos (principal + galería).",
  },
];

function emptyAccStats(): SyncStats {
  return {
    categorias: { created: 0, updated: 0 },
    almacenes: { created: 0, updated: 0 },
    marcas: { created: 0, updated: 0 },
    etiquetas: { created: 0, updated: 0 },
    productos: { created: 0, updated: 0, deactivated: 0, images: 0 },
    precios: { inserted: 0 },
    stock: { upserted: 0 },
    relaciones: { updated: 0 },
    errors: [],
    dryRun: false,
  };
}

function mergeStats(acc: SyncStats, batch: SyncStats): SyncStats {
  return {
    dryRun: batch.dryRun,
    categorias: {
      created: acc.categorias.created + batch.categorias.created,
      updated: acc.categorias.updated + batch.categorias.updated,
    },
    almacenes: {
      created: acc.almacenes.created + batch.almacenes.created,
      updated: acc.almacenes.updated + batch.almacenes.updated,
    },
    marcas: {
      created: acc.marcas.created + batch.marcas.created,
      updated: acc.marcas.updated + batch.marcas.updated,
    },
    etiquetas: {
      created: acc.etiquetas.created + batch.etiquetas.created,
      updated: acc.etiquetas.updated + batch.etiquetas.updated,
    },
    productos: {
      created: acc.productos.created + batch.productos.created,
      updated: acc.productos.updated + batch.productos.updated,
      deactivated: acc.productos.deactivated + batch.productos.deactivated,
      images: acc.productos.images + batch.productos.images,
    },
    precios: { inserted: acc.precios.inserted + batch.precios.inserted },
    stock: { upserted: acc.stock.upserted + batch.stock.upserted },
    relaciones: { updated: acc.relaciones.updated + batch.relaciones.updated },
    errors: [...acc.errors, ...batch.errors],
  };
}

function formatSummary(type: SyncType, stats: SyncStats): string {
  if (type === "stock") {
    return `Stock actualizado: ${stats.stock.upserted} productos.`;
  }
  if (type === "imagenes") {
    return `Imágenes procesadas: ${stats.productos.images}.`;
  }
  return [
    `Productos +${stats.productos.created} / ~${stats.productos.updated}`,
    `desactivados ${stats.productos.deactivated}`,
    `precios ${stats.precios.inserted}`,
    `accesorios ${stats.relaciones.updated}`,
  ].join(" · ");
}

export function OdooSyncPanel() {
  const router = useRouter();
  const [running, setRunning] = useState<SyncType | null>(null);
  const [processed, setProcessed] = useState(0);
  const [total, setTotal] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const percent = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : running ? 0 : 0;

  async function runSync(type: SyncType) {
    setRunning(type);
    setProcessed(0);
    setTotal(0);
    setMessage("Iniciando…");
    setSummary(null);
    setError(null);

    let offset = 0;
    let acc = emptyAccStats();
    const seenErrors = new Set<string>();

    try {
      for (;;) {
        const res = await fetch("/api/admin/sync-odoo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type, offset }),
        });
        const data = (await res.json()) as SyncBatchResult & { error?: string };
        if (!res.ok) {
          throw new Error(data.error || "Error al sincronizar");
        }

        // Cada lote trae stats del request (delta respecto a emptyStats de ese request)
        acc = mergeStats(acc, data.stats);
        // Evitar duplicar la lista completa de errors si el server reenvía acumulado en el mismo request
        for (const e of data.errors ?? []) {
          if (!seenErrors.has(e)) {
            seenErrors.add(e);
          }
        }
        // Reconstruir errors únicos desde el merge: mergeStats concatena; limpiar
        acc = { ...acc, errors: [...seenErrors] };

        setProcessed(data.processed);
        setTotal(data.total);
        setMessage(data.message ?? `Procesando ${data.processed} / ${data.total}…`);

        if (data.done) break;
        offset = data.nextOffset;
      }

      const errCount = seenErrors.size;
      setSummary(
        `${formatSummary(type, acc)}${errCount ? ` (${errCount} aviso(s))` : ""}`
      );
      setMessage("Listo");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo sincronizar");
      setMessage(null);
    } finally {
      setRunning(null);
    }
  }

  return (
    <div className="admin-card" style={{ marginTop: "1.5rem" }}>
      <h2 style={{ marginTop: 0 }}>Sincronizar con Odoo</h2>
      <p className="muted">
        Separá stock, productos/precios e imágenes. El progreso avanza por lotes para evitar
        timeouts.
      </p>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.75rem",
          marginBottom: "1rem",
        }}
      >
        {ACTIONS.map((action) => (
          <div key={action.type} style={{ flex: "1 1 220px", minWidth: 200 }}>
            <button
              type="button"
              className={action.primary ? "btn btn-primary" : "btn btn-ghost"}
              disabled={running !== null}
              onClick={() => void runSync(action.type)}
              style={{ width: "100%" }}
            >
              {running === action.type ? "Sincronizando…" : action.label}
            </button>
            <p className="muted" style={{ margin: "0.35rem 0 0", fontSize: "0.85rem" }}>
              {action.help}
            </p>
          </div>
        ))}
      </div>

      {(running || message || summary || error) && (
        <div style={{ marginTop: "0.5rem" }}>
          {running && (
            <>
              <div
                role="progressbar"
                aria-valuenow={percent}
                aria-valuemin={0}
                aria-valuemax={100}
                style={{
                  height: 10,
                  borderRadius: 6,
                  background: "rgba(0,0,0,0.08)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${percent}%`,
                    height: "100%",
                    background: "var(--oc-blue)",
                    transition: "width 0.2s ease",
                  }}
                />
              </div>
              <p className="muted" style={{ margin: "0.5rem 0 0" }}>
                {message}
                {total > 0 ? ` (${processed} / ${total} · ${percent}%)` : null}
              </p>
            </>
          )}
          {!running && message && !error && (
            <p className="muted" style={{ margin: "0.35rem 0 0" }}>
              {message}
            </p>
          )}
          {summary && (
            <p style={{ margin: "0.35rem 0 0" }}>
              <strong>{summary}</strong>
            </p>
          )}
          {error && (
            <p style={{ margin: "0.35rem 0 0", color: "#b00020" }}>{error}</p>
          )}
        </div>
      )}
    </div>
  );
}
