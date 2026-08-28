"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { DollarSign, Landmark, ShieldCheck, TrendingDown } from "lucide-react";
import { api } from "@/lib/mock/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Card, CardTitle, Spinner } from "@/components/ui/primitives";
import { SeverityBadge } from "@/components/ui/Badge";
import { formatMoney } from "@/lib/utils";

type Summary = Awaited<ReturnType<typeof api.risk.summary>>;

export default function RiskPage() {
  const [s, setS] = useState<Summary | null>(null);
  const [top, setTop] = useState<Awaited<ReturnType<typeof api.findings.list>>>([]);

  useEffect(() => {
    api.risk.summary().then(setS);
    api.findings.list().then((f) => setTop([...f].sort((a, b) => b.moneyAtRisk - a.moneyAtRisk).slice(0, 6)));
  }, []);

  if (!s) return <Spinner className="min-h-[60vh]" />;

  const removable = top.filter((f) => f.status !== "resolved").reduce((sum, f) => sum + f.moneyAtRisk, 0);

  return (
    <div>
      <PageHeader title="Money at risk" subtitle="Financial exposure quantified from open findings, asset criticality and transaction volume" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total exposure" value={s.moneyAtRisk} format={formatMoney} delta="27% vs last month" deltaUp={false} icon={<DollarSign size={16} />} accent="rose" />
        <StatCard label="Exposure on money-movers" value={s.exposureByAsset.slice(0, 2).reduce((x, y) => x + y.money, 0)} format={formatMoney} icon={<Landmark size={16} />} accent="amber" />
        <StatCard label="Removable by fixing top 6" value={removable} format={formatMoney} delta="click below to start" icon={<TrendingDown size={16} />} accent="emerald" />
        <StatCard label="Coverage" value={s.coverage} format={(n) => `${n.toFixed(1)}%`} delta="8/8 assets" icon={<ShieldCheck size={16} />} accent="cyan" />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardTitle right={<span className="text-xs text-zinc-500">90 days</span>}>Exposure trend</CardTitle>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={s.trend} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id="riskFill2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#f43f5e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(148,163,184,0.08)" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 10 }} tickFormatter={(v: string) => v.slice(5)} axisLine={false} tickLine={false} minTickGap={28} />
                <YAxis tick={{ fill: "#64748b", fontSize: 10 }} tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} axisLine={false} tickLine={false} width={40} />
                <Tooltip contentStyle={{ background: "#0a0f1a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 12 }} formatter={(v) => formatMoney(Number(v))} />
                <Area type="monotone" dataKey="risk" stroke="#f43f5e" strokeWidth={2} fill="url(#riskFill2)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardTitle>Exposure by asset</CardTitle>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={s.exposureByAsset} layout="vertical" margin={{ left: 8, right: 8 }}>
                <CartesianGrid stroke="rgba(148,163,184,0.08)" horizontal={false} />
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="asset" tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} width={96} />
                <Tooltip contentStyle={{ background: "#0a0f1a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 12 }} cursor={{ fill: "rgba(255,255,255,0.03)" }} formatter={(v) => formatMoney(Number(v))} />
                <Bar dataKey="money" radius={[0, 6, 6, 0]} fill="#fb923c" barSize={14} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card className="mt-4">
        <CardTitle right={<Link href="/findings" className="text-xs text-accent hover:text-accent">All findings</Link>}>Top financial risks</CardTitle>
        <div className="space-y-2">
          {top.map((f) => (
            <Link key={f.id} href={`/findings/${f.id}`} className="flex items-center gap-3 rounded-xl border border-line bg-raise px-3.5 py-3 transition hover:bg-white/[0.03]">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-zinc-200">{f.title}</p>
                <p className="font-mono text-[11px] text-zinc-500">{f.key}</p>
              </div>
              <SeverityBadge severity={f.severity} />
              <span className="w-20 text-right font-mono text-sm text-severity-critical">{formatMoney(f.moneyAtRisk)}</span>
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
}
