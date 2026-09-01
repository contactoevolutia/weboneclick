"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import type { RegaloProductoSearchRow } from "@/app/admin/regalos/actions";
import { searchRegaloProductos } from "@/app/admin/regalos/actions";

type AddAction = (id_regalo: number, formData: FormData) => Promise<void>;

type Props = {
  idRegalo: number;
  title: string;
  buttonLabel: string;
  excludedIds: number[];
  addAction: AddAction;
};

export function RegaloProductoAddModal({
  idRegalo,
  title,
  buttonLabel,
  excludedIds,
  addAction,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<RegaloProductoSearchRow[]>([]);
  const [searched, setSearched] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searching, startSearch] = useTransition();
  const [adding, startAdd] = useTransition();

  const excluded = new Set(excludedIds);
  const busy = searching || adding;

  function resetState() {
    setQuery("");
    setResults([]);
    setSearched(false);
    setSelectedId(null);
    setError(null);
  }

  function openModal() {
    resetState();
    setOpen(true);
  }

  function closeModal() {
    if (busy) return;
    setOpen(false);
    resetState();
  }

  function onSearch(e: FormEvent) {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed || busy) return;

    setError(null);
    setSelectedId(null);
    startSearch(async () => {
      try {
        const rows = await searchRegaloProductos(trimmed);
        setResults(rows);
        setSearched(true);
      } catch (err) {
        setResults([]);
        setSearched(true);
        setError(err instanceof Error ? err.message : "Error al buscar");
      }
    });
  }

  function onAdd() {
    if (!selectedId || excluded.has(selectedId) || busy) return;

    startAdd(async () => {
      try {
        const formData = new FormData();
        formData.set("id_producto", String(selectedId));
        await addAction(idRegalo, formData);
        router.refresh();
        setOpen(false);
        resetState();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al agregar");
      }
    });
  }

  const canAdd =
    selectedId != null && !excluded.has(selectedId) && !busy;

  return (
    <>
      <button
        type="button"
        className="btn btn-secondary"
        style={{ marginTop: "0.75rem" }}
        onClick={openModal}
      >
        {buttonLabel}
      </button>

      {open ? (
        <div className="oc-admin-modal-overlay" onClick={closeModal} role="presentation">
          <div
            className="oc-admin-modal oc-admin-modal--wide"
            role="dialog"
            aria-modal="true"
            aria-labelledby="regalo-producto-add-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="oc-admin-modal-head">
              <h2 id="regalo-producto-add-title">{title}</h2>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={closeModal}
                aria-label="Cerrar"
                disabled={busy}
              >
                ×
              </button>
            </div>

            <p className="muted" style={{ marginTop: 0, fontSize: "0.85rem" }}>
              Buscá por título o SKU, seleccioná un producto de la tabla y confirmá con
              Agregar.
            </p>

            <form onSubmit={onSearch} className="search-form" style={{ marginBottom: "1rem" }}>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Título o SKU…"
                autoFocus
                disabled={busy}
              />
              <button className="btn btn-secondary" type="submit" disabled={busy || !query.trim()}>
                {searching ? "Buscando…" : "Buscar"}
              </button>
            </form>

            {error ? (
              <p style={{ color: "#c00", fontSize: "0.85rem", marginTop: 0 }}>{error}</p>
            ) : null}

            {searched ? (
              <div className="oc-admin-modal-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th style={{ width: "2.5rem" }}></th>
                      <th>ID</th>
                      <th>SKU</th>
                      <th>Título</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((p) => {
                      const isLinked = excluded.has(p.id_producto);
                      const isSelected = selectedId === p.id_producto;
                      return (
                        <tr
                          key={p.id_producto}
                          className={
                            isLinked
                              ? "oc-admin-modal-row--disabled"
                              : isSelected
                                ? "oc-admin-modal-row--selected"
                                : undefined
                          }
                          onClick={() => {
                            if (!isLinked && !busy) setSelectedId(p.id_producto);
                          }}
                          style={{ cursor: isLinked || busy ? "default" : "pointer" }}
                        >
                          <td>
                            <input
                              type="radio"
                              name="regalo_producto_pick"
                              checked={isSelected}
                              disabled={isLinked || busy}
                              onChange={() => setSelectedId(p.id_producto)}
                              onClick={(e) => e.stopPropagation()}
                            />
                          </td>
                          <td>{p.id_producto}</td>
                          <td>{p.sku ?? "—"}</td>
                          <td>{p.titulo}</td>
                          <td>
                            {isLinked ? (
                              <span className="muted">Ya asociado</span>
                            ) : p.activo ? (
                              "Activo"
                            ) : (
                              <span className="muted">Inactivo</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {!results.length ? (
                      <tr>
                        <td colSpan={5} className="muted">
                          No hay resultados para &quot;{query.trim()}&quot;.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            ) : null}

            <div className="oc-admin-modal-actions" style={{ marginTop: "1rem" }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={closeModal}
                disabled={busy}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={onAdd}
                disabled={!canAdd}
              >
                {adding ? "Agregando…" : "Agregar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
