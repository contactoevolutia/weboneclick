"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth-guard";
import { isBannerUbicacion } from "@/lib/banners";
import { prisma } from "@/lib/prisma";
import { deleteUploadedFile, saveUploadedFile } from "@/lib/uploads";

async function guard() {
  await requireAdmin();
}

function revalidateBanners() {
  revalidatePath("/admin/banners");
  revalidatePath("/");
  revalidateTag("banners", { expire: 0 });
}

function isUploadedPath(value: string | null | undefined) {
  return Boolean(value && !value.startsWith("http") && !value.startsWith("/"));
}

/** Resuelve la imagen: prioriza archivo subido, luego URL manual. */
async function resolveImage(formData: FormData, fileField: string, urlField: string) {
  const file = formData.get(fileField);
  if (file instanceof File && file.size > 0) {
    return saveUploadedFile(file, "banners");
  }
  return String(formData.get(urlField) || "").trim() || null;
}

function parseDate(raw: FormDataEntryValue | null) {
  const value = String(raw || "").trim();
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseUbicacion(formData: FormData) {
  const value = String(formData.get("ubicacion") || "").trim();
  if (!isBannerUbicacion(value)) {
    throw new Error("Ubicación inválida");
  }
  return value;
}

export async function createBanner(formData: FormData) {
  await guard();

  const titulo = String(formData.get("titulo") || "").trim();
  if (!titulo) throw new Error("Título requerido");

  const imagen_desktop = await resolveImage(formData, "imagen_desktop_file", "imagen_desktop_url");
  if (!imagen_desktop) throw new Error("Imagen desktop requerida (archivo o URL)");

  const imagen_mobile = await resolveImage(formData, "imagen_mobile_file", "imagen_mobile_url");

  const vigencia_desde = parseDate(formData.get("vigencia_desde"));
  if (!vigencia_desde) throw new Error("Vigencia desde requerida");

  const orden = Number(formData.get("orden") || 0);
  const ubicacion = parseUbicacion(formData);
  const html = String(formData.get("html") || "").trim() || null;
  const clase_css = String(formData.get("clase_css") || "").trim() || null;

  const banner = await prisma.banner.create({
    data: {
      titulo,
      imagen_desktop,
      imagen_mobile,
      link: String(formData.get("link") || "").trim() || null,
      ubicacion,
      orden: Number.isFinite(orden) ? orden : 0,
      vigencia_desde,
      vigencia_hasta: parseDate(formData.get("vigencia_hasta")),
      activo: true,
      html,
      clase_css,
    },
  });

  revalidateBanners();
  redirect(`/admin/banners/${banner.id_banner}`);
}

export async function updateBanner(id_banner: number, formData: FormData) {
  await guard();
  const existing = await prisma.banner.findUnique({ where: { id_banner } });
  if (!existing) throw new Error("Banner no encontrado");

  const titulo = String(formData.get("titulo") || "").trim();
  if (!titulo) throw new Error("Título requerido");

  const vigencia_desde = parseDate(formData.get("vigencia_desde"));
  if (!vigencia_desde) throw new Error("Vigencia desde requerida");

  let imagen_desktop = existing.imagen_desktop;
  const nuevaDesktop = await resolveImage(formData, "imagen_desktop_file", "imagen_desktop_url");
  if (nuevaDesktop && nuevaDesktop !== existing.imagen_desktop) {
    if (isUploadedPath(existing.imagen_desktop)) {
      await deleteUploadedFile(existing.imagen_desktop).catch(() => undefined);
    }
    imagen_desktop = nuevaDesktop;
  }

  let imagen_mobile = existing.imagen_mobile;
  const quitarMobile = formData.get("quitar_imagen_mobile") === "on";
  const nuevaMobile = await resolveImage(formData, "imagen_mobile_file", "imagen_mobile_url");
  if (nuevaMobile && nuevaMobile !== existing.imagen_mobile) {
    if (isUploadedPath(existing.imagen_mobile)) {
      await deleteUploadedFile(existing.imagen_mobile!).catch(() => undefined);
    }
    imagen_mobile = nuevaMobile;
  } else if (quitarMobile) {
    if (isUploadedPath(existing.imagen_mobile)) {
      await deleteUploadedFile(existing.imagen_mobile!).catch(() => undefined);
    }
    imagen_mobile = null;
  }

  const orden = Number(formData.get("orden") || 0);
  const ubicacion = parseUbicacion(formData);
  const html = String(formData.get("html") || "").trim() || null;
  const clase_css = String(formData.get("clase_css") || "").trim() || null;

  await prisma.banner.update({
    where: { id_banner },
    data: {
      titulo,
      imagen_desktop,
      imagen_mobile,
      link: String(formData.get("link") || "").trim() || null,
      ubicacion,
      orden: Number.isFinite(orden) ? orden : 0,
      vigencia_desde,
      vigencia_hasta: parseDate(formData.get("vigencia_hasta")),
      activo: formData.get("activo") === "on",
      html,
      clase_css,
    },
  });

  revalidateBanners();
  revalidatePath(`/admin/banners/${id_banner}`);
}

export async function deleteBanner(id_banner: number) {
  await guard();
  const existing = await prisma.banner.findUnique({ where: { id_banner } });
  if (!existing) throw new Error("Banner no encontrado");

  if (isUploadedPath(existing.imagen_desktop)) {
    await deleteUploadedFile(existing.imagen_desktop).catch(() => undefined);
  }
  if (isUploadedPath(existing.imagen_mobile)) {
    await deleteUploadedFile(existing.imagen_mobile!).catch(() => undefined);
  }

  await prisma.banner.delete({ where: { id_banner } });
  revalidateBanners();
  redirect("/admin/banners");
}
