import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, notFound, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { getSettings } from "@/lib/settings";
import { canMove, itemCode, PRIORITIES } from "@/lib/office";
import { answersItem, canUseOffice, dueFor, officeStaffIds, OFFICE_LINK, seesItem, serializeItems, tellReceivers } from "@/lib/officeServer";
import OfficeItem from "@/models/OfficeItem";
import Task from "@/models/Task";

const clip = (v, n) => String(v || "").trim().slice(0, n);
const ref = (v) => (isObjectId(v) ? v : null);
const idStr = (v) => (v ? String(v) : null);

async function load(params) {
  const { id } = await params;
  return isObjectId(id) ? OfficeItem.findById(id) : null;
}

export async function GET(request, { params }) {
  const user = await getCurrentUser();
  const item = await load(params);
  if (!item) return notFound();
  if (!seesItem(user, item)) return forbidden();
  return NextResponse.json({ item: (await serializeItems([item.toObject()], user))[0] });
}

// { action, ... }
//   the office:      edit {title, details, due, priority, assignee, department, client, project}
//                    send · status {to} · note {text} · chase {text}
//   the answering side (its person / department manager / the CEO):
//                    acknowledge · reply {text} · done {text} · link_task {taskId} (a task made from it)
//   the employee who asked (admin request): note {text} · cancel
export async function PATCH(request, { params }) {
  const user = await getCurrentUser();
  const item = await load(params);
  if (!item) return notFound();
  const office = canUseOffice(user);
  const answers = answersItem(user, item);
  const asker = idStr(item.requester) === user?.id;
  if (!office && !answers && !asker) return forbidden();
  const b = await readJson(request);
  const now = new Date();
  const code = itemCode(item.number);
  const text = clip(b.text, 4000);
  const log = (kind, extra = {}) => item.updates.push({ kind, text, by: user.id, at: now, ...extra });
  // Tell the office (and whoever logged it) of an answer.
  const tellOffice = async (type) => {
    const recipients = [...new Set([idStr(item.createdBy), ...(await officeStaffIds())])].filter((id) => id && id !== user.id);
    if (item.requester && idStr(item.requester) !== user.id) recipients.push(idStr(item.requester));
    await notify({ type, recipients: [...new Set(recipients)], actor: user, params: { code, title: item.title, text: text.slice(0, 120), actor: user.name || user.email }, link: item.kind === "admin_request" && !office ? `${OFFICE_LINK}/requests` : OFFICE_LINK, entityType: "office", entityId: item._id });
  };
  const close = (status) => {
    item.status = status;
    item.closedAt = now;
    item.closedBy = user.id;
    log("status", { status });
  };

  switch (b.action) {
    case "edit": {
      if (!office) return forbidden();
      const tz = (await getSettings()).hr.timezone;
      if (b.title !== undefined) item.title = clip(b.title, 300) || item.title;
      if (b.details !== undefined) item.details = clip(b.details, 4000);
      if (b.due !== undefined) item.due = b.due ? dueFor(b.due, tz) : null;
      if (PRIORITIES.includes(b.priority)) item.priority = b.priority;
      if (b.client !== undefined) item.client = ref(b.client);
      if (b.project !== undefined) item.project = ref(b.project);
      const target = b.assignee !== undefined || b.department !== undefined;
      if (target) {
        item.assignee = ref(b.assignee);
        item.department = item.assignee ? null : ref(b.department);
      }
      await item.save();
      // A new person / department: sent to them.
      if (target && (item.assignee || item.department) && item.status !== "done") {
        item.status = "sent";
        item.sentAt = now;
        item.firstResponseAt = null;
        log("status", { status: "sent" });
        await item.save();
        await tellReceivers(item, user);
      }
      break;
    }
    case "send": {
      if (!office || !(item.assignee || item.department) || !canMove(item, "sent", "office")) return fail("invalid_transition", 409);
      item.status = "sent";
      item.sentAt = now;
      log("status", { status: "sent" });
      await item.save();
      await tellReceivers(item, user);
      break;
    }
    case "status": {
      if (!office || !canMove(item, b.to, "office")) return fail("invalid_transition", 409);
      if (["done", "cancelled"].includes(b.to)) close(b.to);
      else {
        item.status = b.to;
        if (b.to === "open") {
          item.closedAt = null;
          item.closedBy = null;
        }
        log("status", { status: b.to });
      }
      await item.save();
      // An employee's request answered: they hear it.
      if (item.kind === "admin_request" && b.to === "done" && item.requester) {
        await notify({ type: "office.admin_done", recipients: [idStr(item.requester)], actor: user, params: { code, title: item.title, text: text.slice(0, 120) }, link: `${OFFICE_LINK}/requests`, entityType: "office", entityId: item._id });
      }
      break;
    }
    case "note": {
      if (!text) return fail("office_text_required");
      log("note");
      await item.save();
      if (asker && !office) await tellOffice("office.admin_note");
      break;
    }
    case "chase": {
      // The office reminds the department / person it's still waiting.
      if (!office || !item.sentAt || !["sent", "acknowledged"].includes(item.status)) return fail("invalid_transition", 409);
      log("chase");
      await item.save();
      await tellReceivers(item, user, "office.request_chased");
      break;
    }
    case "acknowledge":
    case "reply":
    case "done": {
      if (!answers) return forbidden();
      if (b.action === "reply" && !text) return fail("office_text_required");
      if (b.action === "acknowledge" && !canMove(item, "acknowledged", "receiver")) return fail("invalid_transition", 409);
      if (b.action === "done" && !canMove(item, "done", "receiver")) return fail("invalid_transition", 409);
      if (!item.firstResponseAt) item.firstResponseAt = now;
      if (b.action === "acknowledge") {
        item.status = "acknowledged";
        log("status", { status: "acknowledged" });
      } else if (b.action === "reply") {
        if (item.status === "sent") item.status = "acknowledged";
        log("reply");
      } else close("done");
      await item.save();
      await tellOffice(b.action === "done" ? "office.item_done" : b.action === "reply" ? "office.item_replied" : "office.item_acknowledged");
      break;
    }
    case "link_task": {
      // A department manager made a real task from it (POST /api/tasks): linked, and it
      // closes when that task is finished (lib/officeServer.js closeItemsForTask).
      if (!answers || !isObjectId(b.taskId)) return forbidden();
      const task = await Task.findById(b.taskId, { number: 1, createdBy: 1 }).lean();
      if (!task || idStr(task.createdBy) !== user.id) return fail("invalid_request");
      item.task = task._id;
      if (!item.firstResponseAt) item.firstResponseAt = now;
      if (["sent", "open"].includes(item.status)) item.status = "acknowledged";
      item.updates.push({ kind: "reply", text: `#${task.number}`, by: user.id, at: now });
      await item.save();
      await tellOffice("office.item_tasked");
      break;
    }
    case "cancel": {
      if (!asker || item.kind !== "admin_request" || !["open", "sent"].includes(item.status)) return forbidden();
      close("cancelled");
      await item.save();
      break;
    }
    default:
      return fail("invalid_request");
  }
  await audit(user, `office.item_${b.action}`, { entityType: "office", entityId: item._id, summary: `${code} ${item.title}` });
  return NextResponse.json({ item: (await serializeItems([item.toObject()], user))[0] });
}
