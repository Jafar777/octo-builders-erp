"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, Check, ChevronDown, Link2, Merge, Pencil, Unlink } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { api, errorText } from "@/lib/clientApi";
import { formatDate } from "@/lib/formatTime";
import Avatar from "@/components/erp/ui/Avatar";
import Modal from "@/components/erp/ui/Modal";
import { Button, ErrorText, Input, Label, Select } from "@/components/erp/ui/fields";
import { useConfirm, useToast } from "@/components/erp/ui/Feedback";
import { Skeleton } from "@/components/erp/ui/Loading";

// YYYY-MM-DD in local time.
const localDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const dayFromNow = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return localDay(d);
};
const toDay = (iso) => (iso ? localDay(new Date(iso)) : "");
// The end of the chosen day, local time.
const endOfDay = (day) => (day ? new Date(`${day}T23:59:59`).toISOString() : null);

// Department chips joined by a link: "● Design ⛓ ● Engineering".
function DeptChain({ ids, byId, lang }) {
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {ids.map((id, i) => {
        const d = byId[id];
        return (
          <span key={id} className="flex items-center gap-1.5">
            {i > 0 && <Link2 size={13} className="text-white/40" />}
            <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm font-medium" style={{ borderColor: `${d?.color || "#ffffff"}55`, background: `${d?.color || "#ffffff"}14` }}>
              <span className="h-2 w-2 rounded-full" style={{ background: d?.color || "#fff" }} />
              {d?.name?.[lang] || "—"}
            </span>
          </span>
        );
      })}
    </span>
  );
}

