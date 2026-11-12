"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2, Paperclip, XCircle } from "lucide-react";
import { LinkOrPath, ServerRefList } from "@/components/erp/files/ServerRefs";
import { useLanguage } from "@/context/LanguageContext";
import { usePollingFallback, useRealtimeEvent, userChannelName } from "@/context/RealtimeContext";
import { api, errorText } from "@/lib/clientApi";
import { formatDateTime, locale } from "@/lib/formatTime";
import Modal from "@/components/erp/ui/Modal";
import Avatar from "@/components/erp/ui/Avatar";
import { Button, ErrorText, Label, PageHeader, Select } from "@/components/erp/ui/fields";
import TaskRow, { TaskName, taskHeading } from "@/components/erp/tasks/TaskRow";
import TaskDrawer from "@/components/erp/tasks/TaskDrawer";
import Stars from "@/components/erp/tasks/Stars";
import LevelBadge from "@/components/erp/tasks/LevelBadge";
import { useTaskLookups } from "@/components/erp/tasks/useTaskLookups";
import { revisionLabel } from "@/components/erp/tasks/taskUi";
import { SkeletonList } from "@/components/erp/ui/Loading";
import { EmptyState } from "@/components/erp/ui/DataTools";

// The Reviews page. Reviewers: work waiting for their level, the reviews they gave, how
// the department managers reviewed (GM / CEO) and the reviews each employee's work got.
// Customers: the tasks waiting for their review and the reviews they gave.
export default function ReviewQueue({ meId, customer = false }) {
  const { t } = useLanguage();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState(searchParams.get("tab") || "queue");
  const [tabs, setTabs] = useState(["queue"]);
  const [openId, setOpenId] = useState(searchParams.get("task"));

  const go = (next, task = null) => {
    setTab(next);
    setOpenId(task);
    const q = new URLSearchParams();
    if (next !== "queue") q.set("tab", next);
    if (task) q.set("task", task);
    router.replace(`/dashboard/reviews${q.size ? `?${q}` : ""}`, { scroll: false });
  };

  return (
    <div className="max-w-6xl">
      <PageHeader title={t("erp.nav.reviews")} subtitle={t(customer ? "erp.reviews.customerSubtitle" : "erp.reviews.subtitle")} />
      {tabs.length > 1 && (
        <div className="mb-5 flex flex-wrap gap-1 rounded-xl border border-white/10 p-1">
          {tabs.map((x) => (
            <button
              key={x}
              type="button"
              onClick={() => go(x)}
              className={`rounded-lg px-4 py-2 text-sm ${tab === x ? "bg-brand-orange text-white" : "text-white/60 hover:text-white"}`}
            >
              {t(`erp.reviews.tab.${x}`)}
            </button>
          ))}
        </div>
      )}
      {tab === "queue" ? (
        <Queue meId={meId} customer={customer} openId={openId} onOpen={(id) => go("queue", id)} onTabs={setTabs} />
      ) : (
        <History key={tab} tab={tab} meId={meId} customer={customer} openId={openId} onOpen={(id) => go(tab, id)} onTabs={setTabs} />
      )}
    </div>
  );
}

// ---------- waiting for my review ----------

function Queue({ meId, customer, openId, onOpen, onTabs }) {
  const { t } = useLanguage();
  const lookups = useTaskLookups({ enabled: !customer });
  const [tasks, setTasks] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [person, setPerson] = useState("");

  const load = useCallback(async () => {
    const data = await api("/api/reviews?tab=queue").catch(() => null);
    if (data) {
      setTasks(data.tasks);
      onTabs(data.tabs);
    }
    setLoaded(true);
  }, [onTabs]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);
  usePollingFallback(load, 20000);
  useRealtimeEvent(userChannelName(meId), "task:updated", load);

  const visible = useMemo(
    () => tasks.filter((x) => !person || x.assignee?.id === person).sort((a, b) => new Date(a.submittedAt) - new Date(b.submittedAt)),
    [tasks, person]
  );
  const assignees = [...new Map(tasks.map((x) => [x.assignee?.id, x.assignee])).values()].filter(Boolean);
  const open = tasks.find((x) => x.id === openId);

  return (
    <>
      <p className="mb-4 text-sm text-white/50">{t("erp.tasks.reviewSubtitle", { count: tasks.length })}</p>
      {assignees.length > 1 && !customer && (
        <div className="mb-5 max-w-xs">
          <Select value={person} onChange={setPerson} placeholder={t("erp.messages.allPeople")} options={assignees.map((a) => ({ value: a.id, label: a.name }))} />
        </div>
      )}
      {!loaded && <SkeletonList rows={5} />}
      <div className={`space-y-2 ${loaded ? "animate-fade-up" : "hidden"}`}>
        {visible.map((task) =>
          customer ? (
            <CustomerTaskRow key={task.id} task={task} onOpen={() => onOpen(task.id)} />
          ) : (
            <div key={task.id} className="relative">
              <TaskRow task={task} lookups={lookups} now={0} onOpen={onOpen} showAssignee />
              <LevelBadge level={task.reviewLevel} className="absolute -top-2 end-4 border border-brand-navy" />
            </div>
          )
        )}
        {visible.length === 0 && <p className="py-10 text-center text-white/60">{t("erp.tasks.nothingToReview")}</p>}
      </div>
      {customer ? (
        <CustomerReview task={open} onClose={() => onOpen(null)} onDone={load} />
      ) : (
        <TaskDrawer taskId={openId} lookups={lookups} onClose={() => onOpen(null)} onChanged={load} onOpenTask={onOpen} />
      )}
    </>
  );
}

