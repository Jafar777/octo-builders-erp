"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { useLanguage } from "@/context/LanguageContext";
import { PageHeader } from "@/components/erp/ui/fields";
import SystemHealth from "@/components/erp/system/SystemHealth";
import AuditLogView from "@/components/erp/audit/AuditLogView";
import LegacyImport from "@/components/erp/system/LegacyImport";
import RolesManager from "@/components/erp/roles/RolesManager";
import ChangeLog from "@/components/erp/system/ChangeLog";

// The System page: health, audit log and change log tabs (?tab=health|roles|audit|changes|import).
export default function SystemCenter({ tabs, roles = [] }) {
  const { t } = useLanguage();
  const router = useRouter();
  const searchParams = useSearchParams();
  const asked = searchParams.get("tab");
  const [tab, setTab] = useState(tabs.includes(asked) ? asked : tabs[0]);

  function choose(key) {
    setTab(key);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", key);
    params.delete("view");
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t("erp.nav.system")} subtitle={t(tab === "health" ? "erp.system.subtitle" : tab === "audit" ? "erp.audit.subtitle" : tab === "roles" ? "erp.access.subtitle" : "erp.system.pageSubtitle")} />
      {tabs.length > 1 && (
        <div className="flex gap-1 border-b border-white/10">
          {tabs.map((key) => (
            <button key={key} type="button" onClick={() => choose(key)} className="relative px-4 py-3 text-sm font-medium text-white/60 data-[active=true]:text-white" data-active={tab === key}>
              {t(`erp.system.tab.${key}`)}
              {tab === key && <motion.span layoutId="system-tab" className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand-orange" />}
            </button>
          ))}
        </div>
      )}
      {tab === "health" && <SystemHealth embedded />}
      {tab === "roles" && <RolesManager initialRoles={roles} />}
      {tab === "audit" && <AuditLogView />}
      {tab === "import" && <LegacyImport />}
      {tab === "changes" && <ChangeLog />}
    </div>
  );
}
