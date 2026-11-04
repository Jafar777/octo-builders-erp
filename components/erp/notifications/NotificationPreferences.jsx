"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { api, errorText } from "@/lib/clientApi";
import { Button, Card, ErrorText, Select, Toggle } from "@/components/erp/ui/fields";
import { SkeletonText } from "@/components/erp/ui/Loading";

// Personal choices: which groups to receive, email mode, daily digest, sound.
export default function NotificationPreferences() {
  const { t } = useLanguage();
  const [prefs, setPrefs] = useState(null);
  const [groups, setGroups] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/api/notifications/preferences")
      .then((d) => {
        setPrefs(d.preferences);
        setGroups(d.groups);
      })
      .catch((err) => setError(errorText(t, err)));
  }, [t]);

  async function save() {
    setSaving(true);
    setError("");
    try {
      const d = await api("/api/notifications/preferences", { method: "PUT", body: prefs });
      setPrefs(d.preferences);
      window.dispatchEvent(new CustomEvent("octo:notification-prefs", { detail: d.preferences }));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setSaving(false);
    }
  }

  if (!prefs) return <Card>{error ? <ErrorText>{error}</ErrorText> : <SkeletonText lines={5} />}</Card>;
  const toggleGroup = (g, on) => setPrefs((p) => ({ ...p, muted: on ? p.muted.filter((x) => x !== g) : [...p.muted, g] }));

  return (
    <Card className="animate-fade-up space-y-5">
      <div>
        <p className="font-semibold">{t("erp.notifPrefs.receive")}</p>
        <p className="mt-1 text-xs text-white/60">{t("erp.notifPrefs.receiveHint")}</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {groups.map((g) => (
            <Toggle key={g} checked={!prefs.muted.includes(g)} onChange={(on) => toggleGroup(g, on)} label={t(`erp.notifPrefs.group.${g}`)} />
          ))}
        </div>
      </div>
      <div className="grid gap-4 border-t border-white/10 pt-4 sm:grid-cols-2">
        <Select
          label={t("erp.notifPrefs.email")}
          value={prefs.email}
          onChange={(email) => setPrefs((p) => ({ ...p, email }))}
          options={["important", "all", "none"].map((m) => ({ value: m, label: t(`erp.notifPrefs.email_${m}`) }))}
        />
        <div className="space-y-3 sm:pt-7">
          <Toggle checked={prefs.digest} onChange={(digest) => setPrefs((p) => ({ ...p, digest }))} label={t("erp.notifPrefs.digest")} />
          <Toggle checked={prefs.sound} onChange={(sound) => setPrefs((p) => ({ ...p, sound }))} label={t("erp.notifPrefs.sound")} />
        </div>
      </div>
      <ErrorText>{error}</ErrorText>
      <div className="flex items-center gap-3">
        <Button onClick={save} loading={saving}>
          {t("common.save")}
        </Button>
        {saved && <span className="text-sm text-emerald-300">{t("common.saved")}</span>}
      </div>
    </Card>
  );
}
