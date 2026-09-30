"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bell } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";

export default function NotificationBell() {
  const { t, lang } = useLanguage();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const ref = useRef(null);

  useEffect(() => {
    let active = true;
    fetch("/api/notifications")
      .then((res) => res.json())
      .then((data) => {
        if (!active) return;
        setNotifications(data.notifications || []);
        setUnreadCount(data.unreadCount || 0);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function handleOpen() {
    const next = !open;
    setOpen(next);
    if (next && unreadCount > 0) {
      setUnreadCount(0);
      await fetch("/api/notifications", { method: "PATCH" }).catch(() => {});
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={handleOpen}
        className="relative flex h-10 w-10 items-center justify-center rounded-full text-white/90 transition-colors hover:bg-white/10"
        aria-label="Notifications"
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 end-1.5 flex h-2 w-2 rounded-full bg-brand-orange" />
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="absolute end-0 mt-3 w-72 overflow-hidden rounded-2xl border border-white/10 bg-brand-navy-light/95 backdrop-blur-xl shadow-2xl"
          >
            <div className="border-b border-white/10 px-4 py-3 text-sm font-semibold text-white">
              {t("notifications.title")}
            </div>
            <div className="max-h-72 overflow-y-auto">
              {notifications.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-white/50">
                  {t("notifications.empty")}
                </p>
              ) : (
                notifications.map((n) => (
                  <div
                    key={n.id}
                    className={`border-b border-white/5 px-4 py-3 text-sm text-white/80 last:border-none ${
                      !n.read ? "bg-white/5" : ""
                    }`}
                  >
                    {n.message?.[lang] || n.message?.en || ""}
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
