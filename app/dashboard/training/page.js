import { getCurrentUser } from "@/lib/currentUser";
import { canOpenTraining } from "@/lib/training";
import TrainingProgram from "@/components/erp/training/TrainingProgram";
import NoAccess from "@/components/erp/NoAccess";

// Trainees and the GM / CEO only; department managers and other employees can't open it.
export default async function Training() {
  const user = await getCurrentUser();
  if (!canOpenTraining(user)) return <NoAccess />;
  return <TrainingProgram />;
}
