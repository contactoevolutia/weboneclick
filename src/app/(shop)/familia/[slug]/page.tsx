import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ProductCard } from "@/components/product-card";
import { prisma } from "@/lib/prisma";
import { getActiveProducts } from "@/lib/products";
import { getDescuentoContadoConfig } from "@/lib/parametros";
import { pageMetadata } from "@/lib/seo/build-metadata";
import { stripHtml, truncateMeta } from "@/lib/seo/strip-html";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const familia = await prisma.familia.findUnique({ where: { slug } });
  if (!familia) return {};
  const title = familia.titulo || familia.nombre;
  return pageMetadata({
    title: `${title} | OneClick Argentina`,
    description: truncateMeta(
      stripHtml(familia.descripcion) ||
        `${title} en OneClick, Apple Premium Reseller Argentina.`
    ),
    path: `/familia/${familia.slug}`,
  });
}

export default async function FamiliaPage({ params }: { params: Params }) {
  const { slug } = await params;
  const [familia, descuentoContado] = await Promise.all([
    prisma.familia.findUnique({ where: { slug } }),
    getDescuentoContadoConfig(),
  ]);
  if (!familia) notFound();

  const { items } = familia.id_categoria
    ? await getActiveProducts({ categoriaId: familia.id_categoria, take: 48 })
    : await getActiveProducts({ take: 48 });

  return (
    <div className="container">
      <div className="oc-page-header">
        <nav className="oc-breadcrumb">
          <Link href="/">Inicio</Link>
          <span>/</span>
          <span>{familia.nombre}</span>
        </nav>
        <h1>{familia.titulo || familia.nombre}</h1>
        {familia.descripcion && <p className="oc-section-lead">{familia.descripcion}</p>}
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
