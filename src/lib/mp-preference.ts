import { clearCartCookie } from "@/lib/cart";
import {
  clampMpInstallments,
  DEFAULT_CUOTAS_MAX,
  maxInstallmentsFromCuotas,
} from "@/lib/cart";
import { rotateCheckoutIdempotencyKey } from "@/lib/checkout-idempotency";
import {
  confirmationPath,
  type TipoPagoCheckout,
  type VentaPendiente,
} from "@/lib/checkout-venta";
import { clearCuponCookie, releaseCuponForVenta } from "@/lib/cupones";
import { mercadoPagoPreference, publicSiteUrl } from "@/lib/mercadopago";
import {
  buildMpItems,
  buildPreferencePayer,
  buildPreferenceShipments,
  toMpPayerSource,
} from "@/lib/mp-payer-payload";
import { prisma } from "@/lib/prisma";

export type CreatePreferenceResult = {
  preferenceId: string;
  init_point: string;
  /**
   * URL en nuestro dominio que redirige al checkout MP.
   * El QR debe usar esta (no el init_point): si se escanea con la app de MP,
   * un init_point directo suele generar un cobro in-store sin tope de cuotas.
   */
  open_url: string;
  confirmation_url: string;
  id_venta: number;
  max_installments: number;
};

export type CreatePreferenceOptions = {
  /**
   * Checkout Pro abierto por QR / link (continuar en el celular).
   * Sin `purpose: wallet_purchase` para que MP respete el tope de cuotas.
   */
  guestCheckout?: boolean;
  /** Tope informado por el checkout; se recorta al de los productos de la venta. */
  maxInstallmentsHint?: number;
};

async function maxInstallmentsForVenta(
  venta: VentaPendiente,
): Promise<number> {
  const ids = [
    ...new Set(
      venta.itemsCobro
        .map((i) => i.id_producto)
        .filter((id) => Number.isInteger(id) && id > 0),
    ),
  ];
  if (ids.length === 0) return DEFAULT_CUOTAS_MAX;
  const rows = await prisma.producto.findMany({
    where: { id_producto: { in: ids } },
    select: { cuotas_max: true },
  });
  return maxInstallmentsFromCuotas(rows.map((r) => r.cuotas_max));
}

function resolvePreferenceInstallments(
  tipo_pago: TipoPagoCheckout,
  fromVenta: number,
  hint?: number,
): number {
  const cap = clampMpInstallments(
    hint != null && hint > 0 ? Math.min(fromVenta, hint) : fromVenta,
  );
  return tipo_pago === "mercado_pago" ? 1 : cap;
}

function paymentMethodsForPreference(installments: number) {
  // `installments` limita cuotas de tarjeta en Checkout Pro. Mercado Crédito
  // (`consumer_credits`) queda disponible con sus propias cuotas; se acepta en
  // el webhook sin reembolso (ver mp-payment-sync).
  return {
    installments,
    default_installments: 1,
  };
}

/** Landing propia → redirect a Checkout Pro (para QR / link móvil). */
export function mpOpenPath(
  id_venta: number,
  access_token: string,
  preferenceId: string,
) {
  const q = new URLSearchParams({
    t: access_token,
    pref: preferenceId,
  });
  return `/checkout/mp-open/${id_venta}?${q.toString()}`;
}

/**
 * Crea (o reutiliza) una preference de Mercado Pago para Wallet / Checkout Pro.
 * Contado (`mercado_pago`): 1 cuota. Cuotas (`tarjeta`): hasta maxInstallments
 * de los productos de la venta (no del carrito, que puede ya estar vacío).
 */
