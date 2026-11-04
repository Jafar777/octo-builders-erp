// Who may do what with new-project intake forms (models/ProjectIntake), and what they
// see of them. The money side is the GM / CEO's alone: it's left out of every response
// for anyone else (the secretary, department heads…), whatever screen asks.

import { hasPermission } from "@/lib/currentUser";
import { NAME_FIELDS, pickName, viewerLang } from "@/lib/personName";
import { canRouteStages } from "@/lib/projects";
import { isDeptManager } from "@/lib/managerKpi";
import User from "@/models/User";

const idStr = (v) => (v ? v.toString() : null);

// People's names for serializeIntake.
export async function intakeNames(list) {
  const ids = [...new Set(list.flatMap((i) => [idStr(i.createdBy), idStr(i.finance?.by), idStr(i.proposal?.by)]).filter(Boolean))];
  const people = await User.find({ _id: { $in: ids } }, NAME_FIELDS).lean();
  const lang = await viewerLang();
  return Object.fromEntries(people.map((p) => [idStr(p._id), pickName(p, lang)]));
}

// Every project starts from an intake form:
//   1. the secretary, a department manager, the GM or the CEO fills in the form;
//   2. the GM / CEO fill in its money side (nobody else ever sees it);
//   3. a department manager (or the CEO) sets the project up: template, stages, hours,
//      employees — a request (`proposal`), no project yet;
//   4. the CEO alone accepts it (the project is created and the Gantt schedules it from
//      now) or rejects it.

// The CEO: accepts or rejects projects.
export const isIntakePlanner = (user) => Boolean(user?.isStaff && canRouteStages(user));
// A department manager: fills in forms and asks for projects of their department.
export const isIntakeProposer = (user) => Boolean(user?.isStaff && !user.limited && isDeptManager(user) && hasPermission(user, "projects.manage"));
// Fill in and follow intake forms: the secretary, department managers, the GM and the CEO.
export const canUseIntake = (user) =>
  Boolean(user?.isStaff && (hasPermission(user, "projects.intake") || isIntakePlanner(user) || isIntakeProposer(user)));
// Who may set a project up (the request the CEO accepts).
export const canProposeProject = (user) => isIntakePlanner(user) || isIntakeProposer(user);
// The money side: the CEO with finance rights, and the general manager (intake.finance).
export const canSeeIntakeFinance = (user) =>
  (isIntakePlanner(user) && hasPermission(user, "finance.manage")) || Boolean(user?.isStaff && hasPermission(user, "intake.finance"));

// The details (never money): the secretary, department managers, the GM and the CEO can
// edit them until the form becomes a project. A rejected form only by the CEO (who can
// reopen it).
export function canEditIntake(user, intake) {
  if (!canUseIntake(user)) return false;
  if (isIntakePlanner(user)) return ["new", "ready", "declined"].includes(intake.status);
  return ["new", "ready"].includes(intake.status);
}

export function serializeIntake(i, user, names = {}) {
  const finance = canSeeIntakeFinance(user) && i.finance?.at
    ? {
        contractValue: i.finance.contractValue,
        currency: i.finance.currency,
        rate: i.finance.rate,
        budget: i.finance.budget,
        branch: idStr(i.finance.branch),
        client: idStr(i.finance.client),
        advancePaid: i.finance.advancePaid || 0,
        advanceDate: i.finance.advanceDate || "",
        paymentTerms: i.finance.paymentTerms || "",
        notes: i.finance.notes || "",
        by: names[idStr(i.finance.by)] || null,
        at: i.finance.at,
      }
    : null;
  return {
    id: idStr(i._id),
    number: i.number,
    // "converting" is a short internal lock; it reads as priced.
    status: i.status === "converting" ? "ready" : i.status,
    client: i.client,
    project: i.project,
    requirements: i.requirements,
    documents: i.documents || [],
    documentsOther: i.documentsOther || "",
    scope: i.scope || [],
    summary: i.summary || "",
    missing: i.missing || [],
    finance,
    // Only the GM / CEO learn whether the money side is filled in.
    priced: canSeeIntakeFinance(user) ? Boolean(i.finance?.at) : undefined,
    projectId: idStr(i.workProject),
    createdBy: names[idStr(i.createdBy)] || null,
    createdAt: i.createdAt,
    updatedAt: i.updatedAt,
    convertedAt: i.convertedAt || null,
    declineReason: i.declineReason || "",
    // The requested project set-up (no money in it) and who asked for it.
    proposal: i.proposal?.at ? { body: i.proposal.body, by: names[idStr(i.proposal.by)] || null, at: i.proposal.at } : null,
    canEdit: canEditIntake(user, i),
    // A form handed in by mistake: its author or the GM / CEO, while it's new.
    canDelete: i.status === "new" && (isIntakePlanner(user) || idStr(i.createdBy) === user?.id),
  };
}
