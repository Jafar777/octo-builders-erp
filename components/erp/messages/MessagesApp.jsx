"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Megaphone, Plus, Search, Users } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { useOnlineUsers, usePollingFallback, useRealtimeEvent, userChannelName } from "@/context/RealtimeContext";
import { api } from "@/lib/clientApi";
import { formatRelative } from "@/lib/formatTime";
import Avatar from "@/components/erp/ui/Avatar";
import ChatPane from "@/components/erp/messages/ChatPane";
import NewChatModal from "@/components/erp/messages/NewChatModal";
import { useConversationLabel, useDirectory } from "@/components/erp/messages/useDirectory";
import { SkeletonList } from "@/components/erp/ui/Loading";

// `switcher`: the "my chats / review" toggle of the Messages page (reviewers only).
export default function MessagesApp({ meId, canAnnounce, switcher = null }) {
  const { t, lang } = useLanguage();
  const router = useRouter();
  const searchParams = useSearchParams();
  const directory = useDirectory();
  const labelOf = useConversationLabel(directory, meId);
  const online = useOnlineUsers();
  const [conversations, setConversations] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [activeId, setActiveId] = useState(searchParams.get("c"));
  const [focusMessageId, setFocusMessageId] = useState(searchParams.get("m"));
  const [query, setQuery] = useState("");
  const [messageHits, setMessageHits] = useState([]);
  const [newOpen, setNewOpen] = useState(false);
  const reloadTimer = useRef(null);

  const load = useCallback(async () => {
    try {
      const data = await api("/api/messages/conversations");
      setConversations(data.conversations);
    } catch {}
    setLoaded(true);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);
  usePollingFallback(load, 15000);

  // Follow ?c= when it changes from outside (header messages button, notification links).
  const paramId = searchParams.get("c");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActiveId(paramId);
  }, [paramId]);

  // Many events can arrive at once (e.g. a busy channel); reload the list once.
  useRealtimeEvent(userChannelName(meId), "conversation:updated", () => {
    clearTimeout(reloadTimer.current);
    reloadTimer.current = setTimeout(load, 300);
  });
  useEffect(() => () => clearTimeout(reloadTimer.current), []);

  // Message search across all my conversations (debounced).
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMessageHits([]);
      return undefined;
    }
    const timer = setTimeout(() => {
      api(`/api/messages/search?q=${encodeURIComponent(q)}`)
        .then((d) => setMessageHits(d.results))
        .catch(() => setMessageHits([]));
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  function select(id, messageId = null) {
    setActiveId(id);
    setFocusMessageId(messageId);
    router.replace(id ? `/dashboard/messages?c=${id}` : "/dashboard/messages", { scroll: false });
  }

  const active = conversations.find((c) => c.id === activeId) || null;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return conversations.filter((c) => !q || labelOf(c).name.toLowerCase().includes(q));
  }, [conversations, query, labelOf]);

  const markedRead = useCallback((id) => {
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, unread: 0 } : c)));
  }, []);

  function iconFor(c) {
    if (c.type === "announcement") return <Megaphone size={18} />;
    if (c.type === "department" || c.type === "group") return <Users size={18} />;
    return null;
  }

  return (
    <div className="-m-4 flex h-[calc(100vh-4rem)] sm:-m-6 lg:-m-10">
      {/* Conversation list — hidden on mobile while a chat is open */}
      <aside
        className={`flex w-full shrink-0 flex-col border-e border-white/10 md:w-80 ${active ? "hidden md:flex" : "flex"}`}
      >
        {switcher}
        <div className="flex items-center gap-2 border-b border-white/10 p-3">
          <div className="relative flex-1">
            <Search size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-white/40" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("erp.search")}
              className="w-full rounded-xl border border-white/10 bg-white/5 py-2 pe-3 ps-9 text-sm outline-none focus:border-white/30"
            />
          </div>
          <button
            type="button"
            onClick={() => setNewOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-orange text-white"
            aria-label={t("erp.messages.newChat")}
          >
            <Plus size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {visible.map((c) => {
            const label = labelOf(c);
            const icon = iconFor(c);
            const sender = c.lastMessage?.senderId === meId ? `${t("erp.messages.you")}: ` : "";
            return (
              <button
                type="button"
                key={c.id}
                onClick={() => select(c.id)}
                className={`flex w-full items-center gap-3 px-3 py-3 text-start transition-colors ${
                  c.id === activeId ? "bg-white/10" : "hover:bg-white/[0.05]"
                }`}
              >
                {icon ? (
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-orange/15 text-brand-orange">
                    {icon}
                  </span>
                ) : (
                  <Avatar
                    name={label.name}
                    src={label.avatarUrl}
                    size={44}
                    online={online.size ? online.has(label.otherId) : undefined}
                  />
                )}
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{label.name}</span>
                    {c.lastMessage && (
                      <span className="shrink-0 text-[11px] text-white/35">{formatRelative(c.lastMessage.at, lang)}</span>
                    )}
                  </span>
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs text-white/45">
                      {c.lastMessage ? (
                        <>
                          {sender}
                          <bdi>{c.lastMessage.text}</bdi>
                        </>
                      ) : (
                        t("erp.messages.noMessages")
                      )}
                    </span>
                    {c.unread > 0 && (
                      <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-brand-orange px-1.5 text-[10px] font-bold text-white">
                        {c.unread}
                      </span>
                    )}
                  </span>
                </span>
              </button>
            );
          })}
          {!loaded && <SkeletonList rows={7} className="p-3" />}
          {loaded && visible.length === 0 && messageHits.length === 0 && <p className="p-6 text-center text-sm text-white/40">{t("erp.messages.empty")}</p>}
          {messageHits.length > 0 && (
            <div className="border-t border-white/10">
              <p className="px-3 pb-1 pt-3 text-[11px] uppercase tracking-wider text-white/40">{t("erp.messages.messageResults")}</p>
              {messageHits.map((m) => {
                const c = conversations.find((x) => x.id === m.conversationId);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => select(m.conversationId, m.id)}
                    className="block w-full px-3 py-2.5 text-start hover:bg-white/[0.05]"
                  >
                    <span className="flex justify-between gap-2 text-[11px] text-white/45">
                      <span className="truncate">{c ? labelOf(c).name : "…"}</span>
                      <span className="shrink-0">{formatRelative(m.createdAt, lang)}</span>
                    </span>
                    <span className="line-clamp-2 text-sm text-white/85" dir="auto">
                      {directory.byId[m.senderId]?.name ? `${directory.byId[m.senderId].name}: ` : ""}
                      {m.text || m.attachments[0]?.name}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </aside>

      {/* Chat */}
      <section className={`min-w-0 flex-1 ${active ? "flex" : "hidden md:flex"}`}>
        {active ? (
          <ChatPane
            key={`${active.id}:${focusMessageId || ""}`}
            conversation={active}
            focusMessageId={focusMessageId}
            meId={meId}
            directory={directory}
            label={labelOf(active)}
            online={online}
            canAnnounce={canAnnounce}
            onBack={() => select(null)}
            onRead={markedRead}
            onChanged={load}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-white/40">
            {t("erp.messages.pick")}
          </div>
        )}
      </section>

      <NewChatModal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        meId={meId}
        people={directory.people}
        onCreated={(conversation) => {
          setNewOpen(false);
          setConversations((prev) => (prev.some((c) => c.id === conversation.id) ? prev : [conversation, ...prev]));
          select(conversation.id);
        }}
      />
    </div>
  );
}
