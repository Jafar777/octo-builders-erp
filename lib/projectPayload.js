import { bilingual, isObjectId } from "@/lib/apiUtils";
import { canRouteStages } from "@/lib/projects";
import { allAtOnce, cleanAfter, stepByStep } from "@/lib/stageFlow";
import { isBilingualComplete } from "@/lib/validateBilingual";
import { DEFAULT_ROLE } from "@/lib/permissions";
import { pickName } from "@/lib/personName";
import Department from "@/models/Department";
import User from "@/models/User";

// The project's customer: an account that signed up and has no role (optional).
// Returns { customer, name } (customer null = none) or { error }.
export async function cleanCustomer(value) {
  if (!value) return { customer: null, name: "" };
  if (!isObjectId(value)) return { error: "invalid_customer" };
  const person = await User.findOne({ _id: value, role: DEFAULT_ROLE, status: "active" }, { name: 1, nameAr: 1, email: 1 }).lean();
  if (!person) return { error: "invalid_customer" };
  return { customer: String(person._id), name: pickName(person, "en") || person.email };
}

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
      ...(Array.isArray(s?.after) ? { after: s.after.map(String) } : {}),
    }));
  if (!stages.length) return { error: "stages_required" };
  if (new Set(stages.map((s) => s.key)).size !== stages.length) return { error: "duplicate_key" };
  if (stages.some((s) => !isBilingualComplete(s.name))) return { error: "bilingual_required" };
  return { stages: cleanAfter(stages) };
}

export const PROJECT_FLOWS = ["ordered", "random", "mixed"];

// A project type sent on its own (older screens): ordered = step by step,
// random = all at once, mixed = the stages keep their own waits.
export function applyFlow(stages, flow) {
  if (flow === "ordered") return stepByStep(stages);
  if (flow === "random") return allAtOnce(stages);
  return cleanAfter(stages);
}

// A template's stages in the order and with the waits the creator chose:
// `plan` = [{ key, after: [keys] }] listing every template stage once. Without a
// plan the stages go step by step. Returns the stages, or null if the plan doesn't fit.
export function orderStages(stages, plan) {
  if (!Array.isArray(plan)) return stepByStep(stages);
  const byKey = new Map(stages.map((s) => [s.key, s]));
  if (plan.length !== stages.length || new Set(plan.map((p) => p?.key)).size !== plan.length || !plan.every((p) => byKey.has(p?.key))) return null;
  return cleanAfter(plan.map((p) => ({ ...byKey.get(p.key), after: Array.isArray(p.after) ? p.after.map(String) : [] })));
}

// Only the GM / CEO decide which department does a stage; everyone else keeps the
// current department of each stage (matched by key) and new stages stay with the
// project's department. Whether a stage waits is up to the project's managers.
export async function applyStageRouting(user, stages, previous = []) {
  if (canRouteStages(user)) {
    const ids = [...new Set(stages.map((s) => s.department).filter(Boolean))];
    if ((await Department.countDocuments({ _id: { $in: ids } })) !== ids.length) return { error: "invalid_department" };
    return { stages };
  }
  const before = new Map((previous || []).map((s) => [s.key, s]));
  return {
    stages: stages.map((s) => {
      const old = before.get(s.key);
      return {
        ...s,
        department: old?.department ? String(old.department) : null,
      };
    }),
  };
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
  if (PROJECT_FLOWS.includes(body.flow)) out.flow = body.flow;
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
