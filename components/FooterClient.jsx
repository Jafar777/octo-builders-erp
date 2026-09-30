"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter, usePathname } from "next/navigation";
import { Mail, Phone, MapPin } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { scrollToSection, scrollToTop } from "@/lib/scrollNav";

const SECTION_LINKS = [
  { key: "about", id: "about" },
  { key: "services", id: "services" },
  { key: "projects", id: "projects" },
  { key: "contact", id: "contact" },
];

export default function FooterClient({ contact }) {
  const { t, lang } = useLanguage();
  const router = useRouter();
  const pathname = usePathname();
  const isHome = pathname === "/";

  function handleMainClick(e) {
    e.preventDefault();
    if (isHome) scrollToTop();
    else router.push("/");
  }

  function handleSectionClick(id) {
    return (e) => {
      e.preventDefault();
      if (isHome) scrollToSection(id);
      else router.push(`/#${id}`);
    };
  }

  return (
    <footer className="border-t border-white/10 bg-brand-navy text-white">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-3 lg:px-8">
        <div>
          <Image
            src="/brand/05-wordmark-white.png"
            alt="Octo Builders"
            width={220}
            height={94}
            className="h-14 w-auto"
          />
          <p className="mt-4 max-w-xs text-sm leading-6 text-white/60">{t("footer.tagline")}</p>
          <Link
            href="/auth?tab=signup"
            className="mt-6 inline-block rounded-full bg-brand-orange px-6 py-2.5 text-sm font-semibold text-white transition-transform hover:scale-105"
          >
            {t("footer.signup")}
          </Link>
        </div>

        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-white/50">
            {t("footer.quickLinks")}
          </h3>
          <ul className="mt-4 space-y-3 text-sm">
            <li>
              <Link href="/" onClick={handleMainClick} className="text-white/70 transition-colors hover:text-white">
                {t("nav.main")}
              </Link>
            </li>
            {SECTION_LINKS.map((link) => (
              <li key={link.id}>
                <a
                  href={`/#${link.id}`}
                  onClick={handleSectionClick(link.id)}
                  className="text-white/70 transition-colors hover:text-white"
                >
                  {t(`nav.${link.key}`)}
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-white/50">
            {t("footer.contact")}
          </h3>
          <ul className="mt-4 space-y-3 text-sm text-white/70">
            {contact?.email && (
              <li className="flex items-center gap-2">
                <Mail size={16} className="shrink-0 text-white/40" />
                <a href={`mailto:${contact.email}`} className="hover:text-white">
                  {contact.email}
                </a>
              </li>
            )}
            {contact?.phone && (
              <li className="flex items-center gap-2">
                <Phone size={16} className="shrink-0 text-white/40" />
                <a href={`tel:${contact.phone}`} className="hover:text-white">
                  {contact.phone}
                </a>
              </li>
            )}
            {contact?.address?.[lang] && (
              <li className="flex items-center gap-2">
                <MapPin size={16} className="shrink-0 text-white/40" />
                <span>{contact.address[lang]}</span>
              </li>
            )}
          </ul>
        </div>
      </div>

      <div className="border-t border-white/10 px-4 py-6 text-center text-xs text-white/40">
        &copy; {new Date().getFullYear()} Octo Builders. {t("footer.rights")}.
      </div>
    </footer>
  );
}
