"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, Download, FileUp, HardDrive, History, ListPlus, Trash2, Upload } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { api, errorText } from "@/lib/clientApi";
import { uploadFileToImageKit } from "@/lib/uploadFile";
import { Button, Card, ErrorText, Input, Select } from "@/components/erp/ui/fields";
import { useConfirm } from "@/components/erp/ui/Feedback";
import { EmptyState } from "@/components/erp/ui/DataTools";
import { useToast } from "@/components/erp/ui/Feedback";
import { projectStageFolder } from "@/lib/fileServerPaths";
import { gatewayErrorText, isPreviewable, openServerRef } from "@/components/erp/files/FileBrowser";
import { GatewayError } from "@/components/erp/files/gatewayClient";
import { ServerFolderButton, ServerPicker } from "@/components/erp/files/ServerRefs";
import { useFileServer, useFileSession } from "@/components/erp/files/useFileServer";

const size = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

// The project's drawings and documents by stage, each keeping every version uploaded.
// With the company file server connected, files go to the project's folder on it
// ("<project>\<NN - stage>\…") instead of the cloud, and can be picked from it.
export default function ProjectFiles({ project }) {
  const { t, lang } = useLanguage();
  const confirm = useConfirm();
  const toast = useToast();
  const server = useFileServer();
  const serverOn = Boolean(server?.enabled);
  const fs = useFileSession(serverOn ? { for: "project", id: project.id } : null, { lazy: true });
  const [picking, setPicking] = useState(null); // { existing } while choosing a server file
  const [data, setData] = useState(null);
  const [stage, setStage] = useState("");
  const [note, setNote] = useState("");
  const [progress, setProgress] = useState(null);
  const [open, setOpen] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    api(`/api/work-projects/${project.id}/files`).then(setData).catch((err) => setError(errorText(t, err)));
  }, [project.id, t]);
  useEffect(() => {
    load();
  }, [load]);

  // Where a stage's files go on the server: the project's folder (from its token).
  async function stageFolder(stageKey) {
    const s = await fs.getSession();
    return projectStageFolder({ ...project, serverFolder: s.folder }, stageKey, { volumes: s.volumes });
  }

  async function addVersion(existing, body) {
    await api(`/api/work-projects/${project.id}/files`, {
      method: "POST",
      body: { fileId: existing?.id, name: existing ? undefined : body.fileName, stage: existing ? existing.stage : stage, note, ...body },
    });
    setNote("");
    load();
  }

  async function upload(file, existing = null) {
    setError("");
    setProgress(0);
    try {
      if (serverOn) {
        const folder = await stageFolder(existing ? existing.stage : stage);
        const saved = await fs.gateway.upload(folder.vol, folder.path, file, { onProgress: setProgress });
        await addVersion(existing, { server: { vol: saved.vol, path: saved.path }, fileName: saved.name, size: saved.size });
      } else {
        const res = await uploadFileToImageKit(file, { onProgress: setProgress, folder: `/octabuilders/projects/${project.id}` });
        await addVersion(existing, { url: res.url, imagekitId: res.fileId, fileName: file.name, size: file.size });
      }
    } catch (err) {
      setError(err instanceof GatewayError ? gatewayErrorText(t, err) : errorText(t, err));
    } finally {
      setProgress(null);
    }
  }

  const openVersion = (v, name) =>
    v.server
      ? openServerRef(fs, { ...v.server, name: v.fileName || name, dir: false }, { preview: isPreviewable(v.fileName || name), t, toast })
      : window.open(v.url, "_blank", "noopener");

  const stageName = (key) => project.stages?.find((s) => s.key === key)?.name?.[lang] || t("erp.files.general");
  const groups = {};
  for (const f of data?.files || []) (groups[f.stage] ||= []).push(f);

  return (
    <div className="space-y-4">
      <Card>
        <div className="grid gap-3 sm:grid-cols-[200px_minmax(0,1fr)_auto] sm:items-end">
          <Select label={t("erp.files.stage")} value={stage} onChange={setStage} placeholder={t("erp.files.general")} options={(project.stages || []).map((s) => ({ value: s.key, label: s.name?.[lang] }))} />
          <Input label={t("erp.files.note")} value={note} onChange={setNote} placeholder={t("erp.files.notePlaceholder")} />
          <div className="flex gap-2">
            {serverOn && (
              <button type="button" onClick={() => setPicking({ existing: null })} className="flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm hover:bg-white/10" title={t("erp.files.fromServer")}>
                <ListPlus size={16} /> <span className="hidden lg:inline">{t("erp.files.fromServer")}</span>
              </button>
            )}
            <label className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl bg-brand-orange px-4 py-2.5 text-sm font-semibold text-white">
              <Upload size={16} /> {progress !== null ? `${progress}%` : t("erp.files.upload")}
              <input type="file" className="hidden" disabled={progress !== null} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
            </label>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-white/60">
          <span className="flex items-center gap-1.5">
            {serverOn && <HardDrive size={13} className="text-emerald-300" />}
            {serverOn ? t("erp.files.hintServer") : t("erp.files.hint")}
          </span>
          {serverOn && <ServerFolderButton ctx={{ for: "project", id: project.id }} label={t("erp.files.projectFolder")} className="text-xs" />}
        </div>
        <ErrorText>{error}</ErrorText>
      </Card>

      {data && !data.files.length && <EmptyState compact text={t("erp.files.none")} />}
      {Object.entries(groups).map(([key, files]) => (
        <Card key={key}>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/60">{stageName(key)}</p>
          <ul className="divide-y divide-white/5">
            {files.map((f) => {
              const latest = f.versions[0];
              return (
                <li key={f.id} className="py-2.5">
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <span className="min-w-0 flex-1 truncate font-medium">{f.name}</span>
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px]">v{latest.n}</span>
                    <span className="text-xs text-white/60">
                      {latest.by} · {new Date(latest.at).toLocaleDateString(lang === "ar" ? "ar" : "en-GB")}
                    </span>
                    {latest.server && <HardDrive size={13} className="text-emerald-300/80" aria-label={t("erp.files.onServer")} />}
                    <button type="button" onClick={() => openVersion(latest, f.name)} className="text-white/60 hover:text-brand-orange" aria-label={t("erp.files.download")} title={t("erp.files.download")}>
                      <Download size={15} />
                    </button>
                    {serverOn && (
                      <button type="button" onClick={() => setPicking({ existing: f })} className="text-white/60 hover:text-brand-orange" title={t("erp.files.versionFromServer")} aria-label={t("erp.files.versionFromServer")}>
                        <ListPlus size={15} />
                      </button>
                    )}
                    <label className="cursor-pointer text-white/60 hover:text-brand-orange" title={t("erp.files.newVersion")}>
                      <FileUp size={15} />
                      <input type="file" className="hidden" disabled={progress !== null} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0], f)} />
                    </label>
                    {f.versions.length > 1 && (
                      <button type="button" onClick={() => setOpen(open === f.id ? null : f.id)} className="flex items-center gap-1 text-xs text-white/50 hover:text-white">
                        <History size={13} /> {f.versions.length} <ChevronDown size={12} className={open === f.id ? "rotate-180" : ""} />
                      </button>
                    )}
                    {data.canDelete && (
                      <button
                        type="button"
                        aria-label={t("common.delete")}
                        onClick={async () => {
                          if (!(await confirm({ text: t("common.confirmDelete"), kind: "delete" }))) return;
                          await api(`/api/work-projects/${project.id}/files?fileId=${f.id}`, { method: "DELETE" }).catch(() => {});
                          load();
                        }}
                        className="text-white/50 hover:text-red-300"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                  {latest.note && <p className="mt-1 text-xs text-white/50">{latest.note}</p>}
                  {open === f.id && (
                    <ul className="mt-2 space-y-1 border-s border-white/10 ps-3 text-xs text-white/55">
                      {f.versions.map((v) => (
                        <li key={v.n} className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold">v{v.n}</span>
                          <span>{v.by}</span>
                          <span>{new Date(v.at).toLocaleString(lang === "ar" ? "ar" : "en-GB", { dateStyle: "medium", timeStyle: "short" })}</span>
                          {v.size > 0 && <span>{size(v.size)}</span>}
                          {v.note && <span className="text-white/60">— {v.note}</span>}
                          <button type="button" onClick={() => openVersion(v, f.name)} className="text-brand-orange hover:underline">
                            {t("erp.files.download")}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      ))}
      {progress !== null && (
        <div className="fixed bottom-6 end-6 z-50 rounded-xl border border-white/10 bg-brand-navy px-4 py-3 text-sm shadow-xl">
          {t("erp.files.uploading", { n: progress })}
        </div>
      )}
      {!data && <Button variant="ghost" loading disabled />}
      {serverOn && (
        <ServerPicker
          open={Boolean(picking)}
          onClose={() => setPicking(null)}
          ctx={{ for: "project", id: project.id }}
          pick={{ kind: "file", multiple: false }}
          title={picking?.existing ? t("erp.files.versionFromServer") : t("erp.files.fromServer")}
          onPick={async ([ref]) => {
            const existing = picking?.existing || null;
            if (!ref) return;
            try {
              await addVersion(existing, { server: { vol: ref.vol, path: ref.path }, fileName: ref.name, size: ref.size });
            } catch (err) {
              setError(errorText(t, err));
            }
          }}
        />
      )}
    </div>
  );
}
