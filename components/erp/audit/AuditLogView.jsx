"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { api, errorText } from "@/lib/clientApi";
import { formatDateTime } from "@/lib/formatTime";
import { Button, ErrorText, PageHeader, Select } from "@/components/erp/ui/fields";
import { SkeletonList } from "@/components/erp/ui/Loading";
import { EmptyState } from "@/components/erp/ui/DataTools";

const ACTION_FILTERS = ["", "user", "role", "task", "project", "template", "attendance", "payroll", "leave", "kpi", "finance", "departments", "branches", "jobTitles", "settings", "messages"];

export default function AuditLogView() {
  const { t, lang } = useLanguage();
  const [logs, setLogs] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [action, setAction] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(null);

  const load = useCallback(
    async (before) => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams();
        if (action) params.set("action", action);
        if (before) params.set("before", before);
        const data = await api(`/api/audit?${params}`);
        setLogs((prev) => (before ? [...prev, ...data.logs] : data.logs));
        setHasMore(data.hasMore);
      } catch (err) {
        setError(errorText(t, err));
      } finally {
        setLoading(false);
      }
    },
    [action, t]
  );

  useEffect(() => {
    // Reload from the first page whenever the filter changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const label = (a) => {
    const key = `erp.audit.action.${a}`;
    const text = t(key);
    return text === key ? a : text;
  };

  return (
    <div>
      <PageHeader title={t("erp.nav.audit")} subtitle={t("erp.audit.subtitle")} />

      <div className="mb-5 max-w-xs">
        <Select
          value={action}
          onChange={setAction}
          options={ACTION_FILTERS.map((a) => ({ value: a, label: a ? t(`erp.audit.filter_${a}`) : t("erp.audit.all") }))}
        />
      </div>
      <ErrorText>{error}</ErrorText>

      <div className="space-y-2">
        {logs.map((log) => (
          <div key={log.id} className="rounded-xl border border-white/10 bg-white/[0.03]">
            <button
              type="button"
              onClick={() => setOpen(open === log.id ? null : log.id)}
              className="flex w-full items-center gap-4 px-4 py-3 text-start text-sm"
            >
              <span className="w-40 shrink-0 text-xs text-white/60">{formatDateTime(log.createdAt, lang)}</span>
              <span className="min-w-0 flex-1">
                <span className="font-medium">{log.actorName}</span>
                <span className="text-white/60"> · {label(log.action)}</span>
                {log.summary && <span className="text-white/60"> · {log.summary}</span>}
              </span>
              <ChevronDown size={16} className={`shrink-0 text-white/60 transition-transform ${open === log.id ? "rotate-180" : ""}`} />
            </button>
            {open === log.id && (
              <pre dir="ltr" className="overflow-x-auto border-t border-white/10 px-4 py-3 text-xs text-white/60">
                {JSON.stringify(log.details, null, 2)}
              </pre>
            )}
          </div>
        ))}
        {loading && logs.length === 0 && <SkeletonList rows={8} />}
        {!loading && logs.length === 0 && <EmptyState compact text={t("dashboard.noItems")} />}
      </div>

      <div className="mt-5 flex justify-center">
        {hasMore && (
          <Button variant="ghost" loading={loading} onClick={() => load(logs[logs.length - 1]?.createdAt)}>
            {t("erp.loadMore")}
          </Button>
        )}
      </div>
    </div>
  );
}
