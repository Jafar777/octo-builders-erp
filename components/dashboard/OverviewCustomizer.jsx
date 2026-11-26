"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { api, errorText } from "@/lib/clientApi";
import Modal from "@/components/erp/ui/Modal";
import { Button, ErrorText } from "@/components/erp/ui/fields";

const MAX_TILES = 8;

// The parts in this person's order: their saved order first (parts they can't see any
// more drop out), then any part that's new to them in its default place; hidden ones out.
export function orderBlocks(blocks, layout, defaults) {
  const keys = [...(layout?.order || []).filter((k) => defaults.includes(k)), ...defaults.filter((k) => !(layout?.order || []).includes(k))];
  const hidden = new Set(layout?.hidden || []);
  return keys.filter((k) => blocks[k] && !hidden.has(k)).map((k) => ({ key: k, ...blocks[k] }));
}

const move = (list, i, by) => {
  const j = i + by;
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
};

// Each person arranges their own Overview (change request CR-4): which parts show and in
// what order, and which headline numbers (from everything their permissions let them
// see) in what order. Saved to their account (app/api/home/layout).
export default function OverviewCustomizer({ blocks, defaultOrder, tiles, layout, readOnly, onClose, onSaved }) {
  const { t } = useLanguage();
  const start = [...(layout.order || []).filter((k) => blocks.includes(k)), ...defaultOrder.filter((k) => blocks.includes(k) && !(layout.order || []).includes(k))];
  const [order, setOrder] = useState(start);
  const [hidden, setHidden] = useState(new Set(layout.hidden || []));
  const tileStart = layout.tiles?.length ? layout.tiles.filter((k) => tiles.all[k]) : tiles.defaults;
  const [chosen, setChosen] = useState(tileStart);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const others = Object.keys(tiles.all).filter((k) => !chosen.includes(k));

  async function save(reset = false) {
    setBusy(true);
    setError("");
    try {
      const body = reset ? { reset: true } : { order, hidden: [...hidden], tiles: chosen };
      const { layout: saved } = await api("/api/home/layout", { method: "PUT", body });
      onSaved(saved);
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setBusy(false);
    }
  }

  const arrows = (i, list, set) => (
    <span className="flex gap-1">
      <button type="button" aria-label={t("erp.home.customize.up")} disabled={i === 0} onClick={() => set(move(list, i, -1))} className="rounded p-1 text-white/60 hover:bg-white/10 disabled:opacity-25">
        <ArrowUp size={14} />
      </button>
      <button type="button" aria-label={t("erp.home.customize.down")} disabled={i === list.length - 1} onClick={() => set(move(list, i, 1))} className="rounded p-1 text-white/60 hover:bg-white/10 disabled:opacity-25">
        <ArrowDown size={14} />
      </button>
    </span>
  );

  return (
    <Modal open onClose={onClose} title={t("erp.home.customize.title")} wide>
      <div className="space-y-6">
        {readOnly && <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-200">{t("erp.home.customize.viewAs")}</p>}
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">{t("erp.home.customize.parts")}</h3>
          <p className="text-xs text-white/55">{t("erp.home.customize.partsHint")}</p>
          <ul className="divide-y divide-white/5 rounded-xl border border-white/10">
            {order.map((k, i) => {
              const off = hidden.has(k);
              return (
                <li key={k} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <button
                    type="button"
                    aria-label={t(off ? "erp.home.customize.show" : "erp.home.customize.hide")}
                    onClick={() => setHidden((h) => {
                      const next = new Set(h);
                      if (off) next.delete(k);
                      else next.add(k);
                      return next;
                    })}
                    className={off ? "text-white/35 hover:text-white" : "text-emerald-300 hover:text-white"}
                  >
                    {off ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                  <span className={`flex-1 ${off ? "text-white/40 line-through" : ""}`}>{t(`erp.home.customize.block.${k}`)}</span>
                  {arrows(i, order, setOrder)}
                </li>
              );
            })}
          </ul>
        </section>

        {Object.keys(tiles.all).length > 0 && (
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">{t("erp.home.customize.numbers")}</h3>
            <p className="text-xs text-white/55">{t("erp.home.customize.numbersHint", { n: MAX_TILES })}</p>
            <ul className="divide-y divide-white/5 rounded-xl border border-white/10">
              {chosen.map((k, i) => (
                <li key={k} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <input type="checkbox" checked onChange={() => setChosen((c) => c.filter((x) => x !== k))} aria-label={t("erp.home.customize.hide")} />
                  <span className="flex-1">{tiles.all[k]?.props?.label}</span>
                  {arrows(i, chosen, setChosen)}
                </li>
              ))}
              {others.map((k) => (
                <li key={k} className="flex items-center gap-3 px-3 py-2 text-sm text-white/55">
                  <input type="checkbox" checked={false} disabled={chosen.length >= MAX_TILES} onChange={() => setChosen((c) => [...c, k])} aria-label={t("erp.home.customize.show")} />
                  <span className="flex-1">{tiles.all[k]?.props?.label}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <ErrorText>{error}</ErrorText>
        <div className="flex flex-wrap justify-between gap-2">
          <Button variant="ghost" onClick={() => save(true)} disabled={busy || readOnly}>
            {t("erp.home.customize.reset")}
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button onClick={() => save(false)} loading={busy} disabled={readOnly}>
              {t("common.save")}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
