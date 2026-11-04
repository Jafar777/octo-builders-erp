import { redirect } from "next/navigation";

// Message review is part of the Messages page now.
export default function MessageReviewPage() {
  redirect("/dashboard/messages?view=review");
}
