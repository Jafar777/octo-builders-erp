import { redirect } from "next/navigation";

// Moved into the HR page (older links).
export default function RecruitmentPage() {
  redirect("/dashboard/hr?tab=recruitment");
}
