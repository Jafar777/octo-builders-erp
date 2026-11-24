// The dashboard's look (the Appearance page): colours, fonts, shapes, effects and an
// animated background. Each person picks their own (User.ui.appearance); the CEO sets the
// company default (Setting "appearance") that everyone without their own follows.
// Pure: used by the server (to check what's saved) and the screens (to apply it).

export const MODES = ["dark", "light"];

// Fonts loaded in app/layout.js (next/font, downloaded only when used).
export const LATIN_FONTS = [
  { key: "geist", cssVar: "--font-geist-sans", label: "Geist" },
  { key: "inter", cssVar: "--font-inter", label: "Inter" },
  { key: "poppins", cssVar: "--font-poppins", label: "Poppins" },
  { key: "rubik", cssVar: "--font-rubik", label: "Rubik" },
  { key: "spaceGrotesk", cssVar: "--font-space-grotesk", label: "Space Grotesk" },
  { key: "nunito", cssVar: "--font-nunito", label: "Nunito" },
  { key: "quicksand", cssVar: "--font-quicksand", label: "Quicksand" },
  { key: "lexend", cssVar: "--font-lexend", label: "Lexend" },
  { key: "playfair", cssVar: "--font-playfair", label: "Playfair Display" },
  { key: "orbitron", cssVar: "--font-orbitron", label: "Orbitron" },
  { key: "jetbrains", cssVar: "--font-jetbrains", label: "JetBrains Mono" },
  { key: "firaCode", cssVar: "--font-fira-code", label: "Fira Code" },
];
export const ARABIC_FONTS = [
  { key: "tajawal", cssVar: "--font-tajawal", label: "Tajawal" },
  { key: "cairo", cssVar: "--font-cairo", label: "Cairo" },
  { key: "almarai", cssVar: "--font-almarai", label: "Almarai" },
  { key: "ibmPlex", cssVar: "--font-ibm-plex-arabic", label: "IBM Plex Sans Arabic" },
  { key: "notoKufi", cssVar: "--font-noto-kufi", label: "Noto Kufi Arabic" },
  { key: "readex", cssVar: "--font-readex", label: "Readex Pro" },
  { key: "changa", cssVar: "--font-changa", label: "Changa" },
  { key: "elMessiri", cssVar: "--font-el-messiri", label: "El Messiri" },
  { key: "reemKufi", cssVar: "--font-reem-kufi", label: "Reem Kufi" },
  { key: "amiri", cssVar: "--font-amiri", label: "Amiri" },
  { key: "marhey", cssVar: "--font-marhey", label: "Marhey" },
  { key: "baloo", cssVar: "--font-baloo", label: "Baloo Bhaijaan" },
  { key: "lalezar", cssVar: "--font-lalezar", label: "Lalezar" },
  { key: "rubikArabic", cssVar: "--font-rubik", label: "Rubik" },
];

// Animated backgrounds (components/erp/appearance/backgrounds.js), with their own colours.
export const BACKGROUNDS = [
  { key: "none", icon: "⬛", colors: ["#f37b20", "#ef9957", "#ffffff"] },
  { key: "petals", icon: "🌸", colors: ["#ff8fc1", "#ffc2dc", "#ffffff"] },
  { key: "flowers", icon: "🌼", colors: ["#ff7eb6", "#ffd166", "#ffffff"] },
  { key: "hearts", icon: "💖", colors: ["#ff3d6e", "#ff8fab", "#ffd1dc"] },
  { key: "matrix", icon: "💻", colors: ["#00ff66", "#00b84a", "#d8ffe6"] },
  { key: "cyber", icon: "🛰️", colors: ["#00f0ff", "#ff2a6d", "#ffffff"] },
  { key: "stars", icon: "✨", colors: ["#ffffff", "#9db4ff", "#ffd27a"] },
  { key: "aurora", icon: "🌌", colors: ["#22d3a6", "#7c3aed", "#38bdf8"] },
  { key: "bubbles", icon: "🫧", colors: ["#5fd3ff", "#a5f3fc", "#ffffff"] },
  { key: "snow", icon: "❄️", colors: ["#ffffff", "#cfe8ff", "#9fd8ff"] },
  { key: "fireflies", icon: "🌿", colors: ["#d9ff5e", "#ffe066", "#9dff9d"] },
  { key: "network", icon: "🕸️", colors: ["#38bdf8", "#818cf8", "#e0f2fe"] },
  { key: "rain", icon: "🌧️", colors: ["#9fb6cf", "#e5eef8", "#ffffff"] },
  { key: "waves", icon: "🌊", colors: ["#ff8a3d", "#ff3d77", "#ffd166"] },
  { key: "confetti", icon: "🎉", colors: ["#ffd23f", "#ff4f8b", "#3ee6c1"] },
  { key: "leaves", icon: "🍁", colors: ["#e8833a", "#c0392b", "#f4c542"] },
  { key: "geometric", icon: "🔷", colors: ["#ff00e6", "#00f0ff", "#fffb00"] },
  { key: "blobs", icon: "🫠", colors: ["#ff5fa2", "#7b61ff", "#22d3ee"] },
  { key: "synthwave", icon: "🌅", colors: ["#ff2a6d", "#05d9e8", "#ffd319"] },
];
export const BACKGROUND_KEYS = BACKGROUNDS.map((b) => b.key);

