"use client";

import Link from "next/link";
import { SignUp } from "@clerk/nextjs";
import { USE_CLERK } from "@/lib/providers";

export default function SignupPage() {
  if (!USE_CLERK) {
    return (
      <div className="card p-7">
        <h1 className="text-xl font-medium text-zinc-100">Create your workspace</h1>
        <p className="mb-5 mt-1 text-sm text-zinc-500">Start securing your money-movers in minutes.</p>
        <div className="rounded-lg border border-zinc-700/50 bg-zinc-900/40 p-4 text-sm text-zinc-300">
          Account creation is handled by Clerk — once it&apos;s configured you can sign up here. For now, use the{" "}
          <Link href="/login" className="text-accent hover:underline">
            demo session
          </Link>{" "}
          to explore.
        </div>
        <p className="mt-4 text-center text-sm text-zinc-500">
          Already have an account?{" "}
          <Link href="/login" className="text-accent hover:underline">
            Sign in
          </Link>
        </p>
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
