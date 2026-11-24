"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Check, CheckCheck, Plus } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { api, errorText, peekApi } from "@/lib/clientApi";
import { ADMIN_REQUEST_TYPES, isOpen } from "@/lib/office";
import Modal from "@/components/erp/ui/Modal";
import { Button, ErrorText, PageHeader } from "@/components/erp/ui/fields";
import { SkeletonList } from "@/components/erp/ui/Loading";
import { EmptyState } from "@/components/erp/ui/DataTools";
import ItemDrawer from "@/components/erp/office/ItemDrawer";
import { inputCls, ItemRow, RowButton } from "@/components/erp/office/officeUi";

// Everyone's side of the executive office:
//   /dashboard/office/requests  my requests to the office (a salary certificate, supplies…)
//   /dashboard/office/inbox     what the office sent me or my departments to answer
export default function OfficeDesk({ tab, canUseOffice = false }) {
  const { t } = useLanguage();
  const url = tab === "inbox" ? "/api/office/inbox" : "/api/office/requests";
  const [items, setItems] = useState(() => peekApi(url)?.items || null);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState(null);
  const [asking, setAsking] = useState(false);

  const load = useCallback(() => {
    api(url)
      .then((d) => setItems(d.items))
      .catch((err) => setError(errorText(t, err)));
  }, [url, t]);
  useEffect(() => {
    load();
  }, [load]);

  const act = (item, action) => api(`/api/office/items/${item.id}`, { method: "PATCH", body: { action } }).then(load);
  const open = (items || []).filter(isOpen);
  const closed = (items || []).filter((i) => !isOpen(i));

  return (
    <div className="max-w-4xl space-y-5">
      <PageHeader
        title={t("erp.nav.officeRequests")}
        subtitle={t(tab === "inbox" ? "erp.office.desk.inboxSubtitle" : "erp.office.desk.requestsSubtitle")}
        actions={
          tab === "requests" && (
            <Button onClick={() => setAsking(true)}>
              <Plus size={16} /> {t("erp.office.desk.new")}
            </Button>
          )
        }
      />
      <div className="flex gap-1 rounded-xl border border-white/10 p-1">
        {["requests", "inbox"].map((k) => (
          <Link key={k} href={`/dashboard/office/${k}`} className={`rounded-lg px-4 py-2 text-sm ${tab === k ? "bg-brand-orange text-white" : "text-white/60 hover:text-white"}`}>
            {t(`erp.office.desk.tab.${k}`)}
          </Link>
        ))}
        {canUseOffice && (
          <Link href="/dashboard/office" className="ms-auto rounded-lg px-4 py-2 text-sm text-white/60 hover:text-white">
            {t("erp.nav.office")}
          </Link>
        )}
      </div>
      <ErrorText>{error}</ErrorText>
      {!items && !error && <SkeletonList rows={4} avatar={false} />}
      {items?.length === 0 && <EmptyState compact text={t(tab === "inbox" ? "erp.office.desk.inboxNone" : "erp.office.desk.requestsNone")} />}
      {open.length > 0 && (
        <div className="space-y-2">
          {open.map((i) => (
            <ItemRow
              key={i.id}
              item={i}
              onOpen={() => setOpenId(i.id)}
              showTarget={tab === "inbox"}
              actions={
                tab === "inbox" && i.can?.answer ? (
                  <>
                    {i.status === "sent" && <RowButton icon={Check} label={t("erp.office.act.acknowledge")} onClick={() => act(i, "acknowledge")} />}
                    <RowButton icon={CheckCheck} label={t("erp.office.act.done")} onClick={() => act(i, "done")} tone="hover:text-emerald-300" />
                  </>
                ) : null
              }
            />
          ))}
        </div>
      )}
      {closed.length > 0 && (
        <div className="space-y-2">
          <p className="pt-2 text-xs font-semibold text-white/40">{t("erp.office.desk.closed")}</p>
          {closed.map((i) => (
            <ItemRow key={i.id} item={i} onOpen={() => setOpenId(i.id)} showTarget={tab === "inbox"} />
          ))}
        </div>
      )}
      {tab === "inbox" && <p className="text-xs text-white/40">{t("erp.office.desk.inboxHint")}</p>}
      <ItemDrawer itemId={openId} onClose={() => setOpenId(null)} onChanged={load} />
      <Modal open={asking} onClose={() => setAsking(false)} title={t("erp.office.desk.new")}>
        {asking && (
          <AskOffice
            onCancel={() => setAsking(false)}
            onSaved={() => {
              setAsking(false);
              load();
            }}
          />
        )}
      </Modal>
    </div>
  );
}

function AskOffice({ onSaved, onCancel }) {
  const { t } = useLanguage();
  const [f, setF] = useState({ adminType: "salary_certificate", title: "", details: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setBusy(true);
    setError("");
    try {
      await api("/api/office/requests", { method: "POST", body: f });
      onSaved();
    } catch (err) {
      setError(errorText(t, err));
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <ErrorText>{error}</ErrorText>
      <div className="flex flex-wrap gap-1.5">
        {ADMIN_REQUEST_TYPES.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setF((x) => ({ ...x, adminType: k, title: x.title || "" }))}
            className={`rounded-lg px-3 py-1.5 text-xs ${f.adminType === k ? "bg-brand-orange text-white" : "bg-white/5 text-white/65 hover:text-white"}`}
          >
            {t(`erp.office.adminType.${k}`)}
          </button>
        ))}
      </div>
      <input
        value={f.title}
        onChange={(e) => setF((x) => ({ ...x, title: e.target.value }))}
        placeholder={t("erp.office.desk.titlePh")}
        aria-label={t("erp.office.desk.titlePh")}
        className={inputCls}
      />
      <textarea value={f.details} onChange={(e) => setF((x) => ({ ...x, details: e.target.value }))} rows={3} placeholder={t("erp.office.detailsPlaceholder")} className={inputCls} />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button loading={busy} disabled={!f.title.trim()} onClick={save}>
          {t("erp.office.desk.send")}
        </Button>
      </div>
    </div>
  );
}
