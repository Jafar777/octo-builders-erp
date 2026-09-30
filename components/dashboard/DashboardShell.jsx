"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { LayoutGrid, Globe2, LogOut, ArrowLeft, Menu, X } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";
import LanguageSwitch from "@/components/LanguageSwitch";
import NotificationBell from "@/components/NotificationBell";

export default function DashboardShell({ user, children }) {
  const { t } = useLanguage();
  const { logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const links = [
    { href: "/dashboard", label: t("dashboard.overview"), icon: LayoutGrid, exact: true },
    ...(user.role === "admin"
      ? [{ href: "/dashboard/website", label: t("dashboard.website"), icon: Globe2, exact: false }]
      : []),
  ];

  async function handleLogout() {
    await logout();
    router.push("/");
  }

  const Sidebar = (
    <div className="flex h-full flex-col justify-between p-5">
      <div>
        <Image src="/brand/00-Icon.png" alt="Octo Builders" width={36} height={36} className="mb-6 h-9 w-9" />
        <Link href="/" className="mb-8 flex items-center gap-2 text-sm text-white/60 hover:text-white">
          <ArrowLeft size={16} />
          {t("dashboard.backToSite")}
        </Link>

        <nav className="space-y-1">
          {links.map((link) => {
            const active = link.exact ? pathname === link.href : pathname.startsWith(link.href);
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-colors ${
                  active ? "bg-brand-orange text-white" : "text-white/70 hover:bg-white/10 hover:text-white"
                }`}
              >
                <Icon size={18} />
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="space-y-4 border-t border-white/10 pt-4">
        <div className="flex items-center gap-3 px-2">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/10 text-sm font-semibold text-white">
            {user.avatarUrl ? (
              <Image src={user.avatarUrl} alt={user.name || user.email} width={40} height={40} className="h-full w-full object-cover" />
            ) : (
              (user.name || user.email || "?").charAt(0).toUpperCase()
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-white">{user.name || user.email}</p>
            <p className="truncate text-xs text-white/40">{t(`dashboard.role_${user.role}`)}</p>
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
    <div className="flex min-h-screen bg-brand-navy text-white">
      <aside className="hidden w-72 shrink-0 border-e border-white/10 lg:block">{Sidebar}</aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b border-white/10 px-4 sm:px-6">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/10 lg:hidden"
          >
            <Menu size={20} />
          </button>
          <p className="hidden text-sm text-white/50 lg:block">
            {t("dashboard.welcome")}, {user.name || user.email}
          </p>
          <div className="flex items-center gap-3">
            <LanguageSwitch compact />
            <NotificationBell />
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-10">{children}</main>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
              className="fixed inset-0 z-40 bg-black/60 lg:hidden"
            />
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
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
  );
}
