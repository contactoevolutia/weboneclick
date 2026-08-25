"use client";

import { useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";
import {
  alignGrossesToOdooTotal,
  type AlignGrossItem,
} from "@/lib/odoo-amount";
import { installmentOptions, labelModoContado } from "@/lib/pricing";
import {
  getLastShippingQuote,
  SHIPPING_QUOTE_EVENT,
  type ShippingQuoteDetail,
} from "@/lib/shipping-quote";
import { setModoCobro } from "@/lib/modo-cobro";

type ModoCobro = "contado" | "cuotas";
type Mecanismo = "mercado_pago" | "tarjeta";

type Props = {
  /** Líneas cobro tarjeta (con alícuota) para alinear total a Odoo. */
  itemsTarjeta: AlignGrossItem[];
  /** Líneas cobro contado MP (con alícuota). */
  itemsContado: AlignGrossItem[];
  /** Tope de cuotas del carrito (menor cuotas_max de los productos). */
  maxInstallments: number;
  mpConfigured: boolean;
  publicKey: string | null;
  /** Porcentaje configurado (20 = 20%). */
  descuentoContadoPct: number;
  /** Monto de descuento contado ya calculado (0 si nadie califica). */
  descuentoContadoMonto: number;
  /** True si hay ítems con y sin descuento en el mismo carrito. */
  descuentoContadoParcial: boolean;
};

function formatArs(value: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function applyQuote(
  detail: ShippingQuoteDetail,
  setShippingCost: (n: number) => void,
  setShippingOk: (ok: boolean) => void,
  setDeliveryTipo: (t: "envio" | "retiro") => void,
) {
  setDeliveryTipo(detail.tipo);
  if (detail.tipo === "retiro") {
    setShippingCost(0);
    setShippingOk(true);
    return;
  }
  setShippingCost(detail.ok ? detail.costo : 0);
  setShippingOk(detail.ok);
}

function collectFormFields(form: HTMLFormElement): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const [key, value] of new FormData(form).entries()) {
    if (typeof value === "string") fields[key] = value;
  }
  return fields;
}

function getDeviceSessionId(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const id = (window as unknown as { MP_DEVICE_SESSION_ID?: string })
    .MP_DEVICE_SESSION_ID;
  return id?.trim() || undefined;
}

async function readJsonResponse<T extends Record<string, unknown>>(
  res: Response,
): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(
      res.ok
        ? "Respuesta inválida del servidor"
        : "No pudimos iniciar el pago. Probá de nuevo.",
    );
  }
}

