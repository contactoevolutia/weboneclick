import type { ReactNode } from "react";
import Link from "next/link";
import { JsonLdScript } from "@/components/json-ld";
import { ServicioTecnicoForm } from "@/components/servicio-tecnico-form";
import { pageMetadata } from "@/lib/seo/build-metadata";
import { howToJsonLd } from "@/lib/seo/json-ld";
import { SEO_PAGES } from "@/lib/seo/pages-content";

const seo = SEO_PAGES["/servicio-tecnico"];

export const metadata = pageMetadata({
  title: seo.title,
  description: seo.description,
  path: "/servicio-tecnico",
});

const HIGHLIGHTS = [
  {
    title: "Cambia tu batería y pantalla",
    href: "/reemplazo-de-pantalla-o-bateria",
    icon: "tools",
  },
  {
    title: "Programas de calidad Apple",
    href: "/programas-de-calidad",
    icon: "medal",
  },
  {
    title: "Programa Exchange",
    href: "/programa-exchange",
    icon: "exchange",
  },
] as const;

const DEVICES = [
  { src: "/oneclick/st/iphone.png", alt: "iPhone" },
  { src: "/oneclick/st/mac.png", alt: "Mac" },
  { src: "/oneclick/st/ipad.png", alt: "iPad" },
  { src: "/oneclick/st/watch.png", alt: "Apple Watch" },
  { src: "/oneclick/st/airpods.png", alt: "AirPods" },
  { src: "/oneclick/st/appletv.png", alt: "Apple TV" },
  { src: "/oneclick/st/beats.png", alt: "Beats" },
];

const FEATURES = [
  { title: "Técnicos certificados por Apple", icon: "tech" },
  { title: "Repuestos originales Apple", icon: "parts" },
  { title: "Garantía sobre las reparaciones", icon: "warranty" },
  { title: "Diagnóstico rápido y seguimiento online", icon: "track" },
  { title: "Cobertura oficial de garantía Apple", icon: "apple" },
] as const;

const SERVICES: { title: string; body: ReactNode }[] = [
  {
    title: "Diagnóstico",
    body: (
      <p>
        Nuestros técnicos certificados evalúan tu equipo, identifican el problema y te entregan una
        solución con presupuesto oficial.
      </p>
    ),
  },
  {
    title: "Cambio de batería",
    body: (
      <>
        <p>Reemplazo de batería con repuesto original Apple.</p>
        <p>Diagnóstico previo incluido.</p>
        <p>
          <strong>Tiempo estimado: 2 horas.</strong>
        </p>
      </>
    ),
  },
  {
    title: "Cambio de pantalla",
    body: (
      <>
        <p>Reparación con pantalla original Apple para iPhone o Mac.</p>
        <p>Diagnóstico previo incluido.</p>
        <p>
          <strong>Tiempo estimado: 2 horas.</strong>
        </p>
      </>
    ),
  },
  {
    title: "Asesoría personalizada",
    body: (
      <p>
        Capacitación sobre funciones clave de tu equipo: uso de apps Apple, creación y activación de
        Apple ID y configuración inicial.
      </p>
    ),
  },
  {
    title: "Actualización y restauración de software",
    body: (
      <p>
        Instalación de la última versión de iOS, iPadOS o macOS, restauración de sistema y
        optimización del equipo.
      </p>
    ),
  },
  {
    title: "Migración de información",
    body: (
      <p>
        Transferencia segura de datos entre dispositivos Apple. Evita perder información.
      </p>
    ),
  },
  {
    title: "Limpieza de equipos",
    body: (
      <p>
        Limpieza profesional externa e interna para mejorar la estética y el rendimiento de tu
        equipo Apple.
      </p>
    ),
  },
];

const STEPS = [
  "Traé tu equipo a la tienda o solicitá tu turno online con prioridad en atención.",
  "Recibí diagnóstico oficial",
  "Reparación con repuestos originales y garantía.",
  "Seguimiento online hasta la entrega.",
];

