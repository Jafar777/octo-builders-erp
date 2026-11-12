import crypto from "crypto";
import { SignJWT } from "jose";
import { getSettings } from "@/lib/settings";
import { hasPermission } from "@/lib/currentUser";
import { cleanRefs, compactGrants, parseServerPath, rightsAt, taskFolder } from "@/lib/fileServerPaths";

export { compactGrants };
import Setting from "@/models/Setting";

// The company file server, seen from the ERP.
//
// The share itself stays in the office. A small gateway there (tools/octo-file-gateway)
// serves it over https, and the browser talks to the gateway directly: files never pass
// through this server (Vercel), and nothing in the office has to accept connections from
// it. What the gateway lets a browser do is decided here: it signs a short-lived token
// (HS256, the shared connection key) listing the folders and rights of that person,
// for the screen they're on. Rights: r = open / download, w = add (never replaces),
// m = rename / delete / replace (files.manage).

export const TOKEN_TTL_SECONDS = 30 * 60;
const KEY_SETTING = "fileServerKey";
const MAX_GRANTS = 300;

export async function getFileServer() {
  return (await getSettings()).fileServer;
}

// The connection key the gateway checks tokens with. FILE_SERVER_SECRET (.env) wins
// over the one made on the Files page.
export async function gatewaySecret() {
  if (process.env.FILE_SERVER_SECRET) return process.env.FILE_SERVER_SECRET;
  const doc = await Setting.findOne({ key: KEY_SETTING }).lean();
  return doc?.value?.secret || "";
}

export async function gatewayKeyInfo() {
  if (process.env.FILE_SERVER_SECRET) return { configured: true, fromEnv: true, createdAt: null };
  const doc = await Setting.findOne({ key: KEY_SETTING }).lean();
  return { configured: Boolean(doc?.value?.secret), fromEnv: false, createdAt: doc?.value?.createdAt || null };
}

// A new key: shown once, then only the gateway's config.json has it.
export async function newGatewaySecret() {
  const secret = `octofs_${crypto.randomBytes(32).toString("base64url")}`;
  await Setting.findOneAndUpdate({ key: KEY_SETTING }, { key: KEY_SETTING, value: { secret, createdAt: new Date() } }, { upsert: true });
  return secret;
}

export const fileServerReady = (fs, secret) => Boolean(fs?.enabled && fs.url && fs.volumes?.length && secret);

// What an employee may do on the Files page (and pick from anywhere in the dashboard).
export function browseGrants(user, fs) {
  if (!user?.isStaff || user.limited || !fs?.volumes?.length) return [];
  if (hasPermission(user, "files.manage")) return fs.volumes.map((v) => [v.key, "/", "rmw"]);
  if (fs.access !== "department") return fs.volumes.map((v) => [v.key, "/", "rw"]);
  const vol = fs.volumes[0].key;
  return (fs.departmentFolders || []).filter((d) => user.departments.includes(d.department)).map((d) => [vol, d.path, "rw"]);
}

// Read grants for refs kept on a record (a delivery, a message, a project file).
export function refGrants(refs) {
  return cleanRefs(refs, MAX_GRANTS).map((r) => [r.vol, r.path, "r"]);
}

// An old pasted path (\\192.168.1.100\… or Z:\…) as a read grant, if it's on our shares.
export function legacyGrant(text, fs) {
  const p = parseServerPath(text, fs?.volumes);
  return p ? [[p.vol, p.path, "r"]] : [];
}

// Refs someone attaches must be things they can open themselves: attaching opens them to
// everyone who sees the record, so it can't be a way round the folders' access.
export function refsAllowed(refs, grants) {
  return refs.every((r) => rightsAt(grants, r.vol, r.path).has("r"));
}

export async function signGatewayToken(user, grants, secret, ttl = TOKEN_TTL_SECONDS) {
  const expiresAt = new Date(Date.now() + ttl * 1000);
  const token = await new SignJWT({ nm: user.displayName || user.name || user.email || "", g: grants })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(user.id)
    .setIssuer("octo-erp")
    .setAudience("octo-files")
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(new TextEncoder().encode(secret));
  return { token, expiresAt };
}

// What the browser needs to show the shares (never the key).
export const publicVolumes = (fs) => (fs?.volumes || []).map((v) => ({ key: v.key, name: v.name, unc: v.unc, drives: v.drives }));

// ---------- deliveries ----------

const DELIVERY_PROJECT_FIELDS = { code: 1, name: 1, stages: 1, department: 1, serverFolder: 1 };

// The server files an employee hands in with a task: things they can open themselves,
// or anything in the task's own folder. → { refs } or { error }.
export async function cleanDelivery(user, task, raw) {
  const refs = cleanRefs(raw, 30);
  if (!refs.length) return { refs };
  const fs = await getFileServer();
  if (!fileServerReady(fs, await gatewaySecret())) return { error: "file_server_off" };
  const { default: WorkProject } = await import("@/models/WorkProject");
  const project = task.project ? await WorkProject.findById(task.project, DELIVERY_PROJECT_FIELDS).lean() : null;
  const folder = taskFolder(task, project, fs);
  const grants = [...browseGrants(user, fs), ...refGrants(task.deliveryFiles), ...(folder ? [[folder.vol, folder.path, "r"]] : [])];
  return refsAllowed(refs, grants) ? { refs } : { error: "file_not_allowed" };
}

// Only server deliveries are accepted ("server" mode, with the server connected).
export async function serverDeliveryRequired() {
  const fs = await getFileServer();
  return fs.deliveryMode === "server" && fileServerReady(fs, await gatewaySecret());
}
