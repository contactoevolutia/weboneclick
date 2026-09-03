"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth-guard";
import {
  CUPON_ESTADO_EMITIDO,
  generateUniqueCodigos,
  isCuponEditable,
  normalizeCuponCodigo,
} from "@/lib/cupones";
import { prisma } from "@/lib/prisma";

async function guard() {
  return requireAdmin();
}

function revalidateDescuentos(id?: number) {
  revalidatePath("/admin/descuentos");
  if (id != null) revalidatePath(`/admin/descuentos/${id}`);
}

function parseCuponFormFields(formData: FormData) {
  const monto = Number(formData.get("monto"));
  const vigenciaRaw = String(formData.get("fecha_vigencia") || "").trim();
  const grupoRaw = String(formData.get("grupo") || "").trim();
  const grupo = grupoRaw ? grupoRaw.slice(0, 100) : null;

  if (!(monto > 0) || !Number.isFinite(monto)) {
    throw new Error("El monto debe ser mayor a 0");
  }
  if (!vigenciaRaw) {
    throw new Error("Indicá la fecha de vigencia");
  }

  const fecha_vigencia = new Date(
    vigenciaRaw.includes("T") ? vigenciaRaw : `${vigenciaRaw}T23:59:59`,
  );
  if (Number.isNaN(fecha_vigencia.getTime())) {
    throw new Error("Fecha de vigencia inválida");
  }

  return { monto, fecha_vigencia, grupo };
}

export async function generarCupones(formData: FormData) {
  const session = await guard();
  const idUsuario = session.user.id;
  if (!idUsuario || idUsuario <= 0) {
    throw new Error("Usuario de sesión inválido");
  }

  const cantidad = Math.floor(Number(formData.get("cantidad")));
  const prefijo = String(formData.get("prefijo") || "").trim();
  const monto = Number(formData.get("monto"));
  const vigenciaRaw = String(formData.get("fecha_vigencia") || "").trim();
  const grupoRaw = String(formData.get("grupo") || "").trim();
  const grupo = grupoRaw ? grupoRaw.slice(0, 100) : null;

  if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 5000) {
    throw new Error("La cantidad debe ser un entero entre 1 y 5000");
  }
  if (!prefijo) {
    throw new Error("Ingresá el comienzo del código (prefijo)");
  }
  if (!/^[A-Za-z0-9_-]+$/.test(prefijo)) {
    throw new Error("El prefijo solo puede tener letras, números, guión y guión bajo");
  }
  if (!(monto > 0) || !Number.isFinite(monto)) {
    throw new Error("El monto debe ser mayor a 0");
  }
  if (!vigenciaRaw) {
    throw new Error("Indicá la fecha de vigencia");
  }

  const fecha_vigencia = new Date(
    vigenciaRaw.includes("T") ? vigenciaRaw : `${vigenciaRaw}T23:59:59`,
  );
  if (Number.isNaN(fecha_vigencia.getTime())) {
    throw new Error("Fecha de vigencia inválida");
  }

  const codigos = await generateUniqueCodigos(prefijo, cantidad);
  const prefixNorm = normalizeCuponCodigo(prefijo);

  const chunkSize = 500;
  for (let i = 0; i < codigos.length; i += chunkSize) {
    const chunk = codigos.slice(i, i + chunkSize);
    await prisma.cupones_descuento.createMany({
      data: chunk.map((codigo) => ({
        codigo,
        monto,
        fecha_vigencia,
        estado: CUPON_ESTADO_EMITIDO,
        grupo,
        id_usuario_creacion: idUsuario,
      })),
    });
  }

  revalidateDescuentos();
  const grupoQs = grupo ? `&grupo=${encodeURIComponent(grupo)}` : "";
  redirect(
    `/admin/descuentos?ok=1&count=${codigos.length}&prefijo=${encodeURIComponent(prefixNorm)}${grupoQs}`,
  );
}

export async function actualizarCupon(id_cupon: number, formData: FormData) {
  await guard();
  if (!Number.isFinite(id_cupon) || id_cupon <= 0) {
    throw new Error("Cupón inválido");
  }

  const existing = await prisma.cupones_descuento.findUnique({
    where: { id_cupon },
  });
  if (!existing) throw new Error("Cupón no encontrado");
  if (!isCuponEditable(existing)) {
    throw new Error("Solo se pueden modificar cupones emitidos sin venta asociada");
  }

  const { monto, fecha_vigencia, grupo } = parseCuponFormFields(formData);

  const result = await prisma.cupones_descuento.updateMany({
    where: {
      id_cupon,
      estado: CUPON_ESTADO_EMITIDO,
      id_venta: null,
    },
    data: { monto, fecha_vigencia, grupo },
  });
  if (result.count === 0) {
    throw new Error("Solo se pueden modificar cupones emitidos sin venta asociada");
  }

  revalidateDescuentos(id_cupon);
  redirect("/admin/descuentos?ok=edit");
}

export async function eliminarCupon(id_cupon: number) {
  await guard();
  if (!Number.isFinite(id_cupon) || id_cupon <= 0) {
    throw new Error("Cupón inválido");
  }

  const existing = await prisma.cupones_descuento.findUnique({
    where: { id_cupon },
  });
  if (!existing) throw new Error("Cupón no encontrado");
  if (!isCuponEditable(existing)) {
    throw new Error("Solo se pueden eliminar cupones emitidos sin venta asociada");
  }

  const result = await prisma.cupones_descuento.deleteMany({
    where: {
      id_cupon,
      estado: CUPON_ESTADO_EMITIDO,
      id_venta: null,
    },
  });
  if (result.count === 0) {
    throw new Error("Solo se pueden eliminar cupones emitidos sin venta asociada");
  }

  revalidateDescuentos();
  redirect("/admin/descuentos?ok=delete");
}
