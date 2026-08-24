import { permanentRedirect, notFound } from "next/navigation";
import { getProductById } from "@/lib/products";

type Params = Promise<{ id: string }>;

/** Compatibilidad con URLs viejas /catalogo/:id → /producto/:slug (308). */
export default async function CatalogoIdRedirect({ params }: { params: Params }) {
  const { id } = await params;
  const product = await getProductById(Number(id));
  if (!product) notFound();
  permanentRedirect(`/producto/${product.slug}`);
}
