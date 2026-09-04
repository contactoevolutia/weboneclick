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
  const grupo = await prisma.grupo_producto.findUnique({
    where: { slug },
    select: { nombre: true, slug: true, descripcion: true },
  });
  if (!grupo) return {};
  return pageMetadata({
    title: `${grupo.nombre} | OneClick`,
    description: grupo.descripcion || `Grupo ${grupo.nombre} en OneClick.`,
    path: `/group/${grupo.slug}`,
    robots: { index: false, follow: true },
  });
}

export default async function GrupoPage({ params }: { params: Params }) {
  const { slug } = await params;
  const grupo = await prisma.grupo_producto.findUnique({
    where: { slug },
    include: {
      items: {
        orderBy: { orden: "asc" },
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
  if (!grupo) notFound();

  const items = grupo.items
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
    });

  const descuentoContado = await getDescuentoContadoConfig();

  return (
    <div className="container">
      <div className="oc-page-header">
        <nav className="oc-breadcrumb">
          <Link href="/">Inicio</Link>
          <span>/</span>
          <span>{grupo.nombre}</span>
        </nav>
        <h1>{grupo.nombre}</h1>
        {grupo.descripcion && <p className="oc-section-lead">{grupo.descripcion}</p>}
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
