import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact us",
  description:
    "Get in touch with Enzi Packaging in Nairobi — phone, WhatsApp, email and our shop address for orders, quotes and wholesale enquiries.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
