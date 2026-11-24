// The executive office (the secretary's workspace, /dashboard/office): what she tracks and
// how it moves. Pure — the server checks what's saved with it and the screens use the
// same lists.
//
// Everything that needs closing is an "office item" (models/OfficeItem.js):
//   followup       her own reminder to do something by a date
//   request        a request to a department or a person ("ask Interior for the revised
//                  plan") — its manager answers it, or turns it into a real task
//   complaint      a client's complaint or remark
//   issue          an administrative / operational problem
//   admin_request  an employee asks the office (salary certificate, booking…)
// Calls and messages are "interactions"; meetings and correspondence have their own records.

export const ITEM_KINDS = ["followup", "request", "complaint", "issue", "admin_request"];
// open: logged · sent: with the department / person · acknowledged: they've seen it ·
// waiting: waiting on someone outside (the client…) · done / cancelled: closed.
export const ITEM_STATUSES = ["open", "sent", "acknowledged", "waiting", "done", "cancelled"];
export const OPEN_STATUSES = ["open", "sent", "acknowledged", "waiting"];
export const CLOSED_STATUSES = ["done", "cancelled"];
export const PRIORITIES = ["normal", "high", "urgent"];

export const CHANNELS = ["call_in", "call_out", "whatsapp", "email", "visit", "meeting"];
export const CORRESPONDENCE_CHANNELS = ["email", "whatsapp", "hand", "courier", "drive", "other"];
export const ADMIN_REQUEST_TYPES = ["salary_certificate", "experience_letter", "leave_paper", "supplies", "booking", "maintenance", "other"];
export const MEETING_KINDS = ["internal", "external"];
export const MEETING_STATUSES = ["scheduled", "held", "cancelled"];
export const CLIENT_KINDS = ["company", "person"];

// Quick capture: what each button makes (app/api/office/capture).
export const CAPTURE_TYPES = ["call", "followup", "request", "complaint", "issue", "meeting", "incoming", "outgoing", "inquiry"];

// Who may move an item to which status: the office (its owner / office.manage), or the
// person / department it was sent to.
const OFFICE_MOVES = {
  open: ["sent", "waiting", "done", "cancelled"],
  sent: ["waiting", "done", "cancelled", "open"],
  acknowledged: ["waiting", "done", "cancelled"],
  waiting: ["open", "sent", "done", "cancelled"],
  done: ["open"],
  cancelled: ["open"],
};
const RECEIVER_MOVES = { sent: ["acknowledged", "done"], acknowledged: ["done"], open: ["acknowledged", "done"] };

export function canMove(item, to, side) {
  if (!ITEM_STATUSES.includes(to) || item.status === to) return false;
  const moves = side === "office" ? OFFICE_MOVES : RECEIVER_MOVES;
  return (moves[item.status] || []).includes(to);
}

export const isOpen = (item) => OPEN_STATUSES.includes(item.status);
export const isOverdue = (item, now = Date.now()) => isOpen(item) && item.due && new Date(item.due).getTime() < now;

// "OF-0042" / "IN-2026-0007" / "OUT-2026-0007".
export const itemCode = (n) => `OF-${String(n).padStart(4, "0")}`;
export const correspondenceCode = (direction, year, n) => `${direction === "in" ? "IN" : "OUT"}-${year}-${String(n).padStart(4, "0")}`;

// Date chips of the quick capture: "today" | "tomorrow" | "week" | "YYYY-MM-DD" → the
// end of that office day (in `tz`) as a Date, or null.
export function dueFromChip(chip, todayIso) {
  if (!chip) return null;
  const add = (iso, days) => {
    const d = new Date(`${iso}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };
  const day = chip === "today" ? todayIso : chip === "tomorrow" ? add(todayIso, 1) : chip === "week" ? add(todayIso, 7) : /^\d{4}-\d{2}-\d{2}$/.test(chip) ? chip : null;
  return day ? new Date(`${day}T21:00:00Z`) : null;
}

// A WhatsApp chat link for a phone number (digits only; a leading 00 or + dropped).
export function whatsappLink(phone) {
  const digits = String(phone || "").replace(/[^\d]/g, "").replace(/^00/, "");
  return digits.length >= 7 ? `https://wa.me/${digits}` : "";
}

// How long an item has been with a department, in hours (null if it isn't waiting on one).
export function waitingHours(item, now = Date.now()) {
  if (!item.sentAt || !isOpen(item) || item.firstResponseAt) return null;
  return Math.max(0, (now - new Date(item.sentAt).getTime()) / 3600000);
}
