"use client";

import { matches, SearchBox } from "@/components/erp/ui/ListControls";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, SlidersHorizontal } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";
import { useRealtimeEvent, userChannelName } from "@/context/RealtimeContext";
import { api, peekApi } from "@/lib/clientApi";
import { formatDateTime } from "@/lib/formatTime";
import { Button, PageHeader } from "@/components/erp/ui/fields";
import { SkeletonList } from "@/components/erp/ui/Loading";
import NotificationPreferences from "@/components/erp/notifications/NotificationPreferences";
import { EmptyState } from "@/components/erp/ui/DataTools";

export default function NotificationsCenter() {
  const { t, lang } = useLanguage();
  const { user } = useAuth();
  const router = useRouter();
  // The list seen before shows at once while the fresh one loads.
  const [items, setItems] = useState(() => peekApi("/api/notifications?")?.notifications || []);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [hasMore, setHasMore] = useState(() => Boolean(peekApi("/api/notifications?")?.hasMore));
  const [loading, setLoading] = useState(() => !peekApi("/api/notifications?"));
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [q, setQ] = useState("");

  const load = useCallback(
    async (before) => {
      setLoading(true);
      const params = new URLSearchParams();
      if (unreadOnly) params.set("unread", "1");
      if (before) params.set("before", before);
      try {
        const data = await api(`/api/notifications?${params}`);
        setItems((prev) => (before ? [...prev, ...data.notifications] : data.notifications));
        setHasMore(data.hasMore);
      } catch {}
      setLoading(false);
    },
    [unreadOnly]
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  useRealtimeEvent(userChannelName(user?.id), "notification:new", (n) => setItems((prev) => [n, ...prev]));

  // Shown as read straight away; the server is told in the background.
  async function markRead(ids) {
    setItems((prev) =>
      unreadOnly && !ids ? [] : prev.map((n) => (!ids || ids.includes(n.id) ? { ...n, read: true } : n))
    );
    await api("/api/notifications", { method: "PATCH", body: ids ? { ids } : {} }).catch(() => {});
  }

  function open(n) {
    if (!n.read) markRead([n.id]);
    if (n.link) router.push(n.link);
  }

  return (
    <div className="max-w-3xl">
      <PageHeader
        title={t("notifications.title")}
        actions={
          <>
            <Button variant="ghost" onClick={() => setPrefsOpen((v) => !v)}>
              <SlidersHorizontal size={16} />
              {t("erp.notifPrefs.title")}
            </Button>
            <Button variant="ghost" onClick={() => setUnreadOnly((v) => !v)}>
              {unreadOnly ? t("notifications.showAll") : t("notifications.unreadOnly")}
            </Button>
            <Button variant="ghost" onClick={() => markRead()}>
              <CheckCheck size={16} />
              {t("notifications.markAllRead")}
            </Button>
          </>
        }
      />

      {prefsOpen && (
        <div className="mb-6">
          <NotificationPreferences />
        </div>
      )}

      <SearchBox value={q} onChange={setQ} className="mb-4 w-64" />
      {loading && items.length === 0 && <SkeletonList rows={6} avatar={false} />}
      <div className="space-y-2">
        {items.filter((n) => matches(q, n.message?.ar, n.message?.en)).map((n) => (
          <button
            type="button"
            key={n.id}
            onClick={() => open(n)}
            className={`flex w-full items-start gap-3 rounded-2xl border px-4 py-3 text-start transition-colors hover:bg-white/[0.06] ${
              n.read ? "border-white/5 bg-white/[0.02]" : "border-brand-orange/30 bg-brand-orange/[0.06]"
            }`}
          >
            <Bell size={18} className={`mt-0.5 shrink-0 ${n.read ? "text-white/50" : "text-brand-orange"}`} />
            <span className="min-w-0 flex-1">
              <span className="block text-sm text-white/90">{n.message?.[lang] || n.message?.en}</span>
              <span className="mt-1 block text-xs text-white/60">{formatDateTime(n.createdAt, lang)}</span>
            </span>
          </button>
        ))}
        {!loading && items.length === 0 && <EmptyState compact text={t("notifications.empty")} />}
      </div>

      <div className="mt-5 flex justify-center">
        {hasMore && (
          <Button variant="ghost" loading={loading} onClick={() => load(items[items.length - 1]?.createdAt)}>
            {t("erp.loadMore")}
          </Button>
        )}
      </div>
    </div>
  );
}
