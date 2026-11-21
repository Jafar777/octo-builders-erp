// Browser client for the self-hosted real-time server (realtime/server.mjs), shaped
// like the small part of pusher-js the dashboard uses, so RealtimeContext and every
// component work the same with either:
//   client.subscribe(name) → channel { bind, unbind, subscribed, members.each }
//   client.unsubscribe(name), client.disconnect(), client.connection.bind("state_change")
// Channels are joined again automatically after a reconnect.

class Members {
  constructor() {
    this.map = new Map();
  }
  set(list) {
    this.map = new Map((list || []).map((m) => [m.id, m.info]));
  }
  each(fn) {
    for (const [id, info] of this.map) fn({ id, info });
  }
  get count() {
    return this.map.size;
  }
}

class Channel {
  constructor(name, client) {
    this.name = name;
    this.client = client;
    this.handlers = new Map();
    this.subscribed = false;
    this.wanted = true;
    this.members = name.startsWith("presence-") ? new Members() : undefined;
  }
  bind(event, fn) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event).add(fn);
    return this;
  }
  unbind(event, fn) {
    if (!event) this.handlers.clear();
    else if (!fn) this.handlers.delete(event);
    else this.handlers.get(event)?.delete(fn);
    return this;
  }
  emit(event, data) {
    for (const fn of [...(this.handlers.get(event) || [])]) {
      try {
        fn(data);
      } catch (err) {
        console.error("realtime handler error", this.name, event, err);
      }
    }
  }
}

export function createSocketClient(io) {
  const socket = io({ path: "/socket.io/", withCredentials: true, transports: ["websocket", "polling"] });
  const channels = new Map();
  const stateHandlers = new Set();
  let state = "connecting";

  const setState = (next) => {
    if (next === state) return;
    const previous = state;
    state = next;
    for (const fn of stateHandlers) fn({ previous, current: next });
  };

  const join = (channel) => {
    socket.emit("subscribe", { channel: channel.name }, (res) => {
      // Unsubscribed (or replaced) while the join was on its way.
      if (!channel.wanted || channels.get(channel.name) !== channel) {
        // ...unless it was asked for again since: the server keeps one membership per
        // channel, and the newer join already counts on it.
        if (res?.ok && !channels.has(channel.name)) socket.emit("unsubscribe", { channel: channel.name });
        return;
      }
      if (!res?.ok) {
        channel.emit("pusher:subscription_error", res || {});
        return;
      }
      channel.subscribed = true;
      if (channel.members) channel.members.set(res.members);
      channel.emit("pusher:subscription_succeeded", channel.members);
    });
  };

  socket.on("connect", () => {
    setState("connected");
    for (const channel of channels.values()) {
      channel.subscribed = false;
      join(channel);
    }
  });
  socket.on("disconnect", () => {
    for (const channel of channels.values()) channel.subscribed = false;
    setState("unavailable");
  });
  socket.on("connect_error", () => setState("unavailable"));

  socket.on("evt", (msg) => {
    const channel = channels.get(msg?.channel);
    if (!channel?.subscribed) return;
    if (channel.members && msg.event === "pusher:member_added") channel.members.map.set(msg.data.id, msg.data.info);
    if (channel.members && msg.event === "pusher:member_removed") channel.members.map.delete(msg.data.id);
    channel.emit(msg.event, msg.data);
  });

  return {
    connection: {
      bind(event, fn) {
        if (event === "state_change") stateHandlers.add(fn);
      },
      unbind(event, fn) {
        if (event === "state_change") stateHandlers.delete(fn);
      },
      get state() {
        return state;
      },
    },
    subscribe(name) {
      const existing = channels.get(name);
      if (existing) return existing;
      const channel = new Channel(name, this);
      channels.set(name, channel);
      if (socket.connected) join(channel);
      return channel;
    },
    unsubscribe(name) {
      const channel = channels.get(name);
      if (!channel) return;
      channel.wanted = false;
      channel.subscribed = false;
      channels.delete(name);
      if (socket.connected) socket.emit("unsubscribe", { channel: name });
    },
    disconnect() {
      stateHandlers.clear();
      channels.clear();
      socket.disconnect();
    },
  };
}
