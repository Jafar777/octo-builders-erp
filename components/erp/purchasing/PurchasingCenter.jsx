"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, Package, Plus, Receipt, Truck, X } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { api, errorText } from "@/lib/clientApi";
import { formatMoney } from "@/components/erp/intake/MoneyFields";
import Modal from "@/components/erp/ui/Modal";
import { Button, Card, ErrorText, Input, PageHeader, Select } from "@/components/erp/ui/fields";
import { useTaskLookups } from "@/components/erp/tasks/useTaskLookups";
import { useAsk, useConfirm, useToast } from "@/components/erp/ui/Feedback";
import { Checkbox, EmptyState, ShowMore, TableToolbar, useTableTools } from "@/components/erp/ui/DataTools";

const STATUS_TONE = {
  pending: "bg-amber-500/15 text-amber-300",
  approved: "bg-sky-500/15 text-sky-300",
  ordered: "bg-violet-500/15 text-violet-300",
  received: "bg-emerald-500/15 text-emerald-300",
  rejected: "bg-red-500/15 text-red-300",
  cancelled: "bg-white/10 text-white/60",
};
const ASSET_TYPES = ["computer", "monitor", "software", "printer", "phone", "furniture", "equipment", "other"];
const ASSET_STATUSES = ["in_use", "in_stock", "repair", "retired"];

