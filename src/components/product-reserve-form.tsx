"use client";

import { useState } from "react";
import Link from "next/link";
import { submitContactForm, type ContactSubmitStatus } from "@/lib/submit-contact-form";

type Props = {
  productId: number;
  productTitle: string;
  productSku?: string | null;
};

export function ProductReserveForm({ productId, productTitle, productSku }: Props) {
  const [status, setStatus] = useState<ContactSubmitStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("loading");
    setError(null);
    const fd = new FormData(e.currentTarget);
    fd.set("productId", String(productId));
    fd.set("productTitle", productTitle);
    if (productSku) fd.set("productSku", productSku);
    const result = await submitContactForm("aviso-stock", fd);
    if (!result.ok) {
      setError(result.error);
      setStatus("error");
      return;
    }
    setStatus("sent");
    e.currentTarget.reset();
  }

  return (
    <div className="oc-pdp-reserve">
      <h3>Reservá este producto antes que llegue!</h3>
      <p>
        ¡No te preocupes! Dejá tu correo electrónico y te avisaremos en cuanto vuelva a estar
        disponible.
      </p>
      <form className="oc-pdp-reserve-form" onSubmit={onSubmit}>
        <input
          type="email"
          name="email"
          placeholder="Tu correo electrónico"
          required
          autoComplete="email"
        />
        <button type="submit" className="oc-btn oc-btn-dark" disabled={status === "loading"}>
          {status === "loading" ? "Enviando…" : "Reservar!"}
        </button>
        <label className="oc-pdp-reserve-privacy">
          <input type="checkbox" name="privacy" required />
          <span>
            He leído y acepto la{" "}
            <Link href="/politica-privacidad" target="_blank">
              política de privacidad
            </Link>
          </span>
        </label>
      </form>
      {status === "sent" ? (
        <p className="muted oc-pdp-reserve-ok">
          Listo. Te avisaremos cuando el producto vuelva a estar disponible.
        </p>
      ) : null}
      {error ? <p className="muted oc-pdp-reserve-ok" style={{ color: "#c00" }}>{error}</p> : null}
    </div>
  );
}
