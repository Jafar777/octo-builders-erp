import { redirect } from "next/navigation";

// Moved into the System page (older links).
export default function AuditPage() {
  redirect("/dashboard/system?tab=audit");
}
