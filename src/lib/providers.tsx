"use client";

// Unified auth provider for the whole app. Wraps ClerkProvider so every layout
// and page gets Clerk context, and exposes a small Sirius-shaped session hook
// (user + org role) so the existing app code keeps working with minimal churn.

import { ClerkProvider, useUser, useOrganization } from "@clerk/nextjs";
import { createContext, useContext, type ReactNode } from "react";
import { clerkAppearance } from "@/lib/clerk-appearance";
import type { Role } from "@/types";

/** Clerk org roles map 1:1 to the Sirius RBAC roles. */
const ROLE_MAP: Record<string, Role> = {
  owner: "owner",
  admin: "admin",
  analyst: "analyst",
  member: "member",
  viewer: "viewer",
};

export function clerkRoleToSirius(role: string | null | undefined): Role | undefined {
  if (!role) return undefined;
  return ROLE_MAP[role] ?? undefined;
}

interface SiriusSession {
  user: ReturnType<typeof useUser>["user"];
  role: Role | undefined;
  isSignedIn: boolean;
  isLoaded: boolean;
}

const Ctx = createContext<SiriusSession>({
  user: null,
  role: undefined,
  isSignedIn: false,
  isLoaded: false,
});

function SessionBridge({ children }: { children: ReactNode }) {
  const { user, isLoaded: userLoaded, isSignedIn } = useUser();
  const { membership, isLoaded: orgLoaded } = useOrganization();

  const role = clerkRoleToSirius(membership?.role);
  const isLoaded = userLoaded && orgLoaded;

  return (
    <Ctx.Provider value={{ user, role, isSignedIn: !!isSignedIn, isLoaded }}>
      {children}
    </Ctx.Provider>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider
      publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}
      appearance={clerkAppearance}
    >
      <SessionBridge>{children}</SessionBridge>
    </ClerkProvider>
  );
}

export function useSession() {
  return useContext(Ctx);
}

/** Sirius-shaped view of the current user: name/email/role/id in the shape the
 *  app pages already expect, plus the raw Clerk user for anything richer. */
export function useSiriusUser() {
  const { user, role } = useSession();
  return {
    name: user?.fullName ?? user?.firstName ?? user?.username ?? user?.primaryEmailAddress?.emailAddress ?? "You",
    email: user?.primaryEmailAddress?.emailAddress ?? "",
    role,
    id: user?.id,
  };
}