function CustomerTaskRow({ task, onOpen }) {
  const { t, lang } = useLanguage();
  return (
    <button type="button" onClick={onOpen} className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-start hover:bg-white/[0.06]">
      <span className="min-w-0 flex-1">
        <TaskName task={task} extra={task.revision > 0 && <span className="ms-1 text-xs text-white/60" dir="ltr">{revisionLabel(task.revision)}</span>} />
        <span className="block text-xs text-white/60" dir="auto">
          {formatDateTime(task.submittedAt, lang)}
        </span>
      </span>
      <span className="rounded-full bg-amber-500/15 px-3 py-1 text-xs text-amber-200">{t("erp.reviews.reviewNow")}</span>
    </button>
  );
}

// A customer reviews handed-in work: accept it (with stars) or ask for changes.
function CustomerReview({ task, onClose, onDone }) {
  const { t, lang } = useLanguage();
  const [decision, setDecision] = useState("approve");
  const [stars, setStars] = useState(0);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setBusy(true);
    setError("");
    try {
      await api(`/api/reviews/${task.id}`, { method: "POST", body: { decision, stars, notes } });
      setStars(0);
      setNotes("");
      onClose();
      onDone();
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={Boolean(task)} onClose={onClose} title={task ? task.project?.name?.[lang] || taskHeading(task, lang) : ""} wide>
      {task && (
        <div className="space-y-5">
          <div className="grid gap-3 text-sm sm:grid-cols-3">
            <Info label={t("erp.tasks.project")}>{task.project?.name?.[lang]}</Info>
            <Info label={t("erp.reviews.handedIn")}>{formatDateTime(task.submittedAt, lang)}</Info>
            <Info label={t("erp.reviews.revision")}>
              <span dir="ltr">{revisionLabel(task.revision)}</span>
            </Info>
          </div>
          {/* The delivered work: on the company server (opened straight from the office)
              and / or a link. */}
          {(task.deliveryFiles?.length > 0 || task.deliveryLink) && (
            <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-white/50">{t("erp.reviews.openDelivery")}</p>
              <ServerRefList refs={task.deliveryFiles} ctx={{ for: "task", id: task.id }} />
              {task.deliveryLink && <LinkOrPath text={task.deliveryLink} ctx={{ for: "task", id: task.id }} />}
            </div>
          )}
          {task.attachments?.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {task.attachments.map((a) => (
                <a key={a.url} href={a.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs hover:bg-white/5">
                  <Paperclip size={13} /> {a.name}
                </a>
              ))}
            </div>
          )}
          {task.employeeNotes && <p className="whitespace-pre-wrap rounded-xl bg-white/5 p-3 text-sm text-white/75">{task.employeeNotes}</p>}

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
                {t(`erp.reviews.customer.${d}`)}
              </button>
            ))}
          </div>
          <div>
            <Label>{t("erp.tasks.stars")}</Label>
            <Stars value={stars} onChange={setStars} size={26} />
          </div>
          <div>
            <Label>{t(decision === "reject" ? "erp.reviews.customer.changes" : "erp.reviews.customer.notes")}</Label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm outline-none focus:border-white/30"
            />
          </div>
          <ErrorText>{error}</ErrorText>
          <Button onClick={submit} disabled={busy || (decision === "approve" && !stars) || (decision === "reject" && !notes.trim())} className="w-full">
            {busy && <Loader2 size={16} className="animate-spin" />}
            {t("erp.tasks.confirmReview")}
          </Button>
        </div>
      )}
    </Modal>
  );
}

function Info({ label, children }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-white/60">{label}</p>
      <div className="mt-1">{children || "—"}</div>
    </div>
  );
}

// ---------- reviews given ----------

function months(lang) {
  const fmt = new Intl.DateTimeFormat(locale(lang), { month: "long", year: "numeric" });
  const d = new Date();
  d.setDate(1);
  return Array.from({ length: 12 }, () => {
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = fmt.format(d);
    d.setMonth(d.getMonth() - 1);
    return { value, label };
  });
}

