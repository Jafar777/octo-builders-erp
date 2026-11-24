"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { MessageSquarePlus } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import ChangeRequestForm from "@/components/erp/system/ChangeRequestForm";

// The tab open on the page, as shown: tabs are buttons marked data-active (or
// role="tab" aria-selected) inside the page. The bar itself is left out.
function activeTabLabel(root) {
  if (!root) return "";
  const el =
    root.querySelector('[role="tab"][aria-selected="true"]') ||
    [...root.querySelectorAll('button[data-active="true"]')].find((b) => !b.closest("[data-change-bar]") && !b.closest("[role=dialog]"));
  return (el?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80);
}

// The CEO's orange line on top of every page and tab: "Request a change from the
// programmer in <page › tab>" with a button that opens the request form (System →
// Change log, lib/changeLog.js).
// `viewAs`: the person the CEO is viewing the dashboard as ("" = themselves).
export default function ChangeRequestBar({ pageKey, viewAs = "" }) {
  const { t } = useLanguage();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("");

  // Follow the page's tabs as they change.
  useEffect(() => {
    const main = document.querySelector("main");
    if (!main) return undefined;
    let timer = null;
    const update = () => {
      clearTimeout(timer);
      timer = setTimeout(() => setTab(activeTabLabel(main)), 120);
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(main, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-active", "aria-selected"] });
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [pathname]);

  const label = t(`erp.nav.${pageKey || "overview"}`);
  const where = [label, tab].filter(Boolean).join(" › ");
  const query = searchParams.toString();
  const page = { path: `${pathname}${query ? `?${query}` : ""}`, key: pageKey || "overview", label, tab };

  return (
    <>
    <div data-change-bar className="flex flex-wrap items-center justify-center gap-3 bg-brand-orange px-4 py-2 text-sm font-medium text-black">
      <MessageSquarePlus size={16} className="shrink-0" />
      <span className="min-w-0 truncate">
        {t("erp.changes.bar", { page: where })}
        {viewAs && ` — ${t("erp.changes.asSeenBy", { name: viewAs })}`}
      </span>
      <button
        type="button"
        onClick={() => {
          setTab(activeTabLabel(document.querySelector("main")));
          setOpen(true);
        }}
        className="flex shrink-0 items-center gap-1.5 rounded-full bg-black px-3 py-1 text-xs font-semibold text-white hover:bg-black/80"
      >
        {t("erp.changes.barButton")}
      </button>
    </div>
    {/* Outside the strip: the form keeps the dashboard's own colours. */}
    <ChangeRequestForm open={open} onClose={() => setOpen(false)} page={page} viewAs={viewAs} />
    </>
  );
}
