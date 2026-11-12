import {
  canSee,
  cleanName,
  cleanPath,
  cleanRefs,
  compactGrants,
  parseServerPath,
  projectFolder,
  projectStageFolder,
  rightsAt,
  safeFolderName,
  taskFolder,
  toWindowsPath,
} from "../lib/fileServerPaths.js";

let fails = 0;
const ok = (name, c, x = "") => {
  console.log(`${c ? "PASS" : "FAIL"} ${name} ${c ? "" : x}`);
  if (!c) fails++;
};

const volumes = [{ key: "ttd", unc: "\\\\192.168.1.100\\files submitted (ttd)", drives: ["A", "Z", "W"] }];
const fs = { volumes, departmentFolders: [{ department: "d1", path: "/01 - قسم التصميم الداخلي" }], projectsRoot: "/" };

// ---- names and paths (the gateway applies the same rules) ----
ok("plain name", cleanName("R-00") === "R-00");
ok("arabic name", cleanName("002 - فيلا أبو جمال") === "002 - فيلا أبو جمال");
for (const bad of ["", ".", "..", "a/b", "a\\b", "a:b", "a*b", "con", "NUL.txt", "trailing.", "trailing ", " leading", ".octo-part-1"]) {
  ok(`bad name refused: ${JSON.stringify(bad)}`, cleanName(bad) === null);
}
ok("path normalized", cleanPath("\\01 - x\\R-00\\") === "/01 - x/R-00");
ok("root", cleanPath("/") === "/" && cleanPath("") === "/");
ok("traversal refused", cleanPath("/a/../b") === null && cleanPath("../x") === null);
ok("safe folder name", safeFolderName('P-12 - Villa: "A/B"') === "P-12 - Villa- -A-B-" && safeFolderName("...", "x") === "x");

// ---- old Excel / Access delivery links (real formats from the legacy data) ----
const cases = [
  ["\\\\192.168.1.100\\files submitted (ttd)\\02 - قسم المطورين العقارين - فيلات\\021 - حلول العقارية\\05 - ShopDrawings\\R-00", "/02 - قسم المطورين العقارين - فيلات/021 - حلول العقارية/05 - ShopDrawings/R-00"],
  ["Z:\\01 - قسم التصميم الداخلي\\002 - فيلا أبو جمال\\Shop-Drawings\\XREF", "/01 - قسم التصميم الداخلي/002 - فيلا أبو جمال/Shop-Drawings/XREF"],
  ["A:\\01 - قسم التصميم الداخلي\\001 - فيلا وسيم الحربي\\01 - BF\\R-00", "/01 - قسم التصميم الداخلي/001 - فيلا وسيم الحربي/01 - BF/R-00"],
  ["#file:///W:\\02%20-%20Villas\\R-01#", "/02 - Villas/R-01"],
  ["#file:///\\\\192.168.1.100\\files%20submitted%20(ttd)\\03%20-%20Tech\\R-00#", "/03 - Tech/R-00"],
  ["file:///\\\\192.168.1.100\\files submitted (ttd)\\x", "/x"],
  ['"Z:\\01 - قسم\\R-00"', "/01 - قسم/R-00"],
  ["\\\\192.168.1.100\\FILES SUBMITTED (TTD)\\Case", "/Case"],
];
for (const [text, path] of cases) {
  const r = parseServerPath(text, volumes);
  ok(`legacy: ${text.slice(0, 40)}`, r?.vol === "ttd" && r.path === path, JSON.stringify(r));
}
for (const text of ["C:\\Users\\OCTO\\Desktop\\x", "X:\\other", "https://drive.google.com/x", "-", "N\\A", "762 - أوس مسعود", "\\\\192.168.1.100\\other share\\x"]) {
  ok(`not ours: ${text}`, parseServerPath(text, volumes) === null);
}
ok("windows path", toWindowsPath({ vol: "ttd", path: "/01 - x/R-00" }, volumes) === "\\\\192.168.1.100\\files submitted (ttd)\\01 - x\\R-00");

// ---- automatic folders (the office's layout: department → project → stage → R-NN) ----
const project = { department: "d1", code: "003", name: { ar: "فيلا أبو جمال", en: "Abu Jamal villa" }, stages: [{ key: "cad", name: { en: "CAD" } }, { key: "fr", name: { en: "Final Render", ar: "رندر" } }] };
ok("project folder", projectFolder(project, fs).path === "/01 - قسم التصميم الداخلي/003 - فيلا أبو جمال");
ok("chosen project folder wins", projectFolder({ ...project, serverFolder: { vol: "ttd", path: "/X/Y" } }, fs).path === "/X/Y");
ok("other department → projects root", projectFolder({ ...project, department: "d2" }, fs).path === "/003 - فيلا أبو جمال");
ok("task folder", taskFolder({ number: 51, revision: 1, stage: "fr" }, project, fs).path === "/01 - قسم التصميم الداخلي/003 - فيلا أبو جمال/02 - Final Render/R-01");
ok("task without stage", taskFolder({ number: 51, revision: 0, stage: "" }, project, fs).path.endsWith("/#51 R-00"));
ok("task without project", taskFolder({ number: 7, department: "d1" }, null, fs).path === "/01 - قسم التصميم الداخلي/Tasks/#7");
ok("project stage folder", projectStageFolder(project, "cad", fs).path.endsWith("/01 - CAD") && projectStageFolder(project, "", fs).path.endsWith("/00 - General"));

// ---- rights ----
const grants = [["ttd", "/01 - x", "rw"], ["ttd", "/01 - x/P/R-00", "r"], ["ttd", "/HR/a.pdf", "r"]];
ok("inside grant", [...rightsAt(grants, "ttd", "/01 - x/P")].sort().join("") === "rw");
ok("prefix is not a folder match", rightsAt(grants, "ttd", "/01 - xy").size === 0);
ok("file grant", rightsAt(grants, "ttd", "/HR/a.pdf").has("r") && rightsAt(grants, "ttd", "/HR/b.pdf").size === 0);
ok("ancestors visible, not readable", canSee(grants, "ttd", "/") && canSee(grants, "ttd", "/HR") && !rightsAt(grants, "ttd", "/HR").has("r"));
ok("other volume", !canSee(grants, "other", "/"));
const compact = compactGrants([["ttd", "/", "rw"], ["ttd", "/a/b", "r"], ["ttd", "/a/b", "w"], ["ttd", "/a", "m"], ["x", "/y", "r"]]);
ok("compact drops covered grants, keeps extra rights", JSON.stringify(compact) === JSON.stringify([["ttd", "/", "rw"], ["ttd", "/a", "m"], ["x", "/y", "r"]]), JSON.stringify(compact));

// ---- refs ----
const refs = cleanRefs([{ vol: "ttd", path: "\\a\\b.dwg", size: "12" }, { vol: "ttd", path: "/a/b.dwg" }, { vol: "ttd", path: "/" }, { vol: "../x", path: "/a" }, { vol: "ttd", path: "/a/../b" }, null]);
ok("refs cleaned, deduped, invalid dropped", refs.length === 1 && refs[0].path === "/a/b.dwg" && refs[0].name === "b.dwg" && refs[0].size === 12, JSON.stringify(refs));

if (fails) {
  console.log(`\n${fails} file-server test(s) failed`);
  process.exit(1);
}
console.log("\nfile-server: all passed");
