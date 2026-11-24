// Can a user open a dashboard page? One answer for the sidebar, the page guard and every
// link the server hands out (the overview's "needs you", notifications…), so a link
// never leads to "no access".
import { pageForPath, RESTRICTED_PAGES } from "@/lib/permissions";

// Pages the CEO took away on the Roles page: the role's page list (user.pages, with the
// person's own hidden pages), and a restricted account (the GM by default) never gets
// more than RESTRICTED_PAGES.
export function pageAllowed(user, key) {
  if (!key) return true;
  if (user.pages && !user.pages.includes(key)) return false;
  return !user.limited || RESTRICTED_PAGES.includes(key);
}

const has = (user, p) => (user?.permissions || []).includes(p);

// What each page itself demands (app/dashboard/<page>/page.js). Pages not listed only
// need a staff account.
const PAGE_NEEDS = {
  hr: (u) => has(u, "attendance.view") || has(u, "recruitment.manage"),
  finance: (u) => has(u, "finance.view") || has(u, "sales.manage"),
  staff: (u) => has(u, "users.view"),
  office: (u) => has(u, "office.manage"),
  system: (u) => has(u, "system.health") || has(u, "audit.view") || has(u, "roles.manage") || u.role === "ceo" || u.role === "coder",
  analytics: (u) => has(u, "analytics.view"),
  reviews: (u) => has(u, "tasks.review"),
};

// Can `user` open `href` (a dashboard path, query string allowed)?
export function canOpenPath(user, href) {
  if (!user?.isStaff) return false;
  const key = pageForPath(String(href).split(/[?#]/)[0]);
  if (!pageAllowed(user, key)) return false;
  return !PAGE_NEEDS[key] || PAGE_NEEDS[key](user);
}
