// KPI configuration: indicators → items → metric + point bands.
// A band gives its points when  (min == null || value >= min) && (max == null || value < max);
// the first matching band wins. An item's weight is its highest band; an
// indicator's weight is the sum of its items. Defaults reproduce the Excel KPI-Calc.

// Metrics the engine can measure (lib/kpi/engine.js). unit is for display only.
export const METRICS = {
  short_hours: { unit: "h", source: "attendance" }, // required − credited hours
  late_count: { unit: "×", source: "attendance" },
  warning_count: { unit: "×", source: "attendance" },
  approved_ratio: { unit: "×", source: "tasks" }, // approved tasks ÷ department average
  speed_ratio: { unit: "×", source: "tasks" }, // my average task time ÷ department average (lower = faster)
  utilization_pct: { unit: "%", source: "tasks" }, // task time ÷ attendance time
  on_time_pct: { unit: "%", source: "tasks" },
  avg_delay_hours: { unit: "h", source: "tasks" },
  late_share_pct: { unit: "%", source: "tasks" },
  first_time_pct: { unit: "%", source: "tasks" }, // R-00 approved on first review
  revisions_pct: { unit: "%", source: "tasks" }, // revision tasks ÷ all tasks
  rejection_pct: { unit: "%", source: "tasks" },
  help_count: { unit: "×", source: "tasks" }, // help tasks done + "helped a colleague" ratings
  contribution_share_pct: { unit: "%", source: "tasks" }, // my help ÷ all help in the company
  advanced_skills: { unit: "×", source: "tasks" }, // distinct advanced task types used
  design_skill_pct: { unit: "%", source: "ratings" }, // (excellent − errors) ÷ rated tasks, design skills
  software_skill_pct: { unit: "%", source: "ratings" }, // same for AutoCAD / Max / Render
};

export const METRIC_KEYS = Object.keys(METRICS);

const b = (min, max, points) => ({ min, max, points });
const n = (ar, en) => ({ ar, en });

export const DEFAULT_KPI = {
  from: "2000-01",
  advancedTypes: ["presentation", "ai_edit", "graphics_edit", "animation", "bim"],
  designSkills: ["design", "functional", "shop_drawings"],
  softwareSkills: ["autocad", "max", "render"],
  target: 80,
  grades: [
    { min: 80, name: n("ممتاز", "Excellent") },
    { min: 65, name: n("جيد", "Good") },
    { min: 50, name: n("مقبول", "Acceptable") },
    { min: 0, name: n("ضعيف", "Weak") },
  ],
  indicators: [
    {
      key: "attendance",
      name: n("الحضور والالتزام", "Attendance & discipline"),
      items: [
        { key: "hours", metric: "short_hours", name: n("تحقيق ساعات الدوام الشهرية", "Monthly hours reached"), bands: [b(null, 0.5, 5), b(0.5, 8.5, 3), b(8.5, 16.5, 1), b(16.5, null, 0)] },
        { key: "punctuality", metric: "late_count", name: n("الالتزام بمواعيد الدخول", "Punctuality"), bands: [b(null, 2, 3), b(2, 4, 2), b(4, 6, 1), b(6, null, 0)] },
        { key: "warnings", metric: "warning_count", name: n("الإنذارات والمخالفات", "Warnings"), bands: [b(null, 3, 2), b(3, 4, 1), b(4, null, 0)] },
      ],
    },
    {
      key: "efficiency",
      name: n("الكفاءة والإنتاجية", "Efficiency & productivity"),
      items: [
        { key: "approved", metric: "approved_ratio", name: n("عدد المهام المعتمدة مقابل المتوسط", "Approved tasks vs average"), bands: [b(1.05, null, 6), b(0.95, 1.05, 3), b(null, 0.95, 1)] },
        { key: "speed", metric: "speed_ratio", name: n("سرعة الإنجاز مقابل المتوسط", "Speed vs average"), bands: [b(null, 0.95, 5), b(0.95, 1.05, 3), b(1.05, null, 1)] },
        { key: "utilization", metric: "utilization_pct", name: n("استغلال وقت العمل", "Work-time utilisation"), bands: [b(90, null, 4), b(80, 90, 3), b(70, 80, 2), b(null, 70, 0)] },
      ],
    },
    {
      key: "delivery",
      name: n("الالتزام بمواعيد التسليم", "On-time delivery"),
      items: [
        { key: "on_time", metric: "on_time_pct", name: n("التسليم ضمن الموعد", "Delivered on time"), bands: [b(90, null, 10), b(80, 90, 8), b(70, 80, 5), b(null, 70, 0)] },
        { key: "delay", metric: "avg_delay_hours", name: n("متوسط ساعات التأخير", "Average delay hours"), bands: [b(null, 2, 6), b(2, 4, 5), b(4, 8, 3), b(8, null, 1)] },
        { key: "late_share", metric: "late_share_pct", name: n("نسبة المهام المتأخرة", "Share of late tasks"), bands: [b(null, 10, 4), b(10, 21, 3), b(21, 31, 2), b(31, null, 1)] },
      ],
    },
    {
      key: "quality",
      name: n("جودة العمل", "Work quality"),
      items: [
        { key: "first_time", metric: "first_time_pct", name: n("الاعتماد من المرة الأولى", "First-time approval"), bands: [b(80, null, 10), b(70, 80, 8), b(60, 70, 4), b(null, 60, 1)] },
        { key: "revisions", metric: "revisions_pct", name: n("متوسط التعديلات", "Average revisions"), bands: [b(null, 20, 8), b(20, 51, 6), b(51, 81, 3), b(81, null, 1)] },
        { key: "rejections", metric: "rejection_pct", name: n("نسبة الرفض", "Rejections"), bands: [b(null, 10, 7), b(10, 15, 5), b(15, 20, 3), b(20, null, 0)] },
      ],
    },
    {
      key: "cooperation",
      name: n("التعاون والمساهمة", "Cooperation & contribution"),
      items: [
        { key: "help", metric: "help_count", name: n("عدد مرات المساهمة لصالح موظف", "Times helped a colleague"), bands: [b(null, 1, 0), b(1, 3, 1), b(3, 6, 2), b(6, null, 3)] },
        { key: "share", metric: "contribution_share_pct", name: n("نسبة المساهمة من مجموع المساهمات", "Share of all contributions"), bands: [b(null, 0.01, 0), b(0.01, 40, 1), b(40, 60, 2), b(60, null, 3)] },
        { key: "advanced", metric: "advanced_skills", name: n("مهارات متقدمة (AI، Graphics، BIM...)", "Advanced skills (AI, Graphics, BIM...)"), bands: [b(null, 1, 0), b(1, null, 4)] },
      ],
    },
    {
      key: "skills",
      name: n("المهارات الفنية", "Technical skills"),
      items: [
        { key: "design", metric: "design_skill_pct", name: n("التصميم والحل الوظيفي والشوب دروينج", "Design, functional & shop drawings"), bands: [b(20, null, 12), b(10, 20, 10), b(5, 10, 6), b(null, 5, 0)] },
        { key: "software", metric: "software_skill_pct", name: n("البرامج الهندسية الأساسية", "Core engineering software"), bands: [b(20, null, 8), b(10, 20, 6), b(5, 10, 3), b(null, 5, 0)] },
      ],
    },
  ],
};

