"use client";

import { useState } from "react";
import { CheckCircle2, Copy, FolderOpen, KeyRound, Loader2, Plus, Trash2, XCircle } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { api, errorText } from "@/lib/clientApi";
import { formatDateTime } from "@/lib/formatTime";
import BilingualField from "@/components/dashboard/BilingualField";
import SaveBar from "@/components/dashboard/SaveBar";
import { Card, Input, Select, Toggle } from "@/components/erp/ui/fields";
import { useConfirm, useToast } from "@/components/erp/ui/Feedback";
import { useTaskLookups } from "@/components/erp/tasks/useTaskLookups";
import { ServerPicker } from "@/components/erp/files/ServerRefs";

// Files page → Connection (files.manage): where the gateway is, its key, the shares,
// who sees what, and where projects and deliveries are filed.
export default function FileServerSettings({ status, onSaved }) {
  const { t, lang } = useLanguage();
  const toast = useToast();
  const confirm = useConfirm();
  const lookups = useTaskLookups();
  const [value, setValue] = useState(() => ({
    ...status.settings,
    volumes: status.settings.volumes.map((v) => ({ ...v, drives: (v.drives || []).join(", ") })),
  }));
  const [save, setSave] = useState({ status: "idle", error: "" });
  const [test, setTest] = useState(null); // { state: "running" | "ok" | "fail", info, error }
  const [key, setKey] = useState(status.key);
  const [newKey, setNewKey] = useState("");
  const [picking, setPicking] = useState(null); // department id | "root"
  const set = (patch) => setValue((v) => ({ ...v, ...patch }));
  const setVolume = (i, patch) => set({ volumes: value.volumes.map((v, j) => (j === i ? { ...v, ...patch } : v)) });
  const folderOf = (dept) => value.departmentFolders.find((d) => d.department === dept)?.path || "";
  const setFolder = (dept, path) =>
    set({ departmentFolders: [...value.departmentFolders.filter((d) => d.department !== dept), ...(path ? [{ department: dept, path }] : [])] });

  async function runTest() {
    const url = String(value.url || "").trim().replace(/\/+$/, "");
    if (!url) return;
    setTest({ state: "running" });
    const started = performance.now();
    try {
      const res = await fetch(`${url}/v1/info`, { cache: "no-store" });
      const info = await res.json();
      if (!info?.ok) throw new Error("bad");
      const missing = value.volumes.map((v) => v.key).filter((k) => k && !info.volumes.includes(k));
      setTest({ state: missing.length ? "fail" : "ok", info, ms: Math.round(performance.now() - started), error: missing.length ? t("erp.files.setup.missingVolumes", { keys: missing.join(", "), have: info.volumes.join(", ") }) : "" });
    } catch {
      setTest({ state: "fail", error: t("erp.files.setup.testFailed") });
    }
  }

  async function makeKey() {
    if (key.configured && !(await confirm({ text: t("erp.files.setup.replaceKeyConfirm"), danger: true }))) return;
    try {
      const { secret } = await api("/api/files/key", { method: "POST" });
      setNewKey(secret);
      setKey({ configured: true, fromEnv: false, createdAt: new Date().toISOString() });
    } catch (err) {
      toast({ text: errorText(t, err), tone: "error" });
    }
  }

  async function saveAll() {
    setSave({ status: "saving", error: "" });
    try {
      await api("/api/settings", { method: "PUT", body: { key: "fileServer", value } });
      setSave({ status: "saved", error: "" });
      setTimeout(() => setSave({ status: "idle", error: "" }), 2000);
      onSaved?.();
    } catch (err) {
      setSave({ status: "idle", error: errorText(t, err) });
    }
  }

  const copy = (text) => navigator.clipboard?.writeText(text).then(() => toast({ text: t("erp.files.copied") }), () => {});
  const keyReady = key.configured;

  return (
    <div className="max-w-4xl space-y-6">
      {/* How it works */}
      <Card className="space-y-4">
        <h2 className="text-lg font-semibold">{t("erp.files.setup.howTitle")}</h2>
        <ol className="space-y-3 text-sm text-white/75">
          {[1, 2, 3, 4].map((n) => (
            <li key={n} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-orange/20 text-xs font-bold text-brand-orange">{n}</span>
              <span className="whitespace-pre-line">{t(`erp.files.setup.step${n}`)}</span>
            </li>
          ))}
        </ol>
        <p className="text-xs text-white/50">{t("erp.files.setup.readme")}</p>
      </Card>

      {/* Connection */}
      <Card className="space-y-5">
        <h2 className="text-lg font-semibold">{t("erp.files.setup.connection")}</h2>
        <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto]">
          <Input label={t("erp.files.setup.url")} value={value.url} onChange={(url) => set({ url })} dir="ltr" placeholder="https://files.example.com" />
          <button type="button" onClick={runTest} disabled={!value.url || test?.state === "running"} className="flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm hover:bg-white/10 disabled:opacity-50">
            {test?.state === "running" && <Loader2 size={15} className="animate-spin" />}
            {t("erp.files.setup.test")}
          </button>
        </div>
        <p className="-mt-2 text-xs text-white/50">{t("erp.files.setup.urlHint")}</p>
        {test && test.state !== "running" && (
          <div className={`flex items-start gap-2 rounded-xl p-3 text-sm ${test.state === "ok" ? "bg-emerald-500/10 text-emerald-200" : "bg-red-500/10 text-red-200"}`}>
            {test.state === "ok" ? <CheckCircle2 size={17} className="mt-0.5 shrink-0" /> : <XCircle size={17} className="mt-0.5 shrink-0" />}
            <span>{test.state === "ok" ? t("erp.files.setup.testOk", { version: test.info.version, ms: test.ms, volumes: test.info.volumes.join(", ") }) : test.error}</span>
          </div>
        )}

        <div className="rounded-xl border border-white/10 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <KeyRound size={18} className={keyReady ? "text-emerald-300" : "text-white/50"} />
              <div>
                <p className="text-sm font-medium">{t("erp.files.setup.key")}</p>
                <p className="text-xs text-white/50">
                  {key.fromEnv ? t("erp.files.setup.keyFromEnv") : keyReady ? t("erp.files.setup.keyMade", { at: formatDateTime(key.createdAt, lang) }) : t("erp.files.setup.keyNone")}
                </p>
              </div>
            </div>
            {!key.fromEnv && (
              <button type="button" onClick={makeKey} className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm hover:bg-white/10">
                {keyReady ? t("erp.files.setup.replaceKey") : t("erp.files.setup.makeKey")}
              </button>
            )}
          </div>
          {newKey && (
            <div className="mt-3 space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/[0.07] p-3">
              <p className="text-xs text-amber-200">{t("erp.files.setup.keyOnce")}</p>
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-lg bg-black/30 px-3 py-2 text-xs" dir="ltr">
                  {newKey}
                </code>
                <button type="button" onClick={() => copy(newKey)} className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 hover:bg-white/10" aria-label={t("erp.files.copy")}>
                  <Copy size={15} />
                </button>
              </div>
            </div>
          )}
        </div>

        <Toggle checked={value.enabled} onChange={(enabled) => set({ enabled })} label={t("erp.files.setup.enabled")} />
        {value.enabled && !keyReady && <p className="text-xs text-amber-200">{t("erp.files.setup.needKey")}</p>}
      </Card>

      {/* Shares */}
      <Card className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">{t("erp.files.setup.shares")}</h2>
          <p className="mt-1 text-xs text-white/50">{t("erp.files.setup.sharesHint")}</p>
        </div>
        {value.volumes.map((v, i) => (
          <div key={i} className="space-y-3 rounded-xl border border-white/10 p-3">
            <div className="grid items-end gap-3 sm:grid-cols-[140px_1fr_auto]">
              <Input label={t("erp.files.setup.volumeKey")} value={v.key} onChange={(k) => setVolume(i, { key: k.trim() })} dir="ltr" />
              <Input label={t("erp.files.setup.unc")} value={v.unc} onChange={(unc) => setVolume(i, { unc })} dir="ltr" placeholder="\\192.168.1.100\share" />
              <button
                type="button"
                onClick={() => set({ volumes: value.volumes.filter((_, j) => j !== i) })}
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10"
                aria-label={t("common.delete")}
              >
                <Trash2 size={15} />
              </button>
            </div>
            <BilingualField label={t("erp.files.setup.volumeName")} value={v.name} onChange={(name) => setVolume(i, { name })} />
            <Input label={t("erp.files.setup.drives")} value={v.drives} onChange={(drives) => setVolume(i, { drives })} dir="ltr" placeholder="Z, A" />
          </div>
        ))}
        <button
          type="button"
          onClick={() => set({ volumes: [...value.volumes, { key: "", name: { ar: "", en: "" }, unc: "", drives: "" }] })}
          className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm hover:bg-white/10"
        >
          <Plus size={16} /> {t("erp.files.setup.addShare")}
        </button>
      </Card>

      {/* Access and filing */}
      <Card className="space-y-5">
        <h2 className="text-lg font-semibold">{t("erp.files.setup.rules")}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Select
              label={t("erp.files.setup.access")}
              value={value.access}
              onChange={(access) => set({ access })}
              options={["company", "department"].map((k) => ({ value: k, label: t(`erp.files.setup.accessMode.${k}`) }))}
            />
            <p className="mt-1.5 text-xs text-white/50">{t(`erp.files.setup.accessHint.${value.access}`)}</p>
          </div>
          <div>
            <Select
              label={t("erp.files.setup.deliveryMode")}
              value={value.deliveryMode}
              onChange={(deliveryMode) => set({ deliveryMode })}
              options={["both", "server"].map((k) => ({ value: k, label: t(`erp.files.setup.delivery.${k}`) }))}
            />
            <p className="mt-1.5 text-xs text-white/50">{t(`erp.files.setup.deliveryHint.${value.deliveryMode}`)}</p>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium text-white/70">{t("erp.files.setup.departmentFolders")}</p>
          <p className="text-xs text-white/50">{t("erp.files.setup.departmentFoldersHint")}</p>
          <div className="divide-y divide-white/5 rounded-xl border border-white/10">
            {lookups.departments.map((d) => (
              <FolderRow
                key={d.id}
                label={d.name?.[lang] || "—"}
                value={folderOf(d.id)}
                onChange={(p) => setFolder(d.id, p)}
                onPick={status.enabled ? () => setPicking(d.id) : null}
                t={t}
              />
            ))}
            <FolderRow label={t("erp.files.setup.projectsRoot")} value={value.projectsRoot} onChange={(projectsRoot) => set({ projectsRoot: projectsRoot || "/" })} onPick={status.enabled ? () => setPicking("root") : null} t={t} />
          </div>
          <p className="text-xs text-white/50">{t("erp.files.setup.layout")}</p>
        </div>
      </Card>

      <SaveBar status={save.status} error={save.error} onSave={saveAll} />

      <ServerPicker
        open={Boolean(picking)}
        onClose={() => setPicking(null)}
        pick={{ kind: "folder", multiple: false }}
        title={t("erp.files.setup.pickFolder")}
        onPick={([ref]) => {
          if (!ref) return;
          if (picking === "root") set({ projectsRoot: ref.path });
          else setFolder(picking, ref.path);
        }}
      />
    </div>
  );
}

function FolderRow({ label, value, onChange, onPick, t }) {
  return (
    <div className="grid items-center gap-2 p-3 sm:grid-cols-[200px_1fr_auto]">
      <span className="text-sm">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        dir="auto"
        placeholder={t("erp.files.setup.folderPlaceholder")}
        className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none placeholder:text-white/35 focus:border-white/30"
      />
      {onPick ? (
        <button type="button" onClick={onPick} className="flex items-center justify-center gap-1.5 rounded-lg border border-white/15 px-3 py-2 text-xs hover:bg-white/5">
          <FolderOpen size={14} /> {t("erp.files.setup.choose")}
        </button>
      ) : (
        <span />
      )}
    </div>
  );
}
