import { NextResponse } from "next/server";
import { getCurrentUser, hasPermission } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { canDecidePurchase, purchaseScope, serializePurchase } from "@/lib/purchasing";
import { peopleNames } from "@/lib/sales";
import { usersWithPermissionFor } from "@/lib/scope";
import { nextNumber } from "@/models/Counter";
import PurchaseRequest from "@/models/PurchaseRequest";
import Supplier from "@/models/Supplier";
import Task from "@/models/Task";

const idStr = (v) => (v ? v.toString() : null);
const canUse = (u) => u?.isStaff && !u.limited && ["purchasing.request", "purchasing.approve", "assets.manage"].some((p) => hasPermission(u, p));

// ?tab=mine | queue (waiting for my decision) | all (everything I may see)
export async function GET(request) {
  const user = await getCurrentUser();
  if (!canUse(user)) return forbidden();
  const tab = new URL(request.url).searchParams.get("tab") || "all";
  const query = tab === "mine" ? { requestedBy: user.id } : purchaseScope(user);
  let list = await PurchaseRequest.find(query).sort({ createdAt: -1 }).limit(500).lean();
  if (tab === "queue") list = list.filter((r) => r.status === "pending" && canDecidePurchase(user, r));
  const [suppliers, tasks, people] = await Promise.all([
    Supplier.find({}, { name: 1 }).lean(),
    Task.find({ _id: { $in: list.map((r) => r.task).filter(Boolean) } }, { number: 1 }).lean(),
    peopleNames(list.flatMap((r) => [r.requestedBy, r.decidedBy])),
  ]);
  const names = {
    suppliers: Object.fromEntries(suppliers.map((s) => [idStr(s._id), s.name])),
    tasks: Object.fromEntries(tasks.map((x) => [idStr(x._id), x.number])),
    people,
  };
  return NextResponse.json({
    requests: list.map((r) => serializePurchase(r, { names, user })),
    canRequest: hasPermission(user, "purchasing.request"),
    canApprove: hasPermission(user, "purchasing.approve"),
    canManageAssets: hasPermission(user, "assets.manage"),
    canBook: hasPermission(user, "finance.manage"),
  });
}

// { title, description, items: [{ description, qty, unitPrice }], currency, supplier,
//   project, task, neededBy }
export async function POST(request) {
  const user = await getCurrentUser();
  if (!user?.isStaff || user.limited || !hasPermission(user, "purchasing.request")) return forbidden();
  const b = await readJson(request);
  const title = String(b.title || "").trim().slice(0, 200);
  if (!title) return fail("title_required");
  const items = (Array.isArray(b.items) ? b.items : [])
    .map((x) => ({ description: String(x?.description || "").trim().slice(0, 200), qty: Math.max(1, Number(x?.qty) || 1), unitPrice: Math.max(0, Number(x?.unitPrice) || 0) }))
    .filter((x) => x.description);
  let task = null;
  if (isObjectId(b.task)) {
    task = await Task.findById(b.task, { status: 1, project: 1, assignee: 1, department: 1 }).lean();
    if (!task || task.status !== "todo") return fail("purchase_task_started");
  }
  const year = new Date().getFullYear();
  const pr = await PurchaseRequest.create({
    number: `PR-${year}-${String(await nextNumber(`purchase-${year}`)).padStart(4, "0")}`,
    title,
    description: String(b.description || "").trim().slice(0, 2000),
    items,
    total: Math.round(items.reduce((s, x) => s + x.qty * x.unitPrice, 0) * 100) / 100,
    currency: String(b.currency || "").slice(0, 5),
    supplier: isObjectId(b.supplier) ? b.supplier : null,
    department: task?.department || user.department || null,
    branch: isObjectId(b.branch) ? b.branch : null,
    project: task?.project || (isObjectId(b.project) ? b.project : null),
    task: task?._id || null,
    neededBy: /^\d{4}-\d{2}-\d{2}$/.test(b.neededBy || "") ? b.neededBy : "",
    requestedBy: user.id,
  });
  await audit(user, "purchasing.requested", { entityType: "purchase", entityId: pr._id, summary: `${pr.number} · ${title}` });
  const approvers = (await usersWithPermissionFor("purchasing.approve", pr.department)).filter((id) => id !== user.id);
  await notify({ type: "purchase.requested", recipients: approvers, actor: user, params: { title, number: pr.number }, link: "/dashboard/purchasing?tab=queue", entityType: "purchase", entityId: pr._id });
  return NextResponse.json({ id: idStr(pr._id) }, { status: 201 });
}
