"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, MapPin, Plus, Users, XCircle } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { api, errorText } from "@/lib/clientApi";
import { formatClock, formatDate } from "@/lib/formatTime";
import Modal from "@/components/erp/ui/Modal";
import { Button, ErrorText } from "@/components/erp/ui/fields";
import { SkeletonList } from "@/components/erp/ui/Loading";
import { EmptyState } from "@/components/erp/ui/DataTools";
import { DueChips, inputCls, PickSelect } from "@/components/erp/office/officeUi";

const localDay = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
};
const localTime = (d) => {
  const x = new Date(d);
  return `${String(x.getHours()).padStart(2, "0")}:${String(x.getMinutes()).padStart(2, "0")}`;
};

// Meetings: upcoming and recent, grouped by day; a new one; each opens its window
// (agenda, minutes, decisions that become tracked items).
export default function MeetingsView({ lookup, refreshKey, openMeetingId = null, onOpenItem }) {
  const { t, lang } = useLanguage();
  const [list, setList] = useState(null);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState(openMeetingId);

  const load = useCallback(() => {
    api("/api/office/meetings")
      .then((d) => setList(d.meetings))
      .catch((err) => setError(errorText(t, err)));
  }, [t]);
  useEffect(() => {
    load();
  }, [load, refreshKey]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (openMeetingId) setOpenId(openMeetingId);
  }, [openMeetingId]);

  const today = localDay(new Date());
  const upcoming = (list || []).filter((m) => localDay(m.start) >= today);
  const past = (list || []).filter((m) => localDay(m.start) < today).reverse();
  const byDay = (ms) => Object.entries(ms.reduce((acc, m) => ((acc[localDay(m.start)] ||= []).push(m), acc), {}));
  const open = list?.find((m) => m.id === openId) || null;

  const row = (m) => (
    <button
      key={m.id}
      type="button"
      data-entity={`meeting:${m.id}`}
      onClick={() => setOpenId(m.id)}
      className={`flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5 text-start hover:border-white/20 ${m.status === "cancelled" ? "opacity-50" : ""}`}
    >
      <span className="w-14 shrink-0 text-sm font-semibold text-white">{formatClock(m.start, lang)}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-white">{m.title}</p>
        <p className="truncate text-[11px] text-white/50">{[t(`erp.office.meetingKind.${m.kind}`), m.place, m.client?.name, m.participants.map((p) => p.name).join("، ")].filter(Boolean).join(" · ")}</p>
      </div>
      <span className={`rounded-full px-2 py-0.5 text-[11px] ${m.status === "held" ? "bg-emerald-500/15 text-emerald-200" : m.status === "cancelled" ? "bg-white/5 text-white/40" : "bg-sky-500/15 text-sky-200"}`}>
        {t(`erp.office.meetingStatus.${m.status}`)}
      </span>
      {m.status === "held" && !m.minutes && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] text-amber-200">{t("erp.office.meetings.noMinutes")}</span>}
    </button>
  );

  return (
    <div className="space-y-5">
      <div className="flex">
        <Button className="ms-auto" onClick={() => setAdding(true)}>
          <Plus size={16} /> {t("erp.office.meetings.new")}
        </Button>
      </div>
      <ErrorText>{error}</ErrorText>
      {!list && !error && <SkeletonList rows={4} avatar={false} />}
      {list && upcoming.length === 0 && <EmptyState compact text={t("erp.office.meetings.noneUpcoming")} />}
      {byDay(upcoming).map(([day, ms]) => (
        <div key={day} className="space-y-2">
          <p className="text-xs font-semibold text-white/60">{day === today ? t("erp.office.due.today") : formatDate(`${day}T12:00:00`, lang)}</p>
          {ms.map(row)}
        </div>
      ))}
      {past.length > 0 && (
        <div className="space-y-2">
          <p className="pt-2 text-xs font-semibold text-white/40">{t("erp.office.meetings.past")}</p>
          {past.map(row)}
        </div>
      )}
      <Modal open={adding} onClose={() => setAdding(false)} title={t("erp.office.meetings.new")} wide>
        {adding && (
          <MeetingForm
            lookup={lookup}
            onCancel={() => setAdding(false)}
            onSaved={(m) => {
              setAdding(false);
              load();
              setOpenId(m.id);
            }}
          />
        )}
      </Modal>
      {open && <MeetingWindow meeting={open} lookup={lookup} onClose={() => setOpenId(null)} onChanged={load} onOpenItem={onOpenItem} />}
    </div>
  );
}

