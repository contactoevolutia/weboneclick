import Link from "next/link";
import { getActivePromosNav, isPromoIconImage } from "@/lib/promos";
import { uploadPublicUrl } from "@/lib/utils";
import { pageMetadata } from "@/lib/seo/build-metadata";
import { SEO_PAGES } from "@/lib/seo/pages-content";

const promoSeo = SEO_PAGES["/promo"];

export const metadata = pageMetadata({
  title: promoSeo.title,
  description: promoSeo.description,
  path: "/promo",
});

export default async function PromoIndexPage() {
  const promos = await getActivePromosNav();

  return (
    <div className="container">
      <div className="oc-page-header">
        <nav className="oc-breadcrumb">
          <Link href="/">Inicio</Link>
          <span>/</span>
          <span>Promociones</span>
        </nav>
        <h1>Promociones</h1>
      </div>

      <ul className="oc-promo-index-list">
        {promos.map((p) => (
          <li key={p.id_promocion}>
            <Link
              href={p.slug === "outlet-promo" ? "/outlet" : `/${p.slug}`}
              className="oc-promo-index-item"
            >
              {p.subtitulo ? <span className="oc-pill-badge">{p.subtitulo}</span> : null}
              <span className="oc-pill-panel-row">
                <span className="oc-pill-panel-label">{p.nombre}</span>
                {p.icono ? (
                  isPromoIconImage(p.icono) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={uploadPublicUrl(p.icono)}
                      alt=""
                      className="oc-pill-panel-icon-img"
                      aria-hidden
                    />
                  ) : (
                    <span className="oc-pill-panel-icon" aria-hidden>
                      {p.icono}
                    </span>
                  )
                ) : null}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {!promos.length && <p className="muted">No hay promociones activas.</p>}
    </div>
  );
}
