"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCheck } from "lucide-react";
import { api } from "@/lib/mock/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button, Card, Spinner } from "@/components/ui/primitives";
import { KindIcon } from "@/components/ui/KindIcon";
import { cn, timeAgo } from "@/lib/utils";
import type { Notification } from "@/types";

const KIND_CLS: Record<Notification["kind"], string> = {
  alert: "border-severity-critical/20 bg-severity-critical/[0.04]",
  scan: "border-accent/20 bg-accent/[0.04]",
  team: "border-zinc-400/20 bg-zinc-400/[0.04]",
  system: "border-line",
  ai: "border-severity-pass/20 bg-severity-pass/[0.04]",
};

export default function NotificationsPage() {
  const [notifs, setNotifs] = useState<Notification[] | null>(null);

  useEffect(() => {
    api.notifications.list().then(setNotifs);
    return api.notifications.subscribe(setNotifs);
  }, []);

  if (!notifs) return <Spinner className="min-h-[60vh]" />;

  return (
    <div>
      <PageHeader
        title="Notifications"
        subtitle={`${notifs.filter((n) => !n.read).length} unread`}
        actions={
          <Button variant="secondary" onClick={() => api.notifications.markAllRead().then(() => api.notifications.list().then(setNotifs))}>
            <CheckCheck size={15} /> Mark all read
          </Button>
        }
      />

      <div className="space-y-2">
        {notifs.map((n) => (
          <Card
            key={n.id}
            className={cn("flex items-center gap-4 py-3.5 transition", KIND_CLS[n.kind], !n.read && "ring-1 ring-inset ring-accent/20")}
          >
            <KindIcon kind={n.kind} size={17} />
            <div className="min-w-0 flex-1">
              <p className={cn("truncate text-sm", n.read ? "text-zinc-500" : "font-medium text-zinc-200")}>{n.title}</p>
              <p className="truncate text-xs text-zinc-500">{n.body}</p>
            </div>
            <span className="text-[11px] text-zinc-600">{timeAgo(n.at)}</span>
            {!n.read && (
              <button onClick={() => api.notifications.markRead(n.id).then(() => setNotifs((prev) => (prev ?? []).map((x) => (x.id === n.id ? { ...x, read: true } : x))))} className="text-[11px] text-zinc-400 hover:text-zinc-200">
                Mark read
              </button>
            )}
          </Card>
        ))}
      </div>

      <p className="mt-6 text-center text-xs text-zinc-600">
        Delivery channels are configured in <Link href="/settings" className="text-zinc-400 hover:text-zinc-200">Settings → Integrations</Link>.
      </p>
    </div>
  );
}
