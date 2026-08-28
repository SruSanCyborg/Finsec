"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  BellRing,
  BrainCircuit,
  FileText,
  Flag,
  Gauge,
  KeyRound,
  LayoutDashboard,
  Network,
  Radar,
  ScrollText,
  Settings,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSession } from "@/lib/providers";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: Gauge },
  { href: "/scans", label: "Scans", icon: Radar },
  { href: "/findings", label: "Findings", icon: Flag },
  { href: "/risk", label: "Money at risk", icon: Activity },
  { href: "/attack-paths", label: "Attack paths", icon: Network },
  { href: "/compliance", label: "Compliance", icon: ShieldCheck },
  { href: "/alerts", label: "Call alerts", icon: BellRing },
  { href: "/reports", label: "Reports", icon: FileText },
];

const NAV_BOTTOM = [
  { href: "/team", label: "Team", icon: Users },
  { href: "/api-keys", label: "API keys", icon: KeyRound },
  { href: "/ai", label: "AI model", icon: BrainCircuit },
  { href: "/audit-log", label: "Audit log", icon: ScrollText },
  { href: "/settings", label: "Settings", icon: Settings },
];

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const Section = ({ items }: { items: typeof NAV }) => (
    <>
      {items.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={cn(
              "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
              active ? "text-zinc-100" : "text-zinc-500 hover:text-zinc-200"
            )}
          >
            {active && (
              <motion.span
                layoutId="nav-active"
                className="absolute inset-0 rounded-lg bg-raise border border-line"
                transition={{ type: "spring", damping: 30, stiffness: 380 }}
              />
            )}
            <Icon size={16} className={cn("relative shrink-0", active && "text-accent")} />
            <span className="relative">{label}</span>
          </Link>
        );
      })}
    </>
  );

  return (
    <nav className="flex flex-col gap-1">
      <Section items={NAV} />
      <div className="my-3 border-t border-line" />
      <Section items={NAV_BOTTOM} />
    </nav>
  );
}

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useSession();
  const email = user?.email ?? "";

  const content = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 pb-6 pt-5">
        <Link href="/dashboard" className="flex items-center gap-2.5" onClick={onClose}>
          <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-raise">
            <ShieldCheck size={15} className="text-accent" />
          </span>
          <span className="text-[15px] font-semibold tracking-tight text-zinc-100">
            Sirius <span className="text-accent">Line</span>
          </span>
        </Link>
        <button onClick={onClose} className="rounded-lg p-1 text-zinc-500 hover:text-zinc-200 lg:hidden">
          <X size={18} />
        </button>
      </div>

      <div className="mx-3 mb-5 rounded-lg border border-line bg-raise px-3 py-2.5">
        <p className="text-[10px] font-medium uppercase tracking-widest text-zinc-600">Workspace</p>
        <div className="mt-1 flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded bg-accent/15 text-[10px] font-bold text-accent">AC</span>
          <p className="truncate text-sm font-medium text-zinc-200">Acme Capital</p>
          <span className="ml-auto rounded border border-line bg-zinc-100/[0.04] px-1.5 py-0.5 text-[9px] font-semibold text-zinc-400">PRO</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3">
        <NavItems onNavigate={onClose} />
      </div>

      <div className="border-t border-line p-4">
        <div className="rounded-lg border border-line bg-raise p-3">
          <p className="text-xs font-medium text-zinc-200">Mock mode active</p>
          <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
            Local simulation running. Set <span className="font-mono text-zinc-400">NEXT_PUBLIC_API_URL</span> to go live.
          </p>
        </div>
        <p className="mt-3 px-1 text-[10px] text-zinc-600">v0.1.0 · {email}</p>
      </div>
    </div>
  );

  return (
    <>
      {/* desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r border-line bg-panel lg:block">
        {content}
      </aside>
      {/* mobile drawer */}
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-black/60 lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
            />
            <motion.aside
              className="fixed inset-y-0 left-0 z-50 w-64 border-r border-line bg-panel lg:hidden"
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: "spring", damping: 28, stiffness: 320 }}
            >
              {content}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
