import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireVentasApi } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import {
  endOfDayAr,
  formatDateTime,
  formatPrice,
  startOfDayAr,
  toDateInputValueAr,
} from "@/lib/utils";

export const runtime = "nodejs";

const CSV_SEP = ";";

function defaultDateRange() {
  const now = new Date();
  const desde = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  return {
    desde: toDateInputValueAr(desde),
    hasta: toDateInputValueAr(now),
  };
}

function labelEntrega(tipo: string) {
  return tipo === "retiro" ? "Retiro" : tipo === "envio" ? "Envío" : tipo;
}

function pagoRelevante<T extends { estado: string }>(pagos: T[]): T | undefined {
  return pagos.find((p) => p.estado === "aprobado") ?? pagos[0];
}

function csvEscape(value: string): string {
  if (/[;"\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function csvRow(cells: Array<string | number | null | undefined>): string {
  return cells.map((c) => csvEscape(c == null ? "" : String(c))).join(CSV_SEP);
}

/** GET /api/admin/ventas/export?desde=&hasta=&tipo_entrega=&estado=&id_tienda= */
export async function GET(req: NextRequest) {
  const session = await requireVentasApi();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const defaults = defaultDateRange();
  const desde = sp.get("desde")?.trim() || defaults.desde;
  const hasta = sp.get("hasta")?.trim() || defaults.hasta;
  const tipo_entrega = sp.get("tipo_entrega")?.trim() || "";
  const estado = sp.get("estado")?.trim() || "";
  const id_tienda = Number(sp.get("id_tienda") || 0) || 0;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) {
    return NextResponse.json({ error: "Fechas inválidas" }, { status: 400 });
  }

  const where: Prisma.ventaWhereInput = {
    fecha_hora: {
      gte: startOfDayAr(desde),
      lte: endOfDayAr(hasta),
    },
  };
  if (tipo_entrega === "envio" || tipo_entrega === "retiro") {
    where.tipo_entrega = tipo_entrega;
  }
  if (estado) {
    where.estado = estado;
  }
  if (id_tienda > 0) {
    where.id_tienda_retiro = id_tienda;
  }

  const ventas = await prisma.venta.findMany({
    where,
    include: {
      cliente: true,
      pagos: { orderBy: { id_pago: "desc" } },
      tienda_retiro: true,
    },
    orderBy: { fecha_hora: "desc" },
  });

  const header = csvRow([
    "ID",
    "Fecha",
    "Cliente",
    "Email",
    "Entrega",
    "Tienda",
    "Estado",
    "Tipo pago",
    "Estado pago",
    "Total",
    "Contactado",
    "Comentario",
  ]);

  const lines = ventas.map((v) => {
    const pago = pagoRelevante(v.pagos);
    return csvRow([
      v.id_venta,
      formatDateTime(v.fecha_hora),
      `${v.cliente.nombre} ${v.cliente.apellido}`.trim(),
      v.cliente.mail,
      labelEntrega(v.tipo_entrega),
      v.tienda_retiro?.nombre ?? "",
      v.estado,
      pago?.tipo_pago ?? "",
      pago?.estado ?? "",
      formatPrice(v.total),
      v.contactado ? "Sí" : "No",
      v.comentario?.trim() ?? "",
    ]);
  });

  const body = `\uFEFF${[header, ...lines].join("\r\n")}\r\n`;
  const filename = `ventas_${desde}_${hasta}.csv`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
