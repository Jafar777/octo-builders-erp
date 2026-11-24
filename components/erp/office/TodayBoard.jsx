"use client";

import { AlertTriangle, BellRing, CalendarClock, CheckCheck, Hourglass, MessageCircleWarning, PhoneCall, PhoneForwarded, Sparkles, UserPlus, UserRoundCog } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { api } from "@/lib/clientApi";
import { formatClock, formatDate, formatRelative } from "@/lib/formatTime";
import { whatsappLink } from "@/lib/office";
import { ItemRow, RowButton, Section, WaitingAge } from "@/components/erp/office/officeUi";

// The office's day (GET /api/office/today), the client's list: due today, overdue, calls
// to return, waiting on departments, meetings, new inquiries, staff requests, complaints,
// interviews, and what she closed today. Each card acts in place.
export default function TodayBoard({ board, onOpen, onChanged, onOpenMeeting }) {
  const { t, lang } = useLanguage();

  const closeItem = (item) => api(`/api/office/items/${item.id}`, { method: "PATCH", body: { action: "status", to: "done" } }).then(onChanged);
  const chase = (item) => api(`/api/office/items/${item.id}`, { method: "PATCH", body: { action: "chase" } }).then(onChanged);
  const called = (x) => api(`/api/office/interactions/${x.id}`, { method: "PATCH", body: { callbackDone: true } }).then(onChanged);
  const doneButton = (item) => <RowButton icon={CheckCheck} label={t("erp.office.act.close")} onClick={() => closeItem(item)} tone="hover:text-emerald-300" />;

  // The numbers across the top: what needs her now.
  const tiles = [
    { key: "dueToday", n: board.dueToday.length, tone: "text-sky-300" },
    { key: "overdue", n: board.overdue.length, tone: "text-red-300" },
    { key: "callbacks", n: board.callbacks.length, tone: "text-amber-300" },
    { key: "waiting", n: board.waiting.length, tone: "text-violet-300" },
    { key: "meetingsToday", n: board.meetings.filter((m) => new Date(m.start).toDateString() === new Date().toDateString()).length, tone: "text-emerald-300" },
    { key: "closedToday", n: board.closedToday.length, tone: "text-white" },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {tiles.map((x) => (
          <div key={x.key} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
            <p className={`text-2xl font-bold ${x.tone}`}>{x.n}</p>
            <p className="text-xs text-white/55">{t(`erp.office.board.${x.key}`)}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title={t("erp.office.board.overdue")} count={board.overdue.length} icon={AlertTriangle} tone="text-red-300" empty={t("erp.office.board.noneOverdue")}>
          {board.overdue.map((i) => (
            <ItemRow key={i.id} item={i} onOpen={onOpen} actions={doneButton(i)} />
          ))}
        </Section>

        <Section title={t("erp.office.board.dueToday")} count={board.dueToday.length} icon={CalendarClock} tone="text-sky-300" empty={t("erp.office.board.noneDue")}>
          {board.dueToday.map((i) => (
            <ItemRow key={i.id} item={i} onOpen={onOpen} actions={doneButton(i)} />
          ))}
        </Section>

        <Section title={t("erp.office.board.callbacks")} count={board.callbacks.length} icon={PhoneForwarded} tone="text-amber-300" empty={t("erp.office.board.noneCallbacks")}>
          {board.callbacks.map((x) => {
            const phone = x.contactPhone;
            const wa = whatsappLink(phone);
            return (
              <div key={x.id} data-entity={`interaction:${x.id}`} className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-white">{x.summary}</p>
                  <p className="mt-0.5 text-[11px] text-white/50">
                    {[x.client?.name || x.contactName, phone, formatRelative(x.at, lang)].filter(Boolean).join(" · ")}
                  </p>
                </div>
                {phone && (
                  <a href={`tel:${phone}`} title={t("erp.office.call")} className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/70 hover:text-white">
                    <PhoneCall size={15} />
                  </a>
                )}
                {wa && (
                  <a href={wa} target="_blank" rel="noreferrer" title="WhatsApp" className="flex h-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 px-2 text-[11px] text-emerald-300 hover:text-emerald-200">
                    WA
                  </a>
                )}
                <RowButton icon={CheckCheck} label={t("erp.office.calledBack")} onClick={() => called(x)} tone="hover:text-emerald-300" />
              </div>
            );
          })}
        </Section>

        <Section title={t("erp.office.board.waiting")} count={board.waiting.length} icon={Hourglass} tone="text-violet-300" empty={t("erp.office.board.noneWaiting")}>
          {board.waiting.map((i) => (
            <ItemRow key={i.id} item={i} onOpen={onOpen} actions={<RowButton icon={BellRing} label={t("erp.office.act.chase")} onClick={() => chase(i)} tone="hover:text-amber-300" />} />
          ))}
        </Section>

        <Section title={t("erp.office.board.meetings")} count={board.meetings.length} icon={CalendarClock} tone="text-emerald-300" empty={t("erp.office.board.noneMeetings")}>
          {board.meetings.map((m) => (
            <button
              key={m.id}
              type="button"
              data-entity={`meeting:${m.id}`}
              onClick={() => onOpenMeeting?.(m)}
              className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5 text-start hover:border-white/20"
            >
              <div className="w-20 shrink-0 text-center">
                <p className="text-sm font-semibold text-white">{formatClock(m.start, lang)}</p>
                <p className="text-[11px] text-white/45">{formatDate(m.start, lang)}</p>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-white">{m.title}</p>
                <p className="truncate text-[11px] text-white/50">{[t(`erp.office.meetingKind.${m.kind}`), m.place, m.client?.name, m.participants.map((p) => p.name).join("، ")].filter(Boolean).join(" · ")}</p>
              </div>
            </button>
          ))}
        </Section>

        <Section title={t("erp.office.board.inquiries")} count={board.inquiries.length} icon={Sparkles} tone="text-brand-orange" empty={t("erp.office.board.noneInquiries")}>
          {board.inquiries.map((l) => (
            <a key={l.id} href={`/dashboard/finance?tab=sales&lead=${l.id}`} data-entity={`lead:${l.id}`} className="block rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5 hover:border-white/20">
              <p className="truncate text-sm text-white">
                {l.name}
                {l.company && <span className="text-white/50"> · {l.company}</span>}
              </p>
              <p className="mt-0.5 truncate text-[11px] text-white/50">{[l.need, l.phone, t(`erp.sales.sources.${l.source}`), formatRelative(l.createdAt, lang)].filter(Boolean).join(" · ")}</p>
            </a>
          ))}
        </Section>

        <Section title={t("erp.office.board.adminRequests")} count={board.adminRequests.length} icon={UserRoundCog} tone="text-sky-300" empty={t("erp.office.board.noneAdmin")}>
          {board.adminRequests.map((i) => (
            <ItemRow key={i.id} item={i} onOpen={onOpen} showTarget={false} actions={doneButton(i)} />
          ))}
        </Section>

        <Section title={t("erp.office.board.complaints")} count={board.complaints.length} icon={MessageCircleWarning} tone="text-red-300" empty={t("erp.office.board.noneComplaints")}>
          {board.complaints.map((i) => (
            <ItemRow key={i.id} item={i} onOpen={onOpen} />
          ))}
        </Section>

        {board.interviews.length > 0 && (
          <Section title={t("erp.office.board.interviews")} count={board.interviews.length} icon={UserPlus} tone="text-sky-300">
            {board.interviews.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5 text-sm text-white">
                <span>{c.name}</span>
                {c.phone && (
                  <a href={`tel:${c.phone}`} dir="ltr" className="text-xs text-white/60 hover:text-white">
                    {c.phone}
                  </a>
                )}
              </div>
            ))}
          </Section>
        )}

        <Section title={t("erp.office.board.closedToday")} count={board.closedToday.length} icon={CheckCheck} tone="text-emerald-300" empty={t("erp.office.board.noneClosed")}>
          {board.closedToday.map((i) => (
            <ItemRow key={i.id} item={i} onOpen={onOpen} />
          ))}
        </Section>
      </div>
      {board.waiting.some((i) => i.waitingHours >= 24) && (
        <p className="flex items-center gap-2 text-xs text-white/50">
          <WaitingAge hours={24} /> {t("erp.office.board.waitingHint")}
        </p>
      )}
    </div>
  );
}
