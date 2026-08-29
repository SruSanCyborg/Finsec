// ── Sirius Line · real-mode API client ───────────────────────────────────────
// Talks to the FastAPI Core API (backend/ on the Auto branch) over REST + WS.
// The browser NEVER touches Neon directly — it talks to this API only.
// Maps 1:1 to the mock facade in src/lib/mock/api.ts so pages are unchanged.

const API_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL ?? ""
).replace(/\/$/, "");
// WS origin: strip any /api/v1 suffix so the stream paths below don't double it.
const WS_URL = (
  process.env.NEXT_PUBLIC_WS_URL ?? API_URL?.replace(/^http/, "ws")
)
  .replace(/\/$/, "")
  .replace(/\/api\/v1$/, "");

export const REAL = !!API_URL;

/** Public health check — verifies frontend↔backend connectivity. */
export async function checkHealth(): Promise<boolean> {
  if (!API_URL) return false;
  try {
    const res = await fetch(`${API_URL}/health`, { cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  }
}

const TOKEN_KEY = "sirius.api_token";

// Module-level Clerk session token, set by the Providers bridge via
// useAuth().getToken() — the reliable way to get the session JWT in
// @clerk/nextjs (window.Clerk.session is not guaranteed).
let clerkSessionToken: string | null = null;

export function setClerkSessionToken(token: string | null) {
  clerkSessionToken = token;
}

export function getApiToken(): string | null {
  if (clerkSessionToken) return clerkSessionToken;
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setApiToken(token: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* noop */
  }
}

export function clearApiToken() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* noop */
  }
}

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  _retried = false,
): Promise<T> {
  // The token comes from getApiToken(): the Clerk session JWT (set by the
  // Providers bridge) takes priority, then the stored API key (demo/CLI mode).
  const token = getApiToken();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, { ...init, headers, cache: "no-store" });
  if (res.status === 401 && !_retried) {
    // Race: the Clerk session JWT may not be set yet on first mount. Wait up to
    // 2s for it, then retry once with the real token.
    const deadline = Date.now() + 2000;
    while (Date.now() < deadline && !getApiToken()) {
      await new Promise((r) => setTimeout(r, 100));
    }
    if (getApiToken()) {
      return request<T>(path, init, true);
    }
  }
  if (!res.ok) {
    let detail = res.statusText;
    let code: string | undefined;
    try {
      const body = await res.json();
      if (body.detail) detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
      if (body.code) code = body.code;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, detail, code);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

const get = <T>(path: string) => request<T>(path);
const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: "POST", body: JSON.stringify(body ?? {}) });
const patch = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: "PATCH", body: JSON.stringify(body ?? {}) });
const del = <T>(path: string) => request<T>(path, { method: "DELETE" });

// ── domain mapping: wire shapes → app shapes ────────────────────────────────

import type {
  ApiKey,
  Asset,
  CallAlert,
  Finding,
  FindingStatus,
  Integration,
  LogLine,
  Notification,
  Report,
  Scan,
  ScanType,
  Severity,
  TeamMember,
  User,
} from "@/types";

export interface WireScan {
  id: string;
  project_id: string;
  status: string;
  source?: string;
  compliance_score?: number | null;
  money_at_risk_inr?: number | null;
  counts?: Record<string, number>;
  exit_code?: number | null;
  started_at?: string | null;
  finished_at?: string | null;
  created_at?: string;
}

export interface WireFinding {
  id: string;
  scan_id: string;
  file: string;
  line: number;
  col?: number | null;
  severity: string;
  rule_id: string;
  category: string;
  compliance_ref?: string[];
  message: string;
  snippet?: string | null;
  fingerprint?: string | null;
  baseline_state?: string;
  validity?: string;
  money_at_risk_inr?: number | null;
  suppressed?: boolean;
  triage_state?: string;
  fix_action?: string | null;
}

