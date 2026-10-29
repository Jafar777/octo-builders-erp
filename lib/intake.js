// Who may do what with new-project intake forms (models/ProjectIntake), and what they
// see of them. The money side is the GM / CEO's alone: it's left out of every response
// for anyone else (the secretary, department heads…), whatever screen asks.

import { hasPermission } from "@/lib/currentUser";
import { NAME_FIELDS, pickName, viewerLang } from "@/lib/personName";
import { canRouteStages } from "@/lib/projects";
import User from "@/models/User";

const idStr = (v) => (v ? v.toString() : null);

// People's names for serializeIntake.
export async function intakeNames(list) {
  const ids = [...new Set(list.flatMap((i) => [idStr(i.createdBy), idStr(i.finance?.by)]).filter(Boolean))];
  const people = await User.find({ _id: { $in: ids } }, NAME_FIELDS).lean();
  const lang = await viewerLang();
  return Object.fromEntries(people.map((p) => [idStr(p._id), pickName(p, lang)]));
}

// The GM / CEO: they price intakes and turn them into projects.
export const isIntakePlanner = (user) => Boolean(user?.isStaff && canRouteStages(user));
// Fill in and follow intake forms: the secretary (projects.intake) and the GM / CEO.
export const canUseIntake = (user) => Boolean(user?.isStaff && (hasPermission(user, "projects.intake") || isIntakePlanner(user)));
// The money side: the GM / CEO with finance rights.
export const canSeeIntakeFinance = (user) => isIntakePlanner(user) && hasPermission(user, "finance.manage");

// The details (not money) can change until the GM / CEO price it; after that only they
// can, until it becomes a project.
export function canEditIntake(user, intake) {
  if (!canUseIntake(user)) return false;
  if (isIntakePlanner(user)) return ["new", "ready", "declined"].includes(intake.status);
  return intake.status === "new";
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
    canEdit: canEditIntake(user, i),
    // A form handed in by mistake: its author or the GM / CEO, while it's new.
    canDelete: i.status === "new" && (isIntakePlanner(user) || idStr(i.createdBy) === user?.id),
  };
}
