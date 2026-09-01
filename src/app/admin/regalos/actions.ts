"use server";

import type { RegaloTipo } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";

async function guard() {
  return requireAdmin();
}

function revalidateRegalos(id?: number) {
  revalidatePath("/admin/regalos");
  revalidatePath("/checkout");
  if (id != null) revalidatePath(`/admin/regalos/${id}`);
}

function parseDate(raw: FormDataEntryValue | null) {
  const value = String(raw || "").trim();
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseMonto(raw: FormDataEntryValue | null) {
  const n = Number(String(raw || "").replace(",", ".").trim());
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function parsePrioridad(raw: FormDataEntryValue | null) {
  const n = Number(String(raw || "0").trim());
  if (!Number.isFinite(n)) return 0;
  return Math.floor(n);
}

function parseTipo(raw: FormDataEntryValue | null): RegaloTipo {
  const value = String(raw || "monto").trim();
  if (value === "sku" || value === "categoria") return value;
  return "monto";
}

async function validateRegaloTipoConfig(
  tipo: RegaloTipo,
  monto_minimo: number | null,
  id_regalo?: number,
) {
  if (tipo === "monto") {
    if (monto_minimo == null) throw new Error("Monto mínimo requerido para regalo por monto");
    return;
  }

  if (id_regalo == null) return;

  if (tipo === "sku") {
    const count = await prisma.regalo_trigger_producto.count({ where: { id_regalo } });
    if (count < 1) {
      throw new Error("Agregá al menos un SKU trigger para regalo por lista de SKU");
    }
    return;
  }

  const count = await prisma.regalo_trigger_categoria.count({ where: { id_regalo } });
  if (count < 1) {
    throw new Error("Seleccioná al menos una categoría trigger para regalo por categoría");
  }
}

export async function createRegalo(formData: FormData) {
  const session = await guard();
  const idUsuario = session.user.id;
  if (!idUsuario || idUsuario <= 0) {
    throw new Error("Usuario de sesión inválido");
  }

  const nombre = String(formData.get("nombre") || "").trim();
  if (!nombre) throw new Error("Nombre requerido");

  const tipo = parseTipo(formData.get("tipo"));
  const prioridad = parsePrioridad(formData.get("prioridad"));
  const monto_minimo = tipo === "monto" ? parseMonto(formData.get("monto_minimo")) : null;
  if (tipo === "monto" && monto_minimo == null) {
    throw new Error("Monto mínimo inválido");
  }

  const vigencia_desde = parseDate(formData.get("vigencia_desde"));
  if (!vigencia_desde) throw new Error("Vigencia desde requerida");
  const vigencia_hasta = parseDate(formData.get("vigencia_hasta"));

  const regalo = await prisma.regalo.create({
    data: {
      nombre,
      tipo,
      prioridad,
      monto_minimo,
      vigencia_desde,
      vigencia_hasta,
      activo: true,
      id_usuario_creacion: idUsuario,
    },
  });

  revalidateRegalos(regalo.id_regalo);
  redirect(`/admin/regalos/${regalo.id_regalo}`);
}

export async function updateRegalo(id_regalo: number, formData: FormData) {
  await guard();
  const existing = await prisma.regalo.findUnique({ where: { id_regalo } });
  if (!existing) throw new Error("Regalo no encontrado");

  const nombre = String(formData.get("nombre") || "").trim();
  if (!nombre) throw new Error("Nombre requerido");

  const tipo = parseTipo(formData.get("tipo"));
  const prioridad = parsePrioridad(formData.get("prioridad"));
  const monto_minimo = tipo === "monto" ? parseMonto(formData.get("monto_minimo")) : null;
  if (tipo === "monto" && monto_minimo == null) {
    throw new Error("Monto mínimo inválido");
  }

  const vigencia_desde = parseDate(formData.get("vigencia_desde"));
  if (!vigencia_desde) throw new Error("Vigencia desde requerida");
  const vigencia_hasta = parseDate(formData.get("vigencia_hasta"));
  const activo = formData.get("activo") === "on";

  await validateRegaloTipoConfig(tipo, monto_minimo, id_regalo);

  await prisma.regalo.update({
    where: { id_regalo },
    data: {
      nombre,
      tipo,
      prioridad,
      monto_minimo,
      vigencia_desde,
      vigencia_hasta,
      activo,
    },
  });

  revalidateRegalos(id_regalo);
}

export async function deleteRegalo(id_regalo: number) {
  await guard();
  const existing = await prisma.regalo.findUnique({ where: { id_regalo } });
  if (!existing) throw new Error("Regalo no encontrado");

  await prisma.regalo.delete({ where: { id_regalo } });
  revalidateRegalos();
  redirect("/admin/regalos");
}

export async function addRegaloProducto(id_regalo: number, formData: FormData) {
  await guard();
  const id_producto = Number(formData.get("id_producto"));
  if (!Number.isFinite(id_producto) || id_producto <= 0) {
    throw new Error("Producto inválido");
  }

  const regalo = await prisma.regalo.findUnique({ where: { id_regalo } });
  if (!regalo) throw new Error("Regalo no encontrado");

  await prisma.regalo_producto.upsert({
    where: {
      id_regalo_id_producto: { id_regalo, id_producto },
    },
    create: { id_regalo, id_producto },
    update: {},
  });

  revalidateRegalos(id_regalo);
}

export async function removeRegaloProducto(id_regalo: number, id_producto: number) {
  await guard();
  await prisma.regalo_producto.deleteMany({ where: { id_regalo, id_producto } });
  revalidateRegalos(id_regalo);
}

export async function addRegaloTriggerProducto(id_regalo: number, formData: FormData) {
  await guard();
  const id_producto = Number(formData.get("id_producto"));
  if (!Number.isFinite(id_producto) || id_producto <= 0) {
    throw new Error("Producto inválido");
  }

  const regalo = await prisma.regalo.findUnique({ where: { id_regalo } });
  if (!regalo) throw new Error("Regalo no encontrado");
  if (regalo.tipo !== "sku") throw new Error("Este regalo no es por lista de SKU");

  await prisma.regalo_trigger_producto.upsert({
    where: {
      id_regalo_id_producto: { id_regalo, id_producto },
    },
    create: { id_regalo, id_producto },
    update: {},
  });

  revalidateRegalos(id_regalo);
}

export async function removeRegaloTriggerProducto(id_regalo: number, id_producto: number) {
  await guard();
  await prisma.regalo_trigger_producto.deleteMany({ where: { id_regalo, id_producto } });
  revalidateRegalos(id_regalo);
}

export async function updateRegaloTriggerCategorias(id_regalo: number, formData: FormData) {
  await guard();
  const regalo = await prisma.regalo.findUnique({ where: { id_regalo } });
  if (!regalo) throw new Error("Regalo no encontrado");
  if (regalo.tipo !== "categoria") {
    throw new Error("Este regalo no es por categoría");
  }

  const categoriaIds = formData
    .getAll("categorias")
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0);

  if (!categoriaIds.length) {
    throw new Error("Seleccioná al menos una categoría trigger");
  }

  await prisma.$transaction([
    prisma.regalo_trigger_categoria.deleteMany({ where: { id_regalo } }),
    ...categoriaIds.map((id_categoria) =>
      prisma.regalo_trigger_categoria.create({
        data: { id_regalo, id_categoria },
      }),
    ),
  ]);

  revalidateRegalos(id_regalo);
}

export type RegaloProductoSearchRow = {
  id_producto: number;
  titulo: string;
  sku: string | null;
  activo: boolean;
};

export async function searchRegaloProductos(q: string): Promise<RegaloProductoSearchRow[]> {
  await guard();
  const query = String(q || "").trim();
  if (!query) return [];

  return prisma.producto.findMany({
    where: {
      OR: [{ titulo: { contains: query } }, { sku: { contains: query } }],
    },
    select: { id_producto: true, titulo: true, sku: true, activo: true },
    take: 20,
    orderBy: { titulo: "asc" },
  });
}
