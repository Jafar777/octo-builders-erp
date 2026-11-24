import {
  Almarai,
  Amiri,
  Baloo_Bhaijaan_2,
  Cairo,
  Changa,
  El_Messiri,
  Fira_Code,
  Geist,
  Geist_Mono,
  IBM_Plex_Sans_Arabic,
  Inter,
  JetBrains_Mono,
  Lalezar,
  Lexend,
  Marhey,
  Noto_Kufi_Arabic,
  Nunito,
  Orbitron,
  Playfair_Display,
  Poppins,
  Quicksand,
  Readex_Pro,
  Reem_Kufi,
  Rubik,
  Space_Grotesk,
  Tajawal,
} from "next/font/google";
import "./globals.css";
import { LanguageProvider } from "@/context/LanguageContext";
import { AuthProvider } from "@/context/AuthContext";
import { RealtimeProvider } from "@/context/RealtimeContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const tajawal = Tajawal({
  variable: "--font-tajawal",
  subsets: ["arabic", "latin"],
  weight: ["300", "400", "500", "700", "800"],
});

// The fonts people can choose on the Appearance page (lib/appearance.js). Not preloaded:
// the browser downloads one only when someone's look uses it. (next/font needs each
// call as its own const with literal options.)
const inter = Inter({ variable: "--font-inter", subsets: ["latin"], preload: false, display: "swap" });
const poppins = Poppins({ variable: "--font-poppins", subsets: ["latin"], weight: ["300", "400", "500", "600", "700"], preload: false, display: "swap" });
const rubik = Rubik({ variable: "--font-rubik", subsets: ["latin", "arabic"], preload: false, display: "swap" });
const spaceGrotesk = Space_Grotesk({ variable: "--font-space-grotesk", subsets: ["latin"], preload: false, display: "swap" });
const nunito = Nunito({ variable: "--font-nunito", subsets: ["latin"], preload: false, display: "swap" });
const quicksand = Quicksand({ variable: "--font-quicksand", subsets: ["latin"], preload: false, display: "swap" });
const lexend = Lexend({ variable: "--font-lexend", subsets: ["latin"], preload: false, display: "swap" });
const playfair = Playfair_Display({ variable: "--font-playfair", subsets: ["latin"], preload: false, display: "swap" });
const orbitron = Orbitron({ variable: "--font-orbitron", subsets: ["latin"], preload: false, display: "swap" });
const jetbrains = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"], preload: false, display: "swap" });
const firaCode = Fira_Code({ variable: "--font-fira-code", subsets: ["latin"], preload: false, display: "swap" });
const cairo = Cairo({ variable: "--font-cairo", subsets: ["arabic", "latin"], preload: false, display: "swap" });
const almarai = Almarai({ variable: "--font-almarai", subsets: ["arabic"], weight: ["300", "400", "700", "800"], preload: false, display: "swap" });
const ibmPlexArabic = IBM_Plex_Sans_Arabic({ variable: "--font-ibm-plex-arabic", subsets: ["arabic"], weight: ["300", "400", "500", "600", "700"], preload: false, display: "swap" });
const notoKufi = Noto_Kufi_Arabic({ variable: "--font-noto-kufi", subsets: ["arabic"], preload: false, display: "swap" });
const readex = Readex_Pro({ variable: "--font-readex", subsets: ["arabic", "latin"], preload: false, display: "swap" });
const changa = Changa({ variable: "--font-changa", subsets: ["arabic", "latin"], preload: false, display: "swap" });
const elMessiri = El_Messiri({ variable: "--font-el-messiri", subsets: ["arabic", "latin"], preload: false, display: "swap" });
const reemKufi = Reem_Kufi({ variable: "--font-reem-kufi", subsets: ["arabic", "latin"], preload: false, display: "swap" });
const amiri = Amiri({ variable: "--font-amiri", subsets: ["arabic", "latin"], weight: ["400", "700"], preload: false, display: "swap" });
const marhey = Marhey({ variable: "--font-marhey", subsets: ["arabic", "latin"], preload: false, display: "swap" });
const baloo = Baloo_Bhaijaan_2({ variable: "--font-baloo", subsets: ["arabic", "latin"], preload: false, display: "swap" });
const lalezar = Lalezar({ variable: "--font-lalezar", subsets: ["arabic", "latin"], weight: "400", preload: false, display: "swap" });
const extraFonts = [inter, poppins, rubik, spaceGrotesk, nunito, quicksand, lexend, playfair, orbitron, jetbrains, firaCode, cairo, almarai, ibmPlexArabic, notoKufi, readex, changa, elMessiri, reemKufi, amiri, marhey, baloo, lalezar];

export const metadata = {
  title: "Octo Builders",
  description: "Octo Builders — construction & contracting excellence.",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="ar"
      dir="rtl"
      className={`${geistSans.variable} ${geistMono.variable} ${tajawal.variable} ${extraFonts.map((f) => f.variable).join(" ")} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-brand-navy text-white">
        <LanguageProvider>
          <AuthProvider>
            <RealtimeProvider>{children}</RealtimeProvider>
          </AuthProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
