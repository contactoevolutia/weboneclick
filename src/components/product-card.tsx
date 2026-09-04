import Link from "next/link";
import { AddToCartButton } from "@/components/add-to-cart";
import { ProductPrice } from "@/components/product-price";
import {
  formatPriceArs,
  precioSinImpuestos,
  precioUnaCuota,
  productoCalificaDescuentoContado,
  tieneDescuentoGeneral,
} from "@/lib/pricing";
import { precioEfectivo, type ProductListItem } from "@/lib/products";
import { uploadPublicUrl } from "@/lib/utils";

type Props = {
  product: ProductListItem;
  /** Config de descuento contado; si falta, no se muestra el texto. */
  descuentoContado?: { umbralCuotas: number; porcentaje: number } | null;
};

function formatPctLabel(pct: number): string {
  return Number.isInteger(pct) || pct % 1 === 0
    ? String(Math.round(pct))
    : pct.toFixed(1).replace(/\.0$/, "");
}

/** Card de producto estilo OneClick (cuotas en rojo + CTA animado). */
export function ProductCard({ product, descuentoContado = null }: Props) {
  const venta = precioEfectivo(product.precio, product.precio_con_desc);
  const sinImp = precioSinImpuestos(venta);
  const cuotas = product.cuotas_max ?? 12;
  const outOfStock = product.stockTracked && product.stockTotal <= 0;
  const hasGeneral = tieneDescuentoGeneral(product.descuento_general);
  const precio1Cuota = hasGeneral
    ? precioUnaCuota(product.precio, product.descuento_general)
    : null;
  const muestraContado =
    !hasGeneral &&
    descuentoContado != null &&
    productoCalificaDescuentoContado(
      product.cuotas_max,
      descuentoContado.umbralCuotas,
    );

  return (
    <article className="oc-product-card">
      <div className="oc-product-card-thumb">
        <Link href={`/producto/${product.slug}`} className="oc-product-card-media">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={product.imagen ? uploadPublicUrl(product.imagen) : "/placeholder-product.svg"}
            alt={product.titulo}
            width={400}
            height={400}
            loading="lazy"
            decoding="async"
          />
        </Link>
        {outOfStock && (
          <span className="out-of-stock product-label wd-shape-round-sm">Sin Stock</span>
        )}
        {product.promoBadge ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={uploadPublicUrl(product.promoBadge)}
            alt=""
            className="oc-product-card-promo-badge"
            aria-hidden
          />
        ) : null}
        <Link
          href="/lista-deseos"
          className="oc-product-card-wishlist"
          aria-label="Añadir a lista de deseos"
        >
          <HeartIcon />
        </Link>
      </div>
      <div className="oc-product-card-body">
        <Link href={`/producto/${product.slug}`}>
          <h3>{product.titulo}</h3>
        </Link>
        <ProductPrice
          precio={product.precio}
          porcentaje_desc={product.porcentaje_desc}
          precio_con_desc={product.precio_con_desc}
        />
        <p className="oc-cuotas">Hasta {cuotas} Cuotas sin interés.</p>
        {hasGeneral && precio1Cuota != null ? (
          <p className="oc-contado">
            1 cuota {formatPriceArs(precio1Cuota)} (−
            {formatPctLabel(product.descuento_general!)}%)
          </p>
        ) : null}
        {muestraContado ? (
          <p className="oc-contado">
            Pagando contado {descuentoContado!.porcentaje}% de descuento
          </p>
        ) : null}
        {sinImp != null && (
          <p className="oc-sin-imp">Sin imp nacionales: {formatPriceArs(sinImp)}</p>
        )}
        <div className="oc-add-form">
          {outOfStock ? (
            <Link href={`/producto/${product.slug}`} className="oc-btn oc-btn-cart">
              <span className="oc-btn-cart-label">Ver</span>
            </Link>
          ) : (
            <AddToCartButton idProducto={product.id_producto} className="oc-btn oc-btn-cart">
              <span className="oc-btn-cart-label">Agregar al carrito</span>
              <span className="oc-btn-cart-icon" aria-hidden>
                <CartBagIcon />
              </span>
            </AddToCartButton>
          )}
        </div>
      </div>
    </article>
  );
}

function HeartIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 20.5s-7.5-4.6-9.8-9.2C.6 7.8 2.3 4.5 5.7 4c2-.3 4 .6 5.1 2.3l1.2 1.8 1.2-1.8C14.3 4.6 16.3 3.7 18.3 4c3.4.5 5.1 3.8 3.5 7.3-2.3 4.6-9.8 9.2-9.8 9.2z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CartBagIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6 8h12l-1 12H7L6 8z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M9 8V7a3 3 0 016 0v1"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
