import type { Metadata } from "next";
import { Archivo, Manrope } from "next/font/google";
import "./globals.css";
import { CartProvider } from "@/lib/cart";
import { AccountProvider } from "@/lib/account";
import { ToastProvider } from "@/components/Toast";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { SocialRail, ChatButton } from "@/components/SocialRail";
import { Analytics } from "@/components/Analytics";
import { api } from "@/lib/api";
import { serverEnv } from "@/lib/runtime-env";

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
  // Fetched in parallel — the layout blocks on both, so serialising them would
  // add a round trip to every page load.
  const [categories, site] = await Promise.all([api.categories(), api.siteConfig()]);

  // Resolved on the server at request time and handed to the browser, so the
  // API address is never compiled into the bundle. Changing the Railway
  // variable and restarting is enough — no rebuild.
  const env = serverEnv();

  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`}>
      <head>
        <script
          // Must run before any client component reads it, so it goes in <head>
          // rather than being deferred to the end of the body.
          dangerouslySetInnerHTML={{
            __html: `window.__ENV__=${JSON.stringify(env)};`,
          }}
        />
      </head>
      <body>
        <Analytics gaId={site.analytics.gaId} metaPixelId={site.analytics.metaPixelId} />
        <AccountProvider>
          <CartProvider>
            <ToastProvider>
              <Header categories={categories} />
              <main className="min-h-[60vh]">{children}</main>
              <Footer />
              <SocialRail socials={site.socials} />
              <ChatButton whatsapp={site.socials.whatsapp} />
            </ToastProvider>
          </CartProvider>
        </AccountProvider>
      </body>
    </html>
  );
}
