"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Clock, Timer, Trash2, XCircle } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { api, errorText } from "@/lib/clientApi";
import { formatDate, formatDateTime } from "@/lib/formatTime";
import Avatar from "@/components/erp/ui/Avatar";
import TraineeBadge from "@/components/erp/ui/TraineeBadge";
import { Button, Card, ErrorText, Input, PageHeader } from "@/components/erp/ui/fields";
import { SkeletonList } from "@/components/erp/ui/Loading";
import { MonthPicker } from "@/components/erp/hr/hrUi";

const STATUS_STYLE = {
  pending: "border-amber-400/40 bg-amber-500/10 text-amber-200",
  approved: "border-emerald-400/40 bg-emerald-500/10 text-emerald-200",
  rejected: "border-red-400/40 bg-red-500/10 text-red-200",
};

// Overtime requests (lib/overtime.js): an employee asks for today; their department
// manager or the CEO approves (the hours count) or rejects (nothing counts). History:
// the month's decided requests and each person's approved total.
export default function OvertimeRequests() {
  const { t } = useLanguage();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState(["mine", "queue", "history"].includes(searchParams.get("tab")) ? searchParams.get("tab") : "mine");
  const [month, setMonth] = useState("");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    api(`/api/overtime?tab=${tab}${tab === "history" && month ? `&month=${month}` : ""}`)
      .then((d) => {
        setData(d);
        if (tab === "history") setMonth(d.month);
      })
      .catch((err) => setError(errorText(t, err)));
  }, [tab, month, t]);
  useEffect(() => {
    load();
  }, [load]);

  const pick = (next) => {
    setData(null);
    setError("");
    setTab(next);
    router.replace(`/dashboard/overtime?tab=${next}`, { scroll: false });
  };
  // The approvers' tab only for department managers and the CEO (the server says).
  const tabs = ["mine", ...(data?.canDecide || tab === "queue" ? ["queue"] : []), "history"];

  return (
    <div className="max-w-5xl">
      <PageHeader title={t("erp.overtime.title")} subtitle={t("erp.overtime.subtitle")} />
      <div className="mb-5 flex flex-wrap gap-1 rounded-xl border border-white/10 p-1">
        {tabs.map((x) => (
          <button key={x} type="button" onClick={() => pick(x)} className={`rounded-lg px-4 py-2 text-sm ${tab === x ? "bg-brand-orange text-white" : "text-white/60 hover:text-white"}`}>
            {t(`erp.overtime.tab.${x}`)}
          </button>
        ))}
      </div>
      <ErrorText>{error}</ErrorText>
      {!data && !error && <SkeletonList rows={4} />}
      {data && tab === "mine" && <Mine data={data} onChanged={load} />}
      {data && tab === "queue" && <Queue data={data} onChanged={load} />}
      {data && tab === "history" && <History data={data} month={month} onMonth={setMonth} />}
    </div>
  );
}

function StatusChip({ status }) {
  const { t } = useLanguage();
  return <span className={`inline-flex shrink-0 rounded-full border px-2.5 py-0.5 text-xs ${STATUS_STYLE[status]}`}>{t(`erp.overtime.status.${status}`)}</span>;
}

// One request: who, which day, hours asked / approved, reason, decision.
function RequestRow({ r, showUser, children }) {
  const { t, lang } = useLanguage();
  return (
    <Card className="space-y-2 !p-4">
      <div className="flex flex-wrap items-center gap-3">
        {showUser && (
          <span className="flex min-w-0 items-center gap-2 font-medium">
            <Avatar name={r.user.name} src={r.user.avatarUrl} size={28} />
            <span className="truncate">{r.user.name}</span>
            <TraineeBadge id={r.user.id} />
          </span>
        )}
        <span className="text-sm text-white/60">{formatDate(r.date, lang)}</span>
        <span className="flex items-center gap-1 text-sm text-white/80">
          <Timer size={14} /> {t("erp.overtime.asked", { h: r.hours })}
        </span>
        {r.status === "approved" && <span className="text-sm text-emerald-200">{t("erp.overtime.approvedHours", { h: r.approvedHours })}</span>}
        <span className="ms-auto">
          <StatusChip status={r.status} />
        </span>
      </div>
      {r.reason && <p className="whitespace-pre-wrap text-sm text-white/70">{r.reason}</p>}
      {r.decidedBy && (
        <p className="text-xs text-white/45">
          {t("erp.overtime.decidedBy", { name: r.decidedBy, at: formatDateTime(r.decidedAt, lang) })}
          {r.decisionNote ? ` — ${r.decisionNote}` : ""}
        </p>
      )}
      {children}
    </Card>
  );
}

