// ── Sirius Line API client ───────────────────────────────────────────────────
// MOCK MODE  : fully local, persisted to localStorage, simulated latency & live
//              streams. Used when NEXT_PUBLIC_API_URL is empty.
// REAL MODE  : when the FastAPI Core API URL is set, the same surface talks to
//              the real backend (Neon PostgreSQL lives behind it — the browser
//              NEVER talks to Neon directly). Endpoints map 1:1 to the Core API
//              so swapping over is a config change, not a rewrite.

import { AVATAR_COLORS, DEMO_CREDENTIALS, SESSION_COOKIE } from "@/lib/constants";
import { db, mutate, resetDB, subscribeStore, type Credentials } from "@/lib/mock/store";
import { delay, randomFrom, uid } from "@/lib/utils";
import type {
  AIConfig,
  ApiKey,
  Asset,
  AttackLink,
  AttackNode,
  AttackPath,
  AuditEvent,
  CallAlert,
  Finding,
  FindingStatus,
  Framework,
  Integration,
  Invite,
  LogLine,
  Notification,
  PolicyRule,
  Report,
  RiskPoint,
  Role,
  Scan,
  ScanType,
  Severity,
  TeamMember,
  User,
} from "@/types";
import * as seed from "@/lib/mock/seed";

export const USING_MOCK = !process.env.NEXT_PUBLIC_API_URL;

// ── helpers ──────────────────────────────────────────────────────────────────

const wait = () => delay(40 + Math.random() * 60);

function audit(action: string, target: string, actor = "You", meta?: string) {
  mutate((d) => d.audit.unshift({ id: uid("au"), at: new Date().toISOString(), actor, action, target, meta }));
}

function notify(title: string, body: string, kind: Notification["kind"]) {
  mutate((d) => d.notifications.unshift({ id: uid("n"), at: new Date().toISOString(), title, body, kind, read: false }));
}

function fakeToken(user: User) {
  const payload = { sub: user.email, name: user.name, role: user.role, exp: Date.now() + 7 * 864e5 };
  return `slt.${btoa(JSON.stringify(payload))}.mocksig`;
}

export function setSessionCookie(token: string) {
  document.cookie = `${SESSION_COOKIE}=${token}; path=/; max-age=${7 * 86400}; samesite=lax`;
}
export function clearSessionCookie() {
  document.cookie = `${SESSION_COOKIE}=; path=/; max-age=0; samesite=lax`;
}

function creds(email: string): Credentials | undefined {
  return db().credentials.find((c) => c.email.toLowerCase() === email.toLowerCase());
}

function memberByEmail(email: string): TeamMember | undefined {
  return db().members.find((m) => m.email.toLowerCase() === email.toLowerCase());
}

// ── live scan machinery (mock) ───────────────────────────────────────────────

const pendingPool = new Map<string, Finding[]>();
const streamIntervals = new Map<string, ReturnType<typeof setInterval>>();

const LOG_POOL: LogLine[] = [
  { t: "", level: "info", msg: "Resolving asset inventory… 8 assets" },
  { t: "", level: "info", msg: "Fetching SBOM & dependency graph" },
  { t: "", level: "info", msg: "SAST · building code property graph" },
  { t: "", level: "info", msg: "SECRETS · scanning git history (entropy + pattern)" },
  { t: "", level: "warn", msg: "IAST · instrumenting runtime on staging mirror" },
  { t: "", level: "info", msg: "CONFIG · diffing cloud accounts against baseline" },
  { t: "", level: "info", msg: "DLP · sampling logs & object storage for PII" },
  { t: "", level: "info", msg: "Correlating CVE feeds (NVD, OSV, GHSA)…" },
  { t: "", level: "info", msg: "Scoring money-at-risk per finding" },
  { t: "", level: "success", msg: "Passing controls recorded" },
];

