import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/currentUser";
import { fail, forbidden } from "@/lib/apiUtils";
import { applySync, buildSync, canImportLegacy, describeSync, importHistory, ImportError, MAX_ACCESS_BYTES, readAccess } from "@/lib/legacySync";

// The old Excel program's Access file (System page → Add project data). The CEO only.
export async function GET() {
  const user = await requireStaff();
  if (!canImportLegacy(user)) return forbidden();
  return NextResponse.json({ history: await importHistory() });
}

// The file is the raw body. Headers: X-File-Name, X-People ({ name: accountId }, both
// URI-encoded), and to confirm a preview its X-Digest. Without it: only the preview.
export async function POST(request) {
  const user = await requireStaff();
  if (!canImportLegacy(user)) return forbidden();
  const header = (k) => {
    try {
      return decodeURIComponent(request.headers.get(k) || "");
    } catch {
      return "";
    }
  };
  const size = Number(request.headers.get("content-length")) || 0;
  if (size > MAX_ACCESS_BYTES) return fail("file_too_large", 413);
  const buffer = Buffer.from(await request.arrayBuffer());
  if (!buffer.length) return fail("empty_upload");
  if (buffer.length > MAX_ACCESS_BYTES) return fail("file_too_large", 413);
  // Cut short on the way (a proxy's size limit): never read half a file.
  if (size && size !== buffer.length) return fail("access_incomplete");
  let people = {};
  try {
    people = JSON.parse(header("x-people") || "{}") || {};
  } catch {}
  try {
    const data = readAccess(buffer);
    const digest = header("x-digest");
    if (!digest) return NextResponse.json({ preview: await describeSync(await buildSync(data, user, people)) });
    const file = { name: header("x-file-name").slice(0, 200), hash: crypto.createHash("sha256").update(buffer).digest("hex") };
    return NextResponse.json({ ok: true, summary: await applySync(data, user, people, digest, file) });
  } catch (err) {
    if (err instanceof ImportError) return fail(err.code, 409);
    throw err;
  }
}
