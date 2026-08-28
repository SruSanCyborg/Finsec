import type { FindingStatus, Role, ScanType, Severity } from "@/types";

// ── RBAC ─────────────────────────────────────────────────────────────────────

export type Perm =
  | "scans:run"
  | "findings:manage"
  | "alerts:manage"
  | "team:manage"
  | "keys:manage"
  | "settings:manage"
  | "reports:create"
  | "ai:configure"
  | "workspace:delete";

export const ROLE_PERMISSIONS: Record<Role, Perm[]> = {
  owner: [
    "scans:run",
    "findings:manage",
    "alerts:manage",
    "team:manage",
    "keys:manage",
    "settings:manage",
    "reports:create",
    "ai:configure",
    "workspace:delete",
  ],
  admin: [
    "scans:run",
    "findings:manage",
    "alerts:manage",
    "team:manage",
    "keys:manage",
    "settings:manage",
    "reports:create",
    "ai:configure",
  ],
  analyst: ["scans:run", "findings:manage", "alerts:manage", "reports:create"],
  member: ["scans:run"],
  viewer: [],
};

export function can(role: Role | undefined, perm: Perm): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role]?.includes(perm) ?? false;
}

export const ROLE_META: Record<
  Role,
  { label: string; blurb: string; className: string }
> = {
  owner: {
    label: "Owner",
    blurb: "Full control including billing and workspace deletion",
    className: "bg-accent/10 text-accent border-accent/25",
  },
  admin: {
    label: "Admin",
    blurb: "Manage team, settings, scans and integrations",
    className: "bg-severity-low/10 text-severity-low border-severity-low/25",
  },
  analyst: {
    label: "Security Analyst",
    blurb: "Triage findings, run scans, handle alerts and reports",
    className: "bg-severity-pass/10 text-severity-pass border-severity-pass/25",
  },
  member: {
    label: "Developer",
    blurb: "Run scans and view findings for their own code",
    className: "bg-zinc-200/[0.06] text-zinc-300 border-zinc-400/20",
  },
  viewer: {
    label: "Viewer",
    blurb: "Read-only access to dashboards and reports",
    className: "bg-zinc-500/[0.08] text-zinc-400 border-zinc-600/25",
  },
};

// ── Severity / status meta ───────────────────────────────────────────────────

export const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "low", "info"];

export const SEVERITY_META: Record<Severity, { label: string; className: string; dot: string }> = {
  critical: { label: "Critical", className: "bg-severity-critical/10 text-severity-critical border-severity-critical/25", dot: "bg-severity-critical" },
  high: { label: "High", className: "bg-severity-high/10 text-severity-high border-severity-high/25", dot: "bg-severity-high" },
  medium: { label: "Medium", className: "bg-severity-medium/10 text-severity-medium border-severity-medium/25", dot: "bg-severity-medium" },
  low: { label: "Low", className: "bg-severity-low/10 text-severity-low border-severity-low/25", dot: "bg-severity-low" },
  info: { label: "Info", className: "bg-zinc-500/[0.08] text-zinc-400 border-zinc-600/25", dot: "bg-zinc-500" },
};

export const STATUS_META: Record<FindingStatus, { label: string; className: string }> = {
  open: { label: "Open", className: "bg-severity-critical/10 text-severity-critical border-severity-critical/25" },
  in_progress: { label: "In progress", className: "bg-severity-medium/10 text-severity-medium border-severity-medium/25" },
  resolved: { label: "Resolved", className: "bg-severity-pass/10 text-severity-pass border-severity-pass/25" },
  suppressed: { label: "Suppressed", className: "bg-zinc-500/[0.08] text-zinc-400 border-zinc-600/25" },
};

export const SCAN_TYPE_META: Record<ScanType, { label: string; blurb: string }> = {
  full: { label: "Full stack", blurb: "SAST + secrets + IAST + config + dependencies across all assets" },
  quick: { label: "Quick", blurb: "Fast delta scan of changed code paths" },
  targeted: { label: "Targeted", blurb: "Deep scan of a specific service or endpoint" },
  third_party: { label: "Third-party", blurb: "Vendor & dependency risk assessment" },
  drift: { label: "Drift", blurb: "Infrastructure / config drift detection" },
};

export const API_SCOPES = [
  "scans:read",
  "scans:write",
  "findings:read",
  "findings:write",
  "reports:read",
  "reports:write",
  "alerts:read",
  "alerts:write",
  "team:read",
  "admin",
] as const;

// ── Misc ─────────────────────────────────────────────────────────────────────

export const SESSION_COOKIE = "sirius_session";
export const DB_KEY = "sirius.db.v3";
export const DEMO_CREDENTIALS = { email: "demo@sirius.dev", password: "Demo123!" };
export const AVATAR_COLORS = ["#22d3ee", "#34d399", "#a78bfa", "#f472b6", "#fbbf24", "#38bdf8"];
