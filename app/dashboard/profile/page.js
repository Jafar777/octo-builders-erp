import { getCurrentUser } from "@/lib/currentUser";
import ProfilePage from "@/components/erp/profile/ProfilePage";
import NoAccess from "@/components/erp/NoAccess";

// Open to every signed-in account: new sign-ups complete their name here too.
export default async function Profile() {
  if (!(await getCurrentUser())) return <NoAccess />;
  return <ProfilePage />;
}
