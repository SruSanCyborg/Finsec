// Shared Clerk appearance — keeps the auth components visually consistent with
// the Sirius Line dark/gold identity across every mount point.

import type { ClerkProvider } from "@clerk/nextjs";

type ClerkAppearance = NonNullable<React.ComponentProps<typeof ClerkProvider>["appearance"]>;

export const clerkAppearance: ClerkAppearance = {
  variables: {
    colorPrimary: "#C8A96A",
    colorBackground: "#050505",
    colorInputBackground: "#101013",
    colorText: "#f4f4f5",
    colorTextSecondary: "#71717A",
    borderRadius: "0.5rem",
    fontFamily: "var(--font-inter), system-ui, sans-serif",
  },
  elements: {
    card: "bg-panel border border-line shadow-xl",
    formFieldInput: "bg-[#101013] border border-line text-zinc-100",
    formButtonPrimary: "bg-zinc-100 text-zinc-950 hover:bg-white",
    socialButtonsBlockButton: "border border-line bg-raise text-zinc-200",
    footerActionLink: "text-zinc-400 hover:text-zinc-200",
  },
};
