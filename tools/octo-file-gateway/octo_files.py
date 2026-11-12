"""
OCTO file gateway: serves the office file share to the ERP.

Runs on an always-on PC in the office that can open the share
(\\\\192.168.1.100\\files submitted (ttd)), or on the file server itself. Python 3.8+, no
packages to install.

The browser (the ERP dashboard) talks to this gateway directly: files go between the
employee's computer and the office, never through the website's server. Every request
carries a short-lived token the ERP signed with the shared connection key; the token
says who the person is and which folders they may open (r), add to (w) or tidy up
(m = rename / delete / replace). Without a valid token nothing is served.

    GET  /v1/info                                   is it up (no token)
    GET  /v1/list?vol=&path=                        a folder's contents
    GET  /v1/stat?vol=&path=                        one file / folder
    GET  /v1/download?vol=&path=[&inline=1]         a file (resumable: Range)
    GET  /v1/zip?vol=&path=                         a folder as one .zip
    POST /v1/mkdir?vol=&path=&name=                 new folder(s) ("a/b" makes both)
    POST /v1/upload/start?vol=&path=&name=&size=    → { id, chunk }
    PUT  /v1/upload/chunk?id=&offset=               the next part (body = bytes)
    POST /v1/upload/finish?id=                      → the new file (never overwrites
                                                    unless &overwrite=1 with right m)
    POST /v1/upload/cancel?id=
    POST /v1/rename?vol=&path=&name=                (m)
    POST /v1/delete?vol=&path=                      (m) moved to .octo-recycle, kept
                                                    for recycle_days

The token comes as "Authorization: Bearer …" or, for downloads opened in a new tab, ?t=.

Setup: see README.md in this folder.
"""

import base64
import hashlib
import hmac
import json
import mimetypes
import os
import shutil
import ssl
import sys
import threading
import time
import urllib.parse
import uuid
import zipfile
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

VERSION = "1"
HERE = os.path.dirname(os.path.abspath(__file__))
CONFIG_FILE = os.environ.get("OCTO_FILES_CONFIG", os.path.join(HERE, "config.json"))
CONFIG = json.load(open(CONFIG_FILE, encoding="utf-8"))

SECRET = str(CONFIG["secret"]).encode("utf-8")
VOLUMES = {str(k): str(v) for k, v in CONFIG["volumes"].items()}
HOST = CONFIG.get("host", "127.0.0.1")
PORT = int(CONFIG.get("port", 8765))
ORIGINS = {o.rstrip("/") for o in CONFIG.get("allowed_origins", [])}
MAX_CHUNK = 64 * 1024 * 1024  # under Cloudflare's 100 MB request limit
MAX_FILE = int(float(CONFIG.get("max_file_gb", 50)) * 1024 ** 3)
ZIP_MAX = int(float(CONFIG.get("zip_max_gb", 20)) * 1024 ** 3)
ZIP_MAX_FILES = int(CONFIG.get("zip_max_files", 20000))
LIST_MAX = 5000
RECYCLE = ".octo-recycle"
RECYCLE_DAYS = float(CONFIG.get("recycle_days", 30))
UPLOAD_TTL = 24 * 3600
COPY_BUF = 1024 * 1024
CLOCK_SKEW = 60

DATA_DIR = CONFIG.get("data_dir") or HERE  # log + unfinished-upload list
LOG_FILE = os.path.join(DATA_DIR, "octo_files_log.txt")
LOG_MAX = 5 * 1024 * 1024
LOG_LOCK = threading.Lock()


def log(message):
    line = f"{datetime.now():%Y-%m-%d %H:%M:%S} - {message}"
    print(line, flush=True)
    with LOG_LOCK:
        try:
            if os.path.exists(LOG_FILE) and os.path.getsize(LOG_FILE) > LOG_MAX:
                os.replace(LOG_FILE, os.path.join(DATA_DIR, "octo_files_log.old.txt"))
            with open(LOG_FILE, "a", encoding="utf-8") as f:
                f.write(line + "\n")
        except OSError:
            pass


