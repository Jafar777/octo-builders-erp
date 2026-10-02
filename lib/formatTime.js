// Arabic with Western digits: the server (Node) and browsers disagree on the default
// digits for "ar", which breaks hydration; the dashboard uses 0-9 everywhere.
export const locale = (lang) => (lang === "ar" ? "ar-u-nu-latn" : "en");

// "5 minutes ago" / "منذ 5 دقائق"; older than a week → date.
export function formatRelative(date, lang) {
  if (!date) return "";
  const d = new Date(date);
  const seconds = Math.round((d.getTime() - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale(lang), { numeric: "auto" });
  const abs = Math.abs(seconds);
  if (abs < 60) return rtf.format(seconds, "second");
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(seconds / 3600), "hour");
  if (abs < 604800) return rtf.format(Math.round(seconds / 86400), "day");
  return formatDate(d, lang);
}

export function formatDate(date, lang) {
  if (!date) return "";
  return new Intl.DateTimeFormat(locale(lang), { dateStyle: "medium" }).format(new Date(date));
}

export function formatDateTime(date, lang) {
  if (!date) return "";
  return new Intl.DateTimeFormat(locale(lang), { dateStyle: "medium", timeStyle: "short" }).format(new Date(date));
}

export function formatClock(date, lang) {
  if (!date) return "";
  return new Intl.DateTimeFormat(locale(lang), { timeStyle: "short" }).format(new Date(date));
}
