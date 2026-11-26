import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, notFound, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { projectAccess } from "@/lib/projects";
import { peopleNames } from "@/lib/sales";
import ProjectFile from "@/models/ProjectFile";
import WorkProject from "@/models/WorkProject";
import { browseGrants, fileServerReady, gatewaySecret, getFileServer, refsAllowed } from "@/lib/fileServer";
import { cleanRef, projectFolder } from "@/lib/fileServerPaths";
import { cleanFileAccess, decidesFileAccess, fileRights, serializeFileAccess } from "@/lib/projectFileAccess";
import { previewKind } from "@/lib/filePreview";
import Department from "@/models/Department";
import User from "@/models/User";

const idStr = (v) => (v ? v.toString() : null);

async function load(user, params) {
  const { id } = await params;
  if (!isObjectId(id)) return { error: notFound() };
  const project = await WorkProject.findById(id, { department: 1, stages: 1, code: 1, name: 1, serverFolder: 1, fileAccess: 1 }).lean();
  const access = projectAccess(user, project);
  if (!access) return { error: forbidden() };
  return { project, access, rights: fileRights(user, project) };
}

// The project's files by stage, each with its versions (newest first), as far as the
// viewer's levels go (lib/projectFileAccess.js): without "download" no file addresses.
export async function GET(request, { params }) {
  const user = await requireStaff();
  const { project, rights, error } = await load(user, params);
  if (error) return error;
  const decides = decidesFileAccess(user);
  const base = { rights, canDelete: rights.delete, restricted: Boolean(project.fileAccess?.restricted), access: decides ? serializeFileAccess(project.fileAccess) : null };
  if (!rights.view) return NextResponse.json({ ...base, files: [] });
  const files = await ProjectFile.find({ project: project._id }).sort({ updatedAt: -1 }).lean();
  const names = await peopleNames(files.flatMap((f) => f.versions.map((v) => v.by)));
  return NextResponse.json({
    ...base,
    files: files.map((f) => ({
      id: idStr(f._id),
      stage: f.stage,
      name: f.name,
      updatedAt: f.updatedAt,
      versions: [...f.versions]
        .sort((a, b) => b.n - a.n)
        .map((v) => ({
          n: v.n,
          url: rights.download ? v.url || "" : "",
          server: rights.download && v.server?.path ? { vol: v.server.vol, path: v.server.path } : null,
          onServer: Boolean(v.server?.path),
          // A picture of what's inside (change request CR-3): images and PDFs uploaded here.
          preview: v.url ? previewKind(v.fileName || v.url) : "",
          fileName: v.fileName,
          size: v.size,
          note: v.note,
          by: names[idStr(v.by)] || "",
          at: v.at,
        })),
    })),
  });
}

// The CEO: who may use this project's files. { restricted, people: [{ id, levels }],
// departments: [{ id, levels }] } (levels: view, download, upload, delete).
export async function PUT(request, { params }) {
  const user = await requireStaff();
  const { project, error } = await load(user, params);
  if (error) return error;
  if (!decidesFileAccess(user)) return forbidden();
  const b = await readJson(request);
  const [people, departments] = await Promise.all([
    User.find({ _id: { $in: (b.people || []).map((p) => p?.id).filter(isObjectId) }, status: "active" }, { _id: 1 }).lean(),
    Department.find({ _id: { $in: (b.departments || []).map((d) => d?.id).filter(isObjectId) } }, { _id: 1 }).lean(),
  ]);
  const value = cleanFileAccess(b, { userIds: new Set(people.map((u) => idStr(u._id))), departmentIds: new Set(departments.map((d) => idStr(d._id))) });
  await WorkProject.updateOne({ _id: project._id }, { $set: { fileAccess: value } });
  await audit(user, "project.file_access", { entityType: "project", entityId: project._id, summary: value.restricted ? `restricted: ${value.people.length} people, ${value.departments.length} departments` : "open to everyone", details: { before: serializeFileAccess(project.fileAccess), after: serializeFileAccess(value) } });
  return NextResponse.json({ access: serializeFileAccess(value) });
}

// A new file, or a new version of one: { fileId? (ours), name, stage, fileName, size, note }
// with either { url, storedId } (a file uploaded to /api/upload) or { server: { vol, path } } (a file on the
// company file server). Anyone who can open the project uploads; files are never overwritten.
export async function POST(request, { params }) {
  const user = await requireStaff();
  const { project, rights, error } = await load(user, params);
  if (error) return error;
  if (!rights.upload) return forbidden();
  const b = await readJson(request);
  let url = String(b.url || "");
  let server = { vol: "", path: "" };
  if (b.server) {
    // On the company server: a file the uploader can open, or anything in the project's folder.
    const ref = cleanRef(b.server);
    const fs = await getFileServer();
    if (!ref || !fileServerReady(fs, await gatewaySecret())) return fail("invalid_request");
    const folder = projectFolder(project, fs);
    if (!refsAllowed([ref], [...browseGrants(user, fs), ...(folder ? [[folder.vol, folder.path, "r"]] : [])])) return fail("file_not_allowed");
    server = { vol: ref.vol, path: ref.path };
    url = "";
  } else if (!url.startsWith(`/uploads/octabuilders/projects/${idStr(project._id)}/`) || !/^\/uploads\/[^\s]+$/.test(url)) return fail("invalid_request");
  const version = { url, server, fileId: String(b.storedId || "").slice(0, 100), fileName: String(b.fileName || "").slice(0, 200), size: Math.max(0, Number(b.size) || 0), note: String(b.note || "").trim().slice(0, 300), by: user.id };
  let file = isObjectId(b.fileId) ? await ProjectFile.findOne({ _id: b.fileId, project: project._id }) : null;
  if (file) {
    file.versions.push({ ...version, n: Math.max(0, ...file.versions.map((v) => v.n)) + 1 });
  } else {
    const name = String(b.name || b.fileName || "").trim().slice(0, 200);
    if (!name) return fail("title_required");
    const stage = project.stages.some((s) => s.key === b.stage) ? b.stage : "";
    file = new ProjectFile({ project: project._id, stage, name, versions: [{ ...version, n: 1 }], createdBy: user.id });
  }
  await file.save();
  await audit(user, "project.file_uploaded", { entityType: "project", entityId: project._id, summary: `${file.name} v${file.versions.at(-1).n}` });
  return NextResponse.json({ id: idStr(file._id) }, { status: 201 });
}

// ?fileId= — the project's managers (or, once the CEO restricts the files, whoever has
// the "delete" level).
export async function DELETE(request, { params }) {
  const user = await requireStaff();
  const { project, rights, error } = await load(user, params);
  if (error) return error;
  if (!rights.delete) return forbidden();
  const fileId = new URL(request.url).searchParams.get("fileId");
  if (!isObjectId(fileId)) return notFound();
  const file = await ProjectFile.findOneAndDelete({ _id: fileId, project: project._id });
  if (!file) return notFound();
  await audit(user, "project.file_deleted", { entityType: "project", entityId: project._id, summary: file.name });
  return NextResponse.json({ ok: true });
}
