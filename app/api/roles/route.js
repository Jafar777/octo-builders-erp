import { NextResponse } from "next/server";
import { getCurrentUser, hasPermission, requirePermission } from "@/lib/currentUser";
import { fail, forbidden, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { cleanRoleBody, escalation, loadRolesWithCounts, serializeRole, trimRestricted } from "@/lib/roles";
import { isBilingualComplete } from "@/lib/validateBilingual";
import Role from "@/models/Role";
import { CODER_ROLE, isHiddenRole } from "@/lib/permissions";

export async function GET() {
  const user = await getCurrentUser();
  if (!hasPermission(user, "users.view") && !hasPermission(user, "roles.manage")) return forbidden();

  // The hidden coder role is only listed for a coder.
  const roles = await loadRolesWithCounts();
  return NextResponse.json({ roles: user.role === CODER_ROLE ? roles : roles.filter((r) => !isHiddenRole(r.key)) });
}

export async function POST(request) {
  const actor = await requirePermission("roles.manage");
  if (!actor) return forbidden();

  const body = await readJson(request);
  const data = trimRestricted(cleanRoleBody(body));
  if (!isBilingualComplete(data.name)) return fail("bilingual_required");
  const why = escalation(actor, [], data.permissions, data.scope);
  if (why) return fail(why, 403);

  // Keys are generated from the English name and never change afterwards.
  const base =
    data.name.en.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 30) || "role";
  let key = base;
  for (let i = 2; await Role.exists({ key }); i += 1) key = `${base}_${i}`;

  const role = await Role.create({ key, ...data, system: false });
  await audit(actor, "role.created", { entityType: "role", entityId: key, summary: data.name.en, details: data });

  return NextResponse.json({ role: serializeRole(role.toObject()) }, { status: 201 });
}
