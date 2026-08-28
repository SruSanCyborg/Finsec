"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Ban, Bell, Plug, RotateCcw, ShieldAlert, Webhook } from "lucide-react";
import { api } from "@/lib/mock/api";
import { useSiriusUser } from "@/lib/providers";
import { can, SEVERITY_META } from "@/lib/constants";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button, Card, CardTitle, Input, Label, Select, Spinner } from "@/components/ui/primitives";
import { cn, formatDate } from "@/lib/utils";
import type { Integration, PolicyRule, Severity, Suppression } from "@/types";

type Tab = "policies" | "suppressions" | "integrations";

const TABS: { id: Tab; label: string; icon: typeof ShieldAlert }[] = [
  { id: "policies", label: "Alert policies", icon: Bell },
  { id: "suppressions", label: "Suppressions", icon: Ban },
  { id: "integrations", label: "Integrations", icon: Plug },
];

export default function SettingsPage() {
  const user = useSiriusUser();
  const [tab, setTab] = useState<Tab>("policies");
  const [policies, setPolicies] = useState<PolicyRule[] | null>(null);
  const [suppressions, setSuppressions] = useState<Suppression[]>([]);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [reason, setReason] = useState("");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);

  const manage = can(user?.role, "settings:manage");

  async function refresh() {
    setPolicies(await api.settings.policies());
    setSuppressions(await api.settings.suppressions());
    setIntegrations(await api.integrations.list());
  }

  useEffect(() => {
    refresh();
  }, []);

  if (!policies) return <Spinner className="min-h-[60vh]" />;

  return (
    <div>
      <PageHeader title="Settings" subtitle="Workspace policies, suppression rules and integrations" />

      <div className="mb-5 flex gap-1.5 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm transition",
              tab === t.id ? "bg-accent/10 text-accent border border-accent/30" : "text-zinc-400 hover:bg-white/[0.03] hover:text-zinc-200 border border-transparent"
            )}
          >
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {tab === "policies" && (
        <div className="space-y-3">
          {policies.map((p) => (
            <Card key={p.id} className="flex flex-wrap items-center gap-4">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-zinc-200">{p.name}</p>
                <p className="mt-0.5 text-xs text-zinc-500">{p.description}</p>
              </div>
              <span className="rounded-full border border-line px-2.5 py-0.5 text-[11px] text-zinc-400">floor: {SEVERITY_META[p.severityFloor].label}</span>
              <button
                disabled={!manage}
                onClick={async () => {
                  await api.settings.togglePolicy(p.id, user?.name ?? "You");
                  await refresh();
                }}
                className={cn("relative h-6 w-11 rounded-full transition disabled:opacity-40", p.enabled ? "bg-accent/80" : "bg-zinc-700")}
              >
                <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all", p.enabled ? "left-[22px]" : "left-0.5")} />
              </button>
            </Card>
          ))}
        </div>
      )}

      {tab === "suppressions" && (
        <div className="space-y-4">
          {manage && (
            <Card>
              <CardTitle>
                <span className="flex items-center gap-2">
                  <ShieldAlert size={14} className="text-severity-medium" /> Add suppression
                </span>
              </CardTitle>
              <div className="flex flex-wrap gap-3">
                <div className="min-w-[180px] flex-1">
                  <Label>Finding key</Label>
                  <Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="SIR-CON-0012" className="font-mono text-xs" />
                </div>
                <div className="min-w-[220px] flex-[2]">
                  <Label>Reason</Label>
                  <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Accepted risk until Q4 migration" />
                </div>
                <div className="flex items-end">
                  <Button
                    loading={busy}
                    onClick={async () => {
                      if (!key || !reason) {
                        toast.error("Both fields are required");
                        return;
                      }
                      setBusy(true);
                      try {
                        const f = await api.findings.get(key);
                        if (f) await api.findings.suppress(f.id, reason, "this_finding", user?.name ?? "You");
                        await refresh();
                        toast.success("Suppression added");
                        setKey("");
                        setReason("");
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Suppress
                  </Button>
                </div>
              </div>
            </Card>
          )}

          <Card className="p-0">
            <div className="divide-y divide-line">
              {suppressions.map((s) => (
                <div key={s.id} className="flex flex-wrap items-center gap-4 p-4">
                  <span className="font-mono text-xs text-severity-medium">{s.findingKey}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-zinc-400">{s.reason}</span>
                  <span className="text-xs text-zinc-500">
                    by {s.createdBy} · {formatDate(s.createdAt)} · expires {formatDate(s.expiresAt)}
                  </span>
                  {manage && (
                    <button
                      onClick={async () => {
                        await api.settings.removeSuppression(s.id, user?.name ?? "You");
                        await refresh();
                      }}
                      className="text-xs text-severity-critical hover:text-severity-critical/80"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
              {suppressions.length === 0 && <p className="p-6 text-center text-sm text-zinc-600">No active suppressions.</p>}
            </div>
          </Card>
        </div>
      )}

      {tab === "integrations" && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {integrations.map((i) => (
            <Card key={i.id} className="flex flex-col">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <span className={cn("rounded-xl p-2.5", i.connected ? "bg-severity-pass/10 text-severity-pass" : "bg-zinc-800 text-zinc-500")}>
                    <Webhook size={16} />
                  </span>
                  <div>
                    <p className="font-medium text-zinc-200">{i.name}</p>
                    <p className="text-[11px] uppercase tracking-wider text-zinc-600">{i.category}</p>
                  </div>
                </div>
                {i.connected && <span className="rounded-full bg-severity-pass/10 px-2 py-0.5 text-[10px] font-medium text-severity-pass">{i.events} events</span>}
              </div>
              <p className="mt-3 flex-1 text-xs leading-relaxed text-zinc-500">{i.description}</p>
              <Button
                variant={i.connected ? "secondary" : "outline"}
                size="sm"
                className="mt-4"
                disabled={!manage}
                onClick={async () => {
                  await api.integrations.toggle(i.id, user?.name ?? "You");
                  await refresh();
                  toast.success(i.connected ? `${i.name} disconnected` : `${i.name} connected`);
                }}
              >
                {i.connected ? "Disconnect" : "Connect"}
              </Button>
            </Card>
          ))}
        </div>
      )}

      {can(user?.role, "workspace:delete") && (
        <Card className="mt-6 border-severity-critical/20">
          <CardTitle>
            <span className="text-severity-critical">Danger zone</span>
          </CardTitle>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-zinc-200">Reset demo workspace</p>
              <p className="mt-0.5 text-xs text-zinc-500">Regenerates all seeded data (findings, scans, team, keys). Irreversible.</p>
            </div>
            <Button
              variant="danger"
              size="sm"
              onClick={async () => {
                await api.settings.resetWorkspace(user?.name ?? "You");
                await refresh();
                toast.success("Workspace reset to demo state");
              }}
            >
              <RotateCcw size={13} /> Reset workspace
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
