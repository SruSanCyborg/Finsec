"use client";

import { BellRing, BrainCircuit, Satellite, Settings2, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Notification } from "@/types";

const MAP: Record<Notification["kind"], { Icon: typeof Users; cls: string }> = {
  alert: { Icon: BellRing, cls: "text-severity-critical bg-severity-critical/10" },
  scan: { Icon: Satellite, cls: "text-zinc-300 bg-zinc-200/[0.06]" },
  team: { Icon: Users, cls: "text-accent bg-accent/10" },
  system: { Icon: Settings2, cls: "text-zinc-400 bg-zinc-200/[0.04]" },
  ai: { Icon: BrainCircuit, cls: "text-severity-pass bg-severity-pass/10" },
};

/** Lucide icon for a notification kind — emojis are never used in this codebase. */
export function KindIcon({ kind, size = 15, className }: { kind: Notification["kind"]; size?: number; className?: string }) {
  const { Icon, cls } = MAP[kind];
  return (
    <span className={cn("inline-flex shrink-0 items-center justify-center rounded-lg p-1.5", cls, className)}>
      <Icon size={size} />
    </span>
  );
}
