import Pusher from "pusher";

// Server side of the real-time layer. Everything goes through publish() so the
// transport can be swapped in one place:
//   - REALTIME_SECRET set → our own Socket.IO server (realtime/server.mjs) on this machine;
//   - else Pusher keys set → Pusher;
//   - else nothing is sent and the UI polls.

export const PRESENCE_CHANNEL = "presence-staff";
export const userChannel = (userId) => `private-user-${userId}`;
export const conversationChannel = (conversationId) => `private-conversation-${conversationId}`;

const SELF_HOSTED = Boolean(process.env.REALTIME_SECRET);
const PUBLISH_URL = `${process.env.REALTIME_INTERNAL_URL || "http://127.0.0.1:3001"}/publish`;

let client;

function getPusher() {
  if (client !== undefined) return client;
  const { PUSHER_APP_ID, PUSHER_KEY, PUSHER_SECRET, PUSHER_CLUSTER } = process.env;
  client =
    PUSHER_APP_ID && PUSHER_KEY && PUSHER_SECRET && PUSHER_CLUSTER
      ? new Pusher({
          appId: PUSHER_APP_ID,
          key: PUSHER_KEY,
          secret: PUSHER_SECRET,
          cluster: PUSHER_CLUSTER,
          useTLS: true,
        })
      : null;
  return client;
}

export function realtimeEnabled() {
  return SELF_HOSTED || Boolean(getPusher());
}

// Pusher accepts at most 100 channels per trigger and ~10KB per event.
export async function publish(channels, event, data) {
  const list = [...new Set([].concat(channels).filter(Boolean))];
  if (!list.length) return;
  try {
    if (SELF_HOSTED) {
      const res = await fetch(PUBLISH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Realtime-Secret": process.env.REALTIME_SECRET },
        body: JSON.stringify({ channels: list, event, data }),
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return;
    }
    const pusher = getPusher();
    if (!pusher) return;
    for (let i = 0; i < list.length; i += 100) {
      await pusher.trigger(list.slice(i, i + 100), event, data);
    }
  } catch (err) {
    console.error("realtime publish error", event, err?.message || err);
  }
}

// The answer to "may this socket join the channel" (app/api/realtime/auth). The
// self-hosted server only needs a yes and, for the presence channel, who joined.
export function authorizeChannel(socketId, channel, presenceData) {
  if (SELF_HOSTED) return { ok: true, presence: presenceData || null };
  const pusher = getPusher();
  if (!pusher) return null;
  return presenceData
    ? pusher.authorizeChannel(socketId, channel, presenceData)
    : pusher.authorizeChannel(socketId, channel);
}
