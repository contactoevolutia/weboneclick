import Link from "next/link";
import { Prisma } from "@prisma/client";
import { requireVentasAccess } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import {
  endOfDayAr,
  formatDateTime,
  formatPrice,
  startOfDayAr,
  toDateInputValueAr,
} from "@/lib/utils";

type SearchParams = Promise<{
  desde?: string;
  hasta?: string;
  tipo_entrega?: string;
  estado?: string;
  id_tienda?: string;
  page?: string;
}>;

const PAGE_SIZE = 20;

const ESTADOS = ["pendiente", "pagada", "cancelada"] as const;
const TIPOS_ENTREGA = [
  { value: "envio", label: "Envío" },
  { value: "retiro", label: "Retiro" },
] as const;

function defaultDateRange() {
  const now = new Date();
  const desde = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  return {
    desde: toDateInputValueAr(desde),
    hasta: toDateInputValueAr(now),
  };
}

function labelEntrega(tipo: string) {
  return tipo === "retiro" ? "Retiro" : tipo === "envio" ? "Envío" : tipo;
}

// Una venta puede acumular varios intentos de cobro: el aprobado manda sobre
// los rechazados previos, y si no hay aprobado se muestra el intento más reciente.
function pagoRelevante<T extends { estado: string }>(pagos: T[]): T | undefined {
  return pagos.find((p) => p.estado === "aprobado") ?? pagos[0];
}

function truncateComentario(value: string | null | undefined, max = 60) {
  if (!value) return "—";
  const text = value.trim();
  if (!text) return "—";
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export default async function AdminVentasPage({ searchParams }: { searchParams: SearchParams }) {
  await requireVentasAccess();
  const params = await searchParams;
  const defaults = defaultDateRange();
  const desde = params.desde || defaults.desde;
  const hasta = params.hasta || defaults.hasta;
  const tipo_entrega = params.tipo_entrega?.trim() || "";
  const estado = params.estado?.trim() || "";
  const id_tienda = Number(params.id_tienda || 0) || 0;
  const page = Math.max(1, Number(params.page || 1) || 1);

  const where: Prisma.ventaWhereInput = {
    fecha_hora: {
      gte: startOfDayAr(desde),
      lte: endOfDayAr(hasta),
    },
  };
  if (tipo_entrega === "envio" || tipo_entrega === "retiro") {
    where.tipo_entrega = tipo_entrega;
  }
  if (estado) {
    where.estado = estado;
  }
  if (id_tienda > 0) {
    where.id_tienda_retiro = id_tienda;
  }

  const [ventas, total, tiendas] = await Promise.all([
    prisma.venta.findMany({
      where,
      include: {
        cliente: true,
        pagos: { orderBy: { id_pago: "desc" } },
        tienda_retiro: true,
      },
      orderBy: { fecha_hora: "desc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    }),
    prisma.venta.count({ where }),
    prisma.tienda.findMany({
      where: { activo: true },
      orderBy: { nombre: "asc" },
      select: { id_tienda: true, nombre: true },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function hrefFor(nextPage: number) {
    const sp = new URLSearchParams();
    sp.set("desde", desde);
    sp.set("hasta", hasta);
    if (tipo_entrega) sp.set("tipo_entrega", tipo_entrega);
    if (estado) sp.set("estado", estado);
    if (id_tienda > 0) sp.set("id_tienda", String(id_tienda));
    if (nextPage > 1) sp.set("page", String(nextPage));
    return `/admin/ventas?${sp.toString()}`;
  }

  return (
    <div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.5rem",
          alignItems: "center",
          marginBottom: "0.85rem",
        }}
      >
        <div style={{ flex: "1 1 auto" }}>
          <h1 style={{ marginTop: 0, marginBottom: "0.35rem" }}>Ventas</h1>
          <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
            Pedidos del sitio. Por defecto se muestra la última semana.
          </p>
        </div>
      </div>

      <form
        method="get"
        action="/admin/ventas"
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
        <div className="form-field" style={{ margin: 0, minWidth: "9rem" }}>
          <label>Desde</label>
          <input type="date" name="desde" defaultValue={desde} required />
        </div>
        <div className="form-field" style={{ margin: 0, minWidth: "9rem" }}>
          <label>Hasta</label>
          <input type="date" name="hasta" defaultValue={hasta} required />
        </div>
        <div className="form-field" style={{ margin: 0, minWidth: "8rem" }}>
          <label>Tipo de entrega</label>
          <select name="tipo_entrega" defaultValue={tipo_entrega}>
            <option value="">Todos</option>
            {TIPOS_ENTREGA.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div className="form-field" style={{ margin: 0, minWidth: "8rem" }}>
          <label>Estado</label>
          <select name="estado" defaultValue={estado}>
            <option value="">Todos</option>
            {ESTADOS.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
        </div>
        <div className="form-field" style={{ margin: 0, minWidth: "10rem" }}>
          <label>Tienda</label>
          <select name="id_tienda" defaultValue={id_tienda > 0 ? String(id_tienda) : ""}>
            <option value="">Todas</option>
            {tiendas.map((t) => (
              <option key={t.id_tienda} value={t.id_tienda}>
                {t.nombre}
              </option>
            ))}
          </select>
        </div>
        <button className="btn btn-secondary" type="submit">
          Filtrar
        </button>
        <Link href="/admin/ventas" className="btn btn-ghost">
          Última semana
        </Link>
      </form>

      <table className="table table-compact">
        <thead>
          <tr>
            <th>ID</th>
            <th>Fecha</th>
            <th>Cliente</th>
            <th>Entrega</th>
            <th>Tienda</th>
            <th>Estado</th>
            <th>Pago</th>
            <th>Total</th>
            <th>Contactado</th>
            <th>Comentario</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {ventas.length === 0 ? (
            <tr>
              <td colSpan={11} className="muted">
                No hay ventas en el período seleccionado.
              </td>
            </tr>
          ) : (
            ventas.map((v) => {
              const pago = pagoRelevante(v.pagos);
              return (
                <tr key={v.id_venta}>
                  <td>#{v.id_venta}</td>
                  <td>{formatDateTime(v.fecha_hora)}</td>
                  <td>
                    {v.cliente.nombre} {v.cliente.apellido}
                    <br />
                    <span className="muted">{v.cliente.mail}</span>
                  </td>
                  <td>{labelEntrega(v.tipo_entrega)}</td>
                  <td>{v.tienda_retiro?.nombre ?? "—"}</td>
                  <td>{v.estado}</td>
                  <td>
                    {pago ? (
                      <>
                        {pago.tipo_pago}
                        <br />
                        <span className="muted">{pago.estado}</span>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>{formatPrice(v.total)}</td>
                  <td>{v.contactado ? "Sí" : "No"}</td>
                  <td title={v.comentario?.trim() || undefined}>
                    {truncateComentario(v.comentario)}
                  </td>
                  <td>
                    <Link href={`/admin/ventas/${v.id_venta}`}>Ver</Link>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>

      {(totalPages > 1 || total > 0) && (
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
            {totalPages > 1
              ? `Página ${page} de ${totalPages} (${total} venta${total === 1 ? "" : "s"})`
              : `${total} venta${total === 1 ? "" : "s"}`}
          </span>
          {page > 1 && <Link href={hrefFor(page - 1)}>← Anterior</Link>}
          {page < totalPages && <Link href={hrefFor(page + 1)}>Siguiente →</Link>}
        </p>
      )}
    </div>
  );
}
