// Default values for every settings group. The owner edits them in
// Dashboard → Settings; these are only used until something is saved.
// Day numbers follow JavaScript: 0 = Sunday … 5 = Friday, 6 = Saturday.

export const SETTINGS_DEFAULTS = {
  calendar: {
    weekend: [5],
    holidays: [], // [{ date: "2026-12-02", name: { ar, en } }]
    ramadan: { start: "", end: "" }, // "YYYY-MM-DD"
  },
  workHours: {
    // The standard day (used where a weekday has no hours of its own).
    workStart: "09:00",
    workEnd: "17:00",
    dailyHours: 8,
    // Hours of each weekday, indexed by day number (0 = Sunday). Weekend days are
    // chosen in the calendar; their row only matters if they become working days.
    days: Array.from({ length: 7 }, () => ({ start: "09:00", end: "17:00", hours: 8 })),
    // Single dates with their own hours, even on a weekend or holiday:
    // [{ date: "2026-12-24", start: "09:00", end: "13:00", hours: 4, name: { ar, en } }]
    special: [],
    ramadanHours: 7,
    minHours: 7.5,
    graceMinutes: 15,
    overtimeMultiplier: 1.5,
    monthlyRequiredHours: 208,
  },
  currencies: {
    base: "USD",
    // rate = how many units of this currency equal 1 unit of the base currency
    list: [
      { code: "USD", name: { ar: "دولار أمريكي", en: "US Dollar" }, rate: 1 },
      { code: "SAR", name: { ar: "ريال سعودي", en: "Saudi Riyal" }, rate: 3.8 },
    ],
  },
  // The company file server (office share) reached through the file gateway
  // (tools/octo-file-gateway). Edited on the Files page (files.manage). The gateway's
  // connection key is kept apart (Setting "fileServerKey"), never sent to the browser.
  fileServer: {
    enabled: false,
    url: "", // the gateway's https address, e.g. https://files.octo-builders.com
    // Shares the gateway serves: key = the volume name in the gateway's config.json.
    volumes: [
      {
        key: "ttd",
        name: { ar: "ملفات التسليم (TTD)", en: "Submitted files (TTD)" },
        unc: "\\\\192.168.1.100\\files submitted (ttd)",
        drives: ["A", "Z", "W"], // drive letters mapped to it on the office PCs (old links)
      },
    ],
    // "company": every employee sees the whole share (like the office network drive);
    // "department": only their departments' folders and their tasks' folders.
    access: "company",
    // Where each department's projects go: [{ department, path }]; others use projectsRoot.
    departmentFolders: [],
    projectsRoot: "/",
    // "both": a delivery can be server files or an outside link; "server": server only.
    deliveryMode: "both",
  },
  tasks: {
    // Keys are stored on tasks; names can change freely.
    taskTypes: [
      { key: "cad", name: { ar: "CAD", en: "CAD" } },
      { key: "max", name: { ar: "MAX", en: "MAX" } },
      { key: "test_render", name: { ar: "Test Render", en: "Test Render" } },
      { key: "final_render", name: { ar: "Final Render", en: "Final Render" } },
      { key: "shop_drawings", name: { ar: "مخططات تنفيذية", en: "Shop Drawings" } },
      { key: "details", name: { ar: "تفاصيل", en: "Details" } },
      { key: "checking", name: { ar: "تدقيق", en: "Checking" } },
      { key: "boq", name: { ar: "حصر كميات", en: "Quantity / BOQ" } },
      { key: "site_analysis", name: { ar: "تحليل الموقع", en: "Site Analysis" } },
      { key: "presentation", name: { ar: "عرض تقديمي", en: "Presentation" } },
      { key: "animation", name: { ar: "أنيميشن", en: "Animation" } },
      { key: "ai_edit", name: { ar: "تعديل بالذكاء الاصطناعي", en: "AI Edit" } },
      { key: "graphics_edit", name: { ar: "تعديل جرافيك", en: "Graphics Edit" } },
      { key: "bim", name: { ar: "BIM", en: "BIM" } },
      { key: "meeting", name: { ar: "اجتماع", en: "Meeting" } },
      { key: "other", name: { ar: "أخرى", en: "Other" } },
    ],
    // kind: neutral | excellent | error | contribution  (used by the KPI engine)
    // skill: which technical skill the tag counts for
    ratingTags: [
      { key: "normal", kind: "neutral", skill: "", name: { ar: "معتدل", en: "Normal" } },
      { key: "exc_design", kind: "excellent", skill: "design", name: { ar: "متميز بالتصميم", en: "Excellent design" } },
      { key: "exc_functional", kind: "excellent", skill: "functional", name: { ar: "متميز في الحل الوظيفي", en: "Excellent functional solution" } },
      { key: "exc_shop", kind: "excellent", skill: "shop_drawings", name: { ar: "متميز بالمخططات التنفيذية", en: "Excellent shop drawings" } },
      { key: "exc_autocad", kind: "excellent", skill: "autocad", name: { ar: "متميز بالأوتوكاد", en: "Excellent AutoCAD" } },
      { key: "exc_max", kind: "excellent", skill: "max", name: { ar: "متميز بالماكس", en: "Excellent 3ds Max" } },
      { key: "exc_render", kind: "excellent", skill: "render", name: { ar: "متميز بالرندر", en: "Excellent render" } },
      { key: "contribution", kind: "contribution", skill: "", name: { ar: "مساهمة لصالح موظف", en: "Helped a colleague" } },
      { key: "err_design", kind: "error", skill: "design", name: { ar: "خطأ في التصميم", en: "Design error" } },
      { key: "err_functional", kind: "error", skill: "functional", name: { ar: "خطأ في الحل الوظيفي", en: "Functional solution error" } },
      { key: "err_shop", kind: "error", skill: "shop_drawings", name: { ar: "خطأ في المخططات التنفيذية", en: "Shop drawings error" } },
      { key: "err_autocad", kind: "error", skill: "autocad", name: { ar: "خطأ في الأوتوكاد", en: "AutoCAD error" } },
      { key: "err_max", kind: "error", skill: "max", name: { ar: "خطأ في الماكس", en: "3ds Max error" } },
      { key: "err_render", kind: "error", skill: "render", name: { ar: "خطأ في الرندر", en: "Render error" } },
      { key: "err_project", kind: "error", skill: "project", name: { ar: "خطأ في طبيعة المشروع", en: "Project-nature error" } },
      { key: "err_management", kind: "error", skill: "management", name: { ar: "خطأ من الإدارة", en: "Management error" } },
    ],
  },
  hr: {
    timezone: "Asia/Damascus", // punches are converted to this local time
    lateIsWarning: true,
    shortageIsWarning: false, // below the minimum daily hours (off: a short day is just paid its hours)
    absenceIsWarning: true, // unjustified absence
    // Deduction from the base salary once the monthly warning count reaches `count`.
    warningRules: [
      { count: 4, percent: 5 },
      { count: 5, percent: 15 },
    ],
    deductMissingHours: true, // hours short of the required month are deducted
    payOvertime: true,
    bonusSplit: [50, 30, 20], // % of the monthly KPI bonus pool for ranks 1, 2, 3
    salaryCode: true, // salaries need a fresh email code (30 minutes)
    webCheckIn: false, // allow a check-in / out button in the system (backup for the device)
  },
  // Department managers get a hybrid KPI (lib/kpi/hybrid): management (their team's
  // results, `teamWeights`, blended with the GM / CEO's monthly 1–5 rating at
  // `ratingWeight` %) × their management share + their own work × the rest.
  // `managementShare` is the default share; each head can have their own.
  // (`weight` is the former blend of the rating over the whole score, no longer used.)
  managerKpi: {
    weight: 50,
    managementShare: 60,
    ratingWeight: 30,
    teamWeights: { on_time: 25, quality: 20, utilization: 15, balance: 10, team_kpi: 20, review_speed: 10 },
    criteria: [
      { key: "leadership", name: { ar: "قيادة الفريق ومتابعته", en: "Team leadership & follow-up" } },
      { key: "planning", name: { ar: "التخطيط وتوزيع المهام", en: "Planning & task distribution" } },
      { key: "review", name: { ar: "جودة المراجعة والتدقيق", en: "Review & quality control" } },
      { key: "communication", name: { ar: "التواصل مع الإدارة والعملاء", en: "Communication with management & clients" } },
      { key: "problems", name: { ar: "حل المشكلات واتخاذ القرار", en: "Problem solving & decisions" } },
      { key: "development", name: { ar: "تطوير الفريق وتدريبه", en: "Developing & training the team" } },
    ],
  },
  kpi: {
    // Each saved version applies from its month onward; closed months keep theirs.
    versions: [],
  },
  finance: {
    expenseCategories: [
      { key: "office", name: { ar: "مصاريف مكتب", en: "Office expenses" } },
      { key: "rent", name: { ar: "إيجار", en: "Rent" } },
      { key: "internet", name: { ar: "إنترنت / ستارلينك", en: "Internet / Starlink" } },
      { key: "software", name: { ar: "برامج وتراخيص", en: "Software & licences" } },
      { key: "equipment", name: { ar: "معدات", en: "Equipment" } },
      { key: "materials", name: { ar: "مواد", en: "Materials" } },
      { key: "transport", name: { ar: "نقل وتشغيل", en: "Transport" } },
      { key: "external", name: { ar: "خدمات خارجية", en: "External services" } },
      { key: "other", name: { ar: "أخرى", en: "Other" } },
    ],
    // How each month's salaries + operating costs are shared between projects:
    // "hours" = by work hours on each project (the Excel default), "equal" = equally
    // between the projects running that month.
    allocation: "hours",
  },
  pricing: {
    // Hourly cost: "auto" = average monthly costs (salaries + operating) of the last
    // `autoMonths` months ÷ available team hours; "manual" = manualHourlyCost.
    hourlyCostMode: "auto",
    manualHourlyCost: 4.26,
    autoMonths: 3,
    // Example hours per service — edit to match real experience.
    services: [
      { key: "exterior", name: { ar: "تصميم خارجي", en: "Exterior design" }, designHours: 40, techHours: 10, adminHours: 5 },
      { key: "interior", name: { ar: "تصميم داخلي (لكل فراغ)", en: "Interior design (per space)" }, designHours: 24, techHours: 6, adminHours: 2 },
      { key: "furniture", name: { ar: "تصميم أثاث", en: "Furniture design" }, designHours: 16, techHours: 4, adminHours: 1 },
      { key: "shop", name: { ar: "مخططات تنفيذية (لكل مخطط)", en: "Shop drawings (per drawing)" }, designHours: 0, techHours: 6, adminHours: 0.5 },
      { key: "asbuilt", name: { ar: "مخططات الوضع القائم", en: "As-built drawings" }, designHours: 0, techHours: 20, adminHours: 2 },
      { key: "supervision", name: { ar: "إشراف على الموقع (شهرياً)", en: "Site supervision (per month)" }, designHours: 0, techHours: 30, adminHours: 10 },
    ],
    // From the Excel Setup_Data.
    sizes: [
      { key: "small", name: { ar: "صغير", en: "Small" }, margin: 30 },
      { key: "medium", name: { ar: "متوسط", en: "Medium" }, margin: 40 },
      { key: "large", name: { ar: "كبير", en: "Large" }, margin: 50 },
      { key: "urgent", name: { ar: "مستعجل", en: "Urgent" }, margin: 60 },
    ],
    markets: [
      { key: "saudi", name: { ar: "السعودية", en: "Saudi Arabia" }, factor: 1.2 },
      { key: "syria", name: { ar: "سوريا", en: "Syria" }, factor: 0.8 },
    ],
    complexity: [
      { key: "simple", name: { ar: "بسيط", en: "Simple" }, factor: 0.9 },
      { key: "medium", name: { ar: "متوسط", en: "Medium" }, factor: 1 },
      { key: "high", name: { ar: "مرتفع", en: "High" }, factor: 1.25 },
      { key: "luxury", name: { ar: "فاخر", en: "Luxury" }, factor: 1.5 },
    ],
    clientTypes: [
      { key: "new", name: { ar: "عميل جديد", en: "New client" }, factor: 0.9 },
      { key: "returning", name: { ar: "عميل دائم", en: "Returning client" }, factor: 0.95 },
      { key: "investor", name: { ar: "مستثمر", en: "Investor" }, factor: 1 },
    ],
  },
};

export const SETTINGS_KEYS = Object.keys(SETTINGS_DEFAULTS);

export const RATING_KINDS = ["neutral", "excellent", "error", "contribution"];
export const RATING_SKILLS = ["", "design", "functional", "shop_drawings", "autocad", "max", "render", "project", "management"];
