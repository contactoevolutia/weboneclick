import Link from "next/link";
import { notFound } from "next/navigation";
import { timingSafeEqual } from "crypto";
import { PurchaseTracker } from "@/components/purchase-tracker";
import { prisma } from "@/lib/prisma";
import { formatPrice } from "@/lib/utils";

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ mp?: string; t?: string }>;

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Params }) {
  const { id } = await params;
  return {
    title: `Pedido #${id}`,
    robots: { index: false, follow: false },
  };
}

function tokensMatch(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

export default async function ConfirmacionPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const { mp, t } = await searchParams;
  const id_venta = Number(id);
  if (!id_venta || !t?.trim()) notFound();

  const venta = await prisma.venta.findUnique({
    where: { id_venta },
    include: {
      cliente: true,
      detalles: { orderBy: { item: "asc" } },
      pagos: true,
      envios: { include: { direccion: true } },
      tienda_retiro: true,
    },
  });
  if (!venta || !tokensMatch(venta.access_token, t.trim())) notFound();

  const pagosMp = venta.pagos.filter((p) =>
    ["mercado_pago", "tarjeta"].includes(p.tipo_pago),
  );
  const pagoAprobado =
    venta.estado === "pagada" ||
    pagosMp.some((p) => p.estado === "aprobado");
  const envio = venta.envios[0];
  const purchaseItems = venta.detalles.map((d) => ({
    item_id: String(d.id_producto),
    item_name: d.nombre_producto,
    quantity: Number(d.cantidad),
    price: Number(d.precio_unitario),
  }));

  return (
    <section className="section">
      <div className="container">
        {pagoAprobado ? (
          <PurchaseTracker
            idVenta={venta.id_venta}
            total={Number(venta.total)}
            items={purchaseItems}
            pagoAprobado={pagoAprobado}
          />
        ) : null}
        <div className="admin-card confirmation-card">
          <h1 style={{ marginTop: 0 }}>
            {pagoAprobado
              ? "¡Pago aprobado!"
              : mp === "failure"
                ? "No pudimos procesar el pago"
                : "Recibimos tu pedido"}
          </h1>
          <p className="muted">Número de venta #{venta.id_venta}</p>
          {venta.odoo_order_name && (
            <p className="muted">Pedido Odoo: {venta.odoo_order_name}</p>
          )}

          <p>
            Gracias {venta.cliente.nombre}. Registramos tu pedido por{" "}
            <strong>{formatPrice(venta.total)}</strong>.
          </p>

          {pagosMp.length > 0 ? (
            <div className="alert alert-info">
              {venta.estado === "pagada"
                ? venta.odoo_sync_estado === "ok"
                  ? "Mercado Pago confirmó el pago. Tu pedido fue registrado en nuestro sistema."
                  : venta.odoo_sync_estado === "error"
                    ? "Mercado Pago confirmó el pago. Estamos procesando el registro interno; si el problema persiste contactanos."
                    : "Mercado Pago confirmó el pago. Estamos registrando tu pedido en nuestro sistema."
                : pagoAprobado
                  ? "Recibimos un pago parcial. Cuando Mercado Pago acredite el resto, confirmamos el pedido."
                  : mp === "failure"
                    ? "El pago fue rechazado o cancelado. Podés volver al carrito para intentarlo nuevamente."
                    : "Estamos verificando el pago con Mercado Pago. Actualizaremos el pedido cuando recibamos la confirmación."}
            </div>
          ) : null}

          {venta.tipo_entrega === "retiro" && venta.tienda_retiro ? (
            <div className="alert alert-info">
              {pagoAprobado ? (
                <>
                  Tu pedido ya está <strong>listo para retirar</strong> en{" "}
                  <strong>{venta.tienda_retiro.nombre}</strong>.
                </>
              ) : (
                <>
                  Elegiste <strong>retiro en tienda</strong>
                </>
              )}
              <p style={{ marginBottom: 0, marginTop: pagoAprobado ? 8 : 0 }}>
                {!pagoAprobado && (
                  <>
                    <strong>{venta.tienda_retiro.nombre}</strong>
                    <br />
                  </>
                )}
                {venta.tienda_retiro.direccion}, {venta.tienda_retiro.localidad}
                {venta.tienda_retiro.horarios && (
                  <>
                    <br />
                    Horario de atención: {venta.tienda_retiro.horarios}
                  </>
                )}
              </p>
            </div>
          ) : pagosMp.length === 0 ? (
            <div className="alert alert-info">
              Elegiste <strong>envío a domicilio</strong>. El pedido quedó pendiente de pago.
              {envio?.direccion && (
                <p style={{ marginBottom: 0 }}>
                  Envío a: {envio.direccion.calle} {envio.direccion.numero}
                  {envio.direccion.piso ? `, piso ${envio.direccion.piso}` : ""}
                  {envio.direccion.departamento
                    ? ` ${envio.direccion.departamento}`
                    : ""}
                  , {envio.direccion.localidad}, {envio.direccion.provincia}.
                </p>
              )}
            </div>
          ) : null}

          <h2>Detalle</h2>
          <ul className="order-summary-list">
            {venta.detalles.map((d) => (
              <li key={d.item}>
                <span>
                  {d.nombre_producto} × {Number(d.cantidad)}
                </span>
                <strong>{formatPrice(d.subtotal)}</strong>
              </li>
            ))}
          </ul>

          <div className="order-summary-totals">
            <div>
              <span>Subtotal</span>
              <strong>{formatPrice(venta.subtotal)}</strong>
            </div>
            <div>
              <span>Envío</span>
              <strong>{formatPrice(venta.costo_envio)}</strong>
            </div>
            <div className="order-total">
              <span>Total</span>
              <strong>{formatPrice(venta.total)}</strong>
            </div>
            {pagosMp.length > 0 && (
              <div>
                <span>Pago</span>
                <strong>
                  {pagosMp
                    .map((p) => `${p.tipo_pago} · ${p.estado}`)
                    .join(" + ")}
                </strong>
              </div>
            )}
          </div>

          <div className="actions">
            <Link href="/shop" className="btn btn-primary">
              Seguir comprando
            </Link>
            <Link href="/" className="btn btn-ghost">
              Volver al inicio
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
