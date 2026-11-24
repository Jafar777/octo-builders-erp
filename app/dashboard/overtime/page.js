import { redirect } from "next/navigation";

// Moved into the Requests page (older links and notifications still come here).
export default async function Overtime({ searchParams }) {
  const { tab } = await searchParams;
  redirect(`/dashboard/orders?type=overtime${["mine", "queue", "unrequested", "history"].includes(tab) ? `&tab=${tab}` : ""}`);
}
