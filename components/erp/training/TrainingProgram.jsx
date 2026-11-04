"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Crown, GraduationCap, Medal, Plus, RotateCcw, Trash2, Trophy } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { api, errorText } from "@/lib/clientApi";
import { formatDate } from "@/lib/formatTime";
import Avatar from "@/components/erp/ui/Avatar";
import Modal from "@/components/erp/ui/Modal";
import Stars from "@/components/erp/tasks/Stars";
import { Button, Card, ErrorText, Input, Label, PageHeader, Select } from "@/components/erp/ui/fields";
import { MonthPicker } from "@/components/erp/hr/hrUi";
import { SkeletonCards } from "@/components/erp/ui/Loading";

const MEDAL = ["text-amber-300", "text-slate-200", "text-orange-300"];

// The Training Program: trainees' own practice tasks, separate from projects, the Gantt,
// KPI and money. Trainees add and finish their tasks; the GM / CEO give tasks, see all
// of them and rate the finished ones out of 5. The month's top 3 trainees by stars.
export default function TrainingProgram() {
  const { t } = useLanguage();
  const [month, setMonth] = useState("");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState("");

  const load = useCallback(() => {
    api(`/api/training${month ? `?month=${month}` : ""}`)
      .then((d) => {
        setData(d);
        setMonth(d.month);
      })
      .catch((err) => setError(errorText(t, err)));
  }, [month, t]);

  useEffect(() => {
    load();
  }, [load]);

  const admin = Boolean(data?.admin);
  const only = useCallback((list) => (filter ? list.filter((x) => x.trainee?.id === filter) : list), [filter]);
  const ongoing = useMemo(() => only(data?.ongoing || []), [data, only]);
  const finished = useMemo(() => only(data?.finished || []), [data, only]);

  return (
    <div>
      <PageHeader
        title={t("erp.training.title")}
        subtitle={admin ? t("erp.training.subtitleAdmin") : t("erp.training.subtitle")}
        actions={
          data && (
            <Button onClick={() => setAdding(true)} disabled={admin && !data.trainees.length}>
              <Plus size={16} />
              {admin ? t("erp.training.assign") : t("erp.training.add")}
            </Button>
          )
        }
      />
      <ErrorText>{error}</ErrorText>

      {!data ? (
        <SkeletonCards count={3} />
      ) : (
        <div className="space-y-6">
          <TopTrainees top={data.top} month={month} onMonth={setMonth} />

          {admin && (
            <div className="max-w-xs">
              <Select
                value={filter}
                onChange={setFilter}
                placeholder={t("erp.training.allTrainees")}
                options={data.trainees.map((p) => ({ value: p.id, label: p.name }))}
              />
            </div>
          )}
          {admin && !data.trainees.length && <p className="text-sm text-white/50">{t("erp.training.noTrainees")}</p>}

          <Section title={t("erp.training.ongoing")} count={ongoing.length} empty={t("erp.training.noOngoing")}>
            {ongoing.map((task) => (
              <TaskCard key={task.id} task={task} admin={admin} onChanged={load} onError={setError} />
            ))}
          </Section>

          <Section title={t("erp.training.finishedIn")} count={finished.length} empty={t("erp.training.noFinished")}>
            {finished.map((task) => (
              <TaskCard key={task.id} task={task} admin={admin} onChanged={load} onError={setError} />
            ))}
          </Section>
        </div>
      )}

      <NewTask open={adding} admin={admin} trainees={data?.trainees || []} onClose={() => setAdding(false)} onSaved={load} />
    </div>
  );
}

