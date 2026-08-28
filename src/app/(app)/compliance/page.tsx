"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, MinusCircle, XCircle } from "lucide-react";
import { api } from "@/lib/mock/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, Spinner } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import type { Framework } from "@/types";

type FW = Framework & { score: number; failing: string[] };

function ScoreRing({ score, size = 84 }: { score: number; size?: number }) {
  const r = (size - 10) / 2;
  const c = 2 * Math.PI * r;
  const color = score >= 85 ? "#34d399" : score >= 65 ? "#fbbf24" : "#f43f5e";
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={7} />
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={7}
        strokeLinecap="round"
        strokeDasharray={c}
        initial={{ strokeDashoffset: c }}
        animate={{ strokeDashoffset: c - (c * score) / 100 }}
        transition={{ duration: 1.2, ease: "easeOut" }}
      />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" transform={`rotate(90 ${size / 2} ${size / 2})`} fill={color} fontSize={18} fontWeight={600} fontFamily="var(--font-display)">
        {score}
      </text>
    </svg>
  );
}

export default function CompliancePage() {
  const [frameworks, setFrameworks] = useState<FW[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    api.compliance.frameworks().then(setFrameworks);
  }, []);

  if (!frameworks) return <Spinner className="min-h-[60vh]" />;

  const avg = Math.round(frameworks.reduce((s, f) => s + f.score, 0) / frameworks.length);

  return (
    <div>
      <PageHeader title="Compliance" subtitle={`${frameworks.length} frameworks monitored · average posture ${avg}%`} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {frameworks.map((fw) => (
          <Card key={fw.id} className="cursor-pointer transition hover:border-white/[0.14]" onClick={() => setOpen(open === fw.id ? null : fw.id)}>
            <div className="flex items-start gap-4">
              <ScoreRing score={fw.score} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <h3 className="font-display text-base font-semibold text-zinc-100">{fw.name}</h3>
                  <span className="text-xs text-zinc-500">{fw.version}</span>
                </div>
                <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-zinc-500">{fw.description}</p>
                <div className="mt-2.5 flex gap-3 text-xs">
                  <span className="text-zinc-400">
                    {fw.controls.length} controls
                  </span>
                  <span className="text-severity-critical">{fw.failing.length} failing</span>
                </div>
              </div>
            </div>

            {open === fw.id && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="mt-4 space-y-1.5 overflow-hidden border-t border-line pt-4">
                {fw.controls.map((c) => (
                  <div key={c.id} className="flex items-center gap-2.5 text-xs">
                    {c.status === "pass" ? (
                      <CheckCircle2 size={13} className="shrink-0 text-severity-pass" />
                    ) : c.status === "partial" ? (
                      <MinusCircle size={13} className="shrink-0 text-severity-medium" />
                    ) : (
                      <XCircle size={13} className="shrink-0 text-severity-critical" />
                    )}
                    <span className={cn("font-mono text-[10px]", c.status === "pass" ? "text-zinc-600" : "text-zinc-400")}>{c.id}</span>
                    <span className={cn("truncate", c.status === "pass" ? "text-zinc-500" : "text-zinc-300")}>{c.title}</span>
                  </div>
                ))}
              </motion.div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
