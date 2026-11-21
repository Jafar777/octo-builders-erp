"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Eye, EyeOff, Search } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { api, errorText } from "@/lib/clientApi";
import Modal from "@/components/erp/ui/Modal";
import Avatar from "@/components/erp/ui/Avatar";

// "View as…" (CEO only): pick a person and see the whole dashboard as they do, acting
// for them. Everything done this way is logged under the CEO (lib/audit.js).
export function ViewAsButton() {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [people, setPeople] = useState(null);
  const [q, setQ] = useState("");
  const [error, setError] = useState("");

  const show = async () => {
    setOpen(true);
    setError("");
    if (!people) {
      try {
        setPeople((await api("/api/view-as")).people);
      } catch (err) {
        setError(errorText(t, err));
      }
    }
  };
  const start = async (id) => {
    try {
      await api("/api/view-as", { method: "POST", body: { userId: id } });
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/dashboard"); // full reload: everything reloads as the new person
    } catch (err) {
      setError(errorText(t, err));
    }
  };
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (people || []).filter((p) => !s || `${p.name} ${p.email} ${p.roleName}`.toLowerCase().includes(s));
  }, [people, q]);

  return (
    <>
      <button
        type="button"
        onClick={show}
        title={t("erp.viewAs.button")}
        className="flex h-10 items-center gap-1.5 rounded-full px-3 text-sm text-white/75 hover:bg-white/10 hover:text-white"
      >
        <Eye size={18} />
        <span className="hidden xl:inline">{t("erp.viewAs.button")}</span>
      </button>
      {/* At page level: the blurred top bar would otherwise trap the window inside it. */}
      {open &&
        createPortal(
          <Modal open={open} onClose={() => setOpen(false)} title={t("erp.viewAs.title")}>
            <p className="mb-3 text-sm text-white/60">{t("erp.viewAs.hint")}</p>
            <label className="mb-3 flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
              <Search size={16} className="text-white/50" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t("erp.viewAs.search")}
                className="w-full bg-transparent text-sm outline-none"
              />
            </label>
            {error && <p className="mb-2 text-sm text-red-400">{error}</p>}
            {!people && !error && <p className="text-sm text-white/50">{t("common.loading")}</p>}
            <div className="max-h-[60vh] space-y-1 overflow-y-auto">
              {list.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => start(p.id)}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-start hover:bg-white/10"
                >
                  <Avatar name={p.name} src={p.avatarUrl} size={34} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{p.name}</span>
                    <span className="block truncate text-xs text-white/50">{p.roleName}</span>
                  </span>
                </button>
              ))}
            </div>
          </Modal>,
          document.body,
        )}
    </>
  );
}

// Shown on every page while the CEO is viewing as someone.
export function ViewAsBanner({ user }) {
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false);
  const stop = async () => {
    setBusy(true);
    await api("/api/view-as", { method: "DELETE" }).catch(() => {});
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/dashboard"); // full reload: everything reloads as the new person
  };
  return (
    <div className="sticky top-0 z-40 flex flex-wrap items-center justify-center gap-3 bg-amber-500 px-4 py-2 text-sm font-medium text-black">
      <Eye size={16} />
      <span>{t("erp.viewAs.banner").replace("{name}", user.name || user.email)}</span>
      <button
        type="button"
        disabled={busy}
        onClick={stop}
        className="flex items-center gap-1.5 rounded-full bg-black px-3 py-1 text-xs font-semibold text-white hover:bg-black/80"
      >
        <EyeOff size={14} /> {t("erp.viewAs.stop")}
      </button>
    </div>
  );
}
