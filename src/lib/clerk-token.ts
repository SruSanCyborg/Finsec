// ── Clerk token helper ───────────────────────────────────────────────────────
// Retrieves the Clerk session token for API requests. When Clerk is not
// configured (or the user is signed out), falls back to the stored API token.

export async function getClerkToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  try {
    // Clerk's session token is exposed via the Clerk object on window
    const clerk = (window as unknown as { Clerk?: { session?: { getToken?: () => Promise<string | null> } } }).Clerk;
    if (clerk?.session?.getToken) {
      const t = await clerk.session.getToken();
      if (t) return t;
    }
  } catch {
    /* noop */
  }
  return null;
}
