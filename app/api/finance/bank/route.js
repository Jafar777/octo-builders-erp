import crypto from "crypto";
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { matchCandidates } from "@/lib/ledgerEngine";
import BankLine from "@/models/BankLine";
import Branch from "@/models/Branch";
import FinanceEntry from "@/models/FinanceEntry";

const idStr = (v) => (v ? v.toString() : null);

const serializeEntry = (e) => ({ id: idStr(e._id), kind: e.kind, date: e.date, amount: e.amount, currency: e.currency, description: e.description || e.beneficiary || "" });

// A branch's imported bank lines, each with the entries it could be (same amount, within
// a week) when it isn't matched yet. ?branch=<id>
export async function GET(request) {
  const user = await requirePermission("finance.manage");
  if (!user) return forbidden();
  const branch = new URL(request.url).searchParams.get("branch");
  if (!isObjectId(branch)) return NextResponse.json({ lines: [] });
  const [lines, entries] = await Promise.all([
    BankLine.find({ branch }).sort({ date: -1 }).limit(500).lean(),
    FinanceEntry.find({ branch, kind: { $in: ["payment", "project_expense", "operating_expense"] } }).lean(),
  ]);
  const taken = new Set(lines.map((l) => idStr(l.entry)).filter(Boolean));
  const byId = Object.fromEntries(entries.map((e) => [idStr(e._id), e]));
  return NextResponse.json({
    lines: lines.map((l) => ({
      id: idStr(l._id),
      date: l.date,
      description: l.description,
      amount: l.amount,
      currency: l.currency,
      ignored: l.ignored,
      entry: l.entry && byId[idStr(l.entry)] ? serializeEntry(byId[idStr(l.entry)]) : null,
      candidates: l.entry || l.ignored ? [] : matchCandidates({ ...l, branch: idStr(l.branch) }, entries.map((e) => ({ ...e, branch: idStr(e.branch) })), { taken }).slice(0, 3).map(serializeEntry),
    })),
    unmatchedEntries: entries.filter((e) => !taken.has(idStr(e._id))).length,
  });
}

// Import a statement: { branch, lines: [{ date, description, amount }] } (money in +, out −).
// Lines already imported are skipped.
export async function POST(request) {
  const user = await requirePermission("finance.manage");
  if (!user) return forbidden();
  const body = await readJson(request);
  const branch = isObjectId(body.branch) ? await Branch.findById(body.branch).lean() : null;
  if (!branch) return fail("invalid_branch");
  const rows = (Array.isArray(body.lines) ? body.lines : [])
    .map((l) => ({ date: String(l?.date || "").slice(0, 10), description: String(l?.description || "").trim().slice(0, 300), amount: Math.round(Number(l?.amount) * 100) / 100 }))
    .filter((l) => /^\d{4}-\d{2}-\d{2}$/.test(l.date) && Number.isFinite(l.amount) && l.amount !== 0)
    .slice(0, 2000);
  if (!rows.length) return fail("bank_nothing_to_import");
  let added = 0;
  for (const r of rows) {
    const key = crypto.createHash("sha1").update(`${r.date}|${r.amount}|${r.description}`).digest("hex");
    const res = await BankLine.updateOne(
      { branch: branch._id, key },
      { $setOnInsert: { ...r, branch: branch._id, key, currency: branch.currency, importedBy: user.id } },
      { upsert: true }
    );
    if (res.upsertedCount) added += 1;
  }
  await audit(user, "finance.bank_imported", { entityType: "branch", entityId: branch._id, summary: `${added}/${rows.length}` });
  return NextResponse.json({ added, skipped: rows.length - added });
}
