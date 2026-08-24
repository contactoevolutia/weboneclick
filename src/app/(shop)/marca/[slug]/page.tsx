import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ProductCard } from "@/components/product-card";
import { prisma } from "@/lib/prisma";
import { getActiveProducts } from "@/lib/products";
import { getDescuentoContadoConfig } from "@/lib/parametros";
import { pageMetadata } from "@/lib/seo/build-metadata";
import { truncateMeta } from "@/lib/seo/strip-html";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const marca = await prisma.marca.findUnique({
    where: { slug },
    select: { nombre: true, slug: true },
  });
  if (!marca) return {};
  return pageMetadata({
    title: `${marca.nombre} — Comprá en OneClick | Apple Premium Reseller`,
    description: truncateMeta(
      `Productos ${marca.nombre} en OneClick, Apple Premium Reseller y distribuidor oficial en Argentina. Garantía oficial, financiación y envío a todo el país.`
    ),
    path: `/marca/${marca.slug}`,
  });
}

export default async function MarcaPage({ params }: { params: Params }) {
  const { slug } = await params;
  const [marca, descuentoContado] = await Promise.all([
    prisma.marca.findUnique({
      where: { slug },
      select: { id_marca: true, nombre: true, slug: true },
    }),
    getDescuentoContadoConfig(),
  ]);
  if (!marca) notFound();

  const { items } = await getActiveProducts({ marcaId: marca.id_marca, take: 48 });

  return (
    <div className="container">
      <div className="oc-page-header">
        <nav className="oc-breadcrumb">
          <Link href="/">Inicio</Link>
          <span>/</span>
          <span>{marca.nombre}</span>
        </nav>
        <h1>{marca.nombre}</h1>
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
