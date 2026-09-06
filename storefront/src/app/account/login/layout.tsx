import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign in",
  description:
    "Sign in to your Enzi Packaging account to track orders, view receipts and check out faster.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
