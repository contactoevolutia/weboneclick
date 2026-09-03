import Link from "next/link";
import { ConfirmDeleteForm } from "@/app/admin/menu/confirm-delete-form";
import { requireAdmin } from "@/lib/auth-guard";
import { isCuponEditable } from "@/lib/cupones";
import { formatPriceArs } from "@/lib/pricing";
import { prisma } from "@/lib/prisma";
import { eliminarCupon } from "./actions";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function sp(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

const PAGE_SIZE = 50;

export default async function AdminDescuentosPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireAdmin();
  const q = await searchParams;
  const grupoFilter = (sp(q.grupo) || "").trim();
  const estadoFilter = (sp(q.estado) || "").trim();
  const codigoFilter = (sp(q.codigo) || "").trim().toUpperCase();
  const page = Math.max(1, Number(sp(q.page) || 1) || 1);

  const where = {
    ...(grupoFilter ? { grupo: grupoFilter } : {}),
    ...(estadoFilter === "emitido" || estadoFilter === "consumido"
      ? { estado: estadoFilter }
      : {}),
    ...(codigoFilter ? { codigo: { contains: codigoFilter } } : {}),
  };

  const [total, items, grupos] = await Promise.all([
    prisma.cupones_descuento.count({ where }),
    prisma.cupones_descuento.findMany({
      where,
      orderBy: [{ fecha_creacion: "desc" }, { id_cupon: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        usuario_creacion: { select: { mail: true } },
      },
    }),
    prisma.cupones_descuento.findMany({
      where: { grupo: { not: null } },
      distinct: ["grupo"],
      select: { grupo: true },
      orderBy: { grupo: "asc" },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const ok = sp(q.ok);
  const countCreated = sp(q.count);
  const prefijoOk = sp(q.prefijo);
  const edited = ok === "edit";
  const deleted = ok === "delete";

  const exportQs = new URLSearchParams();
  if (grupoFilter) exportQs.set("grupo", grupoFilter);
  if (estadoFilter) exportQs.set("estado", estadoFilter);
  if (codigoFilter) exportQs.set("q", codigoFilter);
  const exportHref = `/admin/descuentos/export${exportQs.toString() ? `?${exportQs}` : ""}`;

  function pageHref(p: number) {
    const params = new URLSearchParams();
    if (grupoFilter) params.set("grupo", grupoFilter);
    if (estadoFilter) params.set("estado", estadoFilter);
    if (codigoFilter) params.set("codigo", codigoFilter);
    if (p > 1) params.set("page", String(p));
    const s = params.toString();
    return `/admin/descuentos${s ? `?${s}` : ""}`;
  }

  return (
    <div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.5rem",
          alignItems: "center",
          marginBottom: "0.35rem",
        }}
      >
        <h1 style={{ margin: 0, flex: "1 1 auto" }}>Descuentos</h1>
        <a href={exportHref} className="btn btn-secondary">
          Exportar Excel
        </a>
        <Link href="/admin/descuentos/nuevo" className="btn btn-primary">
          Crear
        </Link>
      </div>
      <p className="muted" style={{ marginTop: 0, marginBottom: "0.85rem", fontSize: "0.85rem" }}>
        Cupones de monto fijo. Filtrá por grupo para exportar un lote.
      </p>

      {ok && !edited && !deleted && (
        <p
          className="admin-card"
          style={{
            marginBottom: "0.75rem",
            padding: "0.55rem 0.75rem",
            background: "#e8f5e9",
            borderColor: "#a5d6a7",
            fontSize: "0.85rem",
          }}
        >
          Se generaron <strong>{countCreated}</strong> cupones
          {prefijoOk ? (
            <>
              {" "}
              con prefijo <code>{prefijoOk}</code>
            </>
          ) : null}
          .
        </p>
      )}

      {edited && (
        <p
          className="admin-card"
          style={{
            marginBottom: "0.75rem",
            padding: "0.55rem 0.75rem",
            background: "#e8f5e9",
            borderColor: "#a5d6a7",
            fontSize: "0.85rem",
          }}
        >
          Cupón actualizado correctamente.
        </p>
      )}

      {deleted && (
        <p
          className="admin-card"
          style={{
            marginBottom: "0.75rem",
            padding: "0.55rem 0.75rem",
            background: "#e8f5e9",
            borderColor: "#a5d6a7",
            fontSize: "0.85rem",
          }}
        >
          Cupón eliminado correctamente.
        </p>
      )}

      <form
        method="get"
        className="admin-card"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.65rem",
          alignItems: "flex-end",
          marginBottom: "0.85rem",
          padding: "0.75rem",
        }}
      >
        <div className="form-field" style={{ margin: 0, minWidth: "10rem" }}>
          <label>Grupo</label>
          <select name="grupo" defaultValue={grupoFilter}>
            <option value="">Todos</option>
            {grupos.map((g) =>
              g.grupo ? (
                <option key={g.grupo} value={g.grupo}>
                  {g.grupo}
                </option>
              ) : null,
            )}
          </select>
        </div>
        <div className="form-field" style={{ margin: 0, minWidth: "8rem" }}>
          <label>Estado</label>
          <select name="estado" defaultValue={estadoFilter}>
            <option value="">Todos</option>
            <option value="emitido">Emitido</option>
            <option value="consumido">Consumido</option>
          </select>
        </div>
        <div className="form-field" style={{ margin: 0, minWidth: "12rem", flex: "1 1 12rem" }}>
          <label>Código</label>
          <input name="codigo" defaultValue={codigoFilter} placeholder="Buscar…" />
        </div>
        <button type="submit" className="btn btn-secondary">
          Filtrar
        </button>
        <Link href="/admin/descuentos" className="btn btn-ghost">
          Limpiar
        </Link>
      </form>

      <div className="admin-card" style={{ padding: 0, overflowX: "auto" }}>
        <table className="table table-compact">
          <thead>
            <tr>
              <th>Código</th>
              <th>Monto</th>
              <th>Vigencia</th>
              <th>Estado</th>
              <th>Grupo</th>
              <th>Creación</th>
              <th>Usuario</th>
              <th>Consumido</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={9} className="muted">
                  No hay cupones{grupoFilter || estadoFilter || codigoFilter ? " con estos filtros" : ""}.
                </td>
              </tr>
            ) : (
              items.map((row) => {
                const editable = isCuponEditable(row);
                return (
                <tr key={row.id_cupon}>
                  <td>
                    <code>{row.codigo}</code>
                  </td>
                  <td>{formatPriceArs(Number(row.monto))}</td>
                  <td>{row.fecha_vigencia.toISOString().slice(0, 10)}</td>
                  <td>{row.estado}</td>
                  <td>{row.grupo || "—"}</td>
                  <td style={{ whiteSpace: "nowrap", fontSize: "0.8rem" }}>
                    {row.fecha_creacion.toLocaleString("es-AR")}
                  </td>
                  <td style={{ fontSize: "0.8rem" }}>{row.usuario_creacion.mail}</td>
                  <td style={{ whiteSpace: "nowrap", fontSize: "0.8rem" }}>
                    {row.fecha_consumido
                      ? row.fecha_consumido.toLocaleString("es-AR")
                      : "—"}
                  </td>
                  <td style={{ whiteSpace: "nowrap", fontSize: "0.85rem" }}>
                    {editable ? (
                      <span style={{ display: "inline-flex", gap: "0.5rem", alignItems: "center" }}>
                        <Link href={`/admin/descuentos/${row.id_cupon}`}>Editar</Link>
                        <ConfirmDeleteForm
                          action={eliminarCupon.bind(null, row.id_cupon)}
                          message={`¿Eliminar el cupón ${row.codigo}? Esta acción no se puede deshacer.`}
                        >
                          <button type="submit" className="btn btn-ghost" style={{ padding: 0, color: "#c00" }}>
                            Eliminar
                          </button>
                        </ConfirmDeleteForm>
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              );
              })
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <p
          className="muted"
          style={{
            display: "flex",
            gap: "0.75rem",
            alignItems: "center",
            marginTop: "0.75rem",
            fontSize: "0.85rem",
          }}
        >
          <span>
            Página {page} de {totalPages} ({total} cupones)
          </span>
          {page > 1 && <Link href={pageHref(page - 1)}>← Anterior</Link>}
          {page < totalPages && <Link href={pageHref(page + 1)}>Siguiente →</Link>}
        </p>
      )}
    </div>
  );
}
