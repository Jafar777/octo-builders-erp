import mongoose from "mongoose";
import { bilingual, isObjectId } from "@/lib/apiUtils";
import { isBilingualComplete } from "@/lib/validateBilingual";

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
    }));
  if (!stages.length) return { error: "stages_required" };
  if (new Set(stages.map((s) => s.key)).size !== stages.length) return { error: "duplicate_key" };
  if (stages.some((s) => !isBilingualComplete(s.name))) return { error: "bilingual_required" };
  return { stages };
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
