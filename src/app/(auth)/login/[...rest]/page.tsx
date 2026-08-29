"use client";

import { SignIn } from "@clerk/nextjs";
import { USE_CLERK } from "@/lib/providers";

// Clerk's path-routed sign-in steps under /login (e.g. /login/factor-two)
// render here. Same card shell as the /login page.
export default function LoginStepsPage() {
  if (!USE_CLERK) {
    return (
      <div className="card p-7">
        <h1 className="text-xl font-medium text-zinc-100">Sign in</h1>
        <p className="mb-5 mt-1 text-sm text-zinc-500">Continue signing in.</p>
      </div>
    );
  }
  return (
    <div className="card p-7">
      <h1 className="text-xl font-medium text-zinc-100">Sign in</h1>
      <p className="mb-5 mt-1 text-sm text-zinc-500">Continuous security for money that moves.</p>
      <SignIn routing="path" path="/login" signUpUrl="/signup" />
    </div>
  );
}
