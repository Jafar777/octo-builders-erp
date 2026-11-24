"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Building2, Check, Copy, Dices, Eye, Moon, RotateCcw, Sun, User } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { Button, Card, ErrorText, Label, PageHeader } from "@/components/erp/ui/fields";
import { useToast } from "@/components/erp/ui/Feedback";
import { errorText } from "@/lib/clientApi";
import { ARABIC_FONTS, BACKGROUNDS, bgColorsFor, bgColorsOf, cleanAppearance, DEFAULT_APPEARANCE, LATIN_FONTS, paletteOf, PRESETS } from "@/lib/appearance";
import AnimatedBackground from "@/components/erp/appearance/AnimatedBackground";
import { pageColor, useAppearance } from "@/components/erp/appearance/AppearanceContext";

const TABS = ["themes", "colors", "text", "shapes", "background", "effects", "advanced"];

// Ready colour pairs for the main / second colour.
const PALETTES = [
  ["#f37b20", "#ef9957"],
  ["#ff3d6e", "#ff8fab"],
  ["#ff7eb6", "#ffc2dc"],
  ["#a855f7", "#f0abfc"],
  ["#7c3aed", "#38bdf8"],
  ["#2563eb", "#60a5fa"],
  ["#06b6d4", "#67e8f9"],
  ["#10b981", "#6ee7b7"],
  ["#00ff66", "#00c853"],
  ["#84cc16", "#facc15"],
  ["#eab308", "#fde047"],
  ["#ef4444", "#f97316"],
  ["#14b8a6", "#a78bfa"],
  ["#64748b", "#cbd5e1"],
];

const fontVar = (list, key) => `var(${(list.find((f) => f.key === key) || list[0]).cssVar})`;

