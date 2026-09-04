import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ProductCard } from "@/components/product-card";
import { prisma } from "@/lib/prisma";
import { pickCurrentPriceInfo } from "@/lib/products";
import { normalizeDescuentoGeneral } from "@/lib/pricing";
import { getDescuentoContadoConfig } from "@/lib/parametros";
import { pageMetadata } from "@/lib/seo/build-metadata";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const etiqueta = await prisma.etiqueta.findUnique({ where: { slug } });
  if (!etiqueta) return {};
  return pageMetadata({
    title: `${etiqueta.nombre} | OneClick`,
    description: `Productos con la etiqueta ${etiqueta.nombre} en OneClick.`,
    path: `/etiqueta/${etiqueta.slug}`,
    robots: { index: false, follow: true },
  });
}

export default async function EtiquetaPage({ params }: { params: Params }) {
  const { slug } = await params;
  const etiqueta = await prisma.etiqueta.findUnique({ where: { slug } });
  if (!etiqueta) notFound();

  const rows = await prisma.producto.findMany({
    where: {
      activo: true,
      etiquetas: { some: { id_etiqueta: etiqueta.id_etiqueta } },
    },
    include: {
      precios: true,
      archivos: {
        where: { archivo: { tipo: "imagen_principal" } },
        include: { archivo: true },
        take: 1,
      },
      stocks: true,
    },
    orderBy: { id_producto: "desc" },
    take: 48,
  });

  const items = rows.map((p) => {
    const priceInfo = pickCurrentPriceInfo(p.precios);
    return {
      id_producto: p.id_producto,
      titulo: p.titulo,
      slug: p.slug,
      descripcion: p.descripcion,
      precio: priceInfo.precio,
      porcentaje_desc: priceInfo.porcentaje_desc,
      precio_con_desc: priceInfo.precio_con_desc,
      descuento_general: normalizeDescuentoGeneral(p.descuento_general),
      imagen: p.archivos[0]?.archivo.link ?? null,
      stockTotal: p.stocks.reduce((a, s) => a + Number(s.cantidad), 0),
      stockTracked: p.stocks.length > 0,
      cuotas_max: p.cuotas_max,
    };
  });

  const descuentoContado = await getDescuentoContadoConfig();

  return (
    <div className="container">
      <div className="oc-page-header">
        <nav className="oc-breadcrumb">
          <Link href="/">Inicio</Link>
          <span>/</span>
          <span>{etiqueta.nombre}</span>
        </nav>
        <h1>{etiqueta.nombre}</h1>
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
    </div>
  );
}
