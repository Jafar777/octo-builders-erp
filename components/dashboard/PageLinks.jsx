"use client";

import Link from "next/link";
import { useLanguage } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/erp/ui/fields";
import { navItemVisible } from "@/components/dashboard/DashboardShell";

// Header buttons to the other pages of one sidebar link (TASK_PAGES, PROFILE_PAGES) that
// this person may open, by the sidebar's own rules. Nothing if they may open just one.
export default function PageLinks({ pages, current }) {
  const { t } = useLanguage();
  const { user } = useAuth();
  if (!user) return null;
  const visible = pages.filter((p) => navItemVisible(p, user));
  if (visible.length < 2) return null;
  return visible
    .filter((p) => p.key !== current)
    .map(({ key, href, icon: Icon }) => (
      <Link key={key} href={href}>
        <Button variant="ghost">
          <Icon size={16} /> {t(`erp.nav.${key}`)}
        </Button>
      </Link>
    ));
}
