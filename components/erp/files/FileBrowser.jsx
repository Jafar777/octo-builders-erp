"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowUp,
  Archive,
  Check,
  ChevronRight,
  Copy,
  Download,
  Eye,
  File,
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Folder,
  FolderPlus,
  FolderUp,
  HardDrive,
  Loader2,
  Pencil,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  WifiOff,
  X,
} from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { formatDateTime } from "@/lib/formatTime";
import { baseName, canSee, formatBytes, isWithin, joinPath, parentPath, rightsAt, safeFolderName, toWindowsPath } from "@/lib/fileServerPaths";
import { downloadInBackground, droppedFiles } from "@/components/erp/files/gatewayClient";
import { useAsk, useConfirm, useToast } from "@/components/erp/ui/Feedback";
import { EmptyState } from "@/components/erp/ui/DataTools";
import { Skeleton } from "@/components/erp/ui/Loading";

const EXT_ICONS = [
  [/\.(png|jpe?g|gif|webp|bmp|tiff?|psd|exr|hdr|heic)$/i, FileImage, "text-sky-300"],
  [/\.(mp4|mov|avi|mkv|wmv|webm)$/i, FileVideo, "text-violet-300"],
  [/\.(mp3|wav|m4a|ogg)$/i, FileAudio, "text-violet-300"],
  [/\.(zip|rar|7z|tar|gz)$/i, FileArchive, "text-amber-300"],
  [/\.(xlsx?|xlsb|csv|ods)$/i, FileSpreadsheet, "text-emerald-300"],
  [/\.(pdf|docx?|txt|rtf|pptx?)$/i, FileText, "text-red-300"],
  [/\.(dwg|dxf|rvt|rfa|max|skp|3ds|fbx|obj|ifc|nwd|nwc|bak)$/i, FileCode, "text-brand-orange"],
];
export function fileIcon(name, dir) {
  if (dir) return [Folder, "text-amber-200"];
  for (const [re, Icon, color] of EXT_ICONS) if (re.test(name)) return [Icon, color];
  return [File, "text-white/60"];
}
const PREVIEWABLE = /\.(pdf|png|jpe?g|gif|webp|bmp|mp4|webm|mov|mp3|wav|txt)$/i;

// Gateway error codes → messages (erp.files.err.*), with a generic fallback.
export function gatewayErrorText(t, err) {
  const code = err?.message || "server_error";
  const text = t(`erp.files.err.${code}`, err?.data || {});
  return text === `erp.files.err.${code}` ? t("erp.files.err.server_error") : text;
}

// Open a server file (preview in a new tab, or download) or download a folder as .zip.
export async function openServerRef(fs, ref, { preview = false, t, toast }) {
  // A window opened right away (an await before window.open gets it blocked as a pop-up).
  const win = preview && !ref.dir ? window.open("about:blank", "_blank") : null;
  try {
    if (win) {
      win.location.href = await fs.gateway.fileUrl(ref.vol, ref.path, { inline: true });
    } else if (ref.dir) {
      downloadInBackground(await fs.gateway.zipUrl(ref.vol, ref.path));
      toast({ text: t("erp.files.zipStarted") });
    } else {
      await fs.gateway.stat(ref.vol, ref.path); // a clear message if it's gone, not a blank tab
      downloadInBackground(await fs.gateway.fileUrl(ref.vol, ref.path));
    }
  } catch (err) {
    win?.close();
    toast({ text: gatewayErrorText(t, err), tone: "error" });
  }
}

export const isPreviewable = (name) => PREVIEWABLE.test(name || "");

