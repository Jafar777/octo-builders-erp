"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Plus } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";
import { api, errorText } from "@/lib/clientApi";
import Modal from "@/components/erp/ui/Modal";
import { Button, ErrorText, PageHeader, Select } from "@/components/erp/ui/fields";
import FinanceOverview from "@/components/erp/finance/FinanceOverview";
import ProjectAccounts from "@/components/erp/finance/ProjectAccounts";
import EntryForm from "@/components/erp/finance/EntryForm";
import EntryList from "@/components/erp/finance/EntryList";
import Transfers from "@/components/erp/finance/Transfers";
import Clients from "@/components/erp/finance/Clients";
import PricingCalculator from "@/components/erp/finance/PricingCalculator";
import FinanceSettings from "@/components/erp/finance/FinanceSettings";
import { useFinanceLookups } from "@/components/erp/finance/useFinanceLookups";
import { SkeletonCards, SkeletonChart } from "@/components/erp/ui/Loading";

const TABS = ["overview", "projects", "expenses", "transfers", "clients", "pricing", "settings"];

function Expenses({ lookups, year, canManage, onChanged }) {
  const { t } = useLanguage();
  const [entries, setEntries] = useState(null);
  const [editing, setEditing] = useState(null);
  const load = useCallback(() => {
    api(`/api/finance/entries?kind=operating_expense&year=${year}`).then((d) => setEntries(d.entries)).catch(() => {});
  }, [year]);
  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      {canManage && (
        <Button onClick={() => setEditing("new")}>
          <Plus size={16} /> {t("erp.finance.addExpense")}
        </Button>
      )}
      <EntryList entries={entries} lookups={lookups} canManage={canManage} onEdit={setEditing} onChanged={() => { load(); onChanged(); }} />
      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={t("erp.finance.addExpense")} wide>
        {editing && (
          <EntryForm
            lookups={lookups}
            kinds={["operating_expense"]}
            entry={editing === "new" ? null : editing}
            onCancel={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              load();
              onChanged();
            }}
          />
        )}
      </Modal>
    </div>
  );
}

export default function FinanceCenter() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const lookups = useFinanceLookups();
  const [tab, setTab] = useState(TABS.includes(searchParams.get("tab")) ? searchParams.get("tab") : "overview");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [summary, setSummary] = useState(null);
  const [projectId, setProjectId] = useState(searchParams.get("project") || null);
  const [error, setError] = useState("");
  const canManage = user?.permissions?.includes("finance.manage");

  const load = useCallback(async () => {
    try {
      setSummary(await api(`/api/finance/summary?year=${year}`));
    } catch (err) {
      setError(errorText(t, err));
    }
  }, [year, t]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const years = Array.from({ length: 5 }, (_, i) => String(new Date().getFullYear() - i));
  const visible = TABS.filter((k) => k !== "settings" || canManage);

  return (
    <div>
      <PageHeader
        title={t("erp.nav.finance")}
        subtitle={t("erp.finance.subtitle")}
        actions={
          <div className="w-32">
            <Select value={year} onChange={setYear} options={years.map((y) => ({ value: y, label: y }))} />
          </div>
        }
      />
      <div className="relative mb-6 flex flex-wrap gap-1 border-b border-white/10">
        {visible.map((key) => (
          <button key={key} type="button" onClick={() => setTab(key)} className="relative px-4 py-3 text-sm font-medium text-white/60 data-[active=true]:text-white" data-active={tab === key}>
            {t(`erp.finance.tab.${key}`)}
            {tab === key && <motion.span layoutId="finance-tab" className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand-orange" />}
          </button>
        ))}
      </div>
      <ErrorText>{error}</ErrorText>

      {!lookups.settings || !summary ? (
        <div className="space-y-6">
          <SkeletonCards count={8} />
          <SkeletonChart />
        </div>
      ) : (
        <>
          {tab === "overview" && (
            <FinanceOverview
              data={summary}
              lookups={lookups}
              onOpenProject={(id) => {
                setProjectId(id);
                setTab("projects");
              }}
            />
          )}
          {tab === "projects" && <ProjectAccounts lookups={lookups} summary={summary} projectId={projectId} onProject={setProjectId} canManage={canManage} onChanged={load} />}
          {tab === "expenses" && <Expenses lookups={lookups} year={year} canManage={canManage} onChanged={load} />}
          {tab === "transfers" && <Transfers lookups={lookups} canManage={canManage} onChanged={load} />}
          {tab === "clients" && <Clients lookups={lookups} canManage={canManage} />}
          {tab === "pricing" && <PricingCalculator embedded />}
          {tab === "settings" && canManage && (
            <FinanceSettings
              settings={lookups.settings}
              onSaved={() => {
                lookups.reloadSettings();
                load();
              }}
            />
          )}
        </>
      )}
    </div>
  );
}
