import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import {
  createPendingVenta,
  type TipoPagoCheckout,
} from "@/lib/checkout-venta";
import {
  createOrReuseMercadoPagoPreference,
  finalizeCheckoutAfterPreference,
} from "@/lib/mp-preference";
import { rateLimit, rateLimitClientKey } from "@/lib/rate-limit";

export const runtime = "nodejs";

type PreferenceBody = {
  fields?: Record<string, string>;
  /** Tope de cuotas del checkout (se recorta al de los productos). */
  maxInstallments?: number;
  /**
   * `qr` = Checkout Pro por QR / link (sin wallet_purchase).
   * Cualquier otro valor = Wallet Brick.
   */
  flow?: string;
};

function resolveTipoPago(fields: Record<string, string>): TipoPagoCheckout {
  const raw = String(fields.tipo_pago || "").trim();
  if (raw === "tarjeta") return "tarjeta";
  return "mercado_pago";
}

function publicErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (
    /<!DOCTYPE|Unexpected token|is not valid JSON|Odoo no respondió/i.test(
      message,
    )
  ) {
    return "No pudimos iniciar el pago. Probá de nuevo en un momento.";
  }
  if (
    message &&
    !/mercadopago|access.?token|api|internal|ECONN|timeout/i.test(message)
  ) {
    return message;
  }
  return "No pudimos iniciar el pago con Mercado Pago";
}

/**
 * Crea venta pendiente + preference MP para Wallet Brick / QR.
 * Contado (`tipo_pago=mercado_pago`) o cuotas (`tipo_pago=tarjeta`).
 */
export async function POST(req: NextRequest) {
  try {
    const limited = rateLimit(rateLimitClientKey(req, "mp-pref"), {
      limit: 20,
      windowMs: 60_000,
    });
    if (!limited.ok) {
      return NextResponse.json(
        { error: "Demasiados intentos. Probá de nuevo en un momento." },
        {
          status: 429,
          headers: { "Retry-After": String(limited.retryAfterSec) },
        },
      );
    }

    let body: PreferenceBody;
    try {
      body = (await req.json()) as PreferenceBody;
    } catch {
      return NextResponse.json({ error: "Body inválido" }, { status: 400 });
    }

    const fields = body.fields ?? {};
    const tipo_pago = resolveTipoPago(fields);
    const hintRaw = Number(body.maxInstallments);
    const maxInstallmentsHint =
      Number.isFinite(hintRaw) && hintRaw > 0 ? hintRaw : undefined;
    const guestCheckout = body.flow === "qr";
    const session = await auth();

    let venta;
    try {
      venta = await createPendingVenta(
        fields,
        tipo_pago,
        session?.user?.email ?? null,
        session?.user?.id ?? null,
      );
    } catch (error) {
      console.error("[mercadopago/preference] venta:", error);
      return NextResponse.json(
        { error: publicErrorMessage(error) },
        { status: 400 },
      );
    }

    try {
      const result = await createOrReuseMercadoPagoPreference(venta, tipo_pago, {
        guestCheckout,
        maxInstallmentsHint,
      });
      await finalizeCheckoutAfterPreference();
      revalidatePath("/carrito");
      return NextResponse.json({
        ok: true,
        preferenceId: result.preferenceId,
        init_point: result.init_point,
        open_url: result.open_url,
        confirmation_url: result.confirmation_url,
        id_venta: result.id_venta,
        max_installments: result.max_installments,
      });
    } catch (error) {
      console.error("[mercadopago/preference] mp:", error);
      return NextResponse.json(
        { error: publicErrorMessage(error) },
        { status: 502 },
      );
    }
  } catch (error) {
    console.error("[mercadopago/preference] unhandled:", error);
    return NextResponse.json(
      { error: "No pudimos iniciar el pago. Probá de nuevo." },
      { status: 500 },
    );
  }
}
