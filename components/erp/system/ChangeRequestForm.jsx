"use client";

import { useState } from "react";
import Link from "next/link";
import { Bug, Eye, ExternalLink, ImagePlus, MapPin, Sparkles, X } from "lucide-react";
import { uploadFile } from "@/lib/uploadFile";
import { PAGES } from "@/lib/permissions";
import { useLanguage } from "@/context/LanguageContext";
import { api, errorText } from "@/lib/clientApi";
import Modal from "@/components/erp/ui/Modal";
import { Button, ErrorText, Input, Label, Select } from "@/components/erp/ui/fields";
import { useToast } from "@/components/erp/ui/Feedback";

const CHANGES_FOLDER = "/octabuilders/changes";
const MAX_IMAGES = 6;
const area = "w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm outline-none focus:border-white/30";

// The CEO's request to the programmer (POST /api/change-log): bug or feature, an
// optional title, what it is (required), and where they were when they asked.
// `page`: { path, key, label, tab } — where they are, the default place; they can pick
// another page and change the tab. `viewAs`: whose view they have ("View as"), shown.
export default function ChangeRequestForm({ open, onClose, page, onSent, viewAs = "" }) {
  const { t } = useLanguage();
  const toast = useToast();
  const [type, setType] = useState("bug");
  const [summary, setSummary] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  // Pictures of the problem: chosen, dropped or pasted (a screenshot with Ctrl+V).
  const [images, setImages] = useState([]);
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState("");
  // The place, from the page they're on each time the form opens.
  const [place, setPlace] = useState(page);
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setPlace(page);
  }
  // Another page: its own address and name, no tab; back to theirs: as it was.
  const pickPage = (key) => {
    if (key === page?.key) return setPlace(page);
    const p = PAGES.find((x) => x.key === key);
    if (p) setPlace({ path: p.href, key: p.key, label: t(`erp.nav.${p.key}`), tab: "" });
  };

  async function addFiles(files) {
    const list = [...files].filter((f) => /^image\/(png|jpe?g|gif|webp)$/.test(f.type)).slice(0, MAX_IMAGES - images.length);
    if (!list.length) return;
    setError("");
    setUploading((n) => n + list.length);
    await Promise.all(
      list.map(async (file) => {
        try {
          const ext = file.type.split("/")[1].replace("jpeg", "jpg");
          const named = file.name && /\.[a-z0-9]+$/i.test(file.name) ? file : new File([file], `screenshot.${ext}`, { type: file.type });
          const up = await uploadFile(named, { folder: CHANGES_FOLDER });
          setImages((x) => (x.length < MAX_IMAGES ? [...x, { url: up.url, name: file.name || "" }] : x));
        } catch (err) {
          setError(errorText(t, err));
        } finally {
          setUploading((n) => n - 1);
        }
      })
    );
  }

  async function send() {
    if (!summary.trim()) return setError(t("errors.change_summary_required"));
    setBusy(true);
    setError("");
    try {
      const { ticket } = await api("/api/change-log", { method: "POST", body: { type, summary, title, page: place, images } });
      toast({ text: t("erp.changes.sent", { code: ticket.code }) });
      setSummary("");
      setTitle("");
      setType("bug");
      setImages([]);
      onSent?.(ticket);
      onClose();
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t("erp.changes.formTitle")}>
      <div className="space-y-4">
        {viewAs && (
          <p className="flex items-center gap-1.5 rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            <Eye size={13} /> {t("erp.changes.viewingAs", { name: viewAs })}
          </p>
        )}
        <div className="flex gap-2">
          {[
            ["bug", Bug],
            ["feature", Sparkles],
          ].map(([key, Icon]) => (
            <button
              key={key}
              type="button"
              onClick={() => setType(key)}
              data-active={type === key}
              className="flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1 text-xs text-white/60 data-[active=true]:border-brand-orange/60 data-[active=true]:bg-brand-orange/15 data-[active=true]:text-white"
            >
              <Icon size={13} /> {t(`erp.changes.type.${key}`)}
            </button>
          ))}
        </div>
        <Input label={t("erp.changes.title")} value={title} onChange={setTitle} />
        <div>
          <Label>{t("erp.changes.summary")}</Label>
          <textarea
            rows={5}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            onPaste={(e) => {
              const files = [...(e.clipboardData?.files || [])];
              if (files.some((f) => f.type.startsWith("image/"))) {
                e.preventDefault();
                addFiles(files);
              }
            }}
            placeholder={t("erp.changes.summaryHint")}
            className={area}
          />
        </div>
        {/* Pictures of the problem (change request CR-1). */}
        <div
          className="space-y-2"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            addFiles(e.dataTransfer.files);
          }}
        >
          <Label>{t("erp.changes.images")}</Label>
          <div className="flex flex-wrap gap-2">
            {images.map((img) => (
              <div key={img.url} className="relative h-20 w-20 overflow-hidden rounded-xl border border-white/10">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.url} alt={img.name} className="h-full w-full object-cover" />
                <button
                  type="button"
                  aria-label={t("common.delete")}
                  onClick={() => setImages((x) => x.filter((i) => i.url !== img.url))}
                  className="absolute end-1 top-1 rounded-full bg-black/60 p-0.5 text-white hover:bg-red-500"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
            {Array.from({ length: uploading }, (_, i) => (
              <div key={`u${i}`} className="h-20 w-20 animate-pulse rounded-xl bg-white/10" />
            ))}
            {images.length + uploading < MAX_IMAGES && (
              <label className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-white/20 text-[11px] text-white/55 hover:bg-white/5">
                <ImagePlus size={18} />
                {t("erp.changes.addImage")}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/webp"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    addFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>
            )}
          </div>
          <p className="text-[11px] text-white/45">{t("erp.changes.imagesHint")}</p>
        </div>
        {/* Where: the page they're on (and its tab), with a link — they may pick another. */}
        <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <p className="flex items-center gap-1.5 text-xs font-medium text-white/70">
            <MapPin size={13} /> {t("erp.changes.where")}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Select
              label={t("erp.changes.wherePage")}
              value={place?.key || ""}
              onChange={pickPage}
              options={PAGES.map((p) => ({ value: p.key, label: t(`erp.nav.${p.key}`) }))}
            />
            <Input label={t("erp.changes.whereTab")} value={place?.tab || ""} onChange={(v) => setPlace((x) => ({ ...x, tab: v }))} />
          </div>
          {place?.path && (
            <Link href={place.path} target="_blank" className="inline-flex max-w-full items-center gap-1 truncate text-xs text-brand-orange hover:underline" dir="ltr">
              <ExternalLink size={12} className="shrink-0" /> {place.path}
            </Link>
          )}
        </div>
        <ErrorText>{error}</ErrorText>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={send} loading={busy} disabled={!summary.trim() || uploading > 0}>
            {t("erp.changes.send")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
