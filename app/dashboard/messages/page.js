import { requireStaff } from "@/lib/currentUser";
import MessagesApp from "@/components/erp/messages/MessagesApp";
import NoAccess from "@/components/erp/NoAccess";

export default async function MessagesPage() {
  const user = await requireStaff();
  if (!user) return <NoAccess />;
  return <MessagesApp meId={user.id} canAnnounce={user.permissions.includes("messages.announce")} />;
}
