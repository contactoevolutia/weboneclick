"use client";

import { useState } from "react";

export function NewsletterExportButton({ pendientes }: { pendientes: number }) {
  const [open, setOpen] = useState(false);

  function exportar(scope: "pendientes" | "todos") {
    setOpen(false);
    window.location.href = `/admin/newsletter/export?scope=${scope}`;
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-secondary"
        style={{ padding: "0.35rem 0.75rem" }}
        onClick={() => setOpen(true)}
      >
        Exportar CSV
      </button>

      {open && (
        <div className="oc-admin-modal-overlay" onClick={() => setOpen(false)} role="presentation">
          <div
            className="oc-admin-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="newsletter-export-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="oc-admin-modal-head">
              <h2 id="newsletter-export-title">Exportar newsletter</h2>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setOpen(false)}
                aria-label="Cerrar"
              >
                ×
              </button>
            </div>

            <p className="muted" style={{ marginTop: 0, fontSize: "0.85rem" }}>
              El CSV incluye únicamente los emails. Si exportás solo los pendientes, esos registros
              quedan marcados como exportados ({pendientes} pendiente{pendientes === 1 ? "" : "s"}).
            </p>

            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => exportar("pendientes")}
                disabled={pendientes === 0}
              >
                Solo pendientes
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => exportar("todos")}>
                Todos
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
