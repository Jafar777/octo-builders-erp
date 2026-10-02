import { requirePermission } from "@/lib/currentUser";
import MessageReview from "@/components/erp/messages/MessageReview";
import NoAccess from "@/components/erp/NoAccess";

export default async function MessageReviewPage() {
  const user = await requirePermission("messages.review");
  if (!user) return <NoAccess />;
  return <MessageReview meId={user.id} />;
}