function History({ tab, meId, customer, openId, onOpen, onTabs }) {
  const { t, lang } = useLanguage();
  const lookups = useTaskLookups({ enabled: !customer });
  const [month, setMonth] = useState("");
  const [person, setPerson] = useState("");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    const q = new URLSearchParams({ tab });
    if (month) q.set("month", month);
    if (person) q.set("person", person);
    api(`/api/reviews?${q}`)
      .then((d) => {
        setData(d);
        onTabs(d.tabs);
      })
      .catch((err) => setError(errorText(t, err)));
  }, [tab, month, person, onTabs, t]);

  useEffect(() => {
    load();
  }, [load]);
  useRealtimeEvent(userChannelName(meId), "task:updated", load);

  const people = data?.summary || [];
  const tag = (key) => lookups.tag(key);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-[220px_260px]">
        <Select value={month} onChange={setMonth} placeholder={t("erp.reviews.last6")} options={months(lang)} />
        {tab !== "mine" && (
          <Select value={person} onChange={setPerson} placeholder={t(tab === "managers" ? "erp.reviews.allManagers" : "erp.messages.allPeople")} options={people.map((p) => ({ value: p.id, label: p.name }))} />
        )}
      </div>
      <ErrorText>{error}</ErrorText>
      {!data && !error && <SkeletonList rows={5} />}

      {data && tab !== "mine" && people.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-white/[0.03] text-xs text-white/50">
              <tr>
                <th className="px-4 py-2.5 text-start font-medium">{t(tab === "managers" ? "erp.reviews.manager" : "erp.reviews.employee")}</th>
                <th className="px-3 py-2.5 text-center font-medium">{t("erp.reviews.count")}</th>
                <th className="px-3 py-2.5 text-center font-medium">{t("erp.reviews.approved")}</th>
                <th className="px-3 py-2.5 text-center font-medium">{t("erp.reviews.rejected")}</th>
                <th className="px-3 py-2.5 text-center font-medium">{t("erp.tasks.stars")}</th>
                <th className="px-3 py-2.5 text-center font-medium">{t(tab === "managers" ? "erp.reviews.waiting" : "erp.reviews.byCustomer")}</th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => setPerson(person === p.id ? "" : p.id)}
                  className={`cursor-pointer border-t border-white/5 hover:bg-white/[0.04] ${person === p.id ? "bg-brand-orange/10" : ""}`}
                >
                  <td className="px-4 py-2.5">
                    <span className="flex items-center gap-2">
                      <Avatar name={p.name} src={p.avatarUrl} size={24} />
                      <span>
                        {p.name}
                        {p.department && <span className="block text-xs text-white/60">{p.department[lang]}</span>}
                      </span>
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-center tabular-nums">{p.reviews}</td>
                  <td className="px-3 py-2.5 text-center tabular-nums text-emerald-300">{p.approved}</td>
                  <td className="px-3 py-2.5 text-center tabular-nums text-red-300">{p.rejected}</td>
                  <td className="px-3 py-2.5 text-center">{p.stars != null ? <span className="tabular-nums text-amber-300">★ {p.stars}</span> : "—"}</td>
                  <td className={`px-3 py-2.5 text-center tabular-nums ${tab === "managers" && p.waiting ? "text-amber-300" : ""}`}>{tab === "managers" ? p.waiting : p.customer}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && (
        <div className="space-y-2">
          {data.entries.map(({ key, task, review }) => (
            <button
              key={key}
              type="button"
              onClick={() => !customer && task && onOpen(task.id)}
              className={`block w-full rounded-2xl border px-4 py-3 text-start text-sm ${
                review.decision === "approve" ? "border-emerald-500/20 bg-emerald-500/[0.04]" : "border-red-500/25 bg-red-500/[0.05]"
              } ${customer ? "cursor-default" : "hover:bg-white/[0.05]"}`}
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-xs text-white/60" dir="ltr">
                  #{task?.number}
                </span>
                <span className="min-w-0 flex-1">
                  <TaskName task={task} extra={task?.revision > 0 && <span className="ms-1 text-xs text-white/60">{revisionLabel(task.revision)}</span>} />
                </span>
                <LevelBadge level={review.level} onBehalf={review.onBehalf} />
                <span className={`flex items-center gap-1 text-xs font-semibold ${review.decision === "approve" ? "text-emerald-300" : "text-red-300"}`}>
                  {review.decision === "approve" ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                  {t(`erp.reviews.decision.${review.decision}`)}
                </span>
                {review.stars > 0 && <Stars value={review.stars} size={13} />}
              </div>
              <p className="mt-1 text-xs text-white/60" dir="auto">
                {[!customer && task?.assignee?.name, tab !== "mine" && review.by?.name && t("erp.reviews.by", { name: review.by.name }), formatDateTime(review.at, lang)]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {review.ratings.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {review.ratings.map((r) => (
                    <span key={r} className={`rounded-full px-2 py-0.5 text-[11px] ${tag(r)?.kind === "error" ? "bg-red-500/20 text-red-200" : "bg-emerald-500/20 text-emerald-200"}`}>
                      {tag(r)?.name?.[lang] || r}
                    </span>
                  ))}
                </div>
              )}
              {review.notes && <p className="mt-2 whitespace-pre-wrap text-white/75">{review.notes}</p>}
              {review.rejectCause && <p className="mt-1 text-xs text-white/60">{t(`erp.tasks.cause.${review.rejectCause}`)}</p>}
            </button>
          ))}
          {data.entries.length === 0 && <EmptyState compact text={t("erp.reviews.none")} />}
        </div>
      )}
      {!customer && <TaskDrawer taskId={openId} lookups={lookups} onClose={() => onOpen(null)} onChanged={load} onOpenTask={onOpen} />}
    </div>
  );
}
