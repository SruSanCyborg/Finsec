"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BellRing, DollarSign, Flag, Radar, ShieldCheck, TrendingDown } from "lucide-react";
import { api } from "@/lib/mock/api";
import { PageHeader, SeverityPill } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Card, CardTitle, Spinner } from "@/components/ui/primitives";
import { SeverityBadge } from "@/components/ui/Badge";
import { SEVERITY_ORDER } from "@/lib/constants";
import { formatMoney, timeAgo } from "@/lib/utils";
import type { CallAlert, Finding } from "@/types";

const SEV_FILL: Record<string, string> = {
  critical: "#E5484D",
  high: "#E8874E",
  medium: "#E3B341",
  low: "#5CA7FF",
  info: "#8E8E93",
};

type Summary = Awaited<ReturnType<typeof api.risk.summary>>;

export default function DashboardPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [recent, setRecent] = useState<Finding[]>([]);
  const [alerts, setAlerts] = useState<CallAlert[]>([]);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      api.risk.summary().then((s) => active && setSummary(s));
      api.findings.list().then((f) => active && setRecent(f.slice(0, 6)));
    };
    refresh();
    const unsub = api.alerts.subscribe(setAlerts);
    api.alerts.list().then(setAlerts);
    // Real mode: live events refresh the KPIs when a scan completes (incl. CLI).
    const live = api.live?.subscribe?.({
      onDone: refresh,
      onFinding: () => refresh(),
    });
    return () => {
      active = false;
      unsub();
      live?.();
    };
  }, []);

  if (!summary) return <Spinner className="min-h-[60vh]" />;

  const donut = SEVERITY_ORDER.filter((s) => summary.bySeverity[s] > 0).map((s) => ({ name: s, value: summary.bySeverity[s] }));
  const trend = summary.trend.slice(-30);

  return (
    <div>
      <PageHeader
        title="Security posture"
        subtitle="Live view across 8 assets"
        actions={
          <Link href="/scans" className="flex items-center gap-2 rounded-lg border border-line bg-raise px-4 py-2 text-sm text-zinc-200 transition hover:bg-white/[0.04]">
            <Radar size={15} /> Run a scan
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Money at risk" value={summary.moneyAtRisk} format={(n) => formatMoney(n)} delta="$1.2M vs last week" deltaUp={false} icon={<DollarSign size={16} />} accent="rose" />
        <StatCard label="Open findings" value={summary.openCount} delta="4 critical need attention" deltaUp={false} icon={<Flag size={16} />} accent="amber" />
        <StatCard label="Mean time to remediate" value={summary.mttrDays} suffix=" days" delta="1.8d faster" icon={<TrendingDown size={16} />} accent="emerald" />
        <StatCard label="Asset coverage" value={summary.coverage} format={(n) => `${n.toFixed(1)}%`} delta="8/8 assets onboarded" icon={<ShieldCheck size={16} />} accent="cyan" />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardTitle right={<span className="text-xs text-zinc-500">90-day trend</span>}>Money-at-risk trend</CardTitle>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                <defs>
                  <linearGradient id="riskFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#C8A96A" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#C8A96A" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: "#63636B", fontSize: 10 }} tickFormatter={(v: string) => v.slice(5)} axisLine={false} tickLine={false} minTickGap={28} />
                <YAxis tick={{ fill: "#63636B", fontSize: 10 }} tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} axisLine={false} tickLine={false} width={40} />
                <Tooltip
                  contentStyle={{ background: "#0C0C0E", border: "1px solid #1E1E22", borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: "#71717A" }}
                  formatter={(v: number | string) => formatMoney(Number(v))}
                />
                <Area type="monotone" dataKey="risk" stroke="#C8A96A" strokeWidth={1.5} fill="url(#riskFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardTitle right={<Link href="/findings" className="text-xs text-zinc-400 hover:text-zinc-200">View all</Link>}>Findings by severity</CardTitle>
          <div className="flex h-64 items-center">
            <div className="h-full w-1/2">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                <Pie data={donut} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="88%" paddingAngle={3} strokeWidth={0}>
                  {donut.map((d) => (
                    <Cell key={d.name} fill={SEV_FILL[d.name]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: "#0C0C0E", border: "1px solid #1E1E22", borderRadius: 8, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1 space-y-2.5">
              {SEVERITY_ORDER.map((s) => (
                <SeverityPill key={s} n={summary.bySeverity[s]} severity={s} />
              ))}
            </div>
          </div>
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card>
          <CardTitle>Findings by category</CardTitle>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={summary.byCategory} layout="vertical" margin={{ left: 8, right: 8 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.04)" horizontal={false} />
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="category" tick={{ fill: "#71717A", fontSize: 11 }} axisLine={false} tickLine={false} width={82} />
                <Tooltip contentStyle={{ background: "#0C0C0E", border: "1px solid #1E1E22", borderRadius: 8, fontSize: 12 }} cursor={{ fill: "rgba(255,255,255,0.02)" }} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]} fill="#C8A96A" barSize={14} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="xl:col-span-2">
          <CardTitle right={<Link href="/alerts" className="text-xs text-zinc-400 hover:text-zinc-200">Alert console</Link>}>Live activity</CardTitle>
          <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
            {alerts.slice(0, 3).map((a) => (
              <motion.div key={a.id} layout initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3 rounded-lg border border-line bg-raise px-3 py-2.5">
                <span className={`rounded-lg p-2 ${a.severity === "critical" ? "bg-severity-critical/10 text-severity-critical" : "bg-severity-high/10 text-severity-high"}`}>
                  <BellRing size={14} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-zinc-200">{a.title}</p>
                  <p className="text-[11px] text-zinc-500">Voice call → {a.recipient} · {timeAgo(a.triggeredAt)}</p>
                </div>
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase ${a.status === "ringing" ? "border-severity-critical/25 bg-severity-critical/10 text-severity-critical" : a.status === "acknowledged" ? "border-severity-pass/25 bg-severity-pass/10 text-severity-pass" : "border-line bg-raise text-zinc-400"}`}>
                  {a.status}
                </span>
              </motion.div>
            ))}
            {recent.slice(0, 3).map((f) => (
              <Link key={f.id} href={`/findings/${f.id}`} className="flex items-center gap-3 rounded-lg border border-line bg-raise px-3 py-2.5 transition hover:border-line-strong">
                <span className="rounded-lg bg-zinc-200/[0.04] p-2 text-zinc-400">
                  <Flag size={14} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-zinc-200">{f.title}</p>
                  <p className="font-mono text-[11px] text-zinc-500">{f.key} · {timeAgo(f.detectedAt)}</p>
                </div>
                <SeverityBadge severity={f.severity} />
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
