"use client";

// Talks to the office file gateway (tools/octo-file-gateway) straight from the browser.
// `getSession(force)` gives { url, token, … } (useFileSession), renewing the token when
// asked or when it's about to run out.

export class GatewayError extends Error {
  constructor(code, status = 0, data = {}) {
    super(code);
    this.status = status;
    this.data = data;
  }
}

// Parts small enough to retry cheaply, big enough to keep a fast line busy.
const CHUNK = 16 * 1024 * 1024;
const RETRIES = 4;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function xhrPut(url, token, body, { onProgress, signal }) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded);
    xhr.onload = () => {
      let data = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {}
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new GatewayError(data.error || "server_error", xhr.status, data));
    };
    xhr.onerror = () => reject(new GatewayError("gateway_offline"));
    xhr.onabort = () => reject(new DOMException("aborted", "AbortError"));
    if (signal) {
      if (signal.aborted) return xhr.abort();
      signal.addEventListener("abort", () => xhr.abort(), { once: true });
    }
    xhr.send(body);
  });
}

export function createGateway(getSession) {
  async function request(method, path, params, { signal, retried = false } = {}) {
    const s = await getSession();
    let res;
    try {
      res = await fetch(`${s.url}${path}?${new URLSearchParams(params)}`, { method, signal, headers: { Authorization: `Bearer ${s.token}` }, cache: "no-store" });
    } catch (err) {
      if (err?.name === "AbortError") throw err;
      throw new GatewayError("gateway_offline");
    }
    let data = {};
    try {
      data = await res.json();
    } catch {}
    // A token that ran out while the page was open: a fresh one, once.
    if (res.status === 401 && !retried) {
      await getSession(true);
      return request(method, path, params, { signal, retried: true });
    }
    if (!res.ok) throw new GatewayError(data.error || "server_error", res.status, data);
    return data;
  }

  const linkTo = async (path, params) => {
    const s = await getSession();
    return `${s.url}${path}?${new URLSearchParams({ ...params, t: s.token })}`;
  };

  return {
    info: () => getSession().then((s) => fetch(`${s.url}/v1/info`, { cache: "no-store" }).then((r) => r.json())),
    list: (vol, path, opts) => request("GET", "/v1/list", { vol, path }, opts),
    stat: (vol, path) => request("GET", "/v1/stat", { vol, path }),
    mkdir: (vol, path, name) => request("POST", "/v1/mkdir", { vol, path, name }),
    rename: (vol, path, name) => request("POST", "/v1/rename", { vol, path, name }),
    remove: (vol, path) => request("POST", "/v1/delete", { vol, path }),
    fileUrl: (vol, path, { inline = false } = {}) => linkTo("/v1/download", { vol, path, ...(inline ? { inline: "1" } : {}) }),
    zipUrl: (vol, path) => linkTo("/v1/zip", { vol, path }),

    // In parts, each retried on its own: a dropped connection resumes where it stopped.
    // onProgress(0–100). Resolves with the new file ({ vol, path, name, size, … }).
    async upload(vol, dir, file, { name = file.name, onProgress, signal } = {}) {
      const started = await request("POST", "/v1/upload/start", { vol, path: dir, name, size: String(file.size) }, { signal });
      const chunk = Math.min(CHUNK, started.chunk || CHUNK);
      let offset = 0;
      try {
        while (offset < file.size) {
          const end = Math.min(file.size, offset + chunk);
          for (let attempt = 0; ; attempt += 1) {
            try {
              const s = await getSession(attempt > 0);
              const url = `${s.url}/v1/upload/chunk?${new URLSearchParams({ id: started.id, offset: String(offset) })}`;
              const res = await xhrPut(url, s.token, file.slice(offset, end), {
                signal,
                onProgress: (loaded) => onProgress?.(Math.floor(((offset + loaded) / Math.max(1, file.size)) * 100)),
              });
              offset = res.received;
              break;
            } catch (err) {
              if (err?.name === "AbortError") throw err;
              // The gateway has a different part than we thought: go on from there.
              if (err.status === 409 && Number.isFinite(err.data?.received)) {
                offset = err.data.received;
                break;
              }
              if (attempt >= RETRIES || (err.status >= 400 && err.status < 500 && err.status !== 401)) throw err;
              await wait(1000 * 2 ** attempt);
            }
          }
          onProgress?.(Math.floor((offset / Math.max(1, file.size)) * 100));
        }
        const done = await request("POST", "/v1/upload/finish", { id: started.id });
        onProgress?.(100);
        return done;
      } catch (err) {
        request("POST", "/v1/upload/cancel", { id: started.id }).catch(() => {});
        throw err;
      }
    },
  };
}

// Starts a download without leaving the page (the gateway sends it as an attachment).
export function downloadInBackground(url) {
  const frame = document.createElement("iframe");
  frame.style.display = "none";
  frame.src = url;
  document.body.appendChild(frame);
  setTimeout(() => frame.remove(), 120000);
}

// Files dropped on the page, folders included: [{ file, rel: "Folder/sub/a.dwg" }].
export async function droppedFiles(dataTransfer) {
  const items = [...(dataTransfer.items || [])].map((i) => i.webkitGetAsEntry?.()).filter(Boolean);
  if (!items.length) return [...(dataTransfer.files || [])].map((file) => ({ file, rel: file.name }));
  const out = [];
  const readAll = (reader) =>
    new Promise((resolve) => {
      const all = [];
      const next = () =>
        reader.readEntries(
          (batch) => {
            if (!batch.length) return resolve(all);
            all.push(...batch);
            next();
          },
          () => resolve(all)
        );
      next();
    });
  async function walk(entry, prefix) {
    if (entry.isFile) {
      const file = await new Promise((resolve, reject) => entry.file(resolve, reject)).catch(() => null);
      if (file) out.push({ file, rel: `${prefix}${file.name}` });
    } else if (entry.isDirectory) {
      for (const child of await readAll(entry.createReader())) await walk(child, `${prefix}${entry.name}/`);
    }
  }
  for (const entry of items) await walk(entry, "");
  return out;
}
