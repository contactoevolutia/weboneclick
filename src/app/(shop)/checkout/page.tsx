import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, isGoogleAuthConfigured } from "@/auth";
import { CheckoutCoupon } from "@/components/checkout-coupon";
import { CheckoutDeliveryFields } from "@/components/checkout-delivery-fields";
import { CheckoutForm } from "@/components/checkout-form";
import { CheckoutGiftSelector } from "@/components/checkout-gift-selector";
import { CheckoutIdempotencyBootstrap } from "@/components/checkout-idempotency-bootstrap";
import { CheckoutOrderSummary } from "@/components/checkout-order-summary";
import { CheckoutPaymentOptions } from "@/components/checkout-payment-options";
import { CheckoutTaxDocumentFields } from "@/components/checkout-tax-document-fields";
import { CheckoutStep, CheckoutWizard } from "@/components/checkout-wizard";
import { BeginCheckoutTracker } from "@/components/funnel-trackers";
import { computeTotals } from "@/lib/checkout-venta";
import {
  cartMaxInstallments,
  estimateIvaRate,
  ivaIncluded,
  resolveCart,
  resolveCheckoutEntregaDisponibilidad,
} from "@/lib/cart";
import { resolveAppliedCupon } from "@/lib/cupones";
import type { AlignGrossItem } from "@/lib/odoo-amount";
import { getDescuentoContadoConfig } from "@/lib/parametros";
import {
  factorDescuentoContado,
  labelModoContado,
  productoCalificaDescuentoContado,
} from "@/lib/pricing";
import { prisma } from "@/lib/prisma";
import { isMercadoPagoConfigured } from "@/lib/mercadopago";
import { getRegaloApplicable } from "@/lib/regalos";
import { continueAsGuest, continueWithGoogle } from "./identity-actions";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Finalizar compra",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ modo?: string }>;

