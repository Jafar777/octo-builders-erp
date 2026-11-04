"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Check, Clock, Plus, X } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { api, errorText } from "@/lib/clientApi";
import { Button, Card, ErrorText, Input } from "@/components/erp/ui/fields";

const chip = "flex items-center gap-1.5 rounded-full px-3 py-1 text-sm";

// Accept / reject one pending skill (general manager).
export function SkillDecision({ userId, name, onDone, onError }) {
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false);
  const decide = async (decision) => {
    setBusy(true);
    try {
      onDone(await api(`/api/hr/employees/${userId}/skills`, { method: "PATCH", body: { name, decision } }));
    } catch (err) {
      onError?.(errorText(t, err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <span className={`${chip} border border-amber-500/30 bg-amber-500/10 py-0.5 pe-1 text-amber-200`}>
      {name}
      <button
        type="button"
        disabled={busy}
        onClick={() => decide("approve")}
        title={t("erp.skills.approve")}
        aria-label={t("erp.skills.approve")}
        className="rounded-full bg-emerald-500/20 p-1 text-emerald-300 hover:bg-emerald-500/40 disabled:opacity-50"
      >
        <Check size={13} />
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => decide("reject")}
        title={t("erp.skills.reject")}
        aria-label={t("erp.skills.reject")}
        className="rounded-full bg-red-500/20 p-1 text-red-300 hover:bg-red-500/40 disabled:opacity-50"
      >
        <X size={13} />
      </button>
    </span>
  );
}

// Pending skills inside an employee's file: buttons for the GM, read-only for HR.
export function PendingSkills({ userId, requests, canApprove, onDone }) {
  const { t } = useLanguage();
  const [error, setError] = useState("");
  const pending = requests.filter((r) => r.status === "pending");
  if (!pending.length) return null;
  return (
    <div className="space-y-2">
      <p className="text-xs text-white/60">{t("erp.skills.pendingTitle")}</p>
      <div className="flex flex-wrap gap-2">
        {pending.map((r) =>
          canApprove ? (
            <SkillDecision key={r.name} userId={userId} name={r.name} onDone={onDone} onError={setError} />
          ) : (
            <span key={r.name} className={`${chip} border border-dashed border-amber-500/40 text-amber-200`}>
              <Clock size={13} /> {r.name}
            </span>
          )
        )}
      </div>
      <ErrorText>{error}</ErrorText>
    </div>
  );
}

// "My skills" for the employee: approved, waiting, and refused skills, and adding new ones.
export function MySkillsCard({ userId, data }) {
  const { t } = useLanguage();
  const [skills, setSkills] = useState(data.profile.skills || []);
  const [requests, setRequests] = useState(data.profile.skillRequests || []);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const apply = (res) => {
    setSkills(res.skills);
    setRequests(res.skillRequests);
  };

  async function add() {
    const name = draft.trim();
    if (!name) return;
    setBusy(true);
    setError("");
    try {
      apply(await api(`/api/hr/employees/${userId}/skills`, { method: "POST", body: { name } }));
      setDraft("");
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(name) {
    try {
      apply(await api(`/api/hr/employees/${userId}/skills?name=${encodeURIComponent(name)}`, { method: "DELETE" }));
    } catch (err) {
      setError(errorText(t, err));
    }
  }

  const empty = skills.length === 0 && requests.length === 0;

  return (
    <Card className="space-y-4 lg:col-span-2">
      <div>
        <p className="font-semibold">{t("erp.staffFile.skills")}</p>
        <p className="mt-0.5 text-xs text-white/60">{t("erp.skills.myHint")}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {skills.map((s) => (
          <span key={s} className={`${chip} bg-brand-orange/15 text-brand-orange`}>
            <Check size={13} /> {s}
          </span>
        ))}
        {requests.map((r) => (
          <span
            key={r.name}
            className={`${chip} border border-dashed ${r.status === "pending" ? "border-amber-500/40 text-amber-200" : "border-red-500/40 text-red-300 line-through decoration-red-300/50"}`}
            title={t(r.status === "pending" ? "erp.skills.pending" : "erp.skills.rejected")}
          >
            {r.status === "pending" && <Clock size={13} />}
            {r.name}
            <span className="text-[11px] no-underline opacity-80">· {t(r.status === "pending" ? "erp.skills.pending" : "erp.skills.rejected")}</span>
            <button type="button" onClick={() => remove(r.name)} aria-label={t("common.delete")} className="hover:text-white">
              <X size={13} />
            </button>
          </span>
        ))}
        {empty && <p className="text-sm text-white/60">{t("erp.staffFile.noSkills")}</p>}
      </div>
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Input
            label={t("erp.staffFile.addSkill")}
            value={draft}
            onChange={setDraft}
            placeholder="AutoCAD, 3ds Max, Revit…"
            maxLength={40}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
          />
        </div>
        <Button variant="ghost" onClick={add} loading={busy} disabled={!draft.trim()}>
          <Plus size={15} /> {t("erp.skills.request")}
        </Button>
      </div>
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}

// Staff page: every skill waiting for the general manager, in one place.
export function SkillRequestsPanel({ onDecided }) {
  const { t } = useLanguage();
  const [people, setPeople] = useState([]);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    api("/api/hr/skill-requests")
      .then((d) => setPeople(d.people))
      .catch(() => {});
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  if (!people.length) return null;
  const total = people.reduce((n, p) => n + p.pending.length, 0);

  return (
    <Card className="mb-6 space-y-3 border-amber-500/30 bg-amber-500/[0.04]">
      <p className="flex items-center gap-2 font-semibold">
        <Clock size={16} className="text-amber-300" /> {t("erp.skills.panelTitle", { count: total })}
      </p>
      {people.map((p) => (
        <div key={p.id} className="flex flex-wrap items-center gap-2 border-t border-white/5 pt-3">
          <Link href={`/dashboard/staff?person=${p.id}`} className="me-2 min-w-[140px] text-sm font-medium hover:text-brand-orange">
            {p.name}
          </Link>
          {p.pending.map((name) => (
            <SkillDecision
              key={name}
              userId={p.id}
              name={name}
              onError={setError}
              onDone={() => {
                setPeople((list) =>
                  list.map((x) => (x.id === p.id ? { ...x, pending: x.pending.filter((n) => n !== name) } : x)).filter((x) => x.pending.length)
                );
                onDecided?.(p.id);
              }}
            />
          ))}
        </div>
      ))}
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}
