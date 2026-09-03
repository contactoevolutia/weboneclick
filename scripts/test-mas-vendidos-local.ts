/** Verificación local de cantidad_vendida y orden mas-vendidos */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { resolveStockAvailability } from "../src/lib/products";

async function listMasVendidos(options: {
  categoriaId?: number;
  take?: number;
}) {
  const candidates = await prisma.producto.findMany({
    where: {
      activo: true,
      ...(options.categoriaId
        ? { categorias: { some: { id_categoria: options.categoriaId } } }
        : {}),
    },
    select: {
      id_producto: true,
      titulo: true,
      cantidad_vendida: true,
      stocks: {
        include: {
          almacen: {
            select: {
              odoo_id: true,
              id_tienda: true,
              es_envio_domicilio: true,
            },
          },
        },
      },
    },
  });

  const ranked = candidates
    .map((c) => ({
      id_producto: c.id_producto,
      titulo: c.titulo,
      cantidad_vendida: c.cantidad_vendida,
      inStock: resolveStockAvailability(c.stocks).inStock,
    }))
    .sort((a, b) => {
      if (a.inStock !== b.inStock) return a.inStock ? -1 : 1;
      const diff = b.cantidad_vendida - a.cantidad_vendida;
      if (diff !== 0) return diff;
      return b.id_producto - a.id_producto;
    });

  return ranked.slice(0, options.take ?? 10);
}

async function main() {
  const top = await prisma.producto.findMany({
    where: { cantidad_vendida: { gt: 0 } },
    orderBy: [{ cantidad_vendida: "desc" }, { id_producto: "desc" }],
    take: 10,
    select: { id_producto: true, titulo: true, slug: true, cantidad_vendida: true, sku: true },
  });

  console.log("\n=== Top 10 por cantidad_vendida ===");
  for (const p of top) {
    console.log(`  ${p.cantidad_vendida}x  ${p.titulo} (${p.slug})`);
  }

  const cat =
    (await prisma.categoria.findFirst({
      where: { slug: "iphone-17-pro" },
      select: { id_categoria: true, nombre: true, slug: true },
    })) ??
    (await prisma.categoria.findFirst({
      where: { slug: { contains: "iphone" } },
      orderBy: { id_categoria: "desc" },
      select: { id_categoria: true, nombre: true, slug: true },
    }));

  const shopItems = await listMasVendidos({ take: 5 });
  console.log(`\n=== Shop global mas-vendidos (top 5) ===`);
  for (const p of shopItems) {
    console.log(`  ${p.cantidad_vendida}x  ${p.inStock ? "stock" : "SIN STOCK"}  ${p.titulo}`);
  }

  if (cat) {
    const items = await listMasVendidos({ categoriaId: cat.id_categoria, take: 10 });
    console.log(`\n=== Listado mas-vendidos: ${cat.nombre} /${cat.slug} ===`);
    for (const p of items) {
      console.log(`  ${p.cantidad_vendida}x  ${p.inStock ? "stock" : "SIN STOCK"}  ${p.titulo}`);
    }
  } else {
    console.log("\n(categoría iphone-17-pro no encontrada en DB local)");
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
