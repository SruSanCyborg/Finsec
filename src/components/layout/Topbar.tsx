"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { useClerk } from "@clerk/nextjs";
import { Bell, Check, ChevronDown, LogOut, Menu, Search, Settings, UserCircle2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/mock/api";
import { useSession } from "@/lib/providers";
import { Avatar } from "@/components/ui/Badge";
import { ROLE_META } from "@/lib/constants";
import { cn, timeAgo } from "@/lib/utils";
import { KindIcon } from "@/components/ui/KindIcon";
import type { Notification } from "@/types";

export function Topbar({ onMenu }: { onMenu: () => void }) {
  const { user, role } = useSession();
  const { signOut } = useClerk();
  const router = useRouter();
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [openNotif, setOpenNotif] = useState(false);
  const [openUser, setOpenUser] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.notifications.list().then(setNotifs);
    return api.notifications.subscribe(setNotifs);
  }, []);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpenNotif(false);
        setOpenUser(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const unread = notifs.filter((n) => !n.read).length;

  async function handleLogout() {
    await signOut();
    toast.success("Signed out");
    router.push("/");
  }

  const displayName = user?.fullName || user?.primaryEmailAddress?.emailAddress || "…";
  const displayRole = role ? ROLE_META[role].label : undefined;

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-base/80 px-4 backdrop-blur-xl lg:px-6">
      <button onClick={onMenu} className="rounded-lg p-2 text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100 lg:hidden">
        <Menu size={18} />
      </button>

      <div className="hidden max-w-sm flex-1 items-center gap-2 rounded-lg border border-line bg-raise px-3 py-1.5 text-sm text-zinc-500 md:flex">
        <Search size={14} />
        <span>Search findings, assets, scans...</span>
        <span className="kbd ml-auto">Cmd K</span>
      </div>

      <div className="ml-auto flex items-center gap-2" ref={ref}>
        {/* notifications */}
        <div className="relative">
          <button
            onClick={() => {
              setOpenNotif((v) => !v);
              setOpenUser(false);
            }}
            className="relative rounded-lg p-2 text-zinc-400 transition hover:bg-white/[0.04] hover:text-zinc-100"
          >
            <Bell size={17} />
            {unread > 0 && (
              <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-severity-critical px-1 text-[9px] font-bold text-white">
                {unread}
              </span>
            )}
          </button>
          <AnimatePresence>
            {openNotif && (
              <motion.div
                initial={{ opacity: 0, y: 6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6, scale: 0.98 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 top-11 w-80 overflow-hidden rounded-xl border border-line bg-panel shadow-card"
              >
                <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Notifications</p>
                  <button onClick={() => api.notifications.markAllRead().then(() => api.notifications.list().then(setNotifs))} className="text-[11px] text-accent hover:text-accent/80">
                    Mark all read
                  </button>
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {notifs.slice(0, 8).map((n) => (
                    <button
                      key={n.id}
                      onClick={() => api.notifications.markRead(n.id).then(() => setNotifs((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x))))}
                      className={cn("flex w-full items-start gap-3 border-b border-line/50 px-4 py-3 text-left transition hover:bg-white/[0.02]", !n.read && "bg-accent/[0.03]")}
                    >
                      <KindIcon kind={n.kind} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-zinc-200">{n.title}</span>
                        <span className="mt-0.5 block truncate text-xs text-zinc-500">{n.body}</span>
                      </span>
                      <span className="shrink-0 text-[10px] text-zinc-600">{timeAgo(n.at)}</span>
                    </button>
                  ))}
                </div>
                <Link href="/notifications" onClick={() => setOpenNotif(false)} className="block px-4 py-2.5 text-center text-xs text-accent hover:bg-white/[0.02]">
                  View all
                </Link>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* user menu */}
        <div className="relative">
          <button
            onClick={() => {
              setOpenUser((v) => !v);
              setOpenNotif(false);
            }}
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition hover:bg-white/[0.04]"
          >
            <Avatar name={displayName} color="#C8A96A" size={28} />
            <span className="hidden text-left sm:block">
              <span className="block max-w-[140px] truncate text-xs font-medium leading-tight text-zinc-200">{displayName}</span>
              {displayRole && <span className="block text-[10px] leading-tight text-zinc-500">{displayRole}</span>}
            </span>
            <ChevronDown size={14} className="text-zinc-500" />
          </button>
          <AnimatePresence>
            {openUser && (
              <motion.div
                initial={{ opacity: 0, y: 6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6, scale: 0.98 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 top-11 w-52 overflow-hidden rounded-xl border border-line bg-panel shadow-card"
              >
                <div className="border-b border-line px-4 py-3">
                  <p className="truncate text-sm font-medium text-zinc-200">{displayName}</p>
                  <p className="truncate text-xs text-zinc-500">{user?.primaryEmailAddress?.emailAddress ?? ""}</p>
                </div>
                <div className="p-1.5">
                  <Link href="/settings" onClick={() => setOpenUser(false)} className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200">
                    <UserCircle2 size={15} /> Profile & settings
                  </Link>
                  <Link href="/settings" onClick={() => setOpenUser(false)} className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200">
                    <Settings size={15} /> Preferences
                  </Link>
                  <button onClick={handleLogout} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-severity-critical hover:bg-severity-critical/10">
                    <LogOut size={15} /> Sign out
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}
