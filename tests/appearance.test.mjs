import { BACKGROUNDS, bgColorsOf, brightness, cleanAppearance, appearanceStyle, effectiveAppearance, paletteOf, PRESETS, DEFAULT_APPEARANCE } from "../lib/appearance.js";
import { makeBackground } from "../components/erp/appearance/backgrounds.js";

let fails = 0;
const ok = (name, c, x = "") => { console.log(`${c ? "PASS" : "FAIL"} ${name} ${c ? "" : x}`); if (!c) fails++; };

// Saved values are checked: bad ones fall back, numbers are kept in range.
const bad = cleanAppearance({ mode: "purple", colors: { accent: "red", text: "#ABCDEF" }, font: { size: 400, latin: "comic" }, shape: { radius: -5 }, background: { kind: "lasers", density: 900 }, evil: "<script>" });
ok("a bad mode falls back to dark", bad.mode === "dark");
ok("a colour that isn't #rrggbb is dropped", bad.colors.dark.accent === "" && bad.colors.dark.text === "#abcdef");
ok("an old one-palette look gets the other mode made from it", bad.colors.light.text !== "" && bad.colors.light.accent === "");
ok("text size stays 85–125%", bad.font.size === 125 && bad.font.latin === "geist");
ok("unknown background → none, numbers clamped", bad.background.kind === "none" && bad.shape.radius === 0);
ok("unknown fields are dropped", !("evil" in bad));
ok("nothing saved → the built-in look (with the old light choice)", effectiveAppearance(null, null, "light").mode === "light");
ok("own look wins over the company's", effectiveAppearance({ mode: "light" }, { mode: "dark" }).mode === "light");
ok("company default when no own look", effectiveAppearance(null, { preset: "hacker", mode: "dark", colors: { accent: "#00ff66" } }).colors.dark.accent === "#00ff66");

// Every theme has a dark and a light palette, readable in each.
for (const p of PRESETS) {
  const d = paletteOf({ ...p, mode: "dark" });
  const l = paletteOf({ ...p, mode: "light" });
  if (d.background) ok(`${p.preset}: dark page is dark, light page is light`, brightness(d.background) < 0.08 && brightness(l.background) > 0.8, `${d.background} ${l.background}`);
  if (l.accent) ok(`${p.preset}: the light accent reads on a light page`, brightness(l.accent) <= 0.42, l.accent);
  if (d.text) ok(`${p.preset}: text contrasts in both modes`, brightness(d.text) > 0.6 && brightness(l.text) < 0.1, `${d.text} ${l.text}`);
  ok(`${p.preset}: background colours for both modes`, bgColorsOf({ ...p, mode: "light" }).length === 3 && bgColorsOf({ ...p, mode: "dark" }).length === 3);
}
const lightStyle = appearanceStyle(cleanAppearance({ ...PRESETS.find((p) => p.preset === "hacker"), mode: "light" }), "ltr");
ok("switching to light uses the light palette", lightStyle["--color-brand-navy"] === PRESETS.find((p) => p.preset === "hacker").colors.light.background);

// Every preset is complete and survives the check unchanged.
for (const p of PRESETS) ok(`preset ${p.preset} is valid`, JSON.stringify(cleanAppearance(p)) === JSON.stringify(p), JSON.stringify(cleanAppearance(p)));
ok("presets have unique names", new Set(PRESETS.map((p) => p.preset)).size === PRESETS.length);
ok("at least 20 themes", PRESETS.length >= 20);

// CSS variables.
const st = appearanceStyle(cleanAppearance({ ...DEFAULT_APPEARANCE, colors: { dark: { accent: "#123456" }, light: {} }, shape: { radius: 200, spacing: 80 } }), "rtl");
ok("accent sets the brand colour", st["--color-brand-orange"] === "#123456");
ok("theme colours left auto aren't set", !("--color-brand-navy" in st));
ok("radius scales", st["--radius-xl"] === "1.5rem", st["--radius-xl"]);
ok("spacing scales", st["--spacing"] === "0.2rem", st["--spacing"]);
ok("rtl puts the Arabic font first", st.fontFamily.startsWith("var(--font-tajawal)"));

// Every background runs for a few seconds on a fake canvas without errors.
const noop = () => {};
const grad = { addColorStop: noop };
const ctx = new Proxy({}, { get: (_, k) => (k === "createLinearGradient" || k === "createRadialGradient" ? () => grad : noop), set: () => true });
for (const b of BACKGROUNDS) {
  for (const settings of [{ density: 50, speed: 50, size: 50, opacity: 70 }, { density: 0, speed: 100, size: 0, opacity: 5 }, { density: 100, speed: 0, size: 100, opacity: 100 }]) {
    try {
      const scene = makeBackground(b.key, ctx, 1440, 900, { ...settings, colors: b.colors, bg: "#000000" });
      let t = 0;
      for (let i = 0; i < 240; i++) scene.step(1 / 60, (t += 1 / 60));
      scene.step(0, t);
    } catch (err) {
      ok(`background ${b.key} runs (${JSON.stringify(settings)})`, false, err.stack);
      continue;
    }
  }
  ok(`background ${b.key} runs`, true);
}

if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
