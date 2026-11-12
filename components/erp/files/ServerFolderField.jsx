"use client";

import { useState } from "react";
import { FolderOpen, HardDrive, RotateCcw } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { parentPath, toWindowsPath } from "@/lib/fileServerPaths";
import { Label } from "@/components/erp/ui/fields";
import { ServerPicker } from "@/components/erp/files/ServerRefs";
import { useFileServer, useFileSession } from "@/components/erp/files/useFileServer";

// A project's folder on the company server: chosen, or the default one
// ("<department folder>\<code - name>"). value = { vol, path } | null.
export default function ServerFolderField({ value, onChange, ctx }) {
  const { t } = useLanguage();
  const status = useFileServer();
  const fs = useFileSession(status?.enabled ? ctx : null, { lazy: true });
  const [picking, setPicking] = useState(false);
  if (!status?.enabled) return null;
  const shown = value?.path ? value : null;
  return (
    <div>
      <Label>{t("erp.files.projectFolder")}</Label>
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm">
        <HardDrive size={15} className="shrink-0 text-emerald-300" />
        <span className="min-w-0 flex-1 truncate" dir="auto" title={shown ? toWindowsPath(shown, status.volumes) : ""}>
          {shown ? shown.path : <span className="text-white/50">{t("erp.files.defaultFolder")}</span>}
        </span>
        <button type="button" onClick={() => setPicking(true)} className="flex items-center gap-1 text-xs text-brand-orange hover:underline">
          <FolderOpen size={13} /> {t("erp.files.setup.choose")}
        </button>
        {shown && (
          <button type="button" onClick={() => onChange(null)} className="flex items-center gap-1 text-xs text-white/55 hover:text-white" title={t("erp.files.useDefault")}>
            <RotateCcw size={13} /> {t("erp.files.useDefault")}
          </button>
        )}
      </div>
      <p className="mt-1 text-xs text-white/50">{t("erp.files.projectFolderHint")}</p>
      <ServerPicker
        open={picking}
        onClose={() => setPicking(false)}
        ctx={ctx}
        pick={{ kind: "folder", multiple: false }}
        start={shown ? { vol: shown.vol, path: parentPath(shown.path) } : fs.session?.folder ? { vol: fs.session.folder.vol, path: parentPath(fs.session.folder.path) } : undefined}
        title={t("erp.files.projectFolder")}
        onPick={([ref]) => ref && onChange({ vol: ref.vol, path: ref.path })}
      />
    </div>
  );
}