export function scanToApp(w: WireScan): Scan {
  const type = (w.source as ScanType) || "full";
  const counts = w.counts ?? {};
  const findingsIssued =
    (counts.critical ?? 0) + (counts.high ?? 0) + (counts.medium ?? 0) + (counts.low ?? 0);
  return {
    id: w.id,
    name: `scan ${w.id.slice(0, 8)}`,
    type,
    status: (w.status as Scan["status"]) || "queued",
    target: "repository",
    initiatedBy: "API",
    startedAt: w.started_at ?? w.created_at ?? new Date().toISOString(),
    completedAt: w.finished_at ?? undefined,
    progress: w.status === "completed" ? 100 : w.status === "running" ? 50 : 5,
    logs: [],
    findingsIssued,
  };
}

const SEVERITY_MAP: Record<string, Severity> = {
  critical: "critical",
  high: "high",
  medium: "medium",
  low: "low",
  info: "info",
};

const CATEGORY_MAP: Record<string, Finding["category"]> = {
  secrets: "secrets",
  injection: "sast",
  auth: "api",
  pii: "dlp",
  crypto: "sast",
  logging: "iast",
  ratelimit: "api",
  supplychain: "dependency",
};

export function findingToApp(w: WireFinding): Finding {
  const triage = w.triage_state ?? "open";
  const status: FindingStatus =
    triage === "accepted" || triage === "open" ? "open" : triage === "dismissed" ? "resolved" : "suppressed";
  return {
    id: w.id,
    key: w.rule_id,
    title: w.message,
    description: `${w.message} in ${w.file}:${w.line}`,
    severity: SEVERITY_MAP[w.severity] ?? "medium",
    status,
    cvss: w.severity === "critical" ? 9 : w.severity === "high" ? 7 : 5,
    assetId: "backend",
    category: CATEGORY_MAP[w.category] ?? "config",
    detectedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    moneyAtRisk: w.money_at_risk_inr ?? 0,
    exploitability: w.severity === "critical" ? "high" : w.severity === "high" ? "medium" : "low",
    remediation: "Follow the remediation playbook in the finding detail view.",
    controls: w.compliance_ref ?? [],
    scanId: w.scan_id,
    evidence: [`Detected by ${w.rule_id} in ${w.file}:${w.line}`],
  };
}

export function toAppLog(level: string, msg: string): LogLine {
  return { t: new Date().toISOString(), level: (level as LogLine["level"]) || "info", msg };
}

// ── real-mode api surface (same shape as mock api) ───────────────────────────

