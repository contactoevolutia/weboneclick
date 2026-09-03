import { cookies } from "next/headers";
import { shopCookieOptions } from "@/lib/cookie-options";
import { prisma } from "@/lib/prisma";

export const CUPON_COOKIE = "cupon";
export const CUPON_MAX_AGE = 60 * 60 * 24 * 14; // 14 días

export const CUPON_ESTADO_EMITIDO = "emitido";
export const CUPON_ESTADO_CONSUMIDO = "consumido";

/** Cupón emitido y sin venta asociada: se puede editar o eliminar desde admin. */
export function isCuponEditable(cupon: {
  estado: string;
  id_venta: number | null;
}): boolean {
  return cupon.estado === CUPON_ESTADO_EMITIDO && cupon.id_venta === null;
}

const CODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const RANDOM_LEN = 10;

export type ValidCupon = {
  id_cupon: number;
  codigo: string;
  monto: number;
  fecha_vigencia: Date;
  grupo: string | null;
};

/** Normaliza el código a mayúsculas (case-insensitive). */
export function normalizeCuponCodigo(raw: string): string {
  return String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

/** Fin del día local de la fecha de vigencia (inclusivo). */
export function vigenciaEndOfDay(fecha: Date): Date {
  const d = new Date(fecha);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function isCuponVigente(fechaVigencia: Date, now = new Date()): boolean {
  return now.getTime() <= vigenciaEndOfDay(fechaVigencia).getTime();
}

export function generateRandomSuffix(length = RANDOM_LEN): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length]!;
  }
  return out;
}

export function buildCuponCodigo(prefix: string, suffix?: string): string {
  const p = normalizeCuponCodigo(prefix);
  const s = suffix ?? generateRandomSuffix();
  return `${p}${s}`;
}

/**
 * Genera `cantidad` códigos únicos con el prefijo dado.
 * Reintenta ante colisiones con códigos ya existentes o duplicados en el batch.
 */
export async function generateUniqueCodigos(
  prefix: string,
  cantidad: number,
  existingLookup?: Set<string>,
): Promise<string[]> {
  const existing =
    existingLookup ??
    new Set(
      (
        await prisma.cupones_descuento.findMany({
          where: { codigo: { startsWith: normalizeCuponCodigo(prefix) } },
          select: { codigo: true },
        })
      ).map((r) => r.codigo),
    );

  const codes: string[] = [];
  let attempts = 0;
  const maxAttempts = cantidad * 50 + 100;

  while (codes.length < cantidad && attempts < maxAttempts) {
    attempts++;
    const code = buildCuponCodigo(prefix);
    if (existing.has(code)) continue;
    existing.add(code);
    codes.push(code);
  }

  if (codes.length < cantidad) {
    throw new Error(
      `No se pudieron generar ${cantidad} códigos únicos (solo ${codes.length}). Probá otro prefijo.`,
    );
  }
  return codes;
}

export async function readCuponCookie(): Promise<string | null> {
  const jar = await cookies();
  const raw = jar.get(CUPON_COOKIE)?.value;
  if (!raw) return null;
  const codigo = normalizeCuponCodigo(raw);
  return codigo || null;
}

export async function writeCuponCookie(codigo: string): Promise<void> {
  const jar = await cookies();
  jar.set(
    CUPON_COOKIE,
    normalizeCuponCodigo(codigo),
    shopCookieOptions(CUPON_MAX_AGE),
  );
}

export async function clearCuponCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(CUPON_COOKIE);
}

/**
 * Valida un cupón emitido y vigente. No lo consume.
 */
export async function validateCupon(
  codigoRaw: string,
): Promise<{ ok: true; cupon: ValidCupon } | { ok: false; message: string }> {
  const codigo = normalizeCuponCodigo(codigoRaw);
  if (!codigo) {
    return { ok: false, message: "Ingresá un código de cupón." };
  }

  const row = await prisma.cupones_descuento.findUnique({ where: { codigo } });
  if (!row) {
    return { ok: false, message: "El cupón no es válido o ya no está vigente." };
  }
  if (row.estado !== CUPON_ESTADO_EMITIDO) {
    return { ok: false, message: "El cupón ya fue utilizado." };
  }
  if (!isCuponVigente(row.fecha_vigencia)) {
    return { ok: false, message: "El cupón no es válido o ya no está vigente." };
  }
  const monto = Number(row.monto);
  if (!(monto > 0)) {
    return { ok: false, message: "El cupón no es válido o ya no está vigente." };
  }

  return {
    ok: true,
    cupon: {
      id_cupon: row.id_cupon,
      codigo: row.codigo,
      monto,
      fecha_vigencia: row.fecha_vigencia,
      grupo: row.grupo,
    },
  };
}

/** Lee y valida el cupón de la cookie (si hay). */
export async function resolveAppliedCupon(): Promise<ValidCupon | null> {
  const codigo = await readCuponCookie();
  if (!codigo) return null;
  const result = await validateCupon(codigo);
  if (!result.ok) {
    await clearCuponCookie();
    return null;
  }
  return result.cupon;
}

/**
 * Libera un cupón consumido (p. ej. pago rechazado) para que pueda usarse de nuevo.
 */
export async function releaseCuponForVenta(id_venta: number): Promise<void> {
  const venta = await prisma.venta.findUnique({
    where: { id_venta },
    select: { id_cupon: true },
  });
  if (!venta?.id_cupon) {
    await prisma.cupones_descuento.updateMany({
      where: { id_venta, estado: CUPON_ESTADO_CONSUMIDO },
      data: {
        estado: CUPON_ESTADO_EMITIDO,
        fecha_consumido: null,
        id_venta: null,
      },
    });
    return;
  }

  await prisma.$transaction([
    prisma.venta.update({
      where: { id_venta },
      data: { id_cupon: null },
    }),
    prisma.cupones_descuento.update({
      where: { id_cupon: venta.id_cupon },
      data: {
        estado: CUPON_ESTADO_EMITIDO,
        fecha_consumido: null,
        id_venta: null,
      },
    }),
  ]);
}
