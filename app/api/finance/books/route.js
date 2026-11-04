import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/currentUser";
import { forbidden } from "@/lib/apiUtils";
import { loadBooks } from "@/lib/books";
import { ACCOUNTS, ACCOUNT_KEYS, accountLedger, balanceSheet, profitAndLoss, trialBalance } from "@/lib/ledgerEngine";

const dateOk = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || "");

// The books: profit and loss for a period, the balance sheet and trial balance at its
// end, and one account's lines. ?from=&to=&branch=&account=
export async function GET(request) {
  const user = await requirePermission("finance.view");
  if (!user || user.limited) return forbidden();
  const p = new URL(request.url).searchParams;
  const { journal, today, settings } = await loadBooks();
  const to = dateOk(p.get("to")) ? p.get("to") : today;
  const from = dateOk(p.get("from")) ? p.get("from") : `${to.slice(0, 4)}-01-01`;
  const branch = /^[a-f0-9]{24}$/i.test(p.get("branch") || "") ? p.get("branch") : null;
  const account = ACCOUNT_KEYS.includes(p.get("account")) ? p.get("account") : null;
  const lines = journal.lines;
  return NextResponse.json({
    from,
    to,
    branch,
    base: settings.currencies.base,
    accounts: ACCOUNTS,
    pnl: profitAndLoss(lines, { from, to, branch }),
    balanceSheet: balanceSheet(lines, { to, branch }),
    trialBalance: trialBalance(lines, { to, branch }),
    ledger: account ? { account, ...accountLedger(lines, account, { from, to, branch }) } : null,
  });
}
