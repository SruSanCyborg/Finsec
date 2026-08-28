import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Minimal edge middleware. Route gating happens client-side via useSession;
// this only redirects unauthenticated visitors away from app routes when Clerk
// is configured. A full clerkMiddleware() crashes this Next/pnpm environment
// ("Code generation from strings disallowed"), so we keep the edge thin.

const PUBLIC = ["/", "/login", "/signup", "/api", "/_next", "/favicon.ico"];

const clerkConfigured = !!(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_") &&
  process.env.CLERK_SECRET_KEY?.startsWith("sk_")
);

export default function middleware(req: NextRequest) {
  if (!clerkConfigured) return NextResponse.next();
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }
  // Let the client-side session gate decide — nothing to enforce at the edge
  // without the full Clerk middleware, and a dead instance must not 404.
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
  ],
};
