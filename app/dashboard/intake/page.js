import { getCurrentUser } from "@/lib/currentUser";
import { canProposeProject, canSeeIntakeFinance, canUseIntake, isIntakePlanner } from "@/lib/intake";
import IntakeCenter from "@/components/erp/intake/IntakeCenter";
import NoAccess from "@/components/erp/NoAccess";

// New-project intake forms: the secretary, department managers, the GM and the CEO.
export default async function IntakePage() {
  const user = await getCurrentUser();
  if (!canUseIntake(user)) return <NoAccess />;
  return <IntakeCenter planner={isIntakePlanner(user)} finance={canSeeIntakeFinance(user)} proposer={canProposeProject(user)} />;
}
