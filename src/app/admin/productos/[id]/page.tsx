import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductoSaveButton } from "@/components/admin/producto-save-button";
import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { formatPrice, uploadPublicUrl } from "@/lib/utils";
import {
  addPrecio,
  deleteCaracteristicaProducto,
  deleteProductoImagen,
  updateProducto,
  uploadProductoImagen,
  upsertCaracteristicaProducto,
  upsertStock,
} from "../../actions";

type Params = Promise<{ id: string }>;

export default async function AdminProductoDetailPage({ params }: { params: Params }) {
  await requireAdmin();
  const { id } = await params;
  const id_producto = Number(id);
  const product = await prisma.producto.findUnique({
    where: { id_producto },
    include: {
      precios: { orderBy: { fecha_desde: "desc" } },
      stocks: { include: { almacen: true } },
      categorias: true,
      caracteristicas: { include: { caracteristica: true } },
      archivos: { include: { archivo: true } },
    },
  });
  if (!product) notFound();

  const [categorias, almacenes, caracteristicas] = await Promise.all([
    prisma.categoria.findMany({ orderBy: [{ nivel: "asc" }, { nombre: "asc" }] }),
    prisma.almacen.findMany({ orderBy: { descripcion: "asc" } }),
    prisma.caracteristica.findMany({ orderBy: { nombre: "asc" } }),
  ]);

  const selectedCats = new Set(product.categorias.map((c) => c.id_categoria));

  return (
    <div>
      <p style={{ margin: "0 0 0.35rem", fontSize: "0.85rem" }}>
        <Link href="/admin/productos">← Productos</Link>
      </p>
      <h1 style={{ margin: "0 0 0.75rem", fontSize: "1.35rem" }}>
        Editar producto #{product.id_producto}
        {product.sku ? (
          <span className="muted" style={{ fontSize: "0.95rem", fontWeight: 400 }}>
            {" "}
            · SKU {product.sku}
          </span>
        ) : null}
        {product.slug ? (
          <span style={{ fontSize: "0.95rem", fontWeight: 400 }}>
            {" "}
            ·{" "}
            <Link href={`/producto/${product.slug}`} target="_blank" rel="noopener noreferrer">
              Ver publicación
            </Link>
          </span>
        ) : null}
      </h1>

      <div className="admin-edit-grid">
        <div className="admin-card">
          <h2>Datos</h2>
          <form action={updateProducto.bind(null, id_producto)}>
            <div className="admin-edit-inline">
              <div className="form-field">
                <label>Título</label>
                <input name="titulo" defaultValue={product.titulo} required />
              </div>
              <div className="form-field form-field-check">
                <label>
                  <input type="checkbox" name="activo" defaultChecked={product.activo} /> Activo
                </label>
              </div>
            </div>
            <div className="form-field">
              <label>Slug</label>
              <input name="slug" defaultValue={product.slug} required />
            </div>
            <div className="form-field">
              <label>Descripción</label>
              <textarea name="descripcion" rows={3} defaultValue={product.descripcion} required />
            </div>
            <div className="form-field" style={{ marginBottom: "0.35rem" }}>
              <label>Categorías</label>
              <div className="admin-cats-scroll">
                {categorias.map((c) => (
                  <label key={c.id_categoria} className={c.nivel > 1 ? "cat-indent" : undefined}>
                    <input
                      type="checkbox"
                      name="categorias"
                      value={c.id_categoria}
                      defaultChecked={selectedCats.has(c.id_categoria)}
                    />
                    <span style={{ paddingLeft: `${Math.max(0, c.nivel - 1) * 0.55}rem` }}>
                      {c.nombre}
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <ProductoSaveButton />
          </form>
        </div>

        <div className="admin-side-stack">
          <div className="admin-card">
            <h2>Precios</h2>
            <ul className="admin-compact-list">
              {product.precios.length === 0 ? (
                <li className="muted">Sin precios.</li>
              ) : (
                product.precios.map((p) => (
                  <li key={p.fecha_desde.toISOString()}>
                    {p.fecha_desde.toISOString().slice(0, 10)} — {formatPrice(p.precio)}
                  </li>
                ))
              )}
            </ul>
            <form action={addPrecio.bind(null, id_producto)} className="admin-inline-form">
              <input
                name="fecha_desde"
                type="date"
                defaultValue={new Date().toISOString().slice(0, 10)}
                required
              />
              <input name="precio" type="number" step="0.01" min="0" placeholder="Precio" required />
              <button className="btn btn-secondary" type="submit">
                Agregar
              </button>
            </form>
          </div>

          <div className="admin-card">
            <h2>Stock</h2>
            <ul className="admin-compact-list">
              {product.stocks.length === 0 ? (
                <li className="muted">Sin stock.</li>
              ) : (
                product.stocks.map((s) => (
                  <li key={s.id_almacen}>
                    {s.almacen.descripcion}: {Number(s.cantidad)}
                  </li>
                ))
              )}
            </ul>
            <form action={upsertStock.bind(null, id_producto)} className="admin-inline-form">
              <select name="id_almacen" required defaultValue="">
                <option value="" disabled>
                  Almacén
                </option>
                {almacenes.map((a) => (
                  <option key={a.id_almacen} value={a.id_almacen}>
                    {a.descripcion}
                  </option>
                ))}
              </select>
              <input name="cantidad" type="number" step="0.01" min="0" placeholder="Cantidad" required />
              <button className="btn btn-secondary" type="submit">
                Guardar
              </button>
            </form>
          </div>
        </div>

        <div className="admin-card">
          <h2>Características</h2>
          <table className="admin-table table table-compact">
            <thead>
              <tr>
                <th>Característica</th>
                <th>Valor</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {product.caracteristicas.length === 0 ? (
                <tr>
                  <td colSpan={3} className="muted">
                    Sin características.
                  </td>
                </tr>
              ) : (
                product.caracteristicas.map((c) => (
                  <tr key={c.id_caracteristica}>
                    <td>{c.caracteristica.nombre}</td>
                    <td>
                      {c.valor}
                      {c.valor_numerico ? (
                        <span className="muted" style={{ fontSize: "0.75rem" }}>
                          {" "}
                          (núm.)
                        </span>
                      ) : null}
                    </td>
                    <td>
                      <form
                        action={deleteCaracteristicaProducto.bind(
                          null,
                          id_producto,
                          c.id_caracteristica
                        )}
                      >
                        <button className="btn btn-ghost" type="submit" style={{ padding: "0.15rem 0.4rem", fontSize: "0.75rem" }}>
                          Quitar
                        </button>
                      </form>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <form
            action={upsertCaracteristicaProducto.bind(null, id_producto)}
            className="admin-inline-form"
            style={{ marginTop: "0.65rem" }}
          >
            <select name="id_caracteristica" required defaultValue="" style={{ flex: "1.4 1 8rem" }}>
              <option value="" disabled>
                Característica
              </option>
              {caracteristicas.map((c) => (
                <option key={c.id_caracteristica} value={c.id_caracteristica}>
                  {c.nombre}
                </option>
              ))}
            </select>
            <input name="valor" placeholder="Valor" required />
            <label style={{ display: "flex", alignItems: "center", gap: "0.3rem", fontSize: "0.8rem", whiteSpace: "nowrap" }}>
              <input type="checkbox" name="valor_numerico" style={{ width: "auto" }} /> Núm.
            </label>
            <button className="btn btn-secondary" type="submit">
              Agregar
            </button>
          </form>
        </div>

        <div className="admin-card">
          <h2>Imágenes</h2>
          <div className="admin-img-grid">
            {product.archivos.map((ap) => (
              <div key={ap.id_archivo}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={uploadPublicUrl(ap.archivo.link)} alt={ap.archivo.descripcion} />
                <form action={deleteProductoImagen.bind(null, id_producto, ap.id_archivo)}>
                  <button className="btn btn-ghost" type="submit">
                    Eliminar
                  </button>
                </form>
              </div>
            ))}
          </div>
          <form action={uploadProductoImagen.bind(null, id_producto)} className="admin-inline-form">
            <input name="imagen" type="file" accept="image/*" required style={{ flex: "1.5 1 8rem" }} />
            <input name="descripcion" placeholder="Descripción" style={{ flex: "1 1 6rem" }} />
            <button className="btn btn-secondary" type="submit">
              Subir
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
