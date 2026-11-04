import { canWorkIn, effectiveAccess, pageForPath, PERMISSION_KEYS, RESTRICTED_PAGES, workDepartments } from "../lib/permissions.js";

let fails = 0;
const ok = (name, c, x = "") => { console.log(`${c ? "PASS" : "FAIL"} ${name} ${c ? "" : x}`); if (!c) fails++; };

const staff = { key: "staff", permissions: ["projects.view", "tasks.assign"], scope: "department", limited: false, pages: [] };

// Role only.
let a = effectiveAccess(staff, {});
ok("role permissions", a.permissions.length === 2 && a.scope === "department" && a.pages === null);

// Grant / deny / scope.
a = effectiveAccess(staff, { grant: ["finance.view", "nope"], deny: ["tasks.assign"], scope: "all" });
ok("grant adds, unknown ignored", a.permissions.includes("finance.view") && !a.permissions.includes("nope"));
ok("deny removes", !a.permissions.includes("tasks.assign"));
ok("scope override", a.scope === "all");

// Hidden pages -> explicit page list without them (always pages stay).
a = effectiveAccess(staff, { hiddenPages: ["finance", "profile"] });
ok("hidden page removed", Array.isArray(a.pages) && !a.pages.includes("finance") && a.pages.includes("tasks"));
ok("profile always", a.pages.includes("profile") && a.pages.includes("overview"));

// Role page list.
a = effectiveAccess({ ...staff, pages: ["tasks"] }, {});
ok("role page list", a.pages.includes("tasks") && !a.pages.includes("projects") && a.pages.includes("notifications"));

// Restricted role: never beyond RESTRICTED_PAGES.
const gm = { key: "gm", permissions: ["projects.intake"], scope: "self", limited: true, pages: ["intake", "finance"] };
a = effectiveAccess(gm, {});
ok("restricted", a.limited && a.pages.every((p) => [...RESTRICTED_PAGES, "overview"].includes(p)) && !a.pages.includes("finance"));
a = effectiveAccess({ ...gm, permissions: ["payroll.view", "projects.intake", "intake.finance"] }, { grant: ["finance.view"] });
ok("restricted ignores other permissions", a.permissions.length === 2 && !a.permissions.includes("payroll.view") && !a.permissions.includes("finance.view"));
a = effectiveAccess({ ...gm, pages: [] }, {});
ok("restricted default pages", RESTRICTED_PAGES.every((p) => a.pages.includes(p)));
a = effectiveAccess({ ...gm, limited: false, pages: [] }, {});
ok("GM unrestricted by CEO", !a.limited && a.pages === null);

// Top roles ignore everything.
a = effectiveAccess({ key: "ceo", permissions: [], scope: "self" }, { deny: ["roles.manage"], hiddenPages: ["roles"] });
ok("CEO keeps all", a.permissions.length === PERMISSION_KEYS.length && a.scope === "all" && a.pages === null);

// Paths.
ok("path root", pageForPath("/dashboard") === "overview");
ok("path nested", pageForPath("/dashboard/projects/abc") === "projects");
ok("path longest", pageForPath("/dashboard/task-log") === "taskLog");
ok("path unknown", pageForPath("/dashboard/xyz") === "overview");

// Tasks from other departments.
const A = "a".repeat(24), B = "b".repeat(24), C = "c".repeat(24);
let w = workDepartments({ crossDepartment: false }, { department: A });
ok("own department only", canWorkIn(w, A) && !canWorkIn(w, B));
w = workDepartments({ crossDepartment: false }, { department: A, managedDepartments: [C], access: { workDepartments: [B] } });
ok("opened + managed", canWorkIn(w, B) && canWorkIn(w, C) && !canWorkIn(w, "d".repeat(24)));
w = workDepartments({ crossDepartment: true }, { department: A });
ok("role any department", w === "all" && canWorkIn(w, B));
w = workDepartments({ crossDepartment: true }, { department: A, access: { crossDepartment: false } });
ok("person override no", w !== "all" && !canWorkIn(w, B));
w = workDepartments({ crossDepartment: false }, { department: A, access: { crossDepartment: true } });
ok("person override yes", w === "all");
ok("no department", !canWorkIn(workDepartments(null, {}), null));

if (fails) { console.log(`${fails} failed`); process.exit(1); }
console.log("access: all passed");
