"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Plus, Radar, RefreshCcw } from "lucide-react";
import { api } from "@/lib/mock/api";
import { useSiriusUser } from "@/lib/providers";
import { can, SCAN_TYPE_META } from "@/lib/constants";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button, Input, Label, Select, Spinner } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/Badge";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { formatDateTime, timeAgo } from "@/lib/utils";
import type { Scan, ScanType } from "@/types";

const TYPE_CLS: Record<ScanType, string> = {
  full: "bg-accent/10 text-accent border-accent/30",
  quick: "bg-severity-pass/10 text-severity-pass border-severity-pass/30",
  targeted: "bg-zinc-300/10 text-zinc-300 border-zinc-300/30",
  third_party: "bg-severity-medium/10 text-severity-medium border-severity-medium/30",
  drift: "bg-severity-critical/10 text-severity-critical border-severity-critical/30",
};

export default function ScansPage() {
  const user = useSiriusUser();
  const router = useRouter();
  const [scans, setScans] = useState<Scan[] | null>(null);
  const [modal, setModal] = useState(false);
  const [type, setType] = useState<ScanType>("full");
  const [target, setTarget] = useState("all assets");
  const [name, setName] = useState("");
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    api.scans.list().then(setScans);
  }, []);

  async function startScan() {
    setStarting(true);
    try {
      const scan = await api.scans.start({ name, type, target }, user?.name ?? "You");
      toast.success(`Scan started — streaming results live`);
      setModal(false);
      router.push(`/scans/${scan.id}`);
    } catch {
      toast.error("Failed to start scan");
    } finally {
      setStarting(false);
    }
  }

  if (!scans) return <Spinner className="min-h-[60vh]" />;

  const columns: Column<Scan>[] = [
    {
      key: "name",
      header: "Scan",
      render: (s) => (
        <div>
          <p className="font-medium text-zinc-200">{s.name}</p>
          <p className="font-mono text-[11px] text-zinc-500">{s.id}</p>
        </div>
      ),
    },
    {
      key: "type",
      header: "Type",
      render: (s) => (
        <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${TYPE_CLS[s.type]}`}>
          {SCAN_TYPE_META[s.type].label}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (s) =>
        s.status === "running" ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-accent">
            <Loader2 size={12} className="animate-spin" /> {Math.round(s.progress)}%
          </span>
        ) : s.status === "completed" ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-severity-pass">
            <CheckCircle2 size={12} /> Completed
          </span>
        ) : (
          <span className="text-xs capitalize text-zinc-400">{s.status}</span>
        ),
    },
    { key: "findingsIssued", header: "Findings", render: (s) => <span className="font-mono text-zinc-300">{s.findingsIssued}</span> },
    { key: "target", header: "Target", render: (s) => <span className="font-mono text-xs text-zinc-400">{s.target}</span> },
    { key: "initiatedBy", header: "By", render: (s) => <span className="text-zinc-400">{s.initiatedBy}</span> },
    {
      key: "startedAt",
      header: "Started",
      render: (s) => <span className="text-xs text-zinc-500">{formatDateTime(s.startedAt)}</span>,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Scans"
        subtitle="Continuous scanning across code, secrets, cloud config and dependencies"
        actions={
          can(user?.role, "scans:run") && (
            <Button onClick={() => setModal(true)}>
              <Plus size={15} /> New scan
            </Button>
          )
        }
      />

      <DataTable columns={columns} rows={scans} onRowClick={(s) => router.push(`/scans/${s.id}`)} />

      <Modal open={modal} onClose={() => setModal(false)} title="Start a new scan" subtitle="Results stream live as the engine finds issues.">
        <div className="space-y-4">
          <div>
            <Label>Scan type</Label>
            <div className="grid grid-cols-1 gap-2">
              {(Object.keys(SCAN_TYPE_META) as ScanType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={`rounded-xl border px-3.5 py-2.5 text-left transition ${
                    type === t ? "border-accent/50 bg-accent/10" : "border-line hover:bg-white/[0.03]"
                  }`}
                >
                  <p className={`text-sm font-medium ${type === t ? "text-accent" : "text-zinc-200"}`}>{SCAN_TYPE_META[t].label}</p>
                  <p className="mt-0.5 text-xs text-zinc-500">{SCAN_TYPE_META[t].blurb}</p>
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label>Target</Label>
            <Select value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="all assets">All assets</option>
              <option value="payments-api">payments-api</option>
              <option value="auth-service">auth-service</option>
              <option value="kyc-service">kyc-service</option>
              <option value="cluster:prod-use1">cluster:prod-use1</option>
              <option value="s3://statements">s3://statements</option>
            </Select>
          </div>
          <div>
            <Label>Scan name (optional)</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={`${type} · manual`} />
          </div>
          <Button onClick={startScan} loading={starting} className="w-full">
            <Radar size={15} /> Start scanning
          </Button>
        </div>
      </Modal>
    </div>
  );
}
