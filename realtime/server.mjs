// Self-hosted real-time server (replaces Pusher). Runs next to the Next.js app:
//
//   node --env-file=.env realtime/server.mjs        (systemd: octa-realtime.service)
//
// Browsers connect through nginx at /socket.io/ with their normal session cookie.
// Joining a channel is decided by the app itself: this server forwards the request to
// /api/realtime/auth with the person's cookie, so every permission rule stays in one
// place (app/api/realtime/auth/route.js). The app sends events to POST /publish on
// 127.0.0.1 with the shared REALTIME_SECRET (lib/realtime/server.js).
//
// Messages to the browser:  "evt" { channel, event, data }
// Messages from the browser: "subscribe" { channel } (ack { ok, members? }), "unsubscribe" { channel }

import http from "node:http";
import crypto from "node:crypto";
import { Server } from "socket.io";
import { jwtVerify } from "jose";

const PORT = Number(process.env.REALTIME_PORT || 3001);
const HOST = process.env.REALTIME_HOST || "127.0.0.1";
const APP_URL = process.env.REALTIME_APP_URL || "http://127.0.0.1:3000";
const SECRET = process.env.REALTIME_SECRET || "";
const JWT_SECRET = process.env.JWT_SECRET || "";
const SESSION_COOKIE = "octa_session";
const PRESENCE_PREFIX = "presence-";
const MAX_CHANNELS_PER_SOCKET = 300;
const MAX_BODY = 512 * 1024;

if (!SECRET || SECRET.length < 32) throw new Error("REALTIME_SECRET (32+ characters) is required");
if (!JWT_SECRET) throw new Error("JWT_SECRET is required");

// Browsers may only connect from the site itself (stops other sites opening a socket
// with a visitor's cookie). Same-origin long-polling requests carry no Origin header.
const allowedOrigins = new Set(
  [process.env.NEXT_PUBLIC_SITE_URL, ...(process.env.REALTIME_ALLOWED_ORIGINS || "").split(",")]
    .map((o) => (o || "").trim().replace(/\/+$/, ""))
    .filter(Boolean)
    .flatMap((o) => {
      // https://example.com also allows https://www.example.com and the other way round.
      try {
        const u = new URL(o);
        const other = u.hostname.startsWith("www.") ? u.hostname.slice(4) : `www.${u.hostname}`;
        return [u.origin, `${u.protocol}//${other}${u.port ? `:${u.port}` : ""}`];
      } catch {
        return [];
      }
    })
);

const sessionKey = new TextEncoder().encode(JWT_SECRET);

function readCookie(header, name) {
  for (const part of String(header || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a || ""));
  const y = Buffer.from(String(b || ""));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// ---------- presence ----------
// channel → userId → { info, sockets: Set<socketId> }
const presence = new Map();

function presenceMembers(channel) {
  return [...(presence.get(channel)?.entries() || [])].map(([id, m]) => ({ id, info: m.info }));
}

function presenceJoin(channel, socket, member) {
  if (!presence.has(channel)) presence.set(channel, new Map());
  const members = presence.get(channel);
  const existing = members.get(member.user_id);
  if (existing) {
    existing.sockets.add(socket.id);
    existing.info = member.user_info;
    return;
  }
  members.set(member.user_id, { info: member.user_info, sockets: new Set([socket.id]) });
  socket.to(channel).emit("evt", { channel, event: "pusher:member_added", data: { id: member.user_id, info: member.user_info } });
}

function presenceLeave(channel, socket) {
  const members = presence.get(channel);
  if (!members) return;
  for (const [id, m] of members) {
    if (!m.sockets.delete(socket.id)) continue;
    if (m.sockets.size === 0) {
      members.delete(id);
      io.to(channel).emit("evt", { channel, event: "pusher:member_removed", data: { id, info: m.info } });
    }
  }
  if (members.size === 0) presence.delete(channel);
}

// ---------- the app asks: may this person join? ----------
async function authorize(socket, channel) {
  const res = await fetch(`${APP_URL}/api/realtime/auth`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: `${SESSION_COOKIE}=${encodeURIComponent(socket.data.token)}`,
      "X-Forwarded-For": socket.data.ip || "",
    },
    body: new URLSearchParams({ socket_id: socket.id, channel_name: channel }).toString(),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) return null;
  return res.json().catch(() => null);
}

