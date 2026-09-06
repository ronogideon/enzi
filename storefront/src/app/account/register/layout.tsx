import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Create an account",
  description:
    "Create an Enzi Packaging account for faster checkout and to keep your order history in one place.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
