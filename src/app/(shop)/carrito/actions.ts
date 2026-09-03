"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  readCartLines,
  writeCartLines,
  clearCartCookie,
  resolveCart,
  type CartLine,
} from "@/lib/cart";
import { getActiveProducts, pickCurrentPriceInfo, precioEfectivo } from "@/lib/products";
import { getRelatedProductIds } from "@/lib/productos-relacionados";
import { uploadPublicUrl } from "@/lib/utils";

async function getStockState(id_producto: number): Promise<{
  tracked: boolean;
  available: number;
}> {
  const stocks = await prisma.stock.findMany({ where: { id_producto } });
  const available = stocks.reduce((acc, s) => acc + Number(s.cantidad), 0);
  return { tracked: stocks.length > 0, available };
}

function upsertLine(lines: CartLine[], id_producto: number, cantidad: number): CartLine[] {
  const next = lines.filter((l) => l.id_producto !== id_producto);
  if (cantidad > 0) next.push({ id_producto, cantidad });
  return next;
}

export async function addToCart(formData: FormData) {
  const id_producto = Number(formData.get("id_producto"));
  const cantidad = Math.max(1, Math.floor(Number(formData.get("cantidad") || 1)));
  if (!id_producto) throw new Error("Producto inválido");

  const product = await prisma.producto.findFirst({
    where: { id_producto, activo: true },
  });
  if (!product) throw new Error("Producto no disponible");

  const { tracked, available } = await getStockState(id_producto);
  // Sin filas de stock = aún no sincronizado → permitir. Con stock 0 = no permitir.
  if (tracked && available <= 0) {
    throw new Error("Producto sin stock");
  }

  const lines = await readCartLines();
  const existing = lines.find((l) => l.id_producto === id_producto)?.cantidad ?? 0;
  const max = tracked ? available : existing + cantidad + 99;
  const desired = Math.min(max, existing + cantidad);
  await writeCartLines(upsertLine(lines, id_producto, desired));

  revalidatePath("/carrito");
  revalidatePath("/shop");
  revalidatePath("/");

  // Desde cards del loop: quedar en la página (como ajax del sitio original)
  if (String(formData.get("stay") || "") === "1") {
    return;
  }

  redirect("/carrito");
}

export type AddToCartSummary =
  | { ok: false; error: string }
  | {
      ok: true;
      id_producto: number;
      titulo: string;
      imagen: string | null;
      precio: number | null;
      /** Cantidad agregada en esta operación */
      cantidad: number;
      itemCount: number;
      subtotal: number;
      related: {
        id_producto: number;
        titulo: string;
        slug: string;
        imagen: string | null;
        precio: number | null;
      }[];
    };

/** Agrega al carrito y devuelve el resumen para el popup "producto agregado". */
export async function addToCartWithSummary(input: {
  id_producto: number;
  cantidad?: number;
}): Promise<AddToCartSummary> {
  const id_producto = Number(input.id_producto);
  const cantidad = Math.max(1, Math.floor(Number(input.cantidad || 1)));
  if (!id_producto) return { ok: false, error: "Producto inválido" };

  const product = await prisma.producto.findFirst({
    where: { id_producto, activo: true },
    include: {
      precios: true,
      archivos: {
        where: { archivo: { tipo: "imagen_principal" } },
        include: { archivo: true },
        take: 1,
      },
    },
  });
  if (!product) return { ok: false, error: "Producto no disponible" };

  const { tracked, available } = await getStockState(id_producto);
  if (tracked && available <= 0) {
    return { ok: false, error: "Producto sin stock" };
  }

  const lines = await readCartLines();
  const existing = lines.find((l) => l.id_producto === id_producto)?.cantidad ?? 0;
  const max = tracked ? available : existing + cantidad + 99;
  const desired = Math.min(max, existing + cantidad);
  await writeCartLines(upsertLine(lines, id_producto, desired));

  revalidatePath("/carrito");
  revalidatePath("/shop");
  revalidatePath("/");

  const cart = await resolveCart();

  // "Generalmente se compran junto con…": accesorios Odoo (productos_relacionados)
  const relatedIds = await getRelatedProductIds(id_producto);
  let related: Extract<AddToCartSummary, { ok: true }>["related"] = [];
  if (relatedIds.length) {
    const { items } = await getActiveProducts({
      ids: relatedIds,
      take: Math.min(8, relatedIds.length),
    });
    const byId = new Map(items.map((p) => [p.id_producto, p]));
    related = relatedIds
      .map((id) => byId.get(id))
      .filter((p): p is NonNullable<typeof p> => p != null)
      .slice(0, 8)
      .map((p) => ({
        id_producto: p.id_producto,
        titulo: p.titulo,
        slug: p.slug,
        imagen: p.imagen ? uploadPublicUrl(p.imagen) : null,
        precio: precioEfectivo(p.precio, p.precio_con_desc),
      }));
  }

  const imagenLink = product.archivos[0]?.archivo.link ?? null;
  const priceInfo = pickCurrentPriceInfo(product.precios);
  return {
    ok: true,
    id_producto,
    titulo: product.titulo,
    imagen: imagenLink ? uploadPublicUrl(imagenLink) : null,
    precio: precioEfectivo(priceInfo.precio, priceInfo.precio_con_desc),
    cantidad,
    itemCount: cart.itemCount,
    subtotal: cart.subtotal,
    related,
  };
}

export async function updateQuantity(formData: FormData) {
  const id_producto = Number(formData.get("id_producto"));
  const cantidad = Math.floor(Number(formData.get("cantidad") || 0));
  if (!id_producto) throw new Error("Producto inválido");

  const { tracked, available } = await getStockState(id_producto);
  const lines = await readCartLines();
  const capped = tracked ? Math.min(available, cantidad) : cantidad;
  const nextQty = Math.max(0, capped);
  await writeCartLines(upsertLine(lines, id_producto, nextQty));

  revalidatePath("/carrito");
  revalidatePath("/");
}

export async function removeFromCart(formData: FormData) {
  const id_producto = Number(formData.get("id_producto"));
  if (!id_producto) throw new Error("Producto inválido");
  const lines = await readCartLines();
  await writeCartLines(lines.filter((l) => l.id_producto !== id_producto));
  revalidatePath("/carrito");
  revalidatePath("/");
}

export async function clearCart() {
  await clearCartCookie();
  revalidatePath("/carrito");
  revalidatePath("/");
}
