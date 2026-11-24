"use client";

import { useCallback, useEffect, useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { api, errorText, peekApi } from "@/lib/clientApi";
import { ITEM_KINDS } from "@/lib/office";
import { ErrorText } from "@/components/erp/ui/fields";
import { SkeletonList } from "@/components/erp/ui/Loading";
import { EmptyState } from "@/components/erp/ui/DataTools";
import { SearchBox } from "@/components/erp/ui/ListControls";
import { inputCls, ItemRow, PickSelect } from "@/components/erp/office/officeUi";

const STATES = ["open", "overdue", "waiting", "closed"];

// Every tracked item: follow-ups, requests to departments, complaints, issues and staff
// requests — by state, kind, department, with a search.
export default function ItemsView({ lookup, onOpen, refreshKey }) {
  const { t } = useLanguage();
  const [state, setState] = useState("open");
  const [kind, setKind] = useState("");
  const [department, setDepartment] = useState("");
  const [q, setQ] = useState("");
  const url = `/api/office/items?state=${state}${kind ? `&kind=${kind}` : ""}${department ? `&department=${department}` : ""}${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ""}`;
  const [items, setItems] = useState(() => peekApi(url)?.items || null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    api(url)
      .then((d) => setItems(d.items))
      .catch((err) => setError(errorText(t, err)));
  }, [url, t]);
  useEffect(() => {
    const timer = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(timer);
  }, [load, q, refreshKey]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-xl border border-white/10 p-1">
          {STATES.map((s) => (
            <button key={s} type="button" onClick={() => setState(s)} className={`rounded-lg px-3 py-1.5 text-xs ${state === s ? "bg-brand-orange text-white" : "text-white/60 hover:text-white"}`}>
              {t(`erp.office.state.${s}`)}
            </button>
          ))}
        </div>
        <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label={t("erp.office.kindLabel")} className={`${inputCls} w-auto`}>
          <option value="">{t("erp.office.allKinds")}</option>
          {ITEM_KINDS.map((k) => (
            <option key={k} value={k}>
              {t(`erp.office.kind.${k}`)}
            </option>
          ))}
        </select>
        <PickSelect value={department} onChange={setDepartment} list={lookup.departments} placeholder={t("erp.office.allDepartments")} className="w-auto" />
        <SearchBox value={q} onChange={setQ} placeholder={t("erp.office.searchItems")} />
      </div>
      <ErrorText>{error}</ErrorText>
      {!items && !error && <SkeletonList rows={5} avatar={false} />}
      {items?.length === 0 && <EmptyState compact text={t("erp.office.noItems")} />}
      <div className="space-y-2">
        {items?.map((i) => (
          <ItemRow key={i.id} item={i} onOpen={onOpen} />
        ))}
      </div>
    </div>
  );
}
