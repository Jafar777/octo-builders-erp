import { requirePermission } from "@/lib/currentUser";

// Website content editing. Kept as its own helper because the website routes
// predate the role system.
export async function requireAdmin() {
  return requirePermission("website.manage");
}
