import { requirePermission, hasPermission } from "@/lib/currentUser";
import { todayIn } from "@/lib/hr";
import { loadOrg } from "@/lib/org";
import { serializeRole } from "@/lib/roles";
import { getSettings } from "@/lib/settings";
import { viewerLang } from "@/lib/personName";
import { serializeStaff, staffQueryFor } from "@/lib/staff";
import Role from "@/models/Role";
import User from "@/models/User";
import StaffManager from "@/components/erp/staff/StaffManager";
import NoAccess from "@/components/erp/NoAccess";

export default async function StaffPage() {
  const user = await requirePermission("users.view");
  if (!user) return <NoAccess />;

  const query = staffQueryFor(user);

  const [staff, roles, org, settings, lang] = await Promise.all([
    User.find(query).sort({ createdAt: -1 }).lean(),
    Role.find().sort({ createdAt: 1 }).lean(),
    loadOrg(),
    getSettings(),
    viewerLang(),
  ]);

  return (
    <StaffManager
      initialStaff={staff.map((u) => serializeStaff(u, lang))}
      roles={roles.map((r) => serializeRole(r))}
      org={JSON.parse(JSON.stringify(org))}
      canManage={hasPermission(user, "users.manage")}
      /* The employee file (HR data, salary, documents) is for HR and the general manager. */
      canFile={user.isStaff && hasPermission(user, "attendance.manage")}
      month={todayIn(settings.hr.timezone).slice(0, 7)}
      currencies={settings.currencies}
      meId={user.id}
    />
  );
}