export const realApi = {
  auth: {
    async login(email: string, password: string): Promise<{ token: string; user: User }> {
      const res = await post<{ access_token?: string }>("/auth/token", { email, password });
      const token = res.access_token ?? "demo-jwt";
      setApiToken(token);
      try {
        localStorage.setItem("sirius.token", token);
      } catch {
        /* noop */
      }
      return { token, user: { id: "demo", name: "Aarav Mehta", email, role: "owner", color: "#22d3ee", mfa: false } as User };
    },
    async signup(): Promise<{ ok: true }> {
      setApiToken("demo-jwt");
      return { ok: true };
    },
    async requestReset(): Promise<{ ok: true }> {
      return { ok: true };
    },
    async resetPassword(): Promise<{ ok: true }> {
      return { ok: true };
    },
    async verifyEmail(): Promise<{ ok: true }> {
      return { ok: true };
    },
    async me(): Promise<User> {
      const r = await get<{ id: string; name?: string; email?: string; role?: string; avatarUrl?: string | null }>("/me");
      return {
        id: r.id,
        name: r.name ?? "",
        email: r.email ?? "",
        role: (r.role as User["role"]) ?? "member",
        color: "#22d3ee",
        mfa: false,
        avatarUrl: r.avatarUrl ?? undefined,
      };
    },
    async logout() {
      clearApiToken();
      try {
        localStorage.removeItem("sirius.token");
      } catch {
        /* noop */
      }
    },
  },

  team: {
    async members(): Promise<TeamMember[]> {
      const rows = await get<Array<Record<string, unknown>>>("/team");
      return (rows ?? []).map((r) => ({
        id: String(r.id),
        name: String(r.name ?? ""),
        email: String(r.email ?? ""),
        role: (r.role as TeamMember["role"]) ?? "member",
        color: "#22d3ee",
        mfa: Boolean(r.mfa),
        title: String(r.title ?? ""),
        phone: r.phone ? String(r.phone) : undefined,
        status: (r.status as TeamMember["status"]) ?? "active",
        joinedAt: r.joinedAt ? String(r.joinedAt) : new Date().toISOString(),
        onCall: Boolean(r.onCall),
      }));
    },
    async invites() {
      return [];
    },
    async invite(emails: string[], role: TeamMember["role"]): Promise<void> {
      await post("/team/invite", { emails, role });
    },
    async updateMember(id: string, changes: Partial<TeamMember>): Promise<void> {
      await patch(`/team/${id}`, {
        role: changes.role,
        onCall: changes.onCall,
        status: changes.status,
        title: changes.title,
        phone: changes.phone,
      });
    },
    async removeMember(id: string): Promise<void> {
      await del(`/team/${id}`);
    },
    async revokeInvite(): Promise<void> {},
  },

  scans: {
    async list(): Promise<Scan[]> {
      const res = await get<{ items: WireScan[] }>("/scans");
      return (res.items ?? []).map(scanToApp);
    },
    async get(id: string): Promise<Scan | undefined> {
      const w = await get<WireScan>(`/scans/${id}`);
      return scanToApp(w);
    },
    async start(opts: { name?: string; type: ScanType; target: string }): Promise<Scan> {
      const w = await post<WireScan>("/scans", {
        project_id: "11111111-1111-4111-8111-111111111111",
        source: opts.type === "quick" ? "inline" : "git",
        target: opts.target || ".",
      });
      return scanToApp(w);
    },
    stream(
      id: string,
      handlers: {
        onProgress?: (s: Scan) => void;
        onLog?: (l: LogLine) => void;
        onFinding?: (f: Finding) => void;
        onDone?: (s: Scan) => void;
      },
    ): () => void {
      const token = getApiToken() ?? "demo-key";
      const wsUrl = `${WS_URL}/api/v1/scans/${id}/stream?token=${encodeURIComponent(token)}`;
      let ws: WebSocket | null = null;
      let closed = false;

      const open = () => {
        if (closed || typeof window === "undefined") return;
        ws = new WebSocket(wsUrl);
        ws.onopen = () => {
          handlers.onLog?.(toAppLog("info", "Live stream connected"));
        };
        ws.onmessage = (ev) => {
          try {
            const frame = JSON.parse(ev.data as string);
            if (frame.type === "scan.started") {
              handlers.onLog?.(toAppLog("info", `Scan started · ${frame.total_files ?? 0} files`));
            } else if (frame.type === "file.scanning") {
              handlers.onLog?.(toAppLog("info", `Scanning ${frame.path}`));
            } else if (frame.type === "finding") {
              handlers.onFinding?.(findingToApp(frame.finding));
            } else if (frame.type === "scan.completed") {
              handlers.onLog?.(toAppLog("success", "Scan completed"));
              const counts = frame.counts ?? {};
              handlers.onDone?.(
                scanToApp({
                  id,
                  project_id: "11111111-1111-4111-8111-111111111111",
                  status: "completed",
                  compliance_score: frame.compliance_score,
                  money_at_risk_inr: frame.money_at_risk_inr,
                  counts,
                  exit_code: frame.exit_code,
                }),
              );
            } else if (frame.type === "error") {
              handlers.onLog?.(toAppLog("error", frame.detail ?? frame.code ?? "scan error"));
            }
          } catch {
            /* ignore malformed frame */
          }
        };
        ws.onerror = () => {
          handlers.onLog?.(toAppLog("error", "Stream connection error — retrying"));
          setTimeout(open, 2000);
        };
        ws.onclose = () => {
          if (!closed) setTimeout(open, 2000);
        };
      };
      open();
      return () => {
        closed = true;
        ws?.close();
      };
    },
  },

  // ── LIVE EVENTS ──────────────────────────────────────────────────────────
  live: {
    /**
     * Subscribe to the global live event stream (/api/v1/events). Fires for
     * every scan: finding, progress, scan.completed. Returns unsubscribe.
     */
    subscribe(handlers: {
      onFinding?: (f: Finding) => void;
      onProgress?: (s: Scan) => void;
      onDone?: (s: Scan) => void;
      onLog?: (l: LogLine) => void;
    }): () => void {
      const token = getApiToken() ?? "demo-key";
      const wsUrl = `${WS_URL}/api/v1/events?token=${encodeURIComponent(token)}`;
      let ws: WebSocket | null = null;
      let closed = false;

      const open = () => {
        if (closed || typeof window === "undefined") return;
        ws = new WebSocket(wsUrl);
        ws.onmessage = (ev) => {
          try {
            const frame = JSON.parse(ev.data as string);
            if (frame.type === "finding") {
              handlers.onFinding?.(findingToApp(frame.finding));
            } else if (frame.type === "progress") {
              handlers.onLog?.(toAppLog("info", `Progress ${frame.scanned}/${frame.total} · ${frame.findings_so_far} findings`));
            } else if (frame.type === "scan.completed") {
              handlers.onLog?.(toAppLog("success", `Scan completed · score ${frame.compliance_score ?? "—"} · ₹${(frame.money_at_risk_inr ?? 0).toLocaleString("en-IN")}`));
              handlers.onDone?.(
                scanToApp({
                  id: frame.scan_id ?? "",
                  project_id: "11111111-1111-4111-8111-111111111111",
                  status: "completed",
                  compliance_score: frame.compliance_score,
                  money_at_risk_inr: frame.money_at_risk_inr,
                  counts: frame.counts ?? {},
                  exit_code: frame.exit_code,
                }),
              );
            } else if (frame.type === "error") {
              handlers.onLog?.(toAppLog("error", frame.detail ?? frame.code ?? "scan error"));
            }
          } catch {
            /* ignore malformed frame */
          }
        };
        ws.onclose = () => {
          if (!closed) setTimeout(open, 3000);
        };
        ws.onerror = () => {
          ws?.close();
        };
      };
      open();
      return () => {
        closed = true;
        ws?.close();
      };
    },
  },

  findings: {
    async list(): Promise<Finding[]> {
      // newest scan's findings; falls back to all scans' results
      const scans = await get<{ items: WireScan[] }>("/scans");
      const scan = scans.items?.[0];
      if (!scan) return [];
      const res = await get<{ items: WireFinding[] }>(`/scans/${scan.id}/results`);
      return (res.items ?? []).map(findingToApp);
    },
    async get(idOrKey: string): Promise<Finding | undefined> {
      const scans = await get<{ items: WireScan[] }>("/scans");
      for (const scan of scans.items ?? []) {
        const res = await get<{ items: WireFinding[] }>(`/scans/${scan.id}/results`);
        const f = res.items?.find((x) => x.id === idOrKey || x.rule_id === idOrKey);
        if (f) return findingToApp(f);
      }
      return undefined;
    },
    async update(id: string, patch: Partial<Finding>): Promise<Finding | undefined> {
      return this.get(id);
    },
    async setStatus(id: string, status: FindingStatus): Promise<Finding | undefined> {
      const state = status === "open" ? "open" : status === "in_progress" ? "accepted" : status === "suppressed" ? "suppressed" : "dismissed";
      const scanId = (await this.get(id))?.scanId;
      if (!scanId) return undefined;
      await patch(`/scans/${scanId}/findings/${id}`, { triage_state: state, reason: "Updated from console" });
      return this.get(id);
    },
    async suppress(id: string, reason: string): Promise<Finding | undefined> {
      const scanId = (await this.get(id))?.scanId;
      if (!scanId) return undefined;
      await patch(`/scans/${scanId}/findings/${id}`, { triage_state: "suppressed", reason });
      return this.get(id);
    },
  },

  compliance: {
    async frameworks() {
      return [];
    },
  },

  risk: {
    async summary() {
      const scans = await get<{ items: WireScan[] }>("/scans");
      const latest = scans.items?.[0];
      const counts = latest?.counts ?? {};
      const money = latest?.money_at_risk_inr ?? 0;
      return {
        moneyAtRisk: money,
        openCount: (counts.critical ?? 0) + (counts.high ?? 0) + (counts.medium ?? 0) + (counts.low ?? 0),
        bySeverity: { critical: counts.critical ?? 0, high: counts.high ?? 0, medium: counts.medium ?? 0, low: counts.low ?? 0, info: counts.info ?? 0 },
        byCategory: [],
        exposureByAsset: [],
        trend: [],
        mttrDays: 0,
        scans30d: scans.items?.length ?? 0,
        coverage: 100,
      };
    },
  },

  alerts: {
    async list() {
      const rows = await get<Array<Record<string, unknown>>>("/alerts");
      return (rows ?? []).map((r) => ({
        id: String(r.id),
        title: String(r.title ?? ""),
        severity: (r.severity as CallAlert["severity"]) ?? "high",
        recipient: String(r.recipient ?? ""),
        phone: String(r.phone ?? ""),
        policy: String(r.policy ?? ""),
        status: (r.status as CallAlert["status"]) ?? "delivered",
        triggeredAt: String(r.triggeredAt ?? new Date().toISOString()),
        acknowledgedAt: r.acknowledgedAt ? String(r.acknowledgedAt) : undefined,
        findingKey: r.findingKey ? String(r.findingKey) : undefined,
        transcript: Array.isArray(r.transcript) ? (r.transcript as string[]) : [],
        durationSec: Number(r.durationSec ?? 0),
      }));
    },
    subscribe() {
      return () => {};
    },
    async triggerInternal() {},
    async trigger() {},
    async update(id: string, status: string) {
      await patch(`/alerts/${id}`, { status });
    },
  },

  auditLog: {
    async list() {
      const rows = await get<Array<Record<string, unknown>>>("/audit-log");
      return (rows ?? []).map((r) => ({
        id: String(r.id),
        at: String(r.at ?? new Date().toISOString()),
        actor: String(r.actor ?? "system"),
        action: String(r.action ?? ""),
        target: String(r.target ?? ""),
        meta: r.meta ? String(r.meta) : undefined,
      }));
    },
  },

  keys: {
    async list(): Promise<ApiKey[]> {
      const rows = await get<Array<Record<string, unknown>>>("/auth/api-keys");
      return (rows ?? []).map((r) => ({
        id: String(r.id),
        name: String(r.name ?? ""),
        prefix: String(r.prefix ?? ""),
        scopes: Array.isArray(r.scopes) ? (r.scopes as string[]) : [],
        createdAt: String(r.created_at ?? new Date().toISOString()),
        expiresAt: r.expires_at ? String(r.expires_at) : new Date(Date.now() + 365 * 864e5).toISOString(),
        createdBy: String(r.created_by ?? ""),
        status: "active" as const,
      }));
    },
    async create(name: string, scopes: string[], expiryDays: number): Promise<ApiKey> {
      const r = await post<{ id: string; secret?: string; prefix?: string; name: string; scopes: string[]; expires_at?: string; created_at?: string; created_by?: string }>("/auth/api-keys", {
        name, scopes, expires_days: expiryDays,
      });
      return {
        id: r.id,
        name: r.name ?? name,
        prefix: r.prefix ?? "",
        scopes: r.scopes ?? scopes,
        createdAt: r.created_at ?? new Date().toISOString(),
        expiresAt: r.expires_at ?? new Date(Date.now() + expiryDays * 864e5).toISOString(),
        createdBy: r.created_by ?? "",
        status: "active",
        secret: r.secret,
      };
    },
    async revoke(id: string) {
      await del(`/auth/api-keys/${id}`);
    },
  },

  reports: {
    async list(): Promise<Report[]> {
      const scans = await get<{ items: WireScan[] }>("/scans");
      return (scans.items ?? [])
        .filter((s) => s.status === "completed")
        .map((s) => ({
          id: s.id,
          name: `Compliance report · ${s.id.slice(0, 8)}`,
          type: "compliance" as const,
          frameworks: [],
          from: "",
          to: "",
          createdAt: s.finished_at ?? s.created_at ?? new Date().toISOString(),
          createdBy: "Sirius",
          status: "ready" as const,
          sizeKb: 0,
        }));
    },
    async create(): Promise<never> {
      throw new Error("Create a scan first, then download its report");
    },
  },

  integrations: {
    async list() {
      const rows = await get<Array<Record<string, unknown>>>("/integrations");
      return (rows ?? []).map((r) => ({
        id: String(r.id),
        name: String(r.name ?? ""),
        category: (r.category as Integration["category"]) ?? "messaging",
        description: String(r.description ?? ""),
        connected: Boolean(r.connected),
        events: Number(r.events ?? 0),
      }));
    },
    async toggle(id: string) {
      await patch(`/integrations/${id}`, {});
    },
  },

  settings: {
    async policies() {
      return [];
    },
    async togglePolicy() {},
    async suppressions() {
      const rows = await get<Array<Record<string, unknown>>>("/suppressions");
      return (rows ?? []).map((r) => ({
        id: String(r.id),
        findingKey: String(r.rule_id ?? r.fingerprint ?? ""),
        reason: String(r.reason ?? ""),
        scope: "this_finding" as const,
        createdBy: String(r.created_by ?? ""),
        createdAt: String(r.created_at ?? new Date().toISOString()),
        expiresAt: String(r.expires_at ?? new Date(Date.now() + 30 * 864e5).toISOString()),
      }));
    },
    async removeSuppression(id: string) {
      await del(`/suppressions/${id}`);
    },
    async aiConfig() {
      return await get<{ endpoint: string; token: string; model: string; autoTriage: boolean }>("/ai-config");
    },
    async saveAI(cfg: { endpoint: string; token: string; model: string; autoTriage: boolean }) {
      await post("/ai-config", cfg);
    },
    async resetWorkspace() {},
  },

  notifications: {
    async list() {
      const rows = await get<Array<Record<string, unknown>>>("/notifications");
      return (rows ?? []).map((r) => ({
        id: String(r.id),
        at: String(r.at ?? new Date().toISOString()),
        title: String(r.title ?? ""),
        body: String(r.body ?? ""),
        kind: (r.kind as Notification["kind"]) ?? "system",
        read: Boolean(r.read),
      }));
    },
    subscribe() {
      return () => {};
    },
    async markRead() {},
    async markAllRead() {
      await post("/notifications/read", {});
    },
  },

  attackPaths: {
    async graph() {
      const res = await get<{ paths: Array<Record<string, unknown>> }>("/attack-paths");
      const paths = (res.paths ?? []).map((p) => ({
        id: String(p.id),
        name: String(p.name ?? ""),
        nodeIds: Array.isArray(p.nodeIds) ? (p.nodeIds as string[]) : [],
        probability: Number(p.probability ?? 0),
        impactUsd: Number(p.impactUsd ?? 0),
        techniques: Array.isArray(p.techniques) ? (p.techniques as string[]) : [],
        blocked: Boolean(p.blocked),
      }));
      return { nodes: [], links: [], paths };
    },
  },

  assets: {
    async list() {
      const rows = await get<Array<Record<string, unknown>>>("/assets");
      return (rows ?? []).map((r) => ({
        id: String(r.id),
        name: String(r.name ?? ""),
        kind: (r.kind as Asset["kind"]) ?? "service",
        criticality: Number(r.criticality ?? 1),
        exposure: (r.exposure as Asset["exposure"]) ?? "internal",
      }));
    },
  },

  members: {
    async onCall() {
      return [];
    },
  },
};
