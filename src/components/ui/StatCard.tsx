"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/primitives";

/** Stat card with a GSAP-driven count-up when value is numeric. */
export function StatCard({
  label,
  value,
  delta,
  deltaUp,
  icon,
  accent = "cyan",
  prefix = "",
  suffix = "",
  format,
}: {
  label: string;
  value: number | string;
  delta?: string;
  deltaUp?: boolean;
  icon?: React.ReactNode;
  accent?: "cyan" | "rose" | "amber" | "emerald" | "violet";
  prefix?: string;
  suffix?: string;
  format?: (n: number) => string;
}) {
  const numRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (typeof value !== "number" || !numRef.current) return;
    const obj = { n: 0 };
    const tween = gsap.to(obj, {
      n: value,
      duration: 1.4,
      ease: "power3.out",
      onUpdate: () => {
        if (numRef.current) numRef.current.textContent = format ? format(obj.n) : Math.round(obj.n).toLocaleString();
      },
    });
    return () => {
      tween.kill();
    };
  }, [value, format]);

  const accentCls = {
    cyan: "text-zinc-300 bg-zinc-200/[0.06]",
    rose: "text-severity-critical bg-severity-critical/10",
    amber: "text-severity-medium bg-severity-medium/10",
    emerald: "text-severity-pass bg-severity-pass/10",
    violet: "text-accent bg-accent/10",
  }[accent];

  return (
    <Card className="relative overflow-hidden">
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">{label}</p>
        {icon && <span className={cn("rounded-lg p-2", accentCls)}>{icon}</span>}
      </div>
      <p className="mt-3 font-display text-3xl font-semibold tracking-tight text-zinc-100">
        {typeof value === "number" ? (
          <>
            {prefix}
            <span ref={numRef}>{format ? format(0) : "0"}</span>
            {suffix}
          </>
        ) : (
          value
        )}
      </p>
      {delta && (
        <p className={cn("mt-2 flex items-center gap-1 text-xs", deltaUp === false ? "text-severity-critical" : "text-severity-pass")}>
          {deltaUp === false ? <TrendingDown size={12} /> : <TrendingUp size={12} />} {delta}
        </p>
      )}
    </Card>
  );
}
