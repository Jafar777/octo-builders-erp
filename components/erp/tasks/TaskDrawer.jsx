"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  ExternalLink,
  HandHelping,
  Link2,
  Loader2,
  Lock,
  Pause,
  Play,
  Plus,
  Repeat,
  Send,
  XCircle,
} from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";
import { useRealtimeEvent, userChannelName } from "@/context/RealtimeContext";
import { api, errorText } from "@/lib/clientApi";
import { formatDate, formatDateTime } from "@/lib/formatTime";
import Modal from "@/components/erp/ui/Modal";
import Avatar from "@/components/erp/ui/Avatar";
import { Button, ErrorText, Input, Label, Select } from "@/components/erp/ui/fields";
import { StatusBadge, taskHeading } from "@/components/erp/tasks/TaskRow";
import TaskForm from "@/components/erp/tasks/TaskForm";
import { DependencyPicker, recurrenceText } from "@/components/erp/tasks/TaskPlanning";
import { Skeleton, SkeletonText } from "@/components/erp/ui/Loading";
import {
  formatDuration,
  liveActiveMs,
  PRIORITY_STYLE,
  revisionLabel,
  toLocalInput,
  useNow,
} from "@/components/erp/tasks/taskUi";

const TAG_KINDS = ["neutral", "excellent", "contribution", "error"];

function Detail({ label, children }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-white/40">{label}</p>
      <div className="mt-1 text-sm text-white">{children || "—"}</div>
    </div>
  );
}

