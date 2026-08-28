"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BrainCircuit, Cpu, Link2, Lock, Sparkles, Zap } from "lucide-react";
import { api } from "@/lib/mock/api";
import { useSiriusUser } from "@/lib/providers";
import { can } from "@/lib/constants";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button, Card, CardTitle, Input, Label, Spinner, Textarea } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import type { AIConfig } from "@/types";

const CAPABILITIES = [
  { icon: Zap, title: "Auto-triage", body: "Ranks incoming findings by real exploitability & business impact, killing alert fatigue." },
  { icon: Sparkles, title: "Anomaly detection", body: "Learns your normal scan/config patterns and flags deviations before they become findings." },
  { icon: Cpu, title: "Remediation playbooks", body: "Generates asset-specific fix suggestions trained on your own remediation history." },
  { icon: Lock, title: "Local feedback loop", body: "Analyst acknowledge/suppress decisions continuously retrain the ranking model." },
];

export default function AIPage() {
  const user = useSiriusUser();
  const [cfg, setCfg] = useState<AIConfig | null>(null);
  const [busy, setBusy] = useState(false);

  const configure = can(user?.role, "ai:configure");

  useEffect(() => {
    api.settings.aiConfig().then(setCfg);
  }, []);

  async function save() {
    if (!cfg) return;
    setBusy(true);
    try {
      await api.settings.saveAI(cfg, user?.name ?? "You");
      toast.success(cfg.endpoint ? "Model endpoint saved — will be probed on next connect" : "Model configuration cleared");
    } finally {
      setBusy(false);
    }
  }

  if (!cfg) return <Spinner className="min-h-[60vh]" />;

  const connected = !!cfg.endpoint;

  return (
    <div>
      <PageHeader
        title="Self-learning AI model"
        subtitle="Sirius learns your environment — the GUI is wired and ready for the model backend"
        actions={
          <span className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${connected ? "border-severity-pass/30 bg-severity-pass/10 text-severity-pass" : "border-severity-medium/30 bg-severity-medium/10 text-severity-medium"}`}>
            <span className={`h-2 w-2 rounded-full ${connected ? "bg-severity-pass" : "bg-severity-medium"}`} />
            {connected ? "Endpoint configured" : "Not connected"}
          </span>
        }
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardTitle>
            <span className="flex items-center gap-2">
              <BrainCircuit size={15} className="text-accent" /> Model connection
            </span>
          </CardTitle>
          <p className="mb-4 text-sm leading-relaxed text-zinc-500">
            Point Sirius at your self-learning model service. The frontend already speaks this contract — when the model is deployed, triage, anomaly
            detection and playbook suggestions light up across the app without any UI changes.
          </p>
          <div className="space-y-4">
            <div>
              <Label>Endpoint URL</Label>
              <Input value={cfg.endpoint} onChange={(e) => setCfg({ ...cfg, endpoint: e.target.value })} placeholder="https://models.siriusline.internal/v1" disabled={!configure} className="font-mono text-xs" />
            </div>
            <div>
              <Label>Auth token</Label>
              <Input type="password" value={cfg.token} onChange={(e) => setCfg({ ...cfg, token: e.target.value })} placeholder="sk_…" disabled={!configure} />
            </div>
            <div>
              <Label>Model ID</Label>
              <Input value={cfg.model} onChange={(e) => setCfg({ ...cfg, model: e.target.value })} disabled={!configure} className="font-mono text-xs" />
            </div>
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-line px-3.5 py-3">
              <input type="checkbox" checked={cfg.autoTriage} onChange={(e) => setCfg({ ...cfg, autoTriage: e.target.checked })} disabled={!configure} className="h-4 w-4 accent-[#7C3AED]" />
              <span>
                <span className="block text-sm font-medium text-zinc-200">Auto-triage new findings</span>
                <span className="block text-xs text-zinc-500">Model pre-ranks every finding as scans stream in</span>
              </span>
            </label>
            {configure && (
              <Button onClick={save} loading={busy}>
                <Link2 size={15} /> Save connection
              </Button>
            )}
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardTitle>Planned capabilities</CardTitle>
            <div className="space-y-3.5">
              {CAPABILITIES.map((c) => (
                <div key={c.title} className="flex gap-3">
                  <span className="rounded-lg bg-zinc-800 p-2 text-accent">
                    <c.icon size={14} />
                  </span>
                  <div>
                    <p className="text-sm font-medium text-zinc-200">{c.title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">{c.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardTitle>Integration contract</CardTitle>
            <div className="rounded-xl border border-line bg-base p-3 font-mono text-[11px] leading-relaxed text-zinc-400">
              <p className="text-zinc-600"># the UI calls this once connected</p>
              <p>POST {cfg.endpoint || "https://<model>/v1"}/triage</p>
              <p className="text-zinc-600">{"{"}</p>
              <p className="pl-3">{"\"finding_id\": \"SIR-SAS-0001\","}</p>
              <p className="pl-3">{"\"context\": { asset, severity, history }"}</p>
              <p className="text-zinc-600">{"}"}</p>
              <p className="pl-3 text-severity-pass">→ {"{ rank, anomaly, playbook }"}</p>
            </div>
            <p className={cn("mt-3 text-xs", connected ? "text-zinc-500" : "text-severity-medium/80")}>
              {connected ? "Saved. Probing happens on next scan stream." : "No endpoint yet — everything you see is deterministic rule-based while the model trains."}
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
