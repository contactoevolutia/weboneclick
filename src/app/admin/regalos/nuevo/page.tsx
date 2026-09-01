import Link from "next/link";
import { requireAdmin } from "@/lib/auth-guard";
import { RegaloTipoFields } from "@/components/admin/regalo-tipo-fields";
import { createRegalo } from "../actions";

export default async function AdminNuevoRegaloPage() {
  await requireAdmin();

  return (
    <div>
      <p>
        <Link href="/admin/regalos">← Regalos</Link>
      </p>
      <h1 style={{ marginTop: 0 }}>Nuevo regalo</h1>

      <div className="admin-card">
        <form action={createRegalo}>
          <div className="form-field">
            <label>Nombre</label>
            <input name="nombre" required placeholder="Juguete Ditoys / Cartas selección" />
          </div>
          <RegaloTipoFields />
          <div className="form-field">
            <label>Vigencia desde</label>
            <input name="vigencia_desde" type="datetime-local" required />
          </div>
          <div className="form-field">
            <label>Vigencia hasta (opcional)</label>
            <input name="vigencia_hasta" type="datetime-local" />
          </div>
          <button className="btn btn-primary" type="submit">
            Crear
          </button>
        </form>
      </div>
    </div>
  );
}
