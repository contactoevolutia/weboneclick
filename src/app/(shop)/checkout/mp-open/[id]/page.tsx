import { timingSafeEqual } from "crypto";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ t?: string; pref?: string }>;

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return {
    title: "Continuar pago",
    robots: { index: false, follow: false },
  };
}

function tokensMatch(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

/**
 * Landing del QR “Continuar en el celular”.
 *
 * El QR no debe apuntar al `init_point` de MP: al escanearlo con la app de
 * Mercado Pago se genera un cobro in-store (“Producto de Oneclick”) sin
 * `payment_methods.installments`, y aparecen 12 cuotas en contado.
 * Esta URL propia abre en el navegador y redirige a Checkout Pro con la
 * preference que sí tiene el tope.
 */
export default async function MpOpenPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const { t, pref } = await searchParams;
  const id_venta = Number(id);
  const token = t?.trim() ?? "";
  const preferenceId = pref?.trim() ?? "";
  if (!id_venta || !token || !preferenceId) notFound();

  const venta = await prisma.venta.findUnique({
    where: { id_venta },
    select: {
      access_token: true,
      estado: true,
      pagos: {
        where: { tipo_pago: { in: ["mercado_pago", "tarjeta"] } },
        select: { referencia: true },
        orderBy: { id_pago: "desc" },
        take: 5,
      },
    },
  });
  if (!venta || !tokensMatch(token, venta.access_token)) notFound();

  const prefOk = venta.pagos.some((p) => p.referencia === preferenceId);
  if (!prefOk) notFound();

  if (venta.estado === "pagada") {
    redirect(
      `/checkout/confirmacion/${id_venta}?t=${encodeURIComponent(token)}&mp=success`,
    );
  }

  redirect(
    `https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=${encodeURIComponent(preferenceId)}`,
  );
}