// Purchasing: ask to buy (optionally holding a task until it arrives), approve, order,
// receive, book the expense, and the register of company equipment and licences.
export default function PurchasingCenter() {
  const { t } = useLanguage();
  const params = useSearchParams();
  const lookups = useTaskLookups();
  const [tab, setTab] = useState(params.get("tab") || "mine");
  const [data, setData] = useState(null);
  const [suppliers, setSuppliers] = useState([]);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState("");
  const ask = useAsk();
  const toast = useToast();

  const load = useCallback(() => {
    api(`/api/purchasing/requests?tab=${tab === "assets" || tab === "suppliers" ? "all" : tab}`)
      .then(setData)
      .catch((err) => setError(errorText(t, err)));
    api("/api/purchasing/suppliers").then((d) => setSuppliers(d.suppliers)).catch(() => {});
  }, [tab, t]);
  useEffect(() => {
    load();
  }, [load]);

  async function act(r, body) {
    setError("");
    try {
      await api(`/api/purchasing/requests/${r.id}`, { method: "PATCH", body });
      load();
    } catch (err) {
      setError(errorText(t, err));
    }
  }

  const requests = data?.requests || [];
  const tools = useTableTools(requests, {}, { search: (r) => [r.number, r.title, r.requestedByName, r.supplierName, t(`erp.purchasing.status.${r.status}`)].join(" ") });
  const decidable = tools.view.filter((r) => r.canDecide && r.status === "pending");
  const reject = async (r) => {
    const note = await ask({ text: t("erp.purchasing.notePrompt"), danger: true, confirmLabel: t("erp.purchasing.reject") });
    if (note !== null) act(r, { action: "reject", note });
  };
  const approveMany = async (rows) => {
    let done = 0;
    for (const r of rows.filter((x) => x.canDecide && x.status === "pending")) {
      try {
        await api(`/api/purchasing/requests/${r.id}`, { method: "PATCH", body: { action: "approve", note: "" }, quiet: true });
        done += 1;
      } catch {}
    }
    toast({ text: t("erp.ux.bulkDone", { n: done, total: rows.length }), tone: done === rows.length ? "success" : "error" });
    load();
  };
  const exportColumns = [
    { label: "#", value: (r) => r.number },
    { label: t("erp.reports.col.title"), value: (r) => r.title },
    { label: t("erp.reports.col.requestedBy"), value: (r) => r.requestedByName },
    { label: t("erp.reports.col.status"), value: (r) => t(`erp.purchasing.status.${r.status}`) },
    { label: t("erp.reports.col.currency"), value: (r) => r.currency },
    { label: t("erp.reports.col.total"), value: (r) => r.total ?? "" },
  ];

  const tabs = ["mine", data?.canApprove && "queue", (data?.canApprove || data?.canManageAssets) && "all", data?.canApprove && "suppliers", data?.canManageAssets && "assets"].filter(Boolean);
  return (
    <div>
      <PageHeader
        title={t("erp.nav.purchasing")}
        subtitle={t("erp.purchasing.subtitle")}
        actions={
          data?.canRequest && (
            <Button onClick={() => setAsking(true)}>
              <Plus size={16} /> {t("erp.purchasing.ask")}
            </Button>
          )
        }
      />
      <div className="mb-5 flex gap-1 overflow-x-auto border-b border-white/10">
        {tabs.map((k) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={`-mb-px shrink-0 border-b-2 px-4 py-2.5 text-sm ${tab === k ? "border-brand-orange text-white" : "border-transparent text-white/50 hover:text-white"}`}>
            {t(`erp.purchasing.tab.${k}`)}
          </button>
        ))}
      </div>
      <ErrorText>{error}</ErrorText>

      {["mine", "queue", "all"].includes(tab) && data && (
        <Card>
          {requests.length > 0 && (
            <TableToolbar
              tools={tools}
              exportFile={t("erp.nav.purchasing")}
              exportColumns={exportColumns}
              actions={decidable.length ? [{ label: t("erp.ux.approveSelected"), icon: Check, onClick: approveMany }] : []}
            >
              {decidable.length > 1 && (
                <button type="button" onClick={() => decidable.forEach((r) => !tools.selected.has(r.id) && tools.toggle(r.id))} className="text-sm text-white/70 hover:text-white">
                  {t("erp.ux.selectPending", { n: decidable.length })}
                </button>
              )}
            </TableToolbar>
          )}
          {!tools.view.length && (
            <EmptyState
              icon={Package}
              compact
              title={requests.length ? t("erp.ux.noMatches") : t("erp.ux.emptyTitle")}
              text={requests.length ? t("erp.ux.noMatchesText") : t("erp.purchasing.none")}
              action={
                !requests.length && data.canRequest && tab === "mine" ? (
                  <Button onClick={() => setAsking(true)}>
                    <Plus size={16} /> {t("erp.purchasing.ask")}
                  </Button>
                ) : null
              }
            />
          )}
          <ul className="divide-y divide-white/5">
            {tools.shown.map((r) => (
              <li key={r.id} className="flex flex-wrap items-start gap-3 py-3 text-sm">
                {decidable.length > 0 && (
                  <span className="pt-0.5">{r.canDecide && r.status === "pending" ? <Checkbox checked={tools.selected.has(r.id)} onChange={() => tools.toggle(r.id)} label={r.title} /> : <span className="block w-5" />}</span>
                )}
                <span className="font-mono text-xs text-white/60" dir="ltr">
                  {r.number}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{r.title}</p>
                  <p className="text-xs text-white/60">
                    {r.requestedByName}
                    {r.supplierName && ` · ${r.supplierName}`}
                    {r.neededBy && ` · ${t("erp.purchasing.neededBy", { date: r.neededBy })}`}
                    {r.taskNumber && ` · ${t("erp.purchasing.holdsTask", { n: r.taskNumber })}`}
                  </p>
                  {r.decisionNote && <p className="mt-1 text-xs text-white/55">“{r.decisionNote}” — {r.decidedByName}</p>}
                </div>
                {r.total !== null && r.total > 0 && <span className="tabular-nums">{formatMoney(r.total, r.currency, "en")}</span>}
                <span className={`rounded-full px-2 py-0.5 text-[11px] ${STATUS_TONE[r.status]}`}>{t(`erp.purchasing.status.${r.status}`)}</span>
                <div className="flex flex-wrap gap-1">
                  {r.canDecide && r.status === "pending" && (
                    <>
                      <SmallBtn icon={Check} label={t("erp.purchasing.approve")} tone="text-emerald-300" onClick={() => act(r, { action: "approve", note: "" })} />
                      <SmallBtn icon={X} label={t("erp.purchasing.reject")} tone="text-red-300" onClick={() => reject(r)} />
                    </>
                  )}
                  {(data.canApprove || data.canManageAssets) && r.status === "approved" && <SmallBtn icon={Truck} label={t("erp.purchasing.markOrdered")} onClick={() => act(r, { action: "ordered" })} />}
                  {(data.canApprove || data.canManageAssets) && ["approved", "ordered"].includes(r.status) && (
                    <SmallBtn icon={Package} label={t("erp.purchasing.markReceived")} tone="text-emerald-300" onClick={() => act(r, { action: "received" })} />
                  )}
                  {data.canBook && !r.expense && ["approved", "ordered", "received"].includes(r.status) && (
                    <SmallBtn icon={Receipt} label={t("erp.purchasing.bookExpense")} onClick={() => act(r, { action: "expense" })} />
                  )}
                  {data.canManageAssets && !r.asset && r.status === "received" && (
                    <SmallBtn icon={Plus} label={t("erp.purchasing.addAsset")} onClick={() => act(r, { action: "asset", type: "other" })} />
                  )}
                  {r.status === "pending" && tab === "mine" && <SmallBtn icon={X} label={t("common.cancel")} onClick={() => act(r, { action: "cancel" })} />}
                </div>
              </li>
            ))}
          </ul>
          <ShowMore tools={tools} />
        </Card>
      )}

      {tab === "suppliers" && <Suppliers suppliers={suppliers} onChanged={load} />}
      {tab === "assets" && <Assets lookups={lookups} />}

      <Modal open={asking} onClose={() => setAsking(false)} title={t("erp.purchasing.ask")} wide>
        {asking && (
          <AskForm
            suppliers={suppliers}
            onDone={() => {
              setAsking(false);
              setTab("mine");
              load();
            }}
          />
        )}
      </Modal>
    </div>
  );
}

