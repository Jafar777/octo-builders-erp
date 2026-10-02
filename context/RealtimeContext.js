"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";

// Client side of the real-time layer (Pusher today). Without NEXT_PUBLIC_PUSHER_KEY
// nothing connects, `connected` stays false, and components poll instead.

const RealtimeContext = createContext({ client: null, connected: false, acquire: () => null, release: () => {} });

export const PRESENCE_CHANNEL = "presence-staff";
export const userChannelName = (id) => (id ? `private-user-${id}` : null);
export const conversationChannelName = (id) => (id ? `private-conversation-${id}` : null);

export function RealtimeProvider({ children }) {
  const { user } = useAuth();
  const userId = user?.id;
  const [client, setClient] = useState(null);
  const [connected, setConnected] = useState(false);
  const counts = useRef(new Map());

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
    if (!userId || !key) return undefined;

    let pusher;
    let cancelled = false;
    import("pusher-js").then(({ default: Pusher }) => {
      if (cancelled) return;
      pusher = new Pusher(key, {
        cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER,
        channelAuthorization: { endpoint: "/api/realtime/auth", transport: "ajax" },
      });
      pusher.connection.bind("state_change", ({ current }) => setConnected(current === "connected"));
      setClient(pusher);
    });

    const refCounts = counts.current;
    return () => {
      cancelled = true;
      refCounts.clear();
      pusher?.disconnect();
      setClient(null);
      setConnected(false);
    };
  }, [userId]);

  // Channels are shared between components and unsubscribed when nobody uses them.
  const acquire = useCallback(
    (name) => {
      if (!client || !name) return null;
      counts.current.set(name, (counts.current.get(name) || 0) + 1);
      return client.channel(name) || client.subscribe(name);
    },
    [client]
  );

  const release = useCallback(
    (name) => {
      if (!client || !name) return;
      const next = (counts.current.get(name) || 1) - 1;
      if (next <= 0) {
        counts.current.delete(name);
        client.unsubscribe(name);
      } else {
        counts.current.set(name, next);
      }
    },
    [client]
  );

  return (
    <RealtimeContext.Provider value={{ client, connected, acquire, release }}>{children}</RealtimeContext.Provider>
  );
}

export function useRealtime() {
  return useContext(RealtimeContext);
}

// Calls `handler(data)` for every `event` on `channelName` while mounted.
export function useRealtimeEvent(channelName, event, handler) {
  const { acquire, release } = useRealtime();
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    const channel = acquire(channelName);
    if (!channel) return undefined;
    const callback = (data) => handlerRef.current?.(data);
    channel.bind(event, callback);
    return () => {
      channel.unbind(event, callback);
      release(channelName);
    };
  }, [acquire, release, channelName, event]);
}

// Set of user IDs currently online in the dashboard.
export function useOnlineUsers() {
  const { acquire, release } = useRealtime();
  const [online, setOnline] = useState(() => new Set());

  useEffect(() => {
    const channel = acquire(PRESENCE_CHANNEL);
    if (!channel) return undefined;

    const sync = () => {
      const ids = new Set();
      channel.members?.each((m) => ids.add(m.id));
      setOnline(ids);
    };
    channel.bind("pusher:subscription_succeeded", sync);
    channel.bind("pusher:member_added", sync);
    channel.bind("pusher:member_removed", sync);
    if (channel.subscribed) sync();

    return () => {
      channel.unbind("pusher:subscription_succeeded", sync);
      channel.unbind("pusher:member_added", sync);
      channel.unbind("pusher:member_removed", sync);
      release(PRESENCE_CHANNEL);
    };
  }, [acquire, release]);

  return online;
}

// Runs `fn` every `ms` while real-time is NOT connected (fallback polling).
export function usePollingFallback(fn, ms = 30000) {
  const { connected } = useRealtime();
  const fnRef = useRef(fn);

  useEffect(() => {
    fnRef.current = fn;
  });

  useEffect(() => {
    if (connected) return undefined;
    const timer = setInterval(() => fnRef.current?.(), ms);
    return () => clearInterval(timer);
  }, [connected, ms]);
}
