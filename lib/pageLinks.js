// The notifications a sidebar link counts (its badge): those whose link opens one of the
// link's pages — its own address and the others it stays lit on (Projects also covers
// the intake forms) — or a page under them (/dashboard/projects/<id>). An `exact` link
// (the overview, /dashboard) counts only its own address.

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Mongo $regex for notification links, or null when `paths` isn't a usable list.
export function pagesLinkRegex(paths, exact = false) {
  const list = (Array.isArray(paths) ? paths : [paths]).filter((p) => typeof p === "string" && p.startsWith("/dashboard") && p.length <= 200).slice(0, 10);
  if (!list.length) return null;
  return `^(?:${list.map(escape).join("|")})(${exact ? "" : "/|"}[?#]|$)`;
}
