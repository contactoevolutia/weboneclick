import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { JsonLdScript } from "@/components/json-ld";
import { ViewItemTracker } from "@/components/funnel-trackers";
import { ProductAddToCart } from "@/components/product-add-to-cart";
import { ProductCard } from "@/components/product-card";
import { ProductGallery } from "@/components/product-gallery";
import { ProductPrice } from "@/components/product-price";
import { ProductReserveForm } from "@/components/product-reserve-form";
import { ProductStoreAvailability } from "@/components/product-store-availability";
import {
  getActiveProducts,
  getProductBySlug,
  precioEfectivo,
  resolveStoreAvailability,
  sortProductImageLinks,
} from "@/lib/products";
import { formatPriceArs, precioSinImpuestos, productoCalificaDescuentoContado } from "@/lib/pricing";
import { getDescuentoContadoConfig } from "@/lib/parametros";
import { whatsappUrl, uploadPublicUrl } from "@/lib/utils";
import { pageMetadata } from "@/lib/seo/build-metadata";
import { breadcrumbJsonLd, productJsonLd } from "@/lib/seo/json-ld";
import { stripHtml, truncateMeta } from "@/lib/seo/strip-html";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return { title: "Producto no encontrado" };

  const imagenes = sortProductImageLinks(
    product.archivos.map((a) => ({
      link: a.archivo.link,
      tipo: a.archivo.tipo,
      id_archivo: a.archivo.id_archivo,
    }))
  );
  const image = imagenes[0] ? uploadPublicUrl(imagenes[0]) : null;
  const desc = truncateMeta(
    stripHtml(product.descripcion) ||
      `Comprá ${product.titulo} en OneClick, Apple Premium Reseller Argentina. Garantía oficial y envío a todo el país.`
  );

  return pageMetadata({
    title: `${product.titulo} | OneClick`,
    description: desc,
    path: `/producto/${product.slug}`,
    image,
  });
}

function DeliveryBlock() {
  return (
    <div className="oc-pdp-delivery">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="oc-pdp-delivery-icon"
        src="/delivery-24hs.svg"
        alt=""
        width={40}
        height={40}
        aria-hidden
      />
      <div className="oc-pdp-delivery-text">
        <strong>Entrega dentro de las 24hs en AMBA</strong>
        <p>Recibilo en 24hs comprando antes de las 12hs</p>
      </div>
    </div>
  );
}

function WishlistLink() {
  return (
    <Link href="/lista-deseos" className="oc-pdp-wishlist">
      <span className="oc-pdp-wishlist-icon" aria-hidden>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path
            d="M12 20.5s-7.5-4.6-9.8-9.2C.6 7.8 2.3 4.5 5.7 4c2-.3 4 .6 5.1 2.3l1.2 1.8 1.2-1.8C14.3 4.6 16.3 3.7 18.3 4c3.4.5 5.1 3.8 3.5 7.3-2.3 4.6-9.8 9.2-9.8 9.2z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      Añadir a lista de deseos
    </Link>
  );
}

