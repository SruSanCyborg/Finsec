"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { Spinner } from "@/components/ui/primitives";
import { Providers, useSession } from "@/lib/providers";

function AppShell({ children }: { children: React.ReactNode }) {
  const { isSignedIn, isLoaded } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.replace("/login");
    }
  }, [isLoaded, isSignedIn, router]);

  if (!isLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-400/30 border-t-zinc-400" />
          <p className="text-sm text-zinc-500">Authenticating…</p>
        </div>
      </div>
    );
  }

  if (!isSignedIn) return <Spinner className="min-h-screen" />;

  return (
    <div className="min-h-screen">
      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
      <div className="lg:pl-60">
        <Topbar onMenu={() => setMenuOpen(true)} />
        <main className="mx-auto max-w-[1400px] p-4 pb-16 lg:p-7">{children}</main>
      </div>
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <AppShell>{children}</AppShell>
    </Providers>
  );
}
