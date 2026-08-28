import type { ReactNode } from "react";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { Providers } from "@/lib/providers";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <Providers>
      <div className="grid-bg flex min-h-screen items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <Link href="/" className="mb-8 flex items-center justify-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-raise">
              <ShieldCheck size={18} className="text-accent" />
            </span>
            <span className="text-lg font-semibold tracking-tight text-zinc-100">
              Sirius <span className="text-accent">Line</span>
            </span>
          </Link>
          {children}
          <p className="mt-8 text-center text-xs text-zinc-600">
            SOC 2 Type II · PCI DSS 4.0 ready · Data encrypted in transit &amp; at rest
          </p>
        </div>
      </div>
    </Providers>
  );
}
