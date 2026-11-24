"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, CheckCircle2, ExternalLink, Paperclip, Plus } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { api, errorText } from "@/lib/clientApi";
import { uploadFile } from "@/lib/uploadFile";
import { formatDate } from "@/lib/formatTime";
import { CORRESPONDENCE_CHANNELS } from "@/lib/office";
import Modal from "@/components/erp/ui/Modal";
import { Button, ErrorText } from "@/components/erp/ui/fields";
import { SkeletonList } from "@/components/erp/ui/Loading";
import { EmptyState } from "@/components/erp/ui/DataTools";
import { SearchBox } from "@/components/erp/ui/ListControls";
import { inputCls, PickSelect } from "@/components/erp/office/officeUi";

const OFFICE_FOLDER = "/octabuilders/office";

// The register of incoming and outgoing files and letters (IN- / OUT-year-n): with whom,
// how, the file or its Drive link, and who received it.
export default function CorrespondenceView({ lookup, refreshKey }) {
  const { t, lang } = useLanguage();
  const [direction, setDirection] = useState("");
  const [q, setQ] = useState("");
  const [list, setList] = useState(null);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(null);

  const load = useCallback(() => {
    const p = new URLSearchParams();
    if (direction) p.set("direction", direction);
    if (q.trim()) p.set("q", q.trim());
    api(`/api/office/correspondence?${p}`)
      .then((d) => setList(d.correspondence))
      .catch((err) => setError(errorText(t, err)));
  }, [direction, q, t]);
  useEffect(() => {
    const timer = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(timer);
  }, [load, q, refreshKey]);

  const received = (c) => api(`/api/office/correspondence/${c.id}`, { method: "PATCH", body: { received: true } }).then(load);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-xl border border-white/10 p-1">
          {["", "in", "out"].map((d) => (
            <button key={d || "all"} type="button" onClick={() => setDirection(d)} className={`rounded-lg px-3 py-1.5 text-xs ${direction === d ? "bg-brand-orange text-white" : "text-white/60 hover:text-white"}`}>
              {t(`erp.office.corr.filter.${d || "all"}`)}
            </button>
          ))}
        </div>
        <SearchBox value={q} onChange={setQ} placeholder={t("erp.office.corr.search")} />
        <div className="ms-auto flex gap-2">
          <Button variant="ghost" onClick={() => setAdding("in")}>
            <ArrowDownToLine size={15} /> {t("erp.office.corr.newIn")}
          </Button>
          <Button onClick={() => setAdding("out")}>
            <ArrowUpFromLine size={15} /> {t("erp.office.corr.newOut")}
          </Button>
        </div>
      </div>
      <ErrorText>{error}</ErrorText>
      {!list && !error && <SkeletonList rows={5} avatar={false} />}
      {list?.length === 0 && <EmptyState compact text={t("erp.office.corr.none")} />}
      <div className="space-y-2">
        {list?.map((c) => (
          <div key={c.id} data-entity={`correspondence:${c.id}`} className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-2">
              {c.direction === "in" ? <ArrowDownToLine size={14} className="text-sky-300" /> : <ArrowUpFromLine size={14} className="text-brand-orange" />}
              <span className="font-mono text-[11px] text-white/45">{c.ref}</span>
              <span className="min-w-0 flex-1 truncate text-sm text-white">{c.subject}</span>
              <span className="text-[11px] text-white/45">{formatDate(`${c.date}T12:00:00`, lang)}</span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-white/55">
              {c.counterparty && <span>{t(c.direction === "in" ? "erp.office.from" : "erp.office.to")}: {c.counterparty}</span>}
              <span>{t(`erp.office.corr.channel.${c.channel}`)}</span>
              {c.client && <span className="text-sky-200/80">{c.client.name}</span>}
              {c.project && <span>{c.project.code || c.project.name}</span>}
              {c.attachments.map((a) => (
                <a key={a.url} href={a.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sky-300 hover:underline">
                  <Paperclip size={11} /> {a.name}
                </a>
              ))}
              {c.links.map((l) => (
                <a key={l} href={l} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sky-300 hover:underline">
                  <ExternalLink size={11} /> {t("erp.office.corr.link")}
                </a>
              ))}
              {c.deliveredTo && <span>{t("erp.office.corr.deliveredTo", { name: c.deliveredTo })}</span>}
              {c.receivedAt ? (
                <span className="inline-flex items-center gap-1 text-emerald-300">
                  <CheckCircle2 size={11} /> {t("erp.office.corr.received", { date: formatDate(c.receivedAt, lang) })}
                </span>
              ) : (
                <button type="button" onClick={() => received(c)} className="text-amber-200 hover:underline">
                  {t(c.direction === "out" ? "erp.office.corr.markReceived" : "erp.office.corr.markHanded")}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      <Modal open={Boolean(adding)} onClose={() => setAdding(null)} title={t(adding === "in" ? "erp.office.corr.newIn" : "erp.office.corr.newOut")} wide>
        {adding && (
          <CorrespondenceForm
            direction={adding}
            lookup={lookup}
            onCancel={() => setAdding(null)}
            onSaved={() => {
              setAdding(null);
              load();
            }}
          />
        )}
      </Modal>
    </div>
  );
}

function CorrespondenceForm({ direction, lookup, onSaved, onCancel }) {
  const { t } = useLanguage();
  const today = new Date();
  const [f, setF] = useState({
    subject: "",
    counterparty: "",
    channel: "email",
    date: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`,
    notes: "",
    link: "",
    client: "",
    project: "",
    deliveredTo: "",
  });
  const [files, setFiles] = useState([]);
  const [progress, setProgress] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const input = useRef(null);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));

  async function addFiles(list) {
    setError("");
    for (const file of list) {
      try {
        setProgress(0);
        const r = await uploadFile(file, { folder: OFFICE_FOLDER, onProgress: setProgress });
        setFiles((x) => [...x, { name: r.name || file.name, url: r.url, size: r.size || file.size, mime: file.type }]);
      } catch (err) {
        setError(errorText(t, err));
      }
    }
    setProgress(null);
  }

  async function save() {
    setBusy(true);
    setError("");
    try {
      await api("/api/office/correspondence", {
        method: "POST",
        body: { direction, ...f, links: f.link ? [f.link] : [], attachments: files, client: f.client || null, project: f.project || null },
      });
      onSaved();
    } catch (err) {
      setError(errorText(t, err));
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <ErrorText>{error}</ErrorText>
      <input value={f.subject} onChange={(e) => set("subject")(e.target.value)} placeholder={t("erp.office.corr.subject")} aria-label={t("erp.office.corr.subject")} className={inputCls} />
      <div className="grid gap-2 sm:grid-cols-3">
        <input value={f.counterparty} onChange={(e) => set("counterparty")(e.target.value)} placeholder={t(direction === "in" ? "erp.office.from" : "erp.office.to")} className={inputCls} />
        <select value={f.channel} onChange={(e) => set("channel")(e.target.value)} aria-label={t("erp.office.channelLabel")} className={inputCls}>
          {CORRESPONDENCE_CHANNELS.map((c) => (
            <option key={c} value={c}>
              {t(`erp.office.corr.channel.${c}`)}
            </option>
          ))}
        </select>
        <input type="date" value={f.date} onChange={(e) => set("date")(e.target.value)} aria-label={t("erp.office.date")} className={`${inputCls} [color-scheme:dark]`} />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <PickSelect value={f.client} onChange={set("client")} list={lookup.clients} placeholder={t("erp.office.pick.client")} />
        <PickSelect value={f.project} onChange={set("project")} list={lookup.projects} placeholder={t("erp.office.pick.project")} />
      </div>
      <input value={f.link} onChange={(e) => set("link")(e.target.value)} placeholder={t("erp.office.linkPlaceholder")} dir="ltr" className={inputCls} />
      <div className="flex flex-wrap items-center gap-2">
        <input ref={input} type="file" multiple hidden onChange={(e) => addFiles([...e.target.files])} />
        <Button variant="ghost" onClick={() => input.current?.click()} loading={progress !== null}>
          <Paperclip size={15} /> {progress !== null ? `${progress}%` : t("erp.office.corr.attach")}
        </Button>
        {files.map((a) => (
          <span key={a.url} className="rounded-lg bg-white/5 px-2 py-1 text-xs text-white/75">
            {a.name}
            <button type="button" aria-label={t("common.delete")} onClick={() => setFiles((x) => x.filter((y) => y.url !== a.url))} className="ms-1 text-red-300">
              ×
            </button>
          </span>
        ))}
      </div>
      <input value={f.deliveredTo} onChange={(e) => set("deliveredTo")(e.target.value)} placeholder={t(direction === "in" ? "erp.office.corr.handedTo" : "erp.office.corr.receiver")} className={inputCls} />
      <textarea value={f.notes} onChange={(e) => set("notes")(e.target.value)} rows={2} placeholder={t("erp.office.corr.notes")} className={inputCls} />
      <p className="text-[11px] text-white/40">{t("erp.office.corr.privateHint")}</p>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button loading={busy} disabled={!f.subject.trim() || progress !== null} onClick={save}>
          <Plus size={15} /> {t("erp.office.corr.register")}
        </Button>
      </div>
    </div>
  );
}
