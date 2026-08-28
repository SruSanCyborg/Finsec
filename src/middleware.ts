import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Public routes: the landing page, auth pages, API routes and static assets.
// Everything else (dashboard, scans, findings, …) is protected by Clerk.
const isPublicRoute = createRouteMatcher([
  "/",
  "/login(.*)",
  "/signup(.*)",
  "/api(.*)",
  "/_next(.*)",
  "/favicon.ico",
]);

export default clerkMiddleware((auth, req) => {
  if (!isPublicRoute(req)) {
    auth().protect();
  }
});

export const config = {
  matcher: [
    // Run on everything except Next internals and static files.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
  ],
};
