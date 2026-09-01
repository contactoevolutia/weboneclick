"use client";

import { useState } from "react";
import { formatPriceArs } from "@/lib/pricing";

/**
 * Cotizador de envío a domicilio.
 *
 * MOCK: no hay integración con la API del correo todavía, así que el importe
 * se deriva del código postal. Se eligió derivarlo y no sortearlo para que la
 * demo sea estable — el mismo CP devuelve siempre lo mismo, y dos CP distintos
 * devuelven precios distintos, que es lo que se espera ver al probarlo.
 * Cuando exista la integración real, se reemplaza `cotizar`.
 */

const PROVINCIAS = [
  "Ciudad Autónoma de Buenos Aires",
  "Buenos Aires",
  "Catamarca",
  "Chaco",
  "Chubut",
  "Córdoba",
  "Corrientes",
  "Entre Ríos",
  "Formosa",
  "Jujuy",
  "La Pampa",
  "La Rioja",
  "Mendoza",
  "Misiones",
  "Neuquén",
  "Río Negro",
  "Salta",
  "San Juan",
  "San Luis",
  "Santa Cruz",
  "Santa Fe",
  "Santiago del Estero",
  "Tierra del Fuego",
  "Tucumán",
];

type Cotizacion = { monto: number; dias: string; localidad: string; provincia: string };

function cotizar(cp: string, localidad: string, provincia: string): Cotizacion {
  const n = Number(cp);
  const monto = Math.round((9800 + (n % 40) * 420) / 100) * 100;
  const dias = n % 3 === 0 ? "2 a 4" : n % 3 === 1 ? "3 a 5" : "4 a 7";
  return { monto, dias, localidad, provincia };
}

export function PdpEnvioCotizador() {
  const [cp, setCp] = useState("");
  const [direccion, setDireccion] = useState("");
  const [localidad, setLocalidad] = useState("");
  const [provincia, setProvincia] = useState("");
  const [error, setError] = useState("");
  const [cotizacion, setCotizacion] = useState<Cotizacion | null>(null);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{4}$/.test(cp.trim())) {
      setError("El código postal son 4 números.");
      return;
    }
    setError("");
    setCotizacion(cotizar(cp.trim(), localidad.trim(), provincia));
  }

  function reiniciar() {
    setCotizacion(null);
    setError("");
  }

  if (cotizacion) {
    return (
      <div className="oc-pdp-envio-result">
        <p className="oc-pdp-envio-result-dest">
          Envío a <strong>{cotizacion.localidad}</strong>, {cotizacion.provincia} (CP {cp})
        </p>

        <div className="oc-pdp-envio-result-row">
          <span>
            <strong>Envío a domicilio</strong>
            <span>Llega en {cotizacion.dias} días hábiles</span>
          </span>
          <strong className="oc-pdp-envio-monto">
            {formatPriceArs(cotizacion.monto)}
          </strong>
        </div>

        <button type="button" className="oc-pdp-envio-reset" onClick={reiniciar}>
          Cotizar otro destino
        </button>
      </div>
    );
  }

  return (
    <form className="oc-pdp-envio-form" onSubmit={onSubmit}>
      <label className="oc-pdp-envio-campo is-corto">
        <span>Código postal</span>
        <input
          value={cp}
          onChange={(e) => setCp(e.target.value)}
          inputMode="numeric"
          maxLength={4}
          placeholder="1425"
          required
        />
      </label>

      <label className="oc-pdp-envio-campo">
        <span>Dirección</span>
        <input
          value={direccion}
          onChange={(e) => setDireccion(e.target.value)}
          placeholder="Av. Santa Fe 1234, piso 5 B"
          required
        />
      </label>

      <label className="oc-pdp-envio-campo">
        <span>Localidad</span>
        <input
          value={localidad}
          onChange={(e) => setLocalidad(e.target.value)}
          placeholder="Palermo"
          required
        />
      </label>

      <label className="oc-pdp-envio-campo">
        <span>Provincia</span>
        <select value={provincia} onChange={(e) => setProvincia(e.target.value)} required>
          <option value="">Elegí una provincia</option>
          {PROVINCIAS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>

      {error && <p className="oc-pdp-envio-error">{error}</p>}

      <button type="submit" className="oc-pdp-envio-submit">
        Calcular envío
      </button>
    </form>
  );
}