// ---------- HTTP: the app publishes here ----------
const httpServer = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ ok: true, sockets: io.engine.clientsCount }));
  }
  if (req.method !== "POST" || req.url !== "/publish") {
    res.writeHead(404);
    return res.end();
  }
  if (!safeEqual(req.headers["x-realtime-secret"], SECRET)) {
    res.writeHead(403);
    return res.end();
  }
  let size = 0;
  const chunks = [];
  req.on("data", (c) => {
    size += c.length;
    if (size > MAX_BODY) {
      res.writeHead(413);
      res.end();
      req.destroy();
      return;
    }
    chunks.push(c);
  });
  req.on("end", () => {
    if (res.writableEnded) return;
    let body;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      res.writeHead(400);
      return res.end();
    }
    const channels = [...new Set([].concat(body.channels || []).filter((c) => typeof c === "string" && c))];
    if (typeof body.event !== "string" || !body.event) {
      res.writeHead(400);
      return res.end();
    }
    // One message per channel: a browser in two of the channels hears both, as with Pusher.
    for (const channel of channels) io.to(channel).emit("evt", { channel, event: body.event, data: body.data ?? null });
    res.writeHead(204);
    res.end();
  });
});

// Socket.IO also answers on this server; anything that isn't /socket.io/ or the routes
// above gets the 404 from the handler.
const io = new Server(httpServer, {
  path: "/socket.io/",
  serveClient: false,
  maxHttpBufferSize: 16 * 1024,
  pingInterval: 25000,
  pingTimeout: 20000,
  allowRequest: (req, callback) => {
    const origin = (req.headers.origin || "").replace(/\/+$/, "");
    callback(null, !origin || allowedOrigins.has(origin));
  },
});

// Only signed-in people connect.
io.use(async (socket, next) => {
  const token = readCookie(socket.handshake.headers.cookie, SESSION_COOKIE);
  if (!token) return next(new Error("unauthorized"));
  try {
    const { payload } = await jwtVerify(token, sessionKey);
    if (!payload?.sub) return next(new Error("unauthorized"));
    socket.data.userId = String(payload.sub);
    socket.data.token = token;
    socket.data.ip = String(socket.handshake.headers["x-real-ip"] || socket.handshake.address || "");
    socket.data.channels = new Set();
    next();
  } catch {
    next(new Error("unauthorized"));
  }
});

io.on("connection", (socket) => {
  socket.on("subscribe", async (msg, ack) => {
    const reply = typeof ack === "function" ? ack : () => {};
    const channel = typeof msg?.channel === "string" ? msg.channel : "";
    if (!channel || channel.length > 200) return reply({ ok: false });
    if (socket.data.channels.has(channel)) {
      return reply({ ok: true, members: channel.startsWith(PRESENCE_PREFIX) ? presenceMembers(channel) : undefined });
    }
    if (socket.data.channels.size >= MAX_CHANNELS_PER_SOCKET) return reply({ ok: false });
    let auth;
    try {
      auth = await authorize(socket, channel);
    } catch (err) {
      console.error("realtime auth error", channel, err?.message || err);
      return reply({ ok: false });
    }
    if (!auth?.ok || !socket.connected) return reply({ ok: false });
    socket.data.channels.add(channel);
    socket.join(channel);
    if (channel.startsWith(PRESENCE_PREFIX)) {
      if (!auth.presence?.user_id) return reply({ ok: false });
      presenceJoin(channel, socket, auth.presence);
      return reply({ ok: true, members: presenceMembers(channel), me: auth.presence.user_id });
    }
    reply({ ok: true });
  });

  socket.on("unsubscribe", (msg) => {
    const channel = typeof msg?.channel === "string" ? msg.channel : "";
    if (!socket.data.channels.delete(channel)) return;
    socket.leave(channel);
    if (channel.startsWith(PRESENCE_PREFIX)) presenceLeave(channel, socket);
  });

  socket.on("disconnect", () => {
    for (const channel of socket.data.channels) if (channel.startsWith(PRESENCE_PREFIX)) presenceLeave(channel, socket);
    socket.data.channels.clear();
  });
});

httpServer.listen(PORT, HOST, () => console.log(`realtime listening on ${HOST}:${PORT} (origins: ${[...allowedOrigins].join(", ") || "same-origin only"})`));

for (const sig of ["SIGTERM", "SIGINT"]) {
  process.on(sig, () => {
    io.close();
    httpServer.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
