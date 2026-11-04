"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutGrid,
  Globe2,
  LogOut,
  ArrowLeft,
  Menu,
  X,
  MessagesSquare,
  Bell,
  Users,
  ShieldCheck,
  Building2,
  Settings,
  History,
  ListChecks,
  ClipboardCheck,
  ClipboardList,
  FolderKanban,
  CalendarClock,
  Gauge,
  BriefcaseBusiness,
  BarChart3,
  Wallet,
  Calculator,
  UserRound,
  Gift,
  UserCheck,
  UsersRound,
  ScrollText,
  GraduationCap,
  Activity,
  FileSpreadsheet,
  Handshake,
  ShoppingCart,
  Star,
  UserPlus,
  Timer,
  ChevronDown,
  Clock3,
  Pin,
} from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";
import { usePollingFallback, useRealtime, useRealtimeEvent, userChannelName } from "@/context/RealtimeContext";
import LanguageSwitch from "@/components/LanguageSwitch";
import NotificationBell from "@/components/NotificationBell";
import MessagesButton from "@/components/MessagesButton";
import Avatar from "@/components/erp/ui/Avatar";
import TopProgress from "@/components/erp/ui/TopProgress";
import MiniChat from "@/components/erp/messages/MiniChat";
import { TraineeProvider } from "@/components/erp/ui/TraineeBadge";
import NoAccess from "@/components/erp/NoAccess";
import { pageForPath, RESTRICTED_PAGES } from "@/lib/permissions";
import SecurityCard from "@/components/erp/security/SecurityCard";
import SearchPalette from "@/components/erp/search/SearchPalette";
import { FeedbackProvider } from "@/components/erp/ui/Feedback";
import { ShortcutsButton, ShortcutsHelp, ThemeButton, useShortcuts, WelcomeGuide } from "@/components/dashboard/ShellExtras";
import { api } from "@/lib/clientApi";

const RECENT_KEY = "erp.recentPages";
const readRecent = () => {
  try {
    return JSON.parse(window.localStorage.getItem(RECENT_KEY) || "[]");
  } catch {
    return [];
  }
};

