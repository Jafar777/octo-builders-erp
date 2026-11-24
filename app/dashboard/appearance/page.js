import { getCurrentUser } from "@/lib/currentUser";
import { isTopRole } from "@/lib/permissions";
import AppearanceStudio from "@/components/erp/appearance/AppearanceStudio";

// Everyone's own look; the CEO (as themselves) also sets the company default here.
export default async function AppearancePage() {
  const user = await getCurrentUser();
  return <AppearanceStudio canManageDefault={isTopRole(user?.role) && !user?.actingAs} />;
}
