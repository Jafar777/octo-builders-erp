import { requireStaff } from "@/lib/currentUser";
import { todayIn } from "@/lib/hr";
import { getSettings } from "@/lib/settings";
import MyAttendance from "@/components/erp/hr/MyAttendance";
import NoAccess from "@/components/erp/NoAccess";

export default async function AttendancePage() {
  if (!(await requireStaff())) return <NoAccess />;
  const settings = await getSettings();
  return <MyAttendance initialMonth={todayIn(settings.hr.timezone).slice(0, 7)} />;
}
