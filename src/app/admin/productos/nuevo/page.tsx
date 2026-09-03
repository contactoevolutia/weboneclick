import Link from "next/link";
import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { createProducto } from "../../actions";

export default async function AdminNuevoProductoPage() {
  await requireAdmin();
  const categorias = await prisma.categoria.findMany({
    orderBy: [{ nivel: "asc" }, { nombre: "asc" }],
  });

  return (
    <div>
      <p>
        <Link href="/admin/productos">← Productos</Link>
      </p>
      <h1 style={{ marginTop: 0 }}>Nuevo producto</h1>

      <div className="admin-card">
        <form action={createProducto}>
          <div className="form-field">
            <label>Título</label>
            <input name="titulo" required />
          </div>
          <div className="form-field">
            <label>Slug</label>
            <input name="slug" placeholder="Se genera del título si lo dejás vacío" />
          </div>
          <div className="form-field">
            <label>Descripción</label>
            <textarea name="descripcion" rows={3} required />
          </div>
          <div className="form-field">
            <label>Precio inicial</label>
            <input name="precio" type="number" step="0.01" min="0" />
          </div>
          <div className="form-field">
            <label>Categorías</label>
            <table className="admin-table">
              <thead>
                <tr>
                  <th style={{ width: "4rem" }}>Asociar</th>
                  <th>ID</th>
                  <th>Nombre</th>
                  <th>Nivel</th>
                </tr>
              </thead>
              <tbody>
                {categorias.map((c) => (
                  <tr key={c.id_categoria}>
                    <td>
                      <input
                        type="checkbox"
                        name="categorias"
                        value={c.id_categoria}
                        aria-label={`Asociar ${c.nombre}`}
                      />
                    </td>
                    <td>{c.id_categoria}</td>
                    <td style={{ paddingLeft: `${(c.nivel - 1) * 0.75 + 0.8}rem` }}>{c.nombre}</td>
                    <td>{c.nivel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="actions">
            <button className="btn btn-primary" type="submit">
              Crear
            </button>
            <Link href="/admin/productos" className="btn btn-ghost">
              Cancelar
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