function MeetingForm({ meeting = null, lookup, onSaved, onCancel }) {
  const { t } = useLanguage();
  const [f, setF] = useState(
    meeting
      ? { kind: meeting.kind, title: meeting.title, date: localDay(meeting.start), time: localTime(meeting.start), minutes: Math.round((new Date(meeting.end) - new Date(meeting.start)) / 60000), place: meeting.place, participants: meeting.participants.map((p) => p.id), guests: meeting.guests, client: meeting.client?.id || "", project: meeting.project?.id || "", agenda: meeting.agenda }
      : { kind: "internal", title: "", date: localDay(new Date()), time: "10:00", minutes: 60, place: "", participants: [], guests: "", client: "", project: "", agenda: "" }
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const [pick, setPick] = useState("");

  async function save() {
    setBusy(true);
    setError("");
    try {
      const d = meeting
        ? await api(`/api/office/meetings/${meeting.id}`, { method: "PATCH", body: { action: "edit", ...f, client: f.client || null, project: f.project || null } })
        : await api("/api/office/meetings", { method: "POST", body: { ...f, client: f.client || null, project: f.project || null } });
      onSaved(d.meeting);
    } catch (err) {
      setError(errorText(t, err));
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <ErrorText>{error}</ErrorText>
      <input value={f.title} onChange={(e) => set("title")(e.target.value)} placeholder={t("erp.office.meetings.titlePh")} aria-label={t("erp.office.meetings.titlePh")} className={inputCls} />
      <div className="grid gap-2 sm:grid-cols-4">
        <select value={f.kind} onChange={(e) => set("kind")(e.target.value)} aria-label={t("erp.office.kindLabel")} className={inputCls}>
          {["internal", "external"].map((k) => (
            <option key={k} value={k}>
              {t(`erp.office.meetingKind.${k}`)}
            </option>
          ))}
        </select>
        <input type="date" value={f.date} onChange={(e) => set("date")(e.target.value)} aria-label={t("erp.office.date")} className={`${inputCls} [color-scheme:dark]`} />
        <input type="time" value={f.time} onChange={(e) => set("time")(e.target.value)} aria-label={t("erp.office.time")} className={`${inputCls} [color-scheme:dark]`} />
        <select value={f.minutes} onChange={(e) => set("minutes")(Number(e.target.value))} aria-label={t("erp.office.meetings.length")} className={inputCls}>
          {[15, 30, 45, 60, 90, 120, 180, 240].map((m) => (
            <option key={m} value={m}>
              {t("erp.office.meetings.minutesN", { n: m })}
            </option>
          ))}
        </select>
      </div>
      <input value={f.place} onChange={(e) => set("place")(e.target.value)} placeholder={t("erp.office.meetings.place")} className={inputCls} />
      <div className="space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {f.participants.map((id) => {
            const p = lookup.people.find((x) => x.id === id);
            return (
              <button key={id} type="button" onClick={() => set("participants")(f.participants.filter((x) => x !== id))} className="rounded-full bg-white/10 px-2.5 py-1 text-xs text-white hover:bg-red-500/20">
                {p?.name || "…"} ×
              </button>
            );
          })}
        </div>
        <PickSelect
          value={pick}
          onChange={(id) => {
            if (id && !f.participants.includes(id)) set("participants")([...f.participants, id]);
            setPick("");
          }}
          list={lookup.people.filter((p) => !f.participants.includes(p.id))}
          placeholder={t("erp.office.pick.participant")}
        />
      </div>
      <input value={f.guests} onChange={(e) => set("guests")(e.target.value)} placeholder={t("erp.office.meetings.guests")} className={inputCls} />
      <div className="grid gap-2 sm:grid-cols-2">
        <PickSelect value={f.client} onChange={set("client")} list={lookup.clients} placeholder={t("erp.office.pick.client")} />
        <PickSelect value={f.project} onChange={set("project")} list={lookup.projects} placeholder={t("erp.office.pick.project")} />
      </div>
      <textarea value={f.agenda} onChange={(e) => set("agenda")(e.target.value)} rows={4} placeholder={t("erp.office.meetings.agendaPh")} className={inputCls} />
      {!meeting && <p className="text-xs text-white/45">{t("erp.office.meetings.inviteHint")}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button loading={busy} disabled={!f.title.trim() || !f.date} onClick={save}>
          {t("common.save")}
        </Button>
      </div>
    </div>
  );
}

