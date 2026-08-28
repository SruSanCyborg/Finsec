import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "sirius — compliance linting for money-handling code",
  description:
    "AST-aware scanning that maps every finding to PCI-DSS v4.0, RBI and DPDP, prices risk in rupees, autofixes with a verified dual-LLM loop, and signs reports CI can trust.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
