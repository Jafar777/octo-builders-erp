"use client";

import { useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Loader2, Plus, X } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { uploadFileToImageKit } from "@/lib/uploadFile";
import { moveItem } from "@/components/dashboard/ItemList";

export default function GalleryUploader({ images, onChange }) {
  const { t, dir } = useLanguage();
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState("");

  async function handleChange(e) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setError("");
    setUploading(files.length);
    const results = await Promise.allSettled(
      files.map((file) =>
        uploadFileToImageKit(file).finally(() => setUploading((n) => n - 1))
      )
    );
    const urls = results.filter((r) => r.status === "fulfilled").map((r) => r.value.url);
    if (urls.length < files.length) setError(t("errors.server_error"));
    if (urls.length) onChange([...images, ...urls]);
    if (inputRef.current) inputRef.current.value = "";
  }

  const Before = dir === "rtl" ? ArrowRight : ArrowLeft;
  const After = dir === "rtl" ? ArrowLeft : ArrowRight;

  return (
    <div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {images.map((src, i) => (
          <div key={src + i} className="group relative aspect-square overflow-hidden rounded-lg border border-white/10 bg-white/5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="" className="h-full w-full object-cover" />
            <div className="absolute inset-0 flex items-end justify-between bg-black/50 p-1 opacity-0 transition-opacity group-hover:opacity-100">
              <button type="button" onClick={() => onChange(moveItem(images, i, i - 1))} disabled={i === 0} className="rounded bg-black/60 p-1 text-white disabled:opacity-30" aria-label={t("dashboard.moveUp")}>
                <Before size={12} />
              </button>
              <button type="button" onClick={() => onChange(images.filter((_, j) => j !== i))} className="rounded bg-red-500/80 p-1 text-white" aria-label={t("dashboard.remove")}>
                <X size={12} />
              </button>
              <button type="button" onClick={() => onChange(moveItem(images, i, i + 1))} disabled={i === images.length - 1} className="rounded bg-black/60 p-1 text-white disabled:opacity-30" aria-label={t("dashboard.moveDown")}>
                <After size={12} />
              </button>
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading > 0}
          className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-white/20 text-xs text-white/60 transition-colors hover:border-white/40 hover:text-white disabled:opacity-60"
        >
          {uploading > 0 ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
          {uploading > 0 ? `${t("dashboard.uploading")} (${uploading})` : t("dashboard.addImages")}
        </button>
      </div>
      <input ref={inputRef} type="file" accept="image/*" multiple onChange={handleChange} className="hidden" />
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  );
}
