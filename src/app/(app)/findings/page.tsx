"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Flag, Search } from "lucide-react";
import { api } from "@/lib/mock/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { SeverityBadge, StatusBadge } from "@/components/ui/Badge";
import { Input, Select, Spinner } from "@/components/ui/primitives";
import { SEVERITY_META } from "@/lib/constants";
import { formatMoney, timeAgo } from "@/lib/utils";
import type { Asset, Finding, FindingStatus, Severity } from "@/types";

export default function FindingsPage() {
  const router = useRouter();
  const [findings, setFindings] = useState<Finding[] | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [q, setQ] = useState("");
  const [sev, setSev] = useState("all");
  const [status, setStatus] = useState("all");
  const [asset, setAsset] = useState("all");

  useEffect(() => {
    api.findings.list().then(setFindings);
    api.assets.list().then(setAssets);
  }, []);

  const filtered = useMemo(() => {
    if (!findings) return [];
    return findings.filter((f) => {
      if (sev !== "all" && f.severity !== sev) return false;
      if (status !== "all" && f.status !== status) return false;
      if (asset !== "all" && f.assetId !== asset) return false;
      if (q) {
        const hay = `${f.title} ${f.key} ${f.description}`.toLowerCase();
        if (!hay.includes(q.toLowerCase())) return false;
      }
      return true;
    });
  }, [findings, q, sev, status, asset]);

  if (!findings) return <Spinner className="min-h-[60vh]" />;

  const assetName = (id: string) => assets.find((a) => a.id === id)?.name ?? id;

  const columns: Column<Finding>[] = [
    {
      key: "title",
      header: "Finding",
      render: (f) => (
        <div className="max-w-md">
          <p className="truncate font-medium text-zinc-200">{f.title}</p>
          <p className="font-mono text-[11px] text-zinc-500">
            {f.key} · {assetName(f.assetId)}
          </p>
        </div>
      ),
    },
    { key: "severity", header: "Severity", render: (f) => <SeverityBadge severity={f.severity} /> },
    { key: "cvss", header: "CVSS", render: (f) => <span className="font-mono text-zinc-300">{f.cvss.toFixed(1)}</span> },
    { key: "moneyAtRisk", header: "$ at risk", render: (f) => <span className="font-mono text-zinc-300">{f.moneyAtRisk ? formatMoney(f.moneyAtRisk) : "—"}</span> },
    { key: "status", header: "Status", render: (f) => <StatusBadge status={f.status} /> },
    { key: "detectedAt", header: "Detected", render: (f) => <span className="text-xs text-zinc-500">{timeAgo(f.detectedAt)}</span> },
  ];

  return (
    <div>
      <PageHeader title="Findings" subtitle={`${filtered.length} of ${findings.length} findings match your filters`} />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title, key or description…" className="pl-9" />
        </div>
        <Select value={sev} onChange={(e) => setSev(e.target.value)} className="w-auto min-w-[130px]">
          <option value="all">All severities</option>
          {(Object.keys(SEVERITY_META) as Severity[]).map((s) => (
            <option key={s} value={s}>
              {SEVERITY_META[s].label}
            </option>
          ))}
        </Select>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto min-w-[130px]">
          <option value="all">All statuses</option>
          <option value="open">Open</option>
          <option value="in_progress">In progress</option>
          <option value="resolved">Resolved</option>
          <option value="suppressed">Suppressed</option>
        </Select>
        <Select value={asset} onChange={(e) => setAsset(e.target.value)} className="w-auto min-w-[150px]">
          <option value="all">All assets</option>
          {assets.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
      </div>

      <DataTable
        columns={columns}
        rows={filtered}
        onRowClick={(f) => router.push(`/findings/${f.id}`)}
        empty={
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-white/10 py-14 text-center">
            <Flag size={28} className="text-zinc-600" />
            <p className="text-sm text-zinc-400">No findings match these filters</p>
          </div>
        }
      />
    </div>
  );
}
