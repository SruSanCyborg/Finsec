"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, Play, StopCircle, Volume2 } from "lucide-react";
import { api } from "@/lib/mock/api";
import { Button } from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { SeverityBadge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/ui/PageHeader";
import { cn } from "@/lib/utils";
import { formatDateTime, timeAgo } from "@/lib/utils";
import type { CallAlert } from "@/types";

const STATUS_CLS: Record<CallAlert["status"], string> = {
  ringing: "border-severity-critical/25 bg-severity-critical/10 text-severity-critical",
  delivered: "border-accent/25 bg-accent/10 text-accent",
  acknowledged: "border-severity-pass/25 bg-severity-pass/10 text-severity-pass",
  escalated: "border-severity-medium/25 bg-severity-medium/10 text-severity-medium",
  resolved: "border-line bg-raise text-zinc-400",
};

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<CallAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<CallAlert | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);

  useEffect(() => {
    api.alerts.list().then((r) => { setAlerts(r); setLoading(false); });
  }, []);

  async function play(id: string) {
    setPlaying(id);
    await new Promise((r) => setTimeout(r, 1200));
    await api.alerts.update(id, "acknowledged", "demo@sirius.dev");
    setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, status: "acknowledged" } : a)));
    setPlaying(null);
  }

  const cols: Column<CallAlert>[] = [
    { key: "title", header: "Alert", render: (a) => <span className="font-medium text-zinc-200">{a.title}</span> },
    { key: "severity", header: "Severity", render: (a) => <SeverityBadge severity={a.severity} /> },
    { key: "status", header: "Status", render: (a) => <span className={cn("rounded-full border px-2.5 py-0.5 text-[10px] font-medium uppercase", STATUS_CLS[a.status])}>{a.status}</span> },
    { key: "recipient", header: "Recipient", render: (a) => <span className="text-zinc-400">{a.recipient}</span> },
    { key: "triggeredAt", header: "When", render: (a) => <span className="whitespace-nowrap text-xs text-zinc-500">{timeAgo(a.triggeredAt)}</span> },
    { key: "play", header: "", render: (a) => (
      <div className="flex items-center justify-end gap-1">
        {a.status === "ringing" && (
          <button onClick={(e) => { e.stopPropagation(); play(a.id); }} className="rounded-lg bg-accent/10 px-2.5 py-1.5 text-[11px] font-medium text-accent transition hover:bg-accent/20">
            <Play size={12} className="mr-1 inline" /> Pick up
          </button>
        )}
        {a.status === "acknowledged" && (
          <button onClick={(e) => { e.stopPropagation(); api.alerts.update(a.id, "resolved", "demo@sirius.dev"); setAlerts((p) => p.map((x) => (x.id === a.id ? { ...x, status: "resolved" } : x))); }} className="rounded-lg border border-line bg-raise px-2.5 py-1.5 text-[11px] font-medium text-zinc-400 transition hover:bg-white/[0.04]">
            Resolve
          </button>
        )}
        <button onClick={(e) => { e.stopPropagation(); setDetail(a); }} className="rounded-lg p-2 text-zinc-500 transition hover:bg-white/[0.04] hover:text-zinc-200" title="Transcript">
          <Volume2 size={14} />
        </button>
      </div>
    )},
  ];

  return (
    <div>
      <PageHeader
        title="Voice call alerts"
        subtitle="When a critical finding hits a money-mover, Sirius calls your phone."
        actions={
          <Link href="/settings" className="flex items-center gap-2 rounded-lg border border-line bg-raise px-4 py-2 text-sm text-zinc-200 transition hover:bg-white/[0.04]">
            <Mic size={15} /> Configure Twilio
          </Link>
        }
      />
      <DataTable columns={cols} rows={alerts} onRowClick={setDetail} empty={<div className="py-12 text-center text-sm text-zinc-500">No alerts triggered yet</div>} />

      <div className="mt-6 rounded-xl border border-line bg-panel p-4">
        <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-zinc-500">How voice alerts work</h3>
        <div className="grid grid-cols-1 gap-3 text-xs leading-relaxed text-zinc-500 sm:grid-cols-3">
          <div className="rounded-xl border border-severity-critical/20 bg-severity-critical/[0.04] p-3">
            <p className="font-semibold text-severity-critical">Critical on money-mover</p>
            <p className="mt-1">Findings on payment APIs, vaults, ledger or auth services trigger an immediate voice call via Twilio.</p>
          </div>
          <div className="rounded-xl border border-accent/20 bg-accent/[0.04] p-3">
            <p className="font-semibold text-accent">On-call escalation</p>
            <p className="mt-1">If not acknowledged in 5 minutes, the call escalates to the next engineer on-call rotation.</p>
          </div>
          <div className="rounded-xl border border-line bg-raise p-3">
            <p className="font-semibold text-zinc-300">Twilio integration</p>
            <p className="mt-1">Connect your Twilio account in Settings. Mock mode simulates the full call lifecycle without a real phone.</p>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {detail && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setDetail(null)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="w-full max-w-xl rounded-xl border border-line bg-panel p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-medium text-zinc-100">{detail.title}</h2>
                  <p className="mt-1 text-xs text-zinc-500">Triggered {timeAgo(detail.triggeredAt)} · Voice call to {detail.recipient}</p>
                </div>
                <button onClick={() => setDetail(null)} className="rounded-lg border border-line p-2 text-zinc-400 transition hover:bg-white/[0.04]">
                  <StopCircle size={15} />
                </button>
              </div>
              <div className="mt-4 flex gap-2">
                <SeverityBadge severity={detail.severity} />
                <span className={cn("rounded-full border px-2.5 py-0.5 text-[10px] font-medium uppercase", STATUS_CLS[detail.status])}>
                  {detail.status}
                </span>
              </div>
              <div className="mt-5 rounded-xl border border-line bg-raise p-4">
                <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500">Mock transcript</h3>
                <div className="space-y-2 font-mono text-[11px] leading-relaxed">
                  {detail.transcript.map((line, i) => (
                    <div key={i} className={cn("rounded-lg px-3.5 py-2.5 text-sm", line.startsWith("SIRIUS") ? "bg-zinc-800/50 text-zinc-300" : "ml-6 bg-accent/10 text-zinc-200")}>
                      {line}
                    </div>
                  ))}
                </div>
                <div className="mt-4 rounded-lg border border-line p-3 font-mono text-[11px] text-zinc-500">
                  <p>{`> Twilio connects to ${detail.phone}`}</p>
                  <p>{`> Call duration: ${detail.status === "resolved" || detail.status === "acknowledged" ? "2m 14s" : "Ringing..."}`}</p>
                </div>
                <p className="mt-3 text-center text-[10px] text-zinc-600">(Mock transcript — Twilio Voice integration supplies real audio)</p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
