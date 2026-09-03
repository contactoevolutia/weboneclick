import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmDeleteForm } from "@/app/admin/menu/confirm-delete-form";
import { requireAdmin } from "@/lib/auth-guard";
import { formatPriceArs } from "@/lib/pricing";
import { isCuponEditable } from "@/lib/cupones";
import { prisma } from "@/lib/prisma";
import { actualizarCupon, eliminarCupon } from "../actions";

type Params = Promise<{ id: string }>;

export const dynamic = "force-dynamic";

export default async function AdminEditarDescuentoPage({
  params,
}: {
  params: Params;
}) {
  await requireAdmin();
  const { id } = await params;
  const id_cupon = Number(id);
  if (!Number.isFinite(id_cupon)) notFound();

  const cupon = await prisma.cupones_descuento.findUnique({
    where: { id_cupon },
    include: {
      usuario_creacion: { select: { mail: true } },
    },
  });
  if (!cupon) notFound();

  const editable = isCuponEditable(cupon);

  return (
    <div>
      <p>
        <Link href="/admin/descuentos">← Descuentos</Link>
      </p>
      <h1 style={{ marginTop: 0 }}>Editar cupón</h1>
      <p className="muted" style={{ marginTop: 0, fontSize: "0.85rem" }}>
        Código <code>{cupon.codigo}</code> · creado por {cupon.usuario_creacion.mail}{" "}
        el {cupon.fecha_creacion.toLocaleString("es-AR")}
      </p>

      {!editable ? (
        <div className="admin-card" style={{ marginTop: "0.75rem" }}>
          <p style={{ margin: 0 }}>
            Este cupón no se puede editar ni eliminar porque{" "}
            {cupon.estado === "consumido" || cupon.id_venta != null
              ? "ya está asociado a una venta"
              : "no está en estado emitido"}
            .
          </p>
          {cupon.id_venta != null && (
            <p style={{ margin: "0.5rem 0 0", fontSize: "0.85rem" }}>
              <Link href={`/admin/ventas/${cupon.id_venta}`}>
                Ver venta #{cupon.id_venta}
              </Link>
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="admin-card">
            <form action={actualizarCupon.bind(null, id_cupon)}>
              <div className="form-field">
                <label>Código</label>
                <input value={cupon.codigo} readOnly disabled />
              </div>
              <div className="form-field">
                <label>Monto de descuento (ARS)</label>
                <input
                  name="monto"
                  type="number"
                  min={1}
                  step="0.01"
                  required
                  defaultValue={Number(cupon.monto)}
                />
              </div>
              <div className="form-field">
                <label>Fecha de vigencia</label>
                <input
                  name="fecha_vigencia"
                  type="date"
                  required
                  defaultValue={cupon.fecha_vigencia.toISOString().slice(0, 10)}
                />
                <p className="muted" style={{ margin: "0.35rem 0 0", fontSize: "0.8rem" }}>
                  El cupón es válido hasta el final de ese día.
                </p>
              </div>
              <div className="form-field">
                <label>Grupo (opcional)</label>
                <input
                  name="grupo"
                  placeholder="Campaña abril / EmpresaA"
                  maxLength={100}
                  defaultValue={cupon.grupo ?? ""}
                />
              </div>
              <p className="muted" style={{ fontSize: "0.85rem", margin: "0 0 0.75rem" }}>
                Monto actual: {formatPriceArs(Number(cupon.monto))}
              </p>
              <button type="submit" className="btn btn-primary">
                Guardar cambios
              </button>
            </form>
          </div>

          <ConfirmDeleteForm
            action={eliminarCupon.bind(null, id_cupon)}
            message={`¿Eliminar el cupón ${cupon.codigo}? Esta acción no se puede deshacer.`}
          >
            <button type="submit" className="btn btn-ghost" style={{ color: "#c00" }}>
              Eliminar cupón
            </button>
          </ConfirmDeleteForm>
        </>
      )}
    </div>
  );
}
