// ── Clerk availability helper ────────────────────────────────────────────────
// Clerk's SignIn/SignUp 404 when the publishable key points at a deleted or
// non-existent instance. Detect that up front so the app can fall back to the
// backend's own auth instead of showing a broken form.
//
// A publishable key is pk_<instance>_<base64>, where the base64 decodes to the
// frontend API domain — either <name>.clerk.accounts.dev or a custom domain
// (e.g. clerk.example.com). Both are valid.

const PUBLISHABLE = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() ?? "";

/** True when a Clerk publishable key is present and structurally valid. */
export function clerkConfigured(): boolean {
  if (!PUBLISHABLE || !PUBLISHABLE.startsWith("pk_")) return false;
  const parts = PUBLISHABLE.split("_");
  if (parts.length < 3) return false;
  const domainB64 = parts[2] ?? "";
  if (!domainB64 || !/^[A-Za-z0-9+/=]+$/.test(domainB64)) return false;
  try {
    const decoded = (atob(domainB64) || "").replace(/\$$/, "");
    // A hostname (custom or clerk.accounts.dev) or a UUID-style instance id.
    return /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(decoded) || /^[a-f0-9-]{8,}$/i.test(decoded);
  } catch {
    return false;
  }
}

export const CLERK_PUBLISHABLE = PUBLISHABLE;
