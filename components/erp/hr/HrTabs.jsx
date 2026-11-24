"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useLanguage } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";
import { navItemVisible } from "@/components/dashboard/DashboardShell";
import { HR_PAGES, hrTabsOf } from "@/components/erp/hr/hrPages";

// The tab bar of Human resources: the HR page's own tabs and the pages that belong with
// it (staff, organization, department heads). Each shows by its own permission and the
// CEO's page settings, exactly like the sidebar. Nothing when there's only one.
// `onPick` (the HR page itself): changes its tab without leaving the page.
export default function HrTabs({ current, onPick }) {
  const { t } = useLanguage();
  const { user } = useAuth();
  if (!user) return null;
  const pages = HR_PAGES.filter((p) => navItemVisible(p, user));
  const tabs = pages.flatMap((p) =>
    p.key === "hr"
      ? hrTabsOf(user).map((k) => ({ key: k, label: t(`erp.hr.tab.${k}`), href: `/dashboard/hr?tab=${k}`, own: true }))
      : [{ key: p.key, label: t(`erp.nav.${p.key}`), href: p.href }]
  );
  if (tabs.length < 2) return null;
  const line = <motion.span layoutId="hr-tab" className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand-orange" />;
  const cls = "relative shrink-0 px-4 py-3 text-sm font-medium text-white/60 hover:text-white data-[active=true]:text-white";
  return (
    <div className="relative mb-6 flex flex-wrap gap-1 border-b border-white/10">
      {tabs.map((x) =>
        x.own && onPick ? (
          <button key={x.key} type="button" onClick={() => onPick(x.key)} className={cls} data-active={x.key === current}>
            {x.label}
            {x.key === current && line}
          </button>
        ) : (
          <Link key={x.key} href={x.href} className={cls} data-active={x.key === current}>
            {x.label}
            {x.key === current && line}
          </Link>
        )
      )}
    </div>
  );
}
