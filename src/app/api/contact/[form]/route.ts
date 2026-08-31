import { NextRequest, NextResponse } from "next/server";
import {
  buildContactPayload,
  isContactFormId,
} from "@/lib/contact-forms";
import { isMailConfigured, sendMail } from "@/lib/mail";
import { prisma } from "@/lib/prisma";
import { rateLimit, rateLimitClientKey } from "@/lib/rate-limit";

export const runtime = "nodejs";

async function parseBody(
  req: NextRequest,
): Promise<{ fields: Record<string, string>; files: File[] }> {
  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data") || contentType.includes("application/x-www-form-urlencoded")) {
    const fd = await req.formData();
    const fields: Record<string, string> = {};
    const files: File[] = [];

    for (const [key, value] of fd.entries()) {
      if (typeof value === "string") {
        if (key === "dispositivo") {
          fields[key] = fields[key] ? `${fields[key]}, ${value}` : value;
        } else {
          fields[key] = value;
        }
      } else if (value instanceof File && value.size > 0) {
        files.push(value);
      }
    }
    return { fields, files };
  }

  const json = (await req.json()) as Record<string, unknown>;
  const fields: Record<string, string> = {};
  for (const [key, value] of Object.entries(json)) {
    if (Array.isArray(value)) {
      fields[key] = value.map(String).join(", ");
    } else if (value != null) {
      fields[key] = String(value);
    }
  }
  return { fields, files: [] };
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ form: string }> },
) {
  const { form: formParam } = await ctx.params;
  if (!isContactFormId(formParam)) {
    return NextResponse.json({ error: "Formulario no válido" }, { status: 404 });
  }

  const limited = rateLimit(rateLimitClientKey(req, `contact-${formParam}`), {
    limit: 5,
    windowMs: 60_000,
  });
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Demasiados intentos. Probá de nuevo en unos minutos." },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSec) } },
    );
  }

  const isNewsletter = formParam === "newsletter";

  if (!isNewsletter && !isMailConfigured()) {
    return NextResponse.json(
      { error: "El envío de correo no está configurado en el servidor." },
      { status: 503 },
    );
  }

  let fields: Record<string, string>;
  let files: File[];
  try {
    ({ fields, files } = await parseBody(req));
  } catch {
    return NextResponse.json({ error: "No se pudo leer el formulario" }, { status: 400 });
  }

  // El newsletter no envía mail: se guarda la suscripción en la base.
  if (isNewsletter) {
    const email = (fields.email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Email inválido" }, { status: 400 });
    }
    try {
      await prisma.newsletter_suscripcion.upsert({
        where: { email },
        create: { email },
        update: {},
      });
    } catch (err) {
      console.error("[contact] newsletter upsert failed", err);
      return NextResponse.json(
        { error: "No pudimos registrar tu suscripción. Intentá de nuevo más tarde." },
        { status: 502 },
      );
    }
    return NextResponse.json({ ok: true });
  }

  const built = await buildContactPayload(formParam, fields, files);
  if (!built.ok) {
    return NextResponse.json({ error: built.error }, { status: 400 });
  }

  try {
    await sendMail(built.payload);
  } catch (err) {
    console.error("[contact] sendMail failed", formParam, err);
    return NextResponse.json(
      { error: "No pudimos enviar el mensaje. Intentá de nuevo más tarde." },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true });
}
