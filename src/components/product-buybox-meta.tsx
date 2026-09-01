"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { PdpInfoModal } from "@/components/pdp-info-modal";
import { PdpEnvioCotizador } from "@/components/pdp-envio-cotizador";
import { buildPlanesCuotas, LEGAL_CONDICIONES_PAGO } from "@/lib/condiciones-pago";
import { formatPriceArs } from "@/lib/pricing";
import type { StoreAvailabilityItem } from "@/lib/products";

const ENVIO_DOMICILIO = "Envío a Domicilio";

/**
 * Tope del envío gratis en la ficha: hasta acá el cliente cotiza su envío,
 * pasado este precio el envío va sin cargo.
 *
 * OJO: no es el parámetro `valor_para_envio_gratis` de la base, que hoy está
 * en $800.000. Este umbral es el que manda en la ficha; si el negocio unifica
 * los dos, hay que actualizar el parámetro y leerlo desde acá.
 */
const UMBRAL_ENVIO_GRATIS = 200_000;

type Props = {
  /** Cuotas sin interés del producto (product.cuotas_max). */
  cuotas: number;
  /** Precio efectivo de venta. */
  precio: number | null;
  /** Disponibilidad por sucursal, incluyendo la fila de envío a domicilio. */
  stores: StoreAvailabilityItem[];
  /** El precio supera el umbral de envío gratis. */
  envioGratis: boolean;
};