// Sidebar entries; `perm` hides an entry from roles without that permission,
// `staff` hides it from accounts that have no role yet, and `when(user)` is a custom rule.
// `show(user)` replaces all of them (entries customers see too).
const NAV = [
  {
    group: "main",
    items: [
      { href: "/dashboard", key: "overview", icon: LayoutGrid, exact: true },
      { href: "/dashboard/profile", key: "profile", icon: UserRound },
      { href: "/dashboard/tasks", key: "tasks", icon: ListChecks, staff: true },
      // GM / CEO: every task of a month.
      { href: "/dashboard/task-log", key: "taskLog", icon: ScrollText, when: (u) => u.permissions.includes("projects.manage") && u.scope === "all" },
      { href: "/dashboard/team-tasks", key: "teamTasks", icon: UsersRound, staff: true },
      { href: "/dashboard/projects", key: "projects", icon: FolderKanban, staff: true },
      // New-project intake forms: the secretary and department managers fill them, the GM / CEO price them, the CEO accepts the project.
      {
        href: "/dashboard/intake",
        key: "intake",
        icon: ClipboardList,
        when: (u) =>
          u.permissions.includes("projects.intake") ||
          (u.scope === "all" && u.permissions.includes("projects.manage")) ||
          // Department managers ask for projects here.
          (u.scope === "department" && u.permissions.includes("tasks.review") && u.permissions.includes("projects.manage")),
      },
      // Reviewers, and customers reviewing the tasks marked for them.
      { href: "/dashboard/reviews", key: "reviews", icon: ClipboardCheck, badge: "reviews", show: (u) => (u.isStaff && u.permissions.includes("tasks.review")) || u.isCustomer },
      { href: "/dashboard/attendance", key: "attendance", icon: CalendarClock, staff: true },
      // Every employee asks; department managers and the CEO decide.
      { href: "/dashboard/overtime", key: "overtime", icon: Timer, staff: true },
      { href: "/dashboard/kpi", key: "kpi", icon: Gauge, staff: true },
      { href: "/dashboard/bonus", key: "bonus", icon: Gift, staff: true },
      { href: "/dashboard/messages", key: "messages", icon: MessagesSquare, staff: true, badge: "messages", exact: true },
      { href: "/dashboard/notifications", key: "notifications", icon: Bell, show: (u) => u.isStaff || u.isCustomer },
      // Trainees and the CEO only (lib/training.js canOpenTraining).
      { href: "/dashboard/training", key: "training", icon: GraduationCap, show: (u) => (u.trainee && !u.limited) || (u.isStaff && u.permissions.includes("training.manage")) },
      // Ask to buy (everyone with purchasing.request), approve, and the asset register.
      {
        href: "/dashboard/purchasing",
        key: "purchasing",
        icon: ShoppingCart,
        when: (u) => ["purchasing.request", "purchasing.approve", "assets.manage"].some((p) => u.permissions.includes(p)),
      },
      // Performance reviews: everyone's own, managers their team's, appraisals.manage runs the cycles.
      { href: "/dashboard/appraisals", key: "appraisals", icon: Star, staff: true },
    ],
  },
  {
    group: "management",
    items: [
      { href: "/dashboard/analytics", key: "analytics", icon: BarChart3, perm: "analytics.view" },
      { href: "/dashboard/reports", key: "reports", icon: FileSpreadsheet, perm: "reports.build" },
      { href: "/dashboard/sales", key: "sales", icon: Handshake, perm: "sales.manage" },
      { href: "/dashboard/recruitment", key: "recruitment", icon: UserPlus, perm: "recruitment.manage" },
      // GM / CEO (rate) and department managers (see their own).
      {
        href: "/dashboard/manager-kpi",
        key: "managerKpi",
        icon: UserCheck,
        when: (u) =>
          (u.scope === "all" && u.permissions.includes("kpi.manage")) || (u.scope === "department" && u.permissions.includes("tasks.review")),
      },
      { href: "/dashboard/hr", key: "hr", icon: BriefcaseBusiness, perm: "attendance.view" },
      { href: "/dashboard/finance", key: "finance", icon: Wallet, perm: "finance.view" },
      { href: "/dashboard/pricing", key: "pricing", icon: Calculator, perm: "pricing.use" },
      { href: "/dashboard/staff", key: "staff", icon: Users, perm: "users.view" },
      { href: "/dashboard/roles", key: "roles", icon: ShieldCheck, perm: "roles.manage" },
      // Everyone sees the hierarchy tab; the rest of the page stays with org.manage.
      { href: "/dashboard/organization", key: "organization", icon: Building2, staff: true },
      // Message review is a view of the Messages page (CEO and department managers).
      { href: "/dashboard/audit", key: "audit", icon: History, perm: "audit.view" },
      { href: "/dashboard/settings", key: "settings", icon: Settings, perm: "settings.manage" },
      { href: "/dashboard/website", key: "website", icon: Globe2, perm: "website.manage" },
      { href: "/dashboard/system", key: "system", icon: Activity, perm: "system.health" },
    ],
  },
];

// Pages the CEO took away on the Roles page: the role's page list (user.pages, with the
// person's own hidden pages), and a restricted account (the GM by default) never gets
// more than RESTRICTED_PAGES.
export function pageAllowed(user, key) {
  if (!key) return true;
  if (user.pages && !user.pages.includes(key)) return false;
  return !user.limited || RESTRICTED_PAGES.includes(key);
}

// Is a sidebar entry shown to `user`? (Also the Roles page's "what they see" preview.)
export function navItemVisible(item, user) {
  if (!pageAllowed(user, item.key)) return false;
  if (item.show) return item.show(user);
  return (!item.staff || user.isStaff) && (!item.perm || user.permissions.includes(item.perm)) && (!item.when || (user.isStaff && item.when(user)));
}

// The sidebar keys `user` sees, in order.
export const visibleNavKeys = (user) => NAV.flatMap((g) => g.items.filter((i) => navItemVisible(i, user)).map((i) => i.key));

