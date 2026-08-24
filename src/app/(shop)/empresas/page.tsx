import { EmpresasContactForm } from "@/components/empresas-contact-form";
import { pageMetadata } from "@/lib/seo/build-metadata";
import { SEO_PAGES } from "@/lib/seo/pages-content";

const WA = process.env.NEXT_PUBLIC_WHATSAPP_PHONE || "5493415404538";
const seo = SEO_PAGES["/empresas"];

export const metadata = pageMetadata({
  title: seo.title,
  description: seo.description,
  path: "/empresas",
});

export default function EmpresasPage() {
  return (
    <div className="oc-empresas">
      <section className="oc-empresas-hero">
        <div className="container oc-empresas-hero-inner">
          <div>
            <h1>Apple para tu empresa con OneClick.</h1>
            <p className="oc-empresas-tagline">Más simple. Más rápido. Más pro.</p>
            <p>
              Gestioná tu flota Apple con Apple Business Manager. Comprá, configura y controla todo
              de forma remota. Sin complicaciones. Sin demoras.
            </p>
            <a
              className="oc-btn oc-btn-dark"
              href={`https://api.whatsapp.com/send?phone=${WA}&text=${encodeURIComponent("Venta Corporativa ")}`}
              target="_blank"
              rel="noreferrer"
            >
              Contactar OneClick Empresas
            </a>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/oneclick/pages/empresas.jpg" alt="OneClick Empresas" />
        </div>
      </section>

      <section className="container oc-empresas-solutions">
        <h2>Soluciones pensadas para empresas.</h2>
        <div className="oc-empresas-grid">
          <article>
            <h3>Solución para tu equipo IT: simple, seguro y conectado.</h3>
            <p>
              Implementación y configuración de dispositivos Apple con Apple Business Manager para
              tu organización.
            </p>
          </article>
          <article>
            <h3>Servicio técnico oficial Apple para empresas.</h3>
            <p>
              Soporte autorizado, repuestos originales y tiempos pensados para continuidad operativa.
            </p>
          </article>
          <article>
            <h3>Gestión de activos IT.</h3>
            <p>Seguimiento, renovación y administración de tu flota tecnológica con OneClick.</p>
          </article>
        </div>
        <a
          className="oc-btn oc-btn-dark"
          href={`https://api.whatsapp.com/send?phone=${WA}&text=${encodeURIComponent("Venta Corporativa ")}`}
          target="_blank"
          rel="noreferrer"
        >
          Contactar OneClick Empresas
        </a>
      </section>

      <section className="oc-empresas-form-wrap" id="contacto-empresas">
        <div className="container oc-empresas-form-inner">
          <h2>¿Querés empezar hoy?</h2>
          <p className="oc-empresas-form-lead">
            Dejanos tus datos y un asesor especializado te va a contactar en menos de 24 horas
          </p>
          <EmpresasContactForm />
        </div>
      </section>
    </div>
  );
}
