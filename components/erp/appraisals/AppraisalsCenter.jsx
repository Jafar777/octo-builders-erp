"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Lock, Plus, Star, Trash2, Unlock } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { api, errorText } from "@/lib/clientApi";
import Modal from "@/components/erp/ui/Modal";
import { Button, Card, ErrorText, Input, PageHeader, Toggle } from "@/components/erp/ui/fields";
import { useConfirm } from "@/components/erp/ui/Feedback";
import { EmptyState } from "@/components/erp/ui/DataTools";

// Performance reviews: my own (self review, then my manager's), the ones I write for my
// team, and — for appraisals.manage — the cycles and their progress.
export default function AppraisalsCenter() {
  const { t } = useLanguage();
  const confirm = useConfirm();
  const [tab, setTab] = useState("mine");
  const [data, setData] = useState(null);
  const [admin, setAdmin] = useState(false);
  const [teamCount, setTeamCount] = useState(0);
  const [open, setOpen] = useState(null);
  const [newCycle, setNewCycle] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    api(`/api/appraisals?tab=${tab}`)
      .then((d) => {
        setData(d);
        if (d.admin !== undefined) setAdmin(d.admin);
      })
      .catch((err) => setError(errorText(t, err)));
    api("/api/appraisals?tab=team")
      .then((d) => setTeamCount(d.reviews.length))
      .catch(() => {});
  }, [tab, t]);
  useEffect(() => {
    load();
  }, [load]);

  const tabs = ["mine", teamCount > 0 && "team", admin && "cycles"].filter(Boolean);
  return (
    <div>
      <PageHeader
        title={t("erp.nav.appraisals")}
        subtitle={t("erp.appraisals.subtitle")}
        actions={
          admin && (
            <Button onClick={() => setNewCycle(true)}>
              <Plus size={16} /> {t("erp.appraisals.newCycle")}
            </Button>
          )
        }
      />
      <div className="mb-5 flex gap-1 border-b border-white/10">
        {tabs.map((k) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={`-mb-px border-b-2 px-4 py-2.5 text-sm ${tab === k ? "border-brand-orange text-white" : "border-transparent text-white/50 hover:text-white"}`}>
            {t(`erp.appraisals.tab.${k}`)}
            {k === "team" && teamCount > 0 && <span className="ms-1.5 text-xs text-white/60">{teamCount}</span>}
          </button>
        ))}
      </div>
      <ErrorText>{error}</ErrorText>

      {(tab === "mine" || tab === "team") && data?.reviews && (
        <div className="space-y-3">
          {!data.reviews.length && <EmptyState compact text={t("erp.appraisals.none")} />}
          {data.reviews.map((r) => (
            <ReviewCard key={r.id} r={r} mode={tab} onOpen={() => setOpen(r)} />
          ))}
        </div>
      )}

      {tab === "cycles" && data?.cycles && (
        <div className="space-y-3">
          {data.cycles.map((c) => (
            <Card key={c.id}>
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{c.name}</p>
                  <p className="text-xs text-white/60">
                    {c.from} → {c.to}
                    {c.dueDate && ` · ${t("erp.appraisals.due", { date: c.dueDate })}`}
                  </p>
                </div>
                <span className="text-xs text-white/55">{t("erp.appraisals.progress", { self: c.selfDone, done: c.managerDone, total: c.total })}</span>
                <Button
                  variant="ghost"
                  onClick={async () => {
                    await api(`/api/appraisals/cycles/${c.id}`, { method: "PATCH", body: { status: c.status === "open" ? "closed" : "open" } });
                    load();
                  }}
                >
                  {c.status === "open" ? <Lock size={14} /> : <Unlock size={14} />} {t(c.status === "open" ? "erp.appraisals.close" : "erp.appraisals.reopen")}
                </Button>
                <Button
                  variant="danger"
                  aria-label={t("common.delete")}
                  onClick={async () => {
                    if (!(await confirm({ text: t("common.confirmDelete"), kind: "delete" }))) return;
                    await api(`/api/appraisals/cycles/${c.id}`, { method: "DELETE" });
                    load();
                  }}
                >
                  <Trash2 size={14} />
                </Button>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div className="h-full bg-emerald-400" style={{ width: `${c.total ? (c.managerDone / c.total) * 100 : 0}%` }} />
              </div>
              <ul className="mt-3 grid gap-1 text-xs sm:grid-cols-2 lg:grid-cols-3">
                {c.reviews.map((r) => (
                  <li key={r.id}>
                    <button type="button" onClick={() => setOpen(r)} className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-start hover:bg-white/5">
                      <span className="truncate">{r.employeeName}</span>
                      <span className={r.manager.at ? "text-emerald-300" : "text-white/55"}>{r.manager.at ? `★ ${r.manager.overall}` : r.reviewerName}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
          {!data.cycles.length && <EmptyState compact text={t("erp.appraisals.noCycles")} />}
        </div>
      )}

      <Modal open={Boolean(open)} onClose={() => setOpen(null)} title={open ? `${open.employeeName} · ${open.cycle?.name || ""}` : ""} wide>
        {open && (
          <ReviewForm
            key={open.id}
            r={open}
            competencies={data?.competencies || []}
            mode={tab === "mine" ? "self" : "manager"}
            onDone={() => {
              setOpen(null);
              load();
            }}
          />
        )}
      </Modal>
      <Modal open={newCycle} onClose={() => setNewCycle(false)} title={t("erp.appraisals.newCycle")}>
        {newCycle && (
          <CycleForm
            onDone={() => {
              setNewCycle(false);
              setTab("cycles");
              load();
            }}
          />
        )}
      </Modal>
    </div>
  );
}

function ReviewCard({ r, mode, onOpen }) {
  const { t } = useLanguage();
  const waiting = mode === "mine" ? r.cycle?.status === "open" && r.cycle?.selfReview && !r.self.at : r.cycle?.status === "open" && !r.manager.at;
  return (
    <button type="button" onClick={onOpen} className="flex w-full flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-start hover:border-white/25">
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{mode === "mine" ? r.cycle?.name : r.employeeName}</p>
        <p className="text-xs text-white/60">
          {mode === "mine" ? t("erp.appraisals.by", { name: r.reviewerName }) : r.cycle?.name}
          {r.cycle?.dueDate && ` · ${t("erp.appraisals.due", { date: r.cycle.dueDate })}`}
        </p>
      </div>
      {r.manager.at ? (
        <span className="flex items-center gap-1 text-sm text-amber-300">
          <Star size={14} fill="currentColor" /> {r.manager.overall}
        </span>
      ) : null}
      {waiting && <span className="rounded-full bg-brand-orange/20 px-2.5 py-1 text-xs text-brand-orange">{t("erp.appraisals.yourTurn")}</span>}
      {r.cycle?.status === "closed" && <span className="text-xs text-white/60">{t("erp.appraisals.closed")}</span>}
    </button>
  );
}

function Scores({ value, onChange, disabled, competencies }) {
  const { t } = useLanguage();
  return (
    <div className="space-y-2">
      {competencies.map((k) => (
        <div key={k} className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm">
            {t(`erp.appraisals.c.${k}`)}
            <span className="block text-[11px] text-white/60">{t(`erp.appraisals.cHint.${k}`)}</span>
          </span>
          <span className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                disabled={disabled}
                onClick={() => onChange({ ...value, [k]: n })}
                aria-label={`${t(`erp.appraisals.c.${k}`)} ${n}`}
                className={`flex h-8 w-8 items-center justify-center rounded-lg border text-sm ${(value[k] || 0) >= n ? "border-amber-300/60 bg-amber-300/20 text-amber-200" : "border-white/10 text-white/60"} disabled:cursor-default`}
              >
                {n}
              </button>
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}

function ReviewForm({ r, competencies, mode, onDone }) {
  const { t } = useLanguage();
  const open = r.cycle?.status === "open";
  const [self, setSelf] = useState({ scores: r.self.scores || {}, comment: r.self.comment || "" });
  const [mgr, setMgr] = useState({ scores: r.manager.scores || {}, comment: r.manager.comment || "", strengths: r.manager.strengths || "", goals: r.manager.goals || "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function send(body) {
    setBusy(true);
    setError("");
    try {
      await api(`/api/appraisals/${r.id}`, { method: "PATCH", body });
      onDone();
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setBusy(false);
    }
  }
  const area = (label, value, onChange, disabled) => (
    <label className="block text-sm text-white/70">
      {label}
      <textarea rows={3} disabled={disabled} value={value} onChange={(e) => onChange(e.target.value)} className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/30 disabled:opacity-70" />
    </label>
  );
  const selfEditable = mode === "self" && open && r.cycle?.selfReview;
  const mgrEditable = mode === "manager" && open;
  return (
    <div className="space-y-5">
      {(r.cycle?.selfReview || r.self.at) && (
        <section className="space-y-3">
          <p className="font-semibold">{t("erp.appraisals.selfTitle")}</p>
          <Scores value={self.scores} onChange={(scores) => setSelf((s) => ({ ...s, scores }))} disabled={!selfEditable} competencies={competencies} />
          {area(t("erp.appraisals.selfComment"), self.comment, (comment) => setSelf((s) => ({ ...s, comment })), !selfEditable)}
          {selfEditable && (
            <Button onClick={() => send({ self })} loading={busy}>
              {t("erp.appraisals.submitSelf")}
            </Button>
          )}
        </section>
      )}
      {(mode === "manager" || r.manager.at) && (
        <section className="space-y-3 border-t border-white/10 pt-4">
          <p className="font-semibold">{t("erp.appraisals.managerTitle")}</p>
          <Scores value={mgr.scores} onChange={(scores) => setMgr((m) => ({ ...m, scores }))} disabled={!mgrEditable} competencies={competencies} />
          {area(t("erp.appraisals.strengths"), mgr.strengths, (strengths) => setMgr((m) => ({ ...m, strengths })), !mgrEditable)}
          {area(t("erp.appraisals.goals"), mgr.goals, (goals) => setMgr((m) => ({ ...m, goals })), !mgrEditable)}
          {area(t("erp.appraisals.managerComment"), mgr.comment, (comment) => setMgr((m) => ({ ...m, comment })), !mgrEditable)}
          {mgrEditable && (
            <Button onClick={() => send({ manager: mgr })} loading={busy}>
              {t("erp.appraisals.submitManager")}
            </Button>
          )}
        </section>
      )}
      {mode === "self" && r.manager.at && !r.acknowledgedAt && (
        <Button variant="ghost" onClick={() => send({ acknowledge: true })} loading={busy}>
          <CheckCircle2 size={15} /> {t("erp.appraisals.acknowledge")}
        </Button>
      )}
      {r.acknowledgedAt && <p className="text-xs text-emerald-300">{t("erp.appraisals.acknowledged")}</p>}
      <ErrorText>{error}</ErrorText>
    </div>
  );
}

function CycleForm({ onDone }) {
  const { t } = useLanguage();
  const year = new Date().getFullYear();
  const [form, setForm] = useState({ name: `H1 ${year}`, from: `${year}-01-01`, to: `${year}-06-30`, dueDate: "", selfReview: true });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <div className="space-y-4">
      <Input label={t("erp.appraisals.cycleName")} value={form.name} onChange={set("name")} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Input label={t("erp.books.from")} type="date" value={form.from} onChange={set("from")} />
        <Input label={t("erp.books.to")} type="date" value={form.to} onChange={set("to")} />
        <Input label={t("erp.appraisals.dueLabel")} type="date" value={form.dueDate} onChange={set("dueDate")} />
      </div>
      <Toggle checked={form.selfReview} onChange={set("selfReview")} label={t("erp.appraisals.withSelf")} />
      <p className="text-xs text-white/60">{t("erp.appraisals.cycleHint")}</p>
      <ErrorText>{error}</ErrorText>
      <div className="flex justify-end">
        <Button
          loading={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await api("/api/appraisals/cycles", { method: "POST", body: form });
              onDone();
            } catch (err) {
              setError(errorText(t, err));
            } finally {
              setBusy(false);
            }
          }}
        >
          {t("erp.appraisals.open")}
        </Button>
      </div>
    </div>
  );
}
