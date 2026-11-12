"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { HardDrive, PlugZap } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { cleanPath } from "@/lib/fileServerPaths";
import { Button, PageHeader } from "@/components/erp/ui/fields";
import { EmptyState } from "@/components/erp/ui/DataTools";
import { PageSkeleton } from "@/components/erp/ui/Loading";
import FileBrowser from "@/components/erp/files/FileBrowser";
import FileServerSettings from "@/components/erp/files/FileServerSettings";
import { clearFileSessions, loadFileServerStatus, useFileServer, useFileSession } from "@/components/erp/files/useFileServer";

// The company file server (the office share) in the dashboard: browse, open, download,
// upload — from the office or from anywhere — and, for its managers, the connection.
export default function FilesCenter() {
  const { t } = useLanguage();
  const params = useSearchParams();
  const initial = useFileServer();
  const [status, setStatus] = useState(null);
  const current = status || initial;
  const [tab, setTab] = useState(params.get("tab") === "connection" ? "connection" : "browse");

  if (!current) return <PageSkeleton tabs={2} />;
  const tabs = ["browse", current.canManage && "connection"].filter(Boolean);
  const reload = () => {
    clearFileSessions();
    return loadFileServerStatus(true).then(setStatus);
  };

  return (
    <div>
      <PageHeader
        title={t("erp.nav.files")}
        subtitle={t("erp.files.subtitle")}
        actions={
          <span className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs ${current.enabled ? "border-emerald-500/30 text-emerald-200" : "border-white/15 text-white/60"}`}>
            <span className={`h-2 w-2 rounded-full ${current.enabled ? "bg-emerald-400" : "bg-white/30"}`} />
            {current.enabled ? t("erp.files.connected") : t("erp.files.notConnected")}
          </span>
        }
      />
      {tabs.length > 1 && (
        <div className="mb-5 flex gap-1 overflow-x-auto border-b border-white/10">
          {tabs.map((k) => (
            <button key={k} type="button" onClick={() => setTab(k)} className={`-mb-px shrink-0 border-b-2 px-4 py-2.5 text-sm ${tab === k ? "border-brand-orange text-white" : "border-transparent text-white/50 hover:text-white"}`}>
              {t(`erp.files.tab.${k}`)}
            </button>
          ))}
        </div>
      )}

      {tab === "connection" && current.canManage ? (
        <FileServerSettings status={current} onSaved={reload} />
      ) : current.enabled ? (
        // A new address / key: a fresh session.
        <Browse key={`${current.url}`} params={params} />
      ) : (
        <EmptyState
          icon={HardDrive}
          title={t("erp.files.offTitle")}
          text={current.canManage ? t("erp.files.offTextManager") : t("erp.files.offText")}
          action={
            current.canManage && (
              <Button onClick={() => setTab("connection")}>
                <PlugZap size={16} /> {t("erp.files.setUp")}
              </Button>
            )
          }
        />
      )}
    </div>
  );
}

function Browse({ params }) {
  const fs = useFileSession({ for: "browse" });
  // ?vol=&path= opens a given folder (links shared in the dashboard).
  const path = cleanPath(params.get("path") || "");
  const start = params.get("vol") && path ? { vol: params.get("vol"), path } : undefined;
  return <FileBrowser fs={fs} start={start} height="calc(100vh - 20rem)" />;
}
