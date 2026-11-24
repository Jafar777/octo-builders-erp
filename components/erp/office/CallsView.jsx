"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCheck, PhoneCall } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { api, errorText } from "@/lib/clientApi";
import { formatDateTime } from "@/lib/formatTime";
import { whatsappLink } from "@/lib/office";
import { ErrorText } from "@/components/erp/ui/fields";
import { SkeletonList } from "@/components/erp/ui/Loading";
import { EmptyState } from "@/components/erp/ui/DataTools";
import { matches, SearchBox } from "@/components/erp/ui/ListControls";
import { RowButton } from "@/components/erp/office/officeUi";

// The call / message log: the last 30 days (or the calls still to return).
export default function CallsView({ refreshKey, clientId = null, compact = false, list: given = null }) {
  const { t, lang } = useLanguage();
  const [only, setOnly] = useState("all");
  const [list, setList] = useState(given);
  const [q, setQ] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(() => {
    if (given) return;
    const url = `/api/office/interactions?${only === "callbacks" ? "callbacks=1" : "days=30"}${clientId ? `&client=${clientId}` : ""}`;
    api(url)
      .then((d) => setList(d.interactions))
      .catch((err) => setError(errorText(t, err)));
  }, [only, clientId, given, t]);
  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const called = (x) => api(`/api/office/interactions/${x.id}`, { method: "PATCH", body: { callbackDone: true } }).then(load);
  const shown = (given || list || []).filter((x) => matches(q, x.summary, x.outcome, x.contactName, x.contactPhone, x.client?.name));

  return (
    <div className="space-y-3">
      {!compact && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-xl border border-white/10 p-1">
            {["all", "callbacks"].map((s) => (
              <button key={s} type="button" onClick={() => setOnly(s)} className={`rounded-lg px-3 py-1.5 text-xs ${only === s ? "bg-brand-orange text-white" : "text-white/60 hover:text-white"}`}>
                {t(`erp.office.calls.${s}`)}
              </button>
            ))}
          </div>
          <SearchBox value={q} onChange={setQ} placeholder={t("erp.office.calls.search")} />
        </div>
      )}
      <ErrorText>{error}</ErrorText>
      {!list && !given && !error && <SkeletonList rows={5} avatar={false} />}
      {shown.length === 0 && (list || given) && <EmptyState compact text={t("erp.office.calls.none")} />}
      <div className="space-y-2">
        {shown.map((x) => {
          const wa = whatsappLink(x.contactPhone);
          return (
            <div key={x.id} data-entity={`interaction:${x.id}`} className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5">
              <span className="mt-0.5 shrink-0 rounded-md bg-white/5 px-1.5 py-0.5 text-[11px] text-white/60">{t(`erp.office.channel.${x.channel}`)}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-white">{x.summary}</p>
                {x.outcome && <p className="mt-0.5 whitespace-pre-wrap text-xs text-white/60">{x.outcome}</p>}
                <p className="mt-0.5 text-[11px] text-white/45">
                  {[x.client?.name || x.contactName, x.contactPhone, x.by?.name, formatDateTime(x.at, lang)].filter(Boolean).join(" · ")}
                  {x.callback && !x.callbackDoneAt && <span className="ms-2 text-amber-300">{t("erp.office.calls.toReturn")}</span>}
                  {x.callbackDoneAt && <span className="ms-2 text-emerald-300">{t("erp.office.calls.returned")}</span>}
                </p>
              </div>
              {x.contactPhone && (
                <a href={`tel:${x.contactPhone}`} title={t("erp.office.call")} className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/70 hover:text-white">
                  <PhoneCall size={15} />
                </a>
              )}
              {wa && (
                <a href={wa} target="_blank" rel="noreferrer" className="flex h-8 items-center rounded-lg border border-white/10 bg-white/5 px-2 text-[11px] text-emerald-300">
                  WA
                </a>
              )}
              {x.callback && !x.callbackDoneAt && !given && <RowButton icon={CheckCheck} label={t("erp.office.calledBack")} onClick={() => called(x)} tone="hover:text-emerald-300" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
