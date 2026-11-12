"use client";

import { useState } from "react";
import { Copy, FolderOpen, HardDrive, Link2, ListPlus, Upload } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { baseName, parentPath, toWindowsPath } from "@/lib/fileServerPaths";
import { Input } from "@/components/erp/ui/fields";
import { useToast } from "@/components/erp/ui/Feedback";
import { FolderWindow, ServerPicker, ServerRefChip } from "@/components/erp/files/ServerRefs";
import { useFileServer, useFileSession } from "@/components/erp/files/useFileServer";

// What the employee hands in with a task: files on the company server (put in the task's
// own folder — "<project>\<NN - stage>\R-NN" — or chosen anywhere they can open), or an
// outside link. value = { deliveryLink, deliveryFiles }.
export default function DeliveryEditor({ task, value, onChange }) {
  const { t } = useLanguage();
  const toast = useToast();
  const status = useFileServer();
  const serverOn = Boolean(status?.enabled);
  const linkAllowed = !serverOn || status.deliveryMode !== "server";
  const [mode, setMode] = useState(null); // null = not chosen yet: follows what's saved
  const fs = useFileSession(serverOn ? { for: "task", id: task.id } : null);
  const [folderOpen, setFolderOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const folder = fs.session?.folder;
  const files = value.deliveryFiles || [];

  if (status === null) return <div className="h-16 animate-pulse rounded-xl bg-white/5" />;
  // Server deliveries unless a link was saved (or the company takes server files only).
  const current = !serverOn ? "link" : !linkAllowed ? "server" : mode || (value.deliveryLink && !files.length ? "link" : "server");

  const addRefs = (refs) => {
    const seen = new Set(files.map((f) => `${f.vol}:${f.path}`));
    onChange({ ...value, deliveryFiles: [...files, ...refs.filter((r) => !seen.has(`${r.vol}:${r.path}`))].slice(0, 30) });
  };
  // Files put in the task's folder: the folder itself is the delivery.
  const addFolder = () => folder && addRefs([{ vol: folder.vol, path: folder.path, name: baseName(folder.path), dir: true, size: 0 }]);

  async function copyFolderPath() {
    const text = toWindowsPath(folder, fs.session?.volumes);
    try {
      await navigator.clipboard.writeText(text);
      toast({ text: t("erp.files.pathCopied") });
    } catch {
      toast({ text, tone: "error" });
    }
  }

  return (
    <div className="space-y-3">
      {serverOn && linkAllowed && (
        <div className="inline-flex rounded-xl border border-white/10 bg-white/5 p-1 text-sm" role="tablist">
          {[
            ["server", HardDrive, t("erp.files.delivery.server")],
            ["link", Link2, t("erp.files.delivery.link")],
          ].map(([k, Icon, label]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={current === k}
              onClick={() => setMode(k)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 ${current === k ? "bg-brand-orange text-white" : "text-white/65 hover:text-white"}`}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>
      )}

      {current === "server" ? (
        <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
          {folder && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-white/60">
              <span>{t("erp.files.delivery.folder")}</span>
              <span className="min-w-0 max-w-full truncate rounded-md bg-black/20 px-2 py-1 text-white/80" dir="ltr" title={toWindowsPath(folder, fs.session?.volumes)}>
                …\{folder.path.split("/").filter(Boolean).slice(-3).join("\\")}
              </span>
              <button type="button" onClick={copyFolderPath} className="text-white/50 hover:text-white" aria-label={t("erp.files.copyPath")} title={t("erp.files.copyPath")}>
                <Copy size={13} />
              </button>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!folder}
              onClick={() => setFolderOpen(true)}
              className="flex items-center gap-1.5 rounded-xl bg-brand-orange px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              <Upload size={15} /> {t("erp.files.delivery.uploadToFolder")}
            </button>
            <button
              type="button"
              disabled={fs.status !== "ready"}
              onClick={() => setPicking(true)}
              className="flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm hover:bg-white/10 disabled:opacity-40"
            >
              <ListPlus size={15} /> {t("erp.files.delivery.choose")}
            </button>
            {folder && !files.some((f) => f.vol === folder.vol && f.path === folder.path) && (
              <button type="button" onClick={addFolder} className="flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm hover:bg-white/10">
                <FolderOpen size={15} /> {t("erp.files.delivery.useFolder")}
              </button>
            )}
          </div>
          {fs.status === "error" && <p className="text-xs text-amber-200">{t("erp.files.offlineTitle")}</p>}
          {files.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {files.map((f, i) => (
                <ServerRefChip key={`${f.vol}:${f.path}`} item={f} fs={fs} onRemove={() => onChange({ ...value, deliveryFiles: files.filter((_, j) => j !== i) })} />
              ))}
            </div>
          ) : (
            <p className="text-xs text-white/50">{t("erp.files.delivery.none")}</p>
          )}
          <FolderWindow
            fs={fs}
            root={folder}
            open={folderOpen && Boolean(folder)}
            onClose={() => setFolderOpen(false)}
            title={t("erp.files.delivery.folderTitle", { number: task.number })}
            onUploaded={addFolder}
          />
          <ServerPicker
            open={picking}
            onClose={() => setPicking(false)}
            ctx={{ for: "task", id: task.id }}
            start={folder ? { vol: folder.vol, path: parentPath(folder.path) } : undefined}
            onPick={addRefs}
          />
        </div>
      ) : (
        <Input label={t("erp.tasks.deliveryLink")} value={value.deliveryLink} onChange={(deliveryLink) => onChange({ ...value, deliveryLink })} dir="ltr" placeholder="https://..." />
      )}
    </div>
  );
}
