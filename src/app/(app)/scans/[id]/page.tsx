"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, CheckCircle2, Flag, Terminal } from "lucide-react";
import { api } from "@/lib/mock/api";
import { SeverityBadge } from "@/components/ui/Badge";
import { Card, CardTitle, Spinner } from "@/components/ui/primitives";
import { SCAN_TYPE_META } from "@/lib/constants";
import { cn, formatDateTime, timeAgo } from "@/lib/utils";
import type { Finding, LogLine, Scan } from "@/types";

const LOG_CLS: Record<LogLine["level"], string> = {
  info: "text-zinc-400",
  warn: "text-severity-medium",
  error: "text-severity-critical",
  success: "text-severity-pass",
};

export default function ScanDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [scan, setScan] = useState<Scan | null>(null);
  const [liveFindings, setLiveFindings] = useState<Finding[]>([]);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const consoleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    let alive = true;

    api.scans.get(id).then((s) => {
      if (!alive || !s) return;
      setScan(s);
      setLogs(s.logs);
      // findings already issued by this scan
      api.findings.list().then((all) => {
        if (alive) setLiveFindings(all.filter((f) => f.scanId === id).reverse());
      });
      if (s.status === "running") {
        unsub = api.scans.stream(id, {
          onProgress: (sc) => setScan({ ...sc }),
          onLog: (l) => setLogs((prev) => [...prev, l]),
          onFinding: (f) => setLiveFindings((prev) => [f, ...prev]),
          onDone: (sc) => {
            setScan({ ...sc });
            api.findings.list().then((all) => setLiveFindings(all.filter((x) => x.scanId === id).reverse()));
          },
        });
      }
    });

    return () => {
      alive = false;
      unsub?.();
    };
  }, [id]);

  useEffect(() => {
    consoleRef.current?.scrollTo({ top: consoleRef.current.scrollHeight });
  }, [logs]);

  if (!scan) return <Spinner className="min-h-[60vh]" />;

  const running = scan.status === "running";

  return (
    <div>
      <Link href="/scans" className="mb-4 inline-flex items-center gap-1.5 text-sm text-zinc-500 transition hover:text-zinc-200">
        <ArrowLeft size={14} /> All scans
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-2xl font-semibold text-zinc-100">{scan.name}</h1>
            {running ? (
              <span className="flex items-center gap-1.5 rounded-full border border-gold/30 bg-gold/10 px-2.5 py-0.5 text-[11px] font-medium text-gold">
                <span className="relative flex h-2 w-2">
                  <span className="absolute h-full w-full animate-ping rounded-full bg-gold opacity-70" />
                  <span className="h-2 w-2 rounded-full bg-gold" />
                </span>
                Live
              </span>
            ) : (
              <span className="flex items-center gap-1.5 rounded-full border border-severity-pass/30 bg-severity-pass/10 px-2.5 py-0.5 text-[11px] font-medium text-severity-pass">
                <CheckCircle2 size={11} /> Completed
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-zinc-500">
            {SCAN_TYPE_META[scan.type].label} · target <span className="font-mono text-zinc-400">{scan.target}</span> · by {scan.initiatedBy} · {formatDateTime(scan.startedAt)}
          </p>
        </div>
        <div className="text-right">
          <p className="font-display text-3xl font-semibold text-zinc-100">{scan.findingsIssued}</p>
          <p className="text-xs text-zinc-500">findings issued</p>
        </div>
      </div>

      {running && (
        <div className="mb-6">
          <div className="mb-1.5 flex justify-between text-xs text-zinc-400">
            <span>Analyzing…</span>
            <span className="font-mono">{Math.round(scan.progress)}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-gold to-severity-pass"
              animate={{ width: `${scan.progress}%` }}
              transition={{ ease: "easeOut", duration: 0.6 }}
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        {/* live findings feed */}
        <div className="xl:col-span-3">
          <Card>
            <CardTitle right={<span className="text-xs text-zinc-500">{liveFindings.length} shown</span>}>
              Results {running && <span className="ml-1 text-gold">· streaming</span>}
            </CardTitle>
            <div className="space-y-2">
              <AnimatePresence initial={false}>
                {liveFindings.map((f) => (
                  <motion.div key={f.id} layout initial={{ opacity: 0, y: -10, scale: 0.99 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: "spring", damping: 24, stiffness: 300 }}>
                    <Link
                      href={`/findings/${f.id}`}
                      className="flex items-center gap-3 rounded-xl border border-line bg-raise px-3.5 py-3 transition hover:border-white/[0.12] hover:bg-white/[0.03]"
                    >
                      <span className="rounded-lg bg-white/[0.03] p-2 text-zinc-400">
                        <Flag size={14} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-zinc-200">{f.title}</p>
                        <p className="font-mono text-[11px] text-zinc-500">
                          {f.key} · CVSS {f.cvss.toFixed(1)} · {timeAgo(f.detectedAt)}
                        </p>
                      </div>
                      <SeverityBadge severity={f.severity} />
                    </Link>
                  </motion.div>
                ))}
              </AnimatePresence>
              {liveFindings.length === 0 && (
                <p className="py-8 text-center text-sm text-zinc-600">
                  {running ? "Waiting for first results…" : "No findings were issued by this scan."}
                </p>
              )}
            </div>
          </Card>
        </div>

        {/* console */}
        <div className="xl:col-span-2">
          <Card className="scanline-overlay">
            <CardTitle>
              <span className="flex items-center gap-2">
                <Terminal size={14} className="text-gold" /> Engine console
              </span>
            </CardTitle>
            <div ref={consoleRef} className="h-[420px] overflow-y-auto rounded-xl border border-line bg-base p-3 font-mono text-[11px] leading-relaxed">
              {logs.map((l, i) => (
                <p key={i} className={cn("whitespace-pre-wrap", LOG_CLS[l.level])}>
                  <span className="text-zinc-600">[{new Date(l.t).toLocaleTimeString("en-US", { hour12: false })}]</span> {l.msg}
                </p>
              ))}
              {running && <p className="text-gold">▋</p>}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
