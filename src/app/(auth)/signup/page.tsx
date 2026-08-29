"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { SignUp } from "@clerk/nextjs";
import { DEMO_CREDENTIALS } from "@/lib/constants";
import { api } from "@/lib/mock/api";
import { setSessionCookie } from "@/lib/mock/api";

function DemoSessionButton() {
  const [busy, setBusy] = useState(false);
  const demoLogin = async () => {
    setBusy(true);
    try {
      const { token, user } = await api.auth.login(DEMO_CREDENTIALS.email, DEMO_CREDENTIALS.password);
      localStorage.setItem("sirius.token", token);
      setSessionCookie(token);
      toast.success(`Demo session · ${user.name}`);
      window.location.href = "/dashboard";
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Demo login failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      onClick={demoLogin}
      disabled={busy}
      className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-accent/40 bg-accent/[0.04] px-4 py-2.5 font-mono text-xs text-accent transition hover:bg-accent/10 disabled:opacity-50"
    >
      {busy ? "Starting demo…" : "Try the demo session →"}
    </button>
  );
}

export default function SignupPage() {
  return (
    <div className="card p-7">
      <h1 className="text-xl font-medium text-zinc-100">Create your workspace</h1>
      <p className="mb-5 mt-1 text-sm text-zinc-500">Start securing your money-movers in minutes.</p>
      {/* The default widget renders Clerk's Smart CAPTCHA natively — required
          when bot sign-up protection is enabled (a custom useSignUp flow 422s
          because the invisible CAPTCHA can't complete). Phone is hidden so the
          unsupported +91 SMS provider never blocks sign-up. */}
      <SignUp
        routing="path"
        path="/signup"
        signInUrl="/login"
        appearance={{
          elements: {
            formFieldInput__phoneNumber: { display: "none" },
            formFieldRow__phoneNumber: { display: "none" },
          },
        }}
      />
      <div className="my-4 flex items-center gap-3">
        <span className="h-px flex-1 bg-line" />
        <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-600">demo only</span>
        <span className="h-px flex-1 bg-line" />
      </div>
      <DemoSessionButton />
      <p className="mt-4 text-center text-sm text-zinc-500">
        Already have an account?{" "}
        <Link href="/login" className="text-accent hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
