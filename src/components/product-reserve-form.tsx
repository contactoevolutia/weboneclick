"use client";

import { useEffect, useState } from "react";
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
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (!modalOpen) return;
    function onKeyDown(ev: KeyboardEvent) {
      if (ev.key === "Escape") setModalOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [modalOpen]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("loading");
    setError(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
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
    setModalOpen(true);
    form.reset();
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
      {status === "sent" && !modalOpen ? (
        <p className="muted oc-pdp-reserve-ok">
          Listo. Te avisaremos cuando el producto vuelva a estar disponible.
        </p>
      ) : null}
      {error ? <p className="muted oc-pdp-reserve-ok" style={{ color: "#c00" }}>{error}</p> : null}

      {modalOpen ? (
        <div
          className="oc-reserve-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="oc-reserve-modal-title"
          onClick={() => setModalOpen(false)}
        >
          <div className="oc-reserve-modal" onClick={(e) => e.stopPropagation()}>
            <div className="oc-reserve-modal-icon" aria-hidden="true">
              ✓
            </div>
            <h3 id="oc-reserve-modal-title">¡Listo!</h3>
            <p>
              Registramos tu correo. Te avisaremos por mail apenas <strong>{productTitle}</strong>{" "}
              vuelva a estar disponible.
            </p>
            <button
              type="button"
              className="oc-btn oc-btn-dark"
              autoFocus
              onClick={() => setModalOpen(false)}
            >
              Entendido
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