// One meeting: details, agenda, the minutes (save / share), decisions → tracked items.
function MeetingWindow({ meeting, lookup, onClose, onChanged, onOpenItem }) {
  const { t, lang } = useLanguage();
  const [m, setM] = useState(meeting);
  const [minutes, setMinutes] = useState(meeting.minutes);
  const [decision, setDecision] = useState({ text: "", owner: "", due: "week" });
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function patch(body, key) {
    setBusy(key);
    setError("");
    try {
      const d = await api(`/api/office/meetings/${m.id}`, { method: "PATCH", body });
      setM(d.meeting);
      onChanged?.();
      return d.meeting;
    } catch (err) {
      setError(errorText(t, err));
      return null;
    } finally {
      setBusy("");
    }
  }

  return (
    <Modal open onClose={onClose} title={m.title} wide>
      <ErrorText>{error}</ErrorText>
      {editing ? (
        <MeetingForm
          meeting={m}
          lookup={lookup}
          onCancel={() => setEditing(false)}
          onSaved={(next) => {
            setM(next);
            setEditing(false);
            onChanged?.();
          }}
        />
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-white/75">
            <span>
              {formatDate(m.start, lang)} · {formatClock(m.start, lang)}–{formatClock(m.end, lang)}
            </span>
            {m.place && (
              <span className="flex items-center gap-1">
                <MapPin size={14} /> {/^https?:\/\//.test(m.place) ? <a href={m.place} target="_blank" rel="noreferrer" className="text-sky-300 hover:underline">{m.place}</a> : m.place}
              </span>
            )}
            <span className="rounded-full bg-white/5 px-2 py-0.5 text-xs">{t(`erp.office.meetingKind.${m.kind}`)}</span>
            <span className="rounded-full bg-white/5 px-2 py-0.5 text-xs">{t(`erp.office.meetingStatus.${m.status}`)}</span>
            <button type="button" onClick={() => setEditing(true)} className="ms-auto text-xs text-brand-orange hover:underline">
              {t("common.edit")}
            </button>
          </div>
          {(m.participants.length > 0 || m.guests) && (
            <p className="flex flex-wrap items-center gap-1.5 text-xs text-white/60">
              <Users size={14} />
              {m.participants.map((p) => p.name).join("، ")}
              {m.guests && <span className="text-white/45"> + {m.guests}</span>}
            </p>
          )}
          {(m.client || m.project) && <p className="text-xs text-white/55">{[m.client?.name, m.project && [m.project.code, m.project.name].filter(Boolean).join(" · ")].filter(Boolean).join(" — ")}</p>}
          {m.agenda && (
            <div>
              <p className="mb-1 text-xs font-semibold text-white/60">{t("erp.office.meetings.agenda")}</p>
              <p className="whitespace-pre-wrap rounded-xl bg-white/[0.03] p-3 text-sm text-white/80">{m.agenda}</p>
            </div>
          )}

          <div>
            <p className="mb-1 text-xs font-semibold text-white/60">{t("erp.office.meetings.minutes")}</p>
            <textarea value={minutes} onChange={(e) => setMinutes(e.target.value)} rows={6} placeholder={t("erp.office.meetings.minutesPh")} className={inputCls} />
            <div className="mt-2 flex flex-wrap gap-2">
              <Button variant="ghost" loading={busy === "save"} disabled={minutes === m.minutes} onClick={() => patch({ action: "minutes", text: minutes }, "save")}>
                {t("erp.office.meetings.saveMinutes")}
              </Button>
              <Button loading={busy === "share"} disabled={!minutes.trim() || !m.participants.length} onClick={() => patch({ action: "minutes", text: minutes, share: true }, "share")}>
                {t("erp.office.meetings.shareMinutes")}
              </Button>
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold text-white/60">{t("erp.office.meetings.decisions")}</p>
            <div className="space-y-2">
              {m.decisions.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => d.item && onOpenItem?.({ id: d.item })}
                  className="flex w-full items-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2 text-start text-sm text-white hover:border-white/20"
                >
                  <CheckCircle2 size={14} className="shrink-0 text-emerald-300" />
                  <span className="min-w-0 flex-1 truncate">{d.text}</span>
                  <span className="text-[11px] text-white/50">{[d.owner?.name, d.due && formatDate(d.due, lang)].filter(Boolean).join(" · ")}</span>
                </button>
              ))}
            </div>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
              <input value={decision.text} onChange={(e) => setDecision((x) => ({ ...x, text: e.target.value }))} placeholder={t("erp.office.meetings.decisionPh")} className={`${inputCls} flex-1`} />
              <PickSelect value={decision.owner} onChange={(v) => setDecision((x) => ({ ...x, owner: v }))} list={lookup.people} placeholder={t("erp.office.meetings.owner")} className="sm:w-44" />
              <Button
                disabled={!decision.text.trim()}
                loading={busy === "decision"}
                onClick={async () => {
                  if (await patch({ action: "decision", ...decision }, "decision")) setDecision({ text: "", owner: "", due: "week" });
                }}
              >
                {t("erp.office.meetings.addDecision")}
              </Button>
            </div>
            <div className="mt-2">
              <DueChips value={decision.due} onChange={(v) => setDecision((x) => ({ ...x, due: v }))} />
            </div>
            <p className="mt-1 text-[11px] text-white/40">{t("erp.office.meetings.decisionHint")}</p>
          </div>

          <div className="flex flex-wrap gap-2 border-t border-white/10 pt-4">
            {m.status !== "held" && (
              <Button variant="ghost" loading={busy === "held"} onClick={() => patch({ action: "status", to: "held" }, "held")}>
                <CheckCircle2 size={15} /> {t("erp.office.meetings.markHeld")}
              </Button>
            )}
            {m.status === "scheduled" && (
              <Button variant="danger" loading={busy === "cancelled"} onClick={() => patch({ action: "status", to: "cancelled" }, "cancelled")}>
                <XCircle size={15} /> {t("erp.office.meetings.cancel")}
              </Button>
            )}
            {m.status === "cancelled" && (
              <Button variant="ghost" loading={busy === "scheduled"} onClick={() => patch({ action: "status", to: "scheduled" }, "scheduled")}>
                {t("erp.office.meetings.restore")}
              </Button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
