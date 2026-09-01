"use client";

import type { RegaloTipo } from "@prisma/client";
import { useState } from "react";

export function regaloTipoLabel(tipo: RegaloTipo): string {
  switch (tipo) {
    case "monto":
      return "Monto";
    case "sku":
      return "Lista SKU";
    case "categoria":
      return "Categoría";
    default:
      return tipo;
  }
}

export function RegaloTipoFields({
  defaultTipo = "monto",
  defaultMonto = 750000,
  defaultPrioridad = 0,
}: {
  defaultTipo?: RegaloTipo;
  defaultMonto?: number;
  defaultPrioridad?: number;
}) {
  const [tipo, setTipo] = useState<RegaloTipo>(defaultTipo);

  return (
    <>
      <div className="form-field">
        <label>Tipo de condición</label>
        <select name="tipo" value={tipo} onChange={(e) => setTipo(e.target.value as RegaloTipo)}>
          <option value="monto">Por monto mínimo de compra</option>
          <option value="sku">Por lista de SKU en el carrito</option>
          <option value="categoria">Por categoría de productos</option>
        </select>
      </div>

      {tipo === "monto" ? (
        <div className="form-field">
          <label>Monto mínimo de compra</label>
          <input
            name="monto_minimo"
            type="number"
            step="0.01"
            min="0"
            required
            defaultValue={defaultMonto}
            placeholder="750000"
          />
        </div>
      ) : null}

      <div className="form-field">
        <label>Prioridad</label>
        <input
          name="prioridad"
          type="number"
          step="1"
          defaultValue={defaultPrioridad}
          placeholder="0"
        />
        <p className="muted" style={{ fontSize: "0.8rem", margin: "0.25rem 0 0" }}>
          Mayor prioridad gana si califican varias reglas a la vez.
        </p>
      </div>
    </>
  );
}
