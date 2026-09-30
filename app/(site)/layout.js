import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export const dynamic = "force-dynamic";

export default function SiteLayout({ children }) {
  return (
    <>
      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer />
    </>
  );
}
