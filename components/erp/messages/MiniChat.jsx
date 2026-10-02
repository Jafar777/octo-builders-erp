"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Maximize2, Megaphone, MessagesSquare, Users, X } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { useOnlineUsers, useRealtimeEvent, userChannelName } from "@/context/RealtimeContext";
import { api } from "@/lib/clientApi";
import { formatRelative } from "@/lib/formatTime";
import Avatar from "@/components/erp/ui/Avatar";
import ChatPane from "@/components/erp/messages/ChatPane";
import { useConversationLabel, useDirectory } from "@/components/erp/messages/useDirectory";
import { SkeletonList } from "@/components/erp/ui/Loading";

// Floating chat on every dashboard page except Messages itself: quick replies
// without leaving the current screen.
function MiniChatPanel({ meId, canAnnounce, onClose }) {
  const { t, lang } = useLanguage();
  const directory = useDirectory();
  const labelOf = useConversationLabel(directory, meId);
  const online = useOnlineUsers();
  const [conversations, setConversations] = useState(null);
  const [activeId, setActiveId] = useState(null);

  const load = useCallback(() => {
    api("/api/messages/conversations")
      .then((d) => setConversations(d.conversations))
      .catch(() => setConversations([]));
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  useRealtimeEvent(userChannelName(meId), "conversation:updated", load);

  const active = conversations?.find((c) => c.id === activeId);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 16, scale: 0.97 }}
      transition={{ duration: 0.18 }}
      className="fixed bottom-24 end-4 z-40 flex h-[min(560px,calc(100vh-8rem))] w-[min(380px,calc(100vw-2rem))] flex-col overflow-hidden rounded-3xl border border-white/10 bg-brand-navy shadow-2xl"
    >
      {active ? (
        <ChatPane
          key={active.id}
          compact
          conversation={active}
          meId={meId}
          directory={directory}
          label={labelOf(active)}
          online={online}
          canAnnounce={canAnnounce}
          onBack={() => setActiveId(null)}
          onRead={(id) => setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, unread: 0 } : c)))}
          onChanged={load}
        />
      ) : (
        <>
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 px-4">
            <p className="font-semibold">{t("erp.nav.messages")}</p>
            <span className="flex items-center gap-1">
              <Link href="/dashboard/messages" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full text-white/60 hover:bg-white/10 hover:text-white" aria-label={t("erp.messages.openFull")}>
                <Maximize2 size={15} />
              </Link>
              <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full text-white/60 hover:bg-white/10 hover:text-white" aria-label={t("common.close")}>
                <X size={16} />
              </button>
            </span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {conversations === null && <SkeletonList rows={6} className="p-3" />}
            {conversations?.length === 0 && <p className="p-6 text-center text-sm text-white/40">{t("erp.messages.empty")}</p>}
            {conversations?.map((c) => {
              const label = labelOf(c);
              const group = c.type === "announcement" ? Megaphone : c.type === "direct" ? null : Users;
              return (
                <button key={c.id} type="button" onClick={() => setActiveId(c.id)} className="flex w-full items-center gap-3 px-3 py-2.5 text-start hover:bg-white/[0.05]">
                  {group ? (
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-orange/15 text-brand-orange">
                      {group === Megaphone ? <Megaphone size={17} /> : <Users size={17} />}
                    </span>
                  ) : (
                    <Avatar name={label.name} src={label.avatarUrl} size={40} online={online.size ? online.has(label.otherId) : undefined} />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="flex justify-between gap-2">
                      <span className="truncate text-sm font-medium">{label.name}</span>
                      {c.lastMessage && <span className="shrink-0 text-[10px] text-white/35">{formatRelative(c.lastMessage.at, lang)}</span>}
                    </span>
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs text-white/45">
                        <bdi>{c.lastMessage?.text || t("erp.messages.noMessages")}</bdi>
                      </span>
                      {c.unread > 0 && (
                        <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-brand-orange px-1.5 text-[10px] font-bold text-white">{c.unread}</span>
                      )}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </motion.div>
  );
}

export default function MiniChat({ meId, canAnnounce, unread }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  return (
    <>
      <AnimatePresence>{open && <MiniChatPanel meId={meId} canAnnounce={canAnnounce} onClose={() => setOpen(false)} />}</AnimatePresence>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-5 end-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-brand-orange text-white shadow-lg shadow-brand-orange/30 transition-transform hover:scale-105"
        aria-label={t("erp.nav.messages")}
      >
        {open ? <X size={22} /> : <MessagesSquare size={22} />}
        {!open && unread > 0 && (
          <span className="absolute -top-1 -end-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1 text-[10px] font-bold text-brand-orange">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
    </>
  );
}
