import Pusher from "pusher";

// Server side of the real-time layer. Everything goes through publish() so the
// transport (Pusher today, a self-hosted Socket.IO server after a move to a VPS)
// can be swapped in one place. Without keys it does nothing and the UI polls.

export const PRESENCE_CHANNEL = "presence-staff";
export const userChannel = (userId) => `private-user-${userId}`;
export const conversationChannel = (conversationId) => `private-conversation-${conversationId}`;

let client;

function getClient() {
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
  return Boolean(getClient());
}

// Pusher accepts at most 100 channels per trigger and ~10KB per event.
export async function publish(channels, event, data) {
  const pusher = getClient();
  if (!pusher) return;
  const list = [...new Set([].concat(channels).filter(Boolean))];
  try {
    for (let i = 0; i < list.length; i += 100) {
      await pusher.trigger(list.slice(i, i + 100), event, data);
    }
  } catch (err) {
    console.error("realtime publish error", event, err?.message || err);
  }
}

export function authorizeChannel(socketId, channel, presenceData) {
  const pusher = getClient();
  if (!pusher) return null;
  return presenceData
    ? pusher.authorizeChannel(socketId, channel, presenceData)
    : pusher.authorizeChannel(socketId, channel);
}
