import { ALMACEN_WEB_SELECT } from "@/lib/almacenes";
import { isMailConfigured, sendMail } from "@/lib/mail";
import { prisma } from "@/lib/prisma";
import { resolveStockAvailability } from "@/lib/products";
import { absoluteUrl } from "@/lib/seo/site";

export type StockAlertStats = {
  pendientes: number;
  productosConStock: number;
  notificados: number;
  errores: number;
  dryRun: boolean;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildMail(titulo: string, url: string) {
  return {
    subject: `${titulo} ya está disponible en OneClick`,
    text: [
      "¡Buenas noticias!",
      "",
      `El producto que estabas esperando volvió a estar disponible: ${titulo}.`,
      "",
      `Compralo acá: ${url}`,
      "",
      "El stock es limitado, así que no te lo pierdas.",
      "",
      "Equipo OneClick",
    ].join("\n"),
    html: [
      "<p>¡Buenas noticias!</p>",
      `<p>El producto que estabas esperando volvió a estar disponible: <strong>${escapeHtml(titulo)}</strong>.</p>`,
      `<p><a href="${escapeHtml(url)}">Compralo acá</a></p>`,
      "<p>El stock es limitado, así que no te lo pierdas.</p>",
      "<p>Equipo OneClick</p>",
    ].join("\n"),
  };
}

/**
 * Recorre los avisos pendientes, detecta qué productos volvieron a tener stock
 * vendible y le manda un mail al cliente. Cada aviso notificado pasa a estado
 * "notificado" para no repetir el envío.
 */
export async function runStockAlerts(
  opts: { dryRun?: boolean } = {},
): Promise<StockAlertStats> {
  const dryRun = Boolean(opts.dryRun);

  const avisos = await prisma.aviso_stock.findMany({
    where: { estado: "pendiente" },
    orderBy: { creado_en: "asc" },
    include: {
      producto: {
        select: {
          id_producto: true,
          titulo: true,
          slug: true,
          activo: true,
          stocks: {
            select: { cantidad: true, almacen: { select: ALMACEN_WEB_SELECT } },
          },
        },
      },
    },
  });

  const stats: StockAlertStats = {
    pendientes: avisos.length,
    productosConStock: 0,
    notificados: 0,
    errores: 0,
    dryRun,
  };

  if (avisos.length === 0) return stats;

  const disponibles = new Map<number, boolean>();
  for (const aviso of avisos) {
    const p = aviso.producto;
    if (disponibles.has(p.id_producto)) continue;
    // stockTracked = false significa producto aún no sincronizado: no dispara aviso.
    const { stockTracked, inStock } = resolveStockAvailability(p.stocks);
    disponibles.set(p.id_producto, p.activo && stockTracked && inStock);
  }
  stats.productosConStock = [...disponibles.values()].filter(Boolean).length;

  const aNotificar = avisos.filter((a) => disponibles.get(a.id_producto));
  if (aNotificar.length === 0 || dryRun) return stats;

  if (!isMailConfigured()) {
    throw new Error("SMTP no configurado: no se pueden enviar avisos de stock");
  }

  for (const aviso of aNotificar) {
    const url = absoluteUrl(`/producto/${aviso.producto.slug}`);
    const mail = buildMail(aviso.producto.titulo, url);
    try {
      await sendMail({ to: aviso.email, ...mail });
    } catch (err) {
      console.error("[stock-alerts] sendMail failed", aviso.id_aviso_stock, err);
      stats.errores += 1;
      continue;
    }
    await prisma.aviso_stock.update({
      where: { id_aviso_stock: aviso.id_aviso_stock },
      data: { estado: "notificado", notificado_en: new Date() },
    });
    stats.notificados += 1;
  }

  return stats;
}
