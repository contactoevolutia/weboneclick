"use client";

import { useState } from "react";
import type { RegaloApplicable } from "@/lib/regalos";

type Props = {
  regalo: RegaloApplicable;
};

export function CheckoutGiftSelector({ regalo }: Props) {
  const [selected, setSelected] = useState<number | "">("");

  return (
    <div className="oc-checkout-gift">
      <h3>¡Elegí tu regalo!</h3>
      <p className="oc-checkout-gift-lead">
        {regalo.monto_minimo != null ? (
          <>
            Tu compra supera{" "}
            {regalo.monto_minimo.toLocaleString("es-AR", {
              style: "currency",
              currency: "ARS",
              minimumFractionDigits: 0,
            })}
            .{" "}
          </>
        ) : (
          <>Tu compra califica para un obsequio. </>
        )}
        Elegí uno de estos obsequios de <strong>{regalo.nombre}</strong>.
      </p>

      <div className="oc-checkout-gift-options" role="radiogroup" aria-label="Regalo">
        {regalo.productos.map((p) => {
          const isOn = selected === p.id_producto;
          return (
            <label
              key={p.id_producto}
              className={`oc-checkout-gift-card${isOn ? " is-selected" : ""}`}
            >
              <input
                type="radio"
                name="id_producto_regalo"
                value={p.id_producto}
                checked={isOn}
                required
                onChange={() => setSelected(p.id_producto)}
              />
              {p.imagen ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.imagen} alt="" className="oc-checkout-gift-img" />
              ) : (
                <span className="oc-checkout-gift-img oc-checkout-gift-img--empty" />
              )}
              <span className="oc-checkout-gift-meta">
                <span className="oc-checkout-gift-title">{p.titulo}</span>
                {p.sku ? <span className="oc-checkout-gift-sku">SKU {p.sku}</span> : null}
                <span className="oc-checkout-gift-free">Sin cargo</span>
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