function Mine({ data, onChanged }) {
  const { t, lang } = useLanguage();
  const mine = data.todayRequest;
  const [hours, setHours] = useState(mine ? String(mine.hours) : "1");
  const [reason, setReason] = useState(mine?.reason || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function send() {
    setBusy(true);
    setError("");
    try {
      await api("/api/overtime", { method: "POST", body: { hours: Number(hours), reason } });
      onChanged();
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setBusy(false);
    }
  }
  async function withdraw(id) {
    if (!window.confirm(t("erp.overtime.withdrawConfirm"))) return;
    try {
      await api(`/api/overtime/${id}`, { method: "DELETE" });
      onChanged();
    } catch (err) {
      setError(errorText(t, err));
    }
  }

  return (
    <div className="space-y-5">
      {data.canAsk ? (
        <Card className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-2 font-semibold">
              <Clock size={16} className="text-brand-orange" /> {t("erp.overtime.askTitle")}
            </p>
            <span className="text-xs text-white/50">{t("erp.overtime.today", { date: formatDate(data.today, lang) })}</span>
          </div>
          <p className="text-xs text-white/50">{t("erp.overtime.askHint")}</p>
          {mine && mine.status !== "pending" ? (
            <p className="text-sm text-white/60">{t("erp.overtime.todayDecided")}</p>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
                <Input type="number" min="0.5" max="16" step="0.5" label={t("erp.overtime.hours")} value={hours} onChange={setHours} dir="ltr" />
                <Input label={t("erp.overtime.reason")} value={reason} onChange={setReason} />
              </div>
              <ErrorText>{error}</ErrorText>
              <Button onClick={send} loading={busy} disabled={!(Number(hours) >= 0.5 && Number(hours) <= 16)}>
                {t(mine ? "erp.overtime.update" : "erp.overtime.ask")}
              </Button>
            </>
          )}
        </Card>
      ) : (
        <p className="text-sm text-white/50">{t("erp.overtime.cantAsk")}</p>
      )}

      <div className="space-y-2">
        {data.requests.map((r) => (
          <RequestRow key={r.id} r={r}>
            {r.status === "pending" && (
              <button type="button" onClick={() => withdraw(r.id)} className="inline-flex items-center gap-1.5 text-xs text-red-300 hover:text-red-200">
                <Trash2 size={13} /> {t("erp.overtime.withdraw")}
              </button>
            )}
          </RequestRow>
        ))}
        {data.requests.length === 0 && <p className="py-8 text-center text-white/40">{t("erp.overtime.none")}</p>}
      </div>
    </div>
  );
}

function Queue({ data, onChanged }) {
  const { t } = useLanguage();
  return (
    <div className="space-y-2">
      {data.requests.map((r) => (
        <RequestRow key={r.id} r={r} showUser>
          {r.canDecide && <Decide r={r} onDone={onChanged} />}
        </RequestRow>
      ))}
      {data.requests.length === 0 && <p className="py-8 text-center text-white/40">{t("erp.overtime.noneQueue")}</p>}
    </div>
  );
}

// Approve (the hours asked, or fewer) or reject.
function Decide({ r, onDone }) {
  const { t } = useLanguage();
  const [hours, setHours] = useState(String(r.hours));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function decide(decision) {
    setBusy(decision);
    setError("");
    try {
      await api(`/api/overtime/${r.id}`, { method: "PATCH", body: { decision, hours: decision === "approve" ? Number(hours) : undefined, note } });
      onDone();
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="space-y-2 border-t border-white/10 pt-3">
      <div className="grid gap-2 sm:grid-cols-[140px_1fr]">
        <Input type="number" min="0.5" max="16" step="0.5" label={t("erp.overtime.approveHours")} value={hours} onChange={setHours} dir="ltr" />
        <Input label={t("erp.overtime.note")} value={note} onChange={setNote} />
      </div>
      <ErrorText>{error}</ErrorText>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => decide("approve")} loading={busy === "approve"} disabled={Boolean(busy) || !(Number(hours) >= 0.5 && Number(hours) <= 16)}>
          <CheckCircle2 size={15} /> {t("erp.overtime.approve")}
        </Button>
        <Button variant="danger" onClick={() => decide("reject")} loading={busy === "reject"} disabled={Boolean(busy)}>
          <XCircle size={15} /> {t("erp.overtime.reject")}
        </Button>
      </div>
    </div>
  );
}

function History({ data, month, onMonth }) {
  const { t } = useLanguage();
  const total = (data.totals || []).reduce((a, x) => a + x.approvedHours, 0);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {month && <MonthPicker month={month} onChange={onMonth} />}
        <span className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-100">
          {t("erp.overtime.monthTotal")}: <span className="font-bold" dir="ltr">{t("erp.overtime.totalHours", { h: Math.round(total * 100) / 100 })}</span>
        </span>
      </div>

      {data.totals?.length > 0 && (
        <Card>
          <p className="mb-3 font-semibold">{t("erp.overtime.totalsTitle")}</p>
          <div className="space-y-2">
            {data.totals.map((row) => (
              <div key={row.user.id} className="flex items-center gap-3 text-sm">
                <Avatar name={row.user.name} src={row.user.avatarUrl} size={28} />
                <span className="flex min-w-0 flex-1 items-center gap-1.5">
                  <span className="truncate">{row.user.name}</span>
                  <TraineeBadge id={row.user.id} />
                </span>
                <span className="text-xs text-white/45">{t("erp.overtime.counts", { a: row.approved, r: row.rejected })}</span>
                <span className="w-16 text-end font-semibold text-emerald-200" dir="ltr">
                  {t("erp.overtime.totalHours", { h: row.approvedHours })}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="space-y-2">
        {data.requests.map((r) => (
          <RequestRow key={r.id} r={r} showUser />
        ))}
        {data.requests.length === 0 && <p className="py-8 text-center text-white/40">{t("erp.overtime.none")}</p>}
      </div>
    </div>
  );
}
