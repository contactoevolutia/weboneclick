import Link from "next/link";
import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { NewsletterExportButton } from "@/components/admin/newsletter-export-button";

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

export default async function AdminNewsletterPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const params = await searchParams;
  const q = params.q?.trim() || undefined;
  const estado = params.estado === "pendiente" || params.estado === "exportado" ? params.estado : undefined;
  const page = Math.max(1, Number(params.page || 1) || 1);

  const where = {
    ...(q ? { email: { contains: q } } : {}),
    ...(estado ? { estado } : {}),
  };

  const [suscripciones, total, pendientes] = await Promise.all([
    prisma.newsletter_suscripcion.findMany({
      where,
      orderBy: { creado_en: "desc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    }),
    prisma.newsletter_suscripcion.count({ where }),
    prisma.newsletter_suscripcion.count({ where: { estado: "pendiente" } }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function hrefFor(nextPage: number) {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (estado) sp.set("estado", estado);
    if (nextPage > 1) sp.set("page", String(nextPage));
    const qs = sp.toString();
    return qs ? `/admin/newsletter?${qs}` : "/admin/newsletter";
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
          <h1 style={{ marginTop: 0, marginBottom: "0.35rem" }}>Newsletter</h1>
          <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
            Suscripciones cargadas desde el sitio, de la más reciente a la más antigua.
          </p>
        </div>
        <NewsletterExportButton pendientes={pendientes} />
      </div>

      <form
        method="get"
        action="/admin/newsletter"
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
          <input name="q" defaultValue={q || ""} placeholder="Email…" />
        </div>
        <div className="form-field" style={{ margin: 0, minWidth: "10rem" }}>
          <label>Estado</label>
          <select name="estado" defaultValue={estado || ""}>
            <option value="">Todos</option>
            <option value="pendiente">Pendiente</option>
            <option value="exportado">Exportado</option>
          </select>
        </div>
        <button type="submit" className="btn btn-secondary">
          Buscar
        </button>
        <Link href="/admin/newsletter" className="btn btn-ghost">
          Limpiar
        </Link>
      </form>

      <table className="table table-compact">
        <thead>
          <tr>
            <th>ID</th>
            <th>Email</th>
            <th>Estado</th>
            <th>Fecha alta</th>
            <th>Exportado</th>
          </tr>
        </thead>
        <tbody>
          {suscripciones.length === 0 ? (
            <tr>
              <td colSpan={5} className="muted">
                No se encontraron suscripciones.
              </td>
            </tr>
          ) : (
            suscripciones.map((s) => (
              <tr key={s.id_newsletter_suscripcion}>
                <td>{s.id_newsletter_suscripcion}</td>
                <td>{s.email}</td>
                <td>{s.estado === "exportado" ? "Exportado" : "Pendiente"}</td>
                <td>{formatFecha(s.creado_en)}</td>
                <td>{formatFecha(s.exportado_en)}</td>
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
            Página {page} de {totalPages} ({total} suscripci{total === 1 ? "ón" : "ones"})
          </span>
          {page > 1 && <Link href={hrefFor(page - 1)}>← Anterior</Link>}
          {page < totalPages && <Link href={hrefFor(page + 1)}>Siguiente →</Link>}
        </p>
      )}
    </div>
  );
}
