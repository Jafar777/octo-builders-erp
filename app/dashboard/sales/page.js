import { redirect } from "next/navigation";

// Moved into the Finance page (older links).
export default async function SalesPage({ searchParams }) {
  const { tab } = await searchParams;
  redirect(`/dashboard/finance?tab=sales${tab === "quotes" ? "&view=quotes" : ""}`);
}
