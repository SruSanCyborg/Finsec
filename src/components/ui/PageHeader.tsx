"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-6 flex flex-wrap items-end justify-between gap-4"
    >
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-zinc-100">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-zinc-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-3">{actions}</div>}
    </motion.div>
  );
}

export function SeverityPill({ n, severity }: { n: number; severity: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
        <span
          className={cn(
            "inline-block h-2 w-2 rounded-full",
            severity === "critical" && "bg-severity-critical",
            severity === "high" && "bg-severity-high",
            severity === "medium" && "bg-severity-medium",
            severity === "low" && "bg-severity-low",
            severity === "info" && "bg-zinc-400"
          )}
        />
        <span className="font-mono text-zinc-300">{n}</span>
        <span className="capitalize text-zinc-500">{severity}</span>
    </div>
  );
}
