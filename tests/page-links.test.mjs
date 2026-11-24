import { pagesLinkRegex } from "../lib/pageLinks.js";

let fails = 0;
const ok = (name, c) => { console.log(`${c ? "PASS" : "FAIL"} ${name}`); if (!c) fails++; };
const hits = (paths, exact, link) => new RegExp(pagesLinkRegex(paths, exact)).test(link);

// The Projects link: its page, the intake forms it also covers, and pages under them.
const projects = ["/dashboard/projects", "/dashboard/intake"];
ok("its own page", hits(projects, false, "/dashboard/projects"));
ok("with a query", hits(projects, false, "/dashboard/projects?project=abc"));
ok("a page under it", hits(projects, false, "/dashboard/projects/665f1c"));
ok("the intake forms it also covers", hits(projects, false, "/dashboard/intake?intake=1"));
ok("not a page that only starts the same", !hits(projects, false, "/dashboard/projects-archive"));
ok("not another page", !hits(projects, false, "/dashboard/tasks?task=1"));
// The overview (exact): only itself.
ok("overview: itself", hits(["/dashboard"], true, "/dashboard"));
ok("overview: not every page", !hits(["/dashboard"], true, "/dashboard/hr"));
ok("special characters are safe", hits(["/dashboard/a(b"], true, "/dashboard/a(b"));
ok("nothing usable → no filter", pagesLinkRegex(["/etc/passwd"]) === null);

if (fails) process.exit(1);
