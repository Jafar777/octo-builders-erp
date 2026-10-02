import { requirePermission, hasPermission } from "@/lib/currentUser";
import { loadOrg } from "@/lib/org";
import { serializeRole } from "@/lib/roles";
import { serializeStaff, staffQueryFor } from "@/lib/staff";
import Role from "@/models/Role";
import User from "@/models/User";
import StaffManager from "@/components/erp/staff/StaffManager";
import NoAccess from "@/components/erp/NoAccess";

export default async function StaffPage() {
  const user = await requirePermission("users.view");
  if (!user) return <NoAccess />;

  const query = staffQueryFor(user);

  const [staff, roles, org] = await Promise.all([
    User.find(query).sort({ createdAt: -1 }).lean(),
    Role.find().sort({ createdAt: 1 }).lean(),
    loadOrg(),
  ]);

  return (
    <StaffManager
      initialStaff={staff.map(serializeStaff)}
      roles={roles.map((r) => serializeRole(r))}
      org={JSON.parse(JSON.stringify(org))}
      canManage={hasPermission(user, "users.manage")}
      meId={user.id}
    />
  );
}