function makeLiveFinding(scanId: string, n: number): Finding {
  const templates: Array<Partial<Finding> & { title: string; severity: Severity }> = [
    { title: "Verbose error response leaks stack trace", severity: "medium", category: "iast", cvss: 4.9, moneyAtRisk: 9_000, controls: ["A.8.25"] },
    { title: "Outdated cryptography library in image layer", severity: "medium", category: "dependency", cvss: 5.8, moneyAtRisk: 35_000, controls: ["A.8.8", "A.8.24"] },
    { title: "CORS allows arbitrary origins on /v1/*", severity: "high", category: "config", cvss: 6.5, moneyAtRisk: 140_000, controls: ["CC6.6", "PCI-6.4.1"] },
    { title: "IDOR candidate on /statements/{id}", severity: "high", category: "api", cvss: 7.1, moneyAtRisk: 260_000, controls: ["CC6.1", "PCI-7.2.1"] },
    { title: "Access token long-lived (>24h)", severity: "low", category: "config", cvss: 3.2, moneyAtRisk: 0, controls: ["PCI-8.3.9"] },
    { title: "SSRF candidate in webhook receiver", severity: "critical", category: "sast", cvss: 8.7, moneyAtRisk: 720_000, controls: ["PCI-6.4.1", "CC7.1"] },
    { title: "Backup bucket lacks server-side encryption", severity: "high", category: "config", cvss: 6.9, moneyAtRisk: 190_000, controls: ["PR.DS", "ART-32"] },
  ];
  const t = templates[(n - 1) % templates.length];
  const asset = randomFrom(db().assets);
  const iso = new Date().toISOString();
  return {
    id: uid("f"),
    key: `SIR-${(t.category ?? "cfg").toUpperCase().slice(0, 3)}-${String(900 + n)}`,
    title: t.title,
    description: "Detected by the Sirius analysis engine during a live scan.",
    severity: t.severity,
    status: "open",
    cvss: t.cvss ?? 5,
    assetId: asset.id,
    category: (t.category ?? "config") as Finding["category"],
    detectedAt: iso,
    updatedAt: iso,
    moneyAtRisk: t.moneyAtRisk ?? 0,
    exploitability: t.severity === "critical" ? "high" : t.severity === "high" ? "medium" : "low",
    remediation: "Follow the remediation playbook linked in the finding detail view.",
    controls: t.controls ?? [],
    scanId,
    evidence: ["Auto-generated during live scan instrumentation."],
  };
}

// ── API surface ───────────────────────────────────────────────────────────────

