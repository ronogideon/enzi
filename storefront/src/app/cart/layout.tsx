import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Your cart",
  description:
    "Review the packaging items in your cart, adjust quantities and see your total before checkout.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
