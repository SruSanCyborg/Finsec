// ── Sirius Line · shared domain types ────────────────────────────────────────

export type Role = "owner" | "admin" | "analyst" | "member" | "viewer";
export type Severity = "critical" | "high" | "medium" | "low" | "info";
export type FindingStatus = "open" | "in_progress" | "resolved" | "suppressed";
export type ScanStatus = "queued" | "running" | "completed" | "failed";
export type ScanType = "full" | "quick" | "targeted" | "third_party" | "drift";
export type FindingCategory =
  | "sast"
  | "secrets"
  | "iast"
  | "config"
  | "dependency"
  | "drift"
  | "dlp"
  | "api";

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  color: string;
  mfa: boolean;
}

export interface TeamMember extends User {
  title: string;
  phone?: string;
  status: "active" | "invited" | "suspended";
  joinedAt: string;
  onCall: boolean;
}

export interface Invite {
  id: string;
  email: string;
  role: Role;
  invitedBy: string;
  invitedAt: string;
  status: "pending" | "expired";
}

export interface Asset {
  id: string;
  name: string;
  kind: "api" | "service" | "database" | "queue" | "bucket" | "endpoint" | "cluster";
  criticality: number; // 1..5
  exposure: "public" | "internal";
}

export interface Finding {
  id: string;
  key: string; // e.g. SIR-SEC-0142
  title: string;
  description: string;
  severity: Severity;
  status: FindingStatus;
  cvss: number;
  assetId: string;
  category: FindingCategory;
  detectedAt: string;
  updatedAt: string;
  moneyAtRisk: number;
  exploitability: "high" | "medium" | "low";
  remediation: string;
  controls: string[]; // control ids this finding maps to
  scanId: string;
  evidence: string[];
}

export interface LogLine {
  t: string;
  level: "info" | "warn" | "error" | "success";
  msg: string;
}

export interface Scan {
  id: string;
  name: string;
  type: ScanType;
  status: ScanStatus;
  target: string;
  initiatedBy: string;
  startedAt: string;
  completedAt?: string;
  progress: number; // 0..100
  logs: LogLine[];
  findingsIssued: number;
}

export interface Control {
  id: string;
  title: string;
  status: "pass" | "fail" | "partial";
}

export interface Framework {
  id: string;
  name: string;
  version: string;
  description: string;
  controls: Control[];
}

export interface CallAlert {
  id: string;
  title: string;
  severity: Severity;
  recipient: string;
  phone: string;
  policy: string; // e.g. "Sev-1 → On-call lead"
  status: "ringing" | "delivered" | "acknowledged" | "escalated" | "resolved";
  triggeredAt: string;
  acknowledgedAt?: string;
  findingKey?: string;
  transcript: string[];
  durationSec: number;
}

export interface AuditEvent {
  id: string;
  at: string;
  actor: string;
  action: string;
  target: string;
  meta?: string;
}

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt?: string;
  expiresAt: string;
  createdBy: string;
  status: "active" | "revoked";
  secret?: string; // only present immediately after creation
}

export interface Report {
  id: string;
  name: string;
  type: "executive" | "technical" | "compliance";
  frameworks: string[];
  from: string;
  to: string;
  createdAt: string;
  createdBy: string;
  status: "generating" | "ready";
  sizeKb: number;
}

export interface Integration {
  id: string;
  name: string;
  category: "ticketing" | "messaging" | "code" | "voice" | "cloud" | "ci";
  description: string;
  connected: boolean;
  events: number;
}

export interface PolicyRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  severityFloor: Severity;
}

export interface Suppression {
  id: string;
  findingKey: string;
  reason: string;
  scope: "this_finding" | "all_similar";
  createdBy: string;
  createdAt: string;
  expiresAt: string;
}

export interface Notification {
  id: string;
  at: string;
  title: string;
  body: string;
  kind: "alert" | "scan" | "team" | "system" | "ai";
  read: boolean;
}

export interface AIConfig {
  endpoint: string;
  token: string;
  model: string;
  autoTriage: boolean;
}

// ── Attack path graph (3D viz) ───────────────────────────────────────────────

export interface AttackNode {
  id: string;
  label: string;
  layer: 0 | 1 | 2 | 3; // internet → edge → app → data
  kind: Asset["kind"] | "actor";
  severity?: Severity;
  x: number;
  y: number;
  z: number;
}

export interface AttackLink {
  from: string;
  to: string;
  active: boolean;
  technique: string;
}

export interface AttackPath {
  id: string;
  name: string;
  nodeIds: string[];
  probability: number;
  impactUsd: number;
  techniques: string[];
  blocked: boolean;
}

// ── Dashboard analytics ──────────────────────────────────────────────────────

export interface RiskPoint {
  date: string;
  risk: number; // $ at risk
  open: number;
  resolved: number;
}

export interface CategoryCount {
  category: FindingCategory | string;
  count: number;
}