function BankPromoBlock({
  cuotas,
  cuotaMonto,
}: {
  cuotas: number;
  cuotaMonto: number | null;
}) {
  return (
    <div className="oc-pdp-bank">
      <h4>Promociones Bancarias</h4>
      <div className="oc-pdp-bank-row">
        <div className="oc-pdp-bank-info">
          <p className="oc-pdp-bank-title">{cuotas} cuotas sin interés</p>
          <p className="oc-pdp-bank-sub">
            Con todas las tarjetas y bancos
            {cuotaMonto != null ? ` - Cuotas de ${formatPriceArs(cuotaMonto)}` : null}
          </p>
        </div>
        <div className="oc-pdp-bank-pay">
          <ul className="oc-pdp-bank-cards" aria-label="Tarjetas">
            <li>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/payment/mastercard.jpg" alt="Mastercard" width={56} height={36} />
            </li>
            <li>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/payment/visa.jpg" alt="VISA" width={56} height={36} />
            </li>
          </ul>
          <div className="oc-pdp-bank-mp">
            <span>Pagando con:</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/payment/mercadopago.png" alt="Mercado Pago" width={72} height={19} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default async function ProductoPage({ params }: { params: Params }) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) notFound();

  const imagenes = sortProductImageLinks(
    product.archivos.map((a) => ({
      link: a.archivo.link,
      tipo: a.archivo.tipo,
      id_archivo: a.archivo.id_archivo,
    }))
  );
  const cuotas = product.cuotas_max ?? 12;
  const venta = precioEfectivo(product.precio, product.precio_con_desc);
  const sinImp = precioSinImpuestos(venta);
  const descConfig = await getDescuentoContadoConfig();
  const muestraContado = productoCalificaDescuentoContado(
    product.cuotas_max,
    descConfig.umbralCuotas,
  );
  const inStock = product.inStock;
  const storeAvailability = resolveStoreAvailability(product.stocks);
  const cuotaMonto =
    venta != null && cuotas > 0 ? Number(venta) / cuotas : null;
  const waReserve = whatsappUrl(product.titulo, product.id_producto, "reserva");
  const maxQty =
    product.stockTracked && product.stockTotal > 0
      ? Math.min(99, Math.floor(product.stockTotal))
      : 99;

  const categoryId = product.categorias[0]?.id_categoria;
  const related = categoryId
    ? (
        await getActiveProducts({
          categoriaId: categoryId,
          take: 8,
        })
      ).items.filter((p) => p.id_producto !== product.id_producto).slice(0, 8)
    : [];

  return (
    <div className="container oc-pdp">
      <JsonLdScript
        data={[
          breadcrumbJsonLd([
            { name: "Inicio", path: "/" },
            ...(product.categorias[0]
              ? [
                  {
                    name: product.categorias[0].categoria.nombre,
                    path: `/${product.categorias[0].categoria.slug}`,
                  },
                ]
              : []),
            { name: product.titulo, path: `/producto/${product.slug}` },
          ]),
          productJsonLd({
            name: product.titulo,
            description: truncateMeta(stripHtml(product.descripcion), 300),
            slug: product.slug,
            sku: product.sku,
            image: imagenes[0] ? uploadPublicUrl(imagenes[0]) : null,
            brandName: product.marca?.nombre,
            price: venta,
            inStock,
            refurbished: product.categorias.some((c) =>
              /outlet/i.test(c.categoria.slug + c.categoria.nombre)
            ),
          }),
        ]}
      />
      <ViewItemTracker
        itemId={String(product.id_producto)}
        itemName={product.titulo}
        price={venta}
        itemCategory={product.categorias[0]?.categoria.nombre}
      />
      <div className="oc-page-header">
        <nav className="oc-breadcrumb">
          <Link href="/">Inicio</Link>
          <span>/</span>
          {product.categorias[0] && (
            <>
              <Link href={`/${product.categorias[0].categoria.slug}`}>
                {product.categorias[0].categoria.nombre}
              </Link>
              <span>/</span>
            </>
          )}
          <span>{product.titulo}</span>
        </nav>
      </div>

      <div className="oc-product-detail">
        <ProductGallery images={imagenes} alt={product.titulo} outOfStock={!inStock} />

        <div className="oc-pdp-buybox">
          {product.marca && (
            <p className="oc-pdp-brand">
              <Link href={`/marca/${product.marca.slug}`}>{product.marca.nombre}</Link>
            </p>
          )}
          <h1>{product.titulo}</h1>
          <ProductPrice
            precio={product.precio}
            porcentaje_desc={product.porcentaje_desc}
            precio_con_desc={product.precio_con_desc}
          />

          {inStock ? (
            <>
              <p className="oc-cuotas">Hasta {cuotas} Cuotas sin interés.</p>
              {muestraContado ? (
                <p className="oc-contado">
                  Pagando contado {descConfig.porcentaje}% de descuento
                </p>
              ) : null}
              {sinImp != null && (
                <p className="oc-sin-imp">Sin imp nacionales: {formatPriceArs(sinImp)}</p>
              )}

              <p className="oc-pdp-in-stock">Hay existencias</p>

              <ProductAddToCart idProducto={product.id_producto} maxQty={maxQty} />

              <WishlistLink />

              <DeliveryBlock />
              <BankPromoBlock cuotas={cuotas} cuotaMonto={cuotaMonto} />

              <ProductStoreAvailability items={storeAvailability} />
            </>
          ) : (
            <>
              <p className="oc-pdp-oos-label">Sin existencias</p>
              <ProductReserveForm
                productId={product.id_producto}
                productTitle={product.titulo}
                productSku={product.sku}
              />
              <WishlistLink />

              <div className="oc-pdp-reserve-now">
                <h3>Reservá ahora</h3>
                <p>
                  Contactá a nuestros asesores para conocer las alternativas y/o reservar tu
                  producto.
                </p>
                <a
                  className="oc-btn oc-btn-dark oc-pdp-wa-btn"
                  href={waReserve}
                  target="_blank"
                  rel="noreferrer"
                >
                  Abrir WhatsApp
                </a>
              </div>

              <DeliveryBlock />
              <BankPromoBlock cuotas={cuotas} cuotaMonto={cuotaMonto} />
            </>
          )}
        </div>
      </div>

      <section className="oc-pdp-description">
        <h2>Descripción</h2>
        <div dangerouslySetInnerHTML={{ __html: product.descripcion }} />
        {product.caracteristicas.length > 0 && (
          <div className="oc-pdp-specs">
            <h3>Características</h3>
            <ul>
              {product.caracteristicas.map((c) => (
                <li key={c.id_caracteristica}>
                  <strong>{c.caracteristica.nombre}:</strong> {c.valor}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {related.length > 0 && (
        <section className="oc-pdp-related">
          <h2>Productos relacionados</h2>
          <div className="oc-product-grid">
            {related.map((p) => (
              <ProductCard
                key={p.id_producto}
                product={p}
                descuentoContado={descConfig}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
