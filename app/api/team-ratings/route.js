import { createHmac } from "crypto";
import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, readJson } from "@/lib/apiUtils";
import { todayIn } from "@/lib/hr";
import { departmentManagers } from "@/lib/leave";
import { canRateManagers, isDeptManager, managerRoleKeys } from "@/lib/managerKpi";
import { pickName, viewerLang } from "@/lib/personName";
import { getSettings } from "@/lib/settings";
import TeamRating from "@/models/TeamRating";
import User from "@/models/User";

// A head's average is only shown once this many people rated them (so nobody can work
// out a single person's score).
const MIN_RATERS = 3;
const raterKey = (raterId, headId, month) => createHmac("sha256", process.env.JWT_SECRET).update(`team-rating|${raterId}|${headId}|${month}`).digest("hex");

async function averages(match) {
  const rows = await TeamRating.aggregate([{ $match: match }, { $group: { _id: { head: "$head", month: "$month" }, avg: { $avg: "$score" }, n: { $sum: 1 } } }]);
  return rows.map((r) => ({ head: r._id.head.toString(), month: r._id.month, count: r.n, average: r.n >= MIN_RATERS ? Math.round(r.avg * 10) / 10 : null }));
}

// This month: the heads I can rate (with my own score), my team's result if I'm a head,
// and every head's result for the CEO / GM.
export async function GET() {
  const user = await requireStaff();
  if (!user) return forbidden();
  const settings = await getSettings();
  const month = todayIn(settings.hr.timezone).slice(0, 7);
  const lang = await viewerLang();

  const headIds = (await departmentManagers(user.department, user.id)).filter((id) => id !== user.id);
  const heads = await User.find({ _id: { $in: headIds } }, { name: 1, nameAr: 1, email: 1, avatarUrl: 1 }).lean();
  const mine = await TeamRating.find({ month, raterKey: { $in: heads.map((h) => raterKey(user.id, h._id.toString(), month)) } }).lean();
  const myScore = Object.fromEntries(mine.map((r) => [r.head.toString(), r.score]));

  const out = {
    month,
    minRaters: MIN_RATERS,
    toRate: heads.map((h) => ({ id: h._id.toString(), name: pickName(h, lang), avatarUrl: h.avatarUrl || "", myScore: myScore[h._id.toString()] || null })),
  };
  if (isDeptManager(user)) out.myTeam = await averages({ head: new mongoose.Types.ObjectId(user.id) });
  if (canRateManagers(user)) {
    const list = await averages({});
    const people = await User.find({ role: { $in: await managerRoleKeys() }, status: "active" }, { name: 1, nameAr: 1, email: 1, avatarUrl: 1 }).lean();
    out.allHeads = people.map((p) => ({
      id: p._id.toString(),
      name: pickName(p, lang),
      avatarUrl: p.avatarUrl || "",
      months: list.filter((r) => r.head === p._id.toString()).sort((a, b) => b.month.localeCompare(a.month)).slice(0, 6),
    }));
  }
  return NextResponse.json(out);
}

// { headId, score: 1–5 } — this month; rating again replaces my score.
export async function POST(request) {
  const user = await requireStaff();
  if (!user) return forbidden();
  const { headId, score } = await readJson(request);
  const s = Math.round(Number(score));
  if (!isObjectId(headId) || !(s >= 1 && s <= 5)) return fail("invalid_request");
  if (!(await departmentManagers(user.department, user.id)).includes(headId)) return forbidden();
  const month = todayIn((await getSettings()).hr.timezone).slice(0, 7);
  // No audit entry: it would say who rated.
  await TeamRating.updateOne({ month, head: headId, raterKey: raterKey(user.id, headId, month) }, { $set: { score: s } }, { upsert: true });
  return NextResponse.json({ ok: true });
}
