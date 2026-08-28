"use client";

// Unified auth provider for the whole app.
//
// When a valid Clerk publishable key is configured, wraps ClerkProvider and
// exposes the Clerk session. When Clerk is NOT configured (missing or dead
// key — which makes Clerk's own SignIn/SignUp 404), falls back to the Sirius
// backend session: the mock store in mock mode, or the Core API token in real
// mode. Both expose the same { user, role, isSignedIn, isLoaded } shape so the
// rest of the app is unchanged.

import { ClerkProvider, useUser, useOrganization } from "@clerk/nextjs";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { clerkAppearance } from "@/lib/clerk-appearance";
import { clerkConfigured } from "@/lib/clerk-available";
import { api } from "@/lib/mock/api";
import type { Role, User } from "@/types";

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

export const USE_CLERK = clerkConfigured();

interface SiriusSession {
  user: User | null;
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

// ── Clerk-backed session ─────────────────────────────────────────────────────

function ClerkSessionBridge({ children }: { children: ReactNode }) {
  const { user: clerkUser, isLoaded: userLoaded, isSignedIn } = useUser();
  const { membership, isLoaded: orgLoaded } = useOrganization();

  const role = clerkRoleToSirius(membership?.role);
  const isLoaded = userLoaded && orgLoaded;

  const user: User | null = clerkUser
    ? {
        id: clerkUser.id,
        name: clerkUser.fullName ?? clerkUser.firstName ?? clerkUser.username ?? clerkUser.primaryEmailAddress?.emailAddress ?? "You",
        email: clerkUser.primaryEmailAddress?.emailAddress ?? "",
        role: role ?? "member",
        color: "#22d3ee",
        mfa: false,
      }
    : null;

  return (
    <Ctx.Provider value={{ user, role, isSignedIn: !!isSignedIn, isLoaded }}>
      {children}
    </Ctx.Provider>
  );
}

// ── Backend session (no Clerk) ───────────────────────────────────────────────

function BackendSessionBridge({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<{ user: User | null; loaded: boolean }>({
    user: null,
    loaded: false,
  });

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const token =
          localStorage.getItem("sirius.token") ??
          (await import("@/lib/real/api")).getApiToken();
        if (!token) {
          if (active) setSession({ user: null, loaded: true });
          return;
        }
        const user = await api.auth.me(token);
        if (active) setSession({ user, loaded: true });
      } catch {
        if (active) setSession({ user: null, loaded: true });
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const user = session.user;
  const role = user?.role;

  return (
    <Ctx.Provider value={{ user, role, isSignedIn: !!user, isLoaded: session.loaded }}>
      {children}
    </Ctx.Provider>
  );
}

// ── Top-level provider ───────────────────────────────────────────────────────

export function Providers({ children }: { children: ReactNode }) {
  if (!USE_CLERK) {
    return <BackendSessionBridge>{children}</BackendSessionBridge>;
  }
  return (
    <ClerkProvider
      publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}
      appearance={clerkAppearance}
    >
      <ClerkSessionBridge>{children}</ClerkSessionBridge>
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
    name: user?.name ?? "You",
    email: user?.email ?? "",
    role,
    id: user?.id,
  };
}