class Fail(Exception):
    def __init__(self, status, code, extra=None):
        super().__init__(code)
        self.status = status
        self.code = code
        self.extra = extra or {}


# ---------- paths (same rules as lib/fileServerPaths.js) ----------

BAD_CHARS = set('<>:"|?*\\/') | {chr(c) for c in range(32)}
RESERVED = {"con", "prn", "aux", "nul"} | {f"com{i}" for i in range(10)} | {f"lpt{i}" for i in range(10)}
HIDDEN_PREFIXES = (".octo-", "~$")
HIDDEN_NAMES = {"desktop.ini", "thumbs.db", ".ds_store"}


def clean_segment(name):
    if not name or len(name) > 200 or name in (".", ".."):
        return None
    if any(c in BAD_CHARS for c in name) or name[-1] in ". " or name[0] == " ":
        return None
    if name.split(".")[0].lower() in RESERVED or name.lower().startswith(".octo-"):
        return None
    return name


def is_hidden(name):
    low = name.lower()
    return low.startswith(HIDDEN_PREFIXES) or low in HIDDEN_NAMES


def clean_path(path):
    if path is None or len(path) > 1500:
        raise Fail(400, "bad_path")
    parts = [p for p in path.replace("\\", "/").split("/") if p != ""]
    for p in parts:
        if clean_segment(p) != p:
            raise Fail(400, "bad_path")
    return "/" + "/".join(parts)


def within(path, prefix):
    return prefix == "/" or path == prefix or path.startswith(prefix + "/")


def join(path, *names):
    parts = [p for p in "/".join([path, *names]).split("/") if p]
    return "/" + "/".join(parts)


def long_path(p):
    """Windows: paths past 260 characters (deep project folders) need the \\\\?\\ form."""
    if os.name != "nt":
        return p
    p = os.path.normpath(p)
    if p.startswith("\\\\?\\"):
        return p
    if p.startswith("\\\\"):
        return "\\\\?\\UNC\\" + p[2:]
    return "\\\\?\\" + p


def plain(p):
    if p.startswith("\\\\?\\UNC\\"):
        return "\\\\" + p[8:]
    if p.startswith("\\\\?\\"):
        return p[4:]
    return p


ROOTS = {}
for key, root in VOLUMES.items():
    ROOTS[key] = os.path.normcase(plain(os.path.realpath(long_path(root))))


def disk_path(vol, path):
    """The real path of vol:path, refusing anything that ends up outside the share
    (a link / junction inside it pointing elsewhere)."""
    if vol not in VOLUMES:
        raise Fail(404, "no_volume")
    parts = [p for p in path.split("/") if p]
    full = long_path(os.path.join(VOLUMES[vol], *parts))
    real = os.path.normcase(plain(os.path.realpath(full)))
    root = ROOTS[vol]
    if real != root and not real.startswith(root.rstrip("\\/") + os.sep):
        raise Fail(403, "outside_share")
    return full


def entry(vol, path, full, st=None):
    st = st or os.stat(full)
    is_dir = os.path.isdir(full)
    return {
        "vol": vol,
        "path": path,
        "name": path.rsplit("/", 1)[-1],
        "dir": is_dir,
        "size": 0 if is_dir else st.st_size,
        "mtime": int(st.st_mtime * 1000),
    }


# ---------- tokens ----------


def b64d(s):
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def verify(token):
    try:
        h, p, s = token.split(".")
        header = json.loads(b64d(h))
        if header.get("alg") != "HS256":
            raise ValueError
        sig = hmac.new(SECRET, f"{h}.{p}".encode("ascii"), hashlib.sha256).digest()
        if not hmac.compare_digest(sig, b64d(s)):
            raise ValueError
        claims = json.loads(b64d(p))
    except Exception:
        raise Fail(401, "bad_token")
    aud = claims.get("aud")
    if aud != "octo-files" and not (isinstance(aud, list) and "octo-files" in aud):
        raise Fail(401, "bad_token")
    if float(claims.get("exp", 0)) < time.time() - CLOCK_SKEW:
        raise Fail(401, "token_expired")
    grants = []
    for g in claims.get("g") or []:
        if isinstance(g, list) and len(g) == 3:
            grants.append((str(g[0]), str(g[1]), str(g[2])))
    claims["grants"] = grants
    return claims


