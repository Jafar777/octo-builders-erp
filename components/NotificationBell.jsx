"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Bell } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";
import { usePollingFallback, useRealtimeEvent, userChannelName } from "@/context/RealtimeContext";
import { formatRelative } from "@/lib/formatTime";

// Soft two-note chime made with Web Audio (no sound file to load).
function playChime() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [
      [880, 0],
      [1318.5, 0.12],
    ].forEach(([freq, at]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + at);
      gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.45);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + at);
      osc.stop(ctx.currentTime + at + 0.5);
    });
    setTimeout(() => ctx.close(), 1000);
  } catch {}
}

export default function NotificationBell() {
  const { t, lang } = useLanguage();
  const { user } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [toast, setToast] = useState(null);
  const soundOn = useRef(true);
  const ref = useRef(null);

  const load = useCallback(() => {
    fetch("/api/notifications", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        setNotifications(data.notifications || []);
        setUnreadCount(data.unreadCount || 0);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!user) return;
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
  }, [user]);

  usePollingFallback(load, 30000);

  const channel = userChannelName(user?.id);
  useRealtimeEvent(channel, "notification:new", (n) => {
    setNotifications((prev) => [n, ...prev.filter((p) => p.id !== n.id)].slice(0, 20));
    setUnreadCount((c) => c + 1);
    setToast(n);
    if (soundOn.current) playChime();
  });
  useRealtimeEvent(channel, "notification:read", ({ unreadCount: count }) => setUnreadCount(count));

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function markRead(ids) {
    const res = await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ids ? { ids } : {}),
    }).catch(() => null);
    const data = await res?.json().catch(() => null);
    if (data) setUnreadCount(data.unreadCount);
    setNotifications((prev) => prev.map((n) => (!ids || ids.includes(n.id) ? { ...n, read: true } : n)));
  }

  function openNotification(n) {
    if (!n.read) markRead([n.id]);
    setOpen(false);
    setToast(null);
    if (n.link) router.push(n.link);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-10 w-10 items-center justify-center rounded-full text-white/90 transition-colors hover:bg-white/10"
        aria-label={t("notifications.title")}
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -end-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-orange px-1 text-[10px] font-bold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="absolute end-0 z-50 mt-3 w-80 overflow-hidden rounded-2xl border border-white/10 bg-brand-navy-light/95 shadow-2xl backdrop-blur-xl"
          >
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <span className="text-sm font-semibold text-white">{t("notifications.title")}</span>
              {unreadCount > 0 && (
                <button type="button" onClick={() => markRead()} className="text-xs text-brand-orange hover:underline">
                  {t("notifications.markAllRead")}
                </button>
              )}
            </div>
            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-white/50">{t("notifications.empty")}</p>
              ) : (
                notifications.map((n) => (
                  <button
                    type="button"
                    key={n.id}
                    onClick={() => openNotification(n)}
                    className={`block w-full border-b border-white/5 px-4 py-3 text-start text-sm text-white/80 last:border-none hover:bg-white/5 ${
                      !n.read ? "bg-white/[0.06]" : ""
                    }`}
                  >
                    <span className="flex items-start gap-2">
                      {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-orange" />}
                      <span>
                        {n.message?.[lang] || n.message?.en || ""}
                        <span className="mt-1 block text-xs text-white/40">{formatRelative(n.createdAt, lang)}</span>
                      </span>
                    </span>
                  </button>
                ))
              )}
            </div>
            {user?.isStaff && (
              <Link
                href="/dashboard/notifications"
                onClick={() => setOpen(false)}
                className="block border-t border-white/10 px-4 py-2.5 text-center text-xs text-white/60 hover:bg-white/5 hover:text-white"
              >
                {t("notifications.viewAll")}
              </Link>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <motion.button
            type="button"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            onClick={() => openNotification(toast)}
            className="fixed bottom-5 end-5 z-[80] flex max-w-sm items-start gap-3 rounded-2xl border border-white/10 bg-brand-navy-light px-4 py-3 text-start text-sm text-white shadow-2xl"
          >
            <Bell size={18} className="mt-0.5 shrink-0 text-brand-orange" />
            {toast.message?.[lang] || toast.message?.en}
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
