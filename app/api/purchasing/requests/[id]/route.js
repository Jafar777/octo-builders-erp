import { NextResponse } from "next/server";
import { getCurrentUser, hasPermission } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, notFound, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { cleanMoney } from "@/lib/finance";
import { notify } from "@/lib/notify";
import { canDecidePurchase } from "@/lib/purchasing";
import { getSettings } from "@/lib/settings";
import { nextNumber } from "@/models/Counter";
import Asset, { ASSET_TYPES } from "@/models/Asset";
import FinanceEntry from "@/models/FinanceEntry";
import PurchaseRequest from "@/models/PurchaseRequest";
import Task from "@/models/Task";

const idStr = (v) => (v ? v.toString() : null);

// { action: "approve" | "reject", note }      an approver
// { action: "ordered" | "received" }           an approver or the asset manager
// { action: "cancel" }                         the requester while pending
// { action: "expense", category, branch }      finance.manage: book what was paid
// { action: "asset", type, holder }            assets.manage: add it to the register
export async function PATCH(request, { params }) {
  const user = await getCurrentUser();
  if (!user?.isStaff || user.limited) return forbidden();
  const { id } = await params;
  if (!isObjectId(id)) return notFound();
  const pr = await PurchaseRequest.findById(id);
  if (!pr) return notFound();
  const b = await readJson(request);
  const tell = async (type, recipients) =>
    notify({ type, recipients: recipients.filter(Boolean).map(String).filter((r) => r !== user.id), actor: user, params: { title: pr.title, number: pr.number }, link: "/dashboard/purchasing", entityType: "purchase", entityId: pr._id });

  if (b.action === "approve" || b.action === "reject") {
    if (pr.status !== "pending" || !canDecidePurchase(user, pr)) return forbidden();
    Object.assign(pr, { status: b.action === "approve" ? "approved" : "rejected", decidedBy: user.id, decidedAt: new Date(), decisionNote: String(b.note || "").slice(0, 500) });
    await pr.save();
    await tell(`purchase.${pr.status}`, [pr.requestedBy]);
  } else if (b.action === "ordered" || b.action === "received") {
    const allowed = hasPermission(user, "purchasing.approve") || hasPermission(user, "assets.manage");
    if (!allowed || !["approved", "ordered"].includes(pr.status)) return forbidden();
    pr.status = b.action;
    if (b.action === "ordered") pr.orderedAt = new Date();
    else pr.receivedAt = new Date();
    await pr.save();
    if (b.action === "received") {
      const task = pr.task ? await Task.findById(pr.task, { assignee: 1 }).lean() : null;
      await tell("purchase.received", [pr.requestedBy, task?.assignee]);
    }
  } else if (b.action === "cancel") {
    if (idStr(pr.requestedBy) !== user.id || pr.status !== "pending") return forbidden();
    pr.status = "cancelled";
    await pr.save();
  } else if (b.action === "expense") {
    if (!hasPermission(user, "finance.manage") || pr.expense || !["ordered", "received", "approved"].includes(pr.status)) return forbidden();
    const settings = await getSettings();
    const money = cleanMoney({ amount: b.amount ?? pr.total, currency: pr.currency || settings.currencies.base }, settings.currencies);
    if (money.error || !(money.amount > 0)) return fail(money.error || "invalid_amount");
    const category = settings.finance.expenseCategories.some((c) => c.key === b.category) ? b.category : settings.finance.expenseCategories[0]?.key || "";
    const entry = await FinanceEntry.create({
      kind: pr.project ? "project_expense" : "operating_expense",
      project: pr.project,
      branch: isObjectId(b.branch) ? b.branch : pr.branch,
      date: /^\d{4}-\d{2}-\d{2}$/.test(b.date || "") ? b.date : new Date().toISOString().slice(0, 10),
      category,
      beneficiary: "",
      description: `${pr.number} · ${pr.title}`,
      ...money,
      createdBy: user.id,
    });
    pr.expense = entry._id;
    await pr.save();
  } else if (b.action === "asset") {
    if (!hasPermission(user, "assets.manage") || pr.asset || pr.status !== "received") return forbidden();
    const asset = await Asset.create({
      tag: `AS-${String(await nextNumber("asset")).padStart(4, "0")}`,
      name: pr.title,
      type: ASSET_TYPES.includes(b.type) ? b.type : "other",
      holder: isObjectId(b.holder) ? b.holder : null,
      status: isObjectId(b.holder) ? "in_use" : "in_stock",
      branch: pr.branch,
      purchaseDate: new Date().toISOString().slice(0, 10),
      cost: pr.total,
      currency: pr.currency,
      history: [{ action: "registered", holder: isObjectId(b.holder) ? b.holder : null, by: user.id, note: pr.number }],
    });
    pr.asset = asset._id;
    await pr.save();
  } else {
    return fail("invalid_request");
  }
  await audit(user, `purchasing.${b.action}`, { entityType: "purchase", entityId: id, summary: `${pr.number} · ${pr.title}` });
  return NextResponse.json({ ok: true });
}
