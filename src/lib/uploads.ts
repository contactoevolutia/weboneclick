import { mkdir, writeFile, unlink } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

/** Resuelve un path bajo uploads. El join con literal `"uploads"` acota el NFT. */
export function resolveUploadsPath(...segments: string[]) {
  const configured = process.env.UPLOADS_DIR?.trim() || "uploads";
  if (path.isAbsolute(configured)) {
    return path.join(/* turbopackIgnore: true */ configured, ...segments);
  }
  if (configured !== "uploads") {
    return path.join(
      /* turbopackIgnore: true */ process.cwd(),
      configured,
      ...segments,
    );
  }
  return path.join(process.cwd(), "uploads", ...segments);
}

export function getUploadsRoot() {
  return resolveUploadsPath();
}

function assertUnderUploadsRoot(absolute: string) {
  const root = path.resolve(getUploadsRoot());
  const resolved = path.resolve(/* turbopackIgnore: true */ absolute);
  const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
  if (resolved !== root && !resolved.startsWith(rootWithSep)) {
    throw new Error("Ruta de upload fuera del directorio permitido");
  }
  return resolved;
}

export async function saveUploadedFile(file: File, folder = "productos") {
  const bytes = Buffer.from(await file.arrayBuffer());
  const ext = path.extname(file.name || "").toLowerCase() || ".jpg";
  // SVG excluido: puede contener script (XSS al servir).
  const allowed = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".pdf"];
  const safeExt = allowed.includes(ext) ? ext : folder === "fiscal" ? ".pdf" : ".jpg";
  const relative = path.posix.join(folder, `${randomUUID()}${safeExt}`);
  const absolute = assertUnderUploadsRoot(resolveUploadsPath(relative));
  await mkdir(/* turbopackIgnore: true */ path.dirname(absolute), {
    recursive: true,
  });
  await writeFile(/* turbopackIgnore: true */ absolute, bytes);
  return relative.replace(/\\/g, "/");
}

export async function deleteUploadedFile(relativeLink: string) {
  if (!relativeLink || relativeLink.startsWith("http")) return;
  // Rechazar path traversal explícito.
  if (
    relativeLink.includes("..") ||
    path.isAbsolute(relativeLink) ||
    relativeLink.includes("\0")
  ) {
    return;
  }
  try {
    const absolute = assertUnderUploadsRoot(resolveUploadsPath(relativeLink));
    await unlink(/* turbopackIgnore: true */ absolute);
  } catch {
    // ignore missing / invalid
  }
}