// The Appearance page: everyone edits their own look; the CEO also edits the company
// default (lib/appearance.js). Every change is a live draft across the whole dashboard
// (AppearanceContext) until it's saved or dropped.
export default function AppearanceStudio({ canManageDefault }) {
  const { t } = useLanguage();
  const toast = useToast();
  const { saved, mine, company, draft, setDraft, save, actingAs } = useAppearance();
  const [scope, setScope] = useState("me");
  const [tab, setTab] = useState("themes");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // What's being edited: my look, or the company default.
  const base = useMemo(() => (scope === "me" ? saved : cleanAppearance(company || DEFAULT_APPEARANCE)), [scope, saved, company]);
  const value = draft || base;
  const dirty = Boolean(draft) && JSON.stringify(draft) !== JSON.stringify(base);

  // A draft never outlives the page.
  useEffect(() => () => setDraft(null), [setDraft]);

  const edit = (patch) => setDraft(cleanAppearance({ ...value, preset: "custom", ...patch }));
  const editIn = (group, patch) => edit({ [group]: { ...value[group], ...patch } });

  async function persist(next) {
    setBusy(true);
    setError("");
    try {
      await save(scope, next);
      toast({ text: t("erp.look.saved") });
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setBusy(false);
    }
  }

  function switchScope(next) {
    setDraft(null);
    setScope(next);
  }

  function surprise() {
    const p = PRESETS[Math.floor(Math.random() * PRESETS.length)];
    const b = BACKGROUNDS[1 + Math.floor(Math.random() * (BACKGROUNDS.length - 1))];
    setDraft(cleanAppearance({ ...p, mode: value.mode, preset: "custom", background: { ...p.background, kind: b.key, colors: { dark: b.colors, light: bgColorsFor("light", b.colors) } } }));
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("erp.nav.appearance")}
        subtitle={t("erp.look.subtitle")}
        actions={
          canManageDefault && (
            <div className="flex rounded-full border border-white/10 p-1">
              {[
                ["me", User],
                ["company", Building2],
              ].map(([key, Icon]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => switchScope(key)}
                  data-active={scope === key}
                  className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-white/60 data-[active=true]:bg-brand-orange data-[active=true]:text-white"
                >
                  <Icon size={14} /> {t(`erp.look.scope.${key}`)}
                </button>
              ))}
            </div>
          )
        }
      />

      {actingAs && <p className="rounded-xl bg-amber-500/10 px-4 py-2 text-sm text-amber-200">{t("erp.look.viewingAs")}</p>}
      {scope === "company" && <p className="rounded-xl bg-sky-500/10 px-4 py-2 text-sm text-sky-200">{t("erp.look.companyHint")}</p>}

      {/* Where they stand, and saving. */}
      <div className="sticky top-16 z-20 flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-brand-navy/90 px-4 py-3 backdrop-blur">
        <span className="flex items-center gap-2 text-sm">
          <span className="h-3 w-3 rounded-full" style={{ background: paletteOf(value).accent || "var(--color-brand-orange)" }} />
          <span className="font-medium">{t(`erp.look.preset.${value.preset}`) === `erp.look.preset.${value.preset}` ? t("erp.look.preset.custom") : t(`erp.look.preset.${value.preset}`)}</span>
          {scope === "me" && <span className="text-xs text-white/50">· {t(mine ? "erp.look.ownLook" : "erp.look.followingDefault")}</span>}
        </span>
        {dirty && <span className="text-xs text-amber-300">{t("erp.look.unsaved")}</span>}
        <div className="ms-auto flex flex-wrap gap-2">
          {scope === "me" && mine && !dirty && (
            <Button variant="ghost" onClick={() => persist(null)} loading={busy}>
              <RotateCcw size={14} /> {t("erp.look.resetToDefault")}
            </Button>
          )}
          {scope === "company" && company && !dirty && (
            <Button variant="ghost" onClick={() => persist(null)} loading={busy}>
              <RotateCcw size={14} /> {t("erp.look.resetCompany")}
            </Button>
          )}
          <Button variant="ghost" onClick={surprise}>
            <Dices size={14} /> {t("erp.look.surprise")}
          </Button>
          {dirty && (
            <>
              <Button variant="ghost" onClick={() => setDraft(null)}>
                {t("erp.look.discard")}
              </Button>
              <Button onClick={() => persist(value)} loading={busy}>
                <Check size={14} /> {t(scope === "company" ? "erp.look.saveCompany" : "erp.look.save")}
              </Button>
            </>
          )}
        </div>
      </div>
      <ErrorText>{error}</ErrorText>

      <div className="flex gap-1 overflow-x-auto border-b border-white/10">
        {TABS.map((key) => (
          <button key={key} type="button" onClick={() => setTab(key)} className="relative shrink-0 px-4 py-3 text-sm font-medium text-white/60 data-[active=true]:text-white" data-active={tab === key}>
            {t(`erp.look.tab.${key}`)}
            {tab === key && <motion.span layoutId="look-tab" className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand-orange" />}
          </button>
        ))}
      </div>

      {/* A theme keeps the mode on screen: every theme has a dark and a light palette. */}
      {tab === "themes" && <Themes value={value} onPick={(p) => setDraft(cleanAppearance({ ...p, mode: value.mode }))} />}
      {tab === "colors" && <Colors value={value} edit={edit} />}
      {tab === "text" && <TextTab value={value} editIn={editIn} />}
      {tab === "shapes" && <Shapes value={value} editIn={editIn} />}
      {tab === "background" && <Background value={value} edit={edit} editIn={editIn} />}
      {tab === "effects" && <Effects value={value} editIn={editIn} />}
      {tab === "advanced" && <Advanced value={value} onImport={(a) => setDraft(cleanAppearance(a))} />}
    </div>
  );
}

// ---------- pieces ----------

function Slider({ label, hint, value, min, max, step = 1, unit = "", onChange, ends }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <Label>{label}</Label>
        <span className="text-xs tabular-nums text-white/60" dir="ltr">
          {value}
          {unit}
        </span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[var(--color-brand-orange)]" />
      {ends && (
        <div className="flex justify-between text-[11px] text-white/45">
          <span>{ends[0]}</span>
          <span>{ends[1]}</span>
        </div>
      )}
      {hint && <p className="mt-1 text-xs text-white/50">{hint}</p>}
    </div>
  );
}

