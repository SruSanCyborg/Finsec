"use client";

import { SignUp } from "@clerk/nextjs";
import { USE_CLERK } from "@/lib/providers";

// Clerk's path-routed sign-up steps under /signup render here.
export default function SignupStepsPage() {
  if (!USE_CLERK) {
    return (
      <div className="card p-7">
        <h1 className="text-xl font-medium text-zinc-100">Create your workspace</h1>
        <p className="mb-5 mt-1 text-sm text-zinc-500">Continue creating your account.</p>
      </div>
    );
  }
  return (
    <div className="card p-7">
      <h1 className="text-xl font-medium text-zinc-100">Create your workspace</h1>
      <p className="mb-5 mt-1 text-sm text-zinc-500">Start securing your money-movers in minutes.</p>
      <SignUp routing="path" path="/signup" signInUrl="/login" />
    </div>
  );
}
