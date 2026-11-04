"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Plus, Star, UserCheck } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { api, errorText } from "@/lib/clientApi";
import Modal from "@/components/erp/ui/Modal";
import { Button, Card, ErrorText, Input, PageHeader, Select } from "@/components/erp/ui/fields";
import { useTaskLookups } from "@/components/erp/tasks/useTaskLookups";
import { useConfirm } from "@/components/erp/ui/Feedback";

const STAGES = ["applied", "screening", "interview", "offer", "hired", "rejected"];

// Hiring: openings, candidates through the stages, interviews, and the hire — which
// creates their account (they sign in with their email) and an onboarding checklist as
// tasks for the people who prepare their first day.
export default function RecruitmentCenter() {
  const { t, lang } = useLanguage();
  const lookups = useTaskLookups();
  const [data, setData] = useState(null);
  const [opening, setOpening] = useState("");
  const [openingForm, setOpeningForm] = useState(false);
  const [candidate, setCandidate] = useState(null); // candidate or "new"
  const [error, setError] = useState("");

  const load = useCallback(() => {
    api("/api/recruitment/openings")
      .then((d) => {
        setData(d);
        setOpening((o) => o || d.openings.find((x) => x.status === "open")?.id || d.openings[0]?.id || "");
      })
      .catch((err) => setError(errorText(t, err)));
  }, [t]);
  useEffect(() => {
    load();
  }, [load]);

  const current = data?.openings.find((o) => o.id === opening);
  const candidates = (data?.candidates || []).filter((c) => c.opening === opening);
  const dept = (id) => lookups.departments.find((d) => d.id === id)?.name?.[lang] || "";

  return (
    <div>
      <PageHeader
        title={t("erp.nav.recruitment")}
        subtitle={t("erp.recruitment.subtitle")}
        actions={
          <Button onClick={() => setOpeningForm(true)}>
            <Plus size={16} /> {t("erp.recruitment.newOpening")}
          </Button>
        }
      />
      <ErrorText>{error}</ErrorText>
      {data && (
        <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
          <ul className="space-y-1">
            {data.openings.map((o) => (
              <li key={o.id}>
                <button type="button" onClick={() => setOpening(o.id)} className={`w-full rounded-xl px-3 py-2.5 text-start ${o.id === opening ? "bg-brand-orange/15 ring-1 ring-brand-orange/50" : "hover:bg-white/5"}`}>
                  <span className="block text-sm font-medium">{o.title}</span>
                  <span className="text-[11px] text-white/60">
                    {dept(o.department)} · {t(`erp.recruitment.status.${o.status}`)} · {data.candidates.filter((c) => c.opening === o.id).length}
                  </span>
                </button>
              </li>
            ))}
            {!data.openings.length && <li className="px-3 text-sm text-white/60">{t("erp.recruitment.noOpenings")}</li>}
          </ul>

          {current && (
            <div className="space-y-4">
              <Card>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold">{current.title}</p>
                    <p className="text-xs text-white/60">
                      {dept(current.department)} · {t("erp.recruitment.positions", { n: current.positions })}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <div className="w-36">
                      <Select
                        value={current.status}
                        onChange={async (status) => {
                          await api(`/api/recruitment/openings/${current.id}`, { method: "PATCH", body: { status } });
                          load();
                        }}
                        options={["open", "on_hold", "closed"].map((s) => ({ value: s, label: t(`erp.recruitment.status.${s}`) }))}
                      />
                    </div>
                    <Button onClick={() => setCandidate("new")}>
                      <Plus size={15} /> {t("erp.recruitment.addCandidate")}
                    </Button>
                  </div>
                </div>
                {current.description && <p className="mt-3 whitespace-pre-wrap text-sm text-white/65">{current.description}</p>}
              </Card>
              <div className="grid gap-3 overflow-x-auto md:grid-cols-3 xl:grid-cols-6">
                {STAGES.map((s) => (
                  <div key={s} className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.02] p-2">
                    <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-white/60">
                      {t(`erp.recruitment.stage.${s}`)} · {candidates.filter((c) => c.stage === s).length}
                    </p>
                    <div className="space-y-2">
                      {candidates
                        .filter((c) => c.stage === s)
                        .map((c) => (
                          <button key={c.id} type="button" onClick={() => setCandidate(c)} className="w-full rounded-xl border border-white/10 bg-brand-navy p-2.5 text-start hover:border-white/30">
                            <p className="truncate text-sm">{c.name}</p>
                            {c.rating > 0 && (
                              <p className="mt-0.5 flex items-center gap-0.5 text-[11px] text-amber-300">
                                {Array.from({ length: c.rating }, (_, i) => (
                                  <Star key={i} size={10} fill="currentColor" />
                                ))}
                              </p>
                            )}
                          </button>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <Modal open={openingForm} onClose={() => setOpeningForm(false)} title={t("erp.recruitment.newOpening")}>
        {openingForm && (
          <OpeningForm
            lookups={lookups}
            onDone={(id) => {
              setOpeningForm(false);
              if (id) setOpening(id);
              load();
            }}
          />
        )}
      </Modal>
      <Modal open={Boolean(candidate)} onClose={() => setCandidate(null)} title={candidate === "new" ? t("erp.recruitment.addCandidate") : candidate?.name || ""} wide>
        {candidate && (
          <CandidateForm
            key={candidate === "new" ? "new" : candidate.id}
            candidate={candidate === "new" ? null : candidate}
            openingId={opening}
            lookups={lookups}
            onDone={() => {
              setCandidate(null);
              load();
            }}
          />
        )}
      </Modal>
    </div>
  );
}

function OpeningForm({ lookups, onDone }) {
  const { t, lang } = useLanguage();
  const [form, setForm] = useState({ title: "", department: "", positions: 1, description: "" });
  const [error, setError] = useState("");
  return (
    <div className="space-y-4">
      <Input label={t("erp.recruitment.title")} value={form.title} onChange={(v) => setForm((f) => ({ ...f, title: v }))} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Select label={t("erp.sales.department")} value={form.department} onChange={(v) => setForm((f) => ({ ...f, department: v }))} placeholder="—" options={lookups.departments.map((d) => ({ value: d.id, label: d.name?.[lang] }))} />
        <Input label={t("erp.recruitment.positionsLabel")} type="number" value={form.positions} onChange={(v) => setForm((f) => ({ ...f, positions: v }))} />
      </div>
      <label className="block text-sm text-white/70">
        {t("erp.recruitment.description")}
        <textarea rows={4} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none" />
      </label>
      <ErrorText>{error}</ErrorText>
      <div className="flex justify-end">
        <Button
          disabled={!form.title}
          onClick={async () => {
            try {
              const res = await api("/api/recruitment/openings", { method: "POST", body: form });
              onDone(res.id);
            } catch (err) {
              setError(errorText(t, err));
            }
          }}
        >
          {t("common.save")}
        </Button>
      </div>
    </div>
  );
}

function CandidateForm({ candidate, openingId, lookups, onDone }) {
  const { t, lang } = useLanguage();
  const confirm = useConfirm();
  const [form, setForm] = useState({
    name: candidate?.name || "",
    email: candidate?.email || "",
    phone: candidate?.phone || "",
    cvUrl: candidate?.cvUrl || "",
    portfolioUrl: candidate?.portfolioUrl || "",
    source: candidate?.source || "",
    stage: candidate?.stage || "applied",
    rating: candidate?.rating || 0,
    rejectReason: candidate?.rejectReason || "",
  });
  const [note, setNote] = useState("");
  const [interview, setInterview] = useState({ date: "", note: "", rating: 0 });
  const [hiring, setHiring] = useState(false);
  const [hire, setHire] = useState({ startDate: "", onboarding: [] });
  const [error, setError] = useState("");
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const hired = candidate?.stage === "hired";


  async function save(extra = {}) {
    setError("");
    try {
      if (candidate) await api(`/api/recruitment/candidates/${candidate.id}`, { method: "PATCH", body: { ...form, note, ...extra } });
      else await api("/api/recruitment/candidates", { method: "POST", body: { ...form, opening: openingId } });
      onDone();
    } catch (err) {
      setError(errorText(t, err));
    }
  }

  const link = (url, label) =>
    url && (
      <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-brand-orange hover:underline">
        {label} <ExternalLink size={12} />
      </a>
    );

  return (
    <div className="space-y-4">
      <fieldset disabled={hired} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label={t("erp.sales.name")} value={form.name} onChange={set("name")} />
          <Input label={t("erp.sales.email")} value={form.email} onChange={set("email")} dir="ltr" />
          <Input label={t("erp.sales.phone")} value={form.phone} onChange={set("phone")} dir="ltr" />
          <Input label={t("erp.sales.source")} value={form.source} onChange={set("source")} />
          <Input label={t("erp.recruitment.cv")} value={form.cvUrl} onChange={set("cvUrl")} dir="ltr" placeholder="https://" />
          <Input label={t("erp.recruitment.portfolio")} value={form.portfolioUrl} onChange={set("portfolioUrl")} dir="ltr" placeholder="https://" />
          {candidate && <Select label={t("erp.sales.stageLabel")} value={form.stage} onChange={set("stage")} options={STAGES.filter((s) => s !== "hired").map((s) => ({ value: s, label: t(`erp.recruitment.stage.${s}`) }))} />}
          {candidate && <Select label={t("erp.recruitment.rating")} value={String(form.rating)} onChange={(v) => set("rating")(Number(v))} options={[0, 1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: n ? "★".repeat(n) : "—" }))} />}
        </div>
        <div className="flex flex-wrap gap-4">
          {link(candidate?.cvUrl, t("erp.recruitment.cv"))}
          {link(candidate?.portfolioUrl, t("erp.recruitment.portfolio"))}
        </div>
        {form.stage === "rejected" && <Input label={t("erp.recruitment.rejectReason")} value={form.rejectReason} onChange={set("rejectReason")} />}
      </fieldset>

      {candidate && (
        <>
          <div className="space-y-2">
            <p className="text-sm font-medium text-white/70">{t("erp.recruitment.interviews")}</p>
            {candidate.interviews.map((i, k) => (
              <p key={k} className="rounded-xl bg-white/5 px-3 py-2 text-sm">
                {i.date} · {i.with.join(", ")} {i.rating ? `· ${"★".repeat(i.rating)}` : ""}
                {i.note && <span className="block text-xs text-white/55">{i.note}</span>}
              </p>
            ))}
            {!hired && (
              <div className="grid gap-2 sm:grid-cols-[150px_minmax(0,1fr)_110px_auto]">
                <Input type="date" value={interview.date} onChange={(v) => setInterview((x) => ({ ...x, date: v }))} aria-label={t("erp.recruitment.interviewDate")} />
                <Input value={interview.note} onChange={(v) => setInterview((x) => ({ ...x, note: v }))} placeholder={t("erp.recruitment.interviewNote")} />
                <Select value={String(interview.rating)} onChange={(v) => setInterview((x) => ({ ...x, rating: Number(v) }))} options={[0, 1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: n ? "★".repeat(n) : "—" }))} />
                <Button variant="ghost" disabled={!interview.date} onClick={() => save({ interview })}>
                  {t("erp.recruitment.addInterview")}
                </Button>
              </div>
            )}
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium text-white/70">{t("erp.sales.notes")}</p>
            {candidate.notes.map((n, i) => (
              <p key={i} className="rounded-xl bg-white/5 px-3 py-2 text-sm">
                {n.text}
                <span className="block text-[11px] text-white/55">{n.by}</span>
              </p>
            ))}
            {!hired && <Input value={note} onChange={setNote} placeholder={t("erp.sales.addNote")} />}
          </div>
        </>
      )}

      {hired && (
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-3 text-sm">
          <p className="font-semibold text-emerald-300">{t("erp.recruitment.hiredOn", { date: candidate.startDate })}</p>
          <ul className="mt-2 space-y-1 text-xs text-white/60">
            {candidate.onboarding.map((o, i) => (
              <li key={i}>
                {o.title} → {o.assignee}
              </li>
            ))}
          </ul>
        </div>
      )}

      {hiring && !hired && (
        <div className="space-y-3 rounded-2xl border border-white/10 p-4">
          <p className="text-sm font-semibold">{t("erp.recruitment.hireTitle")}</p>
          <Input label={t("erp.recruitment.startDate")} type="date" value={hire.startDate} onChange={(v) => setHire((h) => ({ ...h, startDate: v }))} />
          <p className="text-xs text-white/60">{t("erp.recruitment.onboardingHint")}</p>
          {hire.onboarding.map((o, i) => (
            <div key={i} className="grid grid-cols-[minmax(0,1fr)_200px] gap-2">
              <Input value={o.title} onChange={(v) => setHire((h) => ({ ...h, onboarding: h.onboarding.map((x, j) => (j === i ? { ...x, title: v } : x)) }))} aria-label={t("erp.recruitment.onboardingTask")} />
              <Select value={o.assignee} onChange={(v) => setHire((h) => ({ ...h, onboarding: h.onboarding.map((x, j) => (j === i ? { ...x, assignee: v } : x)) }))} placeholder="—" options={lookups.people.map((p) => ({ value: p.id, label: p.name }))} />
            </div>
          ))}
          <button type="button" onClick={() => setHire((h) => ({ ...h, onboarding: [...h.onboarding, { title: "", assignee: "" }] }))} className="text-xs text-brand-orange hover:underline">
            + {t("erp.recruitment.addOnboarding")}
          </button>
          <div className="flex justify-end">
            <Button disabled={!hire.startDate || !form.email} onClick={() => save({ hire })}>
              <UserCheck size={15} /> {t("erp.recruitment.confirmHire")}
            </Button>
          </div>
        </div>
      )}

      <ErrorText>{error}</ErrorText>
      {!hired && (
        <div className="flex flex-wrap justify-between gap-2">
          <div className="flex gap-2">
            {candidate && (
              <Button
                variant="danger"
                onClick={async () => {
                  if (!(await confirm({ text: t("common.confirmDelete"), kind: "delete" }))) return;
                  await api(`/api/recruitment/candidates/${candidate.id}`, { method: "DELETE" }).catch(() => {});
                  onDone();
                }}
              >
                {t("common.delete")}
              </Button>
            )}
            {candidate && !hiring && ["interview", "offer"].includes(candidate.stage) && (
              <Button
                variant="ghost"
                onClick={() => {
                  // A first-day checklist to start from; each item goes to someone.
                  setHire((h) => ({ ...h, onboarding: h.onboarding.length ? h.onboarding : ["computer", "accounts", "contract", "welcome"].map((k) => ({ title: t(`erp.recruitment.onboardingItem.${k}`), assignee: "" })) }));
                  setHiring(true);
                }}
              >
                <UserCheck size={15} /> {t("erp.recruitment.hire")}
              </Button>
            )}
          </div>
          <Button onClick={() => save()} disabled={!form.name}>
            {t("common.save")}
          </Button>
        </div>
      )}
    </div>
  );
}
