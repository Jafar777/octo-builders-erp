import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { authorizeChannel, PRESENCE_CHANNEL } from "@/lib/realtime/server";
import { conversationAccess } from "@/lib/messaging";
import { projectAccess } from "@/lib/projects";
import { fail, forbidden, isObjectId } from "@/lib/apiUtils";
import Conversation from "@/models/Conversation";
import WorkProject from "@/models/WorkProject";

// Pusher calls this (form-encoded) before joining a private or presence channel.
export async function POST(request) {
  const user = await getCurrentUser();
  if (!user) return forbidden();

  const form = new URLSearchParams(await request.text());
  const socketId = form.get("socket_id");
  const channel = form.get("channel_name") || "";
  if (!socketId || !channel) return fail("invalid_request");

  let allowed = false;
  let presence;

  if (channel === `private-user-${user.id}`) {
    allowed = true;
  } else if (channel === PRESENCE_CHANNEL) {
    allowed = user.isStaff;
    presence = { user_id: user.id, user_info: { name: user.displayName || user.email, avatarUrl: user.avatarUrl } };
  } else if (channel.startsWith("private-department-")) {
    // Task and board updates of a department.
    const id = channel.slice("private-department-".length);
    allowed = user.isStaff && (user.scope === "all" || user.department === id);
  } else if (channel.startsWith("private-project-")) {
    // Board updates of one project, for everyone who can open it.
    const id = channel.slice("private-project-".length);
    if (isObjectId(id)) {
      const project = await WorkProject.findById(id, { department: 1, participants: 1, stages: 1 }).lean();
      allowed = Boolean(projectAccess(user, project));
    }
  } else if (channel.startsWith("private-conversation-")) {
    const id = channel.slice("private-conversation-".length);
    if (isObjectId(id)) {
      const conversation = await Conversation.findById(id, { members: 1 }).lean();
      allowed = Boolean(await conversationAccess(user, conversation));
    }
  }

  if (!allowed) return forbidden();
  const auth = authorizeChannel(socketId, channel, presence);
  if (!auth) return fail("realtime_disabled", 503);
  return NextResponse.json(auth);
}
