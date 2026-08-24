import Link from "next/link";
import {
  HomePieBanner,
  HomeSecundarioBanner,
  HomeTripleBanners,
} from "@/components/home-banners";
import { HomeHeroCarousel } from "@/components/home-hero-carousel";
import { HomeDestacados } from "@/components/home-destacados";
import { ProductCard } from "@/components/product-card";
import { getActiveBanners } from "@/lib/products";
import { getDescuentoContadoConfig } from "@/lib/parametros";
import { getHomeSeccion } from "@/lib/secciones";
import { pageMetadata } from "@/lib/seo/build-metadata";
import { SEO_PAGES } from "@/lib/seo/pages-content";

const homeSeo = SEO_PAGES["/"];

export const metadata = pageMetadata({
  title: homeSeo.title,
  description: homeSeo.description,
  path: "/",
});

export default async function HomePage() {
  const [
    heroBanners,
    secundarioBanners,
    tripleBanners,
    pieBanners,
    destacados,
    fiesta,
    potencia,
    descuentoContado,
  ] = await Promise.all([
      getActiveBanners("hero"),
      getActiveBanners("secundario"),
      getActiveBanners("triple"),
      getActiveBanners("pie"),
      getHomeSeccion("destacados"),
      getHomeSeccion("fiesta"),
      getHomeSeccion("potencia"),
      getDescuentoContadoConfig(),
    ]);

  const categoryBanners = [
    {
      title: "Audio",
      href: "/audio",
      image: "/oneclick/banners/audio-full.jpg",
      text: "Tu música, tus reglas, en cualquier lugar. Con baterías de larga duración y diseños ultraligeros, nuestra colección de audio está pensada para acompañarte durante todo el día sin que te pierdas ni un solo compás.",
    },
    {
      title: "Mochilas",
      href: "/accesorios/bolsos-y-mochilas",
      image: "/oneclick/banners/mochilas-full.jpg",
      text: "Diseñadas para el ritmo de vida actual. Ofrecemos la máxima protección contra golpes y el clima, garantizando que tu mundo digital esté seguro sin importar a dónde te lleve la jornada.",
    },
    {
      title: "Fundas",
      href: "/accesorios/fundas-y-cobertores",
      image: "/oneclick/banners/fundas-full.jpg",
      text: "La fusión perfecta entre una armadura invisible y un diseño espectacular. Disfruta de una protección robusta en una funda ultradelgada y ligera que respeta y realza la forma original de tu teléfono.",
    },
  ];

  const hasDestacados = Boolean(destacados?.porPestana);

  return (
    <>
      <HomeHeroCarousel banners={heroBanners} />

      {/* Barra utilitaria oscura debajo del hero */}
      <section className="oc-utility-bar">
        <div className="container oc-utility-bar-inner">
          <p className="oc-utility-brand">
            <span className="oc-utility-ico" aria-hidden>
              <UtilityAppleIcon />
            </span>
            OneClick - Apple Premium Reseller
          </p>
          <div className="oc-utility-links">
            <Link href="/seguimiento-de-envios">
              <span className="oc-utility-ico" aria-hidden>
                <UtilityPackageIcon />
              </span>
              Seguí tu compra
            </Link>
            <Link href="/tiendas">
              <span className="oc-utility-ico" aria-hidden>
                <UtilityStoreIcon />
              </span>
              Tiendas
            </Link>
            <Link href="/empresas">
              <span className="oc-utility-ico" aria-hidden>
                <UtilityBuildingIcon />
              </span>
              Corporativos
            </Link>
            <Link href="/faqs">
              <span className="oc-utility-ico" aria-hidden>
                <UtilityChatIcon />
              </span>
              Preguntas frecuentes
            </Link>
          </div>
          <Link href="/servicio-tecnico" className="oc-utility-service">
            <span className="oc-utility-ico" aria-hidden>
              <UtilityToolsIcon />
            </span>
            Servicio técnico personalizado
          </Link>
        </div>
      </section>

      <HomeSecundarioBanner banner={secundarioBanners[0]} />

      {hasDestacados && destacados?.porPestana ? (
        <HomeDestacados
          title={destacados.nombre}
          products={destacados.porPestana}
          descuentoContado={descuentoContado}
        />
      ) : null}

      <HomeTripleBanners banners={tripleBanners} />

      {fiesta && fiesta.productos.length > 0 && (
        <section className="oc-section oc-jbl-carousel">
          <div className="container">
            <div className="oc-section-head">
              <h2>{fiesta.nombre}</h2>
              <Link
                href="/marca/jbl"
                className="oc-section-more"
                aria-label="Ver más productos JBL"
              >
                +
              </Link>
            </div>
            <div className="oc-product-grid oc-product-scroll">
              {fiesta.productos.map((p) => (
                <ProductCard
                  key={p.id_producto}
                  product={p}
                  descuentoContado={descuentoContado}
                />
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="oc-section oc-category-banners">
        <div className="container">
          <div className="oc-category-banner-grid">
            {categoryBanners.map((b) => (
              <Link key={b.title} href={b.href} className="oc-category-banner">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={b.image} alt={b.title} />
                <div className="oc-category-banner-shade" />
                <div className="oc-category-banner-copy">
                  <h3>{b.title}</h3>
                  <p>{b.text}</p>
                  <span className="oc-category-banner-cta">Ver Productos</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {potencia && potencia.productos.length > 0 && (
        <section className="oc-section oc-potencia">
          <div className="container">
            <div className="oc-section-head">
              <h2>{potencia.nombre}</h2>
              <Link
                href="/accesorios/fundas-y-cobertores"
                className="oc-section-more"
                aria-label="Ver más fundas"
              >
                +
              </Link>
            </div>
            <div className="oc-product-grid oc-product-scroll">
              {potencia.productos.map((p) => (
                <ProductCard
                  key={p.id_producto}
                  product={p}
                  descuentoContado={descuentoContado}
                />
              ))}
            </div>
          </div>
        </section>
      )}

      <HomePieBanner banner={pieBanners[0]} />
    </>
  );
}

function UtilityAppleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M16.7 12.6c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.2-2.8.9-3.5.9-.7 0-1.9-.8-3.1-.8-1.6 0-3.1 1-3.9 2.5-1.7 2.9-.4 7.2 1.2 9.6.8 1.1 1.7 2.4 3 2.4 1.2 0 1.6-.8 3.1-.8s1.8.8 3.1.8c1.3 0 2.1-1.1 2.9-2.3.9-1.3 1.3-2.6 1.3-2.6s-2.5-1-2.7-3.9zM14.4 5.8c.7-.8 1.1-1.9 1-3-.9.1-2.1.6-2.8 1.5-.6.7-1.2 1.9-1 3 1 .1 2.1-.5 2.8-1.5z" />
    </svg>
  );
}

function UtilityPackageIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <path d="M3.3 7 12 12l8.7-5M12 22V12" />
    </svg>
  );
}

function UtilityStoreIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M3 9 5 3h14l2 6" />
      <path d="M3 9v11a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V9" />
      <path d="M9 21V12h6v9" />
    </svg>
  );
}

function UtilityBuildingIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18" />
      <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
      <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" />
      <path d="M10 6h4M10 10h4M10 14h4M10 18h4" />
    </svg>
  );
}

function UtilityChatIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function UtilityToolsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}
