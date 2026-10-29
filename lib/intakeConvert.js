// Turning a priced intake form into a project (POST /api/work-projects with intakeId).
//
//   1. lockIntake    — only a "ready" intake, and only once: it's marked "converting"
//                      atomically, so two people can't create two projects from it.
//   2. checkMoney    — its amounts are checked against today's currencies before the
//                      project is created, so a bad amount never leaves a half-made project.
//   3. finishIntake  — after the project exists: its contract (and the advance received)
//                      become finance entries, the intake is linked and closed, its
//                      author is told.
//   releaseIntake    — something failed: back to "ready" if no project was made from
//                      it, else closed as converted (never a second project).
// A lock left by a crash (still "converting" after 10 minutes, no project) can be taken again.

import { audit } from "@/lib/audit";
import { cleanMoney } from "@/lib/finance";
import { cleanEntry } from "@/lib/financeEntries";
import { todayIn } from "@/lib/hr";
import { intakeNotes } from "@/lib/intakeRules";
import { notify } from "@/lib/notify";
import translations from "@/lib/i18n/translations";
import Branch from "@/models/Branch";
import Client from "@/models/Client";
import FinanceEntry from "@/models/FinanceEntry";
import ProjectIntake from "@/models/ProjectIntake";

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const STALE_LOCK_MS = 10 * 60000;
// Intakes that can be turned into a project now.
export const convertible = () => ({
  "finance.at": { $ne: null },
  $or: [{ status: "ready" }, { status: "converting", workProject: null, updatedAt: { $lt: new Date(Date.now() - STALE_LOCK_MS) } }],
});

export async function lockIntake(id) {
  return ProjectIntake.findOneAndUpdate({ _id: id, ...convertible() }, { $set: { status: "converting" } }, { new: true });
}

export async function releaseIntake(intake) {
  const fresh = await ProjectIntake.findById(intake._id, { status: 1, workProject: 1 }).lean();
  if (fresh?.status !== "converting") return;
  await ProjectIntake.updateOne({ _id: intake._id, status: "converting" }, { $set: { status: fresh.workProject ? "converted" : "ready" } });
}

// Right after the project is created: the intake points at it, so it can never make a second one.
export async function linkIntake(intake, project) {
  intake.workProject = project._id;
  await intake.save();
}

// Returns an error code or null.
export async function checkMoney(intake, settings) {
  const f = intake.finance;
  const contract = cleanMoney({ amount: f.contractValue, currency: f.currency, rate: f.rate }, settings.currencies);
  if (contract.error) return contract.error;
  if (f.advancePaid > 0) {
    if (!f.branch || !(await Branch.exists({ _id: f.branch }))) return "branch_required";
    if (!f.advanceDate) return "invalid_date";
  }
  return null;
}

// The project's notes and client name from the intake (words in the GM's language).
export function projectFieldsFrom(intake, lang) {
  const words = translations[lang]?.erp?.intake || translations.ar.erp.intake || {};
  const label = (group, key) => words[group]?.[key] || key;
  return { notes: intakeNotes(intake, label), client: intake.client.name };
}

// The finance client: the one the GM chose, else one with the same phone or name, else a new one.
async function financeClient(intake) {
  if (intake.finance.client) return intake.finance.client;
  const { name, phone, number } = intake.client;
  const match =
    (phone && (await Client.findOne({ phone }, { _id: 1 }).lean())) ||
    (await Client.findOne({ name: new RegExp(`^${escape(name)}$`, "i") }, { _id: 1 }).lean());
  if (match) return match._id;
  const created = await Client.create({ name, phone, notes: number ? `#${number}` : "" });
  return created._id;
}

// The intake is closed first, then its money is recorded: if recording fails, the error
// shows and the entries can be added in Finance, but the project is never duplicated.
export async function finishIntake(intake, project, user, settings) {
  intake.status = "converted";
  intake.workProject = project._id;
  intake.convertedBy = user.id;
  intake.convertedAt = new Date();
  await intake.save();

  const f = intake.finance;
  const client = await financeClient(intake);
  const base = { project: project._id.toString(), client: client.toString(), currency: f.currency, rate: f.rate };
  const entries = [];
  if (f.contractValue > 0) {
    entries.push({ ...base, kind: "contract", date: todayIn(settings.hr.timezone), amount: f.contractValue, branch: f.branch ? f.branch.toString() : null, description: `#${intake.number}` });
  }
  if (f.advancePaid > 0) {
    entries.push({ ...base, kind: "payment", date: f.advanceDate, amount: f.advancePaid, branch: f.branch.toString(), description: `#${intake.number}` });
  }
  for (const body of entries) {
    const { value, error } = await cleanEntry(body, settings);
    if (error) throw new Error(`intake finance: ${error}`);
    const entry = await FinanceEntry.create({ ...value, createdBy: user.id });
    await audit(user, "finance.entry_created", { entityType: "finance", entityId: entry._id, summary: `${value.kind} ${value.amount} ${value.currency} (${value.date})` });
  }
  await audit(user, "project.intake_converted", { entityType: "intake", entityId: intake._id, summary: `#${intake.number} → ${project.code || project.name.en}` });
  if (intake.createdBy.toString() !== user.id) {
    await notify({
      type: "project.intake_converted",
      recipients: [intake.createdBy.toString()],
      actor: user,
      params: { number: intake.number, project: intake.project.name },
      link: `/dashboard/projects/${project._id}`,
      entityType: "project",
      entityId: project._id,
    });
  }
}
