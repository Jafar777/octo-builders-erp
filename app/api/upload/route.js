import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/currentUser";
import { saveUpload } from "@/lib/storage";

// Browser uploads (replaces the ImageKit direct upload). The file is the raw request
// body; its name and folder come in the X-File-Name / X-Upload-Folder headers. Any
// active staff member may upload (chat attachments, HR documents, task files); what the
// file is then attached to is checked by that feature's own route.
export async function POST(request) {
  const user = await requireStaff({ limited: true });
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let fileName = "";
  try {
    fileName = decodeURIComponent(request.headers.get("x-file-name") || "");
  } catch {}
  try {
    const saved = await saveUpload(request.body, {
      folder: request.headers.get("x-upload-folder") || "",
      fileName,
    });
    return NextResponse.json(saved, { status: 201 });
  } catch (err) {
    const code = err?.message === "file_too_large" ? 413 : err?.message === "empty_upload" ? 400 : 500;
    if (code === 500) throw err;
    return NextResponse.json({ error: err.message }, { status: code });
  }
}
