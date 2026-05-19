import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-poppins",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "KI Kanzlei Dashboard",
    template: "%s | KI Kanzlei",
  },
  description:
    "Lead-Management, Outreach-Kampagnen und KI-Automatisierung für die KI Kanzlei. Leads finden, anreichern und kontaktieren — alles in einem Dashboard.",
  keywords: ["KI Kanzlei", "Lead Dashboard", "KI-Automatisierung", "B2B Outreach", "Lead Management"],
  authors: [{ name: "KI Kanzlei", url: "https://www.ki-kanzlei.at" }],
  openGraph: {
    title: "KI Kanzlei Dashboard",
    description: "Lead-Management, Outreach-Kampagnen und KI-Automatisierung — alles in einem Dashboard.",
    siteName: "KI Kanzlei",
    locale: "de_AT",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de" className={poppins.variable}>
      <body className="antialiased min-h-screen font-sans">
        <TooltipProvider delayDuration={300}>
          {children}
          <Toaster position="bottom-right" />
        </TooltipProvider>
      </body>
    </html>
  );
}
