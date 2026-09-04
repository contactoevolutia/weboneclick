"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckoutEnvioTotalRows } from "@/components/checkout-order-totals";
import type { AlignGrossItem } from "@/lib/odoo-amount";
import {
  getLastModoCobro,
  MODO_COBRO_EVENT,
  type ModoCobroCheckout,
} from "@/lib/modo-cobro";

function formatArs(value: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export type CheckoutOrderLine = {
  id_producto: number;
  titulo: string;
  cantidad: number;
  /** Subtotal a precio lista/promo (sin descuento contado). */
  subtotalLista: number;
  /** Subtotal si paga contado (igual a lista si no califica). */
  subtotalContado: number;
  elegibleContado: boolean;
};

type Props = {
  lines: CheckoutOrderLine[];
  subtotalLista: number;
  descuentoContadoMonto: number;
  /** Etiqueta del descuento Contado / 1 cuota (ej. "Descuento 1 cuota"). */
  descuentoLabel: string;
  cuponCodigo?: string | null;
  descuentoCupon: number;
  itemsTarjeta: AlignGrossItem[];
  itemsContado: AlignGrossItem[];
  iva105: number;
  iva21: number;
};

export function CheckoutOrderSummary({
  lines,
  subtotalLista,
  descuentoContadoMonto,
  descuentoLabel,
  cuponCodigo,
  descuentoCupon,
  itemsTarjeta,
  itemsContado,
  iva105,
  iva21,
}: Props) {
  const [modo, setModo] = useState<ModoCobroCheckout>("contado");

  useEffect(() => {
    setModo(getLastModoCobro());
    function onModo(e: Event) {
      const detail = (e as CustomEvent<{ modo: ModoCobroCheckout }>).detail;
      if (detail?.modo === "contado" || detail?.modo === "cuotas") {
        setModo(detail.modo);
      }
    }
    window.addEventListener(MODO_COBRO_EVENT, onModo);
    return () => window.removeEventListener(MODO_COBRO_EVENT, onModo);
  }, []);

  const esContado = modo === "contado";
  const mostrarDescuento = esContado && descuentoContadoMonto > 0;

  const cobroItems = useMemo(
    () => (esContado ? itemsContado : itemsTarjeta),
    [esContado, itemsContado, itemsTarjeta],
  );

  return (
    <table className="oc-checkout-order-table">
      <thead>
        <tr>
          <th>Producto</th>
          <th>Subtotal</th>
        </tr>
      </thead>
      <tbody>
        {lines.map((line) => {
          const showStrike =
            esContado &&
            line.elegibleContado &&
            line.subtotalContado < line.subtotalLista - 0.005;
          const display = esContado ? line.subtotalContado : line.subtotalLista;
          return (
            <tr key={line.id_producto}>
              <td>
                {line.titulo}{" "}
                <strong className="oc-checkout-qty">× {line.cantidad}</strong>
              </td>
              <td>
                {showStrike ? (
                  <span className="oc-checkout-line-prices">
                    <span className="oc-price-old">
                      {formatArs(line.subtotalLista)}
                    </span>{" "}
                    <span className="oc-checkout-line-now">
                      {formatArs(line.subtotalContado)}
                    </span>
                  </span>
                ) : (
                  formatArs(display)
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
      <tfoot>
        <tr>
          <th>Subtotal</th>
          <td>{formatArs(subtotalLista)}</td>
        </tr>
        {mostrarDescuento && (
          <tr className="oc-checkout-descuento-contado">
            <th>{descuentoLabel}</th>
            <td>−{formatArs(descuentoContadoMonto)}</td>
          </tr>
        )}
        {descuentoCupon > 0 && (
          <tr>
            <th>Cupón {cuponCodigo}</th>
            <td>−{formatArs(descuentoCupon)}</td>
          </tr>
        )}
        <CheckoutEnvioTotalRows
          items={cobroItems}
          iva105={iva105}
          iva21={iva21}
        />
      </tfoot>
    </table>
  );
}