function MergeEditor({ merge, departments, merges, managers, onSaved, onClose }) {
  const { t, lang } = useLanguage();
  const editing = Boolean(merge);
  const [picked, setPicked] = useState(merge?.departments || []);
  const [managerId, setManagerId] = useState(merge?.manager || "");
  const [endsDay, setEndsDay] = useState(merge ? toDay(merge.endsAt) : dayFromNow(14));
  const [note, setNote] = useState(merge?.note || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const byId = useMemo(() => Object.fromEntries(departments.map((d) => [d.id, d])), [departments]);
  // Departments in another live merge can't join this one.
  const busy = useMemo(() => {
    const set = new Set();
    for (const m of merges) if (m.status === "active" && m.id !== merge?.id) m.departments.forEach((d) => set.add(d));
    return set;
  }, [merges, merge]);

  // Managers from the picked departments first: those are the natural choice.
  const relevant = (m) => [m.department, ...m.managedDepartments].some((d) => picked.includes(d));
  const nearby = managers.filter(relevant);
  const others = managers.filter((m) => !relevant(m));
  const managerLabel = (m) => {
    const d = byId[m.department]?.name?.[lang];
    return d ? `${m.name} — ${d}` : m.name;
  };
  const options = [
    ...nearby.map((m) => ({ value: m.id, label: managerLabel(m) })),
    ...(nearby.length && others.length ? [{ value: "__sep", label: `── ${t("erp.org.merge.others")} ──` }] : []),
    ...others.map((m) => ({ value: m.id, label: managerLabel(m) })),
  ];

  function toggle(id) {
    const next = picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id];
    setPicked(next);
    // One head among the picked departments: pick them for the CEO.
    if (!managerId) {
      const heads = managers.filter((m) => next.includes(m.department));
      if (heads.length === 1) setManagerId(heads[0].id);
    }
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const body = { managerId, endsAt: endOfDay(endsDay), note };
      const { merge: saved } = editing
        ? await api(`/api/org/merges/${merge.id}`, { method: "PATCH", body })
        : await api("/api/org/merges", { method: "POST", body: { ...body, departments: picked } });
      onSaved(saved);
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setSaving(false);
    }
  }

  const manager = managers.find((m) => m.id === managerId);
  const names = picked.map((id) => byId[id]?.name?.[lang]).filter(Boolean).join(" + ");
  const ready = picked.length >= 2 && manager;
  const quick = [
    [7, "week"],
    [14, "twoWeeks"],
    [30, "month"],
  ];

  return (
    <div className="space-y-5">
      {/* 1. Departments */}
      <div>
        <Label>{t("erp.org.merge.departments")}</Label>
        {editing ? (
          <DeptChain ids={picked} byId={byId} lang={lang} />
        ) : (
          <>
            <div className="grid gap-2 sm:grid-cols-2">
              {departments
                .filter((d) => d.active !== false)
                .map((d) => {
                  const on = picked.includes(d.id);
                  const locked = busy.has(d.id);
                  return (
                    <button
                      key={d.id}
                      type="button"
                      disabled={locked}
                      onClick={() => toggle(d.id)}
                      aria-pressed={on}
                      className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-start text-sm transition disabled:cursor-not-allowed disabled:opacity-40 ${
                        on ? "border-brand-orange/60 bg-brand-orange/10" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
                      }`}
                    >
                      <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: d.color }} />
                      <span className="min-w-0 flex-1 truncate">{d.name?.[lang]}</span>
                      {locked ? (
                        <span className="text-[11px] text-white/50">{t("erp.org.merge.busy")}</span>
                      ) : (
                        <span className={`flex h-5 w-5 items-center justify-center rounded-md border ${on ? "border-brand-orange bg-brand-orange text-white" : "border-white/20"}`}>
                          {on && <Check size={13} />}
                        </span>
                      )}
                    </button>
                  );
                })}
            </div>
            {picked.length < 2 && <p className="mt-1.5 text-xs text-white/50">{t("erp.org.merge.pickDepartments")}</p>}
          </>
        )}
      </div>

      {/* 2. Manager */}
      {managers.length ? (
        <div>
          <Select
            label={t("erp.org.merge.manager")}
            value={managerId}
            onChange={(v) => v !== "__sep" && setManagerId(v)}
            placeholder={t("erp.org.merge.pickManager")}
            options={options}
          />
          {manager && (
            <div className="mt-2 flex items-center gap-2 text-sm text-white/70">
              <Avatar name={manager.name} src={manager.avatarUrl} size={26} />
              {manager.name}
            </div>
          )}
        </div>
      ) : (
        <ErrorText>{t("erp.org.merge.noManagers")}</ErrorText>
      )}

      {/* 3. How long */}
      <div>
        <Label>{t("erp.org.merge.endsAt")}</Label>
        <div className="flex flex-wrap items-center gap-2">
          {quick.map(([days, key]) => (
            <button
              key={key}
              type="button"
              onClick={() => setEndsDay(dayFromNow(days))}
              className={`rounded-full border px-3 py-1.5 text-xs ${endsDay === dayFromNow(days) ? "border-brand-orange/60 bg-brand-orange/10 text-white" : "border-white/10 text-white/60 hover:text-white"}`}
            >
              {t(`erp.org.merge.${key}`)}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setEndsDay("")}
            className={`rounded-full border px-3 py-1.5 text-xs ${!endsDay ? "border-brand-orange/60 bg-brand-orange/10 text-white" : "border-white/10 text-white/60 hover:text-white"}`}
          >
            {t("erp.org.merge.noEnd")}
          </button>
          <div className="w-44">
            <Input type="date" value={endsDay} onChange={setEndsDay} min={dayFromNow(0)} dir="ltr" />
          </div>
        </div>
      </div>

      <Input label={t("erp.org.merge.note")} value={note} onChange={setNote} placeholder={t("erp.org.merge.notePlaceholder")} maxLength={300} />

      {/* What will happen, in plain words */}
      {ready && (
        <div className="rounded-xl border border-brand-orange/25 bg-brand-orange/[0.06] p-4 text-sm">
          <p className="mb-2 flex items-center gap-2 font-semibold">
            <Merge size={15} className="text-brand-orange" /> {t("erp.org.merge.preview")}
          </p>
          <ul className="list-disc space-y-1 ps-5 text-white/75">
            <li>{t("erp.org.merge.previewManager", { name: manager.name, departments: names })}</li>
            <li>{t("erp.org.merge.previewWork", { departments: names })}</li>
            <li>{t("erp.org.merge.previewHeads")}</li>
            <li>{endsDay ? t("erp.org.merge.previewEnd", { date: formatDate(endOfDay(endsDay), lang) }) : t("erp.org.merge.previewManual")}</li>
          </ul>
        </div>
      )}

      <ErrorText>{error}</ErrorText>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button onClick={save} loading={saving} disabled={!ready}>
          <Merge size={16} />
          {editing ? t("common.save") : t("erp.org.merge.start")}
        </Button>
      </div>
    </div>
  );
}

// Departments tab: the live merges on top, with a button to start one.
// `onChange(merges)` lets the list below mark merged departments.
export default function DepartmentMerges({ departments, onChange }) {
  const { t, lang } = useLanguage();
  const confirm = useConfirm();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [editing, setEditing] = useState(null); // merge, or "new"
  const [showPast, setShowPast] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const next = await api("/api/org/merges");
      setData(next);
      onChange?.(next.merges.filter((m) => m.status === "active"));
    } catch (err) {
      setError(errorText(t, err));
    }
  }, [t, onChange]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const byId = useMemo(() => Object.fromEntries(departments.map((d) => [d.id, d])), [departments]);
  const managerOf = (id) => data?.managers.find((m) => m.id === id);
  const deptNames = (m) => m.departments.map((id) => byId[id]?.name?.[lang]).filter(Boolean).join(" + ");

  async function end(merge) {
    if (!(await confirm({ text: t("erp.org.merge.confirmEnd", { departments: deptNames(merge) }), kind: "delete" }))) return;
    try {
      await api(`/api/org/merges/${merge.id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      toast({ text: errorText(t, err), tone: "error" });
    }
  }

  if (!data) return error ? <ErrorText>{error}</ErrorText> : <Skeleton className="mb-4 h-20 w-full rounded-2xl" />;

  const active = data.merges.filter((m) => m.status === "active");
  const past = data.merges.filter((m) => m.status === "ended");

  return (
    <div className="mb-6 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 font-semibold">
            <Merge size={16} className="text-brand-orange" /> {t("erp.org.merge.title")}
          </p>
          <p className="mt-1 max-w-2xl text-xs text-white/55">{t("erp.org.merge.hint")}</p>
        </div>
        <Button variant="ghost" onClick={() => setEditing("new")} disabled={departments.length < 2}>
          <Merge size={16} />
          {t("erp.org.merge.add")}
        </Button>
      </div>

      {active.length > 0 && (
        <div className="mt-4 space-y-2">
          {active.map((m) => {
            const lead = managerOf(m.manager);
            return (
              <div key={m.id} className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border border-brand-orange/25 bg-brand-orange/[0.05] px-4 py-3">
                <DeptChain ids={m.departments} byId={byId} lang={lang} />
                <span className="flex items-center gap-2 text-sm">
                  <Avatar name={lead?.name} src={lead?.avatarUrl} size={28} />
                  <span>
                    <span className="block font-medium">{lead?.name || "—"}</span>
                    <span className="block text-xs text-white/55">{t("erp.org.merge.leads")}</span>
                  </span>
                </span>
                <span className="flex items-center gap-1.5 text-xs text-white/60">
                  <CalendarClock size={14} />
                  {m.endsAt ? t("erp.org.merge.until", { date: formatDate(m.endsAt, lang) }) : t("erp.org.merge.untilEnded")}
                </span>
                {m.note && <span className="text-xs italic text-white/50">{m.note}</span>}
                <span className="ms-auto flex gap-2">
                  <button
                    type="button"
                    onClick={() => setEditing(m)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-white/60 hover:bg-white/10 hover:text-white"
                    aria-label={t("erp.org.merge.edit")}
                  >
                    <Pencil size={14} />
                  </button>
                  <Button variant="danger" className="!py-1.5" onClick={() => end(m)}>
                    <Unlink size={14} />
                    {t("erp.org.merge.end")}
                  </Button>
                </span>
              </div>
            );
          })}
        </div>
      )}

      {past.length > 0 && (
        <div className="mt-3">
          <button type="button" onClick={() => setShowPast((s) => !s)} className="flex items-center gap-1 text-xs text-white/50 hover:text-white">
            <ChevronDown size={13} className={showPast ? "" : "-rotate-90 rtl:rotate-90"} />
            {t("erp.org.merge.past")} ({past.length})
          </button>
          {showPast && (
            <ul className="mt-2 space-y-1.5 text-xs text-white/55">
              {past.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center gap-2">
                  <span className="text-white/75">{deptNames(m)}</span>·<span>{managerOf(m.manager)?.name || "—"}</span>·
                  <span>{t("erp.org.merge.endedOn", { date: formatDate(m.endedAt, lang) })}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={t(editing === "new" ? "erp.org.merge.add" : "erp.org.merge.edit")} wide>
        {editing && (
          <MergeEditor
            merge={editing === "new" ? null : editing}
            departments={departments}
            merges={data.merges}
            managers={data.managers}
            onClose={() => setEditing(null)}
            onSaved={async () => {
              setEditing(null);
              await load();
            }}
          />
        )}
      </Modal>
    </div>
  );
}
