"use client";

import { useState } from "react";
import { ChevronDown, ShieldCheck, Trash2 } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { api, errorText } from "@/lib/clientApi";
import { Button, ErrorText, Select, Toggle } from "@/components/erp/ui/fields";
import { useToast } from "@/components/erp/ui/Feedback";
import { useTaskLookups } from "@/components/erp/tasks/useTaskLookups";

const LEVELS = ["view", "download", "upload", "delete"];

// The CEO decides who may use a project's files (change request CR-2): open to everyone
// who can open the project (the default), or only the people and departments listed,
// each with their levels (lib/projectFileAccess.js).
export default function FileAccessPanel({ projectId, access, onSaved }) {
  const { t, lang } = useLanguage();
  const toast = useToast();
  const lookups = useTaskLookups();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(access);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sentFor, setSentFor] = useState(access);
  // A fresh copy from the server (after saving, or another tab) replaces the edits.
  if (access !== sentFor) {
    setSentFor(access);
    setValue(access);
  }

  const personName = (id) => lookups.people.find((p) => p.id === id)?.name || "…";
  const deptName = (id) => lookups.departments.find((d) => d.id === id)?.name?.[lang] || "…";
  const setRow = (list, id, levels) => setValue((v) => ({ ...v, [list]: v[list].map((r) => (r.id === id ? { ...r, levels } : r)) }));
  const toggle = (list, row, level) => {
    let next = row.levels.includes(level) ? row.levels.filter((l) => l !== level) : [...row.levels, level];
    // Anything more than seeing the list includes seeing it; without seeing, nothing.
    if (level !== "view" && next.includes(level) && !next.includes("view")) next = ["view", ...next];
    if (level === "view" && !next.includes("view")) next = [];
    setRow(list, row.id, next);
  };

  async function save() {
    setBusy(true);
    setError("");
    try {
      await api(`/api/work-projects/${projectId}/files`, { method: "PUT", body: value });
      toast({ text: t("erp.fileAccess.saved") });
      onSaved?.();
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setBusy(false);
    }
  }

  const rows = (list, nameOf) =>
    value[list].map((row) => (
      <tr key={row.id} className="border-t border-white/5">
        <td className="py-2 pe-3">{nameOf(row.id)}</td>
        {LEVELS.map((l) => (
          <td key={l} className="px-2 py-2 text-center">
            <input type="checkbox" aria-label={t(`erp.fileAccess.level.${l}`)} checked={row.levels.includes(l)} onChange={() => toggle(list, row, l)} />
          </td>
        ))}
        <td className="ps-2 text-end">
          <button type="button" aria-label={t("common.delete")} onClick={() => setValue((v) => ({ ...v, [list]: v[list].filter((r) => r.id !== row.id) }))} className="text-white/45 hover:text-red-300">
            <Trash2 size={14} />
          </button>
        </td>
      </tr>
    ));
  const listed = (list) => new Set(value[list].map((r) => r.id));

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03]">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-5 py-3 text-start text-sm">
        <ShieldCheck size={16} className={access.restricted ? "text-amber-300" : "text-emerald-300"} />
        <span className="font-medium">{t("erp.fileAccess.title")}</span>
        <span className="text-xs text-white/55">{t(access.restricted ? "erp.fileAccess.restrictedNow" : "erp.fileAccess.openNow")}</span>
        <ChevronDown size={14} className={`ms-auto text-white/50 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="space-y-4 border-t border-white/10 px-5 py-4">
          <Toggle checked={value.restricted} onChange={(restricted) => setValue((v) => ({ ...v, restricted }))} label={t("erp.fileAccess.restrict")} />
          <p className="text-xs text-white/55">{t(value.restricted ? "erp.fileAccess.restrictHint" : "erp.fileAccess.openHint")}</p>
          {value.restricted && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Select
                  label={t("erp.fileAccess.addPerson")}
                  value=""
                  placeholder="—"
                  onChange={(id) => id && setValue((v) => ({ ...v, people: [...v.people, { id, levels: ["view", "download"] }] }))}
                  options={lookups.people.filter((p) => !listed("people").has(p.id)).map((p) => ({ value: p.id, label: p.name }))}
                />
                <Select
                  label={t("erp.fileAccess.addDepartment")}
                  value=""
                  placeholder="—"
                  onChange={(id) => id && setValue((v) => ({ ...v, departments: [...v.departments, { id, levels: ["view", "download"] }] }))}
                  options={lookups.departments.filter((d) => !listed("departments").has(d.id)).map((d) => ({ value: d.id, label: d.name?.[lang] || d.name?.ar }))}
                />
              </div>
              {value.people.length + value.departments.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[480px] text-sm">
                    <thead className="text-xs text-white/55">
                      <tr>
                        <th className="py-1 pe-3 text-start font-medium" />
                        {LEVELS.map((l) => (
                          <th key={l} className="px-2 py-1 text-center font-medium">
                            {t(`erp.fileAccess.level.${l}`)}
                          </th>
                        ))}
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {value.departments.length > 0 && (
                        <tr>
                          <td colSpan={6} className="pt-2 text-[11px] uppercase tracking-wider text-white/45">
                            {t("erp.fileAccess.departments")}
                          </td>
                        </tr>
                      )}
                      {rows("departments", deptName)}
                      {value.people.length > 0 && (
                        <tr>
                          <td colSpan={6} className="pt-3 text-[11px] uppercase tracking-wider text-white/45">
                            {t("erp.fileAccess.people")}
                          </td>
                        </tr>
                      )}
                      {rows("people", personName)}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="rounded-xl bg-amber-400/10 px-3 py-2 text-xs text-amber-100">{t("erp.fileAccess.nobody")}</p>
              )}
            </>
          )}
          <ErrorText>{error}</ErrorText>
          <div className="flex justify-end">
            <Button onClick={save} loading={busy}>
              {t("common.save")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
