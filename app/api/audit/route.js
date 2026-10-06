import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/currentUser";
import { forbidden, isObjectId } from "@/lib/apiUtils";
import AuditLog from "@/models/AuditLog";
import User from "@/models/User";
import { NAME_FIELDS, pickName, viewerLang } from "@/lib/personName";

const PAGE_SIZE = 50;

// Filters: ?actor=<userId>&action=<prefix>&before=<ISO date>
export async function GET(request) {
  const user = await requirePermission("audit.view");
  if (!user) return forbidden();

  const { searchParams } = new URL(request.url);
  const query = {};
  const actor = searchParams.get("actor");
  if (isObjectId(actor)) query.actor = actor;
  const action = (searchParams.get("action") || "").trim();
  if (/^[a-z_.]+$/i.test(action)) query.action = { $regex: `^${action.replace(/\./g, "\\.")}` };
  const before = searchParams.get("before");
  if (before && !Number.isNaN(Date.parse(before))) query.createdAt = { $lt: new Date(before) };

  const logs = await AuditLog.find(query).sort({ createdAt: -1 }).limit(PAGE_SIZE).lean();
  const actorIds = [...new Set(logs.map((l) => l.actor?.toString()).filter(Boolean))];
  const actors = await User.find({ _id: { $in: actorIds } }, NAME_FIELDS).lean();
  const lang = await viewerLang();
  const names = Object.fromEntries(actors.map((a) => [a._id.toString(), pickName(a, lang)]));

  return NextResponse.json({
    logs: logs.map((l) => ({
      id: l._id.toString(),
      actorId: l.actor?.toString() || null,
      actorName: l.actor ? names[l.actor.toString()] || "—" : "—",
      action: l.action,
      entityType: l.entityType,
      entityId: l.entityId,
      summary: l.summary,
      details: l.details,
      createdAt: l.createdAt,
    })),
    hasMore: logs.length === PAGE_SIZE,
  });
}