function ReviewForm({ task, lookups, onDone }) {
  const { t, lang } = useLanguage();
  const [decision, setDecision] = useState("approve");
  const [ratings, setRatings] = useState([]);
  const [notes, setNotes] = useState("");
  const [cause, setCause] = useState("employee");
  const [newDueAt, setNewDueAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const toggle = (key) => setRatings((r) => (r.includes(key) ? r.filter((x) => x !== key) : [...r, key]));

  async function submit() {
    setBusy(true);
    setError("");
    try {
      await api(`/api/tasks/${task.id}/action`, {
        method: "POST",
        body: {
          action: "review",
          decision,
          ratings,
          notes,
          rejectCause: cause,
          newDueAt: newDueAt ? new Date(newDueAt).toISOString() : null,
        },
      });
      onDone();
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 rounded-2xl border border-brand-orange/30 bg-brand-orange/[0.06] p-4">
      <p className="font-semibold">{t("erp.tasks.reviewTitle")}</p>
      <div className="grid grid-cols-2 gap-2">
        {["approve", "reject"].map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDecision(d)}
            className={`flex items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-semibold ${
              decision === d
                ? d === "approve"
                  ? "border-emerald-400 bg-emerald-500/20 text-emerald-200"
                  : "border-red-400 bg-red-500/20 text-red-200"
                : "border-white/10 text-white/60"
            }`}
          >
            {d === "approve" ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
            {t(`erp.tasks.${d}`)}
          </button>
        ))}
      </div>

      <div>
        <Label>{t("erp.tasks.ratings")}</Label>
        <div className="space-y-2">
          {TAG_KINDS.map((kind) => {
            const tags = lookups.settings.ratingTags.filter((r) => r.kind === kind);
            if (!tags.length) return null;
            return (
              <div key={kind} className="flex flex-wrap gap-1.5">
                {tags.map((r) => (
                  <button
                    key={r.key}
                    type="button"
                    onClick={() => toggle(r.key)}
                    className={`rounded-full border px-3 py-1 text-xs ${
                      ratings.includes(r.key)
                        ? kind === "error"
                          ? "border-red-400 bg-red-500/20 text-red-200"
                          : "border-emerald-400 bg-emerald-500/20 text-emerald-200"
                        : "border-white/10 text-white/60 hover:text-white"
                    }`}
                  >
                    {r.name?.[lang]}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <Label>{t("erp.tasks.headNotes")}</Label>
        <textarea
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm outline-none focus:border-white/30"
        />
      </div>

      {decision === "reject" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label={t("erp.tasks.rejectCause")}
            value={cause}
            onChange={setCause}
            options={["employee", "management", "project"].map((c) => ({ value: c, label: t(`erp.tasks.cause.${c}`) }))}
          />
          <Input type="datetime-local" label={t("erp.tasks.revisionDue")} value={newDueAt} onChange={setNewDueAt} />
          <p className="text-xs text-white/50 sm:col-span-2">{t("erp.tasks.rejectHint", { rev: revisionLabel(task.revision + 1) })}</p>
        </div>
      )}

      <ErrorText>{error}</ErrorText>
      <Button onClick={submit} disabled={busy} className="w-full">
        {busy && <Loader2 size={16} className="animate-spin" />}
        {t("erp.tasks.confirmReview")}
      </Button>
    </div>
  );
}

export default function TaskDrawer({ taskId, lookups, onClose, onChanged, onOpenTask }) {
  const { t, lang } = useLanguage();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState(null); // "help" | "submit"
  const [helperId, setHelperId] = useState("");
  const [note, setNote] = useState("");
  const [link, setLink] = useState("");
  const [comment, setComment] = useState("");
  const [manage, setManage] = useState({ assigneeId: "", dueAt: "" });
  const [subtasks, setSubtasks] = useState([]);
  const [addingSub, setAddingSub] = useState(false);
  const [deps, setDeps] = useState(null); // editing predecessors

  const load = useCallback(async () => {
    if (!taskId) return;
    try {
      const [d, subs] = await Promise.all([
        api(`/api/tasks/${taskId}`),
        api(`/api/tasks?view=subtasks&parent=${taskId}`).catch(() => ({ tasks: [] })),
      ]);
      setSubtasks(subs.tasks);
      setData(d);
      setLink(d.task.deliveryLink || "");
      setManage({ assigneeId: d.task.assignee?.id || "", dueAt: toLocalInput(d.task.dueAt) });
    } catch (err) {
      setError(errorText(t, err));
    }
  }, [taskId, t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  useRealtimeEvent(userChannelName(user?.id), "task:updated", (e) => {
    if (e.id === taskId) load();
  });

  const task = data?.task;
  const now = useNow(task?.status === "in_progress");

  async function act(action, extra = {}) {
    setBusy(true);
    setError("");
    try {
      await api(`/api/tasks/${taskId}/action`, { method: "POST", body: { action, ...extra } });
      setPanel(null);
      setNote("");
      await load();
      onChanged?.();
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setBusy(false);
    }
  }

  async function patch(body) {
    setError("");
    try {
      await api(`/api/tasks/${taskId}`, { method: "PATCH", body });
      await load();
      onChanged?.();
    } catch (err) {
      setError(errorText(t, err));
    }
  }

  async function addComment() {
    if (!comment.trim()) return;
    await api(`/api/tasks/${taskId}/comments`, { method: "POST", body: { text: comment } }).catch(() => {});
    setComment("");
    load();
  }

  const p = data?.permissions || {};
  const s = task?.status;

  return (
    <Modal open={Boolean(taskId)} onClose={onClose} title={task ? `#${task.number} · ${taskHeading(task, lang)}` : "…"} wide>
      {!task ? (
        error ? (
          <ErrorText>{error}</ErrorText>
        ) : (
          <div className="space-y-6">
            <div className="flex gap-2">
              <Skeleton className="h-6 w-24 rounded-full" />
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              {Array.from({ length: 9 }, (_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-2.5 w-16" />
                  <Skeleton className="h-3.5 w-28" />
                </div>
              ))}
            </div>
            <SkeletonText lines={4} />
          </div>
        )
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={s} />
            {task.kind !== "task" && (
              <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs">{t(`erp.tasks.kind.${task.kind}`)}</span>
            )}
            {task.item && (
              <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs" dir="ltr">
                {revisionLabel(task.revision)}
              </span>
            )}
            {task.priority !== "normal" && (
              <span className={`rounded-full px-2.5 py-0.5 text-xs ${PRIORITY_STYLE[task.priority]}`}>
                {t(`erp.tasks.priority.${task.priority}`)}
              </span>
            )}
            {task.late && <span className="rounded-full bg-red-500/15 px-2.5 py-0.5 text-xs text-red-300">{t("erp.tasks.late")}</span>}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Detail label={t("erp.tasks.project")}>{task.project?.name?.[lang]}</Detail>
            <Detail label={t("erp.tasks.type")}>{lookups.typeName(task.type)}</Detail>
            <Detail label={t("erp.tasks.assignee")}>
              {task.assignee && (
                <span className="flex items-center gap-2">
                  <Avatar name={task.assignee.name} src={task.assignee.avatarUrl} size={22} />
                  {task.assignee.name}
                </span>
              )}
            </Detail>
            <Detail label={t("erp.tasks.dueAt")}>{formatDateTime(task.dueAt, lang)}</Detail>
            <Detail label={t("erp.tasks.estimatedHours")}>{task.estimatedHours || "—"}</Detail>
            <Detail label={t("erp.tasks.timeSpent")}>
              <span dir="ltr" className={s === "in_progress" ? "text-sky-300" : ""}>
                {formatDuration(liveActiveMs(task, now))}
              </span>
              {task.holdMs > 0 && (
                <span className="ms-2 text-xs text-white/40" dir="ltr">
                  ({t("erp.tasks.onHoldTime")} {formatDuration(task.holdMs)})
                </span>
              )}
            </Detail>
            <Detail label={t("erp.tasks.createdBy")}>{task.createdBy?.name}</Detail>
            <Detail label={t("erp.tasks.submittedAt")}>{formatDateTime(task.submittedAt, lang)}</Detail>
            <Detail label={t("erp.tasks.deliveryLink")}>
              {task.deliveryLink ? (
                <a href={task.deliveryLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-brand-orange hover:underline">
                  {t("erp.tasks.openLink")} <ExternalLink size={13} />
                </a>
              ) : null}
            </Detail>
          </div>

          {task.description && <p className="whitespace-pre-wrap rounded-xl bg-white/5 p-3 text-sm text-white/80">{task.description}</p>}

          {/* Waiting for other tasks */}
          {task.blocked && (
            <div className="flex items-start gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/[0.07] p-3 text-sm text-amber-200">
              <Lock size={16} className="mt-0.5 shrink-0" />
              <span>
                {t("erp.tasks.blockedBy")}{" "}
                {task.dependsOn
                  .filter((d) => !["approved", "done", "cancelled"].includes(d.status))
                  .map((d) => (
                    <button key={d.id} type="button" onClick={() => onOpenTask?.(d.id)} className="me-1 underline" dir="ltr">
                      #{d.number}
                    </button>
                  ))}
              </span>
            </div>
          )}

          {/* Planning: parent, predecessors, repeat rule, sub-tasks */}
          <div className="space-y-3 rounded-2xl border border-white/10 p-4">
            {task.parentTask && (
              <button type="button" onClick={() => onOpenTask?.(task.parentTask.id)} className="flex items-center gap-2 text-sm text-white/70 hover:text-white">
                <Link2 size={14} /> {t("erp.tasks.subtaskOf")} <span dir="ltr">#{task.parentTask.number}</span> {task.parentTask.title}
              </button>
            )}

            <div>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-white/70">{t("erp.tasks.dependsOn")}</p>
                {p.canPlan && deps === null && !["approved", "done", "cancelled"].includes(s) && (
                  <button type="button" onClick={() => setDeps(task.dependsOn.map((d) => d.id))} className="text-xs text-brand-orange hover:underline">
                    {t("common.edit")}
                  </button>
                )}
              </div>
              {deps === null ? (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {task.dependsOn.length === 0 && <span className="text-sm text-white/40">—</span>}
                  {task.dependsOn.map((d) => (
                    <button key={d.id} type="button" onClick={() => onOpenTask?.(d.id)} className="flex items-center gap-1.5 rounded-full border border-white/10 py-0.5 pe-1 ps-2.5 text-xs hover:bg-white/5">
                      <span dir="ltr">#{d.number}</span>
                      <StatusBadge status={d.status} />
                    </button>
                  ))}
                </div>
              ) : (
                <div className="mt-2 space-y-2">
                  <DependencyPicker value={deps} onChange={setDeps} projectId={task.project?.id || ""} excludeId={task.id} />
                  <div className="flex gap-2">
                    <Button variant="ghost" onClick={() => setDeps(null)}>
                      {t("common.cancel")}
                    </Button>
                    <Button onClick={() => patch({ dependsOn: deps }).then(() => setDeps(null))}>{t("common.save")}</Button>
                  </div>
                </div>
              )}
            </div>

            {(task.recurrence || task.recurrenceOf) && (
              <div className="flex flex-wrap items-center gap-2 text-sm text-white/70">
                <Repeat size={14} />
                {task.recurrence ? (
                  <>
                    <span>{recurrenceText(t, task.recurrence, (d) => formatDate(d, lang))}</span>
                    {p.canPlan && (
                      <button
                        type="button"
                        onClick={() => window.confirm(t("erp.tasks.confirmStopRepeat")) && patch({ recurrence: null })}
                        className="text-xs text-red-300 hover:underline"
                      >
                        {t("erp.tasks.stopRepeat")}
                      </button>
                    )}
                  </>
                ) : (
                  <button type="button" onClick={() => onOpenTask?.(task.recurrenceOf)} className="hover:underline">
                    {t("erp.tasks.repeatCopy")}
                  </button>
                )}
              </div>
            )}

            {!task.parentTask && (
              <div>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-white/70">
                    {t("erp.tasks.subtasks")}
                    {subtasks.length > 0 && (
                      <span className="ms-2 text-xs text-white/45" dir="ltr">
                        {subtasks.filter((x) => ["approved", "done"].includes(x.status)).length}/{subtasks.filter((x) => x.status !== "cancelled").length}
                      </span>
                    )}
                  </p>
                  {!addingSub && !["approved", "done", "cancelled"].includes(s) && (p.isAssignee || p.canManage) && (
                    <button type="button" onClick={() => setAddingSub(true)} className="flex items-center gap-1 text-xs text-brand-orange hover:underline">
                      <Plus size={13} /> {t("erp.tasks.addSubtask")}
                    </button>
                  )}
                </div>
                <div className="mt-2 space-y-1.5">
                  {subtasks.map((x) => (
                    <button
                      key={x.id}
                      type="button"
                      onClick={() => onOpenTask?.(x.id)}
                      className="flex w-full items-center gap-3 rounded-xl border border-white/10 px-3 py-2 text-start text-sm hover:bg-white/5"
                    >
                      <span className="text-xs text-white/40" dir="ltr">
                        #{x.number}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{x.title || taskHeading(x, lang)}</span>
                      <span className="hidden text-xs text-white/50 sm:inline">{x.assignee?.name}</span>
                      <StatusBadge status={x.status} />
                    </button>
                  ))}
                  {subtasks.length === 0 && !addingSub && <p className="text-sm text-white/40">—</p>}
                </div>
                {addingSub && (
                  <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <TaskForm
                      lookups={lookups}
                      preset={{ parent: task }}
                      onCancel={() => setAddingSub(false)}
                      onCreated={() => {
                        setAddingSub(false);
                        load();
                        onChanged?.();
                      }}
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Review result */}
          {task.reviewedAt && (
            <div className={`rounded-2xl border p-4 text-sm ${s === "approved" ? "border-emerald-500/30 bg-emerald-500/[0.06]" : "border-red-500/30 bg-red-500/[0.06]"}`}>
              <p className="font-semibold">
                {t(`erp.tasks.status.${s}`)} · {task.reviewedBy?.name} · {formatDateTime(task.reviewedAt, lang)}
              </p>
              {task.ratings.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {task.ratings.map((r) => (
                    <span key={r} className={`rounded-full px-2.5 py-0.5 text-xs ${lookups.tag(r)?.kind === "error" ? "bg-red-500/20 text-red-200" : "bg-emerald-500/20 text-emerald-200"}`}>
                      {lookups.tag(r)?.name?.[lang] || r}
                    </span>
                  ))}
                </div>
              )}
              {task.headNotes && <p className="mt-2 whitespace-pre-wrap text-white/80">{task.headNotes}</p>}
              {task.rejectCause && <p className="mt-1 text-xs text-white/50">{t(`erp.tasks.cause.${task.rejectCause}`)}</p>}
            </div>
          )}

          {/* Assignee actions */}
          {p.isAssignee && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {s === "todo" && (
                  <Button onClick={() => act("start")} disabled={busy || task.blocked}>
                    <Play size={16} /> {t("erp.tasks.start")}
                  </Button>
                )}
                {s === "in_progress" && (
                  <Button variant="ghost" onClick={() => act("pause")} disabled={busy}>
                    <Pause size={16} /> {t("erp.tasks.pause")}
                  </Button>
                )}
                {(s === "on_hold" || s === "help") && (
                  <Button onClick={() => act("resume")} disabled={busy}>
                    <Play size={16} /> {t("erp.tasks.resume")}
                  </Button>
                )}
                {(s === "in_progress" || s === "on_hold") && task.kind !== "help" && (
                  <Button variant="ghost" onClick={() => setPanel(panel === "help" ? null : "help")} disabled={busy}>
                    <HandHelping size={16} /> {t("erp.tasks.askHelp")}
                  </Button>
                )}
                {["in_progress", "on_hold", "help"].includes(s) && (
                  <Button onClick={() => setPanel(panel === "submit" ? null : "submit")} disabled={busy}>
                    <Send size={16} className="rtl:rotate-180" /> {t(`erp.tasks.submit_${task.kind === "meeting" || task.kind === "personal" ? "finish" : "review"}`)}
                  </Button>
                )}
                {["todo", "in_progress", "on_hold", "help"].includes(s) && (
                  <Button variant="danger" onClick={() => window.confirm(t("erp.tasks.confirmCancel")) && act("cancel")} disabled={busy}>
                    {t("erp.tasks.cancelTask")}
                  </Button>
                )}
              </div>

              {panel === "help" && (
                <div className="space-y-3 rounded-2xl border border-violet-500/30 bg-violet-500/[0.06] p-4">
                  <Select
                    label={t("erp.tasks.helper")}
                    value={helperId}
                    onChange={setHelperId}
                    placeholder="—"
                    options={lookups.people.filter((x) => x.id !== user?.id).map((x) => ({ value: x.id, label: x.name }))}
                  />
                  <Input label={t("erp.tasks.helpNote")} value={note} onChange={setNote} />
                  <Button onClick={() => act("help", { helperId, note })} disabled={!helperId || busy}>
                    {t("erp.tasks.sendHelp")}
                  </Button>
                </div>
              )}

              {panel === "submit" && (
                <div className="space-y-3 rounded-2xl border border-brand-orange/30 bg-brand-orange/[0.06] p-4">
                  <Input label={t("erp.tasks.deliveryLink")} value={link} onChange={setLink} dir="ltr" placeholder="https://..." />
                  <Input label={t("erp.tasks.employeeNotes")} value={note} onChange={setNote} />
                  <Button onClick={() => act("submit", { deliveryLink: link, employeeNotes: note })} disabled={busy}>
                    {t("erp.tasks.confirmSubmit")}
                  </Button>
                </div>
              )}

              {["todo", "in_progress", "on_hold", "help"].includes(s) && panel !== "submit" && (
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <Input label={t("erp.tasks.deliveryLink")} value={link} onChange={setLink} dir="ltr" placeholder="https://..." />
                  </div>
                  <Button variant="ghost" onClick={() => patch({ deliveryLink: link })} disabled={link === (task.deliveryLink || "")}>
                    {t("common.save")}
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Head review */}
          {p.canReview && s === "submitted" && <ReviewForm task={task} lookups={lookups} onDone={() => { load(); onChanged?.(); }} />}

          {/* Manager tools */}
          {p.canManage && s === "todo" && !p.isAssignee && (
            <div className="grid items-end gap-3 rounded-2xl border border-white/10 p-4 sm:grid-cols-[1fr_1fr_auto]">
              <Select
                label={t("erp.tasks.assignee")}
                value={manage.assigneeId}
                onChange={(v) => setManage((m) => ({ ...m, assigneeId: v }))}
                options={lookups.people.map((x) => ({ value: x.id, label: x.name }))}
              />
              <Input type="datetime-local" label={t("erp.tasks.dueAt")} value={manage.dueAt} onChange={(v) => setManage((m) => ({ ...m, dueAt: v }))} />
              <Button
                variant="ghost"
                onClick={() => patch({ assigneeId: manage.assigneeId, dueAt: manage.dueAt ? new Date(manage.dueAt).toISOString() : null })}
              >
                {t("common.save")}
              </Button>
            </div>
          )}

          <ErrorText>{error}</ErrorText>

          {/* Revisions of this board cell */}
          {data.history.length > 1 && (
            <div>
              <p className="mb-2 text-sm font-medium text-white/70">{t("erp.tasks.revisions")}</p>
              <div className="flex flex-wrap gap-2">
                {data.history.map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => onOpenTask?.(h.id)}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs ${h.id === task.id ? "border-brand-orange" : "border-white/10 hover:bg-white/5"}`}
                  >
                    <span dir="ltr">{revisionLabel(h.revision)}</span>
                    <StatusBadge status={h.status} />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Activity & comments */}
          <div>
            <p className="mb-2 text-sm font-medium text-white/70">{t("erp.tasks.activity")}</p>
            <div className="space-y-2">
              {data.activity.map((a) => (
                <div key={a.id} className="flex gap-3 text-sm">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-white/25" />
                  <div className="min-w-0">
                    <p className="text-white/80">
                      <span className="font-medium">{a.actorName}</span>{" "}
                      <span className="text-white/55">{t(`erp.tasks.event.${a.type}`)}</span>
                    </p>
                    {a.text && <p className="whitespace-pre-wrap text-white/70">{a.text}</p>}
                    <p className="text-xs text-white/35">{formatDateTime(a.createdAt, lang)}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <input
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addComment()}
                placeholder={t("erp.tasks.addComment")}
                className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/30"
              />
              <Button variant="ghost" onClick={addComment} disabled={!comment.trim()}>
                {t("erp.messages.send")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
