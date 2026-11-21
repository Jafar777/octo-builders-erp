import { hasPermission } from "@/lib/currentUser";
import { usersWithPermissionFor } from "@/lib/scope";

// Accepting / refusing the skills employees add is for the general manager
// (company-wide user managers: GM and CEO by default).
export function canApproveSkills(user) {
  return hasPermission(user, "users.manage") && user?.scope === "all";
}

// Company-wide user managers (no department → only "all"-scope roles).
export const skillApprovers = () => usersWithPermissionFor("users.manage", null);

export const cleanSkill = (v) => String(v || "").trim().replace(/\s+/g, " ").slice(0, 40);

// "AutoCAD, 3ds Max، Revit" → ["AutoCAD", "3ds Max", "Revit"] (commas, Arabic commas,
// semicolons or new lines), without duplicates.
export function splitSkills(v) {
  const out = [];
  for (const part of String(v || "").split(/[,،;؛\n]+/)) {
    const name = cleanSkill(part);
    if (name && !out.some((o) => o.toLowerCase() === name.toLowerCase())) out.push(name);
  }
  return out.slice(0, 15);
}

export const sameSkill = (a, b) => a.toLowerCase() === b.toLowerCase();

export function serializeSkillRequests(list) {
  return (list || []).map((r) => ({ name: r.name, status: r.status, requestedAt: r.requestedAt, reviewedAt: r.reviewedAt }));
}