function IconTruck() {
  return (
    <svg className="oc-pdp-meta-icon" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 7.5A1.5 1.5 0 014.5 6H14v9H3V7.5zM14 9h3.6l2.4 3v3h-6V9z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="7.5" cy="17" r="1.8" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="16.5" cy="17" r="1.8" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function IconCard() {
  return (
    <svg className="oc-pdp-meta-icon" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect
        x="2.75"
        y="5.75"
        width="18.5"
        height="12.5"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path d="M3 10h18" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6.5 14.5h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconPin() {
  return (
    <svg className="oc-pdp-meta-icon" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 21s7-5.6 7-11a7 7 0 10-14 0c0 5.4 7 11 7 11z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function IconChevron() {
  return (
    <svg className="oc-pdp-meta-chevron" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M9 5l7 7-7 7"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg className="oc-pdp-store-mark" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="7.15" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M4.9 8.2l2.1 2.1 4.1-4.4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconDash() {
  return (
    <svg className="oc-pdp-store-mark" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="7.15" stroke="currentColor" strokeWidth="1.3" />
      <path d="M5.2 8h5.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function MetaCard({
  icon,
  title,
  detail,
  cta,
  className,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  detail: string;
  cta?: string;
  className?: string;
  onClick?: () => void;
}) {
  const cls = `oc-pdp-meta-card${className ? ` ${className}` : ""}`;
  const content = (
    <>
      <span className="oc-pdp-meta-top">
        {icon}
        <strong>{title}</strong>
      </span>
      <span className="oc-pdp-meta-foot">
        <span className="oc-pdp-meta-detail">{detail}</span>
        {cta && (
          <span className="oc-pdp-meta-cta">
            {cta}
            <IconChevron />
          </span>
        )}
      </span>
    </>
  );

  if (!onClick) {
    return <div className={cls}>{content}</div>;
  }
  return (
    <button type="button" className={`${cls} is-action`} onClick={onClick}>
      {content}
    </button>
  );
}

export function ProductBuyboxMeta({ cuotas, precio, stores, envioGratis }: Props) {
  const [openEnvio, setOpenEnvio] = useState(false);
  const [openPago, setOpenPago] = useState(false);
  const [openTiendas, setOpenTiendas] = useState(false);

  const envioItem = stores.find((s) => s.name === ENVIO_DOMICILIO);
  const sucursales = stores.filter((s) => s.name !== ENVIO_DOMICILIO);
  const conStock = sucursales.filter((s) => s.available);
  const sinStock = sucursales.filter((s) => !s.available);
  const hayEnvio = Boolean(envioItem?.available);
  // Sin precio no se puede prometer envío gratis: se ofrece cotizar.
  const envioSinCargo = precio != null && precio > UMBRAL_ENVIO_GRATIS;

  const planes = buildPlanesCuotas(precio, cuotas);
  const sinInteresPlanes = planes.filter((p) => p.sinInteres);
  const cuotaSinInteres = sinInteresPlanes[sinInteresPlanes.length - 1] ?? null;


  const pagoTitulo = cuotaSinInteres
    ? `Hasta ${cuotaSinInteres.cuotas} cuotas sin interés`
    : "Cuotas con todas las tarjetas";
  const pagoDetalle =
    cuotaSinInteres?.montoCuota != null
      ? `${formatPriceArs(cuotaSinInteres.montoCuota)} por mes`
      : "Con todas las tarjetas y bancos";

  const tiendasTitulo =
    conStock.length > 0
      ? `Disponible en ${conStock.length} ${conStock.length === 1 ? "sucursal" : "sucursales"}`
      : "Sin stock en sucursales";

  return (
    <div className="oc-pdp-meta">
      <MetaCard
        className="is-envio"
        icon={<IconTruck />}
        title={envioSinCargo ? "Envío gratis a domicilio" : "Cotizá tu envío"}
        detail={
          envioSinCargo
            ? "Entrega en 24 hs en AMBA comprando antes de las 12 hs"
            : "Ingresá tu dirección y calculamos el costo"
        }
        cta={envioSinCargo ? undefined : "Calcular envío"}
        onClick={envioSinCargo ? undefined : () => setOpenEnvio(true)}
      />

      <MetaCard
        className="is-pago"
        icon={<IconCard />}
        title={pagoTitulo}
        detail={pagoDetalle}
        cta="Condiciones de pago"
        onClick={() => setOpenPago(true)}
      />

      {sucursales.length > 0 && (
        <MetaCard
          className="is-tiendas"
          icon={<IconPin />}
          title={tiendasTitulo}
          detail={conStock.length > 0 ? "Retiralo hoy mismo" : "Consultá otras opciones"}
          cta="Ver disponibilidad"
          onClick={() => setOpenTiendas(true)}
        />
      )}

      <PdpInfoModal
        open={openEnvio}
        title="Cotizá tu envío"
        onClose={() => setOpenEnvio(false)}
      >
        <PdpEnvioCotizador />
      </PdpInfoModal>

      <PdpInfoModal
        open={openPago}
        title="Condiciones de pago"
        onClose={() => setOpenPago(false)}
      >
        <ul className="oc-pdp-plans">
          {planes.map((plan) => (
            <li key={plan.cuotas} className={plan.sinInteres ? "is-sin-interes" : undefined}>
              <div className="oc-pdp-plan-left">
                <strong>{plan.cuotas} cuotas</strong>
                <span className="oc-pdp-plan-tag">
                  {plan.sinInteres ? "Sin interés" : `+${plan.recargoPct}% de recargo`}
                </span>
              </div>
              <div className="oc-pdp-plan-right">
                <strong>
                  {plan.montoCuota != null ? formatPriceArs(plan.montoCuota) : "Consultar"}
                </strong>
                {plan.total != null && <span>Total {formatPriceArs(plan.total)}</span>}
              </div>
            </li>
          ))}
        </ul>

        <div className="oc-pdp-plans-cards">
          <ul aria-label="Tarjetas aceptadas">
            <li>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/payment/visa.jpg" alt="Visa" width={48} height={30} />
            </li>
            <li>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/payment/mastercard.jpg" alt="Mastercard" width={48} height={30} />
            </li>
          </ul>
          <span className="oc-pdp-plans-mp">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/payment/mercadopago.png" alt="Mercado Pago" width={72} height={19} />
          </span>
        </div>

        <p className="oc-pdp-modal-note">{LEGAL_CONDICIONES_PAGO}</p>
        <Link className="oc-pdp-modal-link" href="/ocbeneficios">
          Ver todas las promociones bancarias
        </Link>
      </PdpInfoModal>

      <PdpInfoModal
        open={openTiendas}
        title="Disponibilidad"
        onClose={() => setOpenTiendas(false)}
      >
        <ul className="oc-pdp-availability">
          <li className={hayEnvio ? "is-ok" : "is-no"}>
            {hayEnvio ? <IconCheck /> : <IconDash />}
            <span>
              <strong>Envío a domicilio</strong>
              <span>
                {hayEnvio
                  ? envioSinCargo
                    ? "Envío gratis a todo el país"
                    : "Envío a todo el país"
                  : "Sin stock para envío"}
              </span>
            </span>
          </li>
          {conStock.map((s) => (
            <li key={s.name} className="is-ok">
              <IconCheck />
              <span>
                <strong>{s.name}</strong>
                <span>Retiro disponible</span>
              </span>
            </li>
          ))}
          {sinStock.map((s) => (
            <li key={s.name} className="is-no">
              <IconDash />
              <span>
                <strong>{s.name}</strong>
                <span>Sin stock</span>
              </span>
            </li>
          ))}
        </ul>
        <Link className="oc-pdp-modal-link" href="/tiendas">
          Ver direcciones y horarios de las tiendas
        </Link>
      </PdpInfoModal>
    </div>
  );
}
