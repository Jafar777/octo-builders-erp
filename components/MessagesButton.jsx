"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Megaphone, MessagesSquare, Users } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";
import { usePollingFallback, useRealtimeEvent, userChannelName } from "@/context/RealtimeContext";
import { api } from "@/lib/clientApi";
import { formatRelative } from "@/lib/formatTime";
import Avatar from "@/components/erp/ui/Avatar";
import { useConversationLabel, useDirectory } from "@/components/erp/messages/useDirectory";

// Two quick "pop" bubbles with a rising pitch sweep (Web Audio, no sound file) —
// deliberately unlike the notification chime in NotificationBell.
function playMessageSound() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [
      [380, 760, 0, 0.16],
      [520, 1040, 0.11, 0.11],
    ].forEach(([from, to, at, peak]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = ctx.currentTime + at;
      osc.type = "triangle";
      osc.frequency.setValueAtTime(from, start);
      osc.frequency.exponentialRampToValueAtTime(to, start + 0.07);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(peak, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.12);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.14);
    });
    setTimeout(() => ctx.close(), 600);
  } catch {}
}

// The chat is already on screen: no need to announce its messages.
function isViewing(conversationId) {
  return (
    document.visibilityState === "visible" &&
    window.location.pathname.startsWith("/dashboard/messages") &&
    new URLSearchParams(window.location.search).get("c") === conversationId
  );
}

function ConversationList({ conversations, meId, onPick }) {
  const { t, lang } = useLanguage();
  const directory = useDirectory();
  const labelOf = useConversationLabel(directory, meId);

  if (conversations === null) return <p className="px-4 py-6 text-center text-sm text-white/50">{t("common.loading")}</p>;
  if (conversations.length === 0) return <p className="px-4 py-6 text-center text-sm text-white/50">{t("erp.messages.empty")}</p>;

  return conversations.slice(0, 20).map((c) => {
    const label = labelOf(c);
    const sender = c.lastMessage?.senderId === meId ? `${t("erp.messages.you")}: ` : "";
    return (
      <button
        type="button"
        key={c.id}
        onClick={() => onPick(c)}
        className={`flex w-full items-center gap-3 border-b border-white/5 px-4 py-3 text-start last:border-none hover:bg-white/5 ${
          c.unread > 0 ? "bg-white/[0.06]" : ""
        }`}
      >
        {c.type === "direct" ? (
          <Avatar name={label.name} src={label.avatarUrl} size={36} />
        ) : (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-orange/15 text-brand-orange">
            {c.type === "announcement" ? <Megaphone size={16} /> : <Users size={16} />}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-medium text-white">{label.name}</span>
            {c.lastMessage && <span className="shrink-0 text-[10px] text-white/40">{formatRelative(c.lastMessage.at, lang)}</span>}
          </span>
          <span className="flex items-center justify-between gap-2">
            <span className={`truncate text-xs ${c.unread > 0 ? "text-white/80" : "text-white/45"}`}>
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
                {c.unread > 99 ? "99+" : c.unread}
              </span>
            )}
          </span>
        </span>
      </button>
    );
  });
}

// Messages button for the site navbar and the dashboard header (staff only): unread
// badge, a live list of conversations, and a sound when a message arrives.
// `linkOnly` is the mobile-menu variant: a plain link with the badge, silent so the
// always-mounted desktop button is the only one that plays the sound.
export default function MessagesButton({ linkOnly = false }) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [conversations, setConversations] = useState(null);
  const soundOn = useRef(true);
  const reloadTimer = useRef(null);
  const ref = useRef(null);
  const meId = user?.isStaff ? user.id : null;

  const load = useCallback(() => {
    if (!meId) return;
    api("/api/messages/conversations")
      .then((d) => setConversations(d.conversations))
      .catch(() => setConversations((prev) => prev || []));
  }, [meId]);

  useEffect(() => {
    load();
    return () => clearTimeout(reloadTimer.current);
  }, [load]);
  usePollingFallback(load, 20000);

  useEffect(() => {
    if (!meId || linkOnly) return undefined;
    fetch("/api/notifications/preferences", { cache: "no-store" })
      .then((res) => res.json())
      .then((d) => {
        soundOn.current = d.preferences?.sound !== false;
      })
      .catch(() => {});
    const onPrefs = (e) => {
      soundOn.current = e.detail?.sound !== false;
    };
    window.addEventListener("octo:notification-prefs", onPrefs);
    return () => window.removeEventListener("octo:notification-prefs", onPrefs);
  }, [meId, linkOnly]);

  useRealtimeEvent(userChannelName(meId), "conversation:updated", (e) => {
    // Show the new message straight away; the reload then brings exact unread counts.
    if (e?.lastMessage) {
      setConversations((prev) => {
        const hit = prev?.find((c) => c.id === e.conversationId);
        if (!hit) return prev;
        return [{ ...hit, lastMessage: e.lastMessage }, ...prev.filter((c) => c !== hit)];
      });
    }
    clearTimeout(reloadTimer.current);
    reloadTimer.current = setTimeout(load, 300);

    if (linkOnly || !soundOn.current || !e?.lastMessage || e.lastMessage.senderId === meId) return;
    if (conversations?.find((c) => c.id === e.conversationId)?.muted) return;
    if (!isViewing(e.conversationId)) playMessageSound();
  });

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!meId) return null;

  const unread = (conversations || []).reduce((sum, c) => sum + (c.unread || 0), 0);
  const buttonClass =
    "relative flex h-10 w-10 items-center justify-center rounded-full text-white/90 transition-colors hover:bg-white/10";
  const icon = (
    <>
      <MessagesSquare size={20} />
      {unread > 0 && (
        <span className="absolute -top-0.5 -end-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-orange px-1 text-[10px] font-bold text-white">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </>
  );

  if (linkOnly) {
    return (
      <Link href="/dashboard/messages" className={buttonClass} aria-label={t("erp.nav.messages")}>
        {icon}
      </Link>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((v) => !v)} className={buttonClass} aria-label={t("erp.nav.messages")}>
        {icon}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="absolute end-0 z-50 mt-3 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-white/10 bg-brand-navy-light/95 shadow-2xl backdrop-blur-xl"
          >
            <div className="border-b border-white/10 px-4 py-3">
              <span className="text-sm font-semibold text-white">{t("erp.nav.messages")}</span>
            </div>
            <div className="max-h-96 overflow-y-auto">
              <ConversationList
                conversations={conversations}
                meId={meId}
                onPick={(c) => {
                  setOpen(false);
                  router.push(`/dashboard/messages?c=${c.id}`);
                }}
              />
            </div>
            <Link
              href="/dashboard/messages"
              onClick={() => setOpen(false)}
              className="block border-t border-white/10 px-4 py-2.5 text-center text-xs text-white/60 hover:bg-white/5 hover:text-white"
            >
              {t("erp.messages.openFull")}
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
