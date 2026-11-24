import { redirect } from "next/navigation";

// The report builder was removed (older bookmarks).
export default function ReportsPage() {
  redirect("/dashboard");
}
