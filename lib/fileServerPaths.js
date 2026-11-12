// Paths on the company file server (the office share, served by the file gateway in
// tools/octo-file-gateway). Shared by the browser and the server; no Node APIs here.
//
// A place on the server is { vol, path }: `vol` is a share the gateway serves (its key,
// e.g. "ttd") and `path` is "/"-separated from the share's root ("/" = the root itself).
// What a task / message / project file keeps is a "server ref":
//   { vol, path, name, dir, size }
// The gateway checks the same rules (octo_files.py clean_segment), so a path that passes
// here also passes there.

const BAD_CHARS = /[<>:"|?*\\/\u0000-\u001f]/;
const RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;
// The gateway's own files (unfinished uploads, the recycle folder) and Windows clutter.
export const HIDDEN_NAME = /^(\.octo-|~\$|desktop\.ini$|thumbs\.db$|\.ds_store$)/i;

// One folder / file name as Windows accepts it, or null.
export function cleanName(name) {
  const s = String(name ?? "");
  if (!s || s.length > 200 || s === "." || s === "..") return null;
  if (BAD_CHARS.test(s) || RESERVED.test(s) || /[. ]$/.test(s) || /^ /.test(s)) return null;
  if (/^\.octo-/i.test(s)) return null;
  return s;
}

// Free text (a project's name) made into a valid folder name.
export function safeFolderName(text, fallback = "folder") {
  const s = String(text ?? "")
    .replace(/[<>:"|?*\\/\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/, "")
    .slice(0, 120)
    .trim();
  return cleanName(s) || fallback;
}

// "/a/b" with every segment valid ("\" also accepted as separator), or null.
export function cleanPath(path) {
  if (typeof path !== "string" || path.length > 1500) return null;
  const parts = path.replace(/\\/g, "/").split("/").filter((p) => p !== "");
  for (const p of parts) if (cleanName(p) !== p) return null;
  return `/${parts.join("/")}`;
}

export function joinPath(dir, ...names) {
  const parts = [dir, ...names].join("/").split("/").filter(Boolean);
  return `/${parts.join("/")}`;
}

export const parentPath = (path) => {
  const parts = String(path || "/").split("/").filter(Boolean);
  parts.pop();
  return `/${parts.join("/")}`;
};

export const baseName = (path) => String(path || "").split("/").filter(Boolean).pop() || "";

// Is `path` the folder `prefix` or inside it?
export function isWithin(path, prefix) {
  if (prefix === "/") return true;
  return path === prefix || path.startsWith(`${prefix}/`);
}

// ---------- access ----------
// A grant is [vol, path, rights]: r = list / open / download, w = add files and folders
// (never replaces anything), m = rename / delete / replace. Tokens carry the grants.

export function rightsAt(grants, vol, path) {
  const out = new Set();
  for (const [v, p, r] of grants || []) if (v === vol && isWithin(path, p)) for (const c of r) out.add(c);
  return out;
}

// May the folder be opened at all: it's granted, or it leads to something granted.
export function canSee(grants, vol, path) {
  return (grants || []).some(([v, p]) => v === vol && (isWithin(path, p) || isWithin(p, path)));
}

// Fewer, broader grants: one inside another with no extra rights is dropped.
export function compactGrants(grants) {
  const merged = new Map();
  for (const [vol, path, rights] of grants) {
    if (!vol || !path) continue;
    const k = `${vol}\u0000${path}`;
    merged.set(k, [...new Set([...(merged.get(k) || ""), ...rights])].sort().join(""));
  }
  const list = [...merged].map(([k, r]) => {
    const [vol, path] = k.split("\u0000");
    return [vol, path, r];
  });
  return list
    .filter(([vol, path, r]) => !list.some(([v2, p2, r2]) => v2 === vol && p2 !== path && isWithin(path, p2) && [...r].every((c) => r2.includes(c))))
    .slice(0, 300); // a token stays small
}

// ---------- refs ----------

export function cleanRef(ref) {
  if (!ref || typeof ref !== "object") return null;
  const vol = String(ref.vol || "");
  const path = cleanPath(ref.path);
  if (!/^[a-z0-9_-]{1,32}$/i.test(vol) || !path || path === "/") return null;
  return {
    vol,
    path,
    name: String(ref.name || baseName(path)).slice(0, 200),
    dir: Boolean(ref.dir),
    size: Math.max(0, Number(ref.size) || 0),
  };
}

export function cleanRefs(list, max = 30) {
  const seen = new Set();
  const out = [];
  for (const r of Array.isArray(list) ? list : []) {
    const ref = cleanRef(r);
    if (!ref || seen.has(`${ref.vol}:${ref.path}`)) continue;
    seen.add(`${ref.vol}:${ref.path}`);
    out.push(ref);
    if (out.length >= max) break;
  }
  return out;
}

// ---------- Windows paths ----------

const volumeOf = (volumes, key) => (volumes || []).find((v) => v.key === key);

// "\\192.168.1.100\files submitted (ttd)\01 - …\R-00", for opening in File Explorer.
export function toWindowsPath(ref, volumes) {
  const v = volumeOf(volumes, ref?.vol);
  if (!v?.unc) return "";
  const rest = String(ref.path || "/").split("/").filter(Boolean).join("\\");
  return rest ? `${v.unc.replace(/\\+$/, "")}\\${rest}` : v.unc;
}

// A path typed or pasted as text (the old Excel / Access links): "\\server\share\…",
// a mapped drive ("Z:\…"), "file:///…", or the Access hyperlink form "#file:///…#".
// → { vol, path } on one of our shares, or null.
export function parseServerPath(text, volumes) {
  if (!text || !volumes?.length) return null;
  let s = String(text).trim().replace(/^"+|"+$/g, "");
  // Access hyperlinks: "display#address#subaddress".
  if (s.includes("#")) s = s.split("#").map((x) => x.trim()).find((x) => /^(file:|\\\\|[a-z]:[\\/])/i.test(x)) || s;
  s = s.replace(/^file:\/*/i, (m) => (/^file:\/{4,}/i.test(m) ? "\\\\" : ""));
  try {
    s = decodeURIComponent(s);
  } catch {}
  s = s.replace(/\//g, "\\");
  const lower = s.toLowerCase();
  for (const v of volumes) {
    const unc = String(v.unc || "").replace(/\\+$/, "");
    let rest = null;
    if (unc && (lower === unc.toLowerCase() || lower.startsWith(`${unc.toLowerCase()}\\`))) rest = s.slice(unc.length);
    const drive = /^([a-z]):(\\|$)/i.exec(s);
    if (rest === null && drive && (v.drives || []).map((d) => d.toUpperCase()).includes(drive[1].toUpperCase())) rest = s.slice(2);
    if (rest === null) continue;
    const path = cleanPath(rest);
    if (path) return { vol: v.key, path };
  }
  return null;
}

// ---------- where the ERP files things ----------

const pad2 = (n) => String(n).padStart(2, "0");

// The project's folder: the one chosen on the project, else "<department folder>\<code - name>".
export function projectFolder(project, fileServer) {
  if (project?.serverFolder?.path && project.serverFolder.vol) return { vol: project.serverFolder.vol, path: project.serverFolder.path };
  const vol = fileServer?.volumes?.[0]?.key;
  if (!vol || !project) return null;
  const dept = String(project.department?._id || project.department?.id || project.department || "");
  const base = (fileServer.departmentFolders || []).find((d) => d.department === dept)?.path || fileServer.projectsRoot || "/";
  const name = [project.code, project.name?.ar || project.name?.en].filter(Boolean).join(" - ");
  return { vol, path: joinPath(base, safeFolderName(name, "project")) };
}

// A task's delivery folder: "<project>\<NN - stage>\R-NN" (the way the office already
// files deliveries); tasks without a project: "<department>\Tasks\#number".
export function taskFolder(task, project, fileServer) {
  const rev = `R-${pad2(task?.revision || 0)}`;
  if (project) {
    const root = projectFolder(project, fileServer);
    if (!root) return null;
    const stages = project.stages || [];
    const i = stages.findIndex((s) => s.key === (task.stage?.key ?? task.stage));
    if (i < 0) return { vol: root.vol, path: joinPath(root.path, `#${task.number} ${rev}`) };
    const stage = stages[i];
    const stageName = safeFolderName(`${pad2(i + 1)} - ${stage.name?.en || stage.name?.ar || stage.key}`, pad2(i + 1));
    return { vol: root.vol, path: joinPath(root.path, stageName, rev) };
  }
  const vol = fileServer?.volumes?.[0]?.key;
  if (!vol) return null;
  const dept = String(task?.department?._id || task?.department || "");
  const base = (fileServer.departmentFolders || []).find((d) => d.department === dept)?.path || fileServer.projectsRoot || "/";
  return { vol, path: joinPath(base, "Tasks", `#${task.number}`) };
}

// A project file's stage folder (project files kept on the server).
export function projectStageFolder(project, stageKey, fileServer) {
  const root = projectFolder(project, fileServer);
  if (!root) return null;
  const stages = project.stages || [];
  const i = stages.findIndex((s) => s.key === stageKey);
  if (i < 0) return { vol: root.vol, path: joinPath(root.path, "00 - General") };
  const stage = stages[i];
  return { vol: root.vol, path: joinPath(root.path, safeFolderName(`${pad2(i + 1)} - ${stage.name?.en || stage.name?.ar || stage.key}`, pad2(i + 1))) };
}

export const formatBytes = (b) => {
  const n = Number(b) || 0;
  if (n >= 1073741824) return `${(n / 1073741824).toFixed(1)} GB`;
  if (n >= 1048576) return `${(n / 1048576).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
};
