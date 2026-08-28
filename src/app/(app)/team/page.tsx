"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Mail, PhoneCall, ShieldCheck, Trash2, UserPlus } from "lucide-react";
import { api } from "@/lib/mock/api";
import { useSiriusUser } from "@/lib/providers";
import { can, ROLE_META } from "@/lib/constants";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button, Card, CardTitle, Input, Label, Select, Spinner } from "@/components/ui/primitives";
import { Avatar, ConfirmDialog, Modal, RoleBadge } from "@/components/ui/Badge";
import { cn, formatDate, timeAgo } from "@/lib/utils";
import type { Invite, Role, TeamMember } from "@/types";

const ROLES: Role[] = ["owner", "admin", "analyst", "member", "viewer"];

export default function TeamPage() {
  const user = useSiriusUser();
  const [members, setMembers] = useState<TeamMember[] | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [modal, setModal] = useState(false);
  const [emails, setEmails] = useState("");
  const [role, setRole] = useState<Role>("member");
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<TeamMember | null>(null);

  const manage = can(user?.role, "team:manage");

  async function refresh() {
    setMembers(await api.team.members());
    setInvites(await api.team.invites());
  }

  useEffect(() => {
    refresh();
  }, []);

  async function sendInvites() {
    const list = emails
      .split(/[\n,;]+/)
      .map((e) => e.trim())
      .filter((e) => /.+@.+\..+/.test(e));
    if (list.length === 0) {
      toast.error("Enter at least one valid email");
      return;
    }
    setBusy(true);
    try {
      await api.team.invite(list, role, user?.name ?? "You");
      await refresh();
      toast.success(`${list.length} invitation(s) sent`);
      setModal(false);
      setEmails("");
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(m: TeamMember, r: Role) {
    await api.team.updateMember(m.id, { role: r }, user?.name ?? "You");
    await refresh();
    toast.success(`${m.name} is now ${ROLE_META[r].label}`);
  }

  async function toggleOnCall(m: TeamMember) {
    await api.team.updateMember(m.id, { onCall: !m.onCall }, user?.name ?? "You");
    await refresh();
    toast.success(m.onCall ? `${m.name} removed from on-call` : `${m.name} added to on-call rotation`);
  }

  return (
    <div>
      <PageHeader
        title="Team"
        subtitle="Roles follow least privilege — on-call members receive severity-based voice call alerts"
        actions={
          manage && (
            <Button onClick={() => setModal(true)}>
              <UserPlus size={15} /> Invite members
            </Button>
          )
        }
      />

      {!members ? (
        <Spinner className="min-h-[40vh]" />
      ) : (
        <div className="space-y-4">
          <Card className="p-0">
            <div className="divide-y divide-line">
              {members.map((m) => (
                <div key={m.id} className="flex flex-wrap items-center gap-4 p-4">
                  <Avatar name={m.name} color={m.color} size={38} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium text-zinc-200">{m.name}</p>
                      {m.id === user?.id && <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">you</span>}
                      {m.onCall && (
                        <span className="flex items-center gap-1 rounded-full bg-severity-pass/10 px-2 py-0.5 text-[10px] font-medium text-severity-pass">
                          <PhoneCall size={9} /> on-call
                        </span>
                      )}
                    </div>
                    <p className="truncate text-xs text-zinc-500">
                      {m.title} · {m.email} · joined {formatDate(m.joinedAt)}
                    </p>
                  </div>
                  <span className={cn("rounded-full border px-2 py-0.5 text-[10px]", m.mfa ? "border-severity-pass/30 bg-severity-pass/10 text-severity-pass" : "border-severity-critical/30 bg-severity-critical/10 text-severity-critical")}>
                    {m.mfa ? "MFA on" : "MFA off"}
                  </span>
                  {manage && m.id !== user?.id ? (
                    <div className="flex items-center gap-2">
                      <Select value={m.role} onChange={(e) => changeRole(m, e.target.value as Role)} className="w-auto py-1.5 text-xs">
                        {ROLES.map((r) => (
                          <option key={r} value={r} disabled={r === "owner" && user?.role !== "owner"}>
                            {ROLE_META[r].label}
                          </option>
                        ))}
                      </Select>
                      <button
                        onClick={() => toggleOnCall(m)}
                        title="Toggle on-call"
                        className={cn("rounded-lg p-2 transition", m.onCall ? "text-severity-pass hover:bg-severity-pass/10" : "text-zinc-500 hover:bg-white/[0.03] hover:text-zinc-200")}
                      >
                        <PhoneCall size={14} />
                      </button>
                      <button onClick={() => setRemoving(m)} className="rounded-lg p-2 text-zinc-500 transition hover:bg-severity-critical/10 hover:text-severity-critical">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ) : (
                    <RoleBadge role={m.role} />
                  )}
                </div>
              ))}
            </div>
          </Card>

          {invites.length > 0 && (
            <Card>
              <CardTitle right={<span className="text-xs text-zinc-500">{invites.length} pending</span>}>Pending invitations</CardTitle>
              <div className="space-y-2">
                {invites.map((i) => (
                  <div key={i.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-raise px-3.5 py-2.5">
                    <Mail size={14} className="text-zinc-500" />
                    <span className="font-mono text-sm text-zinc-300">{i.email}</span>
                    <RoleBadge role={i.role} />
                    <span className="text-xs text-zinc-500">
                      invited by {i.invitedBy} · {timeAgo(i.invitedAt)}
                    </span>
                    {manage && (
                      <button
                        onClick={async () => {
                          await api.team.revokeInvite(i.id, user?.name ?? "You");
                          await refresh();
                        }}
                        className="ml-auto text-xs text-severity-critical hover:text-severity-critical/80"
                      >
                        Revoke
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card>
            <CardTitle>
              <span className="flex items-center gap-2">
                <ShieldCheck size={14} className="text-accent" /> Role permissions
              </span>
            </CardTitle>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
              {ROLES.map((r) => (
                <div key={r} className="rounded-xl border border-line p-3">
                  <RoleBadge role={r} />
                  <p className="mt-2 text-xs leading-relaxed text-zinc-500">{ROLE_META[r].blurb}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title="Invite members" subtitle="Paste one or more emails — they'll get an invite link.">
        <div className="space-y-4">
          <div>
            <Label>Email addresses</Label>
            <textarea
              value={emails}
              onChange={(e) => setEmails(e.target.value)}
              placeholder={"dev@company.io\nsec@company.io"}
              className="input min-h-[90px] font-mono text-xs"
            />
          </div>
          <div>
            <Label>Role</Label>
            <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {ROLES.filter((r) => r !== "owner").map((r) => (
                <option key={r} value={r}>
                  {ROLE_META[r].label} — {ROLE_META[r].blurb}
                </option>
              ))}
            </Select>
          </div>
          <Button onClick={sendInvites} loading={busy} className="w-full">
            <UserPlus size={15} /> Send invites
          </Button>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          if (removing) {
            await api.team.removeMember(removing.id, user?.name ?? "You");
            await refresh();
            toast.success(`${removing.name} removed from workspace`);
          }
        }}
        title={`Remove ${removing?.name}?`}
        body="They immediately lose access to this workspace. Audit history is preserved."
        confirmLabel="Remove member"
        danger
      />
    </div>
  );
}
