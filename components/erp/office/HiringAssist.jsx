"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarPlus, FileText, Plus } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { api, errorText } from "@/lib/clientApi";
import { uploadFile } from "@/lib/uploadFile";
import { formatDate } from "@/lib/formatTime";
import Modal from "@/components/erp/ui/Modal";
import { Button, ErrorText } from "@/components/erp/ui/fields";
import { SkeletonList } from "@/components/erp/ui/Loading";
import { EmptyState } from "@/components/erp/ui/DataTools";
import { inputCls } from "@/components/erp/office/officeUi";

// CVs go to their own private folder (lib/uploadAccess.js): hiring people and the office.
const CV_FOLDER = "/octabuilders/cv";

// Helping with hiring (recruitment.assist): add a candidate with their CV to an open
// position, and book interview dates. Offers and hiring stay with Recruitment.
export default function HiringAssist() {
  const { t, lang } = useLanguage();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [booking, setBooking] = useState(null);

  const load = useCallback(() => {
    api("/api/recruitment/openings")
      .then(setData)
      .catch((err) => setError(errorText(t, err)));
  }, [t]);
  useEffect(() => {
    load();
  }, [load]);

  const openingName = (id) => data?.openings.find((o) => o.id === id)?.title || "";
  const today = new Date().toISOString().slice(0, 10);
  const candidates = (data?.candidates || []).filter((c) => !["hired", "rejected"].includes(c.stage));
  const openPositions = (data?.openings || []).filter((o) => o.status === "open");

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <p className="text-xs text-white/55">{t("erp.office.hiring.hint")}</p>
        <Button className="ms-auto" disabled={!openPositions.length} onClick={() => setAdding(true)}>
          <Plus size={16} /> {t("erp.office.hiring.add")}
        </Button>
      </div>
      {data && !openPositions.length && <p className="text-xs text-amber-200">{t("erp.office.hiring.noOpenings")}</p>}
      <ErrorText>{error}</ErrorText>
      {!data && !error && <SkeletonList rows={4} />}
      {data && candidates.length === 0 && <EmptyState compact text={t("erp.office.hiring.none")} />}
      <div className="space-y-2">
        {candidates.map((c) => {
          const next = (c.interviews || []).map((i) => i.date).filter((d) => d >= today).sort()[0];
          return (
            <div key={c.id} data-entity={`candidate:${c.id}`} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-white">
                  {c.name} <span className="text-white/45">· {openingName(c.opening)}</span>
                </p>
                <p className="mt-0.5 text-[11px] text-white/50" dir="auto">
                  {[c.phone, c.email, t(`erp.recruitment.stage.${c.stage}`)].filter(Boolean).join(" · ")}
                  {next && <span className={`ms-2 ${next === today ? "text-amber-300" : "text-sky-300"}`}>{t("erp.office.hiring.interviewOn", { date: formatDate(`${next}T12:00:00`, lang) })}</span>}
                </p>
              </div>
              {c.cvUrl && (
                <a href={c.cvUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-sky-300">
                  <FileText size={14} /> CV
                </a>
              )}
              <Button variant="ghost" onClick={() => setBooking(c)}>
                <CalendarPlus size={15} /> {t("erp.office.hiring.book")}
              </Button>
            </div>
          );
        })}
      </div>
      <Modal open={adding} onClose={() => setAdding(false)} title={t("erp.office.hiring.add")}>
        {adding && (
          <AddCandidate
            openings={openPositions}
            onCancel={() => setAdding(false)}
            onSaved={() => {
              setAdding(false);
              load();
            }}
          />
        )}
      </Modal>
      <Modal open={Boolean(booking)} onClose={() => setBooking(null)} title={booking ? `${t("erp.office.hiring.book")} · ${booking.name}` : ""}>
        {booking && (
          <BookInterview
            candidate={booking}
            onCancel={() => setBooking(null)}
            onSaved={() => {
              setBooking(null);
              load();
            }}
          />
        )}
      </Modal>
    </div>
  );
}

function AddCandidate({ openings, onSaved, onCancel }) {
  const { t } = useLanguage();
  const [f, setF] = useState({ opening: openings[0]?.id || "", name: "", phone: "", email: "", cvUrl: "", source: "" });
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(null);
  const [error, setError] = useState("");
  const input = useRef(null);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));

  async function attach(file) {
    if (!file) return;
    setError("");
    try {
      setUploading(0);
      const r = await uploadFile(file, { folder: CV_FOLDER, onProgress: setUploading });
      // The candidate's CV field takes a full address.
      set("cvUrl")(new URL(r.url, window.location.origin).toString());
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setUploading(null);
    }
  }

  async function save() {
    setBusy(true);
    setError("");
    try {
      await api("/api/recruitment/candidates", { method: "POST", body: f });
      onSaved();
    } catch (err) {
      setError(errorText(t, err));
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <ErrorText>{error}</ErrorText>
      <select value={f.opening} onChange={(e) => set("opening")(e.target.value)} aria-label={t("erp.office.hiring.opening")} className={inputCls}>
        {openings.map((o) => (
          <option key={o.id} value={o.id}>
            {o.title}
          </option>
        ))}
      </select>
      <input value={f.name} onChange={(e) => set("name")(e.target.value)} placeholder={t("erp.office.contactName")} aria-label={t("erp.office.contactName")} className={inputCls} />
      <div className="grid gap-2 sm:grid-cols-2">
        <input value={f.phone} onChange={(e) => set("phone")(e.target.value)} placeholder={t("erp.office.contactPhone")} dir="ltr" className={inputCls} />
        <input value={f.email} onChange={(e) => set("email")(e.target.value)} placeholder={t("erp.office.clients.email")} dir="ltr" className={inputCls} />
      </div>
      <div className="flex gap-2">
        <input value={f.cvUrl} onChange={(e) => set("cvUrl")(e.target.value)} placeholder={t("erp.office.hiring.cvLink")} dir="ltr" className={`${inputCls} flex-1`} />
        <input ref={input} type="file" hidden accept=".pdf,.doc,.docx,image/*" onChange={(e) => attach(e.target.files?.[0])} />
        <Button variant="ghost" loading={uploading !== null} onClick={() => input.current?.click()}>
          {uploading !== null ? `${uploading}%` : t("erp.office.hiring.uploadCv")}
        </Button>
      </div>
      <input value={f.source} onChange={(e) => set("source")(e.target.value)} placeholder={t("erp.office.hiring.source")} className={inputCls} />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button loading={busy} disabled={!f.name.trim() || !f.opening || uploading !== null} onClick={save}>
          {t("common.save")}
        </Button>
      </div>
    </div>
  );
}

function BookInterview({ candidate, onSaved, onCancel }) {
  const { t } = useLanguage();
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    setBusy(true);
    setError("");
    try {
      await api(`/api/recruitment/candidates/${candidate.id}`, { method: "PATCH", body: { interview: { date } } });
      onSaved();
    } catch (err) {
      setError(errorText(t, err));
      setBusy(false);
    }
  }
  return (
    <div className="space-y-3">
      <ErrorText>{error}</ErrorText>
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label={t("erp.office.date")} className={`${inputCls} [color-scheme:dark]`} />
      <p className="text-xs text-white/45">{t("erp.office.hiring.bookHint")}</p>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button loading={busy} disabled={!date} onClick={save}>
          {t("common.save")}
        </Button>
      </div>
    </div>
  );
}