export default function DashboardShell({ user, traineeIds = [], children }) {
  const trainees = useMemo(() => new Set(traineeIds), [traineeIds]);
  const { t, lang } = useLanguage();
  const { logout, refresh } = useAuth();
  const { connected } = useRealtime();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [pendingReviews, setPendingReviews] = useState(0);
  const canReview = (user.isStaff && user.permissions.includes("tasks.review")) || user.isCustomer;

  const loadUnread = useCallback(() => {
    if (!user.isStaff) return;
    fetch("/api/messages/unread", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => setUnreadMessages(data.unread || 0))
      .catch(() => {});
  }, [user.isStaff]);

  const loadReviews = useCallback(() => {
    if (!canReview) return;
    fetch("/api/reviews?tab=queue", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => setPendingReviews(data.tasks?.length || 0))
      .catch(() => {});
  }, [canReview]);

  useEffect(() => {
    loadUnread();
    loadReviews();
  }, [loadUnread, loadReviews]);
  usePollingFallback(loadUnread, 20000);
  usePollingFallback(loadReviews, 30000);

  const channel = userChannelName(user.id);
  useRealtimeEvent(channel, "conversation:updated", loadUnread);
  useRealtimeEvent(channel, "task:updated", loadReviews);
  // Role or permissions changed by the GM: reload server data and navigation.
  useRealtimeEvent(channel, "user:updated", () => {
    refresh();
    router.refresh();
  });

  const groups = NAV.map((g) => ({ ...g, items: g.items.filter((i) => navItemVisible(i, user)) })).filter((g) => g.items.length > 0);
  const allItems = groups.flatMap((g) => g.items.map((i) => ({ ...i, group: g.group })));
  const isActive = (link) => (link.exact ? pathname === link.href : pathname === link.href || pathname.startsWith(`${link.href}/`));
  // The page on screen: the longest sidebar address that matches.
  const current = allItems.filter(isActive).sort((a, b) => b.href.length - a.href.length)[0] || null;
  const pageKeys = allItems.map((i) => i.key).join(",");
  const pages = useMemo(
    () => allItems.map((i) => ({ key: i.key, href: i.href, icon: i.icon, label: t(`erp.nav.${i.key}`) })),
    // allItems is rebuilt from the access rules each render; the keys say when it changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pageKeys, t]
  );

  // Their own set-up: theme, pinned pages and folded groups are saved on the account
  // (every device); recent pages stay on this device.
  const [theme, setTheme] = useState(user.ui?.theme || "dark");
  const [favorites, setFavorites] = useState(user.ui?.favorites || []);
  const [collapsed, setCollapsed] = useState(user.ui?.collapsed || []);
  const [recent, setRecent] = useState([]);
  const [helpOpen, setHelpOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(Boolean(user.isStaff && !user.ui?.welcomed && !(user.mfaRequired && !user.mfaEnabled)));
  const savePrefs = useCallback((ui) => api("/api/auth/me", { method: "PATCH", body: { ui }, quiet: true }).catch(() => {}), []);

  const changeTheme = (next) => {
    setTheme(next);
    savePrefs({ theme: next });
  };
  const togglePin = (key) => {
    const next = favorites.includes(key) ? favorites.filter((k) => k !== key) : [...favorites, key];
    setFavorites(next);
    savePrefs({ favorites: next });
  };
  const toggleGroup = (group) => {
    const next = collapsed.includes(group) ? collapsed.filter((g) => g !== group) : [...collapsed, group];
    setCollapsed(next);
    savePrefs({ collapsed: next });
  };
  const finishGuide = () => {
    setGuideOpen(false);
    savePrefs({ welcomed: true });
  };

  // Pop-ups shown outside the dashboard frame (the notification panel) follow the theme too.
  useEffect(() => {
    document.documentElement.classList.toggle("erp-light", theme === "light");
    return () => document.documentElement.classList.remove("erp-light");
  }, [theme]);

  const currentKey = current?.key;
  useEffect(() => {
    const list = readRecent().filter((k) => k !== currentKey);
    const next = currentKey ? [currentKey, ...list].slice(0, 6) : list;
    try {
      window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {}
    // Read from the storage of this device after the page changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRecent(next);
  }, [currentKey]);

  const openHelp = () => setHelpOpen(true);
  useShortcuts({ pages, onHelp: openHelp });

  const byKey = Object.fromEntries(allItems.map((i) => [i.key, i]));
  const pinned = favorites.map((k) => byKey[k]).filter(Boolean);
  const recentItems = recent
    .filter((k) => k !== currentKey && !favorites.includes(k))
    .map((k) => byKey[k])
    .filter(Boolean)
    .slice(0, 3);

  async function handleLogout() {
    await logout();
    router.push("/");
  }

  function renderLink(link, place, small = false) {
    const active = isActive(link);
    const Icon = link.icon;
    const badge = link.badge === "messages" ? unreadMessages : link.badge === "reviews" ? pendingReviews : 0;
    const isPinned = favorites.includes(link.key);
    return (
      <div key={`${place}-${link.key}`} className="group relative">
        <Link
          href={link.href}
          onClick={() => setMobileOpen(false)}
          aria-current={active ? "page" : undefined}
          className={`flex items-center gap-3 rounded-xl px-4 ${small ? "py-2" : "py-2.5"} pe-10 text-sm font-medium transition-colors ${
            active ? "bg-brand-orange text-white" : "text-white/75 hover:bg-white/10 hover:text-white"
          }`}
        >
          <Icon size={small ? 16 : 18} />
          <span className="flex-1 truncate">{t(`erp.nav.${link.key}`)}</span>
          {badge > 0 && (
            <span className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold ${active ? "bg-white text-brand-orange" : "bg-brand-orange text-white"}`}>
              {badge > 99 ? "99+" : badge}
            </span>
          )}
        </Link>
        {place !== "recent" && badge === 0 && (
          <button
            type="button"
            onClick={() => togglePin(link.key)}
            aria-label={t(isPinned ? "erp.ux.unpin" : "erp.ux.pin")}
            title={t(isPinned ? "erp.ux.unpin" : "erp.ux.pin")}
            className={`absolute end-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg transition ${
              isPinned && place === "pin" ? "opacity-70" : "opacity-0 focus:opacity-100 group-hover:opacity-70"
            } ${active ? "text-white hover:bg-white/20" : "text-white/70 hover:bg-white/10"}`}
          >
            <Pin size={13} className={isPinned ? "fill-current" : ""} />
          </button>
        )}
      </div>
    );
  }

  const Sidebar = (
    <div className="flex h-full flex-col justify-between p-5">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Image src="/brand/00-Icon.png" alt="Octo Builders" width={36} height={36} className="mb-6 h-9 w-9" />
        <Link href="/" className="mb-6 flex items-center gap-2 text-sm text-white/60 hover:text-white">
          <ArrowLeft size={16} className="rtl:rotate-180" />
          {t("dashboard.backToSite")}
        </Link>

        {pinned.length > 0 && (
          <nav className="mb-5 space-y-1" aria-label={t("erp.ux.pinned")}>
            <p className="flex items-center gap-1.5 px-4 pb-1.5 text-xs font-semibold uppercase tracking-wider text-white/55">
              <Pin size={12} /> {t("erp.ux.pinned")}
            </p>
            {pinned.map((link) => renderLink(link, "pin"))}
          </nav>
        )}
        {recentItems.length > 0 && (
          <nav className="mb-5 space-y-1" aria-label={t("erp.ux.recent")}>
            <p className="flex items-center gap-1.5 px-4 pb-1.5 text-xs font-semibold uppercase tracking-wider text-white/55">
              <Clock3 size={12} /> {t("erp.ux.recent")}
            </p>
            {recentItems.map((link) => renderLink(link, "recent", true))}
          </nav>
        )}

        {groups.map((g) => {
          const folded = collapsed.includes(g.group) && !g.items.some(isActive);
          return (
            <nav key={g.group} className="mb-5 space-y-1" aria-label={t(`erp.nav.group_${g.group}`)}>
              <button
                type="button"
                onClick={() => toggleGroup(g.group)}
                aria-expanded={!folded}
                className="flex w-full items-center justify-between rounded-lg px-4 pb-1.5 pt-1 text-xs font-semibold uppercase tracking-wider text-white/55 hover:text-white"
              >
                {t(`erp.nav.group_${g.group}`)}
                <ChevronDown size={14} className={`transition-transform ${folded ? "-rotate-90 rtl:rotate-90" : ""}`} />
              </button>
              {!folded && g.items.map((link) => renderLink(link, g.group))}
            </nav>
          );
        })}
      </div>

      <div className="space-y-4 border-t border-white/10 pt-4">
        <div className="flex items-center gap-3 px-2">
          <Avatar name={user.name || user.email} src={user.avatarUrl} />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-white">{user.name || user.email}</p>
            <p className="truncate text-xs text-white/60">{user.roleName?.[lang] || user.role}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/10"
        >
          <LogOut size={18} />
          {t("nav.logout")}
        </button>
      </div>
    </div>
  );

  return (
    <FeedbackProvider>
    <div className={`erp-root flex min-h-screen bg-brand-navy text-white ${theme === "light" ? "erp-light" : ""}`}>
      <TopProgress />
      <aside className="sticky top-0 hidden h-screen w-72 shrink-0 border-e border-white/10 lg:block">{Sidebar}</aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-white/10 bg-brand-navy/90 px-4 backdrop-blur sm:px-6">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/10 lg:hidden"
          >
            <Menu size={20} />
          </button>
          {/* Where you are: the section and the page. */}
          <div className="flex min-w-0 flex-1 items-center gap-2 px-2 text-sm lg:px-0">
            {current && current.key !== "overview" ? (
              <>
                <span className="hidden text-white/50 sm:inline">{t(`erp.nav.group_${current.group}`)}</span>
                <span className="hidden text-white/50 sm:inline" aria-hidden>
                  /
                </span>
                <span className="flex min-w-0 items-center gap-2 font-semibold">
                  <current.icon size={16} className="shrink-0 text-brand-orange" />
                  <span className="truncate">{t(`erp.nav.${current.key}`)}</span>
                </span>
              </>
            ) : (
              <span className="hidden truncate text-white/60 sm:inline">
                {t("dashboard.welcome")}, {user.name || user.email}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <span
              title={connected ? t("erp.realtimeOn") : t("erp.realtimeOff")}
              className={`h-2.5 w-2.5 rounded-full ${connected ? "bg-emerald-400" : "bg-white/25"}`}
            />
            {user.isStaff && !user.limited && <SearchPalette pages={pages} />}
            <ThemeButton theme={theme} onChange={changeTheme} />
            <ShortcutsButton onClick={openHelp} />
            <LanguageSwitch compact />
            <MessagesButton />
            <NotificationBell />
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-10">
          {user.mfaRequired && !user.mfaEnabled && !pathname.startsWith("/dashboard/profile") ? (
            <div className="mx-auto max-w-xl">
              <SecurityCard forced />
            </div>
          ) : !pageAllowed(user, pageForPath(pathname)) ? <NoAccess /> : <TraineeProvider ids={trainees}>{children}</TraineeProvider>}
        </main>
      </div>

      {user.isStaff && !pathname.startsWith("/dashboard/messages") && (
        <MiniChat meId={user.id} canAnnounce={user.permissions.includes("messages.announce")} unread={unreadMessages} />
      )}

      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
              // Starts under the header, so the bell and messages stay usable with the menu open.
              className="fixed inset-x-0 bottom-0 top-16 z-40 bg-black/60 lg:hidden"
            />
            <motion.div
              initial={{ x: lang === "ar" ? "100%" : "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: lang === "ar" ? "100%" : "-100%" }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="fixed inset-y-0 start-0 z-50 w-72 bg-brand-navy lg:hidden"
            >
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="absolute end-4 top-4 flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/10"
              >
                <X size={18} />
              </button>
              {Sidebar}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
    <ShortcutsHelp
      open={helpOpen}
      onClose={() => setHelpOpen(false)}
      pages={pages}
      onGuide={() => {
        setHelpOpen(false);
        setGuideOpen(true);
      }}
    />
    <WelcomeGuide open={guideOpen} onDone={finishGuide} user={user} pages={pages} />
    </FeedbackProvider>
  );
}
