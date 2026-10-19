"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Bell } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";
import { usePollingFallback, useRealtimeEvent, userChannelName } from "@/context/RealtimeContext";
import { formatRelative } from "@/lib/formatTime";

const PANEL_WIDTH = 352;

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
  const [pos, setPos] = useState(null);
  const [mounted, setMounted] = useState(false);
  const soundOn = useRef(true);
  const ref = useRef(null);
  const panelRef = useRef(null);

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

  // Portals only after hydration (the server has no <body> to render into).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

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

  // The panel and the toast are rendered into <body>: a header with a blur
  // (backdrop-filter) or a clipped burger menu would otherwise trap or cut them.
  // The panel sits under the bell; on phones it spans the screen.
  const place = useCallback(() => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const vw = window.innerWidth;
    const top = Math.round(r.bottom + 10);
    const maxHeight = `calc(100dvh - ${top + 16}px)`;
    if (vw < 640) {
      setPos({ top, left: 12, right: 12, maxHeight });
      return;
    }
    // Line the panel's end edge up with the bell, kept inside the screen.
    const rtl = getComputedStyle(ref.current).direction === "rtl";
    if (rtl) setPos({ top, left: Math.max(12, Math.min(r.left, vw - PANEL_WIDTH - 12)), width: PANEL_WIDTH, maxHeight });
    else setPos({ top, right: Math.max(12, Math.min(vw - r.right, vw - PANEL_WIDTH - 12)), width: PANEL_WIDTH, maxHeight });
  }, []);

  useLayoutEffect(() => {
    if (!open) return undefined;
    place();
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, place]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current?.contains(e.target) || panelRef.current?.contains(e.target)) return;
      setOpen(false);
    }
    // pointerdown covers touch screens as well as the mouse.
    document.addEventListener("pointerdown", handleClickOutside);
    return () => document.removeEventListener("pointerdown", handleClickOutside);
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

  const panel = (
    <AnimatePresence>
      {open && pos && (
        <motion.div
          ref={panelRef}
          initial={{ opacity: 0, y: -8, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.97 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          style={{ top: pos.top, left: pos.left, right: pos.right, width: pos.width, maxHeight: pos.maxHeight }}
          className="fixed z-[90] flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-brand-navy-light/95 text-white shadow-2xl backdrop-blur-xl"
          dir={lang === "ar" ? "rtl" : "ltr"}
        >
          <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-3">
            <span className="text-sm font-semibold text-white">{t("notifications.title")}</span>
            {unreadCount > 0 && (
              <button type="button" onClick={() => markRead()} className="text-xs text-brand-orange hover:underline">
                {t("notifications.markAllRead")}
              </button>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain sm:max-h-96">
            {notifications.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-white/50">{t("notifications.empty")}</p>
            ) : (
              notifications.map((n) => (
                <button
                  type="button"
                  key={n.id}
                  onClick={() => openNotification(n)}
                  className={`block w-full border-b border-white/5 px-4 py-3.5 text-start text-sm leading-relaxed text-white/80 last:border-none hover:bg-white/5 ${
                    !n.read ? "bg-white/[0.06]" : ""
                  }`}
                >
                  <span className="flex items-start gap-2">
                    {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-orange" />}
                    <span className="min-w-0 break-words">
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
              className="block shrink-0 border-t border-white/10 px-4 py-3 text-center text-xs text-white/60 hover:bg-white/5 hover:text-white"
            >
              {t("notifications.viewAll")}
            </Link>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );

  // Phones: top of the screen, clear of the chat button. Larger screens: bottom corner.
  const toastView = (
    <AnimatePresence>
      {toast && (
        <motion.button
          type="button"
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -16 }}
          onClick={() => openNotification(toast)}
          dir={lang === "ar" ? "rtl" : "ltr"}
          className="fixed inset-x-3 top-[calc(env(safe-area-inset-top)+0.75rem)] z-[95] flex items-start gap-3 rounded-2xl border border-white/10 bg-brand-navy-light px-4 py-3 text-start text-sm text-white shadow-2xl sm:inset-x-auto sm:bottom-5 sm:end-5 sm:top-auto sm:max-w-sm"
        >
          <Bell size={18} className="mt-0.5 shrink-0 text-brand-orange" />
          <span className="min-w-0 break-words">{toast.message?.[lang] || toast.message?.en}</span>
        </motion.button>
      )}
    </AnimatePresence>
  );

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
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

      {mounted && createPortal(panel, document.body)}
      {mounted && createPortal(toastView, document.body)}
    </div>
  );
}
