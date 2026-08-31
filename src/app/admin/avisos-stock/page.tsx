import Link from "next/link";
import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";

type SearchParams = Promise<{ q?: string; estado?: string; page?: string }>;

const PAGE_SIZE = 15;

function formatFecha(value: Date | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(value);
}

export default async function AdminAvisosStockPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const params = await searchParams;
  const q = params.q?.trim() || undefined;
  const estado = params.estado === "pendiente" || params.estado === "notificado" ? params.estado : undefined;
  const page = Math.max(1, Number(params.page || 1) || 1);

  const where = {
    ...(q
      ? {
          OR: [
            { email: { contains: q } },
            { producto: { titulo: { contains: q } } },
            { producto: { sku: { contains: q } } },
          ],
        }
      : {}),
    ...(estado ? { estado } : {}),
  };

  const [avisos, total, pendientes] = await Promise.all([
    prisma.aviso_stock.findMany({
      where,
      orderBy: { creado_en: "desc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
      include: { producto: { select: { titulo: true, slug: true, sku: true } } },
    }),
    prisma.aviso_stock.count({ where }),
    prisma.aviso_stock.count({ where: { estado: "pendiente" } }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function hrefFor(nextPage: number) {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (estado) sp.set("estado", estado);
    if (nextPage > 1) sp.set("page", String(nextPage));
    const qs = sp.toString();
    return qs ? `/admin/avisos-stock?${qs}` : "/admin/avisos-stock";
  }

  return (
    <div>
      <div style={{ marginBottom: "0.85rem" }}>
        <h1 style={{ marginTop: 0, marginBottom: "0.35rem" }}>Avisos de stock</h1>
        <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
          Clientes que pidieron aviso cuando un producto vuelva a estar disponible. Pendientes:{" "}
          {pendientes}.
        </p>
      </div>

      <form
        method="get"
        action="/admin/avisos-stock"
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
        <div className="form-field" style={{ margin: 0, minWidth: "12rem", flex: "1 1 12rem" }}>
          <label>Buscar</label>
          <input name="q" defaultValue={q || ""} placeholder="Email, producto o SKU…" />
        </div>
        <div className="form-field" style={{ margin: 0, minWidth: "10rem" }}>
          <label>Estado</label>
          <select name="estado" defaultValue={estado || ""}>
            <option value="">Todos</option>
            <option value="pendiente">Pendiente</option>
            <option value="notificado">Notificado</option>
          </select>
        </div>
        <button type="submit" className="btn btn-secondary">
          Buscar
        </button>
        <Link href="/admin/avisos-stock" className="btn btn-ghost">
          Limpiar
        </Link>
      </form>

      <table className="table table-compact">
        <thead>
          <tr>
            <th>ID</th>
            <th>Producto</th>
            <th>Email</th>
            <th>Estado</th>
            <th>Fecha alta</th>
            <th>Notificado</th>
          </tr>
        </thead>
        <tbody>
          {avisos.length === 0 ? (
            <tr>
              <td colSpan={6} className="muted">
                No se encontraron avisos.
              </td>
            </tr>
          ) : (
            avisos.map((a) => (
              <tr key={a.id_aviso_stock}>
                <td>{a.id_aviso_stock}</td>
                <td>
                  <Link href={`/producto/${a.producto.slug}`} target="_blank">
                    {a.producto.titulo}
                  </Link>
                  {a.producto.sku ? (
                    <span className="muted" style={{ display: "block", fontSize: "0.8rem" }}>
                      {a.producto.sku}
                    </span>
                  ) : null}
                </td>
                <td>{a.email}</td>
                <td>{a.estado === "notificado" ? "Notificado" : "Pendiente"}</td>
                <td>{formatFecha(a.creado_en)}</td>
                <td>{formatFecha(a.notificado_en)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>

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
            Página {page} de {totalPages} ({total} aviso{total === 1 ? "" : "s"})
          </span>
          {page > 1 && <Link href={hrefFor(page - 1)}>← Anterior</Link>}
          {page < totalPages && <Link href={hrefFor(page + 1)}>Siguiente →</Link>}
        </p>
      )}
    </div>
  );
}
