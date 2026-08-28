// ── Sirius Line · real-mode API client ───────────────────────────────────────
// Talks to the FastAPI Core API (backend/ on the Auto branch) over REST + WS.
// The browser NEVER touches Neon directly — it talks to this API only.
// Maps 1:1 to the mock facade in src/lib/mock/api.ts so pages are unchanged.

const API_URL = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");
const WS_URL =
  process.env.NEXT_PUBLIC_WS_URL?.replace(/\/$/, "") ??
  API_URL?.replace(/^http/, "ws");

export const REAL = !!API_URL;

const TOKEN_KEY = "sirius.api_token";

export function getApiToken(): string | null {
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
): Promise<T> {
  const token = getApiToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, { ...init, headers, cache: "no-store" });
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
  Finding,
  FindingStatus,
  LogLine,
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
      return { id: "demo", name: "Aarav Mehta", email: "demo@siriusline.io", role: "owner", color: "#22d3ee", mfa: false };
    },
    async logout() {
      clearApiToken();
    },
  },

  team: {
    async members(): Promise<TeamMember[]> {
      return [{ id: "demo", name: "Aarav Mehta", email: "demo@siriusline.io", role: "owner", color: "#22d3ee", mfa: false, title: "Founder", status: "active", joinedAt: new Date().toISOString(), onCall: false }];
    },
    async invites() {
      return [];
    },
    async invite(): Promise<void> {},
    async updateMember(): Promise<void> {},
    async removeMember(): Promise<void> {},
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
      return [];
    },
    subscribe() {
      return () => {};
    },
    async triggerInternal() {},
    async trigger() {},
    async update() {},
  },

  auditLog: {
    async list() {
      return [];
    },
  },

  keys: {
    async list() {
      return [];
    },
    async create(): Promise<never> {
      throw new Error("API key management is handled in the backend console");
    },
    async revoke() {},
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
      return [];
    },
    async toggle() {},
  },

  settings: {
    async policies() {
      return [];
    },
    async togglePolicy() {},
    async suppressions() {
      return [];
    },
    async removeSuppression() {},
    async aiConfig() {
      return { endpoint: "", token: "", model: "sirius-selflearning-v1", autoTriage: false };
    },
    async saveAI() {},
    async resetWorkspace() {},
  },

  notifications: {
    async list() {
      return [];
    },
    subscribe() {
      return () => {};
    },
    async markRead() {},
    async markAllRead() {},
  },

  attackPaths: {
    async graph() {
      return { nodes: [], links: [], paths: [] };
    },
  },

  assets: {
    async list() {
      return [];
    },
  },

  members: {
    async onCall() {
      return [];
    },
  },
};
