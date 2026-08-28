import { DB_KEY } from "@/lib/constants";
import * as seed from "@/lib/mock/seed";
import type {
  ApiKey,
  AIConfig,
  Asset,
  AuditEvent,
  CallAlert,
  Finding,
  Framework,
  Integration,
  Invite,
  Notification,
  PolicyRule,
  Report,
  RiskPoint,
  Scan,
  Suppression,
  TeamMember,
} from "@/types";

export interface Credentials {
  email: string;
  password: string; // NOTE: mock only — real system hashes server-side (bcrypt/argon2)
  name: string;
  resetToken?: string;
  verified: boolean;
}

export interface DB {
  v: number;
  credentials: Credentials[];
  members: TeamMember[];
  invites: Invite[];
  assets: Asset[];
  findings: Finding[];
  scans: Scan[];
  alerts: CallAlert[];
  audit: AuditEvent[];
  keys: ApiKey[];
  reports: Report[];
  integrations: Integration[];
  policies: PolicyRule[];
  suppressions: Suppression[];
  notifications: Notification[];
  riskTrend: RiskPoint[];
  ai: AIConfig;
}

export function freshDB(): DB {
  return {
    v: 3,
    credentials: [
      { email: "demo@siriusline.io", password: "Demo123!", name: "Aarav Mehta", verified: true },
    ],
    members: seed.seedMembers,
    invites: seed.seedInvites,
    assets: seed.seedAssets,
    findings: seed.seedFindings,
    scans: seed.seedScans,
    alerts: seed.seedAlerts,
    audit: seed.seedAudit,
    keys: seed.seedKeys,
    reports: seed.seedReports,
    integrations: seed.seedIntegrations,
    policies: seed.seedPolicies,
    suppressions: seed.seedSuppressions,
    notifications: seed.seedNotifications,
    riskTrend: seed.seedRiskTrend(),
    ai: { endpoint: "", token: "", model: "sirius-selflearning-v1", autoTriage: false },
  };
}

let _db: DB | null = null;
const listeners = new Set<() => void>();

export function db(): DB {
  if (_db) return _db;
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(DB_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as DB;
        if (parsed.v === 3) {
          _db = parsed;
          return _db;
        }
      }
    } catch {
      /* corrupted store → reseed */
    }
  }
  _db = freshDB();
  persist();
  return _db;
}

function persist() {
  if (typeof window === "undefined" || !_db) return;
  try {
    window.localStorage.setItem(DB_KEY, JSON.stringify(_db));
  } catch {
    /* quota — ignore */
  }
}

export function mutate<T>(fn: (d: DB) => T): T {
  const d = db();
  const out = fn(d);
  persist();
  listeners.forEach((l) => l());
  return out;
}

export function resetDB() {
  _db = freshDB();
  persist();
  listeners.forEach((l) => l());
}

export function subscribeStore(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
