import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "My account",
  description:
    "Your Enzi Packaging orders, delivery status and receipts.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