export async function createOrReuseMercadoPagoPreference(
  venta: VentaPendiente,
  tipo_pago: TipoPagoCheckout,
  options?: CreatePreferenceOptions,
): Promise<CreatePreferenceResult> {
  const siteUrl = publicSiteUrl();
  const confBase = `${siteUrl}${confirmationPath(venta.id_venta, venta.access_token)}`;
  const confirmation_url = `${confBase}&mp=pending`;
  const publicHttps =
    siteUrl.startsWith("https://") &&
    !/localhost|127\.0\.0\.1/i.test(siteUrl);

  const fromVenta = await maxInstallmentsForVenta(venta);
  const installments = resolvePreferenceInstallments(
    tipo_pago,
    fromVenta,
    options?.maxInstallmentsHint,
  );
  const payment_methods = paymentMethodsForPreference(installments);

  const pagoExistente = await prisma.pago.findFirst({
    where: { id_venta: venta.id_venta, tipo_pago },
    select: { referencia: true },
  });

  const buildResult = (preferenceId: string, init_point: string) => {
    const openPath = mpOpenPath(
      venta.id_venta,
      venta.access_token,
      preferenceId,
    );
    return {
      preferenceId,
      init_point,
      open_url: `${siteUrl}${openPath}`,
      confirmation_url,
      id_venta: venta.id_venta,
      max_installments: installments,
    };
  };

  // Wallet Brick: reutilizar la preference (purpose wallet_purchase).
  // QR: nunca reutilizar esa preference; Checkout Pro necesita la suya con `installments`.
  if (pagoExistente?.referencia && !options?.guestCheckout) {
    const preferenceId = pagoExistente.referencia;
    return buildResult(
      preferenceId,
      `https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=${encodeURIComponent(preferenceId)}`,
    );
  }

  const src = toMpPayerSource(venta);
  const preferenceItems = buildMpItems(src).map((item) => ({
    ...item,
    currency_id: "ARS" as const,
  }));

  const preferenceBody = {
    items: preferenceItems,
    payer: buildPreferencePayer(src),
    shipments: buildPreferenceShipments(src),
    external_reference: String(venta.id_venta),
    metadata: {
      id_venta: String(venta.id_venta),
      max_installments: String(installments),
      checkout_flow: options?.guestCheckout ? "qr" : "wallet",
      tipo_pago,
    },
    statement_descriptor: "ONECLICK",
    payment_methods,
    // Contado: binary_mode evita estados pending raros; no afecta cuotas por sí solo.
    ...(installments === 1 ? { binary_mode: true } : {}),
    ...(publicHttps
      ? {
          back_urls: {
            success: `${confBase}&mp=success`,
            pending: `${confBase}&mp=pending`,
            failure: `${confBase}&mp=failure`,
          },
          auto_return: "approved" as const,
          notification_url: `${siteUrl}/api/mercadopago/webhook`,
        }
      : {}),
  };

  let preference;
  try {
    const useWalletPurpose = !options?.guestCheckout;
    if (useWalletPurpose) {
      try {
        preference = await mercadoPagoPreference().create({
          body: {
            ...preferenceBody,
            purpose: "wallet_purchase",
          },
        });
      } catch (firstError) {
        console.warn(
          "[mp-preference] wallet_purchase falló, reintento sin purpose:",
          firstError,
        );
        preference = await mercadoPagoPreference().create({
          body: preferenceBody,
        });
      }
    } else {
      // QR / link: Checkout Pro completo para que `installments` limite cuotas.
      preference = await mercadoPagoPreference().create({
        body: preferenceBody,
      });
    }
  } catch (error) {
    await prisma.venta
      .update({
        where: { id_venta: venta.id_venta },
        data: { estado: "cancelada" },
      })
      .catch(() => undefined);
    await releaseCuponForVenta(venta.id_venta).catch(() => undefined);
    throw error;
  }

  if (!preference.id || !preference.init_point) {
    await prisma.venta
      .update({
        where: { id_venta: venta.id_venta },
        data: { estado: "cancelada" },
      })
      .catch(() => undefined);
    await releaseCuponForVenta(venta.id_venta).catch(() => undefined);
    throw new Error("Mercado Pago no devolvió una URL de pago");
  }

  await prisma.pago.updateMany({
    where: { id_venta: venta.id_venta, tipo_pago },
    data: { referencia: preference.id },
  });

  return buildResult(preference.id, preference.init_point);
}

/** Tras crear preference: limpia carrito/cupón e idempotency para el siguiente pedido. */
export async function finalizeCheckoutAfterPreference(): Promise<void> {
  await clearCartCookie();
  await clearCuponCookie();
  await rotateCheckoutIdempotencyKey();
}