// ---- colours: mixing, and a theme's other mode ----
const HEX = /^#[0-9a-f]{6}$/i;
const rgbOf = (hex) => {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};
const hexOf = (rgb) => `#${rgb.map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, "0")).join("")}`;
// `a` mixed with `b` (t = how much of b).
export const mix = (a, b, t) => {
  const bb = rgbOf(b);
  return hexOf(rgbOf(a).map((c, i) => c + (bb[i] - c) * t));
};
// Relative brightness 0 (black) – 1 (white).
export const brightness = (hex) => {
  const [r, g, b] = rgbOf(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
// Darker until it reads on a light page / lighter until it shows on a dark one.
const deepen = (hex, max = 0.33) => {
  let c = hex;
  for (let i = 0; i < 8 && brightness(c) > max; i++) c = mix(c, "#000000", 0.18);
  return c;
};
const brighten = (hex, min = 0.16) => {
  let c = hex;
  for (let i = 0; i < 8 && brightness(c) < min; i++) c = mix(c, "#ffffff", 0.2);
  return c;
};

// A palette for `mode` made from the other mode's palette. Colours left "" stay "" (the
// mode's own), so every theme works in both dark and light.
export function paletteFor(mode, p) {
  const tint = p.accent || p.accent2 || "";
  if (mode === "light") {
    return {
      accent: p.accent ? deepen(p.accent) : "",
      accent2: p.accent2 ? deepen(p.accent2, 0.4) : "",
      background: p.background ? (tint ? mix("#fbfaf8", tint, 0.07) : "#f7f7f5") : "",
      surface: p.surface ? "#ffffff" : "",
      text: p.text ? (tint ? mix("#16181d", tint, 0.18) : "#16181d") : "",
    };
  }
  return {
    accent: p.accent ? brighten(p.accent, 0.22) : "",
    accent2: p.accent2 ? brighten(p.accent2, 0.22) : "",
    background: p.background ? (tint ? mix("#07070a", tint, 0.07) : "#07070a") : "",
    surface: p.surface ? (tint ? mix("#131317", tint, 0.1) : "#131317") : "",
    text: p.text ? (tint ? mix("#f6f6f8", tint, 0.08) : "#f6f6f8") : "",
  };
}
// Background colours for `mode` from the other mode's.
export const bgColorsFor = (mode, colors) => colors.map((c) => (mode === "light" ? deepen(c, 0.42) : brighten(c, 0.12)));

const EMPTY_PALETTE = { accent: "", accent2: "", background: "", surface: "", text: "" };
const PALETTE_KEYS = Object.keys(EMPTY_PALETTE);
const otherMode = (m) => (m === "light" ? "dark" : "light");
// { dark, light } from the colours of one mode (`own`) and a maker for the other.
const both = (mode, own, makeOther) => {
  const other = makeOther(otherMode(mode), own);
  return mode === "dark" ? { dark: own, light: other } : { dark: other, light: own };
};

export const DEFAULT_APPEARANCE = {
  preset: "octo",
  mode: "dark",
  // A palette for each mode; "" = the mode's own colour (app/globals.css).
  colors: { dark: { ...EMPTY_PALETTE }, light: { ...EMPTY_PALETTE } },
  font: { latin: "geist", arabic: "tajawal", size: 100 },
  shape: { radius: 100, spacing: 100 },
  effects: { motion: true, glass: 10, panels: 72 },
  background: { kind: "none", colors: both("dark", ["#f37b20", "#ef9957", "#ffffff"], bgColorsFor), density: 50, speed: 50, size: 50, opacity: 70 },
};

// Ready-made looks: each sets everything (the person edits from there). Colours are
// given for the mode the theme was drawn in; the other mode is made from them.
const look = (preset, native, colors, background, font = {}, extra = {}) => {
  const kind = background?.kind || "none";
  const kindColors = background?.colors || BACKGROUNDS.find((b) => b.key === kind).colors;
  return {
    ...DEFAULT_APPEARANCE,
    preset,
    mode: native,
    colors: both(native, { ...EMPTY_PALETTE, ...colors }, paletteFor),
    font: { ...DEFAULT_APPEARANCE.font, ...font },
    shape: { ...DEFAULT_APPEARANCE.shape, ...(extra.shape || {}) },
    effects: { ...DEFAULT_APPEARANCE.effects, ...(extra.effects || {}) },
    // The background colours are drawn for a dark page.
    background: { ...DEFAULT_APPEARANCE.background, ...(background || {}), kind, colors: both("dark", kindColors, bgColorsFor) },
  };
};
const bg = (kind, more = {}) => ({ kind, ...more });

export const PRESETS = [
  look("octo", "dark", {}, null),
  look("sakura", "dark", { accent: "#ff7eb6", accent2: "#ffb3d1", background: "#1a0d17", surface: "#2a1424", text: "#ffeef6" }, bg("petals"), { latin: "playfair", arabic: "elMessiri" }, { shape: { radius: 150 } }),
  look("garden", "light", { accent: "#e0457b", accent2: "#d97706", background: "#fff6f9", surface: "#ffffff", text: "#3a1d2b" }, bg("flowers", { opacity: 55 }), { latin: "quicksand", arabic: "marhey" }, { shape: { radius: 160 } }),
  look("love", "dark", { accent: "#ff3d6e", accent2: "#ff8fab", background: "#1a0710", surface: "#2a0c19", text: "#ffe4ec" }, bg("hearts"), { latin: "nunito", arabic: "baloo" }, { shape: { radius: 170 } }),
  look("hacker", "dark", { accent: "#00ff66", accent2: "#00c853", background: "#010a04", surface: "#03140a", text: "#c6ffd9" }, bg("matrix"), { latin: "jetbrains", arabic: "ibmPlex" }, { shape: { radius: 25 } }),
  look("amberTerminal", "dark", { accent: "#ffb000", accent2: "#ff8800", background: "#0c0700", surface: "#170e00", text: "#ffe2a8" }, bg("matrix", { colors: ["#ffb000", "#a86a00", "#fff0c9"] }), { latin: "firaCode", arabic: "ibmPlex" }, { shape: { radius: 0 } }),
  look("cyberpunk", "dark", { accent: "#00f0ff", accent2: "#ff2a6d", background: "#05010d", surface: "#0e0720", text: "#e8fbff" }, bg("cyber"), { latin: "orbitron", arabic: "changa" }, { shape: { radius: 35 } }),
  look("space", "dark", { accent: "#7c9cff", accent2: "#c4b5fd", background: "#03030d", surface: "#0b0b1f", text: "#e6e9ff" }, bg("stars"), { latin: "spaceGrotesk", arabic: "readex" }),
  look("aurora", "dark", { accent: "#22d3a6", accent2: "#a78bfa", background: "#020c12", surface: "#071a22", text: "#e2fff7" }, bg("aurora"), { latin: "lexend", arabic: "readex" }, { shape: { radius: 130 } }),
  look("ocean", "dark", { accent: "#2ec5ff", accent2: "#7dd3fc", background: "#021624", surface: "#06243a", text: "#e0f6ff" }, bg("bubbles"), { latin: "nunito", arabic: "cairo" }, { shape: { radius: 150 } }),
  look("winter", "dark", { accent: "#9fd8ff", accent2: "#e0f2ff", background: "#0a1422", surface: "#122236", text: "#eef6ff" }, bg("snow"), { latin: "quicksand", arabic: "almarai" }),
  look("forest", "dark", { accent: "#b8f34a", accent2: "#facc15", background: "#06120a", surface: "#0d2014", text: "#ecffe0" }, bg("fireflies"), { latin: "rubik", arabic: "notoKufi" }),
  look("network", "dark", { accent: "#38bdf8", accent2: "#818cf8", background: "#060a16", surface: "#0d1426", text: "#e5f3ff" }, bg("network"), { latin: "inter", arabic: "ibmPlex" }, { shape: { radius: 80 } }),
  look("storm", "dark", { accent: "#7aa2c8", accent2: "#c7d7e8", background: "#090d13", surface: "#121922", text: "#e5edf5" }, bg("rain"), { latin: "inter", arabic: "cairo" }),
  look("sunset", "dark", { accent: "#ff8a3d", accent2: "#ff3d77", background: "#170811", surface: "#24101c", text: "#ffefe5" }, bg("waves"), { latin: "poppins", arabic: "cairo" }, { shape: { radius: 140 } }),
  look("party", "dark", { accent: "#ffd23f", accent2: "#ff4f8b", background: "#100a1e", surface: "#1c1330", text: "#fff7e0" }, bg("confetti"), { latin: "poppins", arabic: "lalezar" }, { shape: { radius: 180 } }),
  look("autumn", "dark", { accent: "#e8833a", accent2: "#f4c542", background: "#160d06", surface: "#24170c", text: "#fff1e2" }, bg("leaves"), { latin: "playfair", arabic: "amiri" }),
  look("neon", "dark", { accent: "#ff00e6", accent2: "#00f0ff", background: "#080012", surface: "#130524", text: "#fbe9ff" }, bg("geometric"), { latin: "orbitron", arabic: "changa" }, { shape: { radius: 40 } }),
  look("candy", "dark", { accent: "#ff5fa2", accent2: "#7b61ff", background: "#120820", surface: "#1e1033", text: "#fff0fa" }, bg("blobs"), { latin: "quicksand", arabic: "marhey" }, { shape: { radius: 200 } }),
  look("synthwave", "dark", { accent: "#ff2a6d", accent2: "#05d9e8", background: "#0d0221", surface: "#1a0738", text: "#ffe8f3" }, bg("synthwave"), { latin: "orbitron", arabic: "reemKufi" }, { shape: { radius: 30 } }),
  look("paper", "light", { accent: "#1f6feb", accent2: "#0ea5e9", background: "#f7f7f5", surface: "#ffffff", text: "#1b1f24" }, null, { latin: "inter", arabic: "ibmPlex" }, { shape: { radius: 70 } }),
];
export const PRESET_KEYS = PRESETS.map((p) => p.preset);

// ---- checking what's saved ----
const color = (v, fallback = "") => (typeof v === "string" && HEX.test(v) ? v.toLowerCase() : fallback);
const num = (v, min, max, fallback) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const oneOf = (v, list, fallback) => (list.includes(v) ? v : fallback);
const cleanPalette = (p) => Object.fromEntries(PALETTE_KEYS.map((k) => [k, color(p?.[k])]));
const cleanTriple = (list, fallback) => [0, 1, 2].map((i) => color(Array.isArray(list) ? list[i] : undefined, fallback[i]));

// Any object → a complete, safe appearance (unknown or bad values take the default).
// Looks saved before each mode had its own palette (one `colors` / background colour
// list) keep theirs for the mode they were in, and get the other mode made from it.
export function cleanAppearance(input) {
  const a = input && typeof input === "object" ? input : {};
  const d = DEFAULT_APPEARANCE;
  const mode = oneOf(a.mode, MODES, d.mode);
  const kind = oneOf(a.background?.kind, BACKGROUND_KEYS, d.background.kind);
  const kindColors = BACKGROUNDS.find((b) => b.key === kind).colors;

  const oldPalette = a.colors && typeof a.colors === "object" && !a.colors.dark && !a.colors.light && PALETTE_KEYS.some((k) => k in a.colors);
  const colors = oldPalette ? both(mode, cleanPalette(a.colors), paletteFor) : { dark: cleanPalette(a.colors?.dark), light: cleanPalette(a.colors?.light) };

  const bgIn = a.background?.colors;
  const bgColors = Array.isArray(bgIn)
    ? both(mode, cleanTriple(bgIn, mode === "light" ? bgColorsFor("light", kindColors) : kindColors), bgColorsFor)
    : { dark: cleanTriple(bgIn?.dark, kindColors), light: cleanTriple(bgIn?.light, bgColorsFor("light", kindColors)) };

  return {
    preset: typeof a.preset === "string" && /^[a-zA-Z]{1,30}$/.test(a.preset) ? a.preset : "custom",
    mode,
    colors,
    font: {
      latin: oneOf(a.font?.latin, LATIN_FONTS.map((f) => f.key), d.font.latin),
      arabic: oneOf(a.font?.arabic, ARABIC_FONTS.map((f) => f.key), d.font.arabic),
      size: num(a.font?.size, 85, 125, d.font.size),
    },
    shape: { radius: num(a.shape?.radius, 0, 220, d.shape.radius), spacing: num(a.shape?.spacing, 80, 125, d.shape.spacing) },
    effects: {
      motion: a.effects?.motion !== false,
      glass: num(a.effects?.glass, 0, 30, d.effects.glass),
      panels: num(a.effects?.panels, 0, 100, d.effects.panels),
    },
    background: {
      kind,
      colors: bgColors,
      density: num(a.background?.density, 0, 100, d.background.density),
      speed: num(a.background?.speed, 0, 100, d.background.speed),
      size: num(a.background?.size, 0, 100, d.background.size),
      opacity: num(a.background?.opacity, 5, 100, d.background.opacity),
    },
  };
}

// The palette and background colours of the mode on screen.
export const paletteOf = (a) => a.colors[a.mode];
export const bgColorsOf = (a) => a.background.colors[a.mode];
// The page colour behind the background animation (hex): theirs, or the mode's own.
export const pageColor = (a) => paletteOf(a).background || (a.mode === "light" ? "#f4f2ee" : "#000000");

// What a person sees: their own, else the company's, else the built-in look (with the
// light / dark choice they made before appearances existed).
export function effectiveAppearance(mine, company, legacyTheme = "dark") {
  if (mine) return cleanAppearance(mine);
  if (company) return cleanAppearance(company);
  return cleanAppearance({ ...DEFAULT_APPEARANCE, mode: legacyTheme === "light" ? "light" : "dark" });
}

// ---- applying it ----
const RADII = { xs: 0.125, sm: 0.25, md: 0.375, lg: 0.5, xl: 0.75, "2xl": 1, "3xl": 1.5, "4xl": 2 };
const fontVar = (list, key) => (list.find((f) => f.key === key) || list[0]).cssVar;

// The CSS variables (and font) for the dashboard frame and <html>, from the palette of
// the mode on screen. Colours left "" keep the mode's own (app/globals.css).
export function appearanceStyle(a, dir = "rtl") {
  const style = {};
  const colors = paletteOf(a);
  if (colors.accent) style["--color-brand-orange"] = colors.accent;
  if (colors.accent2) style["--color-brand-peach"] = colors.accent2;
  if (colors.background) {
    style["--color-brand-navy"] = colors.background;
    style["--background"] = colors.background;
  }
  if (colors.surface) style["--color-brand-navy-light"] = colors.surface;
  if (colors.text) {
    style["--color-white"] = colors.text;
    style["--foreground"] = colors.text;
  }
  const r = a.shape.radius / 100;
  for (const [k, rem] of Object.entries(RADII)) style[`--radius-${k}`] = `${+(rem * r).toFixed(3)}rem`;
  style["--spacing"] = `${+(0.25 * (a.shape.spacing / 100)).toFixed(4)}rem`;
  style["--glass-blur"] = `${a.effects.glass}px`;
  style["--panel-tint"] = `${a.effects.panels}%`;
  const latin = `var(${fontVar(LATIN_FONTS, a.font.latin)})`;
  const arabic = `var(${fontVar(ARABIC_FONTS, a.font.arabic)})`;
  style.fontFamily = `${dir === "rtl" ? `${arabic}, ${latin}` : `${latin}, ${arabic}`}, Arial, Helvetica, sans-serif`;
  return style;
}
