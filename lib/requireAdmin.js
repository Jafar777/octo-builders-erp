import { getSession } from "@/lib/auth";

export async function requireAdmin() {
  const session = await getSession();
  if (!session || session.role !== "admin") return null;
  return session;
}
