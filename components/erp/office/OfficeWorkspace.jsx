"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLanguage } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";
import { api, errorText, peekApi } from "@/lib/clientApi";
import { ErrorText, PageHeader } from "@/components/erp/ui/fields";
import { PageSkeleton } from "@/components/erp/ui/Loading";
import QuickCapture from "@/components/erp/office/QuickCapture";
import TodayBoard from "@/components/erp/office/TodayBoard";
import ItemsView from "@/components/erp/office/ItemsView";
import ClientsView from "@/components/erp/office/ClientsView";
import MeetingsView from "@/components/erp/office/MeetingsView";
import CorrespondenceView from "@/components/erp/office/CorrespondenceView";
import CallsView from "@/components/erp/office/CallsView";
import ItemDrawer from "@/components/erp/office/ItemDrawer";
import HiringAssist from "@/components/erp/office/HiringAssist";
import { useLookup } from "@/components/erp/office/officeUi";

const ALL_TABS = ["today", "items", "clients", "calls", "meetings", "correspondence", "hiring"];

// The executive office (/dashboard/office): the secretary's day in one place. The quick
// capture sits on top of every tab; ?tab= and ?item= open a tab / an item (links from
// notifications land on the right thing).
export default function OfficeWorkspace() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  // Hiring only for those who help with it (or run it).
  const hires = ["recruitment.assist", "recruitment.manage"].some((p) => user?.permissions?.includes(p));
  const TABS = ALL_TABS.filter((k) => k !== "hiring" || hires);
  const [tab, setTab] = useState(TABS.includes(searchParams.get("tab")) ? searchParams.get("tab") : "today");
  const [board, setBoard] = useState(() => peekApi("/api/office/today") || null);
  const [error, setError] = useState("");
  const [openItem, setOpenItem] = useState(searchParams.get("item"));
  const [meetingId, setMeetingId] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const { lookup, reload: reloadLookup } = useLookup();

  const loadBoard = useCallback(() => {
    api("/api/office/today")
      .then(setBoard)
      .catch((err) => setError(errorText(t, err)));
  }, [t]);
  useEffect(() => {
    loadBoard();
  }, [loadBoard]);
  // Something changed anywhere: the board and the open list reload.
  const changed = useCallback(() => {
    loadBoard();
    setRefreshKey((k) => k + 1);
  }, [loadBoard]);

  function choose(next) {
    setTab(next);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", next);
    params.delete("item");
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  const counts = board && { today: board.overdue.length + board.dueToday.length + board.callbacks.length, items: null, clients: null, calls: board.callbacks.length || null, meetings: board.meetings.length || null, correspondence: null };

  return (
    <div className="space-y-5">
      <PageHeader title={t("erp.nav.office")} subtitle={t("erp.office.subtitle")} />
      <QuickCapture
        lookup={lookup}
        autoFocus
        onSaved={(r) => {
          changed();
          if (r.kind === "lead") reloadLookup();
        }}
      />
      <div className="flex gap-1 overflow-x-auto border-b border-white/10">
        {TABS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => choose(key)}
            className={`relative whitespace-nowrap px-4 py-3 text-sm font-medium ${tab === key ? "text-white" : "text-white/55 hover:text-white"}`}
          >
            {t(`erp.office.tab.${key}`)}
            {counts?.[key] ? <span className="ms-1.5 rounded-full bg-brand-orange/20 px-1.5 text-[11px] text-brand-orange">{counts[key]}</span> : null}
            {tab === key && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand-orange" />}
          </button>
        ))}
      </div>
      <ErrorText>{error}</ErrorText>
      {tab === "today" && (board ? <TodayBoard board={board} onOpen={(i) => setOpenItem(i.id)} onChanged={changed} onOpenMeeting={(m) => { setMeetingId(m.id); choose("meetings"); }} /> : !error && <PageSkeleton tiles={6} />)}
      {tab === "items" && <ItemsView lookup={lookup} onOpen={(i) => setOpenItem(i.id)} refreshKey={refreshKey} />}
      {tab === "clients" && <ClientsView onOpenItem={(i) => setOpenItem(i.id)} refreshKey={refreshKey} onClientsChanged={reloadLookup} />}
      {tab === "calls" && <CallsView refreshKey={refreshKey} />}
      {tab === "meetings" && <MeetingsView lookup={lookup} refreshKey={refreshKey} openMeetingId={meetingId} onOpenItem={(i) => setOpenItem(i.id)} />}
      {tab === "correspondence" && <CorrespondenceView lookup={lookup} refreshKey={refreshKey} />}
      {tab === "hiring" && hires && <HiringAssist />}
      <ItemDrawer itemId={openItem} lookup={lookup} onClose={() => setOpenItem(null)} onChanged={changed} />
    </div>
  );
}
