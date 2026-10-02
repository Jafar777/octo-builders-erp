import { requirePermission } from "@/lib/currentUser";
import ReviewQueue from "@/components/erp/tasks/ReviewQueue";
import NoAccess from "@/components/erp/NoAccess";

export default async function ReviewsPage() {
  const user = await requirePermission("tasks.review");
  if (!user?.isStaff) return <NoAccess />;
  return <ReviewQueue meId={user.id} />;
}
