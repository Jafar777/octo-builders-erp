import mongoose from "mongoose";
import { bilingual, isObjectId } from "@/lib/apiUtils";
import { canRouteStages } from "@/lib/projects";
import { isBilingualComplete } from "@/lib/validateBilingual";
import Department from "@/models/Department";

export function cleanStages(list, taskTypeKeys) {
  const stages = (Array.isArray(list) ? list : [])
    .filter((s) => s?.key || s?.name?.en || s?.name?.ar)
    .map((s, i) => ({
      // New stages get their key from the English name; existing keys never change.
      key:
        String(s?.key || s?.name?.en || "").trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) ||
        `stage_${Date.now().toString(36)}_${i}`,
      name: bilingual(s?.name, 80),
      taskType: taskTypeKeys.includes(s?.taskType) ? s.taskType : "other",
      department: isObjectId(s?.department) ? String(s.department) : null,
      waitForPrevious: i > 0 && Boolean(s?.waitForPrevious),
    }));
  if (!stages.length) return { error: "stages_required" };
  if (new Set(stages.map((s) => s.key)).size !== stages.length) return { error: "duplicate_key" };
  if (stages.some((s) => !isBilingualComplete(s.name))) return { error: "bilingual_required" };
  return { stages };
}

// Only the GM / CEO decide which department does a stage and whether it waits.
// Everyone else keeps the current setting of each stage (matched by key); new
// stages stay with the project's department.
export async function applyStageRouting(user, stages, previous = []) {
  if (canRouteStages(user)) {
    const ids = [...new Set(stages.map((s) => s.department).filter(Boolean))];
    if ((await Department.countDocuments({ _id: { $in: ids } })) !== ids.length) return { error: "invalid_department" };
    return { stages };
  }
  const before = new Map((previous || []).map((s) => [s.key, s]));
  return {
    stages: stages.map((s, i) => {
      const old = before.get(s.key);
      return {
        ...s,
        department: old?.department ? String(old.department) : null,
        waitForPrevious: i > 0 && Boolean(old?.waitForPrevious),
      };
    }),
  };
}

// Items keep their ids so tasks stay attached; new ones get a fresh id.
export function cleanItems(list) {
  return (Array.isArray(list) ? list : [])
    .map((i, order) => ({
      _id: isObjectId(i?.id) ? i.id : new mongoose.Types.ObjectId(),
      name: String(i?.name || "").trim().slice(0, 120),
      order,
    }))
    .filter((i) => i.name);
}

function date(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

// Editable project fields from a request body (partial updates allowed).
export function cleanProjectFields(body) {
  const out = {};
  if (body.name !== undefined) out.name = bilingual(body.name, 150);
  if (typeof body.code === "string") out.code = body.code.trim().slice(0, 30);
  if (typeof body.client === "string") out.client = body.client.trim().slice(0, 150);
  if (typeof body.folderLink === "string") out.folderLink = body.folderLink.trim().slice(0, 1000);
  if (typeof body.notes === "string") out.notes = body.notes.slice(0, 4000);
  if (["normal", "important", "urgent"].includes(body.priority)) out.priority = body.priority;
  if (["active", "on_hold", "finished", "archived"].includes(body.status)) out.status = body.status;
  if (body.branch !== undefined) out.branch = isObjectId(body.branch) ? body.branch : null;
  if (body.manager !== undefined) out.manager = isObjectId(body.manager) ? body.manager : null;
  if (Array.isArray(body.participants)) out.participants = [...new Set(body.participants.filter(isObjectId))];
  for (const field of ["startDate", "dueDate"]) {
    if (body[field] !== undefined) {
      const d = date(body[field]);
      if (d === undefined) return { error: "invalid_date" };
      out[field] = d;
    }
  }
  if (out.name && !isBilingualComplete(out.name)) return { error: "bilingual_required" };
  if ("dueDate" in out && !out.dueDate) return { error: "due_required" };
  return { fields: out };
}
