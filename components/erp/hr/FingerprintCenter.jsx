"use client";

// HR → Fingerprint: everything the fingerprint device sends, managed from here (the CEO
// and company-wide HR): the devices (with remote commands for the office agent), who
// each fingerprint ID belongs to, and every punch (add, correct, move, delete, restore).

import { useCallback, useEffect, useMemo, useState } from "react";
import { Clock, Copy, Pencil, Plus, RefreshCw, RotateCcw, Trash2 } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { api, errorText } from "@/lib/clientApi";
import { formatDate, formatDateTime } from "@/lib/formatTime";
import Modal from "@/components/erp/ui/Modal";
import { Button, Card, ErrorText, Input, Select, Toggle } from "@/components/erp/ui/fields";
import { Checkbox, EmptyState } from "@/components/erp/ui/DataTools";
import { SkeletonList, SkeletonTable } from "@/components/erp/ui/Loading";
import { useConfirm, useToast } from "@/components/erp/ui/Feedback";

const SECTIONS = ["punches", "badges", "devices"];

export default function FingerprintCenter() {
  const { t } = useLanguage();
  const [section, setSection] = useState("punches");
  // The people and fingerprint IDs, shared by the sections (reloaded after changes).
  const [badgeData, setBadgeData] = useState(null);
  const loadBadges = useCallback(() => api("/api/hr/badges").then(setBadgeData).catch(() => {}), []);
  useEffect(() => {
    loadBadges();
  }, [loadBadges]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-1 rounded-xl border border-white/10 p-1 sm:w-fit">
        {SECTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSection(s)}
            className={`rounded-lg px-4 py-1.5 text-sm ${section === s ? "bg-brand-orange text-white" : "text-white/60 hover:text-white"}`}
          >
            {t(`erp.fp.section.${s}`)}
          </button>
        ))}
      </div>
      {section === "punches" && <Punches badgeData={badgeData} />}
      {section === "badges" && <Badges data={badgeData} reload={loadBadges} />}
      {section === "devices" && <Devices />}
    </div>
  );
}

// ---------------------------------------------------------------- punches

// Dates in this browser's day (the office's, in practice); the server reads them as office dates.
const dayOf = (ms) => new Date(ms).toLocaleDateString("en-CA");
const todayStr = () => dayOf(Date.now());
const daysAgo = (n) => dayOf(Date.now() - n * 86400000);

