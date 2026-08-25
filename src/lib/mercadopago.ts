import { createHmac, timingSafeEqual } from "crypto";
import MercadoPagoConfig, {
  MerchantOrder,
  Payment,
  PaymentRefund,
  Preference,
} from "mercadopago";

function accessToken(): string {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim();
  if (!token) {
    throw new Error(
      "Mercado Pago no está configurado. Definí MERCADOPAGO_ACCESS_TOKEN."
    );
  }
  return token;
}

export function isMercadoPagoConfigured(): boolean {
  return Boolean(process.env.MERCADOPAGO_ACCESS_TOKEN?.trim());
}

function client() {
  return new MercadoPagoConfig({
    accessToken: accessToken(),
    options: { timeout: 8_000 },
  });
}

export function mercadoPagoPreference() {
  return new Preference(client());
}

export function mercadoPagoPayment() {
  return new Payment(client());
}

export function mercadoPagoMerchantOrder() {
  return new MerchantOrder(client());
}

export function mercadoPagoPaymentRefund() {
  return new PaymentRefund(client());
}

export function publicSiteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.AUTH_URL ||
    "http://localhost:3000"
  ).replace(/\/+$/, "");
}

function webhookSecret(): string | null {
  return process.env.MERCADOPAGO_WEBHOOK_SECRET?.trim() || null;
}

/**
 * Valida la firma x-signature de notificaciones Webhook de Mercado Pago.
 * @see https://www.mercadopago.com.ar/developers/es/docs/your-integrations/notifications/webhooks
 */
export function verifyMercadoPagoWebhookSignature(opts: {
  xSignature: string | null;
  xRequestId: string | null;
  dataId: string | null;
}): { ok: true } | { ok: false; reason: string } {
  const secret = webhookSecret();
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      return { ok: false, reason: "webhook_secret_missing" };
    }
    console.warn(
      "[mercadopago] MERCADOPAGO_WEBHOOK_SECRET no configurado; se omite la firma en desarrollo.",
    );
    return { ok: true };
  }

  const xSignature = opts.xSignature?.trim() || "";
  if (!xSignature) {
    return { ok: false, reason: "missing_signature" };
  }

  const parts: Record<string, string> = {};
  for (const segment of xSignature.split(",")) {
    const [k, ...rest] = segment.trim().split("=");
    if (k && rest.length) parts[k.trim()] = rest.join("=").trim();
  }
  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1) {
    return { ok: false, reason: "malformed_signature" };
  }

  // Manifest oficial: omitir pares sin valor.
  let manifest = "";
  const dataId = opts.dataId?.trim();
  if (dataId) {
    manifest += `id:${dataId.toLowerCase()};`;
  }
  const requestId = opts.xRequestId?.trim();
  if (requestId) {
    manifest += `request-id:${requestId};`;
  }
  manifest += `ts:${ts};`;

  const expected = createHmac("sha256", secret).update(manifest).digest("hex");
  try {
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(v1, "utf8");
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return { ok: false, reason: "invalid_signature" };
    }
  } catch {
    return { ok: false, reason: "invalid_signature" };
  }
  return { ok: true };
}