// Browse a share through the gateway: folders, upload (files, folders, drag & drop, in
// resumable parts), new folder, download / preview / whole folder as .zip, copy the
// network path for File Explorer, and — with the rights — rename and delete.
//
//   fs        useFileSession(...) result
//   start     { vol, path } to open first; root { vol, path }: can't go above it
//   pick      { kind: "file" | "folder" | "any", multiple } → choosing mode; onPick(refs)
//   onUploaded(entries) after uploads finish (e.g. to add the folder to a delivery)
export default function FileBrowser({ fs, start, root = null, pick = null, onPick, onUploaded, height = "60vh", pickLabel }) {
  const { t, lang } = useLanguage();
  const toast = useToast();
  const ask = useAsk();
  const confirm = useConfirm();
  const session = fs.session;
  const volumes = useMemo(() => session?.volumes || [], [session]);
  const grants = useMemo(() => session?.grants || [], [session]);
  const [loc, setLoc] = useState(() => start || root || session?.start || null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState({ key: "name", dir: 1 });
  const [selected, setSelected] = useState([]); // refs (pick mode)
  const [uploads, setUploads] = useState([]);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef(null);
  const folderInput = useRef(null);
  const loadSeq = useRef(0);

  // A lazy session (attachment lists) is fetched once a folder is actually opened.
  useEffect(() => {
    if (fs.status === "idle") fs.refresh();
  }, [fs]);

  useEffect(() => {
    // The session arrives after the first render: open its starting folder then.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!loc && session) setLoc(start || root || session.start);
  }, [loc, session, start, root]);

  const load = useCallback(async () => {
    if (!loc || fs.status !== "ready") return;
    const seq = ++loadSeq.current;
    setLoading(true);
    setError(null);
    try {
      const d = await fs.gateway.list(loc.vol, loc.path);
      if (seq === loadSeq.current) setData(d);
    } catch (err) {
      if (seq !== loadSeq.current) return;
      // A folder that doesn't exist yet (a task's delivery folder): it's made with the first file.
      if (err.status === 404 && rightsAt(grants, loc.vol, loc.path).has("w")) {
        setData({ entries: [], missing: true });
      } else {
        setData(null);
        setError(err);
      }
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [loc, fs.status, fs.gateway, grants]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const rights = useMemo(() => (loc ? rightsAt(grants, loc.vol, loc.path) : new Set()), [grants, loc]);
  const canWrite = rights.has("w");
  const canManage = rights.has("m");
  const go = (vol, path) => {
    setFilter("");
    setLoc({ vol, path });
  };
  const aboveRoot = (vol, path) => root && (vol !== root.vol || (!isWithin(path, root.path) && path !== root.path));

  const entries = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const list = (data?.entries || []).filter((e) => !q || e.name.toLowerCase().includes(q));
    const by = { name: (e) => e.name.toLowerCase(), size: (e) => e.size, mtime: (e) => e.mtime };
    return [...list].sort((a, b) => {
      if (a.dir !== b.dir) return a.dir ? -1 : 1;
      const x = by[sort.key](a);
      const y = by[sort.key](b);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
  }, [data, filter, sort]);

  const refOf = (e) => ({ vol: loc.vol, path: joinPath(loc.path, e.name), name: e.name, dir: e.dir, size: e.size });
  const isSelected = (ref) => selected.some((s) => s.vol === ref.vol && s.path === ref.path);
  const choosable = (e) => pick && (pick.kind === "any" || (pick.kind === "folder" ? e.dir : !e.dir));
  function toggle(ref) {
    setSelected((prev) => (isSelected(ref) ? prev.filter((s) => !(s.vol === ref.vol && s.path === ref.path)) : pick.multiple ? [...prev, ref] : [ref]));
  }

  async function copyPath(ref) {
    const text = toWindowsPath(ref, volumes);
    try {
      await navigator.clipboard.writeText(text);
      toast({ text: t("erp.files.pathCopied") });
    } catch {
      toast({ text, tone: "error" });
    }
  }

  const open = (ref, { preview = false } = {}) => openServerRef(fs, ref, { preview, t, toast });

  async function newFolder() {
    const name = await ask({ title: t("erp.files.newFolder"), text: t("erp.files.newFolderHint"), required: true, confirmLabel: t("erp.files.create") });
    if (!name) return;
    const clean = safeFolderName(name, "");
    if (!clean) return toast({ text: t("erp.files.err.bad_name"), tone: "error" });
    try {
      await fs.gateway.mkdir(loc.vol, loc.path, clean);
      load();
    } catch (err) {
      toast({ text: gatewayErrorText(t, err), tone: "error" });
    }
  }

  async function rename(e) {
    const name = await ask({ title: t("erp.files.rename"), value: e.name, required: true, confirmLabel: t("common.save") });
    if (!name || name === e.name) return;
    const clean = safeFolderName(name, "");
    if (!clean) return toast({ text: t("erp.files.err.bad_name"), tone: "error" });
    try {
      await fs.gateway.rename(loc.vol, joinPath(loc.path, e.name), clean);
      load();
    } catch (err) {
      toast({ text: gatewayErrorText(t, err), tone: "error" });
    }
  }

  async function remove(e) {
    if (!(await confirm({ text: t(e.dir ? "erp.files.confirmDeleteFolder" : "erp.files.confirmDelete", { name: e.name }), kind: "delete" }))) return;
    try {
      await fs.gateway.remove(loc.vol, joinPath(loc.path, e.name));
      toast({ text: t("erp.files.deletedToRecycle") });
      load();
    } catch (err) {
      toast({ text: gatewayErrorText(t, err), tone: "error" });
    }
  }

  // [{ file, rel }] into the current folder, keeping sub-folders of a dropped folder.
  async function uploadAll(items) {
    if (!items.length || !canWrite) return;
    const target = { ...loc };
    const jobs = items.map(({ file, rel }) => {
      const parts = String(rel || file.name).split("/").filter(Boolean);
      const name = safeFolderName(parts.pop() || file.name, "file");
      const dir = joinPath(target.path, ...parts.map((p) => safeFolderName(p, "folder")));
      return { id: `${Date.now()}-${Math.random()}`, file, name, dir, progress: 0, status: "waiting", controller: new AbortController() };
    });
    setUploads((u) => [...u.filter((x) => x.status === "uploading" || x.status === "waiting"), ...jobs]);
    const patchJob = (id, p) => setUploads((u) => u.map((x) => (x.id === id ? { ...x, ...p } : x)));
    const done = [];
    // Two at a time: quick for many small drawings, and a big render doesn't block the rest.
    const queue = [...jobs];
    async function worker() {
      while (queue.length) {
        const job = queue.shift();
        if (job.controller.signal.aborted) continue;
        patchJob(job.id, { status: "uploading" });
        try {
          const entry = await fs.gateway.upload(target.vol, job.dir, job.file, { name: job.name, signal: job.controller.signal, onProgress: (n) => patchJob(job.id, { progress: n }) });
          done.push(entry);
          patchJob(job.id, { status: "done", progress: 100, savedAs: entry.name });
        } catch (err) {
          patchJob(job.id, { status: err?.name === "AbortError" ? "cancelled" : "error", error: err?.name === "AbortError" ? "" : gatewayErrorText(t, err) });
        }
      }
    }
    await Promise.all([worker(), worker()]);
    if (done.length) {
      toast({ text: t("erp.files.uploaded", { n: done.length }) });
      onUploaded?.(done, target);
    }
    load();
  }

  const pickFiles = (input) => {
    const files = [...(input.files || [])];
    input.value = "";
    uploadAll(files.map((file) => ({ file, rel: file.webkitRelativePath || file.name })));
  };

  if (fs.status === "loading" || fs.status === "idle" || (!loc && fs.status === "ready")) return <BrowserSkeleton height={height} />;
  if (fs.status !== "ready") return <Offline t={t} status={fs.status} error={fs.error} onRetry={() => fs.refresh(true)} />;

  const crumbs = loc.path.split("/").filter(Boolean);
  const volume = volumes.find((v) => v.key === loc.vol);
  const activeUploads = uploads.filter((u) => u.status === "uploading" || u.status === "waiting");

  return (
    <div
      className={`relative flex flex-col overflow-hidden rounded-2xl border bg-white/[0.02] ${dragging ? "border-brand-orange" : "border-white/10"}`}
      onDragOver={(e) => {
        if (!canWrite || !e.dataTransfer?.types?.includes("Files")) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => e.currentTarget.contains(e.relatedTarget) || setDragging(false)}
      onDrop={async (e) => {
        if (!canWrite) return;
        e.preventDefault();
        setDragging(false);
        uploadAll(await droppedFiles(e.dataTransfer));
      }}
    >
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 p-3">
        {volumes.length > 1 && !root && (
          <select
            value={loc.vol}
            onChange={(e) => go(e.target.value, "/")}
            className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-sm outline-none [&>option]:bg-brand-navy"
            aria-label={t("erp.files.share")}
          >
            {volumes.filter((v) => canSee(grants, v.key, "/")).map((v) => (
              <option key={v.key} value={v.key}>
                {v.name?.[lang] || v.key}
              </option>
            ))}
          </select>
        )}
        <button
          type="button"
          onClick={() => go(loc.vol, parentPath(loc.path))}
          disabled={loc.path === "/" || aboveRoot(loc.vol, parentPath(loc.path)) || !canSee(grants, loc.vol, parentPath(loc.path))}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-white/70 hover:bg-white/10 disabled:opacity-30"
          aria-label={t("erp.files.up")}
          title={t("erp.files.up")}
        >
          <ArrowUp size={16} />
        </button>
        <nav className="flex min-w-0 flex-1 flex-wrap items-center gap-0.5 text-sm" aria-label={t("erp.files.location")}>
          <button
            type="button"
            onClick={() => go(loc.vol, "/")}
            disabled={aboveRoot(loc.vol, "/") || !canSee(grants, loc.vol, "/")}
            className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-white/70 hover:bg-white/10 hover:text-white disabled:cursor-default disabled:hover:bg-transparent"
          >
            <HardDrive size={14} /> {volume?.name?.[lang] || loc.vol}
          </button>
          {crumbs.map((c, i) => {
            const p = `/${crumbs.slice(0, i + 1).join("/")}`;
            const last = i === crumbs.length - 1;
            return (
              <span key={p} className="flex min-w-0 items-center gap-0.5">
                <ChevronRight size={13} className="shrink-0 text-white/30 rtl:rotate-180" />
                <button
                  type="button"
                  onClick={() => go(loc.vol, p)}
                  disabled={last || aboveRoot(loc.vol, p)}
                  className={`max-w-[14rem] truncate rounded-md px-1.5 py-1 ${last ? "font-medium text-white" : "text-white/70 hover:bg-white/10 hover:text-white"}`}
                  dir="auto"
                >
                  {c}
                </button>
              </span>
            );
          })}
        </nav>
        <div className="flex items-center gap-1.5">
          <label className="relative hidden sm:block">
            <Search size={14} className="pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2 text-white/40" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={t("erp.files.filter")}
              className="w-40 rounded-lg border border-white/10 bg-white/5 py-1.5 pe-2 ps-8 text-sm outline-none placeholder:text-white/40 focus:border-white/30"
            />
          </label>
          <ToolButton icon={RefreshCw} label={t("erp.files.refresh")} onClick={load} spin={loading} />
          <ToolButton icon={Copy} label={t("erp.files.copyPath")} onClick={() => copyPath({ vol: loc.vol, path: loc.path })} />
          {canWrite && (
            <>
              <ToolButton icon={FolderPlus} label={t("erp.files.newFolder")} onClick={newFolder} />
              <ToolButton icon={FolderUp} label={t("erp.files.uploadFolder")} onClick={() => folderInput.current?.click()} />
              <button type="button" onClick={() => fileInput.current?.click()} className="flex items-center gap-1.5 rounded-lg bg-brand-orange px-3 py-1.5 text-sm font-semibold text-white">
                <Upload size={15} /> {t("erp.files.upload")}
              </button>
              <input ref={fileInput} type="file" multiple className="hidden" onChange={(e) => pickFiles(e.target)} />
              <input ref={folderInput} type="file" multiple webkitdirectory="" directory="" className="hidden" onChange={(e) => pickFiles(e.target)} />
            </>
          )}
        </div>
      </div>

      {/* Listing */}
      <div className="min-h-0 overflow-y-auto" style={{ height }}>
        {error ? (
          <div className="p-6">
            <Problem t={t} err={error} onRetry={load} />
          </div>
        ) : !data ? (
          <ListSkeleton />
        ) : entries.length === 0 ? (
          <EmptyState
            icon={Folder}
            compact
            text={filter ? t("erp.ux.noMatches") : data.missing ? t("erp.files.notCreatedYet") : canWrite ? t("erp.files.emptyWritable") : t("erp.files.empty")}
          />
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-brand-navy/95 text-xs text-white/50 backdrop-blur">
              <tr>
                {pick && <th className="w-10" />}
                <SortHead label={t("erp.files.name")} k="name" sort={sort} setSort={setSort} className="text-start" />
                <SortHead label={t("erp.files.modified")} k="mtime" sort={sort} setSort={setSort} className="hidden text-start md:table-cell" />
                <SortHead label={t("erp.files.size")} k="size" sort={sort} setSort={setSort} className="hidden text-end sm:table-cell" />
                <th className="w-1" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {entries.map((e) => {
                const ref = refOf(e);
                const [Icon, color] = fileIcon(e.name, e.dir);
                const sel = pick && isSelected(ref);
                const mayPick = choosable(e);
                const entryRights = rightsAt(grants, ref.vol, ref.path);
                return (
                  <tr
                    key={e.name}
                    className={`group cursor-pointer ${sel ? "bg-brand-orange/10" : "hover:bg-white/[0.04]"}`}
                    onClick={() => (e.dir ? go(ref.vol, ref.path) : mayPick ? toggle(ref) : open(ref, { preview: PREVIEWABLE.test(e.name) }))}
                  >
                    {pick && (
                      <td className="ps-3" onClick={(ev) => ev.stopPropagation()}>
                        {mayPick && (
                          <button
                            type="button"
                            onClick={() => toggle(ref)}
                            aria-label={t("erp.files.select")}
                            className={`flex h-5 w-5 items-center justify-center rounded border ${sel ? "border-brand-orange bg-brand-orange text-white" : "border-white/25"}`}
                          >
                            {sel && <Check size={13} />}
                          </button>
                        )}
                      </td>
                    )}
                    <td className="max-w-0 px-3 py-2.5">
                      <span className="flex min-w-0 items-center gap-2.5">
                        <Icon size={18} className={`shrink-0 ${color}`} />
                        <span className="truncate" dir="auto" title={e.name}>
                          {e.name}
                        </span>
                      </span>
                    </td>
                    <td className="hidden whitespace-nowrap px-3 py-2.5 text-xs text-white/50 md:table-cell">{formatDateTime(e.mtime, lang)}</td>
                    <td className="hidden whitespace-nowrap px-3 py-2.5 text-end text-xs text-white/50 sm:table-cell" dir="ltr">
                      {e.dir ? "" : formatBytes(e.size)}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5" onClick={(ev) => ev.stopPropagation()}>
                      <span className="flex justify-end gap-0.5 opacity-60 transition-opacity group-hover:opacity-100">
                        {!e.dir && PREVIEWABLE.test(e.name) && <RowButton icon={Eye} label={t("erp.files.preview")} onClick={() => open(ref, { preview: true })} />}
                        <RowButton icon={e.dir ? Archive : Download} label={t(e.dir ? "erp.files.downloadZip" : "erp.files.download")} onClick={() => open(ref)} />
                        <RowButton icon={Copy} label={t("erp.files.copyPath")} onClick={() => copyPath(ref)} />
                        {entryRights.has("m") && <RowButton icon={Pencil} label={t("erp.files.rename")} onClick={() => rename(e)} />}
                        {entryRights.has("m") && <RowButton icon={Trash2} label={t("common.delete")} onClick={() => remove(e)} danger />}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {data?.truncated && <p className="p-3 text-center text-xs text-amber-200">{t("erp.files.truncated")}</p>}
        {data?.skipped > 0 && <p className="p-3 text-center text-xs text-white/45">{t("erp.files.skipped", { n: data.skipped })}</p>}
      </div>

      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-brand-navy/80 text-sm font-semibold text-white">
          <span className="flex items-center gap-2 rounded-2xl border border-dashed border-brand-orange px-6 py-4">
            <Upload size={18} /> {t("erp.files.dropHere", { folder: crumbs.at(-1) || volume?.name?.[lang] || loc.vol })}
          </span>
        </div>
      )}

      {/* Uploads */}
      {uploads.length > 0 && (
        <div className="border-t border-white/10 bg-black/10 p-3">
          <div className="mb-2 flex items-center justify-between text-xs text-white/60">
            <span>{activeUploads.length ? t("erp.files.uploadingCount", { n: activeUploads.length }) : t("erp.files.uploadsDone")}</span>
            {!activeUploads.length && (
              <button type="button" onClick={() => setUploads([])} className="hover:text-white">
                {t("erp.files.clear")}
              </button>
            )}
          </div>
          <ul className="max-h-36 space-y-1.5 overflow-y-auto">
            {uploads.map((u) => (
              <li key={u.id} className="flex items-center gap-2 text-xs">
                <span className="w-40 shrink-0 truncate sm:w-64" dir="auto" title={joinPath(u.dir, u.name)}>
                  {u.savedAs || u.name}
                </span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                  <span className={`block h-full rounded-full transition-all ${u.status === "error" ? "bg-red-400" : u.status === "done" ? "bg-emerald-400" : "bg-brand-orange"}`} style={{ width: `${u.status === "error" ? 100 : u.progress}%` }} />
                </span>
                <span className={`w-28 shrink-0 truncate text-end ${u.status === "error" ? "text-red-300" : "text-white/55"}`} title={u.error}>
                  {u.status === "uploading" ? `${u.progress}%` : u.status === "error" ? u.error : t(`erp.files.job.${u.status}`)}
                </span>
                {(u.status === "uploading" || u.status === "waiting") && (
                  <button type="button" onClick={() => u.controller.abort()} aria-label={t("common.cancel")} className="text-white/50 hover:text-white">
                    <X size={13} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Picking */}
      {pick && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 p-3">
          <span className="text-xs text-white/55">{selected.length ? t("erp.files.selectedCount", { n: selected.length }) : t(`erp.files.pickHint.${pick.kind}`)}</span>
          <div className="flex gap-2">
            {pick.kind !== "file" && rights.has("r") && loc.path !== "/" && (
              <button
                type="button"
                onClick={() => onPick([{ vol: loc.vol, path: loc.path, name: baseName(loc.path), dir: true, size: 0 }])}
                className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
              >
                {t("erp.files.useThisFolder")}
              </button>
            )}
            <button
              type="button"
              disabled={!selected.length || activeUploads.length > 0}
              onClick={() => onPick(selected)}
              className="rounded-xl bg-brand-orange px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              {pickLabel || t("erp.files.choose")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ToolButton({ icon: Icon, label, onClick, spin = false }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} className="flex h-8 w-8 items-center justify-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white">
      <Icon size={15} className={spin ? "animate-spin" : ""} />
    </button>
  );
}

function RowButton({ icon: Icon, label, onClick, danger = false }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} className={`flex h-7 w-7 items-center justify-center rounded-md ${danger ? "text-red-300/80 hover:bg-red-500/10" : "text-white/70 hover:bg-white/10 hover:text-white"}`}>
      <Icon size={14} />
    </button>
  );
}

function SortHead({ label, k, sort, setSort, className = "" }) {
  const active = sort.key === k;
  return (
    <th className={`px-3 py-2 font-medium ${className}`}>
      <button type="button" onClick={() => setSort({ key: k, dir: active ? -sort.dir : 1 })} className={`hover:text-white ${active ? "text-white/80" : ""}`}>
        {label} {active ? (sort.dir > 0 ? "↑" : "↓") : ""}
      </button>
    </th>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-3 p-4">
      {Array.from({ length: 7 }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-5 w-5 rounded" />
          <Skeleton className="h-3.5" style={{ width: `${30 + ((i * 17) % 45)}%` }} />
        </div>
      ))}
    </div>
  );
}

function BrowserSkeleton({ height }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10">
      <div className="flex gap-2 border-b border-white/10 p-3">
        <Skeleton className="h-8 w-8 rounded-lg" />
        <Skeleton className="h-8 flex-1 rounded-lg" />
      </div>
      <div style={{ height }}>
        <ListSkeleton />
      </div>
    </div>
  );
}

function Problem({ t, err, onRetry }) {
  const offline = err?.message === "gateway_offline";
  return (
    <div className="flex flex-col items-center gap-3 py-8 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-300">{offline ? <WifiOff size={22} /> : <AlertTriangle size={22} />}</span>
      <p className="font-semibold">{offline ? t("erp.files.offlineTitle") : gatewayErrorText(t, err)}</p>
      {offline && <p className="max-w-md text-sm text-white/55">{t("erp.files.offlineText")}</p>}
      <button type="button" onClick={onRetry} className="flex items-center gap-1.5 rounded-xl border border-white/15 px-3 py-1.5 text-sm hover:bg-white/5">
        <RefreshCw size={14} /> {t("erp.files.retry")}
      </button>
    </div>
  );
}

function Offline({ t, status, error, onRetry }) {
  if (status === "off") return <EmptyState icon={HardDrive} compact title={t("erp.files.offTitle")} text={t("erp.files.offText")} />;
  return (
    <div className="rounded-2xl border border-white/10">
      <Problem t={t} err={{ message: error === "gateway_offline" ? "gateway_offline" : error }} onRetry={onRetry} />
    </div>
  );
}

export function Spinner() {
  return <Loader2 size={14} className="animate-spin" />;
}
