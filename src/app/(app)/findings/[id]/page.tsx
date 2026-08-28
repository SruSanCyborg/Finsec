"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Bug, CheckCircle2, DollarSign, FileCode2, ShieldOff, Zap } from "lucide-react";
import { api } from "@/lib/mock/api";
import { useSiriusUser } from "@/lib/providers";
import { can } from "@/lib/constants";
import { SeverityBadge, StatusBadge } from "@/components/ui/Badge";
import { Button, Card, CardTitle, Spinner } from "@/components/ui/primitives";
import { formatDateTime, formatMoney, timeAgo } from "@/lib/utils";
import type { Asset, Finding, FindingStatus } from "@/types";

const STATUS_FLOW: FindingStatus[] = ["open", "in_progress", "resolved"];

export default function FindingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const user = useSiriusUser();
  const [finding, setFinding] = useState<Finding | null>(null);
  const [asset, setAsset] = useState<Asset | null>(null);
  const [busy, setBusy] = useState(false);

  async function reload() {
    const f = await api.findings.get(id);
    setFinding(f ?? null);
    if (f) {
      const assets = await api.assets.list();
      setAsset(assets.find((a) => a.id === f.assetId) ?? null);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!finding) return <Spinner className="min-h-[60vh]" />;

  async function setStatus(status: FindingStatus) {
    setBusy(true);
    try {
      await api.findings.setStatus(finding!.id, status, user?.name ?? "You");
      await reload();
      toast.success(`Finding marked ${status.replace("_", " ")}`);
    } finally {
      setBusy(false);
    }
  }

  async function suppress() {
    setBusy(true);
    try {
      await api.findings.suppress(finding!.id, "Suppressed from finding detail", "this_finding", user?.name ?? "You");
      await reload();
      toast.success("Finding suppressed");
    } finally {
      setBusy(false);
    }
  }

  const editable = can(user?.role, "findings:manage");

  return (
    <div>
      <Link href="/findings" className="mb-4 inline-flex items-center gap-1.5 text-sm text-zinc-500 transition hover:text-zinc-200">
        <ArrowLeft size={14} /> All findings
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <div className="flex flex-wrap items-center gap-2.5">
            <SeverityBadge severity={finding.severity} />
            <StatusBadge status={finding.status} />
            <span className="font-mono text-xs text-zinc-500">{finding.key}</span>
          </div>
          <h1 className="mt-3 font-display text-2xl font-semibold tracking-tight text-zinc-100">{finding.title}</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Detected {timeAgo(finding.detectedAt)} on <span className="font-mono text-zinc-400">{asset?.name ?? finding.assetId}</span> · updated {timeAgo(finding.updatedAt)}
          </p>
        </div>
        {editable && (
          <div className="flex flex-wrap gap-2">
            {finding.status !== "in_progress" && finding.status !== "resolved" && (
              <Button variant="secondary" size="sm" loading={busy} onClick={() => setStatus("in_progress")}>
                Start remediation
              </Button>
            )}
            {finding.status !== "resolved" && (
              <Button variant="outline" size="sm" loading={busy} onClick={() => setStatus("resolved")}>
                <CheckCircle2 size={14} /> Mark resolved
              </Button>
            )}
            {finding.status !== "suppressed" && (
              <Button variant="ghost" size="sm" loading={busy} onClick={suppress}>
                <ShieldOff size={14} /> Suppress
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Card>
            <CardTitle>Description</CardTitle>
            <p className="text-sm leading-relaxed text-zinc-400">{finding.description}</p>
          </Card>

          <Card>
            <CardTitle>
              <span className="flex items-center gap-2">
                <FileCode2 size={14} className="text-gold" /> Evidence
              </span>
            </CardTitle>
            <div className="space-y-1.5 rounded-xl border border-line bg-base p-3.5 font-mono text-xs leading-relaxed text-zinc-400">
              {finding.evidence.map((e, i) => (
                <p key={i}>
                  <span className="mr-2 text-zinc-600">{String(i + 1).padStart(2, "0")}</span>
                  {e}
                </p>
              ))}
            </div>
          </Card>

          <Card>
            <CardTitle>Remediation</CardTitle>
            <p className="text-sm leading-relaxed text-zinc-400">{finding.remediation}</p>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardTitle>Risk quantification</CardTitle>
            <div className="space-y-3.5">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm text-zinc-500">
                  <DollarSign size={14} /> Money at risk
                </span>
                <span className="font-display text-lg font-semibold text-severity-critical">{formatMoney(finding.moneyAtRisk)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm text-zinc-500">
                  <Bug size={14} /> CVSS base
                </span>
                <span className="font-mono text-lg text-zinc-200">{finding.cvss.toFixed(1)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm text-zinc-500">
                  <Zap size={14} /> Exploitability
                </span>
                <span className="capitalize text-zinc-200">{finding.exploitability}</span>
              </div>
            </div>
          </Card>

          <Card>
            <CardTitle>Affected controls</CardTitle>
            <div className="flex flex-wrap gap-1.5">
              {finding.controls.map((c) => (
                <span key={c} className="rounded-lg border border-severity-medium/25 bg-severity-medium/10 px-2 py-1 font-mono text-[11px] text-severity-medium">
                  {c}
                </span>
              ))}
              {finding.controls.length === 0 && <p className="text-sm text-zinc-600">No framework controls mapped.</p>}
            </div>
          </Card>

          <Card>
            <CardTitle>Timeline</CardTitle>
            <ol className="relative space-y-4 border-l border-line pl-4">
              <li className="text-xs">
                <span className="absolute -left-[5px] h-2.5 w-2.5 rounded-full bg-gold" />
                <p className="font-medium text-zinc-300">Detected</p>
                <p className="mt-0.5 text-zinc-500">{formatDateTime(finding.detectedAt)} · scan {finding.scanId}</p>
              </li>
              <li className="text-xs">
                <span className="absolute -left-[5px] h-2.5 w-2.5 rounded-full bg-zinc-600" />
                <p className="font-medium text-zinc-300">Last update</p>
                <p className="mt-0.5 text-zinc-500">{formatDateTime(finding.updatedAt)} · status → {finding.status}</p>
              </li>
              <li className="text-xs">
                <span className="absolute -left-[5px] h-2.5 w-2.5 rounded-full bg-zinc-700" />
                <p className="font-medium text-zinc-300">SLA due</p>
                <p className="mt-0.5 text-zinc-500">
                  {finding.severity === "critical" ? "24h" : finding.severity === "high" ? "72h" : "14 days"} from detection
                </p>
              </li>
            </ol>
          </Card>
        </div>
      </div>
    </div>
  );
}
