"use client";

import { useRef, useState } from "react";
import { FileText, Loader2, Paperclip, Trash2 } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";
import { api, errorText } from "@/lib/clientApi";
import { formatDate } from "@/lib/formatTime";
import { uploadFileToImageKit } from "@/lib/uploadFile";
import { Button, Card, ErrorText, Input } from "@/components/erp/ui/fields";

const MAX_MB = 25;

// Emergency contact of one employee. `data` is the /api/hr/employees/[id] response.
export function EmergencyContactCard({ userId, data }) {
  const { t } = useLanguage();
  const [contact, setContact] = useState(data.profile.emergencyContact);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  async function saveContact() {
    setError("");
    try {
      await api(`/api/hr/employees/${userId}`, { method: "PATCH", body: { emergencyContact: contact } });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(errorText(t, err));
    }
  }

  return (
    <Card className="space-y-4">
      <p className="font-semibold">{t("erp.hrFile.emergency")}</p>
      <div className="grid gap-4 sm:grid-cols-3">
        <Input label={t("erp.hrFile.contactName")} value={contact.name} onChange={(name) => setContact((c) => ({ ...c, name }))} />
        <Input label={t("erp.staff.phone")} value={contact.phone} onChange={(phone) => setContact((c) => ({ ...c, phone }))} dir="ltr" />
        <Input label={t("erp.hrFile.relation")} value={contact.relation} onChange={(relation) => setContact((c) => ({ ...c, relation }))} />
      </div>
      <div className="flex items-center gap-3">
        <Button variant="ghost" onClick={saveContact}>
          {t("common.save")}
        </Button>
        {saved && <span className="text-sm text-emerald-300">{t("common.saved")}</span>}
      </div>
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}

// Documents (contract, ID copy, certificates) of one employee; `onChanged` reloads `data`.
export function DocumentsCard({ userId, data, onChanged }) {
  const { t, lang } = useLanguage();
  const { user } = useAuth();
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState("");
  const fileRef = useRef(null);
  const isHr = user?.permissions?.includes("attendance.manage");

  async function upload(e) {
    const files = Array.from(e.target.files || []);
    if (fileRef.current) fileRef.current.value = "";
    setError("");
    for (const file of files) {
      if (file.size > MAX_MB * 1024 * 1024) {
        setError(t("errors.file_too_large", { mb: MAX_MB }));
        continue;
      }
      setUploading((n) => n + 1);
      try {
        const r = await uploadFileToImageKit(file);
        await api(`/api/hr/employees/${userId}/documents`, {
          method: "POST",
          body: { name: file.name, url: r.url, fileId: r.fileId, mime: file.type, size: file.size },
        });
      } catch (err) {
        setError(errorText(t, err));
      } finally {
        setUploading((n) => n - 1);
      }
    }
    onChanged?.();
  }

  async function remove(doc) {
    if (!window.confirm(t("common.confirmDelete"))) return;
    try {
      await api(`/api/hr/employees/${userId}/documents/${doc.id}`, { method: "DELETE" });
      onChanged?.();
    } catch (err) {
      setError(errorText(t, err));
    }
  }

  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="font-semibold">{t("erp.hrFile.documents")}</p>
        <Button variant="ghost" onClick={() => fileRef.current?.click()} disabled={uploading > 0}>
          {uploading > 0 ? <Loader2 size={15} className="animate-spin" /> : <Paperclip size={15} />}
          {uploading > 0 ? t("dashboard.uploading") : t("erp.hrFile.upload")}
        </Button>
        <input ref={fileRef} type="file" multiple className="hidden" onChange={upload} />
      </div>
      <div className="space-y-1.5">
        {data.documents.map((d) => (
          <div key={d.id} className="flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2 text-sm">
            <FileText size={16} className="shrink-0 text-white/50" />
            <a href={d.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate hover:text-brand-orange">
              {d.name}
            </a>
            <span className="shrink-0 text-xs text-white/40">{formatDate(d.uploadedAt, lang)}</span>
            {(isHr || d.uploadedBy === user?.id) && (
              <button type="button" onClick={() => remove(d)} className="text-red-400" aria-label={t("common.delete")}>
                <Trash2 size={14} />
              </button>
            )}
          </div>
        ))}
        {data.documents.length === 0 && <p className="text-sm text-white/40">{t("erp.hrFile.noDocuments")}</p>}
      </div>
      <p className="text-xs text-white/35">{t("erp.hrFile.privacy")}</p>
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}

// Emergency contact + documents of one employee (their own "My file").
export default function HrFile({ userId, data, onChanged }) {
  return (
    <>
      <EmergencyContactCard userId={userId} data={data} />
      <DocumentsCard userId={userId} data={data} onChanged={onChanged} />
    </>
  );
}
