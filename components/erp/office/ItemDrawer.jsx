"use client";

import { useEffect, useState } from "react";
import { BellRing, Check, CheckCheck, ListPlus, MessageSquare, Pencil, RotateCcw, Send, X } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { api, errorText } from "@/lib/clientApi";
import { formatDateTime } from "@/lib/formatTime";
import Modal from "@/components/erp/ui/Modal";
import Avatar from "@/components/erp/ui/Avatar";
import { Button, ErrorText } from "@/components/erp/ui/fields";
import { useAsk } from "@/components/erp/ui/Feedback";
import TaskForm from "@/components/erp/tasks/TaskForm";
import { useTaskLookups } from "@/components/erp/tasks/useTaskLookups";
import { canMove } from "@/lib/office";
import { DueChips, DueLabel, inputCls, KindPill, PickSelect, PriorityFlag, StatusPill, TargetLabel, TargetSelect, WaitingAge } from "@/components/erp/office/officeUi";

// One office item: what it is, its thread, and what the viewer may do — the office
// (send, chase, move, edit), the person / department it went to (acknowledge, reply,
// done, turn into a real task), the employee who asked (add a note, cancel).
export default function ItemDrawer({ itemId, onClose, onChanged, lookup = null }) {
  const { t, lang } = useLanguage();
  const [item, setItem] = useState(null);
  const [error, setError] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState("");
  const [editing, setEditing] = useState(false);
  const [tasking, setTasking] = useState(false);
  const ask = useAsk();

  useEffect(() => {
    if (!itemId) return;
    // A new item opened in the same window: start clean, then load it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setItem(null);
    setError("");
    setText("");
    setEditing(false);
    api(`/api/office/items/${itemId}`)
      .then((d) => setItem(d.item))
      .catch((err) => setError(errorText(t, err)));
  }, [itemId, t]);

  async function act(action, extra = {}) {
    setBusy(action + (extra.to || ""));
    setError("");
    try {
      const d = await api(`/api/office/items/${item.id}`, { method: "PATCH", body: { action, text, ...extra } });
      setItem(d.item);
      setText("");
      onChanged?.(d.item);
      return d.item;
    } catch (err) {
      setError(errorText(t, err));
      return null;
    } finally {
      setBusy("");
    }
  }

  const can = item?.can || {};
  const office = can.office;
  const answer = can.answer;
  const open = item && !["done", "cancelled"].includes(item.status);
  const asker = item && !office && !answer;

  return (
    <Modal open={Boolean(itemId)} onClose={onClose} title={item ? `${item.code} · ${item.title}` : t("erp.office.item")} wide>
      <ErrorText>{error}</ErrorText>
      {!item && !error && <p className="text-sm text-white/50">{t("common.loading")}</p>}
      {item && !editing && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <KindPill kind={item.kind} />
            <StatusPill status={item.status} />
            <PriorityFlag priority={item.priority} />
            <TargetLabel item={item} />
            <DueLabel item={item} />
            <WaitingAge hours={item.waitingHours} />
            {item.adminType && <span className="text-xs text-white/60">{t(`erp.office.adminType.${item.adminType}`)}</span>}
          </div>
          {item.details && <p className="whitespace-pre-wrap rounded-xl bg-white/[0.03] p-3 text-sm text-white/80">{item.details}</p>}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/50">
            {item.client && <span>{t("erp.office.clientLabel")}: <b className="text-white/80">{item.client.name}</b></span>}
            {item.project && <span>{t("erp.office.projectLabel")}: <b className="text-white/80">{item.project.code ? `${item.project.code} · ` : ""}{item.project.name}</b></span>}
            {item.requester && <span>{t("erp.office.requestedBy")}: <b className="text-white/80">{item.requester.name}</b></span>}
            {item.createdBy && <span>{t("erp.office.loggedBy", { name: item.createdBy.name })}</span>}
            {item.task && (
              <a href={`/dashboard/tasks?task=${item.task}`} className="text-brand-orange hover:underline">
                {t("erp.office.linkedTask")}
              </a>
            )}
          </div>

          {/* The thread: notes, replies, status moves and reminders. */}
          <div className="space-y-2">
            {item.updates.length === 0 && <p className="text-xs text-white/40">{t("erp.office.noUpdates")}</p>}
            {item.updates.map((u) => (
              <div key={u.id} className="flex gap-2.5">
                <Avatar name={u.by?.name} src={u.by?.avatarUrl} size={28} />
                <div className="min-w-0 flex-1 rounded-xl bg-white/[0.04] px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-white/45">
                    <b className="text-white/75">{u.by?.name}</b>
                    <span>{t(`erp.office.update.${u.kind}`)}</span>
                    {u.kind === "status" && u.status && <StatusPill status={u.status} />}
                    <span className="ms-auto">{formatDateTime(u.at, lang)}</span>
                  </div>
                  {u.text && <p className="mt-1 whitespace-pre-wrap text-sm text-white/85">{u.text}</p>}
                </div>
              </div>
            ))}
          </div>

          {/* Write something: a note (office / asker) or a reply (the answering side). */}
          {(open || office) && (
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={2}
              placeholder={t(answer && !office ? "erp.office.replyPlaceholder" : "erp.office.notePlaceholder")}
              className={inputCls}
            />
          )}

          <div className="flex flex-wrap gap-2">
            {/* The answering side. */}
            {answer && open && (
              <>
                {canMove(item, "acknowledged", "receiver") && (
                  <Button variant="ghost" loading={busy === "acknowledge"} onClick={() => act("acknowledge")}>
                    <Check size={15} /> {t("erp.office.act.acknowledge")}
                  </Button>
                )}
                <Button variant="ghost" disabled={!text.trim()} loading={busy === "reply"} onClick={() => act("reply")}>
                  <MessageSquare size={15} /> {t("erp.office.act.reply")}
                </Button>
                {canMove(item, "done", "receiver") && (
                  <Button loading={busy === "done"} onClick={() => act("done")}>
                    <CheckCheck size={15} /> {t("erp.office.act.done")}
                  </Button>
                )}
                {can.convert && (
                  <Button variant="ghost" onClick={() => setTasking(true)}>
                    <ListPlus size={15} /> {t("erp.office.act.convert")}
                  </Button>
                )}
              </>
            )}
            {/* The office. */}
            {office && (
              <>
                {(item.assignee || item.department) && canMove(item, "sent", "office") && (
                  <Button variant="ghost" loading={busy === "send"} onClick={() => act("send")}>
                    <Send size={15} /> {t("erp.office.act.send")}
                  </Button>
                )}
                {["sent", "acknowledged"].includes(item.status) && item.sentAt && (
                  <Button variant="ghost" loading={busy === "chase"} onClick={() => act("chase")}>
                    <BellRing size={15} /> {t("erp.office.act.chase")}
                  </Button>
                )}
                {canMove(item, "waiting", "office") && (
                  <Button variant="ghost" loading={busy === "statuswaiting"} onClick={() => act("status", { to: "waiting" })}>
                    {t("erp.office.act.waiting")}
                  </Button>
                )}
                {canMove(item, "done", "office") && !answer && (
                  <Button loading={busy === "statusdone"} onClick={() => act("status", { to: "done" })}>
                    <CheckCheck size={15} /> {t("erp.office.act.close")}
                  </Button>
                )}
                {text.trim() && (
                  <Button variant="ghost" loading={busy === "note"} onClick={() => act("note")}>
                    <MessageSquare size={15} /> {t("erp.office.act.note")}
                  </Button>
                )}
                {canMove(item, "open", "office") && !open && (
                  <Button variant="ghost" loading={busy === "statusopen"} onClick={() => act("status", { to: "open" })}>
                    <RotateCcw size={15} /> {t("erp.office.act.reopen")}
                  </Button>
                )}
                {open && (
                  <Button variant="ghost" onClick={() => setEditing(true)}>
                    <Pencil size={15} /> {t("common.edit")}
                  </Button>
                )}
                {canMove(item, "cancelled", "office") && (
                  <Button
                    variant="danger"
                    loading={busy === "statuscancelled"}
                    onClick={async () => {
                      const why = await ask({ text: t("erp.office.cancelAsk"), placeholder: t("erp.office.cancelWhy") });
                      if (why === null) return;
                      await act("status", { to: "cancelled", text: why });
                    }}
                  >
                    <X size={15} /> {t("erp.office.act.cancel")}
                  </Button>
                )}
              </>
            )}
            {/* The employee who asked. */}
            {asker && open && (
              <>
                {text.trim() && (
                  <Button variant="ghost" loading={busy === "note"} onClick={() => act("note")}>
                    <MessageSquare size={15} /> {t("erp.office.act.note")}
                  </Button>
                )}
                {["open", "sent"].includes(item.status) && item.kind === "admin_request" && (
                  <Button variant="danger" loading={busy === "cancel"} onClick={() => act("cancel")}>
                    <X size={15} /> {t("erp.office.act.withdraw")}
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      )}
      {item && editing && <EditItem item={item} lookup={lookup} onDone={(next) => { setEditing(false); if (next) { setItem(next); onChanged?.(next); } }} />}
      {tasking && item && <MakeTask item={item} onClose={() => setTasking(false)} onLinked={(next) => { setTasking(false); setItem(next); onChanged?.(next); }} />}
    </Modal>
  );
}

// The office edits an item: words, date, priority, who acts, what it's about.
function EditItem({ item, lookup, onDone }) {
  const { t } = useLanguage();
  const [f, setF] = useState({
    title: item.title,
    details: item.details,
    due: item.due ? new Date(item.due).toISOString().slice(0, 10) : "",
    priority: item.priority,
    person: item.assignee?.id || "",
    department: item.department?.id || "",
    client: item.client?.id || "",
    project: item.project?.id || "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const lists = lookup || { people: [], departments: [], clients: [], projects: [] };
  const targetChanged = f.person !== (item.assignee?.id || "") || f.department !== (item.department?.id || "");

  async function save() {
    setBusy(true);
    try {
      const body = { action: "edit", title: f.title, details: f.details, due: f.due, priority: f.priority, client: f.client || null, project: f.project || null };
      if (targetChanged) Object.assign(body, { assignee: f.person || null, department: f.department || null });
      const d = await api(`/api/office/items/${item.id}`, { method: "PATCH", body });
      onDone(d.item);
    } catch (err) {
      setError(errorText(t, err));
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <ErrorText>{error}</ErrorText>
      <input value={f.title} onChange={(e) => set("title")(e.target.value)} className={inputCls} aria-label={t("erp.office.titleLabel")} />
      <textarea value={f.details} onChange={(e) => set("details")(e.target.value)} rows={3} placeholder={t("erp.office.detailsPlaceholder")} className={inputCls} />
      <div className="grid gap-2 sm:grid-cols-2">
        {item.kind !== "admin_request" && item.kind !== "followup" && (
          <TargetSelect person={f.person} department={f.department} onChange={(v) => setF((x) => ({ ...x, ...v }))} lookup={lists} placeholder={t("erp.office.pick.targetOptional")} />
        )}
        <select value={f.priority} onChange={(e) => set("priority")(e.target.value)} className={inputCls} aria-label={t("erp.office.priorityLabel")}>
          {["normal", "high", "urgent"].map((p) => (
            <option key={p} value={p}>
              {t(`erp.office.priority.${p}`)}
            </option>
          ))}
        </select>
        <PickSelect value={f.client} onChange={set("client")} list={lists.clients} placeholder={t("erp.office.pick.client")} />
        <PickSelect value={f.project} onChange={set("project")} list={lists.projects} placeholder={t("erp.office.pick.project")} />
      </div>
      <DueChips value={f.due} onChange={set("due")} />
      {targetChanged && (f.person || f.department) && <p className="text-xs text-amber-200">{t("erp.office.resendHint")}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => onDone(null)}>
          {t("common.cancel")}
        </Button>
        <Button loading={busy} disabled={!f.title.trim()} onClick={save}>
          {t("common.save")}
        </Button>
      </div>
    </div>
  );
}

// A department manager turns the request into a real task (the normal task form and its
// rules); the item is linked and closes when the task is finished.
function MakeTask({ item, onClose, onLinked }) {
  const { t } = useLanguage();
  const lookups = useTaskLookups();
  const [error, setError] = useState("");
  return (
    <Modal open onClose={onClose} title={t("erp.office.act.convert")} wide>
      <ErrorText>{error}</ErrorText>
      <p className="mb-4 text-xs text-white/55">{t("erp.office.convertHint")}</p>
      <TaskForm
        lookups={lookups}
        preset={{ title: item.title, description: [item.details, `${t("erp.office.fromOffice")} ${item.code}`].filter(Boolean).join("\n\n"), projectId: item.project?.id || "" }}
        onCancel={onClose}
        onCreated={async (task) => {
          try {
            const d = await api(`/api/office/items/${item.id}`, { method: "PATCH", body: { action: "link_task", taskId: task.id } });
            onLinked(d.item);
          } catch (err) {
            setError(errorText(t, err));
          }
        }}
      />
    </Modal>
  );
}
