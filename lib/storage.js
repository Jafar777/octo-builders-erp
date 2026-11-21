// Uploaded files (photos, videos, HR documents, chat attachments, project files) are kept
// on this server's disk under UPLOAD_DIR and served at /uploads/<folder>/<file>.
// Nginx serves that path straight from disk; app/uploads/[...path]/route.js is the
// fallback (and what next/image reads when it resizes an uploaded photo).
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

export const UPLOAD_ROOT = path.resolve(process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads"));
export const PUBLIC_PREFIX = "/uploads";
export const MAX_UPLOAD_BYTES = Number(process.env.UPLOAD_MAX_BYTES) || 200 * 1024 * 1024;

// "/octabuilders/projects/abc" -> "octabuilders/projects/abc". Only plain folder names,
// always inside "octabuilders" (the folder every upload used on ImageKit).
export function cleanFolder(folder) {
  const parts = String(folder || "")
    .split("/")
    .filter(Boolean)
    .filter((p) => /^[A-Za-z0-9_-]{1,64}$/.test(p));
  if (parts[0] !== "octabuilders") parts.unshift("octabuilders");
  return parts.slice(0, 6).join("/");
}

// A safe file name with a random part, so names never clash and can't be guessed.
function storedName(original) {
  const ext = (path.extname(String(original || "")).toLowerCase().match(/^\.[a-z0-9]{1,8}$/) || [""])[0];
  const base =
    path
      .basename(String(original || ""), path.extname(String(original || "")))
      .normalize("NFKD")
      .replace(/[^A-Za-z0-9_-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 60) || "file";
  return `${base}_${crypto.randomBytes(9).toString("base64url")}${ext}`;
}

// Saves a web ReadableStream (a request body) to disk. Returns the same fields the
// app used from ImageKit's upload response: url, fileId, name, filePath, size.
export async function saveUpload(body, { folder, fileName, maxBytes = MAX_UPLOAD_BYTES } = {}) {
  if (!body) throw new Error("empty_upload");
  const dir = cleanFolder(folder);
  const name = storedName(fileName);
  const absDir = path.join(UPLOAD_ROOT, dir);
  await fsp.mkdir(absDir, { recursive: true });
  const finalPath = path.join(absDir, name);
  const tmpPath = `${finalPath}.part`;

  let size = 0;
  const limit = new Transform({
    transform(chunk, _enc, cb) {
      size += chunk.length;
      if (size > maxBytes) cb(new Error("file_too_large"));
      else cb(null, chunk);
    },
  });
  try {
    await pipeline(Readable.fromWeb(body), limit, fs.createWriteStream(tmpPath, { flags: "wx" }));
    if (size === 0) throw new Error("empty_upload");
    await fsp.rename(tmpPath, finalPath);
  } catch (err) {
    await fsp.rm(tmpPath, { force: true });
    throw err;
  }
  const rel = `${dir}/${name}`;
  return { url: `${PUBLIC_PREFIX}/${rel}`, fileId: rel, name, filePath: `/${rel}`, size };
}

// "/uploads/octabuilders/x.jpg" or "octabuilders/x.jpg" -> absolute path, or null if
// it would leave the upload folder.
export function resolveUpload(rel) {
  const clean = String(rel || "").replace(/^\/?uploads\//, "");
  const abs = path.resolve(UPLOAD_ROOT, clean);
  if (!abs.startsWith(UPLOAD_ROOT + path.sep)) return null;
  return abs;
}

// Deletes files in a folder (and below) last changed before `cutoffMs`. Returns the count.
export async function deleteFilesOlderThan(folder, cutoffMs) {
  const root = resolveUpload(cleanFolder(folder));
  if (!root) return 0;
  let count = 0;
  let entries;
  try {
    entries = await fsp.readdir(root, { withFileTypes: true, recursive: true });
  } catch (err) {
    if (err.code === "ENOENT") return 0;
    throw err;
  }
  for (const e of entries) {
    if (!e.isFile()) continue;
    const file = path.join(e.parentPath ?? e.path, e.name);
    const { mtimeMs } = await fsp.stat(file);
    if (mtimeMs < cutoffMs) {
      await fsp.rm(file, { force: true });
      count += 1;
    }
  }
  return count;
}

// Types shown in the browser. Everything else downloads, so an uploaded HTML page
// can never run as part of this site. SVG is shown but sandboxed (see headers).
export const INLINE_TYPES = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".pdf": "application/pdf",
  ".txt": "text/plain; charset=utf-8",
};
