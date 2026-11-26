import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { requireStaff } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, notFound, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { projectAccess, projectChannel, serializeItems } from "@/lib/projects";
import { ROW_KINDS, rowKey, rowLabel } from "@/lib/projectRows";
import { publish } from "@/lib/realtime/server";
import Task from "@/models/Task";
import WorkProject from "@/models/WorkProject";

const idStr = (v) => (v ? v.toString() : "");
const clean = (v, max) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const MAX_ROWS = 600;

// A project's rows: its spaces (interior design) or drawing sheets (technical office),
// lib/projectRows.js. The CEO and the project's department managers keep the list.
//
// PUT { rows?, linkedProject?, items: [{ id?, number, name, space?, archived? }] } — the
// whole list in order. Rows left out are deleted, or archived when they already have
// work. Renaming a row renames its tasks.
export async function PUT(request, { params }) {
  const user = await requireStaff();
  if (!user) return forbidden();
  const { id } = await params;
  if (!isObjectId(id)) return notFound();
  const project = await WorkProject.findById(id);
  if (!project) return notFound();
  if (projectAccess(user, project) !== "manage") return forbidden();

  const body = await readJson(request);
  const used = new Set((await Task.distinct("item", { project: project._id, item: { $ne: null } })).map(idStr));

  // What the work repeats over (only while no row has work yet, to turn it off).
  if (body.rows !== undefined) {
    if (!ROW_KINDS.includes(body.rows)) return fail("invalid_rows");
    if (!body.rows && used.size) return fail("rows_in_use", 409);
    project.rows = body.rows;
  }
  if (!project.rows) {
    if (body.rows !== undefined) {
      project.items = [];
      await project.save();
      return NextResponse.json({ rows: "", items: [] });
    }
    return fail("invalid_rows");
  }

  // Sheets: the interior project whose spaces they draw.
  let spaces = null;
  if (body.linkedProject !== undefined) {
    if (body.linkedProject && !isObjectId(body.linkedProject)) return fail("invalid_project");
    if (body.linkedProject && String(body.linkedProject) === String(project._id)) return fail("invalid_project");
    project.linkedProject = body.linkedProject || null;
  }
  if (project.rows === "sheets" && project.linkedProject) {
    const linked = await WorkProject.findById(project.linkedProject, { items: 1, rows: 1 }).lean();
    if (!linked) return fail("invalid_project");
    spaces = new Set((linked.items || []).map((i) => idStr(i._id)));
  }

  const list = Array.isArray(body.items) ? body.items.slice(0, MAX_ROWS + 1) : null;
  if (!list) return fail("invalid_rows");
  if (list.length > MAX_ROWS) return fail("too_many_rows");
  const before = new Map((project.items || []).map((i) => [idStr(i._id), i]));
  const seen = new Set();
  const next = [];
  const renamed = [];
  for (const [order, raw] of list.entries()) {
    const number = clean(raw?.number, 40).toUpperCase();
    const name = clean(raw?.name, 200);
    if (!number && !name) return fail("row_name_required");
    const key = rowKey({ number, name });
    if (seen.has(key)) return fail("duplicate_row", 409, { row: rowLabel({ number, name }) });
    seen.add(key);
    const old = raw?.id ? before.get(String(raw.id)) : null;
    if (raw?.id && !old) return fail("invalid_row");
    const space = project.rows === "sheets" && raw?.space && spaces?.has(String(raw.space)) ? raw.space : null;
    const row = { _id: old?._id || new mongoose.Types.ObjectId(), number, name, order, space, archived: Boolean(raw?.archived) };
    if (old && rowLabel(old) !== rowLabel(row)) renamed.push(row);
    next.push(row);
  }
  // Rows taken out: kept (archived) while they have work, so its history stays readable.
  for (const [rid, old] of before) {
    if (next.some((r) => idStr(r._id) === rid) || !used.has(rid)) continue;
    next.push({ _id: old._id, number: old.number, name: old.name, order: next.length, space: old.space || null, archived: true });
  }

  project.items = next;
  await project.save();
  for (const row of renamed) await Task.updateMany({ project: project._id, item: row._id }, { $set: { title: rowLabel(row) } });

  await audit(user, "project.rows_updated", {
    entityType: "project",
    entityId: project._id,
    summary: `${project.name?.en || project.name?.ar}: ${next.filter((r) => !r.archived).length} ${project.rows}`,
    details: { renamed: renamed.length },
  });
  await publish(projectChannel(idStr(project._id)), "project:updated", { id: idStr(project._id) });
  return NextResponse.json({ rows: project.rows, linkedProject: idStr(project.linkedProject) || null, items: serializeItems(project.items) });
}
