"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { Menu, X } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";
import { scrollToSection, scrollToTop } from "@/lib/scrollNav";
import LanguageSwitch from "@/components/LanguageSwitch";
import NotificationBell from "@/components/NotificationBell";
import MessagesButton from "@/components/MessagesButton";

const SECTION_LINKS = [
  { key: "about", id: "about" },
  { key: "services", id: "services" },
  { key: "projects", id: "projects" },
  { key: "contact", id: "contact" },
];

export default function Navbar() {
  const { t } = useLanguage();
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const isHome = pathname === "/";

  const [scrolledPastThreshold, setScrolledPastThreshold] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const scrolled = !isHome || scrolledPastThreshold;

  useEffect(() => {
    if (!isHome) return;
    function onScroll() {
      setScrolledPastThreshold(window.scrollY > 60);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [isHome]);

  useEffect(() => {
    // Close the mobile menu on route change (e.g. after a section link navigates away).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  const transparent = isHome && !scrolled;

  function handleMainClick(e) {
    e.preventDefault();
    if (isHome) scrollToTop();
    else router.push("/");
    setMobileOpen(false);
  }

  function handleSectionClick(id) {
    return (e) => {
      e.preventDefault();
      if (isHome) scrollToSection(id);
      else router.push(`/#${id}`);
      setMobileOpen(false);
    };
  }

  return (
    <motion.header
      initial={false}
      animate={{
        backgroundColor: transparent ? "rgba(15,35,49,0)" : "rgba(15,35,49,0.75)",
        boxShadow: transparent ? "0 0 0 rgba(0,0,0,0)" : "0 8px 30px rgba(0,0,0,0.35)",
        backdropFilter: transparent ? "blur(0px)" : "blur(16px)",
      }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="fixed inset-x-0 top-0 z-50 border-b border-white/0 data-[scrolled=true]:border-white/10"
      data-scrolled={!transparent}
      style={{ borderBottomColor: transparent ? "rgba(255,255,255,0)" : "rgba(255,255,255,0.08)" }}
    >
      <nav className="mx-auto flex h-20 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          onClick={handleMainClick}
          className="flex items-center gap-2.5 text-white"
        >
          <Image src="/brand/00-Icon.png" alt="" width={36} height={36} className="h-9 w-9" priority />
          <span className="text-lg font-semibold tracking-tight">Octo Builders</span>
        </Link>

        <div className="hidden items-center gap-1 lg:flex">
          <Link
            href="/"
            onClick={handleMainClick}
            className="rounded-full px-4 py-2 text-sm font-medium text-white/90 transition-colors hover:bg-white/10 hover:text-white"
          >
            {t("nav.main")}
          </Link>
          {SECTION_LINKS.map((link) => (
            <a
              key={link.id}
              href={`/#${link.id}`}
              onClick={handleSectionClick(link.id)}
              className="rounded-full px-4 py-2 text-sm font-medium text-white/90 transition-colors hover:bg-white/10 hover:text-white"
            >
              {t(`nav.${link.key}`)}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-1 lg:gap-3">
          <div className="hidden items-center gap-3 lg:flex">
            <LanguageSwitch groupId="lang-pill-desktop" />
            {!loading && user && <MessagesButton />}
          </div>
          {/* One bell for every screen size: always in the bar, also on phones with the menu open. */}
          {!loading && user && <NotificationBell />}
          {!loading && user && (
            <Link
              href="/dashboard"
              className="hidden h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-white/20 bg-white/10 text-sm font-semibold text-white lg:flex"
              aria-label={t("nav.dashboard")}
            >
              {user.avatarUrl ? (
                <Image src={user.avatarUrl} alt={user.name || user.email} width={40} height={40} className="h-full w-full object-cover" />
              ) : (
                (user.name || user.email || "?").charAt(0).toUpperCase()
              )}
            </Link>
          )}
          {!loading && !user && (
            <Link
              href="/auth"
              className="hidden rounded-full bg-brand-orange px-5 py-2 text-sm font-semibold text-white transition-transform hover:scale-105 lg:block"
            >
              {t("nav.login")}
            </Link>
          )}

          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            className="flex h-10 w-10 items-center justify-center rounded-full text-white lg:hidden"
            aria-label="Menu"
          >
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </nav>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden border-t border-white/10 bg-black/90 backdrop-blur-xl lg:hidden"
          >
            <div className="flex flex-col gap-1 px-4 py-4">
              <Link href="/" onClick={handleMainClick} className="rounded-xl px-4 py-3 text-white/90 hover:bg-white/10">
                {t("nav.main")}
              </Link>
              {SECTION_LINKS.map((link) => (
                <a
                  key={link.id}
                  href={`/#${link.id}`}
                  onClick={handleSectionClick(link.id)}
                  className="rounded-xl px-4 py-3 text-white/90 hover:bg-white/10"
                >
                  {t(`nav.${link.key}`)}
                </a>
              ))}

              <div className="mt-2 flex items-center justify-between border-t border-white/10 px-4 py-3">
                <LanguageSwitch compact groupId="lang-pill-mobile" />
                {!loading && user && <MessagesButton linkOnly />}
              </div>

              {!loading && user && (
                <Link
                  href="/dashboard"
                  className="mx-4 mt-1 rounded-xl bg-white/10 px-4 py-3 text-center font-medium text-white"
                >
                  {t("nav.dashboard")}
                </Link>
              )}
              {!loading && !user && (
                <Link
                  href="/auth"
                  className="mx-4 mt-1 rounded-xl bg-brand-orange px-4 py-3 text-center font-semibold text-white"
                >
                  {t("nav.login")}
                </Link>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
}
