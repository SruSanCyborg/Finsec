"use client";

// Dashboard reveal — the 3D system pulls back and this dashboard mockup fades
// in, showing the real product surface: active agents, transactions, risk,
// incidents, calls, exposure. Rendered with the same tokens as the app.

import { motion } from "framer-motion";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import {
  Activity,
  BellRing,
  DollarSign,
  Gauge,
  Radio,
  ShieldCheck,
} from "lucide-react";

const trend = Array.from({ length: 24 }, (_, i) => ({
  v: 28 + Math.sin(i * 0.6) * 6 + Math.sin(i * 0.17) * 9 + i * 0.4,
}));

const metrics = [
  { label: "ACTIVE AGENTS", value: "08", icon: Gauge, accent: "text-accent" },
  { label: "TRANSACTIONS / 24H", value: "1,284", icon: Activity, accent: "text-zinc-200" },
  { label: "EXPOSURE MONITORED", value: "₹24.8M", icon: DollarSign, accent: "text-zinc-200" },
  { label: "INCIDENTS CONTAINED", value: "12", icon: ShieldCheck, accent: "text-[#74c69d]" },
];

export default function DashboardReveal() {
  return (
    <div className="relative z-30 mx-auto w-full max-w-5xl px-6 lg:px-0">
      <motion.div
        initial={{ opacity: 0, y: 60, scale: 0.96 }}
        whileInView={{ opacity: 1, y: 0, scale: 1 }}
        viewport={{ once: true, margin: "-15%" }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        className="overflow-hidden rounded-2xl border border-line bg-panel/90 shadow-card backdrop-blur-xl"
      >
        {/* window chrome */}
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
            <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
            <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
            <span className="ml-3 font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
              command.siriusline.io
            </span>
          </div>
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-zinc-600">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#74c69d]" /> Live
          </div>
        </div>

        <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
          {metrics.map((m) => (
            <div key={m.label} className="rounded-lg border border-line bg-raise p-4">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">{m.label}</span>
                <m.icon size={14} className={m.accent} />
              </div>
              <p className={`mt-2 text-2xl font-medium tracking-tight ${m.accent}`}>{m.value}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-4 p-5 pt-0 lg:grid-cols-3">
          <div className="rounded-lg border border-line bg-raise p-4 lg:col-span-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">Money-at-risk trend</span>
              <span className="font-mono text-[10px] text-zinc-600">90 days</span>
            </div>
            <div className="mt-3 h-24">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend}>
                  <defs>
                    <linearGradient id="revealRisk" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#C8A96A" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#C8A96A" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="v" stroke="#C8A96A" strokeWidth={1.5} fill="url(#revealRisk)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="flex flex-col justify-between rounded-lg border border-line bg-raise p-4">
            <div>
              <span className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">Live incident</span>
              <div className="mt-3 flex items-center gap-3">
                <span className="rounded-lg bg-severity-critical/10 p-2 text-severity-critical">
                  <BellRing size={14} />
                </span>
                <div>
                  <p className="text-[13px] font-medium text-zinc-200">High-risk transfer blocked</p>
                  <p className="text-[11px] text-zinc-500">Voice call → on-call lead</p>
                </div>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
              <Radio size={11} className="text-severity-critical" /> Call ringing · 00:12
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
