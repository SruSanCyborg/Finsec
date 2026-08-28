"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { SignIn } from "@clerk/nextjs";
import { USE_CLERK } from "@/lib/providers";
import { DEMO_CREDENTIALS } from "@/lib/constants";
import { api } from "@/lib/mock/api";
import { setSessionCookie } from "@/lib/mock/api";

/** Demo-only session: fills backend credentials and signs in. */
function DemoSessionButton({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false);

  const demoLogin = async () => {
    setBusy(true);
    try {
      const { token, user } = await api.auth.login(DEMO_CREDENTIALS.email, DEMO_CREDENTIALS.password);
      localStorage.setItem("sirius.token", token);
      setSessionCookie(token);
      toast.success(`Demo session · ${user.name}`);
      onDone();
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

export default function LoginPage() {
  const router = useRouter();
  const goDashboard = () => router.replace("/dashboard");

  return (
    <div className="card p-7">
      <h1 className="text-xl font-medium text-zinc-100">Sign in</h1>
      <p className="mb-5 mt-1 text-sm text-zinc-500">Continuous security for money that moves.</p>

      {USE_CLERK ? (
        <>
          <SignIn routing="path" path="/login" signUpUrl="/signup" />
          <div className="my-4 flex items-center gap-3">
            <span className="h-px flex-1 bg-line" />
            <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-600">demo only</span>
            <span className="h-px flex-1 bg-line" />
          </div>
          <DemoSessionButton onDone={goDashboard} />
          <p className="mt-4 text-center text-xs text-zinc-600">
            New here?{" "}
            <Link href="/signup" className="text-accent hover:underline">
              Create an account
            </Link>
          </p>
        </>
      ) : (
        <>
          <div className="mb-5 rounded-lg border border-zinc-700/50 bg-zinc-900/40 p-4">
            <p className="text-sm text-zinc-300">
              Sign-in with Clerk is not configured yet — use the demo session to explore the console.
            </p>
          </div>
          <DemoSessionButton onDone={goDashboard} />
          <p className="mt-4 text-center text-xs text-zinc-600">
            New here?{" "}
            <Link href="/signup" className="text-accent hover:underline">
              Create an account
            </Link>
          </p>
        </>
      )}
    </div>
  );
}
