"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ROLE_META, SEVERITY_META, STATUS_META } from "@/lib/constants";
import type { FindingStatus, Role, Severity } from "@/types";

export function SeverityBadge({ severity, className }: { severity: Severity; className?: string }) {
  const m = SEVERITY_META[severity];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium capitalize",
        m.className,
        className
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", m.dot)} />
      {m.label}
    </span>
  );
}

export function StatusBadge({ status, className }: { status: FindingStatus; className?: string }) {
  const m = STATUS_META[status];
  return (
    <span className={cn("inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-medium capitalize", m.className, className)}>
      {m.label}
    </span>
  );
}

export function RoleBadge({ role, className }: { role: Role; className?: string }) {
  const m = ROLE_META[role];
  return (
    <span className={cn("inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-medium", m.className, className)}>
      {m.label}
    </span>
  );
}

export function Avatar({ name, color, size = 32 }: { name: string; color: string; size?: number }) {
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, background: color, fontSize: size * 0.38 }}
    >
      {initials}
    </span>
  );
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ type: "spring", damping: 28, stiffness: 360 }}
            className={cn(
              "relative max-h-[88vh] w-full overflow-y-auto rounded-xl border border-line bg-panel p-6 shadow-card",
              wide ? "max-w-2xl" : "max-w-md"
            )}
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-medium text-zinc-100">{title}</h2>
                {subtitle && <p className="mt-1 text-sm text-zinc-500">{subtitle}</p>}
              </div>
              <button onClick={onClose} className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-white/[0.04] hover:text-zinc-200">
                <X size={18} />
              </button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel = "Confirm",
  danger,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  body: string;
  confirmLabel?: string;
  danger?: boolean;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <p className="text-sm leading-relaxed text-zinc-400">{body}</p>
      <div className="mt-6 flex justify-end gap-3">
        <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-zinc-500 transition hover:bg-white/[0.04] hover:text-zinc-200">
          Cancel
        </button>
        <button
          onClick={() => {
            onConfirm();
            onClose();
          }}
          className={cn(
            "rounded-lg px-4 py-2 text-sm font-medium transition",
            danger ? "bg-severity-critical text-white hover:brightness-110" : "bg-zinc-100 text-zinc-950 hover:bg-white"
          )}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
