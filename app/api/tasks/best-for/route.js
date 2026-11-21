import { NextResponse } from "next/server";
import { isIntakePlanner } from "@/lib/intake";
import { requireStaff } from "@/lib/currentUser";
import { forbidden } from "@/lib/apiUtils";
import { canRouteStages } from "@/lib/projects";
import { getSettings } from "@/lib/settings";
import { clearLeader, rankForType } from "@/lib/kpi/bestFor";
import { NAME_FIELDS, pickName, viewerLang } from "@/lib/personName";
import Task from "@/models/Task";
import User from "@/models/User";

const YEAR = 365 * 24 * 3600000;

// ?types=type@department,… → { bestFor: { "type@department": { userId, name, score, lead, compared, … } } }
// The employee of that department (the stage's, else the project's) who clearly does
// that task type best (lib/kpi/bestFor), from the last 12 months of reviewed work. The
// comparison uses everyone's work of that type; only the department's people can be
// named. Without "@department" anyone can. A key without a clear leader is left out.
// Only for the people who create projects (GM / CEO).
export async function GET(request) {
  const user = await requireStaff({ limited: true });
  if (!user || !(canRouteStages(user) || isIntakePlanner(user))) return forbidden();

  const keys = [...new Set((new URL(request.url).searchParams.get("types") || "").split(",").map((s) => s.trim()).filter(Boolean))].slice(0, 50);
  if (!keys.length) return NextResponse.json({ bestFor: {} });
  const types = [...new Set(keys.map((k) => k.split("@")[0]))];

  const [settings, tasks, lang] = await Promise.all([
    getSettings(),
    Task.find(
      {
        type: { $in: types },
        kind: { $in: ["task", "revision"] },
        status: { $in: ["approved", "rejected", "submitted"] },
        submittedAt: { $gte: new Date(Date.now() - YEAR) },
      },
      { type: 1, assignee: 1, kind: 1, status: 1, reviewLevel: 1, rejectCause: 1, revision: 1, dueAt: 1, submittedAt: 1, activeMs: 1, ratings: 1, maxHours: 1, estimatedHours: 1 }
    ).lean(),
    viewerLang(),
  ]);

  const people = await User.find(
    { _id: { $in: [...new Set(tasks.map((t) => t.assignee?.toString()).filter(Boolean))] }, status: "active", role: { $ne: "user" } },
    { ...NAME_FIELDS, department: 1 }
  ).lean();
  const byId = Object.fromEntries(people.map((u) => [u._id.toString(), u]));

  const bestFor = {};
  for (const key of keys) {
    const [type, department] = key.split("@");
    // Former employees, and people of other departments, are left out before comparing.
    const ranking = rankForType(tasks.filter((t) => t.type === type), settings.tasks?.ratingTags || []).filter(
      (r) => byId[r.userId] && (!department || String(byId[r.userId].department || "") === department)
    );
    const leader = clearLeader(ranking);
    if (leader) bestFor[key] = { ...leader, name: pickName(byId[leader.userId], lang) };
  }
  return NextResponse.json({ bestFor });
}
