import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Checkout",
  description:
    "Complete your packaging order — choose delivery, and pay securely by M-PESA.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
