import { requireStaff } from "@/lib/currentUser";
import { messageReviewScope } from "@/lib/messaging";
import { userDepartments } from "@/lib/scope";
import MessagesHub from "@/components/erp/messages/MessagesHub";
import NoAccess from "@/components/erp/NoAccess";

// My chats, and message review for the CEO (everyone) and department managers (their departments).
export default async function MessagesPage() {
  const user = await requireStaff({ limited: true });
  if (!user) return <NoAccess />;
  const reviewScope = messageReviewScope(user);
  return (
    <MessagesHub
      meId={user.id}
      canAnnounce={user.permissions.includes("messages.announce")}
      reviewScope={reviewScope}
      departments={reviewScope === "department" ? userDepartments(user) : null}
    />
  );
}
