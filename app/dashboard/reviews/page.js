import { getCurrentUser, hasPermission } from "@/lib/currentUser";
import ReviewQueue from "@/components/erp/tasks/ReviewQueue";
import NoAccess from "@/components/erp/NoAccess";

// Reviewers (department managers, GM / CEO) and customers reviewing their tasks.
export default async function ReviewsPage() {
  const user = await getCurrentUser();
  const reviewer = user?.isStaff && hasPermission(user, "tasks.review");
  if (!reviewer && !user?.isCustomer) return <NoAccess />;
  return <ReviewQueue meId={user.id} customer={!user.isStaff} />;
}
