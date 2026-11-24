import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { INLINE_TYPES, resolveUpload } from "@/lib/storage";
import { canOpenUpload } from "@/lib/uploadAccess";

// Serves uploaded files. Website pictures and profile photos are public; HR documents,
// chat attachments and project files need a signed-in person allowed to see them
// (lib/uploadAccess.js). In production Nginx may answer the public ones itself, but the
// private folders must come here (see lib/uploadAccess.js for the Nginx rule).
export async function GET(_request, { params }) {
  const { path: parts } = await params;
  const rel = (parts || []).join("/");
  const abs = resolveUpload(rel);
  if (!abs) return new Response("Not found", { status: 404 });
  const access = await canOpenUpload(rel);
  // Not found rather than forbidden: a private file's existence isn't confirmed.
  if (!access.allowed) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  let stat;
  try {
    stat = await fsp.stat(abs);
  } catch {
    return new Response("Not found", { status: 404 });
  }
  if (!stat.isFile() || abs.endsWith(".part")) return new Response("Not found", { status: 404 });

  const ext = path.extname(abs).toLowerCase();
  const type = INLINE_TYPES[ext] || "application/octet-stream";
  const headers = {
    "Content-Type": type,
    "Content-Length": String(stat.size),
    // Private files are never kept by shared caches (or the browser after sign-out).
    "Cache-Control": access.private ? "private, no-store" : "public, max-age=2592000, immutable",
    "X-Content-Type-Options": "nosniff",
  };
  if (!INLINE_TYPES[ext]) headers["Content-Disposition"] = "attachment";
  if (ext === ".svg") headers["Content-Security-Policy"] = "sandbox; default-src 'none'; style-src 'unsafe-inline'";
  return new Response(Readable.toWeb(fs.createReadStream(abs)), { headers });
}