def rights_at(grants, vol, path):
    out = set()
    for v, p, r in grants:
        if v == vol and within(path, p):
            out.update(r)
    return out


def leads_to_grant(grants, vol, path):
    return any(v == vol and within(p, path) for v, p, _ in grants)


def need(claims, vol, path, right):
    if right not in rights_at(claims["grants"], vol, path):
        raise Fail(403, "forbidden")


# ---------- uploads in progress (kept in uploads.json so a restart cleans up) ----------

UPLOADS = {}
UPLOADS_LOCK = threading.Lock()
UPLOADS_FILE = os.path.join(DATA_DIR, "uploads.json")


def save_uploads():
    try:
        with open(UPLOADS_FILE + ".tmp", "w", encoding="utf-8") as f:
            json.dump(UPLOADS, f)
        os.replace(UPLOADS_FILE + ".tmp", UPLOADS_FILE)
    except OSError as e:
        log(f"could not save uploads.json: {e}")


def load_uploads():
    try:
        with open(UPLOADS_FILE, encoding="utf-8") as f:
            UPLOADS.update(json.load(f))
    except (OSError, ValueError):
        pass


def cleanup_loop():
    while True:
        try:
            now = time.time()
            with UPLOADS_LOCK:
                stale = [k for k, u in UPLOADS.items() if now - u["created"] > UPLOAD_TTL]
                for k in stale:
                    try:
                        os.remove(UPLOADS[k]["part"])
                    except OSError:
                        pass
                    del UPLOADS[k]
                if stale:
                    save_uploads()
            # The recycle folder: anything deleted more than recycle_days ago goes for good.
            for vol, root in VOLUMES.items():
                bin_dir = long_path(os.path.join(root, RECYCLE))
                if not os.path.isdir(bin_dir):
                    continue
                for day in os.listdir(bin_dir):
                    try:
                        age = (datetime.now() - datetime.strptime(day, "%Y-%m-%d")).days
                    except ValueError:
                        continue
                    if age > RECYCLE_DAYS:
                        shutil.rmtree(os.path.join(bin_dir, day), ignore_errors=True)
                        log(f"recycle: emptied {vol}/{RECYCLE}/{day}")
        except Exception as e:  # never let the cleaner die
            log(f"cleanup error: {e}")
        time.sleep(3600)


# ---------- HTTP ----------

SAFE_INLINE = ("application/pdf", "text/plain")


def content_disposition(name, inline):
    ascii_name = "".join(c if 32 <= ord(c) < 127 and c not in '"\\' else "_" for c in name) or "file"
    kind = "inline" if inline else "attachment"
    return f"{kind}; filename=\"{ascii_name}\"; filename*=UTF-8''{urllib.parse.quote(name, safe='')}"


