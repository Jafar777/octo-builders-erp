import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/currentUser";
import { forbidden } from "@/lib/apiUtils";
import { NAME_FIELDS, pickName, viewerLang } from "@/lib/personName";
import AuditLog from "@/models/AuditLog";
import User from "@/models/User";

const idStr = (v) => (v ? v.toString() : null);

// The Roles page's History tab: every change to roles, people's exceptions and who
// holds which role. ?before=<ISO date> pages back.
export async function GET(request) {
  const actor = await requirePermission("roles.manage");
  if (!actor) return forbidden();
  const before = new URL(request.url).searchParams.get("before");
  const query = { action: { $regex: "^(role\.|access\.|user\.role)" } };
  if (before && !Number.isNaN(Date.parse(before))) query.createdAt = { $lt: new Date(before) };

  const logs = await AuditLog.find(query).sort({ createdAt: -1 }).limit(60).lean();
  const ids = [...new Set(logs.flatMap((l) => [idStr(l.actor), l.entityType === "user" ? l.entityId : null]).filter(Boolean))];
  const people = await User.find({ _id: { $in: ids.filter((x) => /^[a-f0-9]{24}$/.test(x)) } }, NAME_FIELDS).lean();
  const lang = await viewerLang();
  const names = Object.fromEntries(people.map((p) => [idStr(p._id), pickName(p, lang)]));

  return NextResponse.json({
    logs: logs.map((l) => ({
      id: idStr(l._id),
      action: l.action,
      actor: names[idStr(l.actor)] || "—",
      entityType: l.entityType,
      entityId: l.entityId,
      target: l.entityType === "user" ? names[l.entityId] || l.summary : l.summary,
      details: l.details || {},
      createdAt: l.createdAt,
    })),
  });
}