export const mockApi = {
  // ── AUTH ───────────────────────────────────────────────────────────────────
  auth: {
    async login(email: string, password: string): Promise<{ token: string; user: User }> {
      await wait();
      const c = creds(email);
      if (!c || c.password !== password) throw new Error("Invalid email or password");
      if (!c.verified) throw new Error("Email not verified — check your inbox");
      const m = memberByEmail(email)!;
      audit("auth.login", email, m.name);
      return { token: fakeToken(m), user: m };
    },

    async signup(name: string, email: string, password: string): Promise<{ ok: true }> {
      await wait();
      if (creds(email)) throw new Error("An account with this email already exists");
      mutate((d) => {
        d.credentials.push({ email, password, name, verified: false });
        d.members.push({
          id: uid("u"),
          name,
          email,
          role: "owner",
          color: randomFrom(AVATAR_COLORS),
          mfa: false,
          title: "Founder",
          status: "invited",
          joinedAt: new Date().toISOString(),
          onCall: false,
        });
      });
      audit("auth.signup", email, name);
      return { ok: true };
    },

    async requestReset(email: string): Promise<{ ok: true }> {
      await wait();
      const c = creds(email);
      if (c) mutate(() => { c.resetToken = "demo-reset-token"; });
      // always ok (no user enumeration)
      return { ok: true };
    },

    async resetPassword(token: string, password: string): Promise<{ ok: true }> {
      await wait();
      const c = db().credentials.find((x) => x.resetToken === token);
      if (!c) throw new Error("Invalid or expired reset token");
      mutate(() => { c.password = password; c.resetToken = undefined; });
      audit("auth.password_reset", c.email, c.name);
      return { ok: true };
    },

    async verifyEmail(token: string): Promise<{ ok: true }> {
      await wait();
      if (token !== "demo-verify-token") throw new Error("Invalid verification token");
      mutate((d) => d.credentials.forEach((c) => (c.verified = true)));
      return { ok: true };
    },

    async me(token: string): Promise<User> {
      await delay(120);
      try {
        const payload = JSON.parse(atob(token.split(".")[1])) as { sub: string; exp: number };
        if (payload.exp < Date.now()) throw new Error("expired");
        const m = memberByEmail(payload.sub);
        if (!m) throw new Error("unknown user");
        return m;
      } catch {
        throw new Error("Session expired");
      }
    },

    async logout() {
      clearSessionCookie();
      try { localStorage.removeItem("sirius.token"); } catch { /* noop */ }
    },
  },

  // ── TEAM / RBAC ────────────────────────────────────────────────────────────
  team: {
    async members(): Promise<TeamMember[]> { await wait(); return [...db().members]; },
    async invites(): Promise<Invite[]> { await wait(); return [...db().invites]; },
    async invite(emails: string[], role: Role, by: string): Promise<void> {
      await wait();
      mutate((d) => {
        emails.forEach((email) => {
          if (d.members.some((m) => m.email.toLowerCase() === email.toLowerCase())) return;
          d.invites.unshift({ id: uid("inv"), email, role, invitedBy: by, invitedAt: new Date().toISOString(), status: "pending" });
        });
      });
      audit("team.invite", emails.join(", "), by);
      notify("Invite sent", `${emails.length} invitation(s) sent as ${role}`, "team");
    },
    async updateMember(id: string, patch: Partial<TeamMember>, by: string): Promise<void> {
      await wait();
      mutate((d) => {
        const m = d.members.find((x) => x.id === id);
        if (m) Object.assign(m, patch);
      });
      const m = db().members.find((x) => x.id === id);
      if (m) audit("team.update", `${m.email} → ${JSON.stringify(patch)}`, by);
    },
    async removeMember(id: string, by: string): Promise<void> {
      await wait();
      const m = db().members.find((x) => x.id === id);
      mutate((d) => { d.members = d.members.filter((x) => x.id !== id); });
      if (m) audit("team.remove", m.email, by);
    },
    async revokeInvite(inviteId: string, by: string): Promise<void> {
      await wait();
      mutate((d) => { d.invites = d.invites.filter((i) => i.id !== inviteId); });
      audit("team.invite_revoke", inviteId, by);
    },
  },

  // ── SCANS ──────────────────────────────────────────────────────────────────
  scans: {
    async list(): Promise<Scan[]> { await wait(); return [...db().scans]; },
    async get(id: string): Promise<Scan | undefined> { await delay(80); return db().scans.find((s) => s.id === id); },

    async start(opts: { name?: string; type: ScanType; target: string }, by: string): Promise<Scan> {
      await wait();
      const scan: Scan = {
        id: uid("s"),
        name: opts.name?.trim() || `${opts.type} · ${opts.target}`,
        type: opts.type,
        status: "running",
        target: opts.target,
        initiatedBy: by,
        startedAt: new Date().toISOString(),
        progress: 3,
        logs: [{ t: new Date().toISOString(), level: "info", msg: `Scan queued · target ${opts.target}` }],
        findingsIssued: 0,
      };
      const count = opts.type === "quick" ? 3 : opts.type === "full" ? 7 : 5;
      pendingPool.set(scan.id, Array.from({ length: count }, (_, i) => makeLiveFinding(scan.id, i + 1)));
      mutate((d) => d.scans.unshift(scan));
      audit("scan.start", scan.name, by);
      notify("Scan started", `${scan.name} is now running`, "scan");
      return scan;
    },

    /** Live result stream. Returns an unsubscribe fn. (Real mode: WebSocket.) */
    stream(
      id: string,
      handlers: {
        onProgress?: (s: Scan) => void;
        onLog?: (l: LogLine) => void;
        onFinding?: (f: Finding) => void;
        onDone?: (s: Scan) => void;
      }
    ): () => void {
      if (streamIntervals.has(id)) return () => void 0;
      const iv = setInterval(() => {
        const s = db().scans.find((x) => x.id === id);
        if (!s || s.status !== "running") {
          clearInterval(iv!);
          streamIntervals.delete(id);
          if (s) handlers.onDone?.(s);
          return;
        }
        mutate((d) => {
          const sc = d.scans.find((x) => x.id === id)!;
          sc.progress = Math.min(100, sc.progress + 4 + Math.random() * 6);
          const log = { ...randomFrom(LOG_POOL), t: new Date().toISOString() };
          sc.logs.push(log);
          handlers.onLog?.(log);

          const pool = pendingPool.get(id) ?? [];
          const shouldEmit = sc.progress > 20 && pool.length > 0 && Math.random() > 0.45;
          if (shouldEmit) {
            const f = pool.shift()!;
            d.findings.unshift(f);
            sc.findingsIssued++;
            sc.logs.push({ t: new Date().toISOString(), level: f.severity === "critical" || f.severity === "high" ? "error" : "warn", msg: `${f.category.toUpperCase()} · ${f.title} [${f.key}]` });
            handlers.onFinding?.(f);
            if (f.severity === "critical") {
              mockApi.alerts.triggerInternal(`Sev-1 · ${f.title}`, f.severity, f.key);
            }
          }
          if (sc.progress >= 100) {
            sc.status = "completed";
            sc.completedAt = new Date().toISOString();
            pendingPool.delete(id);
            notify("Scan completed", `${sc.name} · ${sc.findingsIssued} new findings`, "scan");
            setTimeout(() => handlers.onDone?.(sc), 0);
          } else {
            handlers.onProgress?.(sc);
          }
        });
      }, 850);
      streamIntervals.set(id, iv);
      return () => {
        clearInterval(iv);
        streamIntervals.delete(id);
      };
    },
  },

  // ── FINDINGS ───────────────────────────────────────────────────────────────
  findings: {
    async list(): Promise<Finding[]> { await wait(); return [...db().findings]; },
    async get(idOrKey: string): Promise<Finding | undefined> {
      await delay(80);
      return db().findings.find((f) => f.id === idOrKey || f.key === idOrKey);
    },
    async update(id: string, patch: Partial<Finding>, by: string): Promise<Finding | undefined> {
      await wait();
      mutate((d) => {
        const f = d.findings.find((x) => x.id === id);
        if (f) Object.assign(f, patch, { updatedAt: new Date().toISOString() });
      });
      const f = db().findings.find((x) => x.id === id);
      if (f) audit("finding.update", `${f.key} → ${JSON.stringify(patch)}`, by);
      return f;
    },
    async setStatus(id: string, status: FindingStatus, by: string) {
      return mockApi.findings.update(id, { status }, by);
    },
    async suppress(id: string, reason: string, scope: "this_finding" | "all_similar", by: string) {
      const f = await mockApi.findings.update(id, { status: "suppressed" }, by);
      if (f) {
        mutate((d) =>
          d.suppressions.unshift({
            id: uid("sp"),
            findingKey: f.key,
            reason,
            scope,
            createdBy: by,
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 30 * 864e5).toISOString(),
          })
        );
        audit("suppression.add", f.key, by);
      }
      return f;
    },
  },

  // ── COMPLIANCE ─────────────────────────────────────────────────────────────
  compliance: {
    async frameworks(): Promise<Array<Framework & { score: number; failing: string[] }>> {
      await wait();
      const d = db();
      const openFindingControls = new Set(
        d.findings.filter((f) => f.status === "open" || f.status === "in_progress").flatMap((f) => f.controls)
      );
      const resolvedControls = new Set(d.findings.filter((f) => f.status === "resolved").flatMap((f) => f.controls));
      return seed.seedFrameworks.map((fw) => {
        const failing = fw.controls.filter((c) => openFindingControls.has(c.id)).map((c) => c.id);
        const partial = fw.controls.filter((c) => resolvedControls.has(c.id)).map((c) => c.id);
        const score = Math.round(((fw.controls.length - failing.length - partial.length * 0.5) / fw.controls.length) * 100);
        return { ...fw, failing, score: Math.max(0, score), controls: fw.controls.map((c) => ({ ...c, status: openFindingControls.has(c.id) ? "fail" : resolvedControls.has(c.id) ? "partial" : "pass" })) };
      });
    },
  },

  // ── RISK / ANALYTICS ───────────────────────────────────────────────────────
  risk: {
    async summary() {
      await wait();
      const d = db();
      const active = d.findings.filter((f) => f.status === "open" || f.status === "in_progress");
      const money = active.reduce((s, f) => s + f.moneyAtRisk, 0);
      const bySeverity = { critical: 0, high: 0, medium: 0, low: 0, info: 0 } as Record<Severity, number>;
      active.forEach((f) => bySeverity[f.severity]++);
      const byCategory = new Map<string, number>();
      active.forEach((f) => byCategory.set(f.category, (byCategory.get(f.category) ?? 0) + 1));
      const exposureByAsset = d.assets
        .map((a) => ({ asset: a.name, money: active.filter((f) => f.assetId === a.id).reduce((s, f) => s + f.moneyAtRisk, 0) }))
        .sort((x, y) => y.money - x.money);
      const trend: RiskPoint[] = d.riskTrend;
      const mttrDays =
        d.findings.filter((f) => f.status === "resolved").length > 0
          ? (d.findings.filter((f) => f.status === "resolved").reduce((s, f) => s + (Date.now() - new Date(f.detectedAt).getTime()) / 864e5, 0) /
            d.findings.filter((f) => f.status === "resolved").length).toFixed(1)
          : "0";
      return {
        moneyAtRisk: money,
        openCount: active.length,
        bySeverity,
        byCategory: [...byCategory.entries()].map(([category, count]) => ({ category, count })),
        exposureByAsset,
        trend,
        mttrDays: Number(mttrDays),
        scans30d: d.scans.length * 9 + 12,
        coverage: 98.2,
      };
    },
  },

  // ── CALL ALERTS ────────────────────────────────────────────────────────────
  alerts: {
    async list(): Promise<CallAlert[]> { await wait(); return [...db().alerts]; },
    subscribe(cb: (alerts: CallAlert[]) => void) {
      const handler = () => cb([...db().alerts]);
      listeners.add(handler);
      return () => {
        listeners.delete(handler);
      };
    },

    triggerInternal(title: string, severity: Severity, findingKey?: string) {
      const onCall = db().members.filter((m) => m.onCall && m.status === "active");
      const lead = onCall[0] ?? db().members[0];
      const al: CallAlert = {
        id: uid("al"),
        title,
        severity,
        recipient: `${lead.name} (${lead.role === "admin" ? "on-call lead" : "on-call"})`,
        phone: lead.phone ?? "+91 90000 00000",
        policy: severity === "critical" ? "Critical finding on money-mover asset → call on-call lead" : "High finding → call service owner",
        status: "ringing",
        triggeredAt: new Date().toISOString(),
        findingKey,
        transcript: [`SIRIUS: Sirius Line alert. ${title}.`, "SIRIUS: Press one to acknowledge."],
        durationSec: 0,
      };
      mutate((d) => d.alerts.unshift(al));
      audit("alert.triggered", `${title} → ${al.phone}`, "system", "voice");
      notify("Call alert placed", `${title} → ${al.recipient}`, "alert");
      setTimeout(() => {
        const cur = db().alerts.find((a) => a.id === al.id);
        if (cur && cur.status === "ringing") {
          mutate((d) => {
            const x = d.alerts.find((a) => a.id === al.id);
            if (x) { x.status = "delivered"; x.durationSec = 12 + Math.floor(Math.random() * 40); }
          });
        }
      }, 4500);
    },

    async trigger(input: { title: string; severity: Severity; recipientId: string; findingKey?: string }, by: string) {
      await wait();
      const m = db().members.find((x) => x.id === input.recipientId) ?? db().members[0];
      const al: CallAlert = {
        id: uid("al"),
        title: input.title,
        severity: input.severity,
        recipient: m.name,
        phone: m.phone ?? "+91 90000 00000",
        policy: "Manual trigger from alerts console",
        status: "ringing",
        triggeredAt: new Date().toISOString(),
        findingKey: input.findingKey,
        transcript: [`SIRIUS: This is a Sirius Line ${input.severity} alert. ${input.title}.`, "SIRIUS: Press one to acknowledge."],
        durationSec: 0,
      };
      mutate((d) => d.alerts.unshift(al));
      audit("alert.triggered", `${input.title} → ${m.phone ?? ""}`, by, "voice·manual");
      notify("Call alert placed", `${input.title} → ${m.name}`, "alert");
      setTimeout(() => {
        mutate((d) => {
          const x = d.alerts.find((a) => a.id === al.id);
          if (x && x.status === "ringing") { x.status = "delivered"; x.durationSec = 15 + Math.floor(Math.random() * 30); }
        });
      }, 4500);
    },

    async update(id: string, status: CallAlert["status"], by: string) {
      await wait();
      mutate((d) => {
        const a = d.alerts.find((x) => x.id === id);
        if (a) {
          a.status = status;
          if (status === "acknowledged" || status === "resolved") a.acknowledgedAt = new Date().toISOString();
          if (status === "escalated") {
            const next = d.members.filter((m) => m.onCall && m.status === "active")[1] ?? d.members[0];
            a.recipient = `${a.recipient} → escalated to ${next.name}`;
            a.transcript.push(`SIRIUS: Escalating to ${next.name} at ${next.phone ?? "on-file"}.`);
          }
        }
      });
      const a = db().alerts.find((x) => x.id === id);
      if (a) audit(`alert.${status}`, a.title, by);
    },
  },

  // ── AUDIT ──────────────────────────────────────────────────────────────────
  auditLog: {
    async list(): Promise<AuditEvent[]> { await wait(); return [...db().audit]; },
  },

  // ── API KEYS ───────────────────────────────────────────────────────────────
  keys: {
    async list(): Promise<ApiKey[]> { await wait(); return [...db().keys]; },
    async create(name: string, scopes: string[], expiryDays: number, by: string): Promise<ApiKey> {
      await wait();
      const secret = `sk_live_${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 14)}`;
      const key: ApiKey = {
        id: uid("k"),
        name,
        prefix: secret.slice(0, 12),
        scopes,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + expiryDays * 864e5).toISOString(),
        createdBy: by,
        status: "active",
        secret,
      };
      mutate((d) => d.keys.unshift(key));
      audit("key.create", `${name} (${scopes.join(", ")})`, by);
      notify("API key created", `${name} · copy the secret now, it won't be shown again`, "system");
      return key;
    },
    async revoke(id: string, by: string) {
      await wait();
      mutate((d) => {
        const k = d.keys.find((x) => x.id === id);
        if (k) k.status = "revoked";
      });
      const k = db().keys.find((x) => x.id === id);
      if (k) audit("key.revoke", k.name, by);
    },
  },

  // ── REPORTS ────────────────────────────────────────────────────────────────
  reports: {
    async list(): Promise<Report[]> { await wait(); return [...db().reports]; },
    async create(input: { type: Report["type"]; frameworks: string[]; from: string; to: string; name: string }, by: string): Promise<Report> {
      await wait();
      const r: Report = { id: uid("r"), ...input, createdAt: new Date().toISOString(), createdBy: by, status: "generating", sizeKb: 0 };
      mutate((d) => d.reports.unshift(r));
      audit("report.generate", r.name, by);
      setTimeout(() => {
        mutate((d) => {
          const x = d.reports.find((y) => y.id === r.id);
          if (x) { x.status = "ready"; x.sizeKb = 180 + Math.floor(Math.random() * 900); }
        });
        notify("Report ready", `${r.name} is available for download`, "system");
      }, 3500);
      return r;
    },
  },

  // ── INTEGRATIONS ───────────────────────────────────────────────────────────
  integrations: {
    async list(): Promise<Integration[]> { await wait(); return [...db().integrations]; },
    async toggle(id: string, by: string) {
      await wait();
      mutate((d) => {
        const i = d.integrations.find((x) => x.id === id);
        if (i) i.connected = !i.connected;
      });
      const i = db().integrations.find((x) => x.id === id);
      if (i) audit(`integration.${i.connected ? "connect" : "disconnect"}`, i.name, by);
    },
  },

  // ── SETTINGS ───────────────────────────────────────────────────────────────
  settings: {
    async policies(): Promise<PolicyRule[]> { await wait(); return [...db().policies]; },
    async togglePolicy(id: string, by: string) {
      await wait();
      mutate((d) => {
        const p = d.policies.find((x) => x.id === id);
        if (p) p.enabled = !p.enabled;
      });
      const p = db().policies.find((x) => x.id === id);
      if (p) audit("policy.update", p.name, by);
    },
    async suppressions() { await wait(); return [...db().suppressions]; },
    async removeSuppression(id: string, by: string) {
      await wait();
      mutate((d) => { d.suppressions = d.suppressions.filter((s) => s.id !== id); });
      audit("suppression.remove", id, by);
    },
    async aiConfig(): Promise<AIConfig> { await wait(); return { ...db().ai }; },
    async saveAI(cfg: AIConfig, by: string) {
      await wait();
      mutate((d) => { d.ai = cfg; });
      audit("ai.configure", cfg.endpoint || "(cleared)", by);
    },
    async resetWorkspace(by: string) {
      await wait();
      resetDB();
      audit("workspace.reset", "demo data regenerated", by);
    },
  },

  // ── NOTIFICATIONS ──────────────────────────────────────────────────────────
  notifications: {
    async list(): Promise<Notification[]> { await delay(60); return [...db().notifications]; },
    subscribe(cb: (n: Notification[]) => void) {
      const handler = () => cb([...db().notifications]);
      listeners.add(handler);
      return () => {
        listeners.delete(handler);
      };
    },
    async markRead(id: string) {
      mutate((d) => {
        const n = d.notifications.find((x) => x.id === id);
        if (n) n.read = true;
      });
    },
    async markAllRead() {
      mutate((d) => d.notifications.forEach((n) => (n.read = true)));
    },
  },

  // ── ATTACK PATHS ───────────────────────────────────────────────────────────
  attackPaths: {
    async graph(): Promise<{ nodes: AttackNode[]; links: AttackLink[]; paths: AttackPath[] }> {
      await wait();
      return { nodes: seed.seedAttackNodes, links: seed.seedAttackLinks, paths: seed.seedAttackPaths };
    },
  },

  assets: {
    async list(): Promise<Asset[]> { await wait(); return [...db().assets]; },
  },

  members: {
    async onCall(): Promise<TeamMember[]> { return db().members.filter((m) => m.onCall && m.status === "active"); },
  },
};

// ── facade: mock (localStorage) or real (FastAPI Core API) ───────────────────
// Real mode activates when NEXT_PUBLIC_API_URL is set. The browser NEVER talks
// to Neon PostgreSQL directly — only to this API.
import { realApi } from "@/lib/real/api";

export const api = USING_MOCK ? mockApi : realApi;

// store-level subscription shim used by alerts/notifications live views

type Listener = () => void;
const listeners = new Set<Listener>();
if (typeof window !== "undefined") {
  subscribeStore(() => listeners.forEach((l) => l()));
}
