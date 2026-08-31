import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function csvCell(value: string | number | boolean | null | undefined): string {
  if (value == null) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Exporta los emails suscriptos al newsletter. `scope=pendientes` los marca como exportados. */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const soloPendientes = req.nextUrl.searchParams.get("scope") !== "todos";

  const rows = await prisma.newsletter_suscripcion.findMany({
    where: soloPendientes ? { estado: "pendiente" } : undefined,
    orderBy: { creado_en: "desc" },
    select: { id_newsletter_suscripcion: true, email: true },
  });

  if (soloPendientes && rows.length > 0) {
    await prisma.newsletter_suscripcion.updateMany({
      where: { id_newsletter_suscripcion: { in: rows.map((r) => r.id_newsletter_suscripcion) } },
      data: { estado: "exportado", exportado_en: new Date() },
    });
  }

  const lines = ["Email", ...rows.map((r) => csvCell(r.email))];

  // BOM para que Excel abra UTF-8 correctamente
  const body = `\uFEFF${lines.join("\r\n")}`;
  const filename = `newsletter_${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
