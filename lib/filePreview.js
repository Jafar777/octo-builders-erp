// Small pictures of what a file holds (change request CR-3): images and PDFs (their first
// page) uploaded to this server. Made once, kept in a cache folder outside the uploads
// (so they're never served without the access check), and sent as WebP.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const IMAGE = /\.(png|jpe?g|gif|webp|avif|bmp|tiff?)$/i;
const PDF = /\.pdf$/i;
export const PREVIEW_WIDTH = 480;
const CACHE = path.resolve(process.env.THUMB_DIR || path.join(os.tmpdir(), "octa-thumbs"));

export function previewKind(name) {
  const n = String(name || "");
  if (IMAGE.test(n)) return "image";
  if (PDF.test(n)) return "pdf";
  return "";
}

// A preview of the file at `abs` (an uploaded file). Returns a Buffer (WebP) or null.
export async function makePreview(abs, kind) {
  const stat = await fs.stat(abs).catch(() => null);
  if (!stat?.isFile()) return null;
  const key = crypto.createHash("sha1").update(`${abs}|${stat.size}|${stat.mtimeMs}|${PREVIEW_WIDTH}`).digest("hex");
  const cached = path.join(CACHE, `${key}.webp`);
  const hit = await fs.readFile(cached).catch(() => null);
  if (hit) return hit;

  const { default: sharp } = await import("sharp");
  let input = abs;
  let tmp = null;
  if (kind === "pdf") {
    // The first page, drawn by poppler's pdftoppm (none installed: no preview).
    tmp = path.join(os.tmpdir(), `octa-pdf-${crypto.randomBytes(6).toString("hex")}`);
    try {
      await run("pdftoppm", ["-f", "1", "-l", "1", "-singlefile", "-png", "-scale-to", String(PREVIEW_WIDTH * 2), abs, tmp], { timeout: 20000 });
    } catch {
      return null;
    }
    input = `${tmp}.png`;
  }
  try {
    const out = await sharp(input, { limitInputPixels: 268402689, animated: false })
      .rotate()
      .resize({ width: PREVIEW_WIDTH, height: PREVIEW_WIDTH, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .webp({ quality: 72 })
      .toBuffer();
    await fs.mkdir(CACHE, { recursive: true });
    await fs.writeFile(cached, out).catch(() => {});
    return out;
  } catch {
    return null;
  } finally {
    if (tmp) await fs.rm(`${tmp}.png`, { force: true });
  }
}
