import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { ACCOUNT_KEYS } from "@/lib/ledgerEngine";
import JournalEntry from "@/models/JournalEntry";

const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// Manual entries: opening balances, owner's money, loans, corrections.
export async function GET() {
  const user = await requirePermission("finance.view");
  if (!user || user.limited) return forbidden();
  const list = await JournalEntry.find().sort({ date: -1, createdAt: -1 }).limit(300).lean();
  return NextResponse.json({
    journals: list.map((j) => ({ id: j._id.toString(), date: j.date, branch: j.branch ? j.branch.toString() : null, memo: j.memo, lines: j.lines })),
  });
}

// { date, branch?, memo, lines: [{ account, debit, credit }] } — debits must equal credits.
export async function POST(request) {
  const user = await requirePermission("finance.manage");
  if (!user) return forbidden();
  const body = await readJson(request);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.date || "")) return fail("invalid_date");
  const lines = (Array.isArray(body.lines) ? body.lines : [])
    .map((l) => ({ account: String(l?.account || ""), debit: r2(Math.max(0, Number(l?.debit) || 0)), credit: r2(Math.max(0, Number(l?.credit) || 0)) }))
    .filter((l) => ACCOUNT_KEYS.includes(l.account) && (l.debit || l.credit));
  if (lines.length < 2) return fail("journal_two_lines");
  const debit = r2(lines.reduce((s, l) => s + l.debit, 0));
  const credit = r2(lines.reduce((s, l) => s + l.credit, 0));
  if (Math.abs(debit - credit) > 0.009) return fail("journal_unbalanced");
  const j = await JournalEntry.create({
    date: body.date,
    branch: isObjectId(body.branch) ? body.branch : null,
    memo: String(body.memo || "").trim().slice(0, 300),
    lines,
    createdBy: user.id,
  });
  await audit(user, "finance.journal_added", { entityType: "journal", entityId: j._id, summary: `${j.memo} · ${debit}` });
  return NextResponse.json({ id: j._id.toString() }, { status: 201 });
}
