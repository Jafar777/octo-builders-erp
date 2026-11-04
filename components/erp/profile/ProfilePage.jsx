"use client";

import SecurityCard from "@/components/erp/security/SecurityCard";
import MyAssets from "@/components/erp/purchasing/MyAssets";

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, Mail } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";
import { api, errorText } from "@/lib/clientApi";
import MediaUploader from "@/components/dashboard/MediaUploader";
import NameFields, { initialNames, namesComplete } from "@/components/erp/staff/NameFields";
import { Card, ErrorText, Input, PageHeader } from "@/components/erp/ui/fields";
import { SkeletonText } from "@/components/erp/ui/Loading";
import { DocumentsCard } from "@/components/erp/hr/HrFile";
import { MySkillsCard } from "@/components/erp/hr/SkillRequests";

// Photo, names, phone and emergency contact — saved together on /api/auth/me.
function PersonalCard({ user }) {
  const { t } = useLanguage();
  const { refresh } = useAuth();
  const [names, setNames] = useState(() => initialNames(user));
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl || "");
  const [phone, setPhone] = useState(user.phone || "");
  const [contact, setContact] = useState(user.emergencyContact || { name: "", phone: "", relation: "" });
  const setContactField = (field) => (value) => setContact((c) => ({ ...c, [field]: value }));
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const incomplete = !namesComplete(user);

  async function handleSave() {
    setStatus("saving");
    setError("");
    try {
      await api("/api/auth/me", { method: "PATCH", body: { ...names, avatarUrl, phone, emergencyContact: contact } });
      await refresh();
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 2000);
    } catch (err) {
      setError(errorText(t, err));
      setStatus("idle");
    }
  }

  return (
    <Card className="space-y-6 lg:col-span-2">
      {incomplete && <p className="rounded-xl bg-brand-orange/10 px-4 py-2.5 text-sm text-brand-orange">{t("erp.names.completeProfile")}</p>}
      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <MediaUploader previewUrl={avatarUrl} onUploaded={setAvatarUrl} />
        <div className="space-y-5">
          <NameFields value={names} onChange={setNames} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-sm font-medium text-white/70">{t("erp.profile.email")}</p>
              <p className="flex items-center gap-2 rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3 text-sm text-white/60" dir="ltr">
                <Mail size={15} /> {user.email}
              </p>
            </div>
            <Input label={t("erp.staff.phone")} value={phone} onChange={setPhone} dir="ltr" type="tel" />
          </div>
        </div>
      </div>
      <div className="space-y-3 border-t border-white/10 pt-5">
        <p className="font-semibold">{t("erp.hrFile.emergency")}</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Input label={t("erp.hrFile.contactName")} value={contact.name} onChange={setContactField("name")} />
          <Input label={t("erp.staff.phone")} value={contact.phone} onChange={setContactField("phone")} dir="ltr" type="tel" />
          <Input label={t("erp.hrFile.relation")} value={contact.relation} onChange={setContactField("relation")} />
        </div>
      </div>
      <ErrorText>{error}</ErrorText>
      <button
        type="button"
        onClick={handleSave}
        disabled={status === "saving" || !namesComplete(names)}
        className="flex items-center gap-2 rounded-xl bg-brand-orange px-6 py-2.5 text-sm font-semibold text-white transition-transform hover:scale-[1.01] disabled:opacity-60"
      >
        {status === "saving" && <Loader2 size={16} className="animate-spin" />}
        {status === "saved" && <Check size={16} />}
        {status === "saved" ? t("common.saved") : t("common.save")}
      </button>
    </Card>
  );
}

// Everything an employee fills in about themselves: personal details, skills
// (approved by the general manager) and documents.
export default function ProfilePage() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [file, setFile] = useState(null);
  const meId = user?.id;
  const isStaff = user?.isStaff;

  // Skills and documents belong to the HR file, which only employees with a role have.
  const loadFile = useCallback(() => {
    if (meId && isStaff) api(`/api/hr/employees/${meId}`).then(setFile).catch(() => {});
  }, [meId, isStaff]);
  useEffect(() => {
    loadFile();
  }, [loadFile]);

  return (
    <div>
      <PageHeader title={t("erp.nav.profile")} subtitle={t("erp.profile.subtitle")} />
      {!user ? (
        <Card>
          <SkeletonText lines={6} />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <PersonalCard key={user.id} user={user} />
          {isStaff && <SecurityCard />}
          {isStaff && !user.limited && <MyAssets />}
          {file?.canEditFile && (
            <>
              <MySkillsCard key={`s${file.profile.id}`} userId={user.id} data={file} />
              <div className="lg:col-span-2">
                <DocumentsCard userId={user.id} data={file} onChanged={loadFile} />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
