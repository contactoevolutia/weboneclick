import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ProductCard } from "@/components/product-card";
import { pickCurrentPriceInfo } from "@/lib/products";
import { normalizeDescuentoGeneral } from "@/lib/pricing";
import { getDescuentoContadoConfig } from "@/lib/parametros";

export const metadata = {
  title: "Lista de deseos",
  robots: { index: false, follow: false },
};

export default async function ListaDeseosPage() {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();

  if (!email) {
    return (
      <div className="container oc-static-page">
        <h1>Lista de deseos</h1>
        <p>Iniciá sesión para ver y guardar tu lista de deseos.</p>
        <Link href="/mi-cuenta" className="oc-btn oc-btn-primary">
          Ir a mi cuenta
        </Link>
      </div>
    );
  }

  const cliente = await prisma.cliente.findUnique({ where: { mail: email } });
  if (!cliente) {
    return (
      <div className="container oc-static-page">
        <h1>Lista de deseos</h1>
        <p>No encontramos un perfil de cliente asociado. Completá tu cuenta para usar la wishlist.</p>
      </div>
    );
  }

  const lista = await prisma.lista_deseos.findUnique({
    where: { id_cliente: cliente.id_cliente },
    include: {
      items: {
        include: {
          producto: {
            include: {
              precios: true,
              archivos: {
                where: { archivo: { tipo: "imagen_principal" } },
                include: { archivo: true },
                take: 1,
              },
              stocks: true,
            },
          },
        },
      },
    },
  });

  const items =
    lista?.items
      .filter((i) => i.producto.activo)
      .map((i) => {
        const priceInfo = pickCurrentPriceInfo(i.producto.precios);
        return {
          id_producto: i.producto.id_producto,
          titulo: i.producto.titulo,
          slug: i.producto.slug,
          descripcion: i.producto.descripcion,
          precio: priceInfo.precio,
          porcentaje_desc: priceInfo.porcentaje_desc,
          precio_con_desc: priceInfo.precio_con_desc,
          descuento_general: normalizeDescuentoGeneral(i.producto.descuento_general),
          imagen: i.producto.archivos[0]?.archivo.link ?? null,
          stockTotal: i.producto.stocks.reduce((a, s) => a + Number(s.cantidad), 0),
          stockTracked: i.producto.stocks.length > 0,
          cuotas_max: i.producto.cuotas_max,
        };
      }) ?? [];

  const descuentoContado = await getDescuentoContadoConfig();

  return (
    <div className="container">
      <div className="oc-page-header">
        <h1>Lista de deseos</h1>
        <p className="muted">{items.length} producto{items.length === 1 ? "" : "s"}</p>
      </div>
      <div className="oc-product-grid" style={{ paddingBottom: "2.5rem" }}>
        {items.map((p) => (
          <ProductCard
            key={p.id_producto}
            product={p}
            descuentoContado={descuentoContado}
          />
        ))}
      </div>
      {!items.length && <p className="muted">Tu lista está vacía.</p>}
    </div>
  );
}
