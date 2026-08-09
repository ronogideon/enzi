import type { Metadata } from "next";
import { Archivo, Manrope } from "next/font/google";
import "./globals.css";
import { CartProvider } from "@/lib/cart";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { SocialRail, ChatButton } from "@/components/SocialRail";
import { api } from "@/lib/api";

const display = Archivo({
  subsets: ["latin"],
  weight: ["600", "700", "800", "900"],
  variable: "--font-display",
  display: "swap",
});
const sans = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Enzi Packaging — Premium packaging for e-commerce in Kenya",
    template: "%s · Enzi Packaging",
  },
  description:
    "Premium, sustainable packaging solutions — mailers, kraft bags, organza bags, polymailers and more. Delivered across Kenya.",
};

// Render at request time so pages always reflect live catalogue/pricing.
export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const categories = await api.categories();

  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`}>
      <body>
        <CartProvider>
          <Header categories={categories} />
          <main className="min-h-[60vh]">{children}</main>
          <Footer />
          <SocialRail />
          <ChatButton />
        </CartProvider>
      </body>
    </html>
  );
}
