"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Hammer, CalendarOff, CheckCircle2, Inbox, Plus, ShoppingCart, Timer } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";
import { api, errorText } from "@/lib/clientApi";
import { pageAllowed } from "@/lib/pageAccess";
import Modal from "@/components/erp/ui/Modal";
import { Button, ErrorText, PageHeader } from "@/components/erp/ui/fields";
import { EmptyState } from "@/components/erp/ui/DataTools";
import { SkeletonList } from "@/components/erp/ui/Loading";
import LeaveList, { LeaveForm } from "@/components/erp/hr/LeaveList";
import OvertimeRequests from "@/components/erp/hr/OvertimeRequests";
import WorkRequests from "@/components/erp/orders/WorkRequests";
import PurchasingCenter from "@/components/erp/purchasing/PurchasingCenter";
import { ORDERS_CHANGED } from "@/components/erp/orders/ordersChanged";

const ICONS = { waiting: Inbox, leave: CalendarOff, overtime: Timer, purchase: ShoppingCart, work: Hammer };

function Heading({ children, count }) {
  return (
    <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-white/60">
      {children}
      {count > 0 && <span className="rounded-full bg-brand-orange px-2 py-0.5 text-[11px] normal-case text-white">{count}</span>}
    </h2>
  );
}

// Every request an employee makes (leave, overtime, purchases) in one place; whoever
// answers them finds what's waiting in the first tab. ?type=waiting|leave|overtime|purchase
export default function OrdersCenter() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [info, setInfo] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    api("/api/orders")
      .then((d) => {
        setInfo(d);
        setError("");
      })
      .catch((err) => setError(errorText(t, err)));
  }, [t]);
  useEffect(() => {
    load();
    window.addEventListener(ORDERS_CHANGED, load);
    return () => window.removeEventListener(ORDERS_CHANGED, load);
  }, [load]);

  const counts = info?.counts || {};
  const total = (counts.leave || 0) + (counts.overtime || 0) + (counts.purchase || 0) + (counts.work || 0);
  const decides = Boolean(info && Object.values(info.decides).some(Boolean));
  const tabs = info ? [decides && "waiting", "leave", "overtime", info.purchasing && "purchase", info.work && "work"].filter(Boolean) : [];
  const asked = params.get("type");
  const tab = tabs.includes(asked) ? asked : tabs[0];
  const pick = (next) => router.replace(`/dashboard/orders?type=${next}`, { scroll: false });
  const badge = { waiting: total, ...counts };
  // Suppliers and assets are in Finance for those who open it.
  const inFinance = Boolean(user?.permissions?.includes("finance.view") && pageAllowed(user, "finance"));

  return (
    <div className="max-w-5xl">
      <PageHeader title={t("erp.nav.orders")} subtitle={t("erp.orders.subtitle")} />
      <ErrorText>{error}</ErrorText>
      {!info && !error && <SkeletonList rows={5} />}
      {info && (
        <>
          <div className="mb-6 flex flex-wrap gap-1 border-b border-white/10">
            {tabs.map((k) => {
              const Icon = ICONS[k];
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => pick(k)}
                  data-active={tab === k} className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium ${tab === k ? "border-brand-orange text-white" : "border-transparent text-white/60 hover:text-white"}`}
                >
                  <Icon size={16} /> {t(`erp.orders.tab.${k}`)}
                  {badge[k] > 0 && <span className="rounded-full bg-brand-orange px-1.5 text-[11px] text-white">{badge[k]}</span>}
                </button>
              );
            })}
          </div>

          {tab === "waiting" && (
            <div className="space-y-10">
              {total === 0 && <EmptyState icon={CheckCircle2} title={t("erp.ux.allClear")} text={t("erp.orders.nothing")} />}
              {counts.leave > 0 && (
                <section>
                  <Heading count={counts.leave}>{t("erp.orders.tab.leave")}</Heading>
                  <TeamLeave only="waiting" />
                </section>
              )}
              {counts.work > 0 && (
                <section>
                  <Heading count={counts.work}>{t("erp.orders.tab.work")}</Heading>
                  <WorkRequests only="queue" />
                </section>
              )}
              {counts.overtime > 0 && (
                <section>
                  <Heading count={counts.overtime}>{t("erp.orders.tab.overtime")}</Heading>
                  <OvertimeRequests only="queue" />
                </section>
              )}
              {counts.purchase > 0 && (
                <section>
                  <Heading count={counts.purchase}>{t("erp.orders.tab.purchase")}</Heading>
                  <PurchasingCenter mode="queue" />
                </section>
              )}
            </div>
          )}
          {tab === "leave" && <Leave decides={info.decides.leave} />}
          {tab === "work" && <WorkRequests decides={info.decides.work} />}
          {tab === "overtime" && <OvertimeRequests embedded />}
          {tab === "purchase" && <PurchasingCenter mode={inFinance ? "orders" : "ordersFull"} />}
        </>
      )}
    </div>
  );
}

function Leave({ decides }) {
  const { t } = useLanguage();
  const [leaves, setLeaves] = useState(null);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(() => {
    api("/api/leave?view=mine")
      .then((d) => setLeaves(d.leaves))
      .catch((err) => setError(errorText(t, err)));
  }, [t]);
  useEffect(() => {
    load();
  }, [load]);
  return (
    <div className="space-y-10">
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <Heading>{t("erp.hr.myLeave")}</Heading>
          <Button onClick={() => setAsking(true)}>
            <Plus size={16} /> {t("erp.hr.requestLeave")}
          </Button>
        </div>
        <ErrorText>{error}</ErrorText>
        {!leaves && !error && <SkeletonList rows={3} />}
        {leaves && <LeaveList leaves={leaves} onChanged={load} />}
      </section>
      {decides && <TeamLeave />}
      <Modal open={asking} onClose={() => setAsking(false)} title={t("erp.hr.requestLeave")}>
        {asking && (
          <LeaveForm
            onCancel={() => setAsking(false)}
            onCreated={() => {
              setAsking(false);
              load();
            }}
          />
        )}
      </Modal>
    </div>
  );
}

// The team's (or company's) leave, for those who decide it. `only="waiting"`: just what
// waits for this person's own step.
function TeamLeave({ only }) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const meId = user?.id;
  const [leaves, setLeaves] = useState(null);
  const [error, setError] = useState("");
  const load = useCallback(() => {
    api("/api/leave?view=all")
      .then((d) => setLeaves(d.leaves.filter((l) => l.userId !== meId)))
      .catch((err) => setError(errorText(t, err)));
  }, [meId, t]);
  useEffect(() => {
    load();
  }, [load]);
  const changed = () => {
    load();
    window.dispatchEvent(new Event(ORDERS_CHANGED));
  };
  if (error) return <ErrorText>{error}</ErrorText>;
  if (!leaves) return <SkeletonList rows={3} />;
  const waiting = leaves.filter((l) => l.canDecide && !l.overrule);
  const others = leaves.filter((l) => l.status === "pending" && !waiting.includes(l));
  const done = leaves.filter((l) => l.status !== "pending");
  if (only === "waiting") return <LeaveList leaves={waiting} approver onChanged={changed} empty={t("erp.leaveFlow.nothingForYou")} />;
  return (
    <>
      <section>
        <Heading count={waiting.length}>{t("erp.leaveFlow.waitingYou")}</Heading>
        <LeaveList leaves={waiting} approver onChanged={changed} empty={t("erp.leaveFlow.nothingForYou")} />
      </section>
      {others.length > 0 && (
        <section>
          <Heading>{t("erp.leaveFlow.inProgress")}</Heading>
          <LeaveList leaves={others} approver onChanged={changed} />
        </section>
      )}
      <section>
        <Heading>{t("erp.hr.leaveHistory")}</Heading>
        <LeaveList leaves={done} approver onChanged={changed} />
      </section>
    </>
  );
}