function SmallBtn({ icon: Icon, label, onClick, tone = "text-white/70" }) {
  return (
    <button type="button" onClick={onClick} title={label} className={`flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-xs hover:bg-white/10 ${tone}`}>
      <Icon size={13} /> <span className="hidden md:inline">{label}</span>
    </button>
  );
}

function AskForm({ suppliers, onDone }) {
  const { t } = useLanguage();
  const [form, setForm] = useState({ title: "", description: "", supplier: "", neededBy: "", currency: "USD", task: "", items: [{ description: "", qty: 1, unitPrice: "" }] });
  const [myTasks, setMyTasks] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  useEffect(() => {
    api("/api/tasks?view=mine&status=todo").then((d) => setMyTasks(d.tasks || [])).catch(() => {});
  }, []);
  async function save() {
    setBusy(true);
    setError("");
    try {
      await api("/api/purchasing/requests", { method: "POST", body: form });
      onDone();
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label={t("erp.purchasing.what")} value={form.title} onChange={set("title")} />
        <Select label={t("erp.purchasing.supplier")} value={form.supplier} onChange={set("supplier")} placeholder="—" options={suppliers.map((s) => ({ value: s.id, label: s.name }))} />
        <Input label={t("erp.purchasing.neededByLabel")} type="date" value={form.neededBy} onChange={set("neededBy")} />
        <Select label={t("erp.purchasing.forTask")} value={form.task} onChange={set("task")} placeholder={t("erp.purchasing.noTask")} options={myTasks.map((x) => ({ value: x.id, label: `#${x.number} ${x.project?.name?.ar || x.title || ""}` }))} />
      </div>
      {form.task && <p className="text-xs text-amber-200/80">{t("erp.purchasing.taskWaits")}</p>}
      <label className="block text-sm text-white/70">
        {t("erp.purchasing.why")}
        <textarea rows={2} value={form.description} onChange={(e) => set("description")(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none" />
      </label>
      <div className="space-y-2">
        <p className="text-sm font-medium text-white/70">{t("erp.invoices.items")}</p>
        {form.items.map((it, i) => (
          <div key={i} className="grid grid-cols-[minmax(0,1fr)_70px_110px] gap-2">
            {[
              ["description", t("erp.invoices.itemDescription"), "text"],
              ["qty", t("erp.purchasing.qty"), "number"],
              ["unitPrice", t("erp.purchasing.unitPrice"), "number"],
            ].map(([k, label, type]) => (
              <input
                key={k}
                type={type}
                value={it[k]}
                placeholder={label}
                aria-label={label}
                onChange={(e) => setForm((f) => ({ ...f, items: f.items.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)) }))}
                className="min-w-0 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none"
              />
            ))}
          </div>
        ))}
        <div className="flex items-center justify-between">
          <button type="button" onClick={() => setForm((f) => ({ ...f, items: [...f.items, { description: "", qty: 1, unitPrice: "" }] }))} className="text-xs text-brand-orange hover:underline">
            + {t("erp.invoices.addItem")}
          </button>
          <div className="w-28">
            <Select value={form.currency} onChange={set("currency")} options={["USD", "SAR"].map((c) => ({ value: c, label: c }))} />
          </div>
        </div>
      </div>
      <ErrorText>{error}</ErrorText>
      <div className="flex justify-end">
        <Button onClick={save} loading={busy} disabled={!form.title}>
          {t("erp.purchasing.send")}
        </Button>
      </div>
    </div>
  );
}

function Suppliers({ suppliers, onChanged }) {
  const { t } = useLanguage();
  const confirm = useConfirm();
  const [form, setForm] = useState({ name: "", category: "", phone: "", email: "" });
  const [error, setError] = useState("");
  async function add() {
    setError("");
    try {
      await api("/api/purchasing/suppliers", { method: "POST", body: form });
      setForm({ name: "", category: "", phone: "", email: "" });
      onChanged();
    } catch (err) {
      setError(errorText(t, err));
    }
  }
  return (
    <div className="space-y-4">
      <Card>
        <div className="grid gap-3 sm:grid-cols-5">
          <Input label={t("erp.sales.name")} value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} />
          <Input label={t("erp.purchasing.category")} value={form.category} onChange={(v) => setForm((f) => ({ ...f, category: v }))} />
          <Input label={t("erp.sales.phone")} value={form.phone} onChange={(v) => setForm((f) => ({ ...f, phone: v }))} dir="ltr" />
          <Input label={t("erp.sales.email")} value={form.email} onChange={(v) => setForm((f) => ({ ...f, email: v }))} dir="ltr" />
          <div className="flex items-end">
            <Button onClick={add} disabled={!form.name}>
              <Plus size={15} /> {t("erp.purchasing.addSupplier")}
            </Button>
          </div>
        </div>
        <ErrorText>{error}</ErrorText>
      </Card>
      <Card>
        <ul className="divide-y divide-white/5 text-sm">
          {suppliers.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-3 py-2">
              <span className="flex-1 font-medium">{s.name}</span>
              <span className="text-white/60">{s.category}</span>
              <span className="text-white/55" dir="ltr">
                {s.phone} {s.email}
              </span>
              <button
                type="button"
                onClick={async () => {
                  if (!(await confirm({ text: t("common.confirmDelete"), kind: "delete" }))) return;
                  await api(`/api/purchasing/suppliers/${s.id}`, { method: "DELETE" }).catch(() => {});
                  onChanged();
                }}
                className="text-xs text-white/55 hover:text-red-300"
              >
                {t("common.delete")}
              </button>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function Assets({ lookups }) {
  const { t, lang } = useLanguage();
  const [list, setList] = useState(null);
  const [editing, setEditing] = useState(null);
  const [filter, setFilter] = useState("");
  const load = useCallback(() => {
    api("/api/assets").then((d) => setList(d.assets)).catch(() => {});
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  // Today and 30 days ahead, fixed when the list opens (licences expiring soon in amber).
  const [{ today, soon }] = useState(() => ({ today: new Date().toISOString().slice(0, 10), soon: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10) }));
  const shown = (list || []).filter((a) => !filter || a.type === filter || a.status === filter);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="w-48">
          <Select value={filter} onChange={setFilter} placeholder={t("erp.assets.all")} options={[...ASSET_TYPES.map((x) => ({ value: x, label: t(`erp.assets.type.${x}`) })), ...ASSET_STATUSES.map((x) => ({ value: x, label: t(`erp.assets.status.${x}`) }))]} />
        </div>
        <Button onClick={() => setEditing("new")}>
          <Plus size={15} /> {t("erp.assets.add")}
        </Button>
      </div>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-xs text-white/60">
              <tr className="border-b border-white/10">
                {["tag", "name", "type", "holder", "status", "expiry"].map((k) => (
                  <th key={k} className="px-2 py-2 text-start font-medium">
                    {t(`erp.assets.col.${k}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((a) => (
                <tr key={a.id} onClick={() => setEditing(a)} className="cursor-pointer border-b border-white/5 hover:bg-white/[0.03]">
                  <td className="px-2 py-2 font-mono text-xs" dir="ltr">
                    {a.tag}
                  </td>
                  <td className="px-2 py-2">{a.name}</td>
                  <td className="px-2 py-2 text-white/60">{t(`erp.assets.type.${a.type}`)}</td>
                  <td className="px-2 py-2">{a.holderName || "—"}</td>
                  <td className="px-2 py-2 text-white/60">{t(`erp.assets.status.${a.status}`)}</td>
                  <td className={`px-2 py-2 tabular-nums ${a.licenseExpiry && a.licenseExpiry < today ? "text-red-300" : a.licenseExpiry && a.licenseExpiry <= soon ? "text-amber-300" : "text-white/55"}`}>{a.licenseExpiry || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={editing === "new" ? t("erp.assets.add") : `${editing?.tag} · ${editing?.name}`} wide>
        {editing && (
          <AssetForm
            key={editing === "new" ? "new" : editing.id}
            asset={editing === "new" ? null : editing}
            lookups={lookups}
            lang={lang}
            onDone={() => {
              setEditing(null);
              load();
            }}
          />
        )}
      </Modal>
    </div>
  );
}

function AssetForm({ asset, lookups, lang, onDone }) {
  const { t } = useLanguage();
  const confirm = useConfirm();
  const [form, setForm] = useState({
    name: asset?.name || "",
    type: asset?.type || "computer",
    serial: asset?.serial || "",
    holder: asset?.holder || "",
    status: asset?.status || "in_stock",
    purchaseDate: asset?.purchaseDate || "",
    cost: asset?.cost ?? "",
    currency: asset?.currency || "USD",
    licenseExpiry: asset?.licenseExpiry || "",
    notes: asset?.notes || "",
  });
  const [error, setError] = useState("");
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  async function save() {
    setError("");
    try {
      if (asset) await api(`/api/assets/${asset.id}`, { method: "PATCH", body: { ...form, holder: form.holder || null } });
      else await api("/api/assets", { method: "POST", body: form });
      onDone();
    } catch (err) {
      setError(errorText(t, err));
    }
  }
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label={t("erp.assets.col.name")} value={form.name} onChange={set("name")} />
        <Select label={t("erp.assets.col.type")} value={form.type} onChange={set("type")} options={ASSET_TYPES.map((x) => ({ value: x, label: t(`erp.assets.type.${x}`) }))} />
        <Input label={t("erp.assets.serial")} value={form.serial} onChange={set("serial")} dir="ltr" />
        <Select label={t("erp.assets.col.holder")} value={form.holder} onChange={set("holder")} placeholder={t("erp.assets.nobody")} options={lookups.people.map((p) => ({ value: p.id, label: p.name }))} />
        <Select label={t("erp.assets.col.status")} value={form.status} onChange={set("status")} options={ASSET_STATUSES.map((x) => ({ value: x, label: t(`erp.assets.status.${x}`) }))} />
        <Input label={t("erp.assets.purchaseDate")} type="date" value={form.purchaseDate} onChange={set("purchaseDate")} />
        {(!asset || asset.cost !== undefined) && <Input label={t("erp.assets.cost")} type="number" value={form.cost} onChange={set("cost")} dir="ltr" />}
        <Input label={t("erp.assets.col.expiry")} type="date" value={form.licenseExpiry} onChange={set("licenseExpiry")} />
      </div>
      <Input label={t("erp.invoices.notes")} value={form.notes} onChange={set("notes")} />
      {asset?.history?.length > 0 && (
        <ul className="space-y-1 text-xs text-white/50">
          {asset.history.map((h, i) => (
            <li key={i}>
              {new Date(h.at).toLocaleDateString(lang === "ar" ? "ar" : "en-GB")} · {t(`erp.assets.action.${h.action}`)} {h.holderName && `→ ${h.holderName}`} · {h.by}
            </li>
          ))}
        </ul>
      )}
      <ErrorText>{error}</ErrorText>
      <div className="flex justify-between">
        {asset ? (
          <Button
            variant="danger"
            onClick={async () => {
              if (!(await confirm({ text: t("common.confirmDelete"), kind: "delete" }))) return;
              await api(`/api/assets/${asset.id}`, { method: "DELETE" }).catch(() => {});
              onDone();
            }}
          >
            {t("common.delete")}
          </Button>
        ) : (
          <span />
        )}
        <Button onClick={save} disabled={!form.name}>
          {t("common.save")}
        </Button>
      </div>
    </div>
  );
}