export function CheckoutPaymentOptions({
  itemsTarjeta,
  itemsContado,
  maxInstallments,
  mpConfigured,
  publicKey,
  descuentoContadoPct,
  descuentoContadoMonto,
  descuentoContadoParcial,
}: Props) {
  const contadoTitle = labelModoContado({
    porcentaje: descuentoContadoPct,
    descuentoMonto: descuentoContadoMonto,
    parcial: descuentoContadoParcial,
  });
  const contadoHint =
    descuentoContadoMonto > 0
      ? descuentoContadoParcial
        ? `Un pago. El ${descuentoContadoPct}% aplica solo a productos elegibles; toda la compra es al contado.`
        : `Un pago o dinero en cuenta Mercado Pago. Incluye ${descuentoContadoPct}% de descuento.`
      : "Un pago o dinero en cuenta Mercado Pago.";
  const [modo, setModo] = useState<ModoCobro>("contado");
  const [mecanismo, setMecanismo] = useState<Mecanismo>("mercado_pago");
  const [error, setError] = useState<string | null>(null);
  const [shippingCost, setShippingCost] = useState(0);
  const [shippingOk, setShippingOk] = useState(false);
  const [deliveryTipo, setDeliveryTipo] = useState<"envio" | "retiro" | null>(
    null,
  );
  const [qr, setQr] = useState<{
    /** Landing OneClick → Checkout Pro (codificar en el QR). */
    open_url: string;
    init_point: string;
    confirmation_url: string;
  } | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [selectedCuotas, setSelectedCuotas] = useState(1);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const brickEnabled = mpConfigured && !!publicKey;
  const cuotaChoices = useMemo(
    () => installmentOptions(maxInstallments),
    [maxInstallments],
  );
  const payTarjeta = useMemo(
    () =>
      alignGrossesToOdooTotal({
        items: itemsTarjeta,
        costo_envio: shippingCost,
      }).total,
    [itemsTarjeta, shippingCost],
  );
  const payContado = useMemo(
    () =>
      alignGrossesToOdooTotal({
        items: itemsContado,
        costo_envio: shippingCost,
      }).total,
    [itemsContado, shippingCost],
  );
  /** Wallet: el modo del paso 1 define precio y tope de cuotas en MP. */
  const tipoPagoWallet = modo === "contado" ? "mercado_pago" : "tarjeta";
  const cardIsContado = modo === "contado" || selectedCuotas === 1;
  const tipoPagoCard = cardIsContado ? "mercado_pago" : "tarjeta";
  const cardAmount = cardIsContado ? payContado : payTarjeta;
  const cardInstallments = cardIsContado ? 1 : selectedCuotas;
  const tipoPago = mecanismo === "tarjeta" ? tipoPagoCard : tipoPagoWallet;
  const canPayDelivery = deliveryTipo === "retiro" || shippingOk;
  const needsCpWarning = deliveryTipo !== "retiro" && !shippingOk;

  useEffect(() => {
    const last = getLastShippingQuote();
    if (last) {
      applyQuote(last, setShippingCost, setShippingOk, setDeliveryTipo);
    }

    function onQuote(e: Event) {
      const detail = (e as CustomEvent<ShippingQuoteDetail>).detail;
      if (!detail) return;
      applyQuote(detail, setShippingCost, setShippingOk, setDeliveryTipo);
    }
    window.addEventListener(SHIPPING_QUOTE_EVENT, onQuote);
    return () => window.removeEventListener(SHIPPING_QUOTE_EVENT, onQuote);
  }, []);

  // Contado: siempre 1 pago.
  useEffect(() => {
    if (modo === "contado" && selectedCuotas !== 1) {
      setSelectedCuotas(1);
    }
  }, [modo, selectedCuotas]);

  // Sincroniza sidebar "Tu pedido" con Contado / Cuotas.
  useEffect(() => {
    setModoCobro(modo);
  }, [modo]);

  // Device ID para Payments API (antifraude).
  useEffect(() => {
    if (typeof document === "undefined") return;
    const existing = document.querySelector(
      'script[data-oc-mp-security="1"]',
    );
    if (existing) return;
    const script = document.createElement("script");
    script.src = "https://www.mercadopago.com/v2/security.js";
    script.setAttribute("view", "checkout");
    script.setAttribute("data-oc-mp-security", "1");
    script.async = true;
    document.body.appendChild(script);
  }, []);

  function validateDelivery(fields: Record<string, string>): void {
    const tipoEntrega = fields.tipo_entrega;
    if (tipoEntrega === "envio" && !shippingOk) {
      const message = "Ingresá un código postal con cobertura de envío";
      setError(message);
      throw new Error(message);
    }
    if (tipoEntrega === "retiro" && !fields.tienda_retiro) {
      const message = "Seleccioná la tienda de retiro";
      setError(message);
      throw new Error(message);
    }
  }

  async function createPreference(flow: "wallet" | "qr" = "wallet"): Promise<{
    preferenceId: string;
    init_point: string;
    /** Landing propia → Checkout Pro; usar en QR para no perder el tope de cuotas. */
    open_url: string;
    confirmation_url: string;
  }> {
    setError(null);
    const form = wrapperRef.current?.closest("form");
    if (!form) throw new Error("Formulario no encontrado");
    if (!form.reportValidity()) {
      throw new Error("Completá los datos de facturación");
    }
    const fields = collectFormFields(form);
    fields.tipo_pago = tipoPagoWallet;
    fields.mecanismo_pago = "mercado_pago";
    validateDelivery(fields);

    const res = await fetch("/api/mercadopago/preference", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fields,
        flow,
        maxInstallments: modo === "contado" ? 1 : maxInstallments,
      }),
    });
    const data = await readJsonResponse<{
      preferenceId?: string;
      init_point?: string;
      open_url?: string;
      confirmation_url?: string;
      error?: string;
    }>(res);
    if (!res.ok || !data.preferenceId || !data.init_point) {
      const message = data.error || "No pudimos iniciar el pago con Mercado Pago";
      setError(message);
      throw new Error(message);
    }
    return {
      preferenceId: data.preferenceId,
      init_point: data.init_point,
      open_url: data.open_url || data.init_point,
      confirmation_url: data.confirmation_url || data.init_point,
    };
  }

  async function payWithCard(cardData: unknown): Promise<void> {
    setError(null);
    const form = wrapperRef.current?.closest("form");
    if (!form) throw new Error("Formulario no encontrado");
    if (!form.reportValidity()) {
      throw new Error("Completá los datos de facturación");
    }

    const fields = collectFormFields(form);
    fields.tipo_pago = tipoPagoCard;
    fields.mecanismo_pago = "tarjeta";
    validateDelivery(fields);

    const card =
      cardData && typeof cardData === "object"
        ? {
            ...(cardData as Record<string, unknown>),
            installments: cardInstallments,
          }
        : { installments: cardInstallments };

    const res = await fetch("/api/mercadopago/pay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fields,
        card,
        deviceSessionId: getDeviceSessionId(),
      }),
    });
    const data = await readJsonResponse<{ redirect?: string; error?: string }>(
      res,
    );
    if (!res.ok || !data.redirect) {
      const message = data.error || "No pudimos procesar el pago";
      setError(message);
      throw new Error(message);
    }
    window.location.href = data.redirect;
  }

  async function onWalletSubmit(): Promise<string> {
    const pref = await createPreference("wallet");
    return pref.preferenceId;
  }

  async function showQrForMobile(): Promise<void> {
    if (!canPayDelivery || !mpConfigured) return;
    setQrLoading(true);
    try {
      const pref = await createPreference("qr");
      setQr({
        open_url: pref.open_url,
        init_point: pref.init_point,
        confirmation_url: pref.confirmation_url,
      });
    } catch {
      // error ya seteado
    } finally {
      setQrLoading(false);
    }
  }

  return (
    <div className="oc-checkout-payment" ref={wrapperRef}>
      <input type="hidden" name="tipo_pago" value={tipoPago} />
      <input type="hidden" name="mecanismo_pago" value={mecanismo} />

      <h3>Modo de cobro</h3>

      <label
        className={`oc-checkout-payment-option${modo === "contado" ? " is-active" : ""}`}
      >
        <input
          type="radio"
          name="modo_cobro"
          value="contado"
          checked={modo === "contado"}
          onChange={() => {
            setModo("contado");
            setSelectedCuotas(1);
            setQr(null);
          }}
        />
        <span className="oc-checkout-payment-copy">
          <span className="oc-checkout-payment-head">
            <strong>{contadoTitle}</strong>
            <span className="oc-checkout-payment-arrow" aria-hidden>
              ⟶
            </span>
            <span className="oc-checkout-payment-amount">
              Total: <strong>{formatArs(payContado)}</strong>
            </span>
          </span>
          <small>{contadoHint}</small>
        </span>
      </label>

      <label
        className={`oc-checkout-payment-option${modo === "cuotas" ? " is-active" : ""}`}
      >
        <input
          type="radio"
          name="modo_cobro"
          value="cuotas"
          checked={modo === "cuotas"}
          onChange={() => {
            setModo("cuotas");
            setSelectedCuotas(maxInstallments);
            setQr(null);
          }}
        />
        <span className="oc-checkout-payment-copy">
          <span className="oc-checkout-payment-head">
            <strong>Cuotas sin interés</strong>
            <span className="oc-checkout-payment-arrow" aria-hidden>
              ⟶
            </span>
            <span className="oc-checkout-payment-amount">
              Total: <strong>{formatArs(payTarjeta)}</strong>
            </span>
          </span>
          <small>
            Hasta <strong>{maxInstallments} cuotas</strong> sin interés con
            tarjeta de crédito de todos los bancos (precio de lista).
          </small>
        </span>
      </label>

      <h3 className="oc-checkout-payment-step2">Cómo querés pagar</h3>

      <label
        className={`oc-checkout-payment-option${mecanismo === "mercado_pago" ? " is-active" : ""}`}
      >
        <input
          type="radio"
          name="mecanismo_pago_ui"
          value="mercado_pago"
          checked={mecanismo === "mercado_pago"}
          onChange={() => {
            setMecanismo("mercado_pago");
            setQr(null);
          }}
        />
        <span className="oc-checkout-payment-copy">
          <span className="oc-checkout-payment-head">
            <strong>Mercado Pago (recomendado)</strong>
          </span>
          <small>
            Iniciá sesión en tu cuenta de Mercado Pago para pagar con dinero en
            cuenta
            {modo === "contado"
              ? " o tarjeta en un pago."
              : ` o en hasta ${maxInstallments} cuotas desde su checkout.`}
          </small>
        </span>
      </label>

      {mecanismo === "mercado_pago" && (
        <div
          className="oc-checkout-wallet-panel"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          {brickEnabled && canPayDelivery ? (
            <>
              {qr ? (
                <div className="oc-checkout-qr-box">
                  <p>
                    Pedido creado. Escaneá el código con la cámara del celular
                    (no con el lector de la app Mercado Pago) para abrir el pago:
                  </p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(qr.open_url)}`}
                    alt="Código QR para pagar con Mercado Pago en el celular"
                    width={180}
                    height={180}
                  />
                  <p className="oc-checkout-note">
                    <a href={qr.open_url} target="_blank" rel="noreferrer">
                      Abrir link de pago
                    </a>
                    {" · "}
                    <a href={qr.confirmation_url}>Ver estado del pedido</a>
                  </p>
                </div>
              ) : (
                <>
                  <WalletBrick publicKey={publicKey!} onSubmit={onWalletSubmit} />
                  <button
                    type="button"
                    className="oc-checkout-qr-toggle"
                    disabled={qrLoading || !mpConfigured}
                    onClick={() => void showQrForMobile()}
                  >
                    {qrLoading
                      ? "Generando código…"
                      : "¿No estás logueado en esta PC? Continuar en el celular"}
                  </button>
                </>
              )}
            </>
          ) : brickEnabled && !canPayDelivery ? (
            <p className="oc-checkout-payment-warning">
              Completá el envío o retiro para habilitar Mercado Pago.
            </p>
          ) : (
            <button
              type="button"
              className="oc-btn oc-btn-dark oc-checkout-submit"
              disabled={!mpConfigured || !canPayDelivery || qrLoading}
              onClick={() => {
                void (async () => {
                  setQrLoading(true);
                  try {
                    const pref = await createPreference("qr");
                    window.location.href = pref.open_url;
                  } catch {
                    // error ya seteado
                  } finally {
                    setQrLoading(false);
                  }
                })();
              }}
            >
              {qrLoading ? "Redirigiendo…" : "Pagar con Mercado Pago"}
            </button>
          )}
        </div>
      )}

      <label
        className={`oc-checkout-payment-option${mecanismo === "tarjeta" ? " is-active" : ""}`}
      >
        <input
          type="radio"
          name="mecanismo_pago_ui"
          value="tarjeta"
          checked={mecanismo === "tarjeta"}
          onChange={() => {
            setMecanismo("tarjeta");
            setQr(null);
          }}
        />
        <span className="oc-checkout-payment-copy">
          <span className="oc-checkout-payment-head">
            <strong>Completar datos de tarjeta</strong>
          </span>
          <small>
            {modo === "contado"
              ? descuentoContadoMonto > 0
                ? `Ingresá la tarjeta en el sitio. Un solo pago${descuentoContadoParcial ? ` (${descuentoContadoPct}% en productos elegibles)` : ` con ${descuentoContadoPct}% de descuento`}.`
                : "Ingresá la tarjeta en el sitio. Un solo pago."
              : <>
                  Ingresá la tarjeta en el sitio. Hasta{" "}
                  <strong>{maxInstallments} cuotas</strong> sin interés.
                </>}
          </small>
        </span>
      </label>

      {mecanismo === "tarjeta" && (
        <div className="oc-checkout-card-panel">
          {modo === "cuotas" ? (
            <div className="oc-checkout-field oc-checkout-cuotas-select">
              <label htmlFor="checkout-cuotas">Cuotas</label>
              <select
                id="checkout-cuotas"
                name="card_installments"
                value={selectedCuotas}
                onChange={(e) => {
                  const n = Number(e.target.value) || 1;
                  setSelectedCuotas(n);
                  setModo(n === 1 ? "contado" : "cuotas");
                }}
              >
                {cuotaChoices.map((n) => {
                  const total = n === 1 ? payContado : payTarjeta;
                  const cuota = total / n;
                  return (
                    <option key={n} value={n}>
                      {n === 1
                        ? descuentoContadoMonto > 0
                          ? `1 pago · ${formatArs(total)} · ${descuentoContadoPct}% de descuento`
                          : `1 pago · ${formatArs(total)}`
                        : `${n} cuotas de ${formatArs(cuota)} · ${formatArs(total)} · sin interés`}
                    </option>
                  );
                })}
              </select>
            </div>
          ) : (
            <input type="hidden" name="card_installments" value={1} />
          )}
          {brickEnabled ? (
            canPayDelivery ? (
              <CardBrick
                amount={cardAmount}
                installments={cardInstallments}
                publicKey={publicKey!}
                onPay={payWithCard}
              />
            ) : (
              <p className="oc-checkout-payment-warning">
                Completá el envío o retiro para habilitar el pago con tarjeta.
              </p>
            )
          ) : (
            <CardPlaceholder />
          )}
        </div>
      )}

      {error && <p className="oc-checkout-payment-warning">{error}</p>}

      {needsCpWarning && (
        <p className="oc-checkout-payment-warning">
          Para envío a domicilio, validá un código postal con cobertura antes de
          pagar.
        </p>
      )}

      {!mpConfigured && (
        <p className="oc-checkout-payment-warning">
          Mercado Pago aún no está configurado. Agregá el Access Token y la
          Public Key para habilitar pagos.
        </p>
      )}

      <p className="oc-checkout-privacy">
        Tus datos personales se utilizarán para procesar tu pedido, mejorar tu
        experiencia en esta web y otros propósitos descritos en nuestra política
        de privacidad.
      </p>
    </div>
  );
}

function WalletBrick({
  publicKey,
  onSubmit,
}: {
  publicKey: string;
  onSubmit: () => Promise<string>;
}) {
  const [Brick, setBrick] = useState<ComponentType<{
    locale?: string;
    initialization?: { redirectMode?: "self" | "blank" };
    customization?: {
      valueProp?: string;
    };
    onSubmit: () => Promise<unknown>;
    onError?: (err: unknown) => void;
  }> | null>(null);

  useEffect(() => {
    let cancelled = false;
    void ensureMercadoPago(publicKey).then((mp) => {
      if (cancelled) return;
      setBrick(() => mp.Wallet as never);
    });
    return () => {
      cancelled = true;
    };
  }, [publicKey]);

  if (!Brick) {
    return <p className="oc-checkout-note">Cargando Mercado Pago…</p>;
  }

  return (
    <Brick
      locale="es-AR"
      initialization={{ redirectMode: "self" }}
      customization={{
        valueProp: "practicality",
      }}
      onSubmit={onSubmit}
      onError={(err) => console.error("MP Wallet Brick error", err)}
    />
  );
}

type MpSdk = typeof import("@mercadopago/sdk-react");

let mpInitKey: string | null = null;
let mpSdkPromise: Promise<MpSdk> | null = null;

function ensureMercadoPago(publicKey: string): Promise<MpSdk> {
  if (!mpSdkPromise || mpInitKey !== publicKey) {
    mpInitKey = publicKey;
    mpSdkPromise = import("@mercadopago/sdk-react").then((mp) => {
      mp.initMercadoPago(publicKey, { locale: "es-AR" });
      return mp;
    });
  }
  return mpSdkPromise;
}

function roundAmount(value: number): number {
  return Math.round(value * 100) / 100;
}

function isSecureFieldsError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const cause = String((err as { cause?: string }).cause || "");
  return (
    cause === "fields_setup_failed" ||
    cause === "fields_setup_failed_after_3_tries"
  );
}

/** Card Payment Brick de Mercado Pago (tokeniza la tarjeta en el navegador). */
function CardBrick({
  amount,
  installments,
  publicKey,
  onPay,
}: {
  amount: number;
  installments: number;
  publicKey: string;
  onPay: (cardData: unknown) => Promise<void>;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [Brick, setBrick] = useState<ComponentType<{
    initialization: { amount: number };
    customization?: {
      paymentMethods?: { maxInstallments?: number; minInstallments?: number };
    };
    onSubmit: (data: unknown) => Promise<void>;
    onReady?: () => void;
    onError?: (err: unknown) => void;
  }> | null>(null);
  const [visible, setVisible] = useState(false);
  const [stableAmount, setStableAmount] = useState(() => roundAmount(amount));
  const [stableInstallments, setStableInstallments] = useState(installments);
  const [instance, setInstance] = useState(0);
  const [setupError, setSetupError] = useState(false);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void ensureMercadoPago(publicKey).then((mp) => {
      if (cancelled) return;
      setBrick(() => mp.CardPayment as never);
    });
    return () => {
      cancelled = true;
    };
  }, [publicKey]);

  // No montar Secure Fields dentro de un paso plegado (`hidden`).
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const sync = () => {
      setVisible(!host.closest("[hidden]"));
    };
    sync();

    const mo = new MutationObserver(sync);
    mo.observe(document.documentElement, {
      attributes: true,
      subtree: true,
      attributeFilter: ["hidden"],
    });
    return () => mo.disconnect();
  }, []);

  // Evitar remounts mientras llega el costo de envío / cambia el modo.
  useEffect(() => {
    setBooting(true);
    const timer = window.setTimeout(() => {
      setStableAmount(roundAmount(amount));
      setStableInstallments(installments);
      setBooting(false);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [amount, installments]);

  function retry() {
    setSetupError(false);
    setBooting(true);
    window.setTimeout(() => {
      setInstance((n) => n + 1);
      setBooting(false);
    }, 200);
  }

  let body: ReactNode;
  if (setupError) {
    body = (
      <>
        <p className="oc-checkout-payment-warning">
          No pudimos cargar el formulario de tarjeta. Probá de nuevo.
        </p>
        <button
          type="button"
          className="oc-btn oc-btn-dark oc-checkout-submit"
          onClick={retry}
        >
          Reintentar
        </button>
      </>
    );
  } else if (!Brick || !visible || booting) {
    body = <p className="oc-checkout-note">Cargando formulario de pago…</p>;
  } else if (!(stableAmount > 0)) {
    body = (
      <p className="oc-checkout-payment-warning">
        Completá el envío o retiro para habilitar el pago con tarjeta.
      </p>
    );
  } else {
    body = (
      <Brick
        key={`${instance}-${stableAmount}-${stableInstallments}`}
        initialization={{ amount: stableAmount }}
        customization={{
          paymentMethods: {
            minInstallments: stableInstallments,
            maxInstallments: stableInstallments,
          },
        }}
        onReady={() => setSetupError(false)}
        onSubmit={async (formData) => {
          const payload =
            formData && typeof formData === "object"
              ? {
                  ...(formData as Record<string, unknown>),
                  installments: stableInstallments,
                }
              : { installments: stableInstallments };
          await onPay(payload);
        }}
        onError={(err) => {
          console.error("MP Brick error", err);
          if (isSecureFieldsError(err)) {
            setSetupError(true);
          }
        }}
      />
    );
  }

  return (
    <div ref={hostRef} className="oc-checkout-card-brick">
      {body}
    </div>
  );
}

/** Vista previa del formulario cuando faltan las credenciales de Mercado Pago. */
function CardPlaceholder() {
  return (
    <div className="oc-checkout-card-preview" aria-disabled>
      <div className="oc-checkout-card-brands" aria-hidden>
        <span>VISA</span>
        <span>Master</span>
        <span>Amex</span>
        <span>Naranja X</span>
        <span>Maestro</span>
      </div>
      <div className="oc-checkout-field">
        <label>
          Número de tarjeta <abbr title="obligatorio">*</abbr>
        </label>
        <input placeholder="1234 1234 1234 1234" disabled />
      </div>
      <div className="oc-checkout-field">
        <label>
          Nombre del titular <abbr title="obligatorio">*</abbr>
        </label>
        <input placeholder="Ej.: María López" disabled />
        <small className="oc-checkout-note">
          Complétalo como aparece en la tarjeta.
        </small>
      </div>
      <div className="oc-checkout-grid-2">
        <div className="oc-checkout-field">
          <label>
            Vencimiento <abbr title="obligatorio">*</abbr>
          </label>
          <input placeholder="MM/AA" disabled />
        </div>
        <div className="oc-checkout-field">
          <label>
            Código de seguridad <abbr title="obligatorio">*</abbr>
          </label>
          <input placeholder="Ej.: 123" disabled />
        </div>
      </div>
      <p className="oc-checkout-payment-warning">
        El formulario de tarjeta se habilita configurando la Public Key de Mercado
        Pago (NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY).
      </p>
    </div>
  );
}