export function bandPoints(bands, value) {
  if (value === null || value === undefined || Number.isNaN(value)) return 0;
  const band = bands.find((x) => (x.min === null || value >= x.min) && (x.max === null || value < x.max));
  return band ? band.points : 0;
}

export const itemWeight = (item) => Math.max(0, ...item.bands.map((x) => x.points));
export const indicatorWeight = (ind) => ind.items.reduce((sum, item) => sum + itemWeight(item), 0);

// The configuration in force for a month.
export function kpiConfigFor(settingsKpi, month) {
  const versions = (settingsKpi?.versions || []).filter((v) => v.from <= month).sort((a, c) => c.from.localeCompare(a.from));
  return versions[0] || DEFAULT_KPI;
}

// Validates a submitted configuration into a clean version. Returns { value } or { error }.
export function cleanKpiConfig(v) {
  const num = (x) => (x === null || x === "" || x === undefined ? null : Number(x));
  const name = (x) => ({ ar: String(x?.ar || "").trim().slice(0, 120), en: String(x?.en || "").trim().slice(0, 120) });
  const key = (x) => String(x || "").trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_").slice(0, 40);
  if (!/^\d{4}-\d{2}$/.test(v?.from || "")) return { error: "invalid_date" };

  const indicators = (Array.isArray(v.indicators) ? v.indicators : []).map((ind, i) => ({
    key: key(ind.key) || `indicator_${i + 1}`,
    name: name(ind.name),
    items: (Array.isArray(ind.items) ? ind.items : []).map((item, j) => ({
      key: key(item.key) || `item_${j + 1}`,
      metric: METRIC_KEYS.includes(item.metric) ? item.metric : null,
      name: name(item.name),
      bands: (Array.isArray(item.bands) ? item.bands : [])
        .map((x) => ({ min: num(x.min), max: num(x.max), points: Math.max(0, Number(x.points) || 0) }))
        .filter((x) => (x.min === null || Number.isFinite(x.min)) && (x.max === null || Number.isFinite(x.max))),
    })),
  }));

  const items = indicators.flatMap((ind) => ind.items);
  if (!indicators.length || !items.length) return { error: "kpi_empty" };
  if (items.some((i) => !i.metric || !i.bands.length)) return { error: "kpi_invalid_item" };
  if ([...indicators, ...items].some((x) => !x.name.ar || !x.name.en)) return { error: "bilingual_required" };

  const grades = (Array.isArray(v.grades) ? v.grades : DEFAULT_KPI.grades)
    .map((g) => ({ min: Number(g.min) || 0, name: name(g.name) }))
    .sort((a, c) => c.min - a.min);
  if (grades.some((g) => !g.name.ar || !g.name.en)) return { error: "bilingual_required" };

  return {
    value: {
      from: v.from,
      indicators,
      grades,
      target: Math.max(0, Math.min(100, Number(v.target) || DEFAULT_KPI.target)),
      advancedTypes: (Array.isArray(v.advancedTypes) ? v.advancedTypes : DEFAULT_KPI.advancedTypes).map(String),
      designSkills: DEFAULT_KPI.designSkills,
      softwareSkills: DEFAULT_KPI.softwareSkills,
    },
  };
}
