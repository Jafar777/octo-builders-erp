import { getSiteContent } from "@/lib/siteData";
import FooterClient from "@/components/FooterClient";

export default async function Footer() {
  const { contact } = await getSiteContent();
  return <FooterClient contact={contact} />;
}