export default function ServicioTecnicoPage() {
  return (
    <div className="oc-st">
      <JsonLdScript
        data={howToJsonLd("Cómo funciona el servicio técnico OneClick", STEPS)}
      />
      <section className="container oc-st-hero">
        <h1>Servicio Técnico Apple Autorizado en Argentina</h1>
        <p>
          Soporte oficial para iPhone, iPad, Mac, Apple Watch y más. Reparaciones con repuestos
          originales y técnicos certificados Apple.
        </p>
        <a href="#requestst" className="oc-btn oc-btn-dark">
          Contactar Servicio Técnico OneClick
        </a>
      </section>

      <section className="container oc-st-cards">
        {HIGHLIGHTS.map((item) => (
          <Link key={item.title} className="oc-st-card" href={item.href}>
            <span className="oc-st-card-icon" aria-hidden>
              <HighlightIcon name={item.icon} />
            </span>
            <h2>{item.title}</h2>
            <span className="oc-st-card-more">Ver más &gt;</span>
          </Link>
        ))}
      </section>

      <section className="container oc-st-devices">
        <h2>Reparamos dispositivos Apple bajo garantía y fuera de garantía.</h2>
        <div className="oc-st-devices-row">
          {DEVICES.map((d) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={d.alt} src={d.src} alt={d.alt} />
          ))}
        </div>
      </section>

      <section className="container oc-st-value">
        <h2>Todos los servicios que necesitás para tus dispositivos Apple.</h2>
        <p className="oc-st-value-lead">
          En OneClick te ofrecemos soluciones oficiales, rápidas y seguras para todos tus equipos
          Apple.
        </p>
        <div className="oc-st-features-grid">
          {FEATURES.map((f) => (
            <article key={f.title}>
              <span className="oc-st-feature-icon" aria-hidden>
                <FeatureIcon name={f.icon} />
              </span>
              <p>{f.title}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="container oc-st-services">
        <div className="oc-st-accordion">
          {SERVICES.map((s) => (
            <details key={s.title} className="oc-st-acc-item">
              <summary>{s.title}</summary>
              <div className="oc-st-acc-body">{s.body}</div>
            </details>
          ))}
        </div>
        <div className="oc-st-services-cta">
          <a href="#requestst" className="oc-btn oc-btn-dark">
            Contactar Servicio Técnico OneClick
          </a>
        </div>
      </section>

      <section className="oc-st-steps-wrap">
        <div className="container oc-st-steps-inner">
          <h2>Cómo funciona el servicio técnico OneClick.</h2>
          <ol className="oc-st-steps">
            {STEPS.map((s, i) => (
              <li key={s}>
                <span aria-hidden>{["①", "②", "③", "④"][i]}</span>
                <p>{s}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="container oc-st-form-section" id="requestst">
        <ServicioTecnicoForm />
      </section>
    </div>
  );
}

function HighlightIcon({ name }: { name: (typeof HIGHLIGHTS)[number]["icon"] }) {
  if (name === "tools") {
    return (
      <svg width="48" height="48" viewBox="0 0 64.39 64.31" aria-hidden>
        <path
          fill="currentColor"
          d="M7.61,49.24l2.87-.29,15.4-15.35,4.85,4.85-15.37,15.37-.24,2.9c-.03.74-.53,1.5-1.32,1.98l-8.78,5.3c-.66.34-1.27.47-1.79-.03l-2.87-2.9c-.53-.5-.42-1.08-.03-1.79l5.27-8.73c.47-.82,1.24-1.29,2-1.32ZM28.47,21.71c1.56.87,3.3.74,4.59-.55,1.32-1.24,1.45-3.06.53-4.59l14.26-14.24c3.14-3.14,6.93-3.08,10.07.03l4.14,4.09c3.11,3.14,3.11,6.96,0,10.07l-14.26,14.29c-1.5-.95-3.3-.79-4.56.5-1.34,1.29-1.48,3.06-.53,4.54l-2.93,2.95c-1.29,1.29-3.06,1.37-4.4.08l-9.78-9.86c-1.32-1.37-1.34-3.08-.03-4.43l2.9-2.87ZM40.49,20.05c.34.34.87.34,1.27-.05l10.57-10.52c.37-.37.4-1,.03-1.34-.37-.32-1-.37-1.37,0l-10.52,10.55c-.4.42-.37.95.03,1.37ZM44.39,23.98c.37.34.92.37,1.34-.03l10.52-10.57c.34-.34.34-.87-.03-1.29-.34-.37-.92-.37-1.29.03l-10.52,10.49c-.42.45-.45.98-.03,1.37Z"
        />
      </svg>
    );
  }
  if (name === "medal") {
    return (
      <svg width="48" height="48" viewBox="0 0 41.03 58.22" aria-hidden>
        <path
          fill="currentColor"
          d="M20.51,0c11.26,0,20.51,9.25,20.51,20.59-.03,5.83-2.5,11.15-6.49,14.87v20.86c0,1.27-.66,1.9-1.63,1.9-.76,0-1.37-.47-2.03-1.11l-8.89-8.86c-.63-.63-1.05-.84-1.45-.84s-.82.21-1.48.84l-8.89,8.86c-.63.58-1.21,1.11-2.06,1.11-.9,0-1.58-.63-1.58-1.9l-.03-20.78C2.53,31.8,0,26.47,0,20.59,0,9.25,9.23,0,20.51,0ZM20.51,37.94c9.62,0,17.27-7.75,17.24-17.35-.03-9.62-7.62-17.35-17.24-17.35S3.3,10.97,3.3,20.59s7.59,17.32,17.22,17.35Z"
        />
      </svg>
    );
  }
  return (
    <svg width="48" height="48" viewBox="0 0 47.75 47.75" aria-hidden>
      <path
        fill="currentColor"
        d="M0,40.05V7.7C0,2.61,2.64,0,7.78,0h32.19c5.14,0,7.78,2.64,7.78,7.7v32.35c0,5.06-2.64,7.7-7.78,7.7H7.78c-5.14,0-7.78-2.61-7.78-7.7ZM39.89,44.48c2.93,0,4.59-1.56,4.59-4.61V7.88c0-3.06-1.66-4.61-4.59-4.61H7.83c-2.95,0-4.56,1.56-4.56,4.61v31.98c0,3.06,1.61,4.61,4.56,4.61h32.06ZM18.25,8.12c.26-.26.63-.42,1-.42.76,0,1.34.55,1.34,1.32,0,.37-.16.74-.45,1l-3.16,3.11-1.61,1.56,1.66-.05h18.48c.79,0,1.37.61,1.37,1.37s-.58,1.34-1.37,1.34h-18.51l-1.66-.05,1.63,1.56,3.16,3.11c.29.29.45.63.45,1,0,.76-.58,1.32-1.34,1.32-.37,0-.71-.13-1-.4l-6.96-6.88c-.53-.55-.55-1.48,0-2l6.96-6.88ZM29.5,39.71c-.29.24-.66.42-1,.42-.76,0-1.34-.58-1.34-1.34,0-.37.18-.71.42-.98l3.19-3.14,1.63-1.53-1.69.05H12.21c-.76,0-1.32-.61-1.32-1.37s.58-1.37,1.32-1.37h18.54l1.66.08-1.63-1.56-3.19-3.14c-.29-.26-.42-.61-.42-.98,0-.76.55-1.32,1.34-1.32.37,0,.74.16,1,.4l6.96,6.91c.53.53.58,1.4,0,1.95l-6.96,6.91Z"
      />
    </svg>
  );
}

function FeatureIcon({ name }: { name: (typeof FEATURES)[number]["icon"] }) {
  if (name === "tech") {
    return (
      <svg width="40" height="40" viewBox="0 0 55.23 58.55" aria-hidden>
        <path
          fill="currentColor"
          d="M0,53.5c0-8.28,10.47-20.27,27.63-20.27s27.6,11.98,27.6,20.27c0,3.48-2.5,5.06-7.75,5.06H7.75c-5.25,0-7.75-1.58-7.75-5.06ZM49.01,53.78c.82,0,1.14-.22,1.14-.88,0-5.22-8.03-14.89-22.51-14.89s-22.54,9.67-22.54,14.89c0,.66.35.88,1.17.88h42.75ZM13.97,14.51C13.97,6.48,20.14,0,27.63,0s13.66,6.36,13.66,14.45-6.13,14.83-13.66,14.83-13.66-6.64-13.66-14.77ZM36.2,14.45c0-5.53-3.86-9.67-8.57-9.67s-8.57,4.24-8.57,9.74,3.95,9.99,8.57,9.99,8.57-4.46,8.57-10.05Z"
        />
      </svg>
    );
  }
  if (name === "parts") {
    return (
      <svg width="40" height="40" viewBox="0 0 75.12 74.42" aria-hidden>
        <path
          fill="currentColor"
          d="M4.88,51.86c4.27-4.24,8.92-5.41,16.98-10.78L3.33,22.58c-4.43-4.43-4.43-9.17-.09-13.5l4.21-4.21c4.33-4.33,9.07-4.33,13.53.09l18.94,19.06c-2.43-6.48-1.14-13.91,3.92-18.97,5.69-5.72,14.64-6.67,21.85-2.47l-3.1,3.1-5.53,5.47c-.85.85-.76,1.96.16,2.91l3.86,3.89c.92.92,1.99.85,2.85,0l5.53-5.5,3.07-3.1c4.24,7.27,3.26,16.25-2.43,21.94-5.44,5.41-13.63,6.48-20.39,3.29-1.52,1.52-2.88,2.97-4.17,4.36l14.45,14.45,2.85.44c1.14.16,2.15.85,2.81,1.83l6.61,9.87c.66.98.73,1.99.06,2.69l-5.66,5.66c-.7.7-1.68.7-2.69.03l-9.9-6.7c-.95-.63-1.68-1.64-1.83-2.78l-.44-2.85-13.82-13.78c-8.95,11.54-9.61,17.23-14.73,22.42-5.41,5.44-12.77,5.37-18.27-.06-5.47-5.5-5.53-12.9-.06-18.31ZM25.37,38.58c3.54-2.59,7.62-5.98,12.49-10.56L17.65,7.82c-2.31-2.28-4.77-2.31-7.02-.03l-4.46,4.49c-2.28,2.31-2.31,4.71,0,7.02l19.19,19.29ZM42.6,28.87C20.15,50.75,15.63,47.5,7.98,55.11c-3.48,3.51-3.54,8.22.09,11.92,3.67,3.6,8.41,3.57,11.92.03,7.62-7.59,4.36-12.11,26.24-34.56-.7-.51-1.33-1.11-1.96-1.71-.6-.63-1.17-1.27-1.68-1.93ZM10.22,17.49c-.47-.44-.44-1.2,0-1.71.47-.44,1.26-.38,1.68,0l11.82,11.83c.47.47.44,1.2,0,1.64-.44.47-1.2.47-1.68,0l-11.82-11.76ZM10.07,61.22c0-2.15,1.74-3.89,3.89-3.89s3.92,1.74,3.92,3.89-1.77,3.92-3.92,3.92-3.89-1.77-3.89-3.92ZM14.18,13.54c-.44-.44-.47-1.17,0-1.64.41-.44,1.17-.47,1.64,0l11.82,11.79c.44.44.44,1.17-.03,1.71-.41.41-1.23.47-1.68,0l-11.76-11.86ZM64.83,69.34l2.88-2.88-6.04-8.03-3.54-.6-15.59-15.55c-.63.7-1.2,1.39-1.77,2.05l15.43,15.43.63,3.54,8,6.04ZM53.7,8.95l4.62-4.65c-4.17-.63-8.47.66-11.54,3.7-5.37,5.31-5.15,14.23.47,19.85,5.66,5.6,14.51,5.85,19.85.51,3.07-3.1,4.33-7.4,3.67-11.67l-4.68,4.71c-2.21,2.24-5.22,2.18-7.56-.16l-4.68-4.65c-2.43-2.37-2.5-5.34-.16-7.65Z"
        />
      </svg>
    );
  }
  if (name === "warranty") {
    return (
      <svg width="40" height="40" viewBox="0 0 41.03 58.22" aria-hidden>
        <path
          fill="currentColor"
          d="M20.51,0c11.26,0,20.51,9.25,20.51,20.59-.03,5.83-2.5,11.15-6.49,14.87v20.86c0,1.27-.66,1.9-1.63,1.9-.76,0-1.37-.47-2.03-1.11l-8.89-8.86c-.63-.63-1.05-.84-1.45-.84s-.82.21-1.48.84l-8.89,8.86c-.63.58-1.21,1.11-2.06,1.11-.9,0-1.58-.63-1.58-1.9l-.03-20.78C2.53,31.8,0,26.47,0,20.59,0,9.25,9.23,0,20.51,0ZM20.51,37.94c9.62,0,17.27-7.75,17.24-17.35-.03-9.62-7.62-17.35-17.24-17.35S3.3,10.97,3.3,20.59s7.59,17.32,17.22,17.35Z"
        />
      </svg>
    );
  }
  if (name === "track") {
    return (
      <svg width="40" height="40" viewBox="0 0 86.41 54.19" aria-hidden>
        <path
          fill="currentColor"
          d="M0,27.1C0,20.62,18.02,0,43.22,0s43.19,20.62,43.19,27.1-17.64,27.1-43.19,27.1S0,33.54,0,27.1ZM80.87,27.1c0-3.76-16.92-22.1-37.66-22.1S5.53,23.33,5.53,27.1c0,4.46,16.85,22.1,37.69,22.1s37.66-17.64,37.66-22.1ZM25.45,27.03c0-9.8,7.97-17.74,17.77-17.74s17.74,7.94,17.74,17.74-7.94,17.74-17.74,17.74-17.77-7.94-17.77-17.74ZM49.1,27.06c0-3.26-2.62-5.88-5.88-5.88s-5.88,2.62-5.88,5.88,2.62,5.88,5.88,5.88,5.88-2.62,5.88-5.88Z"
        />
      </svg>
    );
  }
  return (
    <svg width="40" height="40" viewBox="0 0 50.9 62.51" aria-hidden>
      <path
        fill="currentColor"
        d="M49.29,21.34c-.38.28-6.73,3.89-6.73,11.92,0,9.26,8.09,12.58,8.35,12.65-.03.22-1.3,4.49-4.27,8.88-2.69,3.83-5.5,7.71-9.74,7.71s-5.38-2.5-10.24-2.5-6.51,2.5-10.37,2.5-6.64-3.51-9.74-7.87c-3.64-5.15-6.54-13.15-6.54-20.74C0,21.75,7.9,15.11,15.71,15.11c4.11,0,7.52,2.88,10.15,2.88,2.47,0,6.32-2.88,11.03-2.88,1.77,0,8.19.19,12.39,6.23ZM26.21,14.45c-.35,0-.66-.06-.85-.1-.03-.16-.13-.63-.13-1.14,0-3.23,1.64-6.45,3.45-8.47,2.24-2.66,6.04-4.62,9.2-4.74.06.35.1.79.1,1.23,0,3.22-1.36,6.42-3.29,8.76-2.12,2.56-5.66,4.46-8.47,4.46Z"
      />
    </svg>
  );
}