function ColorField({ label, value, onChange, auto = false, fallback = "#000000" }) {
  const { t } = useLanguage();
  const [text, setText] = useState(value);
  const [shown, setShown] = useState(value);
  if (value !== shown) {
    setShown(value);
    setText(value);
  }
  return (
    <div>
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <input type="color" value={value || fallback} onChange={(e) => onChange(e.target.value)} className="h-10 w-12 cursor-pointer rounded-lg border border-white/10 bg-transparent p-0.5" />
        <input
          value={text || (auto ? t("erp.look.color.auto") : "")}
          onChange={(e) => {
            setText(e.target.value);
            if (/^#[0-9a-f]{6}$/i.test(e.target.value)) onChange(e.target.value);
          }}
          onFocus={() => !value && setText("")}
          dir="ltr"
          className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 font-mono text-sm outline-none focus:border-white/30"
        />
        {auto && value && (
          <button type="button" title={t("erp.look.color.autoHint")} onClick={() => onChange("")} className="rounded-lg border border-white/10 px-2 py-2 text-xs text-white/60 hover:bg-white/10">
            {t("erp.look.color.auto")}
          </button>
        )}
      </div>
    </div>
  );
}

// A theme card: its colours, background icon and name; its background moves on hover.
// `mode`: the mode on screen; the card shows the theme in it.
function ThemeCard({ preset: base, mode, active, onPick }) {
  const { t } = useLanguage();
  const [hover, setHover] = useState(false);
  const preset = { ...base, mode };
  const pal = paletteOf(preset);
  const bgCols = bgColorsOf(preset);
  const bgKind = BACKGROUNDS.find((b) => b.key === preset.background.kind);
  const page = pageColor(preset);
  const ink = pal.text || (mode === "light" ? "#13283a" : "#ffffff");
  const accent = pal.accent || (mode === "light" ? "#dd6a14" : "#f37b20");
  const surface = pal.surface || (mode === "light" ? "#ffffff" : "#141414");
  return (
    <button
      type="button"
      onClick={onPick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={`group relative overflow-hidden rounded-2xl border text-start transition ${active ? "border-brand-orange ring-2 ring-brand-orange/50" : "border-white/10 hover:border-white/30"}`}
    >
      <div className="relative h-28 overflow-hidden" style={{ background: page }}>
        {hover && preset.background.kind !== "none" && <AnimatedBackground settings={{ ...preset.background, colors: bgCols, density: Math.max(30, preset.background.density) }} bg={page} fps={40} className="absolute inset-0 h-full w-full" />}
        {!hover && (
          <div className="absolute inset-0 opacity-60" style={{ background: `radial-gradient(circle at 25% 30%, ${bgCols[0]}55, transparent 45%), radial-gradient(circle at 75% 70%, ${bgCols[1]}55, transparent 45%)` }} />
        )}
        {/* A tiny dashboard: a sidebar, a card and a button in the theme's colours. */}
        <div className="absolute inset-3 flex gap-2">
          <div className="w-6 rounded-md" style={{ background: surface, opacity: 0.9 }} />
          <div className="flex flex-1 flex-col gap-1.5 rounded-md p-2" style={{ background: `${surface}cc` }}>
            <div className="h-1.5 w-2/3 rounded-full" style={{ background: ink, opacity: 0.8 }} />
            <div className="h-1.5 w-1/2 rounded-full" style={{ background: ink, opacity: 0.4 }} />
            <div className="mt-auto flex gap-1">
              <div className="h-3 w-10 rounded-full" style={{ background: accent }} />
              <div className="h-3 w-6 rounded-full" style={{ background: pal.accent2 || accent, opacity: 0.6 }} />
            </div>
          </div>
        </div>
        <span className="absolute end-2 top-2 text-lg drop-shadow">{bgKind?.icon}</span>
      </div>
      <div className="flex items-center justify-between gap-2 bg-white/[0.03] px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium" style={{ fontFamily: fontVar(ARABIC_FONTS, preset.font.arabic) }}>
            {t(`erp.look.preset.${preset.preset}`)}
          </p>
          <p className="truncate text-[11px] text-white/50">
            {t(`erp.look.bgName.${preset.background.kind}`)} · {t(`erp.look.mode.${preset.mode}`)}
          </p>
        </div>
        {active && <Check size={16} className="shrink-0 text-brand-orange" />}
      </div>
    </button>
  );
}

function Themes({ value, onPick }) {
  const { t } = useLanguage();
  return (
    <div className="space-y-4">
      <p className="text-sm text-white/60">{t("erp.look.themesHint")}</p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {PRESETS.map((p) => (
          <ThemeCard key={p.preset} preset={p} mode={value.mode} active={value.preset === p.preset} onPick={() => onPick(p)} />
        ))}
      </div>
    </div>
  );
}

function Sample() {
  const { t } = useLanguage();
  return (
    <Card>
      <p className="mb-1 font-semibold">{t("erp.look.sampleTitle")}</p>
      <p className="mb-3 text-sm text-white/60">{t("erp.look.sampleText")}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button>{t("erp.look.sampleButton")}</Button>
        <Button variant="ghost">{t("erp.look.sampleGhost")}</Button>
        <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs text-emerald-300">✓ 12</span>
        <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs text-amber-300">⏳ 3</span>
        <span className="rounded-full bg-red-500/15 px-2.5 py-0.5 text-xs text-red-300">! 1</span>
      </div>
      <input placeholder={t("erp.look.sampleInput")} className="mt-3 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm outline-none focus:border-white/30" />
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
        <div className="h-full w-2/3 rounded-full bg-brand-orange" />
      </div>
    </Card>
  );
}

// The palette of the mode on screen; switching the mode shows (and edits) the other one.
function Colors({ value, edit }) {
  const { t } = useLanguage();
  const c = paletteOf(value);
  const editPalette = (patch) => edit({ colors: { ...value.colors, [value.mode]: { ...c, ...patch } } });
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <Card className="space-y-5">
        <div>
          <Label>{t("erp.look.mode.label")}</Label>
          <div className="flex gap-2">
            {[
              ["dark", Moon],
              ["light", Sun],
            ].map(([m, Icon]) => (
              <button
                key={m}
                type="button"
                onClick={() => edit({ mode: m })}
                data-active={value.mode === m}
                className="flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm text-white/60 data-[active=true]:border-brand-orange data-[active=true]:text-white"
              >
                <Icon size={15} /> {t(`erp.look.mode.${m}`)}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-white/50">{t(`erp.look.editingMode.${value.mode}`)}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <ColorField label={t("erp.look.color.accent")} value={c.accent} auto fallback="#f37b20" onChange={(v) => editPalette({ accent: v })} />
          <ColorField label={t("erp.look.color.accent2")} value={c.accent2} auto fallback="#ef9957" onChange={(v) => editPalette({ accent2: v })} />
          <ColorField label={t("erp.look.color.background")} value={c.background} auto fallback={value.mode === "light" ? "#f4f2ee" : "#000000"} onChange={(v) => editPalette({ background: v })} />
          <ColorField label={t("erp.look.color.surface")} value={c.surface} auto fallback={value.mode === "light" ? "#ffffff" : "#141414"} onChange={(v) => editPalette({ surface: v })} />
          <ColorField label={t("erp.look.color.text")} value={c.text} auto fallback={value.mode === "light" ? "#13283a" : "#ffffff"} onChange={(v) => editPalette({ text: v })} />
        </div>
        <div>
          <Label>{t("erp.look.palettes")}</Label>
          <div className="flex flex-wrap gap-2">
            {PALETTES.map(([a, b]) => (
              <button key={a} type="button" onClick={() => editPalette({ accent: a, accent2: b })} className="flex h-9 w-14 overflow-hidden rounded-xl border border-white/10 hover:scale-105" title={`${a} ${b}`}>
                <span className="flex-1" style={{ background: a }} />
                <span className="flex-1" style={{ background: b }} />
              </button>
            ))}
          </div>
        </div>
      </Card>
      <Sample />
    </div>
  );
}

function FontGrid({ list, current, onPick }) {
  const { t } = useLanguage();
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {list.map((f) => (
        <button
          key={f.key}
          type="button"
          onClick={() => onPick(f.key)}
          data-active={current === f.key}
          className="rounded-xl border border-white/10 px-3 py-2.5 text-start hover:border-white/30 data-[active=true]:border-brand-orange data-[active=true]:bg-brand-orange/10"
          style={{ fontFamily: `var(${f.cssVar})` }}
        >
          <p className="text-sm font-semibold">{f.label}</p>
          <p className="truncate text-xs text-white/60">{t("erp.look.font.sample")}</p>
        </button>
      ))}
    </div>
  );
}

function TextTab({ value, editIn }) {
  const { t } = useLanguage();
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="space-y-6">
        <Card className="space-y-3">
          <Label>{t("erp.look.font.arabic")}</Label>
          <FontGrid list={ARABIC_FONTS} current={value.font.arabic} onPick={(k) => editIn("font", { arabic: k })} />
        </Card>
        <Card className="space-y-3">
          <Label>{t("erp.look.font.latin")}</Label>
          <FontGrid list={LATIN_FONTS} current={value.font.latin} onPick={(k) => editIn("font", { latin: k })} />
        </Card>
        <Card>
          <Slider label={t("erp.look.font.size")} value={value.font.size} min={85} max={125} unit="%" onChange={(v) => editIn("font", { size: v })} ends={["A", "A+"]} />
        </Card>
      </div>
      <Sample />
    </div>
  );
}

function Shapes({ value, editIn }) {
  const { t } = useLanguage();
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <Card className="space-y-6">
        <Slider label={t("erp.look.shape.radius")} value={value.shape.radius} min={0} max={220} step={5} unit="%" onChange={(v) => editIn("shape", { radius: v })} ends={[t("erp.look.shape.square"), t("erp.look.shape.round")]} />
        <Slider label={t("erp.look.shape.spacing")} value={value.shape.spacing} min={80} max={125} unit="%" onChange={(v) => editIn("shape", { spacing: v })} ends={[t("erp.look.shape.compact"), t("erp.look.shape.roomy")]} />
      </Card>
      <Sample />
    </div>
  );
}

function Background({ value, edit, editIn }) {
  const { t } = useLanguage();
  const b = value.background;
  const cols = bgColorsOf(value);
  // Colours for the mode on screen only; a new background gets its own in both modes.
  const setCols = (next) => edit({ background: { ...b, colors: { ...b.colors, [value.mode]: next } } });
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
      <div className="space-y-6">
        <Card className="space-y-3">
          <Label>{t("erp.look.bg.kind")}</Label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {BACKGROUNDS.map((k) => (
              <button
                key={k.key}
                type="button"
                onClick={() => editIn("background", { kind: k.key, colors: { dark: k.colors, light: bgColorsFor("light", k.colors) } })}
                data-active={b.kind === k.key}
                className="flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2.5 text-start text-sm hover:border-white/30 data-[active=true]:border-brand-orange data-[active=true]:bg-brand-orange/10"
              >
                <span className="text-lg">{k.icon}</span>
                <span className="min-w-0 truncate">{t(`erp.look.bgName.${k.key}`)}</span>
              </button>
            ))}
          </div>
        </Card>
        {b.kind !== "none" && (
          <Card className="space-y-5">
            <p className="text-xs text-white/50">{t(`erp.look.editingMode.${value.mode}`)}</p>
            <div className="grid gap-4 sm:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <ColorField
                  key={i}
                  label={t("erp.look.bg.color", { n: i + 1 })}
                  value={cols[i]}
                  onChange={(v) => setCols(cols.map((c, j) => (j === i ? v : c)))}
                />
              ))}
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <Slider label={t("erp.look.bg.density")} value={b.density} min={0} max={100} onChange={(v) => editIn("background", { density: v })} />
              <Slider label={t("erp.look.bg.speed")} value={b.speed} min={0} max={100} onChange={(v) => editIn("background", { speed: v })} />
              <Slider label={t("erp.look.bg.size")} value={b.size} min={0} max={100} onChange={(v) => editIn("background", { size: v })} />
              <Slider label={t("erp.look.bg.opacity")} value={b.opacity} min={5} max={100} onChange={(v) => editIn("background", { opacity: v })} />
            </div>
          </Card>
        )}
      </div>
      <div className="space-y-3">
        <p className="flex items-center gap-1.5 text-sm font-medium text-white/70">
          <Eye size={14} /> {t("erp.look.bg.preview")}
        </p>
        <div className="relative aspect-video overflow-hidden rounded-2xl border border-white/10" style={{ background: pageColor(value) }}>
          <AnimatedBackground settings={{ ...b, colors: cols }} bg={pageColor(value)} still={!value.effects.motion} className="absolute inset-0 h-full w-full" />
        </div>
      </div>
    </div>
  );
}

