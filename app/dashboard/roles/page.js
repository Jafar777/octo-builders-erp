import { redirect } from "next/navigation";

// Moved into the System page (older links).
export default async function RolesPage({ searchParams }) {
  const { tab } = await searchParams;
  redirect(`/dashboard/system?tab=roles${["matrix", "people", "history"].includes(tab) ? `&view=${tab}` : ""}`);
}
