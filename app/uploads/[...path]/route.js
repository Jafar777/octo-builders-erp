import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { INLINE_TYPES, resolveUpload } from "@/lib/storage";

// Serves uploaded files. In production Nginx answers /uploads/ itself; this route is
// the fallback and is what next/image reads when it resizes an uploaded photo.
export async function GET(_request, { params }) {
  const { path: parts } = await params;
  const abs = resolveUpload((parts || []).join("/"));
  if (!abs) return new Response("Not found", { status: 404 });
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
    "Cache-Control": "public, max-age=2592000, immutable",
    "X-Content-Type-Options": "nosniff",
  };
  if (!INLINE_TYPES[ext]) headers["Content-Disposition"] = "attachment";
  if (ext === ".svg") headers["Content-Security-Policy"] = "sandbox; default-src 'none'; style-src 'unsafe-inline'";
  return new Response(Readable.toWeb(fs.createReadStream(abs)), { headers });
}
