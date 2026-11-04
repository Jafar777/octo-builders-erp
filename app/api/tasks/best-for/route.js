import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/currentUser";
import { forbidden } from "@/lib/apiUtils";
import { canRouteStages } from "@/lib/projects";
import { getSettings } from "@/lib/settings";
import { clearLeader, rankForType } from "@/lib/kpi/bestFor";
import { NAME_FIELDS, pickName, viewerLang } from "@/lib/personName";
import Task from "@/models/Task";
import User from "@/models/User";

const YEAR = 365 * 24 * 3600000;

// ?types=a,b,c → { bestFor: { [type]: { userId, name, score, lead, compared, … } } }
// The employee who clearly does each task type best (lib/kpi/bestFor), from the last
// 12 months of reviewed work of every active employee. A type without a clear leader
// is left out. Only for the people who create projects (GM / CEO).
export async function GET(request) {
  const user = await requireStaff();
  if (!user || !canRouteStages(user)) return forbidden();

  const types = [...new Set((new URL(request.url).searchParams.get("types") || "").split(",").map((s) => s.trim()).filter(Boolean))].slice(0, 50);
  if (!types.length) return NextResponse.json({ bestFor: {} });

  const [settings, tasks, lang] = await Promise.all([
    getSettings(),
    Task.find(
      {
        type: { $in: types },
        kind: { $in: ["task", "revision"] },
        status: { $in: ["approved", "rejected", "submitted"] },
        submittedAt: { $gte: new Date(Date.now() - YEAR) },
      },
      { type: 1, assignee: 1, kind: 1, status: 1, reviewLevel: 1, rejectCause: 1, revision: 1, dueAt: 1, submittedAt: 1, activeMs: 1, ratings: 1 }
    ).lean(),
    viewerLang(),
  ]);

  const people = await User.find(
    { _id: { $in: [...new Set(tasks.map((t) => t.assignee?.toString()).filter(Boolean))] }, status: "active", role: { $ne: "user" } },
    NAME_FIELDS
  ).lean();
  const byId = Object.fromEntries(people.map((u) => [u._id.toString(), u]));

  const bestFor = {};
  for (const type of types) {
    // Former employees are left out before comparing.
    const ranking = rankForType(tasks.filter((t) => t.type === type), settings.tasks?.ratingTags || []).filter((r) => byId[r.userId]);
    const leader = clearLeader(ranking);
    if (leader) bestFor[type] = { ...leader, name: pickName(byId[leader.userId], lang) };
  }
  return NextResponse.json({ bestFor });
}
