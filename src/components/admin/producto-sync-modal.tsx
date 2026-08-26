"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { SyncProductoBySkuResult } from "@/lib/odoo-sync-types";

export function ProductoSyncModal() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [sku, setSku] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SyncProductoBySkuResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function close() {
    if (running) return;
    setOpen(false);
  }

  function resetAndOpen() {
    setSku("");
    setResult(null);
    setError(null);
    setOpen(true);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = sku.trim();
    if (!trimmed || running) return;

    setRunning(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/admin/sync-odoo/producto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku: trimmed }),
      });
      const data = (await res.json()) as SyncProductoBySkuResult & { error?: string };
      if (data.message || data.ok != null) {
        setResult({
          ok: Boolean(data.ok),
          sku: data.sku || trimmed,
          id_producto: data.id_producto,
          odoo_id: data.odoo_id,
          titulo: data.titulo,
          message: data.message || data.error || `Error ${res.status}`,
          stats: data.stats ?? {
            categorias: { created: 0, updated: 0 },
            almacenes: { created: 0, updated: 0 },
            marcas: { created: 0, updated: 0 },
            etiquetas: { created: 0, updated: 0 },
            productos: { created: 0, updated: 0, deactivated: 0, images: 0 },
            precios: { inserted: 0 },
            stock: { upserted: 0 },
            errors: data.errors ?? [],
            dryRun: false,
          },
          errors: data.errors ?? (data.error ? [data.error] : []),
        });
        if (data.ok) router.refresh();
        return;
      }
      setError(data.error || `Error ${res.status}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de red");
    } finally {
      setRunning(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-secondary"
        style={{ padding: "0.35rem 0.75rem" }}
        onClick={resetAndOpen}
      >
        Sincronizar producto
      </button>

      {open && (
        <div className="oc-admin-modal-overlay" onClick={close} role="presentation">
          <div
            className="oc-admin-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="producto-sync-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="oc-admin-modal-head">
              <h2 id="producto-sync-title">Sincronizar producto</h2>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={close}
                aria-label="Cerrar"
                disabled={running}
              >
                ×
              </button>
            </div>

            <p className="muted" style={{ marginTop: 0, fontSize: "0.85rem" }}>
              Ingresá el SKU de Odoo (<code>default_code</code>). Se sincronizan datos del
              producto (título, descripción, precio, marca), stock por depósito e imágenes
              (principal + galería).
            </p>

            <form onSubmit={onSubmit} className="oc-admin-modal-form">
              <label>
                SKU
                <input
                  value={sku}
                  onChange={(e) => setSku(e.target.value)}
                  placeholder="Ej. MDVH4LE/A"
                  autoFocus
                  disabled={running}
                  required
                />
              </label>

              {running && (
                <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
                  Sincronizando con Odoo…
                </p>
              )}

              {error && (
                <p style={{ margin: 0, color: "var(--oc-danger, #b00020)", fontSize: "0.85rem" }}>
                  {error}
                </p>
              )}

              {result && (
                <div
                  style={{
                    border: "1px solid var(--oc-border)",
                    borderRadius: 8,
                    padding: "0.75rem",
                    fontSize: "0.85rem",
                    display: "grid",
                    gap: "0.35rem",
                  }}
                >
                  <strong style={{ color: result.ok ? undefined : "var(--oc-danger, #b00020)" }}>
                    {result.message}
                  </strong>
                  {result.titulo && (
                    <span className="muted">
                      {result.titulo}
                      {result.odoo_id != null ? ` · Odoo #${result.odoo_id}` : ""}
                    </span>
                  )}
                  <span className="muted">
                    Datos: +{result.stats.productos.created} / ~{result.stats.productos.updated}
                    {" · "}
                    precios {result.stats.precios.inserted}
                    {" · "}
                    stock {result.stats.stock.upserted}
                    {" · "}
                    imágenes {result.stats.productos.images}
                    {" · "}
                    accesorios {result.stats.relaciones.updated}
                  </span>
                  {result.id_producto != null && (
                    <Link href={`/admin/productos/${result.id_producto}`}>
                      Abrir producto #{result.id_producto}
                    </Link>
                  )}
                  {result.errors.length > 0 && (
                    <ul style={{ margin: "0.25rem 0 0", paddingLeft: "1.1rem" }}>
                      {result.errors.slice(0, 8).map((err) => (
                        <li key={err}>{err}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <div className="oc-admin-modal-actions">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={close}
                  disabled={running}
                >
                  {result?.ok ? "Cerrar" : "Cancelar"}
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={running || !sku.trim()}
                >
                  {running ? "Sincronizando…" : "Sincronizar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
