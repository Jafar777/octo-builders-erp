import Setting from "@/models/Setting";
import { RATING_KINDS, RATING_SKILLS, SETTINGS_DEFAULTS, SETTINGS_KEYS } from "@/lib/settingsDefaults";
import { bilingual } from "@/lib/apiUtils";
import { toMinutes } from "@/lib/workDays";
import { DEFAULT_TEAM_WEIGHTS, TEAM_METRICS } from "@/lib/kpi/hybrid";
import { cleanPath } from "@/lib/fileServerPaths";

export async function getSettings() {
  const docs = await Setting.find({ key: { $in: SETTINGS_KEYS } }).lean();
  const result = {};
  for (const key of SETTINGS_KEYS) {
    const doc = docs.find((d) => d.key === key);
    result[key] = { ...SETTINGS_DEFAULTS[key], ...(doc?.value || {}) };
  }
  // Saved before each weekday had its own hours: every day uses the saved standard day.
  const wh = result.workHours;
  if (!Array.isArray(wh.days) || wh.days.length !== 7 || !docs.find((d) => d.key === "workHours")?.value?.days) {
    wh.days = Array.from({ length: 7 }, () => ({ start: wh.workStart, end: wh.workEnd, hours: wh.dailyHours }));
  }
  return result;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function num(value, fallback, min, max) {
  const n = Number(value);
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
}

// Each settings group is validated into a known shape; unknown fields are dropped.
export const SETTINGS_VALIDATORS = {
  calendar(v) {
    const d = SETTINGS_DEFAULTS.calendar;
    const weekend = [...new Set((Array.isArray(v.weekend) ? v.weekend : d.weekend).map(Number))].filter(
      (n) => Number.isInteger(n) && n >= 0 && n <= 6
    );
    const holidays = (Array.isArray(v.holidays) ? v.holidays : [])
      .filter((h) => DATE.test(h?.date || ""))
      .map((h) => ({ date: h.date, name: bilingual(h.name, 80) }))
      .sort((a, b) => a.date.localeCompare(b.date));
    const start = DATE.test(v.ramadan?.start || "") ? v.ramadan.start : "";
    const end = DATE.test(v.ramadan?.end || "") ? v.ramadan.end : "";
    if (start && end && end < start) return { error: "invalid_ramadan_range" };
    return { value: { weekend, holidays, ramadan: { start, end } } };
  },
  workHours(v) {
    const d = SETTINGS_DEFAULTS.workHours;
    const standard = {
      start: TIME.test(v.workStart || "") ? v.workStart : d.workStart,
      end: TIME.test(v.workEnd || "") ? v.workEnd : d.workEnd,
      hours: num(v.dailyHours, d.dailyHours, 1, 24),
    };
    // One day's times: the hours that count can't exceed the time between start and end.
    const day = (x, fallback) => {
      const start = TIME.test(x?.start || "") ? x.start : fallback.start;
      const end = TIME.test(x?.end || "") ? x.end : fallback.end;
      const span = (toMinutes(end) - toMinutes(start)) / 60;
      const hours = x?.hours === undefined || x?.hours === "" ? Math.min(fallback.hours, span) : Number(x.hours);
      if (span <= 0 || !Number.isFinite(hours) || hours < 0.5 || hours > span + 1e-9) return null;
      return { start, end, hours: Math.round(hours * 100) / 100 };
    };
    const days = Array.from({ length: 7 }, (_, wd) => day(v.days?.[wd], standard));
    if (days.some((x) => !x)) return { error: "invalid_day_hours" };
    const special = [];
    for (const s of Array.isArray(v.special) ? v.special : []) {
      if (!DATE.test(s?.date || "")) continue;
      const times = day(s, standard);
      if (!times) return { error: "invalid_day_hours" };
      special.push({ date: s.date, ...times, name: bilingual(s.name, 80) });
    }
    if (new Set(special.map((s) => s.date)).size !== special.length) return { error: "duplicate_special_day" };
    special.sort((a, b) => a.date.localeCompare(b.date));
    // The standard day follows the most common weekday hours (shown in employee files).
    const common = Object.values(
      days.reduce((acc, x) => {
        const k = `${x.start}-${x.end}-${x.hours}`;
        acc[k] = { ...x, n: (acc[k]?.n || 0) + 1 };
        return acc;
      }, {})
    ).sort((a, b) => b.n - a.n)[0];
    return {
      value: {
        workStart: common.start,
        workEnd: common.end,
        dailyHours: common.hours,
        days,
        special,
        ramadanHours: num(v.ramadanHours, d.ramadanHours, 1, 24),
        minHours: num(v.minHours, d.minHours, 0, 24),
        graceMinutes: num(v.graceMinutes, d.graceMinutes, 0, 240),
        overtimeMultiplier: num(v.overtimeMultiplier, d.overtimeMultiplier, 1, 5),
        monthlyRequiredHours: num(v.monthlyRequiredHours, d.monthlyRequiredHours, 1, 400),
      },
    };
  },
  currencies(v) {
    const list = (Array.isArray(v.list) ? v.list : [])
      .map((c) => ({
        code: String(c?.code || "").trim().toUpperCase().slice(0, 5),
        name: bilingual(c?.name, 60),
        rate: num(c?.rate, 0, 0.000001, 1e9),
      }))
      .filter((c) => /^[A-Z]{3,5}$/.test(c.code) && c.rate > 0);
    const codes = list.map((c) => c.code);
    if (new Set(codes).size !== codes.length) return { error: "duplicate_currency" };
    const base = codes.includes(v.base) ? v.base : codes[0];
    if (!base) return { error: "currency_required" };
    // The base currency is always worth exactly 1.
    return { value: { base, list: list.map((c) => (c.code === base ? { ...c, rate: 1 } : c)) } };
  },
  hr(v) {
    const d = SETTINGS_DEFAULTS.hr;
    const bool = (x, def) => (typeof x === "boolean" ? x : def);
    const tz = String(v.timezone || d.timezone);
    try {
      new Intl.DateTimeFormat("en", { timeZone: tz });
    } catch {
      return { error: "invalid_timezone" };
    }
    const warningRules = (Array.isArray(v.warningRules) ? v.warningRules : [])
      .map((r) => ({ count: Math.round(num(r?.count, 0, 1, 31)), percent: num(r?.percent, 0, 0, 100) }))
      .filter((r) => r.count > 0)
      .sort((a, b) => a.count - b.count);
    const bonusSplit = (Array.isArray(v.bonusSplit) ? v.bonusSplit : d.bonusSplit).map((x) => num(x, 0, 0, 100)).slice(0, 10);
    if (bonusSplit.reduce((a, b) => a + b, 0) > 100) return { error: "bonus_split_over_100" };
    return {
      value: {
        timezone: tz,
        lateIsWarning: bool(v.lateIsWarning, d.lateIsWarning),
        shortageIsWarning: bool(v.shortageIsWarning, d.shortageIsWarning),
        absenceIsWarning: bool(v.absenceIsWarning, d.absenceIsWarning),
        warningRules,
        deductMissingHours: bool(v.deductMissingHours, d.deductMissingHours),
        payOvertime: bool(v.payOvertime, d.payOvertime),
        bonusSplit,
        salaryCode: bool(v.salaryCode, d.salaryCode),
        webCheckIn: bool(v.webCheckIn, d.webCheckIn),
      },
    };
  },
  finance(v) {
    const key = (k) => String(k || "").trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_").slice(0, 40);
    const expenseCategories = (Array.isArray(v.expenseCategories) ? v.expenseCategories : [])
      .map((c) => ({ key: key(c?.key || c?.name?.en), name: bilingual(c?.name, 60) }))
      .filter((c) => c.key);
    if (!expenseCategories.length) return { error: "categories_required" };
    if (new Set(expenseCategories.map((c) => c.key)).size !== expenseCategories.length) return { error: "duplicate_key" };
    if (expenseCategories.some((c) => !c.name.ar || !c.name.en)) return { error: "bilingual_required" };
    return { value: { expenseCategories, allocation: v.allocation === "equal" ? "equal" : "hours" } };
  },
  pricing(v) {
    const d = SETTINGS_DEFAULTS.pricing;
    const key = (k) => String(k || "").trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_").slice(0, 40);
    const list = (items, extra) => {
      const out = (Array.isArray(items) ? items : [])
        .map((x) => ({ key: key(x?.key || x?.name?.en), name: bilingual(x?.name, 80), ...extra(x) }))
        .filter((x) => x.key);
      return out;
    };
    const value = {
      hourlyCostMode: v.hourlyCostMode === "manual" ? "manual" : "auto",
      manualHourlyCost: num(v.manualHourlyCost, d.manualHourlyCost, 0, 100000),
      autoMonths: Math.round(num(v.autoMonths, d.autoMonths, 1, 24)),
      services: list(v.services, (x) => ({
        designHours: num(x?.designHours, 0, 0, 100000),
        techHours: num(x?.techHours, 0, 0, 100000),
        adminHours: num(x?.adminHours, 0, 0, 100000),
      })),
      sizes: list(v.sizes, (x) => ({ margin: num(x?.margin, 0, 0, 1000) })),
      markets: list(v.markets, (x) => ({ factor: num(x?.factor, 1, 0.01, 100) })),
      complexity: list(v.complexity, (x) => ({ factor: num(x?.factor, 1, 0.01, 100) })),
      clientTypes: list(v.clientTypes, (x) => ({ factor: num(x?.factor, 1, 0.01, 100) })),
    };
    for (const k of ["services", "sizes", "markets", "complexity", "clientTypes"]) {
      if (!value[k].length) return { error: "pricing_list_empty" };
      if (new Set(value[k].map((x) => x.key)).size !== value[k].length) return { error: "duplicate_key" };
      if (value[k].some((x) => !x.name.ar || !x.name.en)) return { error: "bilingual_required" };
    }
    return { value };
  },
  tasks(v) {
    const key = (k) => String(k || "").trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_").slice(0, 40);
    const unique = (list) => new Set(list.map((i) => i.key)).size === list.length;

    const taskTypes = (Array.isArray(v.taskTypes) ? v.taskTypes : [])
      .map((t) => ({ key: key(t?.key), name: bilingual(t?.name, 60) }))
      .filter((t) => t.key);
    const ratingTags = (Array.isArray(v.ratingTags) ? v.ratingTags : [])
      .map((r) => ({
        key: key(r?.key),
        name: bilingual(r?.name, 80),
        kind: RATING_KINDS.includes(r?.kind) ? r.kind : "neutral",
        skill: RATING_SKILLS.includes(r?.skill) ? r.skill : "",
      }))
      .filter((r) => r.key);

    if (!taskTypes.length) return { error: "task_types_required" };
    if ([...taskTypes, ...ratingTags].some((i) => !i.name.ar || !i.name.en)) return { error: "bilingual_required" };
    if (!unique(taskTypes) || !unique(ratingTags)) return { error: "duplicate_key" };
    return { value: { taskTypes, ratingTags } };
  },
};

// Department-manager KPI: rating criteria and their share of the final score.
SETTINGS_VALIDATORS.managerKpi = (v) => {
  const key = (k) => String(k || "").trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_").slice(0, 40);
  const weight = Number(v.weight);
  if (!Number.isFinite(weight) || weight < 0 || weight > 100) return { error: "invalid_weight" };
  const criteria = (Array.isArray(v.criteria) ? v.criteria : []).map((c) => ({ key: key(c?.key), name: bilingual(c?.name, 80) })).filter((c) => c.key);
  if (!criteria.length) return { error: "criteria_required" };
  if (criteria.some((c) => !c.name.ar || !c.name.en)) return { error: "bilingual_required" };
  if (new Set(criteria.map((c) => c.key)).size !== criteria.length) return { error: "duplicate_key" };
  const pct = (x, fallback) => (x === undefined || x === null || x === "" ? fallback : Number(x));
  const managementShare = pct(v.managementShare, 60);
  const ratingWeight = pct(v.ratingWeight, 30);
  if (![managementShare, ratingWeight].every((n) => Number.isFinite(n) && n >= 0 && n <= 100)) return { error: "invalid_weight" };
  const teamWeights = {};
  for (const k of TEAM_METRICS) {
    const n = pct(v.teamWeights?.[k], DEFAULT_TEAM_WEIGHTS[k]);
    if (!Number.isFinite(n) || n < 0 || n > 100) return { error: "invalid_weight" };
    teamWeights[k] = n;
  }
  if (!Object.values(teamWeights).some((n) => n > 0)) return { error: "invalid_weight" };
  return { value: { weight, criteria, managementShare, ratingWeight, teamWeights } };
};

// The company file server (Files page → Connection).
SETTINGS_VALIDATORS.fileServer = (v) => {
  const url = String(v.url || "").trim().replace(/\/+$/, "");
  // The dashboard is https: the browser only talks to an https gateway (a plain http
  // address on the office network is blocked as mixed content), except on this computer.
  if (url && !/^https:\/\/[^\s/]+(:\d+)?(\/[^\s]*)?$/i.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(url)) return { error: "invalid_gateway_url" };
  const volumes = [];
  for (const x of Array.isArray(v.volumes) ? v.volumes : []) {
    const key = String(x?.key || "").trim();
    if (!key && !x?.unc) continue;
    if (!/^[a-z0-9_-]{1,32}$/i.test(key)) return { error: "invalid_volume_key" };
    const unc = String(x?.unc || "").trim().replace(/\//g, "\\").replace(/\\+$/, "").slice(0, 300);
    const drives = [...new Set((Array.isArray(x?.drives) ? x.drives : String(x?.drives || "").split(/[\s,;]+/)).map((d) => String(d).trim().replace(/:.*$/, "").toUpperCase()))].filter((d) => /^[A-Z]$/.test(d));
    volumes.push({ key, name: bilingual(x?.name, 80), unc, drives });
  }
  if (new Set(volumes.map((x) => x.key)).size !== volumes.length) return { error: "duplicate_key" };
  if (v.enabled && (!url || !volumes.length)) return { error: "file_server_incomplete" };
  const departmentFolders = [];
  for (const d of Array.isArray(v.departmentFolders) ? v.departmentFolders : []) {
    if (!/^[a-f0-9]{24}$/.test(String(d?.department || ""))) continue;
    if (!String(d?.path || "").trim()) continue;
    const path = cleanPath(String(d.path));
    if (!path) return { error: "invalid_server_path" };
    departmentFolders.push({ department: String(d.department), path });
  }
  const projectsRoot = cleanPath(String(v.projectsRoot || "/"));
  if (!projectsRoot) return { error: "invalid_server_path" };
  return {
    value: {
      enabled: Boolean(v.enabled),
      url,
      volumes,
      access: v.access === "department" ? "department" : "company",
      departmentFolders,
      projectsRoot,
      deliveryMode: v.deliveryMode === "server" ? "server" : "both",
    },
  };
};

export async function getTaskSettings() {
  return (await getSettings()).tasks;
}