function Effects({ value, editIn }) {
  const { t } = useLanguage();
  const e = value.effects;
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <Card className="space-y-6">
        <label className="flex cursor-pointer items-start gap-3">
          <input type="checkbox" checked={e.motion} onChange={(ev) => editIn("effects", { motion: ev.target.checked })} className="mt-1 h-4 w-4 accent-[var(--color-brand-orange)]" />
          <span>
            <span className="block text-sm font-medium">{t("erp.look.effects.motion")}</span>
            <span className="block text-xs text-white/50">{t("erp.look.effects.motionHint")}</span>
          </span>
        </label>
        <Slider label={t("erp.look.effects.glass")} hint={t("erp.look.effects.glassHint")} value={e.glass} min={0} max={30} unit="px" onChange={(v) => editIn("effects", { glass: v })} />
        <Slider label={t("erp.look.effects.panels")} hint={t("erp.look.effects.panelsHint")} value={e.panels} min={0} max={100} unit="%" onChange={(v) => editIn("effects", { panels: v })} />
      </Card>
      <Sample />
    </div>
  );
}

function Advanced({ value, onImport }) {
  const { t } = useLanguage();
  const toast = useToast();
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const json = JSON.stringify(value, null, 2);
  const area = "w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 font-mono text-xs outline-none focus:border-white/30";
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="space-y-3">
        <p className="font-semibold">{t("erp.look.advanced.export")}</p>
        <p className="text-xs text-white/55">{t("erp.look.advanced.exportHint")}</p>
        <textarea readOnly rows={14} value={json} className={area} dir="ltr" />
        <Button
          variant="ghost"
          onClick={() => navigator.clipboard?.writeText(json).then(() => toast({ text: t("erp.look.advanced.copied") }))}
        >
          <Copy size={14} /> {t("erp.look.advanced.copy")}
        </Button>
      </Card>
      <Card className="space-y-3">
        <p className="font-semibold">{t("erp.look.advanced.import")}</p>
        <p className="text-xs text-white/55">{t("erp.look.advanced.importHint")}</p>
        <textarea rows={14} value={text} onChange={(e) => setText(e.target.value)} className={area} dir="ltr" />
        <ErrorText>{error}</ErrorText>
        <Button
          onClick={() => {
            try {
              const parsed = JSON.parse(text);
              if (!parsed || typeof parsed !== "object") throw new Error("bad");
              setError("");
              onImport(parsed);
            } catch {
              setError(t("erp.look.advanced.invalid"));
            }
          }}
          disabled={!text.trim()}
        >
          {t("erp.look.advanced.apply")}
        </Button>
      </Card>
    </div>
  );
}
