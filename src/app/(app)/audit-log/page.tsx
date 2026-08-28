"use client";

import { useEffect, useMemo, useState } from "react";
import { ScrollText, Search } from "lucide-react";
import { api } from "@/lib/mock/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Input, Select, Spinner } from "@/components/ui/primitives";
import { formatDateTime } from "@/lib/utils";
import type { AuditEvent } from "@/types";

const ACTION_CLS = (a: string) =>
  a.startsWith("alert") ? "text-severity-critical" : a.startsWith("key") ? "text-severity-medium" : a.startsWith("team") ? "text-zinc-300" : a.startsWith("scan") ? "text-accent" : "text-zinc-300";

export default function AuditLogPage() {
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [q, setQ] = useState("");
  const [action, setAction] = useState("all");

  useEffect(() => {
    api.auditLog.list().then(setEvents);
  }, []);

  const actions = useMemo(() => {
    if (!events) return [];
    return [...new Set(events.map((e) => e.action.split(".")[0]))].sort();
  }, [events]);

  const filtered = useMemo(() => {
    if (!events) return [];
    return events.filter((e) => {
      if (action !== "all" && !e.action.startsWith(action)) return false;
      if (q) {
        const hay = `${e.actor} ${e.action} ${e.target}`.toLowerCase();
        if (!hay.includes(q.toLowerCase())) return false;
      }
      return true;
    });
  }, [events, q, action]);

  if (!events) return <Spinner className="min-h-[60vh]" />;

  const columns: Column<AuditEvent>[] = [
    { key: "at", header: "When", render: (e) => <span className="whitespace-nowrap text-xs text-zinc-500">{formatDateTime(e.at)}</span> },
    { key: "actor", header: "Actor", render: (e) => <span className="text-zinc-300">{e.actor}</span> },
    { key: "action", header: "Action", render: (e) => <span className={`font-mono text-xs ${ACTION_CLS(e.action)}`}>{e.action}</span> },
    { key: "target", header: "Target", render: (e) => <span className="text-zinc-400">{e.target}</span> },
    { key: "meta", header: "Meta", render: (e) => (e.meta ? <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">{e.meta}</span> : <span className="text-zinc-700">—</span>) },
  ];

  return (
    <div>
      <PageHeader title="Audit log" subtitle="Tamper-evident record of every security-relevant action" />

      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search actor, action or target…" className="pl-9" />
        </div>
        <Select value={action} onChange={(e) => setAction(e.target.value)} className="w-auto min-w-[150px]">
          <option value="all">All categories</option>
          {actions.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </Select>
      </div>

      <DataTable
        columns={columns}
        rows={filtered}
        empty={
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-line py-14 text-center">
            <ScrollText size={28} className="text-zinc-600" />
            <p className="text-sm text-zinc-500">No audit events match</p>
          </div>
        }
      />
    </div>
  );
}
