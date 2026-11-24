"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Play, Send } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { api, errorText } from "@/lib/clientApi";
import { formatDateTime } from "@/lib/formatTime";
import { Button, ErrorText, Input, Select } from "@/components/erp/ui/fields";
import { SkeletonList } from "@/components/erp/ui/Loading";
import { AGAIN_REASONS } from "@/lib/hybrid";

const START = ["new", "again", "rejected"]; // a task is made and started
const MINE = ["resume", "planned", "redo"]; // theirs already: that one starts
const ASK = ["taken", "stage", "fixed", "client"]; // someone decides

// "Start work": project → stage → room / drawing. The system says what's already there
// and what starting means, before anything is started (lib/hybridServer.js).
export default function StartWork({ lookups, onStarted, onOpenTask, onClose }) {
  const { t, lang } = useLanguage();
  const [projects, setProjects] = useState(null);
  const [form, setForm] = useState({ projectId: "", stage: "", title: "", other: "", type: "", hours: "", reason: "", hoursReason: "", again: "" });
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState("");
  const seq = useRef(0);
  const set = (patch) => {
    setSent("");
    setForm((f) => ({ ...f, ...patch }));
  };

  useEffect(() => {
    api("/api/tasks/self-start")
      .then((d) => setProjects(d.projects))
      .catch((err) => setError(errorText(t, err)));
  }, [t]);

  const project = projects?.find((p) => p.id === form.projectId);
  const stage = project?.stages.find((s) => s.key === form.stage);
  const title = form.title === "+" ? form.other.trim() : form.title;
  const picked = Boolean(stage && (form.title !== "+" || form.other.trim()));
  const ask = { projectId: form.projectId, stage: form.stage, title, type: form.type, hours: form.hours, reason: form.reason, again: form.again };
  const asked = JSON.stringify({ ...ask, reason: Boolean(form.reason.trim()) });

  // What's there, read again whenever the choice changes.
  useEffect(() => {
    if (!picked) return undefined;
    const mine = ++seq.current;
    const timer = setTimeout(() => {
      api("/api/tasks/self-start", { method: "POST", body: { mode: "check", ...JSON.parse(asked), reason: JSON.parse(asked).reason ? "-" : "" }, quiet: true })
        .then((d) => {
          if (mine !== seq.current) return;
          setInfo(d);
          setError("");
        })
        .catch((err) => {
          if (mine !== seq.current) return;
          setInfo(null);
          setError(errorText(t, err));
        });
    }, 350);
    return () => clearTimeout(timer);
  }, [asked, picked, t]);

  async function send(mode, extra = {}) {
    setBusy(mode);
    setError("");
    try {
      const d = await api("/api/tasks/self-start", { method: "POST", body: { mode, ...ask, hoursReason: form.hoursReason, ...extra } });
      if (mode === "start") onStarted(d.task);
      else setSent(mode);
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setBusy("");
    }
  }
  async function startMine() {
    setBusy("start");
    setError("");
    try {
      const { task } = await api(`/api/tasks/${info.task.id}/action`, { method: "POST", body: { action: info.outcome === "resume" ? "resume" : "start" } });
      onStarted(task);
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setBusy("");
    }
  }

  if (!projects) return error ? <ErrorText>{error}</ErrorText> : <SkeletonList rows={4} />;
  const shown = picked ? info : null;
  const box = (tone, children) => <div className={`space-y-2 rounded-2xl border p-4 text-sm ${tone === "amber" ? "border-amber-400/30 bg-amber-400/10 text-amber-100" : tone === "green" ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-100" : "border-white/10 bg-white/[0.03]"}`}>{children}</div>;
  const list = (rows) => rows.map((x) => `⁦#${x.number}⁩ ⁨${x.title}⁩`).join(" · "); // (isolated: numbers and English titles don't scramble Arabic)
  const running = shown?.outcome === "resume" && shown.task.status === "in_progress";

  return (
    <div className="space-y-4">
      <p className="text-sm text-white/60">{t("erp.startWork.hint")}</p>
      {!projects.length && box("amber", <p>{t("erp.startWork.noProjects")}</p>)}
      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          label={t("erp.tasks.project")}
          value={form.projectId}
          onChange={(projectId) => set({ projectId, stage: "", title: "", other: "", type: "", again: "", reason: "", hours: "" })}
          placeholder="—"
          options={projects.map((p) => ({ value: p.id, label: `${p.code ? `${p.code} · ` : ""}${p.name?.[lang] || p.name?.ar}` }))}
        />
        <Select
          label={t("erp.tasks.stage")}
          value={form.stage}
          onChange={(key) => set({ stage: key, title: "", other: "", type: "", again: "", reason: "", hours: "" })}
          placeholder="—"
          options={(project?.stages || []).map((s) => ({ value: s.key, label: s.name?.[lang] || s.name?.ar }))}
        />
        {stage && (
          <Select
            label={t("erp.startWork.place")}
            value={form.title}
            onChange={(v) => set({ title: v, again: "", reason: "" })}
            placeholder={t("erp.startWork.wholeStage")}
            options={[...stage.titles.map((x) => ({ value: x, label: x })), { value: "+", label: t("erp.startWork.newPlace") }]}
          />
        )}
        {stage && form.title === "+" && <Input label={t("erp.startWork.newPlaceName")} value={form.other} onChange={(other) => set({ other })} />}
        {stage && (
          <Select
            label={t("erp.tasks.type")}
            value={form.type || stage.taskType || ""}
            onChange={(type) => set({ type })}
            options={(lookups.settings.taskTypes || []).filter((x) => x.key !== "meeting").map((x) => ({ value: x.key, label: x.name?.[lang] }))}
          />
        )}
      </div>

      {shown && (
        <>
          {MINE.includes(shown.outcome) && box("green", <p>{t(running ? "erp.startWork.out.running" : `erp.startWork.out.${shown.outcome}`, { n: shown.task.number })}</p>)}
          {["working", "taken", "review", "redo_first"].includes(shown.outcome) && box("amber", <p>{t(`erp.startWork.out.${shown.outcome}`, { n: shown.task.number, who: shown.task.assignee })}</p>)}
          {shown.outcome === "stage" && box("amber", <p>{t("erp.startWork.out.stage")}</p>)}
          {shown.outcome === "client" && box("amber", <p>{t("erp.startWork.out.client")}</p>)}
          {shown.outcome === "fixed" && box("amber", <p>{t("erp.startWork.out.fixed", { list: list(shown.fixed) })}</p>)}
          {shown.outcome === "rejected" && box("", <p>{t("erp.startWork.out.rejected", { n: shown.task.number })}</p>)}

          {["again", "client"].includes(shown.outcome) && (
            <Select label={t("erp.startWork.again", { n: shown.task.number })} value={form.again} onChange={(again) => set({ again })} placeholder="—" options={AGAIN_REASONS.map((k) => ({ value: k, label: t(`erp.startWork.againWhy.${k}`) }))} />
          )}

          {START.includes(shown.outcome) && shown.needs !== "again" && (
            <div className="space-y-3">
              <div className="grid items-end gap-4 sm:grid-cols-2">
                <Input type="number" min="0.5" max="200" step="0.5" dir="ltr" label={t("erp.startWork.hours", { h: shown.suggested })} value={form.hours} onChange={(hours) => set({ hours })} placeholder={String(shown.suggested)} />
                <p className="pb-3 text-sm text-white/60">{shown.end && t("erp.startWork.due", { at: formatDateTime(shown.end, lang) })}</p>
              </div>
              {shown.pending && (
                <>
                  {box("amber", <p>{t("erp.startWork.overLimit", { h: shown.hours, want: shown.pending })}</p>)}
                  <Input label={t("erp.startWork.hoursReason")} value={form.hoursReason} onChange={(hoursReason) => set({ hoursReason })} />
                </>
              )}
              {shown.running && box("", <p>{t("erp.startWork.pauses", { n: shown.running.number, title: shown.running.title })}</p>)}
              {shown.pushes.length > 0 && (
                <>
                  {box(
                    "amber",
                    <p className="flex items-start gap-2">
                      <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {t("erp.startWork.pushes", { list: list(shown.pushes) })}
                    </p>
                  )}
                  <Input label={t("erp.startWork.why")} value={form.reason} onChange={(reason) => set({ reason })} />
                </>
              )}
            </div>
          )}
          {ASK.includes(shown.outcome) && !sent && <Input label={t("erp.startWork.why")} value={form.reason} onChange={(reason) => set({ reason })} />}
        </>
      )}

      {sent && box("green", <p>{t(sent === "help" ? "erp.startWork.helpSent" : "erp.startWork.sent")}</p>)}
      <ErrorText>{error}</ErrorText>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          {t(sent ? "common.close" : "common.cancel")}
        </Button>
        {shown?.task && !START.includes(shown.outcome) && (
          <Button variant="ghost" onClick={() => onOpenTask(shown.task.id)}>
            {t("erp.projects.openTask")}
          </Button>
        )}
        {shown?.outcome === "working" && !sent && (
          <Button onClick={() => send("help", { taskId: shown.task.id })} loading={busy === "help"} disabled={Boolean(busy)}>
            {t("erp.startWork.offerHelp")}
          </Button>
        )}
        {shown && ASK.includes(shown.outcome) && !sent && (
          <Button onClick={() => send("ask")} loading={busy === "ask"} disabled={Boolean(busy) || !form.reason.trim()}>
            <Send size={16} /> {t("erp.startWork.ask")}
          </Button>
        )}
        {shown && MINE.includes(shown.outcome) && !running && (
          <Button onClick={startMine} loading={busy === "start"} disabled={Boolean(busy)}>
            <Play size={16} /> {t("erp.startWork.start")}
          </Button>
        )}
        {shown && START.includes(shown.outcome) && (
          <Button onClick={() => send("start")} loading={busy === "start"} disabled={Boolean(busy) || shown.needs === "again" || (shown.pushes.length > 0 && !form.reason.trim())}>
            <Play size={16} /> {t("erp.startWork.start")}
          </Button>
        )}
      </div>
    </div>
  );
}