function Punches({ badgeData }) {
  const { t, lang } = useLanguage();
  const toast = useToast();
  const confirm = useConfirm();
  const [filter, setFilter] = useState({ from: todayStr(), to: todayStr(), who: "", deleted: false });
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(new Set());
  const [editing, setEditing] = useState(null); // a punch, or {} for a new one
  const [moveTo, setMoveTo] = useState("");

  const load = useCallback(() => {
    const q = new URLSearchParams({ from: filter.from, to: filter.to < filter.from ? filter.from : filter.to });
    if (filter.who.startsWith("u:")) q.set("userId", filter.who.slice(2));
    if (filter.who.startsWith("b:")) q.set("badgeId", filter.who.slice(2));
    if (filter.deleted) q.set("deleted", "1");
    return api(`/api/hr/punches?${q}`)
      .then((d) => {
        setError("");
        setData(d);
        setSelected(new Set());
      })
      .catch((err) => setError(errorText(t, err)));
  }, [filter, t]);
  useEffect(() => {
    load();
  }, [load]);

  const whoOptions = useMemo(() => {
    if (!badgeData) return [];
    const people = badgeData.people.filter((p) => p.badgeId).map((p) => ({ value: `u:${p.id}`, label: `${p.name} (#${p.badgeId})${p.status !== "active" ? ` — ${t("erp.fp.inactive")}` : ""}` }));
    const orphans = badgeData.badges.filter((b) => !b.owners.length).map((b) => ({ value: `b:${b.badgeId}`, label: t("erp.fp.orphanId", { id: b.badgeId }) }));
    return [...people, ...orphans];
  }, [badgeData, t]);
  const idOptions = useMemo(
    () => (badgeData?.badges || []).map((b) => ({ value: b.badgeId, label: `#${b.badgeId} — ${b.owners.map((o) => o.name).join(", ") || t("erp.fp.nobody")}` })),
    [badgeData, t]
  );

  const punches = useMemo(() => data?.punches || [], [data]);
  const byDay = useMemo(() => {
    const out = [];
    for (const p of punches) {
      const last = out.at(-1);
      if (last?.date === p.date) last.list.push(p);
      else out.push({ date: p.date, list: [p] });
    }
    return out;
  }, [punches]);
  const toggle = (id) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const allSelected = punches.length > 0 && punches.every((p) => selected.has(p.id));

  async function bulk(action) {
    if (action === "delete" && !(await confirm({ text: t("erp.fp.confirmDelete", { n: selected.size }), kind: "delete" }))) return;
    try {
      const r = await api("/api/hr/punches", { method: "PATCH", body: { ids: [...selected], action, badgeId: action === "move" ? moveTo : undefined } });
      toast({ text: t("erp.fp.bulkDone", { n: r.changed }) + (r.skipped ? ` · ${t("erp.fp.bulkSkipped", { n: r.skipped })}` : ""), tone: "success" });
      setMoveTo("");
      load();
    } catch (err) {
      toast({ text: errorText(t, err), tone: "error" });
    }
  }
  async function removeOne(p) {
    if (!(await confirm({ text: t("erp.fp.confirmDelete", { n: 1 }), kind: "delete" }))) return;
    try {
      await api(`/api/hr/punches/${p.id}`, { method: "DELETE" });
      load();
    } catch (err) {
      toast({ text: errorText(t, err), tone: "error" });
    }
  }
  async function restoreOne(p) {
    try {
      await api("/api/hr/punches", { method: "PATCH", body: { ids: [p.id], action: "restore" } });
      load();
    } catch (err) {
      toast({ text: errorText(t, err), tone: "error" });
    }
  }

  const quick = [
    ["today", todayStr(), todayStr()],
    ["yesterday", daysAgo(1), daysAgo(1)],
    ["week", daysAgo(6), todayStr()],
    ["month", `${todayStr().slice(0, 8)}01`, todayStr()],
  ];

  return (
    <div className="space-y-4">
      <p className="text-sm text-white/60">{t("erp.fp.punchesHint")}</p>
      <Card className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-40">
            <Input type="date" label={t("erp.fp.from")} value={filter.from} onChange={(from) => setFilter((f) => ({ ...f, from }))} dir="ltr" />
          </div>
          <div className="w-40">
            <Input type="date" label={t("erp.fp.to")} value={filter.to} onChange={(to) => setFilter((f) => ({ ...f, to }))} dir="ltr" />
          </div>
          <div className="min-w-56 flex-1">
            <Select label={t("erp.fp.who")} value={filter.who} onChange={(who) => setFilter((f) => ({ ...f, who }))} placeholder={t("erp.fp.everyone")} options={whoOptions} />
          </div>
          <Button onClick={() => setEditing({})}>
            <Plus size={16} /> {t("erp.fp.addPunch")}
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {quick.map(([k, from, to]) => (
            <button
              key={k}
              type="button"
              onClick={() => setFilter((f) => ({ ...f, from, to }))}
              className={`rounded-lg border px-3 py-1 text-xs ${filter.from === from && filter.to === to ? "border-brand-orange text-white" : "border-white/10 text-white/60 hover:text-white"}`}
            >
              {t(`erp.fp.quick.${k}`)}
            </button>
          ))}
          <span className="ms-auto">
            <Toggle checked={filter.deleted} onChange={(deleted) => setFilter((f) => ({ ...f, deleted }))} label={t("erp.fp.showDeleted")} />
          </span>
        </div>
      </Card>

      {selected.size > 0 && (
        <Card className="flex flex-wrap items-center gap-2 border-brand-orange/40">
          <span className="text-sm font-medium">{t("erp.fp.selected", { n: selected.size })}</span>
          <Button variant="danger" onClick={() => bulk("delete")}>
            <Trash2 size={15} /> {t("common.delete")}
          </Button>
          {filter.deleted && (
            <Button variant="ghost" onClick={() => bulk("restore")}>
              <RotateCcw size={15} /> {t("erp.fp.restore")}
            </Button>
          )}
          <div className="w-64">
            <Select value={moveTo} onChange={setMoveTo} placeholder={t("erp.fp.moveTo")} options={idOptions} />
          </div>
          <Button variant="ghost" disabled={!moveTo} onClick={() => bulk("move")}>
            {t("erp.fp.move")}
          </Button>
        </Card>
      )}

      <ErrorText>{error}</ErrorText>
      {!data && !error && <SkeletonTable rows={6} />}
      {data && !punches.length && <EmptyState compact text={t("erp.fp.noPunches")} />}
      {data?.truncated && <p className="text-xs text-amber-300">{t("erp.fp.truncated", { n: punches.length })}</p>}
      {punches.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-white/[0.03] text-xs text-white/55">
              <tr>
                <th className="w-10 px-3 py-2">
                  <Checkbox checked={allSelected} mixed={selected.size > 0 && !allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(punches.map((p) => p.id)))} label={t("erp.fp.selectAll")} />
                </th>
                <th className="px-3 py-2 text-start">{t("erp.fp.col.time")}</th>
                <th className="px-3 py-2 text-start">{t("erp.fp.col.id")}</th>
                <th className="px-3 py-2 text-start">{t("erp.fp.col.person")}</th>
                <th className="px-3 py-2 text-start">{t("erp.fp.col.source")}</th>
                <th className="px-3 py-2 text-start">{t("erp.fp.col.note")}</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            {byDay.map((day) => (
              <tbody key={day.date} className="border-t border-white/10">
                <tr>
                  <td colSpan={7} className="bg-white/[0.02] px-3 py-1.5 text-xs font-semibold text-white/70">
                    {formatDate(`${day.date}T12:00:00Z`, lang)} · {t("erp.fp.dayCount", { n: day.list.filter((p) => !p.deleted).length })}
                  </td>
                </tr>
                {day.list.map((p) => (
                  <tr key={p.id} className={`border-t border-white/5 ${p.deleted ? "opacity-45" : ""}`}>
                    <td className="px-3 py-2">
                      <Checkbox checked={selected.has(p.id)} onChange={() => toggle(p.id)} label={p.time} />
                    </td>
                    <td className={`px-3 py-2 tabular-nums ${p.deleted ? "line-through" : ""}`} dir="ltr">
                      {p.time}
                    </td>
                    <td className="px-3 py-2 tabular-nums" dir="ltr">
                      #{p.badgeId}
                    </td>
                    <td className="px-3 py-2">{p.person ? p.person.name : <span className="text-amber-300">{t("erp.fp.nobody")}</span>}</td>
                    <td className="px-3 py-2 text-xs text-white/60">
                      {t(`erp.fp.src.${p.source}`)}
                      {p.device && ` · ${p.device}`}
                      {p.edited && <span className="ms-1 rounded bg-sky-500/15 px-1.5 text-sky-200">{t("erp.fp.edited")}</span>}
                      {p.deleted && <span className="ms-1 rounded bg-red-500/15 px-1.5 text-red-200">{t("erp.fp.deleted")}</span>}
                    </td>
                    <td className="max-w-56 truncate px-3 py-2 text-xs text-white/60" title={p.note} dir="auto">
                      {p.note}
                    </td>
                    <td className="px-3 py-2">
                      <span className="flex justify-end gap-3">
                        {p.deleted ? (
                          <button type="button" onClick={() => restoreOne(p)} className="text-white/60 hover:text-white" aria-label={t("erp.fp.restore")} title={t("erp.fp.restore")}>
                            <RotateCcw size={15} />
                          </button>
                        ) : (
                          <>
                            <button type="button" onClick={() => setEditing(p)} className="text-white/60 hover:text-white" aria-label={t("common.edit")} title={t("common.edit")}>
                              <Pencil size={15} />
                            </button>
                            <button type="button" onClick={() => removeOne(p)} className="text-red-400" aria-label={t("common.delete")} title={t("common.delete")}>
                              <Trash2 size={15} />
                            </button>
                          </>
                        )}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      )}

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={editing?.id ? t("erp.fp.editPunch") : t("erp.fp.addPunch")}>
        {editing && (
          <PunchForm
            punch={editing}
            idOptions={idOptions}
            defaultDate={filter.to}
            onDone={() => {
              setEditing(null);
              load();
            }}
          />
        )}
      </Modal>
    </div>
  );
}

function PunchForm({ punch, idOptions, defaultDate, onDone }) {
  const { t } = useLanguage();
  const isNew = !punch.id;
  const [form, setForm] = useState({
    badgeId: punch.badgeId || "",
    date: punch.date || defaultDate || todayStr(),
    time: punch.time ? punch.time.slice(0, 5) : "",
    note: punch.note || "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    setBusy(true);
    setError("");
    try {
      // Editing keeps the seconds unless the minute changed.
      const time = !isNew && form.time === punch.time.slice(0, 5) ? punch.time : form.time;
      if (isNew) await api("/api/hr/punches", { method: "POST", body: { badgeId: form.badgeId, date: form.date, time, note: form.note } });
      else await api(`/api/hr/punches/${punch.id}`, { method: "PATCH", body: { badgeId: form.badgeId, date: form.date, time, note: form.note } });
      onDone();
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Select label={t("erp.fp.col.id")} value={form.badgeId} onChange={set("badgeId")} placeholder={t("erp.fp.pickId")} options={idOptions} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Input type="date" label={t("erp.fp.date")} value={form.date} onChange={set("date")} dir="ltr" />
        <Input type="time" label={t("erp.fp.officeTime")} value={form.time} onChange={set("time")} dir="ltr" />
      </div>
      <Input label={t("erp.fp.col.note")} value={form.note} onChange={set("note")} />
      {!isNew && <p className="text-xs text-white/50">{t("erp.fp.editHint")}</p>}
      <ErrorText>{error}</ErrorText>
      <Button onClick={save} loading={busy} disabled={!form.badgeId || !form.date || !form.time}>
        {t("common.save")}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------- fingerprint IDs

function Badges({ data, reload }) {
  const { t, lang } = useLanguage();
  const toast = useToast();
  const [choice, setChoice] = useState({}); // badgeId → userId ("" = nobody)
  const [newId, setNewId] = useState({ badgeId: "", userId: "" });
  const [busy, setBusy] = useState("");

  if (!data) return <SkeletonList rows={6} />;
  const people = data.people.map((p) => ({ value: p.id, label: `${p.name}${p.badgeId ? ` (#${p.badgeId})` : ""}${p.status !== "active" ? ` — ${t("erp.fp.inactive")}` : ""}` }));
  const withoutId = data.people.filter((p) => p.status === "active" && !p.badgeId);

  async function assign(badgeId, userId) {
    setBusy(badgeId);
    try {
      await api("/api/hr/badges", { method: "PUT", body: { badgeId, userId: userId || null } });
      toast({ text: t("erp.fp.saved"), tone: "success" });
      setChoice((c) => ({ ...c, [badgeId]: undefined }));
      await reload();
    } catch (err) {
      toast({ text: errorText(t, err), tone: "error" });
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-white/60">{t("erp.fp.badgesHint")}</p>
      <div className="overflow-x-auto rounded-2xl border border-white/10">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-white/[0.03] text-xs text-white/55">
            <tr>
              <th className="px-3 py-2 text-start">{t("erp.fp.col.id")}</th>
              <th className="px-3 py-2 text-start">{t("erp.fp.col.owner")}</th>
              <th className="px-3 py-2 text-start">{t("erp.fp.col.punches")}</th>
              <th className="px-3 py-2 text-start">{t("erp.fp.col.period")}</th>
              <th className="px-3 py-2 text-start">{t("erp.fp.col.change")}</th>
            </tr>
          </thead>
          <tbody>
            {data.badges.map((b) => {
              const current = b.owners.length === 1 ? b.owners[0].id : "";
              const picked = choice[b.badgeId] ?? current;
              return (
                <tr key={b.badgeId} className="border-t border-white/5">
                  <td className="px-3 py-2 font-semibold tabular-nums" dir="ltr">
                    #{b.badgeId}
                  </td>
                  <td className="px-3 py-2">
                    {b.owners.length === 0 && <span className="text-amber-300">{t("erp.fp.nobody")}</span>}
                    {b.owners.length === 1 && (
                      <span>
                        {b.owners[0].name}
                        {b.owners[0].status !== "active" && <span className="ms-1 text-xs text-white/45">({t("erp.fp.inactive")})</span>}
                      </span>
                    )}
                    {b.owners.length > 1 && <span className="text-red-300">{t("erp.fp.shared", { names: b.owners.map((o) => o.name).join("، ") })}</span>}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{b.count}</td>
                  <td className="px-3 py-2 text-xs text-white/60">{b.first ? `${formatDate(b.first, lang)} → ${formatDateTime(b.last, lang)}` : "—"}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="w-56">
                        <Select value={picked} onChange={(v) => setChoice((c) => ({ ...c, [b.badgeId]: v }))} placeholder={t("erp.fp.nobody")} options={people} />
                      </div>
                      <Button variant="ghost" loading={busy === b.badgeId} disabled={picked === current && b.owners.length <= 1} onClick={() => assign(b.badgeId, picked)}>
                        {t("common.save")}
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Card className="space-y-3">
        <p className="font-medium">{t("erp.fp.newIdTitle")}</p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-32">
            <Input label={t("erp.fp.col.id")} value={newId.badgeId} onChange={(badgeId) => setNewId((n) => ({ ...n, badgeId }))} dir="ltr" />
          </div>
          <div className="min-w-56 flex-1">
            <Select label={t("erp.fp.col.owner")} value={newId.userId} onChange={(userId) => setNewId((n) => ({ ...n, userId }))} placeholder={t("erp.fp.pickPerson")} options={people} />
          </div>
          <Button
            disabled={!newId.badgeId.trim() || !newId.userId}
            loading={busy === newId.badgeId}
            onClick={async () => {
              await assign(newId.badgeId.trim(), newId.userId);
              setNewId({ badgeId: "", userId: "" });
            }}
          >
            {t("common.save")}
          </Button>
        </div>
        {withoutId.length > 0 && <p className="text-xs text-amber-300">{t("erp.fp.withoutId", { names: withoutId.map((p) => p.name).join("، ") })}</p>}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------- devices

function Devices() {
  const { t, lang } = useLanguage();
  const confirm = useConfirm();
  const toast = useToast();
  const [devices, setDevices] = useState(null);
  const [name, setName] = useState("");
  const [newKey, setNewKey] = useState(null);
  const [error, setError] = useState("");
  const [renaming, setRenaming] = useState(null);
  const [checkedAt, setCheckedAt] = useState(0);
  const load = useCallback(
    () =>
      api("/api/hr/devices")
        .then((d) => {
          setDevices(d.devices);
          setCheckedAt(Date.now());
        })
        .catch(() => {}),
    []
  );
  // The agent reports every 30 s: refresh as often, so HR sees punches arrive.
  useEffect(() => {
    load();
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, [load]);

  async function create() {
    setError("");
    try {
      const d = await api("/api/hr/devices", { method: "POST", body: { name } });
      setNewKey(d.key);
      setName("");
      load();
    } catch (err) {
      setError(errorText(t, err));
    }
  }
  async function patch(d, body, done) {
    try {
      await api(`/api/hr/devices/${d.id}`, { method: "PATCH", body });
      if (done) toast({ text: done, tone: "success" });
      load();
    } catch (err) {
      toast({ text: errorText(t, err), tone: "error" });
    }
  }

  const online = (d) => d.lastSeenAt && checkedAt - new Date(d.lastSeenAt).getTime() < 10 * 60000;

  return (
    <div className="max-w-3xl space-y-5">
      <p className="text-sm text-white/60">{t("erp.hr.devicesHint")}</p>
      {!devices && <SkeletonList rows={2} />}
      {(devices || []).map((d) => {
        const v2 = Boolean(d.agentVersion);
        return (
          <Card key={d.id} className="space-y-4">
            <div className="flex flex-wrap items-center gap-4">
              <span className={`flex items-center gap-2 text-sm ${online(d) ? "text-emerald-300" : "text-amber-300"}`}>
                <span className={`h-2.5 w-2.5 rounded-full ${online(d) ? "bg-emerald-400" : "bg-amber-400"}`} />
                {online(d) ? t("erp.hr.deviceOnline") : t("erp.hr.deviceOffline")}
              </span>
              <div className="min-w-0 flex-1">
                {renaming?.id === d.id ? (
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <Input value={renaming.name} onChange={(n) => setRenaming({ id: d.id, name: n })} />
                    </div>
                    <Button variant="ghost" disabled={!renaming.name.trim()} onClick={() => patch(d, { name: renaming.name }).then(() => setRenaming(null))}>
                      {t("common.save")}
                    </Button>
                  </div>
                ) : (
                  <p className="flex items-center gap-2 font-medium">
                    {d.name}
                    <button type="button" onClick={() => setRenaming({ id: d.id, name: d.name })} className="text-white/45 hover:text-white" aria-label={t("common.edit")}>
                      <Pencil size={13} />
                    </button>
                  </p>
                )}
                <p className="text-xs text-white/60">
                  …{d.keyHint} · {t("erp.hr.lastSeen")}: {d.lastSeenAt ? formatDateTime(d.lastSeenAt, lang) : "—"}
                  {d.lastError && <span className="text-red-300"> · {d.lastError}</span>}
                </p>
                <DeviceHealth device={d} online={online(d)} />
              </div>
              <Toggle checked={d.active} onChange={(active) => patch(d, { active })} label={t("erp.org.active")} />
              <button
                type="button"
                onClick={async () => (await confirm({ text: t("common.confirmDelete"), kind: "delete" })) && api(`/api/hr/devices/${d.id}`, { method: "DELETE" }).then(load)}
                className="text-red-400"
                aria-label={t("common.delete")}
              >
                <Trash2 size={16} />
              </button>
            </div>

            {/* Remote control: the office agent picks these up with its next sync. */}
            <div className="space-y-3 border-t border-white/10 pt-3">
              <p className="text-sm font-medium">{t("erp.fp.remote")}</p>
              {!v2 && <p className="text-xs text-amber-300">{t("erp.fp.remoteNeedsV2")}</p>}
              <Toggle checked={d.syncClock} onChange={(syncClock) => patch(d, { syncClock })} label={t("erp.fp.syncClock")} />
              <div className="flex flex-wrap gap-2">
                <Button variant="ghost" onClick={() => patch(d, { command: "set_clock" }, t("erp.fp.commandQueued"))}>
                  <Clock size={15} /> {t("erp.fp.cmd.set_clock")}
                </Button>
                <Button variant="ghost" onClick={() => patch(d, { command: "resend_all" }, t("erp.fp.commandQueued"))}>
                  <RefreshCw size={15} /> {t("erp.fp.cmd.resend_all")}
                </Button>
              </div>
              {d.pendingCommands?.length > 0 && (
                <p className="text-xs text-sky-200">{t("erp.fp.pending", { list: d.pendingCommands.map((c) => t(`erp.fp.cmd.${c}`)).join("، ") })}</p>
              )}
              {d.lastCommandAt && (
                <p className="text-xs text-white/45">
                  {t("erp.fp.lastCommand", { list: d.lastCommand.split(", ").map((c) => t(`erp.fp.cmd.${c}`)).join("، "), at: formatDateTime(d.lastCommandAt, lang) })}
                </p>
              )}
            </div>
          </Card>
        );
      })}

      <Card className="space-y-3">
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Input label={t("erp.hr.deviceName")} value={name} onChange={setName} placeholder="ZKTeco — Damascus office" />
          </div>
          <Button onClick={create} disabled={!name.trim()}>
            <Plus size={16} /> {t("common.add")}
          </Button>
        </div>
        {newKey && (
          <div className="space-y-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.06] p-4">
            <p className="text-sm font-medium">{t("erp.hr.keyOnce")}</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 break-all rounded-lg bg-black/30 px-3 py-2 text-xs" dir="ltr">
                {newKey}
              </code>
              <Button variant="ghost" onClick={() => navigator.clipboard?.writeText(newKey)}>
                <Copy size={15} />
              </Button>
            </div>
          </div>
        )}
        <ErrorText>{error}</ErrorText>
      </Card>
    </div>
  );
}

// Is the device really delivering? Punches received, its clock, the last batch.
function DeviceHealth({ device: d, online }) {
  const { t, lang } = useLanguage();
  const skew = d.clockSkewSec;
  const clockOff = skew !== null && Math.abs(skew) > 120;
  const line = "mt-1 block text-xs";
  return (
    <div className="mt-1">
      <span className={`${line} text-white/60`}>
        {t("erp.hr.devLastPunch")}: {d.lastPunchAt ? formatDateTime(d.lastPunchAt, lang) : "—"} · {t("erp.hr.devLast24h", { n: d.last24h || 0 })} ·{" "}
        {t("erp.hr.devTotal", { n: d.totalInserted || 0 })}
      </span>
      {d.lastBatch?.at && (
        <span className={`${line} text-white/45`}>
          {t("erp.hr.devLastBatch", { received: d.lastBatch.received, inserted: d.lastBatch.inserted })} · {formatDateTime(d.lastBatch.at, lang)}
          {d.agentVersion && ` · ${t("erp.hr.devAgent")} ${d.agentVersion}`}
        </span>
      )}
      {skew === null ? (
        d.lastSeenAt && <span className={`${line} text-amber-300`}>{t("erp.hr.devClockUnknown")}</span>
      ) : clockOff ? (
        <span className={`${line} font-medium text-red-300`}>
          {t("erp.hr.devClockOff", { min: Math.round(Math.abs(skew) / 60), dir: t(skew > 0 ? "erp.hr.devClockAhead" : "erp.hr.devClockBehind") })}
        </span>
      ) : (
        <span className={`${line} text-emerald-300/80`}>{t("erp.hr.devClockOk")}</span>
      )}
      {d.lastBatch?.future > 0 && <span className={`${line} text-red-300`}>{t("erp.hr.devFuture", { n: d.lastBatch.future })}</span>}
      {online && !d.last24h && <span className={`${line} text-amber-300`}>{t("erp.hr.devNoPunchToday")}</span>}
    </div>
  );
}
