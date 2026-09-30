"use client";

import { useRef, useState } from "react";
import { Upload, Loader2 } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { uploadFileToImageKit } from "@/lib/uploadFile";

export default function MediaUploader({ accept = "image/*", onUploaded, previewUrl, kind = "image" }) {
  const { t } = useLanguage();
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");

  async function handleChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setProgress(0);
    setUploading(true);
    try {
      const result = await uploadFileToImageKit(file, { onProgress: setProgress });
      onUploaded(result.url);
    } catch {
      setError(t("errors.server_error"));
    } finally {
      setUploading(false);
      setProgress(0);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div>
      <div className="flex items-center gap-4">
        <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-white/5">
          {previewUrl ? (
            kind === "video" ? (
              <video src={previewUrl} className="h-full w-full object-cover" muted />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt="" className="h-full w-full object-cover" />
            )
          ) : (
            <Upload size={20} className="text-white/30" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/10 disabled:opacity-60"
          >
            {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
            {uploading ? `${t("dashboard.uploading")} ${progress}%` : t("dashboard.uploadMedia")}
          </button>
          <input ref={inputRef} type="file" accept={accept} onChange={handleChange} className="hidden" />

          {uploading && (
            <div className="mt-2 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-brand-orange transition-[width] duration-150 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
        </div>
      </div>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  );
}
