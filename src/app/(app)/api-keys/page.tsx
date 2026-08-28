"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, KeyRound, Plus, ShieldAlert, Trash2 } from "lucide-react";
import { api } from "@/lib/mock/api";
import { useSiriusUser } from "@/lib/providers";
import { API_SCOPES, can } from "@/lib/constants";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button, Card, Input, Label, Select, Spinner } from "@/components/ui/primitives";
import { ConfirmDialog, Modal } from "@/components/ui/Badge";
import { formatDate, timeAgo } from "@/lib/utils";
import type { ApiKey } from "@/types";

export default function ApiKeysPage() {
  const user = useSiriusUser();
  const [keys, setKeys] = useState<ApiKey[] | null>(null);
  const [modal, setModal] = useState(false);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>(["scans:read", "findings:read"]);
  const [expiry, setExpiry] = useState("90");
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState<ApiKey | null>(null);
  const [revoking, setRevoking] = useState<ApiKey | null>(null);

  const manage = can(user?.role, "keys:manage");

  async function refresh() {
    setKeys(await api.keys.list());
  }

  useEffect(() => {
    refresh();
  }, []);

  async function create() {
    if (!name.trim()) {
      toast.error("Give the key a name");
      return;
    }
    setBusy(true);
    try {
      const k = await api.keys.create(name.trim(), scopes, Number(expiry), user?.name ?? "You");
      setFresh(k);
      setModal(false);
      setName("");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="API keys"
        subtitle="Programmatic access to the Sirius Line Core API — scoped, expiring, revocable"
        actions={
          manage && (
            <Button onClick={() => setModal(true)}>
              <Plus size={15} /> Create key
            </Button>
          )
        }
      />

      {!keys ? (
        <Spinner className="min-h-[40vh]" />
      ) : (
        <Card className="p-0">
          <div className="divide-y divide-white/[0.05]">
            {keys.map((k) => (
              <div key={k.id} className="flex flex-wrap items-center gap-4 p-4">
                <span className={`rounded-xl p-2.5 ${k.status === "active" ? "bg-accent/10 text-accent" : "bg-zinc-500/10 text-zinc-600"}`}>
                  <KeyRound size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-zinc-200">{k.name}</p>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${k.status === "active" ? "bg-severity-pass/10 text-severity-pass" : "bg-zinc-500/10 text-zinc-500 line-through"}`}>
                      {k.status}
                    </span>
                  </div>
                  <p className="font-mono text-xs text-zinc-500">
                    {k.prefix}•••••••• · created {formatDate(k.createdAt)} by {k.createdBy} · expires {formatDate(k.expiresAt)}
                    {k.lastUsedAt && ` · last used ${timeAgo(k.lastUsedAt)}`}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {k.scopes.map((s) => (
                    <span key={s} className="rounded-md bg-white/[0.03] px-2 py-0.5 font-mono text-[10px] text-zinc-400">
                      {s}
                    </span>
                  ))}
                </div>
                {manage && k.status === "active" && (
                  <button onClick={() => setRevoking(k)} className="rounded-lg p-2 text-zinc-500 transition hover:bg-severity-critical/10 hover:text-severity-critical" title="Revoke">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title="Create API key" subtitle="The secret is shown once — store it in your secrets manager.">
        <div className="space-y-4">
          <div>
            <Label>Key name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ci-portal" />
          </div>
          <div>
            <Label>Scopes</Label>
            <div className="flex flex-wrap gap-2">
              {API_SCOPES.map((s) => {
                const on = scopes.includes(s);
                return (
                  <button
                    key={s}
                    onClick={() => setScopes((prev) => (on ? prev.filter((x) => x !== s) : [...prev, s]))}
                    className={`rounded-lg border px-2.5 py-1 font-mono text-[11px] transition ${on ? "border-accent/50 bg-accent/10 text-accent" : "border-line text-zinc-400 hover:bg-white/[0.03]"}`}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <Label>Expires in</Label>
            <Select value={expiry} onChange={(e) => setExpiry(e.target.value)}>
              <option value="30">30 days</option>
              <option value="90">90 days</option>
              <option value="365">1 year</option>
            </Select>
          </div>
          <Button onClick={create} loading={busy} className="w-full">
            <KeyRound size={15} /> Generate key
          </Button>
        </div>
      </Modal>

      <Modal open={!!fresh} onClose={() => setFresh(null)} title="Save your secret key" subtitle="This is the only time the full key is visible.">
        {fresh && (
          <div>
            <div className="flex items-center gap-2 rounded-xl border border-accent/25 bg-accent/[0.06] p-3">
              <code className="min-w-0 flex-1 break-all font-mono text-xs text-accent">{fresh.secret}</code>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(fresh.secret ?? "");
                  toast.success("Copied to clipboard");
                }}
                className="rounded-lg p-2 text-accent hover:bg-accent/10"
              >
                <Copy size={14} />
              </button>
            </div>
            <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-zinc-500">
              <ShieldAlert size={14} className="mt-0.5 shrink-0 text-severity-medium" />
              Treat this like a password. Scope it to the minimum permissions the integration needs and rotate before expiry.
            </p>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!revoking}
        onClose={() => setRevoking(null)}
        onConfirm={async () => {
          if (revoking) {
            await api.keys.revoke(revoking.id, user?.name ?? "You");
            await refresh();
            toast.success(`${revoking.name} revoked`);
          }
        }}
        title={`Revoke ${revoking?.name}?`}
        body="Integrations using this key will immediately start receiving 401s. This cannot be undone."
        confirmLabel="Revoke key"
        danger
      />
    </div>
  );
}