export default async function CheckoutPage({ searchParams }: { searchParams: SearchParams }) {
  const cart = await resolveCart();
  if (cart.items.length === 0) redirect("/carrito");
  if (!cart.canCheckout) redirect("/carrito");

  const params = await searchParams;
  const session = await auth();
  const isGuest = params.modo === "invitado";
  const isAuthenticated = !!session?.user?.email && !isGuest;

  if (!isAuthenticated && !isGuest) {
    return <CheckoutIdentityGate googleConfigured={isGoogleAuthConfigured()} />;
  }

  const cliente = isAuthenticated
    ? await prisma.cliente.findFirst({
        where: {
          OR: [
            { mail: session!.user!.email!.toLowerCase() },
            ...(session!.user!.id > 0
              ? [{ id_usuario: session!.user!.id }]
              : []),
          ],
        },
        include: {
          direccion_principal: true,
          direcciones: { orderBy: { id_direccion: "desc" }, take: 1 },
        },
      })
    : null;

  const mailLocked = isAuthenticated;
  const mercadoPagoConfigured = isMercadoPagoConfigured();
  const mpPublicKey = process.env.NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY?.trim() || null;
  const cupon = await resolveAppliedCupon();
  const cuponMonto = cupon?.monto ?? 0;
  const descuentoContadoConfig = await getDescuentoContadoConfig();
  const totalsContado = computeTotals(
    cart,
    "mercado_pago",
    cuponMonto,
    descuentoContadoConfig,
  );
  const totalsTarjeta = computeTotals(
    cart,
    "tarjeta",
    cuponMonto,
    descuentoContadoConfig,
  );
  const descuentoCupon = totalsTarjeta.descuentoCupon;
  const eligibleContado = cart.items.filter((i) =>
    productoCalificaDescuentoContado(
      i.cuotas_max,
      descuentoContadoConfig.umbralCuotas,
    ),
  ).length;
  const descuentoContadoParcial =
    eligibleContado > 0 && eligibleContado < cart.items.length;
  const contadoSummaryLabel = labelModoContado({
    porcentaje: descuentoContadoConfig.porcentaje,
    descuentoMonto: totalsContado.descuentoContado,
    parcial: descuentoContadoParcial,
  });
  const regalo = await getRegaloApplicable(cart.subtotal);

  const itemsTarjeta: AlignGrossItem[] = totalsTarjeta.itemsCobro.map((i) => ({
    ...i,
    rate: estimateIvaRate(i.titulo),
  }));
  const itemsContado: AlignGrossItem[] = totalsContado.itemsCobro.map((i) => ({
    ...i,
    rate: estimateIvaRate(i.titulo),
  }));

  const addressDefaults =
    cliente?.direccion_principal ?? cliente?.direcciones[0] ?? null;

  const { envioDisponible, retiroDisponible } =
    await resolveCheckoutEntregaDisponibilidad(cart.items);

  // Si el cliente aún no tiene nombre real (alta Google), usar el de la sesión
  const sessionName = (session?.user?.name || "").trim();
  const sessionParts = sessionName.split(/\s+/).filter(Boolean);
  const defaultNombre =
    cliente?.nombre && cliente.nombre !== "Cliente"
      ? cliente.nombre
      : sessionParts[0] || cliente?.nombre || "";
  const defaultApellido =
    cliente?.apellido && cliente.apellido !== "-" && cliente.apellido !== "Google"
      ? cliente.apellido
      : sessionParts.length > 1
        ? sessionParts.slice(1).join(" ")
        : cliente?.apellido && cliente.apellido !== "-"
          ? cliente.apellido
          : "";

  let iva105 = 0;
  let iva21 = 0;
  for (const item of cart.items) {
    if (item.subtotal == null || !item.disponible) continue;
    const tax = ivaIncluded(item.subtotal, item.ivaRate);
    if (item.ivaRate <= 0.11) iva105 += tax;
    else iva21 += tax;
  }

  const factorContado = factorDescuentoContado(
    descuentoContadoConfig.porcentaje,
  );
  const orderLines = cart.items.map((item) => {
    const elegible = productoCalificaDescuentoContado(
      item.cuotas_max,
      descuentoContadoConfig.umbralCuotas,
    );
    const subtotalLista = item.subtotal ?? 0;
    const subtotalContado =
      elegible && factorContado > 0 && item.precio != null
        ? Math.round(item.precio * (1 - factorContado) * item.cantidad * 100) /
          100
        : subtotalLista;
    return {
      id_producto: item.id_producto,
      titulo: item.titulo,
      cantidad: item.cantidad,
      subtotalLista,
      subtotalContado,
      elegibleContado: elegible,
    };
  });

  const beginCheckoutItems = cart.items
    .filter((i) => i.disponible && i.precio != null)
    .map((i) => ({
      item_id: String(i.id_producto),
      item_name: i.titulo,
      quantity: i.cantidad,
      price: i.precio ?? undefined,
    }));

  return (
    <div className="oc-checkout-page">
      <BeginCheckoutTracker value={cart.subtotal} items={beginCheckoutItems} />
      <div className="container">
        <h1 className="oc-checkout-title">Finalizar compra</h1>
        <p className="oc-checkout-session">
          Completá cada paso. Podés volver a editar cuando quieras.
        </p>

        <CheckoutForm>
          <CheckoutIdempotencyBootstrap />
          <input
            type="hidden"
            name="checkout_mode"
            value={isAuthenticated ? "google" : "invitado"}
          />

          <CheckoutWizard contadoSummaryLabel={contadoSummaryLabel}>
            <CheckoutStep id="datos" title="Tus datos">
              <div className="oc-checkout-grid-2">
                <div className="oc-checkout-field">
                  <label>
                    Nombre <abbr title="obligatorio">*</abbr>
                  </label>
                  <input name="nombre" required defaultValue={defaultNombre} />
                </div>
                <div className="oc-checkout-field">
                  <label>
                    Apellidos <abbr title="obligatorio">*</abbr>
                  </label>
                  <input name="apellido" required defaultValue={defaultApellido} />
                </div>
              </div>

              <CheckoutTaxDocumentFields
                defaultResponsabilidad={cliente?.responsabilidad_impositiva}
                defaultTipoDocumento={cliente?.tipo_documento}
                defaultNumeroDocumento={cliente?.numero_documento}
              />

              <div className="oc-checkout-field">
                <label>Teléfono</label>
                <input
                  name="telefono"
                  type="tel"
                  defaultValue={cliente?.telefono ?? ""}
                />
              </div>

              <div className="oc-checkout-field">
                <label>
                  Dirección de correo electrónico <abbr title="obligatorio">*</abbr>
                </label>
                <input
                  name="mail"
                  type="email"
                  required
                  defaultValue={cliente?.mail ?? session?.user?.email ?? ""}
                  readOnly={mailLocked}
                />
              </div>
            </CheckoutStep>

            <CheckoutStep id="entrega" title="Entrega">
              <CheckoutDeliveryFields
                addressDefaults={addressDefaults}
                cartSubtotal={cart.subtotal}
                envioDisponible={envioDisponible}
                retiroDisponible={retiroDisponible}
              />
            </CheckoutStep>

            {regalo ? (
              <CheckoutStep id="regalo" title="Tu regalo">
                <CheckoutGiftSelector regalo={regalo} />
              </CheckoutStep>
            ) : null}

            <CheckoutStep id="pago" title="Pago">
              <CheckoutCoupon
                appliedCodigo={cupon?.codigo}
                appliedMonto={descuentoCupon > 0 ? descuentoCupon : null}
              />
              <CheckoutPaymentOptions
                itemsTarjeta={itemsTarjeta}
                itemsContado={itemsContado}
                maxInstallments={cartMaxInstallments(cart.items)}
                mpConfigured={mercadoPagoConfigured}
                publicKey={mpPublicKey}
                descuentoContadoPct={descuentoContadoConfig.porcentaje}
                descuentoContadoMonto={totalsContado.descuentoContado}
                descuentoContadoParcial={descuentoContadoParcial}
              />
            </CheckoutStep>
          </CheckoutWizard>

          <aside className="oc-checkout-order">
            <div className="oc-checkout-order-box">
              <h2>Tu pedido</h2>
              <CheckoutOrderSummary
                lines={orderLines}
                subtotalLista={cart.subtotal}
                descuentoContadoMonto={totalsContado.descuentoContado}
                descuentoContadoPct={descuentoContadoConfig.porcentaje}
                cuponCodigo={cupon?.codigo}
                descuentoCupon={descuentoCupon}
                itemsTarjeta={itemsTarjeta}
                itemsContado={itemsContado}
                iva105={iva105}
                iva21={iva21}
              />

              <Link href="/carrito" className="oc-checkout-back">
                ← Volver al carrito
              </Link>
            </div>
          </aside>
        </CheckoutForm>
      </div>
    </div>
  );
}

function CheckoutIdentityGate({ googleConfigured }: { googleConfigured: boolean }) {
  return (
    <div className="oc-checkout-page">
      <div className="container">
        <h1 className="oc-checkout-title">Finalizar compra</h1>
        <p className="oc-checkout-session">Elegí cómo querés continuar.</p>

        <div className="oc-checkout-identity">
          {googleConfigured ? (
            <form action={continueWithGoogle}>
              <button type="submit" className="oc-btn oc-btn-dark oc-checkout-submit">
                Continuar con Google
              </button>
            </form>
          ) : (
            <div className="oc-cart-alert">
              Google no está configurado. Podés continuar como invitado.
            </div>
          )}

          <div className="oc-checkout-identity-divider">
            <span>o</span>
          </div>

          <form action={continueAsGuest}>
            <button
              type="submit"
              className="oc-btn oc-btn-ghost-dark oc-checkout-submit"
            >
              Continuar como invitado
            </button>
          </form>

          <p className="oc-checkout-note" style={{ textAlign: "center" }}>
            Si ya compraste antes con Google, cargaremos tus datos automáticamente.
          </p>

          <Link href="/carrito" className="oc-checkout-back">
            ← Volver al carrito
          </Link>
        </div>
      </div>
    </div>
  );
}
