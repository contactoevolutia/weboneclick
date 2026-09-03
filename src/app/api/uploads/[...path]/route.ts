import { NextRequest, NextResponse } from "next/server";
import { readFile, stat } from "fs/promises";
import path from "path";
import { getUploadsRoot, resolveUploadsPath } from "@/lib/uploads";

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  // SVG no se sirve como image/svg+xml (XSS). Se bloquea abajo.
  ".pdf": "application/pdf",
};

type Params = Promise<{ path: string[] }>;

export async function GET(_req: NextRequest, { params }: { params: Params }) {
  const { path: parts } = await params;
  if (parts.some((p) => p === ".." || p.includes("\0"))) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  const relative = parts.join("/");
  const root = path.resolve(getUploadsRoot());
  const absolute = path.resolve(
    /* turbopackIgnore: true */ resolveUploadsPath(relative),
  );

  const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
  if (absolute !== root && !absolute.startsWith(rootWithSep)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const ext = path.extname(absolute).toLowerCase();
  if (ext === ".svg") {
    return new NextResponse("Forbidden", { status: 403 });
  }

  try {
    await stat(/* turbopackIgnore: true */ absolute);
    const data = await readFile(/* turbopackIgnore: true */ absolute);
    return new NextResponse(data, {
      headers: {
        "Content-Type": MIME[ext] || "application/octet-stream",
        "Cache-Control": "public, max-age=86400",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