def unique_name(directory, name):
    stem, ext = os.path.splitext(name)
    candidate = name
    n = 2
    while os.path.exists(os.path.join(directory, candidate)):
        candidate = f"{stem} ({n}){ext}"
        n += 1
    return candidate


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = f"OctoFileGateway/{VERSION}"
    timeout = 300

    # Quiet default logging; we log actions ourselves (without tokens).
    def log_message(self, fmt, *args):
        pass

    # ----- plumbing -----

    def cors(self):
        origin = self.headers.get("Origin")
        if origin and (origin.rstrip("/") in ORIGINS or "*" in ORIGINS):
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Expose-Headers", "Content-Disposition, Content-Length, Content-Range")

    def send_json(self, status, data):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def query(self):
        q = urllib.parse.urlparse(self.path).query
        return {k: v[0] for k, v in urllib.parse.parse_qs(q, keep_blank_values=True).items()}

    def route(self):
        return urllib.parse.urlparse(self.path).path.rstrip("/")

    def claims(self, q):
        auth = self.headers.get("Authorization", "")
        token = auth[7:].strip() if auth.lower().startswith("bearer ") else q.get("t", "")
        if not token:
            raise Fail(401, "no_token")
        return verify(token)

    def body_length(self):
        try:
            n = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            raise Fail(400, "bad_length")
        if n < 0:
            raise Fail(400, "bad_length")
        return n

    def drain(self):
        """Read (and drop) a body we're not using, so the connection stays in step."""
        n = self.headers.get("Content-Length")
        if n and n.isdigit() and int(n) <= MAX_CHUNK:
            remaining = int(n)
            while remaining > 0:
                chunk = self.rfile.read(min(COPY_BUF, remaining))
                if not chunk:
                    break
                remaining -= len(chunk)
        elif n:
            self.close_connection = True

    def handle_any(self, method):
        q = {}
        try:
            q = self.query()
            handler = ROUTES.get((method, self.route()))
            if not handler:
                raise Fail(404, "no_route")
            handler(self, q)
        except Fail as f:
            if method in ("POST", "PUT"):
                self.drain()
            try:
                self.send_json(f.status, {"error": f.code, **f.extra})
            except OSError:
                pass
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            self.close_connection = True
        except FileNotFoundError:
            self.send_json(404, {"error": "not_found"})
        except PermissionError as e:
            log(f"access denied by Windows: {e}")
            self.send_json(403, {"error": "share_denied"})
        except Exception as e:
            log(f"error {method} {self.route()}: {e!r}")
            try:
                self.send_json(500, {"error": "server_error"})
            except OSError:
                pass

    def do_GET(self):
        self.handle_any("GET")

    def do_POST(self):
        self.handle_any("POST")

    def do_PUT(self):
        self.handle_any("PUT")

    def do_OPTIONS(self):
        self.send_response(204)
        self.cors()
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type")
        self.send_header("Access-Control-Max-Age", "600")
        # Chrome asks before a public page talks to a private address (LAN set-ups).
        if self.headers.get("Access-Control-Request-Private-Network"):
            self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Content-Length", "0")
        self.end_headers()

    # ----- endpoints -----

    def info(self, q):
        self.send_json(200, {"ok": True, "name": "octo-file-gateway", "version": VERSION, "volumes": list(VOLUMES), "maxChunk": MAX_CHUNK, "time": int(time.time() * 1000)})

    def list(self, q):
        c = self.claims(q)
        vol, path = q.get("vol", ""), clean_path(q.get("path", "/"))
        rights = rights_at(c["grants"], vol, path)
        # A folder above what the person may open: only the way to their folders shows.
        partial = "r" not in rights
        if partial and not leads_to_grant(c["grants"], vol, path):
            raise Fail(403, "forbidden")
        full = disk_path(vol, path)
        if not os.path.isdir(full):
            raise Fail(404, "not_found")
        entries, skipped, truncated = [], 0, False
        with os.scandir(full) as it:
            for e in it:
                if is_hidden(e.name):
                    continue
                if clean_segment(e.name) != e.name:
                    skipped += 1  # a name Windows tools made that the web can't address
                    continue
                child = join(path, e.name)
                if partial and not (e.is_dir() and leads_to_grant(c["grants"], vol, child)):
                    continue
                if len(entries) >= LIST_MAX:
                    truncated = True
                    break
                try:
                    st = e.stat()
                except OSError:
                    continue
                is_dir = e.is_dir()
                entries.append({"name": e.name, "dir": is_dir, "size": 0 if is_dir else st.st_size, "mtime": int(st.st_mtime * 1000)})
        entries.sort(key=lambda x: (not x["dir"], x["name"].lower()))
        self.send_json(200, {"vol": vol, "path": path, "rights": "".join(sorted(rights)), "entries": entries, "skipped": skipped, "truncated": truncated})

    def stat(self, q):
        c = self.claims(q)
        vol, path = q.get("vol", ""), clean_path(q.get("path", "/"))
        need(c, vol, path, "r")
        full = disk_path(vol, path)
        if not os.path.exists(full):
            raise Fail(404, "not_found")
        self.send_json(200, entry(vol, path, full))

    def download(self, q):
        c = self.claims(q)
        vol, path = q.get("vol", ""), clean_path(q.get("path", "/"))
        need(c, vol, path, "r")
        full = disk_path(vol, path)
        if not os.path.isfile(full):
            raise Fail(404, "not_found")
        name = path.rsplit("/", 1)[-1]
        size = os.path.getsize(full)
        ctype = mimetypes.guess_type(name)[0] or "application/octet-stream"
        safe = ctype in SAFE_INLINE or (ctype.split("/")[0] in ("image", "video", "audio") and ctype != "image/svg+xml")
        inline = q.get("inline") == "1" and safe
        start, end = 0, size - 1
        rng = self.headers.get("Range", "")
        partial = False
        if rng.startswith("bytes=") and "," not in rng and size > 0:
            a, _, b = rng[6:].partition("-")
            try:
                if a:
                    start = int(a)
                    end = min(int(b), size - 1) if b else size - 1
                else:
                    start = max(0, size - int(b))
                partial = start <= end
            except ValueError:
                partial = False
            if not partial or start >= size:
                self.send_response(416)
                self.cors()
                self.send_header("Content-Range", f"bytes */{size}")
                self.send_header("Content-Length", "0")
                self.end_headers()
                return
        length = end - start + 1 if size else 0
        self.send_response(206 if partial else 200)
        self.cors()
        self.send_header("Content-Type", ctype if inline else "application/octet-stream")
        self.send_header("Content-Length", str(length))
        self.send_header("Content-Disposition", content_disposition(name, inline))
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Cache-Control", "private, no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Security-Policy", "sandbox")
        if partial:
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.end_headers()
        if start == 0 and not partial:
            log(f"{c.get('nm', '?')} ({c.get('sub', '?')}) download {vol}:{path}")
        with open(full, "rb") as f:
            f.seek(start)
            remaining = length
            while remaining > 0:
                chunk = f.read(min(COPY_BUF, remaining))
                if not chunk:
                    break
                self.wfile.write(chunk)
                remaining -= len(chunk)

    def zip(self, q):
        c = self.claims(q)
        vol, path = q.get("vol", ""), clean_path(q.get("path", "/"))
        need(c, vol, path, "r")
        full = disk_path(vol, path)
        if not os.path.isdir(full):
            raise Fail(404, "not_found")
        folder = path.rsplit("/", 1)[-1] or vol
        files, total = [], 0
        for dirpath, dirnames, filenames in os.walk(full):
            dirnames[:] = [d for d in dirnames if not is_hidden(d)]
            for fn in filenames:
                if is_hidden(fn):
                    continue
                fp = os.path.join(dirpath, fn)
                try:
                    total += os.path.getsize(fp)
                except OSError:
                    continue
                rel = os.path.relpath(fp, full).replace(os.sep, "/")
                files.append((fp, f"{folder}/{rel}"))
                if len(files) > ZIP_MAX_FILES or total > ZIP_MAX:
                    raise Fail(413, "zip_too_large", {"maxGb": ZIP_MAX / 1024 ** 3, "maxFiles": ZIP_MAX_FILES})
        self.send_response(200)
        self.cors()
        self.send_header("Content-Type", "application/zip")
        self.send_header("Content-Disposition", content_disposition(folder + ".zip", False))
        self.send_header("Cache-Control", "private, no-store")
        self.send_header("Connection", "close")
        self.end_headers()
        self.close_connection = True
        log(f"{c.get('nm', '?')} ({c.get('sub', '?')}) zip {vol}:{path} ({len(files)} files)")
        # Stored, not compressed: renders and videos don't shrink, and it streams at disk speed.
        with zipfile.ZipFile(self.wfile, "w", compression=zipfile.ZIP_STORED, allowZip64=True) as zf:
            for fp, arc in files:
                try:
                    zf.write(fp, arc)
                except (FileNotFoundError, PermissionError):
                    continue

    def mkdir(self, q):
        c = self.claims(q)
        vol, path = q.get("vol", ""), clean_path(q.get("path", "/"))
        names = [n for n in q.get("name", "").replace("\\", "/").split("/") if n]
        if not names or any(clean_segment(n) != n for n in names):
            raise Fail(400, "bad_name")
        target = join(path, *names)
        need(c, vol, target, "w")
        full = disk_path(vol, target)
        if os.path.exists(full) and not os.path.isdir(full):
            raise Fail(409, "exists")
        os.makedirs(full, exist_ok=True)
        log(f"{c.get('nm', '?')} ({c.get('sub', '?')}) mkdir {vol}:{target}")
        self.send_json(200, entry(vol, target, full))

    def upload_start(self, q):
        c = self.claims(q)
        vol, path = q.get("vol", ""), clean_path(q.get("path", "/"))
        name = q.get("name", "")
        if clean_segment(name) != name:
            raise Fail(400, "bad_name")
        try:
            size = int(q.get("size", "-1"))
        except ValueError:
            size = -1
        if size < 0:
            raise Fail(400, "bad_size")
        if size > MAX_FILE:
            raise Fail(413, "file_too_large", {"maxGb": MAX_FILE / 1024 ** 3})
        overwrite = q.get("overwrite") == "1"
        target = join(path, name)
        need(c, vol, target, "w")
        if overwrite:
            need(c, vol, target, "m")
        directory = disk_path(vol, path)
        os.makedirs(directory, exist_ok=True)
        if shutil.disk_usage(directory).free < size + 200 * 1024 * 1024:
            raise Fail(507, "no_space")
        upload_id = uuid.uuid4().hex
        part = os.path.join(directory, f".octo-part-{upload_id}")
        open(part, "wb").close()
        with UPLOADS_LOCK:
            UPLOADS[upload_id] = {"vol": vol, "dir": path, "name": name, "size": size, "received": 0, "part": part, "sub": c.get("sub"), "overwrite": overwrite, "created": time.time()}
            save_uploads()
        self.send_json(200, {"id": upload_id, "chunk": MAX_CHUNK})

    def upload_of(self, q, c):
        u = UPLOADS.get(q.get("id", ""))
        if not u:
            raise Fail(404, "no_upload")
        if u["sub"] != c.get("sub"):
            raise Fail(403, "forbidden")
        return u

    def upload_chunk(self, q):
        c = self.claims(q)
        u = self.upload_of(q, c)
        need(c, u["vol"], join(u["dir"], u["name"]), "w")
        n = self.body_length()
        if n > MAX_CHUNK:
            raise Fail(413, "chunk_too_large")
        try:
            offset = int(q.get("offset", "-1"))
        except ValueError:
            offset = -1
        if offset != u["received"]:
            raise Fail(409, "wrong_offset", {"received": u["received"]})
        if offset + n > u["size"]:
            raise Fail(400, "too_much_data")
        with open(u["part"], "r+b") as f:
            f.seek(offset)
            remaining = n
            while remaining > 0:
                chunk = self.rfile.read(min(COPY_BUF, remaining))
                if not chunk:
                    self.close_connection = True
                    raise Fail(400, "incomplete_chunk", {"received": u["received"]})
                f.write(chunk)
                remaining -= len(chunk)
        u["received"] = offset + n
        self.send_json(200, {"received": u["received"]})

    def upload_finish(self, q):
        c = self.claims(q)
        u = self.upload_of(q, c)
        need(c, u["vol"], join(u["dir"], u["name"]), "w")
        if u["received"] != u["size"]:
            raise Fail(409, "incomplete", {"received": u["received"]})
        directory = disk_path(u["vol"], u["dir"])
        with open(u["part"], "r+b") as f:
            f.truncate(u["size"])
        name = u["name"] if u["overwrite"] else unique_name(directory, u["name"])
        final = os.path.join(directory, name)
        os.replace(u["part"], final)
        with UPLOADS_LOCK:
            UPLOADS.pop(q["id"], None)
            save_uploads()
        path = join(u["dir"], name)
        log(f"{c.get('nm', '?')} ({c.get('sub', '?')}) upload {u['vol']}:{path} ({u['size']} bytes)")
        self.send_json(200, entry(u["vol"], path, final))

    def upload_cancel(self, q):
        c = self.claims(q)
        u = self.upload_of(q, c)
        try:
            os.remove(u["part"])
        except OSError:
            pass
        with UPLOADS_LOCK:
            UPLOADS.pop(q["id"], None)
            save_uploads()
        self.send_json(200, {"ok": True})

    def rename(self, q):
        c = self.claims(q)
        vol, path = q.get("vol", ""), clean_path(q.get("path", "/"))
        name = q.get("name", "")
        if path == "/" or clean_segment(name) != name:
            raise Fail(400, "bad_name")
        target = join(path.rsplit("/", 1)[0] or "/", name)
        need(c, vol, path, "m")
        need(c, vol, target, "m")
        src, dst = disk_path(vol, path), disk_path(vol, target)
        if not os.path.exists(src):
            raise Fail(404, "not_found")
        if os.path.exists(dst) and os.path.normcase(src) != os.path.normcase(dst):
            raise Fail(409, "exists")
        os.rename(src, dst)
        log(f"{c.get('nm', '?')} ({c.get('sub', '?')}) rename {vol}:{path} -> {name}")
        self.send_json(200, entry(vol, target, dst))

    def delete(self, q):
        c = self.claims(q)
        vol, path = q.get("vol", ""), clean_path(q.get("path", "/"))
        if path == "/":
            raise Fail(400, "bad_path")
        need(c, vol, path, "m")
        src = disk_path(vol, path)
        if not os.path.exists(src):
            raise Fail(404, "not_found")
        # Not deleted: moved to the share's recycle folder, gone after recycle_days.
        bin_dir = long_path(os.path.join(VOLUMES[vol], RECYCLE, datetime.now().strftime("%Y-%m-%d")))
        os.makedirs(bin_dir, exist_ok=True)
        dst = os.path.join(bin_dir, f"{datetime.now():%H%M%S}-{uuid.uuid4().hex[:6]} {path.rsplit('/', 1)[-1]}")
        shutil.move(src, dst)
        log(f"{c.get('nm', '?')} ({c.get('sub', '?')}) delete {vol}:{path} -> {plain(dst)}")
        self.send_json(200, {"ok": True})


