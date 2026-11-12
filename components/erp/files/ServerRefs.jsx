"use client";

import { useState } from "react";
import { Copy, ExternalLink, FolderOpen, HardDrive, X } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { formatBytes, parseServerPath, toWindowsPath } from "@/lib/fileServerPaths";
import Modal from "@/components/erp/ui/Modal";
import { useToast } from "@/components/erp/ui/Feedback";
import FileBrowser, { fileIcon, isPreviewable, openServerRef } from "@/components/erp/files/FileBrowser";
import { useFileServer, useFileSession } from "@/components/erp/files/useFileServer";

// Files / folders on the company server attached to something (a delivery, a message, a
// project file). `ctx` is the screen they belong to ({ for: "task", id } …): the token it
// gets opens exactly what that record lets this viewer open.

async function copyWindowsPath(ref, volumes, t, toast) {
  const text = toWindowsPath(ref, volumes);
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    toast({ text: t("erp.files.pathCopied") });
  } catch {
    toast({ text, tone: "error" });
  }
}

// A folder opened in a window, never above `root`.
export function FolderWindow({ fs, root, open, onClose, title, onUploaded }) {
  const { t } = useLanguage();
  return (
    <Modal open={open} onClose={onClose} title={title || t("erp.files.folder")} wide>
      {open && <FileBrowser fs={fs} start={root} root={root} height="55vh" onUploaded={onUploaded} />}
    </Modal>
  );
}

// Choose files / folders on the server (the person's own access).
export function ServerPicker({ open, onClose, onPick, pick = { kind: "any", multiple: true }, ctx = { for: "browse" }, start, title, pickLabel }) {
  const { t } = useLanguage();
  const fs = useFileSession(open ? ctx : null);
  return (
    <Modal open={open} onClose={onClose} title={title || t("erp.files.pickTitle")} wide>
      {open && (
        <FileBrowser
          fs={fs}
          start={start}
          pick={pick}
          pickLabel={pickLabel}
          height="50vh"
          onPick={(refs) => {
            onPick(refs);
            onClose();
          }}
        />
      )}
    </Modal>
  );
}

export function ServerRefChip({ item, fs, onRemove, volumes }) {
  const { t } = useLanguage();
  const toast = useToast();
  const [folderOpen, setFolderOpen] = useState(false);
  const [Icon, color] = fileIcon(item.name, item.dir);
  const vols = volumes || fs.session?.volumes || [];
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-xl border border-white/10 bg-white/[0.04] py-1 pe-1 ps-2.5 text-xs">
      <button
        type="button"
        onClick={() => (item.dir ? setFolderOpen(true) : openServerRef(fs, item, { preview: isPreviewable(item.name), t, toast }))}
        className="flex min-w-0 items-center gap-1.5 hover:text-brand-orange"
        title={toWindowsPath(item, vols) || item.path}
      >
        <Icon size={15} className={`shrink-0 ${color}`} />
        <span className="truncate" dir="auto">
          {item.name}
        </span>
        {!item.dir && item.size > 0 && (
          <span className="shrink-0 text-white/40" dir="ltr">
            {formatBytes(item.size)}
          </span>
        )}
      </button>
      <button type="button" onClick={() => copyWindowsPath(item, vols, t, toast)} className="flex h-6 w-6 items-center justify-center rounded-md text-white/45 hover:bg-white/10 hover:text-white" aria-label={t("erp.files.copyPath")} title={t("erp.files.copyPath")}>
        <Copy size={12} />
      </button>
      {onRemove && (
        <button type="button" onClick={onRemove} className="flex h-6 w-6 items-center justify-center rounded-md text-white/45 hover:bg-white/10 hover:text-white" aria-label={t("common.delete")}>
          <X size={12} />
        </button>
      )}
      {item.dir && <FolderWindow fs={fs} root={{ vol: item.vol, path: item.path }} open={folderOpen} onClose={() => setFolderOpen(false)} title={item.name} />}
    </span>
  );
}

// The refs of one record, each opened with that record's token.
export function ServerRefList({ refs, ctx, onRemove, className = "" }) {
  const status = useFileServer();
  const fs = useFileSession(refs?.length ? ctx : null, { lazy: true });
  if (!refs?.length) return null;
  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {refs.map((r, i) => (
        <ServerRefChip key={`${r.vol}:${r.path}`} item={r} fs={fs} volumes={status?.volumes} onRemove={onRemove ? () => onRemove(i) : undefined} />
      ))}
    </div>
  );
}

// A link as typed: a web address opens; a path on our shares (old Excel / Access links,
// "\\192.168.1.100\…", "Z:\…") opens through the gateway; anything else can be copied.
export function LinkOrPath({ text, ctx, label }) {
  const { t } = useLanguage();
  const toast = useToast();
  const status = useFileServer();
  const value = String(text || "").trim();
  const server = status?.enabled ? parseServerPath(value, status.volumes) : null;
  const fs = useFileSession(server ? ctx : null, { lazy: true });
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) {
    return (
      <a href={value} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-brand-orange hover:underline">
        {label || t("erp.tasks.openLink")} <ExternalLink size={13} />
      </a>
    );
  }
  if (server) {
    const name = server.path.split("/").filter(Boolean).pop() || server.vol;
    // A pasted path is usually a folder; one with an extension a file.
    return <ServerRefChip item={{ ...server, name, dir: !/\.[a-z0-9]{2,5}$/i.test(name), size: 0 }} fs={fs} volumes={status.volumes} />;
  }
  return (
    <button
      type="button"
      onClick={() => navigator.clipboard?.writeText(value).then(() => toast({ text: t("erp.files.pathCopied") }), () => {})}
      className="inline-flex max-w-full items-center gap-1.5 text-start text-white/70 hover:text-white"
      title={t("erp.files.copyPath")}
    >
      <span className="truncate" dir="ltr">
        {value}
      </span>
      <Copy size={12} className="shrink-0" />
    </button>
  );
}

// "Open folder" button for a folder (a project's), with the record's token.
export function ServerFolderButton({ ctx, folder, label, className = "" }) {
  const { t } = useLanguage();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const fs = useFileSession(ctx, { lazy: !open });
  const target = folder || fs.session?.folder;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`inline-flex items-center gap-1.5 text-brand-orange hover:underline ${className}`}>
        <FolderOpen size={14} /> {label || t("erp.files.openFolder")}
      </button>
      {target && (
        <button type="button" onClick={() => copyWindowsPath(target, fs.session?.volumes, t, toast)} className="ms-1 inline-flex text-white/45 hover:text-white" aria-label={t("erp.files.copyPath")} title={t("erp.files.copyPath")}>
          <Copy size={12} />
        </button>
      )}
      <FolderWindow fs={fs} root={target} open={open && Boolean(target)} onClose={() => setOpen(false)} title={target?.path.split("/").filter(Boolean).pop()} />
    </>
  );
}

export const ServerIcon = HardDrive;
