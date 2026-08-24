import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: { absolute: "Página no encontrada | OneClick" },
  description: "La página que buscás no existe o fue movida. Volvé al inicio o explorá nuestras categorías.",
  robots: { index: false, follow: true },
};

const LINKS = [
  { href: "/iphone", label: "iPhone" },
  { href: "/mac", label: "Mac" },
  { href: "/ipad", label: "iPad" },
  { href: "/airpods", label: "AirPods" },
  { href: "/watch", label: "Apple Watch" },
  { href: "/shop", label: "Ver tienda" },
] as const;

export default function NotFound() {
  return (
    <div className="container" style={{ padding: "4rem 1rem 5rem", textAlign: "center" }}>
      <p style={{ fontSize: "0.875rem", letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.6 }}>
        Error 404
      </p>
      <h1 style={{ fontSize: "clamp(1.75rem, 4vw, 2.5rem)", margin: "0.5rem 0 1rem" }}>
        Página no encontrada
      </h1>
      <p style={{ maxWidth: 480, margin: "0 auto 2rem", opacity: 0.8, lineHeight: 1.5 }}>
        La URL puede haber cambiado o el producto ya no está disponible. Probá estas categorías o
        buscá en la tienda.
      </p>
      <nav
        aria-label="Categorías sugeridas"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.75rem",
          justifyContent: "center",
          marginBottom: "2rem",
        }}
      >
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="oc-btn oc-btn-dark"
            style={{ textDecoration: "none" }}
          >
            {l.label}
          </Link>
        ))}
      </nav>
      <p>
        <Link href="/">Volver al inicio</Link>
      </p>
    </div>
  );
}
