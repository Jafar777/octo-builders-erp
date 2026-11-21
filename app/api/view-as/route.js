import { NextResponse } from "next/server";
import { clearViewAsCookie, setViewAsCookie } from "@/lib/auth";
import { canBeViewedAs, canViewAs, getSessionUser } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, notFound, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { pickName, viewerLang } from "@/lib/personName";
import { normalizeRoleKey } from "@/lib/permissions";
import User from "@/models/User";
import Role from "@/models/Role";

// "View as…" — the CEO (or the programmer) sees the dashboard as another person and can act for them.
const ceoOnly = async () => {
  const real = await getSessionUser();
  return canViewAs(real) ? real : null;
};

// The people the CEO can view as.
export async function GET() {
  const real = await ceoOnly();
  if (!real) return forbidden();
  const lang = await viewerLang();
  const [people, roles] = await Promise.all([
    User.find({ status: { $ne: "inactive" } }, { name: 1, nameAr: 1, firstName: 1, lastName: 1, firstNameAr: 1, lastNameAr: 1, email: 1, avatarUrl: 1, role: 1, status: 1 }).lean(),
    Role.find({}, { key: 1, name: 1 }).lean(),
  ]);
  const roleName = Object.fromEntries(roles.map((r) => [r.key, r.name?.[lang] || r.key]));
  return NextResponse.json({
    people: people
      .filter((u) => canBeViewedAs(u, real))
      .map((u) => {
        const role = normalizeRoleKey(u.role);
        return { id: u._id.toString(), name: pickName(u, lang), email: u.email, avatarUrl: u.avatarUrl || "", role, roleName: roleName[role] || role };
      })
      .sort((a, b) => a.name.localeCompare(b.name)),
  });
}

// Start: { userId }.
export async function POST(request) {
  const real = await ceoOnly();
  if (!real) return forbidden();
  const { userId } = await readJson(request);
  if (!isObjectId(userId)) return fail("invalid_request");
  const target = await User.findById(userId).lean();
  if (!target) return notFound();
  if (!canBeViewedAs(target, real)) return forbidden();
  await setViewAsCookie(real.id, userId);
  await audit(real, "view_as.started", { entityType: "user", entityId: userId, summary: pickName(target, "en") });
  return NextResponse.json({ ok: true });
}

// Stop: back to the CEO's own dashboard.
export async function DELETE() {
  const real = await getSessionUser();
  if (!real) return forbidden();
  await clearViewAsCookie();
  await audit(real, "view_as.stopped", {});
  return NextResponse.json({ ok: true });
}
