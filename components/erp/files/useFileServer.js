"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/clientApi";
import { createGateway, GatewayError } from "@/components/erp/files/gatewayClient";

// Is the company file server connected? (one request per page load, shared)
let statusPromise = null;
let statusAt = 0;
export function loadFileServerStatus(force = false) {
  if (force || !statusPromise || Date.now() - statusAt > 5 * 60 * 1000) {
    statusAt = Date.now();
    statusPromise = api("/api/files/status", { quiet: true }).catch(() => ({ enabled: false, volumes: [] }));
  }
  return statusPromise;
}

export function useFileServer() {
  const [status, setStatus] = useState(null);
  useEffect(() => {
    let live = true;
    loadFileServerStatus().then((s) => live && setStatus(s));
    return () => {
      live = false;
    };
  }, []);
  return status; // null while loading
}

// Gateway tokens by screen ("browse", "task:<id>"…), shared by every component on it.
const sessions = new Map();
// After the connection changed (address, key): every screen asks again.
export const clearFileSessions = () => sessions.clear();

async function fetchSession(ctx) {
  const s = await api("/api/files/session", { method: "POST", body: ctx, quiet: true });
  if (!s.enabled) throw new GatewayError("file_server_off");
  return s;
}

export function sessionGetter(ctx) {
  const key = `${ctx.for}:${ctx.id || ""}`;
  return async (force = false) => {
    const cached = sessions.get(key);
    if (!force && cached) {
      const s = await cached.catch(() => null);
      if (s && new Date(s.expiresAt).getTime() - Date.now() > 60 * 1000) return s;
    }
    const next = fetchSession(ctx);
    sessions.set(key, next);
    next.catch(() => sessions.delete(key));
    return next;
  };
}

// The gateway for one screen: { status: "idle" | "loading" | "ready" | "off" | "error",
// session, gateway, getSession, refresh, error }. `ctx` null = not needed. `lazy`: no
// token until something is opened (long lists of attachments: one request per click,
// not one per row).
export function useFileSession(ctx, { lazy = false } = {}) {
  const key = ctx ? `${ctx.for}:${ctx.id || ""}` : "";
  const [state, setState] = useState({ status: ctx ? (lazy ? "idle" : "loading") : "off", session: null, error: "" });
  const getSession = useMemo(
    () => (key ? sessionGetter(ctx) : async () => Promise.reject(new GatewayError("file_server_off"))),
    // The key names the screen; a new object with the same key is the same screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key]
  );

  const refresh = useCallback(
    (force = false) => {
      if (!key) return;
      setState((s) => (s.status === "idle" ? { ...s, status: "loading" } : s));
      getSession(force)
        .then((session) => setState({ status: "ready", session, error: "" }))
        .catch((err) => setState({ status: err?.message === "file_server_off" ? "off" : "error", session: null, error: err?.message || "server_error" }));
    },
    [key, getSession]
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!lazy) refresh();
  }, [refresh, lazy]);

  const gateway = useMemo(() => createGateway(getSession), [getSession]);
  return { ...state, gateway, getSession, refresh };
}
