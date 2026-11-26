"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ListPlus, Lock, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { api, errorText } from "@/lib/clientApi";
import { parseRows, rowGroup, rowLabel } from "@/lib/projectRows";
import { Button, ErrorText, Label, Select } from "@/components/erp/ui/fields";
import { revisionLabel, STATUS_STYLE } from "@/components/erp/tasks/taskUi";

const small = "w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-white outline-none placeholder:text-white/40 focus:border-white/30";

// The board of a project whose work repeats over rows (lib/projectRows.js):
// - spaces (interior design): a grid, spaces × stages, grouped by floor; each space also
//   shows the drawing sheets of the technical office's linked project that draw it.
// - sheets (technical office): the list of drawings — No · sheet number · sheet name ·
//   space · each stage, grouped by series (AR-000, AR-100…), like AutoCAD's sheet list.
// A cell opens the same cell window as the one-row board; a stage's heading opens it for
// every row at once (Skip Final Render for all spaces…).
export default function RowsBoard({ project, lookups, canEdit, onCell, onEditRows }) {
  const { t, lang } = useLanguage();
  const [q, setQ] = useState("");
  const kind = project.rows;
  const sheets = kind === "sheets";
  const items = useMemo(() => (project.items || []).filter((i) => !i.archived), [project.items]);
  const needle = q.trim().toLowerCase();
  const shown = needle ? items.filter((i) => rowLabel(i).toLowerCase().includes(needle)) : items;
  const groups = useMemo(() => {
    const out = [];
    for (const item of shown) {
      const g = rowGroup(item, kind);
      if (!out.length || out[out.length - 1].key !== g) out.push({ key: g, list: [] });
      out[out.length - 1].list.push(item);
    }
    return out;
  }, [shown, kind]);
  const whole = project.grid?.[""] || {};
  const hasWhole = project.stages.some((s) => whole[s.key]?.needed);
  const spaces = new Map((project.linkedSpaces || []).map((s) => [s.id, s]));
  // The row's own columns: number + name (one sticky column), and a sheet's space.
  const fixedCols = sheets ? 2 : 1;
  const sticky = "sticky start-0 z-10 bg-brand-navy";

  const cellButton = (lane, s) => {
    const c = project.grid?.[lane]?.[s.key] || { status: "not_started", needed: true };
    const locked = project.lockedCells?.[lane]?.includes(s.key);
    const person = lookups.people.find((p) => p.id === c.assignee);
    if (!c.needed) {
      return (
        <button type="button" onClick={() => onCell({ stage: s.key, item: lane })} className="flex h-11 w-full items-center justify-center rounded-lg border border-dashed border-white/10 text-white/25 hover:text-white/60" aria-label={`${s.name?.[lang]} +`}>
          <Plus size={13} />
        </button>
      );
    }
    const waiting = c.status === "not_started" && locked;
    return (
      <button
        type="button"
        onClick={() => onCell({ stage: s.key, item: lane })}
        className={`flex h-11 w-full flex-col items-center justify-center rounded-lg border px-1 text-[11px] leading-tight transition hover:brightness-125 ${STATUS_STYLE[c.status] || STATUS_STYLE.not_started}`}
        title={[t(`erp.tasks.status.${c.status}`), c.number ? `#${c.number}` : "", person?.name].filter(Boolean).join(" · ")}
      >
        <span className="flex items-center gap-1 font-medium">
          {locked && <Lock size={10} />}
          {waiting ? t("erp.projects.waiting") : t(`erp.tasks.status.${c.status}`)}
        </span>
        {(c.number || person) && (
          <span className="max-w-full truncate opacity-70" dir="ltr">
            {c.revision > 0 ? `${revisionLabel(c.revision)} · ` : ""}
            {person ? person.name.split(" ")[0] : `#${c.number}`}
          </span>
        )}
      </button>
    );
  };

  if (!items.length) {
    return (
      <div className="rounded-2xl border border-white/10 px-4 py-10 text-center">
        <p className="text-white/60">{t(`erp.rows.${kind}.empty`)}</p>
        {canEdit && (
          <Button className="mx-auto mt-4" onClick={onEditRows}>
            <ListPlus size={16} /> {t(`erp.rows.${kind}.add`)}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search size={15} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-white/45" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t(`erp.rows.${kind}.search`)} aria-label={t(`erp.rows.${kind}.search`)} className={`${small} h-10 ps-9`} />
        </div>
        <span className="text-xs text-white/55">{t(`erp.rows.${kind}.count`, { n: items.length })}</span>
        {sheets && project.linkedName && (
          <Link href={`/dashboard/projects/${project.linkedProject}`} className="rounded-full bg-white/10 px-2.5 py-1 text-xs text-white/70 hover:text-white">
            {t("erp.rows.linkedTo")} {project.linkedName?.[lang]}
          </Link>
        )}
        {canEdit && (
          <Button variant="ghost" className="ms-auto" onClick={onEditRows}>
            <Pencil size={15} /> {t(`erp.rows.${kind}.edit`)}
          </Button>
        )}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-white/10">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="text-xs text-white/55">
              <th className={`${sticky} px-2 py-2 text-start font-medium`}>
                {t(`erp.rows.${kind}.number`)} · {t(`erp.rows.${kind}.name`)}
              </th>
              {sheets && <th className="hidden px-2 py-2 text-start font-medium sm:table-cell">{t("erp.rows.spaces.one")}</th>}
              {project.stages.map((s) => {
                const all = project.cells?.[s.key];
                return (
                  <th key={s.key} className="min-w-24 px-1 py-2 font-medium">
                    <button type="button" onClick={() => onCell({ stage: s.key, all: true })} className="w-full rounded-lg px-1 py-1 hover:bg-white/5" title={t("erp.rows.allRows")}>
                      <span className="block truncate">{s.name?.[lang]}</span>
                      {all?.of > 0 && (
                        <span className="block text-[11px] font-normal text-white/45" dir="ltr">
                          {all.done}/{all.of}
                        </span>
                      )}
                      {s.optional && <span className="block text-[10px] font-normal text-white/40">{t("erp.rows.optional")}</span>}
                    </button>
                  </th>
                );
              })}
              {!sheets && <th className="min-w-28 px-2 py-2 text-start font-medium">{t("erp.rows.sheets.many")}</th>}
            </tr>
          </thead>
          <tbody>
            {hasWhole && !needle && (
              <tr className="bg-white/[0.03]">
                <td colSpan={fixedCols} className={`${sticky} px-2 py-1.5 text-xs font-medium text-white/70`}>
                  {t("erp.rows.whole")}
                </td>
                {project.stages.map((s) => (
                  <td key={s.key} className="p-1">
                    {whole[s.key]?.needed ? cellButton("", s) : null}
                  </td>
                ))}
                {!sheets && <td />}
              </tr>
            )}
            {groups.map((g) => (
              <Fragment key={g.key || "-"}>
                {g.key && (
                  <tr>
                    <td colSpan={fixedCols} className={`${sticky} border-t border-white/10 px-2 pb-1 pt-3 text-start text-xs font-semibold tracking-wider text-brand-orange`}>
                      <bdi>{g.key}</bdi>
                    </td>
                    <td colSpan={project.stages.length + (sheets ? 0 : 1)} className="border-t border-white/10" />
                  </tr>
                )}
                {g.list.map((item) => {
                  const space = sheets && item.space ? spaces.get(item.space) : null;
                  const drawn = !sheets ? project.sheetsBySpace?.[item.id] || [] : [];
                  return (
                    <tr key={item.id} className="hover:bg-white/[0.02]">
                      <td className={`${sticky} px-2 py-1`}>
                        <div className="w-32 sm:w-56" title={rowLabel(item)}>
                          <p className="flex items-baseline gap-1.5 font-mono text-xs text-white/85">
                            {sheets && <span className="font-sans tabular-nums text-white/40">{items.indexOf(item) + 1}</span>}
                            <bdi>{item.number || "—"}</bdi>
                          </p>
                          {item.name && <p className="truncate text-xs text-white/65">{item.name}</p>}
                          {sheets && space && <p className="truncate text-[11px] text-white/45 sm:hidden">{rowLabel(space)}</p>}
                        </div>
                      </td>
                      {sheets && <td className="hidden whitespace-nowrap px-2 py-1 text-xs text-white/60 sm:table-cell">{space ? rowLabel(space) : ""}</td>}
                      {project.stages.map((s) => (
                        <td key={s.key} className="p-1">
                          {cellButton(item.id, s)}
                        </td>
                      ))}
                      {!sheets && (
                        <td className="px-2 py-1">
                          <div className="flex flex-wrap gap-1">
                            {drawn.map((d) => (
                              <Link
                                key={d.id}
                                href={`/dashboard/projects/${d.projectId}`}
                                title={[rowLabel(d), t(`erp.tasks.status.${d.status}`)].join(" · ")}
                                className={`rounded-md border px-1.5 py-0.5 font-mono text-[11px] ${STATUS_STYLE[d.status] || STATUS_STYLE.not_started}`}
                                dir="ltr"
                              >
                                {d.number || d.name}
                              </Link>
                            ))}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </Fragment>
            ))}
            {!shown.length && (
              <tr>
                <td colSpan={fixedCols + project.stages.length + 1} className="px-4 py-8 text-center text-white/55">
                  {t("erp.tasks.none")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// The list of spaces / sheets, kept by the CEO and the project's department managers:
// typed one by one or pasted (one per line, straight from Excel or AutoCAD's sheet list).
// A project without rows can be turned into one here, as long as nothing is planned yet.
export function RowsEditor({ project, lookups, onSaved, onCancel }) {
  const { t, lang } = useLanguage();
  const [kind, setKind] = useState(project.rows || "");
  const [rows, setRows] = useState(() => (project.items || []).filter((i) => !i.archived).map((i) => ({ ...i })));
  const [paste, setPaste] = useState("");
  const [linked, setLinked] = useState(project.linkedProject || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const sheets = kind === "sheets";
  const spaceProjects = lookups.projects.filter((p) => p.rows === "spaces" && p.id !== project.id);
  // The spaces a sheet may point to: those of the linked project (from the lookups; the
  // board sent them for the saved link).
  const linkedSpaces = linked === project.linkedProject ? project.linkedSpaces || [] : (lookups.projects.find((p) => p.id === linked)?.items || []).filter((i) => !i.archived);

  const change = (i, patch) => setRows((list) => list.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const move = (i, by) =>
    setRows((list) => {
      const next = [...list];
      const j = i + by;
      if (j < 0 || j >= next.length) return list;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  function addPasted() {
    const added = parseRows(paste, kind, rows);
    setRows((list) => [...list, ...added]);
    setPaste("");
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      await api(`/api/work-projects/${project.id}/items`, {
        method: "PUT",
        body: {
          ...(kind !== (project.rows || "") ? { rows: kind } : {}),
          ...(sheets ? { linkedProject: linked || null } : {}),
          items: kind ? rows.map((r) => ({ id: r.id, number: r.number, name: r.name, space: r.space || null })) : [],
        },
      });
      onSaved();
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <Select
        label={t("erp.rows.kind")}
        value={kind}
        onChange={setKind}
        options={[
          { value: "", label: t("erp.rows.kinds.none") },
          { value: "spaces", label: t("erp.rows.kinds.spaces") },
          { value: "sheets", label: t("erp.rows.kinds.sheets") },
        ]}
      />
      {sheets && (
        <Select
          label={t("erp.rows.linkedProject")}
          value={linked}
          onChange={setLinked}
          placeholder="—"
          options={spaceProjects.map((p) => ({ value: p.id, label: `${p.code ? `${p.code} · ` : ""}${p.name?.[lang]}` }))}
        />
      )}

      {kind && (
        <>
          <div>
            <Label>{t(`erp.rows.${kind}.paste`)}</Label>
            <textarea
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              rows={3}
              dir="ltr"
              placeholder={sheets ? "AR-001  LIST OF DRAWINGS\nAR-605-A  BF.06 - WC - PLAN" : "GF-01 Entrance\nGF-06 Bathroom"}
              className={`${small} font-mono`}
            />
            <div className="mt-2 flex flex-wrap gap-2">
              <Button variant="ghost" onClick={addPasted} disabled={!paste.trim()}>
                <ListPlus size={15} /> {t("erp.rows.addLines")}
              </Button>
              <Button variant="ghost" onClick={() => setRows((list) => [...list, { number: "", name: "" }])}>
                <Plus size={15} /> {t(`erp.rows.${kind}.addOne`)}
              </Button>
            </div>
          </div>

          <div className="max-h-[45dvh] space-y-1.5 overflow-y-auto pe-1">
            {rows.map((r, i) => (
              <div key={r.id || `new-${i}`} className="flex flex-wrap items-center gap-1.5 rounded-xl bg-white/[0.03] p-1.5 sm:flex-nowrap">
                <span className="w-7 shrink-0 text-center text-xs tabular-nums text-white/45">{i + 1}</span>
                <input value={r.number} onChange={(e) => change(i, { number: e.target.value })} placeholder={t(`erp.rows.${kind}.number`)} aria-label={t(`erp.rows.${kind}.number`)} dir="ltr" className={`${small} w-28 shrink-0 font-mono`} />
                <input value={r.name} onChange={(e) => change(i, { name: e.target.value })} placeholder={t(`erp.rows.${kind}.name`)} aria-label={t(`erp.rows.${kind}.name`)} className={`${small} min-w-0 flex-1`} />
                {sheets && linkedSpaces.length > 0 && (
                  <select value={r.space || ""} onChange={(e) => change(i, { space: e.target.value || null })} aria-label={t("erp.rows.spaces.one")} className={`${small} w-36 shrink-0 [&_option]:bg-brand-navy`}>
                    <option value="">{t("erp.rows.spaces.one")} —</option>
                    {linkedSpaces.map((s) => (
                      <option key={s.id} value={s.id}>
                        {rowLabel(s)}
                      </option>
                    ))}
                  </select>
                )}
                <div className="ms-auto flex shrink-0">
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={t("erp.rows.up")} className="grid h-9 w-8 place-items-center text-white/50 hover:text-white disabled:opacity-30">
                    <ArrowUp size={14} />
                  </button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === rows.length - 1} aria-label={t("erp.rows.down")} className="grid h-9 w-8 place-items-center text-white/50 hover:text-white disabled:opacity-30">
                    <ArrowDown size={14} />
                  </button>
                  <button type="button" onClick={() => setRows((list) => list.filter((_, j) => j !== i))} aria-label={t("common.delete")} className="grid h-9 w-8 place-items-center text-red-300/70 hover:text-red-300">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
            {!rows.length && <p className="py-4 text-center text-sm text-white/50">{t(`erp.rows.${kind}.empty`)}</p>}
          </div>
          <p className="text-xs text-white/50">{t("erp.rows.keepNote")}</p>
        </>
      )}
      <ErrorText>{error}</ErrorText>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button onClick={save} loading={saving}>
          {t("common.save")}
        </Button>
      </div>
    </div>
  );
}