ROUTES = {
    ("GET", "/v1/info"): Handler.info,
    ("GET", "/v1/list"): Handler.list,
    ("GET", "/v1/stat"): Handler.stat,
    ("GET", "/v1/download"): Handler.download,
    ("GET", "/v1/zip"): Handler.zip,
    ("POST", "/v1/mkdir"): Handler.mkdir,
    ("POST", "/v1/upload/start"): Handler.upload_start,
    ("PUT", "/v1/upload/chunk"): Handler.upload_chunk,
    ("POST", "/v1/upload/finish"): Handler.upload_finish,
    ("POST", "/v1/upload/cancel"): Handler.upload_cancel,
    ("POST", "/v1/rename"): Handler.rename,
    ("POST", "/v1/delete"): Handler.delete,
}


def main():
    if len(SECRET) < 32 or SECRET.startswith(b"paste"):
        sys.exit("config.json: put the connection key from Dashboard -> Files -> Connection in \"secret\".")
    for key, root in VOLUMES.items():
        if not os.path.isdir(long_path(root)):
            log(f"WARNING: volume '{key}' ({root}) can't be opened from this PC right now")
    load_uploads()
    threading.Thread(target=cleanup_loop, daemon=True).start()
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    server.daemon_threads = True
    scheme = "http"
    if CONFIG.get("tls_cert") and CONFIG.get("tls_key"):
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ctx.load_cert_chain(CONFIG["tls_cert"], CONFIG["tls_key"])
        server.socket = ctx.wrap_socket(server.socket, server_side=True)
        scheme = "https"
    log(f"OCTO file gateway v{VERSION} on {scheme}://{HOST}:{PORT} - volumes: {', '.join(f'{k} = {v}' for k, v in VOLUMES.items())}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
