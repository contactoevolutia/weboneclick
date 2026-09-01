import Link from "next/link";
import { notFound } from "next/navigation";
import { RegaloProductoAddModal } from "@/components/admin/regalo-producto-add-modal";
import { RegaloTipoFields } from "@/components/admin/regalo-tipo-fields";
import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import {
  addRegaloProducto,
  addRegaloTriggerProducto,
  deleteRegalo,
  removeRegaloProducto,
  removeRegaloTriggerProducto,
  updateRegalo,
  updateRegaloTriggerCategorias,
} from "../actions";

type Params = Promise<{ id: string }>;

function toDatetimeLocal(d: Date | null) {
  if (!d) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default async function AdminRegaloDetailPage({
  params,
}: {
  params: Params;
}) {
  await requireAdmin();
  const { id } = await params;
  const id_regalo = Number(id);
  if (!Number.isFinite(id_regalo)) notFound();

  const regalo = await prisma.regalo.findUnique({
    where: { id_regalo },
    include: {
      usuario_creacion: { select: { mail: true } },
      productos: {
        include: {
          producto: {
            select: { id_producto: true, titulo: true, slug: true, sku: true },
          },
        },
      },
      trigger_productos: {
        include: {
          producto: {
            select: { id_producto: true, titulo: true, slug: true, sku: true },
          },
        },
      },
      trigger_categorias: true,
    },
  });
  if (!regalo) notFound();

  const categorias =
    regalo.tipo === "categoria"
      ? await prisma.categoria.findMany({ orderBy: [{ nivel: "asc" }, { nombre: "asc" }] })
      : [];

  const linkedIds = regalo.productos.map((p) => p.id_producto);
  const triggerLinkedIds = regalo.trigger_productos.map((p) => p.id_producto);
  const selectedTriggerCats = new Set(
    regalo.trigger_categorias.map((c) => c.id_categoria),
  );

  return (
    <div>
      <p>
        <Link href="/admin/regalos">← Regalos</Link>
      </p>
      <h1 style={{ marginTop: 0 }}>Editar regalo #{regalo.id_regalo}</h1>
      <p className="muted">
        Creado por {regalo.usuario_creacion.mail} el{" "}
        {regalo.fecha_creacion.toLocaleString("es-AR")}
      </p>

      <div className="admin-card">
        <form action={updateRegalo.bind(null, id_regalo)}>
          <div className="form-field">
            <label>Nombre</label>
            <input name="nombre" defaultValue={regalo.nombre} required />
          </div>
          <RegaloTipoFields
            defaultTipo={regalo.tipo}
            defaultMonto={
              regalo.monto_minimo != null ? Number(regalo.monto_minimo) : 750000
            }
            defaultPrioridad={regalo.prioridad}
          />
          <div className="form-field">
            <label>Vigencia desde</label>
            <input
              name="vigencia_desde"
              type="datetime-local"
              required
              defaultValue={toDatetimeLocal(regalo.vigencia_desde)}
            />
          </div>
          <div className="form-field">
            <label>Vigencia hasta (opcional)</label>
            <input
              name="vigencia_hasta"
              type="datetime-local"
              defaultValue={toDatetimeLocal(regalo.vigencia_hasta)}
            />
          </div>
          <div className="form-field">
            <label>
              <input name="activo" type="checkbox" defaultChecked={regalo.activo} /> Activo
            </label>
          </div>
          <button className="btn btn-primary" type="submit">
            Guardar
          </button>
        </form>
      </div>

      {regalo.tipo === "sku" ? (
        <div className="admin-card" style={{ marginTop: "1rem" }}>
          <h2 style={{ marginTop: 0, fontSize: "1.1rem" }}>SKUs que desbloquean el regalo</h2>
          <p className="muted" style={{ fontSize: "0.85rem" }}>
            El carrito califica si contiene al menos uno de estos productos.
          </p>

          <table className="admin-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>SKU</th>
                <th>Título</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {regalo.trigger_productos.map((row) => (
                <tr key={row.id_producto}>
                  <td>{row.id_producto}</td>
                  <td>{row.producto.sku ?? "—"}</td>
                  <td>
                    <Link href={`/admin/productos/${row.id_producto}`}>
                      {row.producto.titulo}
                    </Link>
                  </td>
                  <td>
                    <form
                      action={removeRegaloTriggerProducto.bind(
                        null,
                        id_regalo,
                        row.id_producto,
                      )}
                    >
                      <button type="submit" className="btn btn-ghost">
                        Quitar
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
              {!regalo.trigger_productos.length && (
                <tr>
                  <td colSpan={4}>Sin SKUs trigger asociados.</td>
                </tr>
              )}
            </tbody>
          </table>

          <RegaloProductoAddModal
            idRegalo={id_regalo}
            title="Agregar SKU trigger"
            buttonLabel="Buscar producto trigger"
            excludedIds={triggerLinkedIds}
            addAction={addRegaloTriggerProducto}
          />
        </div>
      ) : null}

      {regalo.tipo === "categoria" ? (
        <div className="admin-card" style={{ marginTop: "1rem" }}>
          <h2 style={{ marginTop: 0, fontSize: "1.1rem" }}>Categorías que desbloquean el regalo</h2>
          <p className="muted" style={{ fontSize: "0.85rem" }}>
            El carrito califica si contiene al menos un producto de alguna categoría
            seleccionada.
          </p>
          <form action={updateRegaloTriggerCategorias.bind(null, id_regalo)}>
            <div className="form-field" style={{ marginBottom: "0.35rem" }}>
              <div className="admin-cats-scroll">
                {categorias.map((c) => (
                  <label key={c.id_categoria} className={c.nivel > 1 ? "cat-indent" : undefined}>
                    <input
                      type="checkbox"
                      name="categorias"
                      value={c.id_categoria}
                      defaultChecked={selectedTriggerCats.has(c.id_categoria)}
                    />
                    <span style={{ paddingLeft: `${Math.max(0, c.nivel - 1) * 0.55}rem` }}>
                      {c.nombre}
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <button className="btn btn-primary" type="submit">
              Guardar categorías trigger
            </button>
          </form>
        </div>
      ) : null}

      <div className="admin-card" style={{ marginTop: "1rem" }}>
        <h2 style={{ marginTop: 0, fontSize: "1.1rem" }}>SKUs de regalo</h2>
        <p className="muted" style={{ fontSize: "0.85rem" }}>
          El cliente elige uno de estos productos en el checkout cuando califica la
          condición del regalo.
        </p>

        <table className="admin-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>SKU</th>
              <th>Título</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {regalo.productos.map((row) => (
              <tr key={row.id_producto}>
                <td>{row.id_producto}</td>
                <td>{row.producto.sku ?? "—"}</td>
                <td>
                  <Link href={`/admin/productos/${row.id_producto}`}>
                    {row.producto.titulo}
                  </Link>
                </td>
                <td>
                  <form
                    action={removeRegaloProducto.bind(
                      null,
                      id_regalo,
                      row.id_producto,
                    )}
                  >
                    <button type="submit" className="btn btn-ghost">
                      Quitar
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {!regalo.productos.length && (
              <tr>
                <td colSpan={4}>Sin productos asociados.</td>
              </tr>
            )}
          </tbody>
        </table>

        <RegaloProductoAddModal
          idRegalo={id_regalo}
          title="Agregar SKU de regalo"
          buttonLabel="Buscar producto de regalo"
          excludedIds={linkedIds}
          addAction={addRegaloProducto}
        />
      </div>

      <form action={deleteRegalo.bind(null, id_regalo)} style={{ marginTop: "1rem" }}>
        <button type="submit" className="btn btn-ghost" style={{ color: "#c00" }}>
          Eliminar regalo
        </button>
      </form>
    </div>
  );
}
