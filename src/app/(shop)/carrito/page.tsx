import Link from "next/link";
import { ivaIncluded, resolveCart } from "@/lib/cart";
import { computeTotals } from "@/lib/checkout-venta";
import { resolveAppliedCupon } from "@/lib/cupones";
import { getValorEnvioGratis } from "@/lib/parametros";
import { formatPriceArs, precioUnaCuota, tieneDescuentoGeneral } from "@/lib/pricing";
import { uploadPublicUrl } from "@/lib/utils";
import { CartCouponForm } from "@/components/cart-coupon-form";
import { CartQtyControl } from "@/components/cart-qty-control";
import { removeFromCart } from "./actions";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Carrito",
  robots: { index: false, follow: false },
};

export default async function CarritoPage() {
  const [cart, valorEnvioGratis, cupon] = await Promise.all([
    resolveCart(),
    getValorEnvioGratis(),
    resolveAppliedCupon(),
  ]);
  const cuponMonto = cupon?.monto ?? 0;
  const { descuentoCupon, total: totalConCupon } = computeTotals(
    cart,
    "tarjeta",
    cuponMonto,
  );

  const remainingForFreeShip = Math.max(0, valorEnvioGratis - cart.subtotal);
  const freeShipProgress = Math.min(
    100,
    cart.subtotal > 0 && valorEnvioGratis > 0
      ? (cart.subtotal / valorEnvioGratis) * 100
      : 0,
  );
  const hasFreeShipping = remainingForFreeShip <= 0 && cart.subtotal > 0;

  let iva105 = 0;
  let iva21 = 0;
  for (const item of cart.items) {
    if (item.subtotal == null || !item.disponible) continue;
    const tax = ivaIncluded(item.subtotal, item.ivaRate);
    if (item.ivaRate <= 0.11) iva105 += tax;
    else iva21 += tax;
  }

  return (
    <div className="oc-cart-page">
      <div className="container">
        {cart.items.length === 0 ? (
          <div className="oc-cart-empty">
            <h1>Tu carrito está vacío.</h1>
            <p>
              Antes de finalizar la compra, debe agregar algunos productos a su carrito.
              Encontrará muchos productos interesantes en nuestra página &quot;Tienda&quot;.
            </p>
            <Link href="/shop" className="oc-btn oc-btn-dark">
              Volver a la tienda
            </Link>
          </div>
        ) : (
          <>
            <h1 className="oc-cart-title">Carrito</h1>

            {!cart.canCheckout && (
              <div className="oc-cart-alert">
                Algunos productos no tienen stock o precio suficiente. Ajustá las
                cantidades antes de continuar.
              </div>
            )}

            <div className="oc-cart-layout">
              <div className="oc-cart-main">
                <div className="oc-cart-shipping">
                  {hasFreeShipping ? (
                    <p>¡Ya tienes envío gratis disponible!</p>
                  ) : (
                    <p>
                      ¡Te faltan{" "}
                      <strong>{formatPriceArs(remainingForFreeShip)}</strong> para
                      obtener envío gratis!
                    </p>
                  )}
                  <div
                    className="oc-cart-shipping-bar"
                    role="progressbar"
                    aria-valuenow={Math.round(freeShipProgress)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <span style={{ width: `${freeShipProgress}%` }} />
                  </div>
                </div>

                <div className="oc-cart-table-wrap">
                  <table className="oc-cart-table">
                    <thead>
                      <tr>
                        <th className="oc-cart-col-remove" aria-label="Quitar" />
                        <th>Producto</th>
                        <th>Precio</th>
                        <th>Cantidad</th>
                        <th>Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cart.items.map((item) => {
                        const href = item.slug
                          ? `/producto/${item.slug}`
                          : `/shop`;
                        const maxQty = item.stockTracked
                          ? Math.max(1, item.stockTotal)
                          : 99;
                        return (
                          <tr
                            key={item.id_producto}
                            className={item.disponible ? undefined : "is-warn"}
                          >
                            <td className="oc-cart-col-remove">
                              <form action={removeFromCart}>
                                <input
                                  type="hidden"
                                  name="id_producto"
                                  value={item.id_producto}
                                />
                                <button
                                  type="submit"
                                  className="oc-cart-remove"
                                  aria-label="Quitar producto"
                                >
                                  ×
                                </button>
                              </form>
                            </td>
                            <td>
                              <div className="oc-cart-product">
                                <Link href={href} className="oc-cart-thumb">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={
                                      item.imagen
                                        ? uploadPublicUrl(item.imagen)
                                        : "/placeholder-product.svg"
                                    }
                                    alt=""
                                  />
                                </Link>
                                <div>
                                  <Link href={href} className="oc-cart-product-name">
                                    {item.titulo}
                                  </Link>
                                  {!item.disponible && (
                                    <p className="oc-cart-warn">
                                      {item.stockTracked && item.stockTotal <= 0
                                        ? "Sin stock"
                                        : item.precio == null
                                          ? "Sin precio"
                                          : `Stock disponible: ${item.stockTotal}`}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="oc-cart-price">
                              {item.porcentajeDesc != null &&
                              item.precioLista != null &&
                              item.precio != null &&
                              item.precioLista > item.precio ? (
                                <div className="oc-price-block">
                                  <p className="oc-price-old">
                                    {formatPriceArs(item.precioLista)}
                                  </p>
                                  <p className="oc-price-row">
                                    <span className="oc-price-pct">
                                      −{Math.round(item.porcentajeDesc)}%
                                    </span>
                                    <span className="oc-price oc-price-sale">
                                      {formatPriceArs(item.precio)}
                                    </span>
                                  </p>
                                </div>
                              ) : (
                                formatPriceArs(item.precio)
                              )}
                              {tieneDescuentoGeneral(item.descuento_general) &&
                              item.precioLista != null
                                ? (() => {
                                    const p1 = precioUnaCuota(
                                      item.precioLista,
                                      item.descuento_general,
                                    );
                                    return p1 != null ? (
                                      <p className="oc-contado" style={{ marginTop: "0.35rem" }}>
                                        1 cuota {formatPriceArs(p1)} (−
                                        {Math.round(item.descuento_general!)}%)
                                      </p>
                                    ) : null;
                                  })()
                                : null}
                            </td>
                            <td>
                              <CartQtyControl
                                idProducto={item.id_producto}
                                cantidad={item.cantidad}
                                maxQty={maxQty}
                              />
                            </td>
                            <td className="oc-cart-subtotal">
                              {formatPriceArs(item.subtotal)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <CartCouponForm
                  appliedCodigo={cupon?.codigo}
                  appliedMonto={descuentoCupon > 0 ? descuentoCupon : null}
                />
              </div>

              <aside className="oc-cart-totals">
                <h2>Totales del carrito</h2>
                <dl>
                  <div>
                    <dt>Subtotal</dt>
                    <dd>{formatPriceArs(cart.subtotal)}</dd>
                  </div>
                  {descuentoCupon > 0 && (
                    <div>
                      <dt>Cupón {cupon?.codigo}</dt>
                      <dd>−{formatPriceArs(descuentoCupon)}</dd>
                    </div>
                  )}
                  <div className="oc-cart-totals-total">
                    <dt>Total</dt>
                    <dd>
                      <strong>{formatPriceArs(totalConCupon)}</strong>
                      {(iva105 > 0 || iva21 > 0) && (
                        <span className="oc-cart-tax">
                          (incluye
                          {iva105 > 0 && <> {formatPriceArs(iva105)} IVA 10.5%</>}
                          {iva105 > 0 && iva21 > 0 && ","}
                          {iva21 > 0 && <> {formatPriceArs(iva21)} IVA 21%</>})
                        </span>
                      )}
                    </dd>
                  </div>
                </dl>
                {cart.canCheckout ? (
                  <Link href="/checkout" className="oc-btn oc-btn-dark oc-cart-checkout">
                    Finalizar compra
                  </Link>
                ) : (
                  <button type="button" className="oc-btn oc-btn-dark oc-cart-checkout" disabled>
                    Finalizar compra
                  </button>
                )}
              </aside>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