function TopTrainees({ top, month, onMonth }) {
  const { t } = useLanguage();
  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-semibold">
          <Trophy size={18} className="text-amber-300" />
          {t("erp.training.topTitle")}
        </h2>
        {month && <MonthPicker month={month} onChange={onMonth} />}
      </div>
      {top.length === 0 ? (
        <p className="text-sm text-white/50">{t("erp.training.noRanking")}</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          {top.map((r, i) => (
            <div key={r.trainee.id} className={`flex items-center gap-3 rounded-2xl border p-4 ${i === 0 ? "border-amber-300/30 bg-amber-300/[0.06]" : "border-white/10 bg-white/[0.02]"}`}>
              <div className="relative">
                <Avatar name={r.trainee.name} src={r.trainee.avatarUrl} size={44} />
                {i === 0 && <Crown size={16} className="absolute -top-2 start-1/2 -translate-x-1/2 text-amber-300 rtl:translate-x-1/2" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 truncate font-semibold">
                  <Medal size={15} className={`shrink-0 ${MEDAL[i]}`} />
                  <span className="truncate">{r.trainee.name}</span>
                </p>
                <p className="mt-1 flex items-center gap-2 text-xs text-white/55">
                  <Stars value={r.average} size={12} />
                  <span dir="ltr">{r.average}</span>
                </p>
                <p className="mt-0.5 text-xs text-white/45">{t("erp.training.rankLine", { stars: r.stars, n: r.finished })}</p>
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="mt-3 text-[11px] text-white/35">{t("erp.training.rankHint")}</p>
    </Card>
  );
}

function Section({ title, count, empty, children }) {
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white/80">
        {title}
        <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-white/60">{count}</span>
      </h2>
      {count ? <div className="grid gap-3 lg:grid-cols-2">{children}</div> : <p className="text-sm text-white/40">{empty}</p>}
    </section>
  );
}

function TaskCard({ task, admin, onChanged, onError }) {
  const { t, lang } = useLanguage();
  const [busy, setBusy] = useState("");
  const finished = task.status === "finished";
  const canDelete = admin || (!task.assignedByAdmin && !task.rating);

  async function run(key, req) {
    setBusy(key);
    onError("");
    try {
      await req();
      onChanged();
    } catch (err) {
      onError(errorText(t, err));
    } finally {
      setBusy("");
    }
  }
  const patch = (key, body) => run(key, () => api(`/api/training/${task.id}`, { method: "PATCH", body }));
  const remove = () => window.confirm(t("erp.training.deleteConfirm")) && run("delete", () => api(`/api/training/${task.id}`, { method: "DELETE" }));

  return (
    <Card className="flex flex-col gap-3 !p-4">
      <div className="flex items-start gap-3">
        {finished ? <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-400" /> : <GraduationCap size={18} className="mt-0.5 shrink-0 text-sky-300" />}
        <div className="min-w-0 flex-1">
          <p className="break-words font-semibold">{task.title}</p>
          {task.description && <p className="mt-1 whitespace-pre-line break-words text-sm text-white/60">{task.description}</p>}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/45">
        {admin && task.trainee && (
          <span className="flex items-center gap-1.5 text-white/70">
            <Avatar name={task.trainee.name} src={task.trainee.avatarUrl} size={20} />
            {task.trainee.name}
          </span>
        )}
        {task.assignedByAdmin && <span className="rounded-full bg-brand-orange/15 px-2 py-0.5 text-brand-orange">{t("erp.training.fromManagement")}</span>}
        <span>{t("erp.training.addedOn", { date: formatDate(task.createdAt, lang) })}</span>
        {finished && task.finishedAt && <span>{t("erp.training.finishedOn", { date: formatDate(task.finishedAt, lang) })}</span>}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3">
        <div className="flex items-center gap-2">
          {finished &&
            (admin ? (
              <Stars value={task.rating || 0} onChange={(n) => n && patch("rate", { action: "rate", rating: n })} size={18} />
            ) : task.rating ? (
              <Stars value={task.rating} size={16} />
            ) : (
              <span className="text-xs text-white/45">{t("erp.training.waitingRating")}</span>
            ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {!finished && (
            <Button className="!px-3 !py-1.5 text-xs" loading={busy === "finish"} onClick={() => patch("finish", { action: "finish" })}>
              <CheckCircle2 size={14} />
              {t("erp.training.finish")}
            </Button>
          )}
          {finished && !task.rating && (
            <Button variant="ghost" className="!px-3 !py-1.5 text-xs" loading={busy === "reopen"} onClick={() => patch("reopen", { action: "reopen" })}>
              <RotateCcw size={14} />
              {t("erp.training.reopen")}
            </Button>
          )}
          {canDelete && (
            <Button variant="danger" className="!px-3 !py-1.5 text-xs" loading={busy === "delete"} onClick={remove} aria-label={t("common.delete")}>
              <Trash2 size={14} />
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

const EMPTY = { trainee: "", title: "", description: "" };

function NewTask({ open, admin, trainees, onClose, onSaved }) {
  const { t } = useLanguage();
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (field) => (value) => setForm((f) => ({ ...f, [field]: value }));

  const close = () => {
    setForm(EMPTY);
    setError("");
    onClose();
  };

  async function save() {
    setSaving(true);
    setError("");
    try {
      await api("/api/training", { method: "POST", body: admin ? form : { title: form.title, description: form.description } });
      onSaved();
      close();
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={close} title={admin ? t("erp.training.assign") : t("erp.training.add")}>
      <div className="space-y-4">
        {admin && (
          <Select
            label={t("erp.training.trainee")}
            value={form.trainee}
            onChange={set("trainee")}
            placeholder="—"
            options={trainees.map((p) => ({ value: p.id, label: p.name }))}
          />
        )}
        <Input label={t("erp.training.taskTitle")} value={form.title} onChange={set("title")} maxLength={200} autoFocus />
        <div>
          <Label>{t("erp.training.description")}</Label>
          <textarea
            value={form.description}
            onChange={(e) => set("description")(e.target.value)}
            rows={4}
            maxLength={4000}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/25 focus:border-white/30"
          />
        </div>
        <ErrorText>{error}</ErrorText>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={close}>
            {t("common.cancel")}
          </Button>
          <Button onClick={save} loading={saving} disabled={!form.title.trim() || (admin && !form.trainee)}>
            {t("common.save")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
