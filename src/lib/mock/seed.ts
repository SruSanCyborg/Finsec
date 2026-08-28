import type {
  ApiKey,
  Asset,
  AttackLink,
  AttackNode,
  AttackPath,
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

const now = Date.now();
const ago = (mins: number) => new Date(now - mins * 60_000).toISOString();
export const daysAgo = (d: number) => new Date(now - d * 86_400_000).toISOString();
const ahead = (d: number) => new Date(now + d * 86_400_000).toISOString();

// ── Team ─────────────────────────────────────────────────────────────────────

export const seedMembers: TeamMember[] = [
  { id: "u_1", name: "Aarav Mehta", email: "demo@sirius.dev", role: "owner", color: "#22d3ee", mfa: true, title: "Founder / CTO", phone: "+91 98200 11223", status: "active", joinedAt: daysAgo(320), onCall: false },
  { id: "u_2", name: "Priya Sharma", email: "priya@sirius.dev", role: "admin", color: "#a78bfa", mfa: true, title: "Head of Security", phone: "+91 98200 44556", status: "active", joinedAt: daysAgo(210), onCall: true },
  { id: "u_3", name: "Rahul Iyer", email: "rahul@sirius.dev", role: "analyst", color: "#34d399", mfa: true, title: "Security Analyst", phone: "+91 90040 77889", status: "active", joinedAt: daysAgo(140), onCall: true },
  { id: "u_4", name: "Sneha Rao", email: "sneha@sirius.dev", role: "member", color: "#f472b6", mfa: false, title: "Senior Engineer, Payments", phone: "+91 99860 33221", status: "active", joinedAt: daysAgo(98), onCall: false },
  { id: "u_5", name: "Vikram Singh", email: "vikram@acmecapital.io", role: "viewer", color: "#fbbf24", mfa: false, title: "Compliance Consultant", status: "active", joinedAt: daysAgo(60), onCall: false },
];

export const seedInvites: Invite[] = [
  { id: "inv_1", email: "kavya@sirius.dev", role: "member", invitedBy: "Aarav Mehta", invitedAt: daysAgo(2), status: "pending" },
  { id: "inv_2", email: "devops@acmecapital.io", role: "viewer", invitedBy: "Priya Sharma", invitedAt: daysAgo(9), status: "pending" },
];

// ── Assets ───────────────────────────────────────────────────────────────────

export const seedAssets: Asset[] = [
  { id: "a_pay", name: "payments-api", kind: "api", criticality: 5, exposure: "public" },
  { id: "a_led", name: "ledger-db", kind: "database", criticality: 5, exposure: "internal" },
  { id: "a_auth", name: "auth-service", kind: "service", criticality: 5, exposure: "public" },
  { id: "a_kyc", name: "kyc-service", kind: "service", criticality: 4, exposure: "internal" },
  { id: "a_s3", name: "s3://statements", kind: "bucket", criticality: 4, exposure: "internal" },
  { id: "a_kafka", name: "kafka:txn-events", kind: "queue", criticality: 4, exposure: "internal" },
  { id: "a_gw", name: "api-gateway", kind: "endpoint", criticality: 5, exposure: "public" },
  { id: "a_k8s", name: "cluster:prod-use1", kind: "cluster", criticality: 5, exposure: "internal" },
];

// ── Frameworks & controls ────────────────────────────────────────────────────

const ctrl = (id: string, title: string) => ({ id, title, status: "pass" as const });

export const seedFrameworks: Framework[] = [
  {
    id: "pci",
    name: "PCI DSS",
    version: "4.0",
    description: "Payment card security standard for systems that store, process or transmit cardholder data.",
    controls: [
      ctrl("PCI-6.2.4", "Secure software development practices"),
      ctrl("PCI-6.4.1", "Public-facing apps protected against attacks"),
      ctrl("PCI-2.2.7", "All non-console access encrypted with TLS 1.2+"),
      ctrl("PCI-3.5", "Sensitive authentication data encrypted at rest"),
      ctrl("PCI-7.2.1", "Least-privilege access control"),
      ctrl("PCI-8.3.9", "MFA for all administrative access"),
      ctrl("PCI-10.2.1", "Audit logging of access to cardholder data"),
      ctrl("PCI-1.2.1", "Network segmentation between CDE and untrusted networks"),
    ],
  },
  {
    id: "soc2",
    name: "SOC 2",
    version: "Type II",
    description: "Service organization controls for security, availability and confidentiality of customer data.",
    controls: [
      ctrl("CC6.1", "Logical access controls enforced"),
      ctrl("CC6.6", "Boundary protection / WAF"),
      ctrl("CC7.1", "Vulnerability detection & configuration monitoring"),
      ctrl("CC7.2", "Anomaly detection on the environment"),
      ctrl("CC8.1", "Change management for authorized changes"),
      ctrl("CC3.2", "Periodic risk assessment"),
      ctrl("A1.2", "Capacity / availability monitoring"),
    ],
  },
  {
    id: "iso",
    name: "ISO 27001",
    version: "2022",
    description: "Information security management system controls (Annex A).",
    controls: [
      ctrl("A.8.8", "Management of technical vulnerabilities"),
      ctrl("A.8.9", "Configuration management"),
      ctrl("A.8.24", "Use of cryptography"),
      ctrl("A.5.15", "Access control"),
      ctrl("A.8.15", "Logging"),
      ctrl("A.8.16", "Monitoring activities"),
      ctrl("A.8.25", "Secure development life cycle"),
    ],
  },
  {
    id: "gdpr",
    name: "GDPR",
    version: "2016/679",
    description: "EU data protection regulation for personal data of EU customers.",
    controls: [
      ctrl("ART-32", "Security of processing (encryption, pseudonymization)"),
      ctrl("ART-33", "Breach notification within 72h readiness"),
      ctrl("ART-30", "Records of processing activities"),
      ctrl("ART-25", "Data protection by design and by default"),
    ],
  },
  {
    id: "nist",
    name: "NIST CSF",
    version: "2.0",
    description: "US framework for improving critical infrastructure cybersecurity.",
    controls: [
      ctrl("PR.AC", "Identity management & access control"),
      ctrl("PR.DS", "Data security"),
      ctrl("PR.PT", "Protective technology"),
      ctrl("DE.CM", "Security continuous monitoring"),
      ctrl("RS.AN", "Analysis & incident response"),
    ],
  },
];

// ── Findings ─────────────────────────────────────────────────────────────────

const F = (
  n: number,
  title: string,
  severity: Finding["severity"],
  status: Finding["status"],
  cvss: number,
  assetId: string,
  category: Finding["category"],
  moneyAtRisk: number,
  exploitability: Finding["exploitability"],
  controls: string[],
  remediation: string,
  description: string,
  detectedDays: number
): Finding => ({
  id: `f_${n}`,
  key: `SIR-${category.toUpperCase().slice(0, 3)}-${String(n).padStart(4, "0")}`,
  title,
  description,
  severity,
  status,
  cvss,
  assetId,
  category,
  detectedAt: daysAgo(detectedDays),
  updatedAt: daysAgo(Math.max(0, detectedDays - 1)),
  moneyAtRisk,
  exploitability,
  remediation,
  controls,
  scanId: "s_seed1",
  evidence: [
    "Source: payments/refund.go:L142 — query built via string concatenation",
    "Payload: ' OR 1=1; -- accepted, returned 12,000 rows",
    "Stack: gin-gonic → gorm v1.25 (raw query)",
  ],
});

export const seedFindings: Finding[] = [
  F(1, "SQL injection in /payments/v2/refund", "critical", "open", 9.8, "a_pay", "sast", 1_850_000, "high",
    ["PCI-6.2.4", "PCI-6.4.1", "CC7.1", "A.8.25"],
    "Use parameterized queries via gorm's bound params. Reject untrusted input at the validation layer.",
    "User-supplied `refund_id` is concatenated directly into a raw SQL query. An attacker can read the payments table and mutate refund state.",
    4),
  F(2, "AWS secret key committed to repository", "critical", "open", 9.1, "a_pay", "secrets", 1_240_000, "high",
    ["PCI-7.2.1", "CC6.1", "A.5.15"],
    "Revoke the key immediately, rotate via secrets manager, add pre-commit scanning + push protection.",
    "A live AWS access key (AKIA…) with write access to the statements bucket was found in git history (commit 9f3ac2).",
    6),
  F(3, "JWT `none` algorithm accepted by auth-service", "critical", "in_progress", 9.4, "a_auth", "sast", 2_400_000, "high",
    ["PCI-8.3.9", "CC6.1", "PR.AC"],
    "Pin allowed algorithms to RS256 and reject tokens without a verified signature.",
    "auth-service accepts alg=none JWTs, letting anyone mint an admin token for any user id.",
    9),
  F(4, "IAM policy grants s3:* to wildcard principal", "critical", "open", 8.9, "a_s3", "config", 640_000, "medium",
    ["PCI-7.2.1", "CC6.1"],
    "Scope the policy to the specific service role and drop wildcard actions.",
    "The statements bucket policy allows s3:* from any principal in the org account, including read of PII statements.",
    12),
  F(5, "Security group drifted to 0.0.0.0/0 on port 5432", "critical", "open", 8.8, "a_led", "drift", 980_000, "high",
    ["PCI-1.2.1", "A.8.9", "PR.PT"],
    "Revert to bastion-only CIDR and enable drift-lock on the Terraform workspace.",
    "Terraform state shows ledger-db's security group was manually edited to allow world-wide Postgres access.",
    2),
  F(6, "TLS 1.0 accepted on api-gateway", "high", "open", 7.5, "a_gw", "config", 120_000, "medium",
    ["PCI-2.2.7", "A.8.24", "PR.DS"],
    "Restrict TLS to ≥1.2 with modern cipher suites at the gateway listener.",
    "The public gateway endpoint still negotiates TLS 1.0, failing PCI DSS 4.0 requirement 2.2.7.",
    15),
  F(7, "No rate limiting on OTP verification endpoint", "high", "open", 7.8, "a_auth", "api", 310_000, "high",
    ["PCI-6.4.1", "CC6.6"],
    "Add per-device + per-IP throttling with exponential backoff and captcha after 3 failures.",
    "auth/v1/otp/verify allows unlimited attempts, enabling 6-digit OTP brute force in ~11 minutes.",
    7),
  F(8, "RCE-vulnerable dependency: xml2js <0.5.0", "high", "open", 8.1, "a_kyc", "dependency", 150_000, "medium",
    ["A.8.8", "CC7.1"],
    "Upgrade xml2js to ≥0.5.0 and enable automated dependency updates.",
    "kyc-service pins xml2js 0.4.23 which is vulnerable to prototype pollution leading to RCE in parsing paths.",
    11),
  F(9, "PII stored unencrypted in kyc-service table", "high", "in_progress", 7.2, "a_kyc", "config", 560_000, "medium",
    ["PCI-3.5", "ART-32", "ART-25", "PR.DS"],
    "Encrypt PAN/ID columns with envelope encryption (KMS) and tokenize where full value isn't needed.",
    "kyc.documents stores government ID numbers in plaintext, violating GDPR Art.32 and PCI 3.5.",
    18),
  F(10, "Kubernetes dashboard exposed on public LB", "high", "resolved", 7.4, "a_k8s", "config", 90_000, "medium",
    ["PCI-7.2.1", "A.5.15"],
    "Dashboard removed from public ingress; access now via authenticated kubectl proxy only.",
    "cluster:prod-use1 exposed the k8s dashboard without auth on a public load balancer.",
    22),
  F(11, "Customer PII leaked into application logs", "medium", "open", 5.3, "a_pay", "dlp", 75_000, "low",
    ["ART-32", "A.8.16", "DE.CM"],
    "Add a log scrubbing middleware and mark `pan` fields as redacted in struct tags.",
    "payment approval logs include full card PAN and customer phone numbers.",
    13),
  F(12, "Kafka SASL/SSL disabled on txn-events", "medium", "open", 6.1, "a_kafka", "config", 88_000, "medium",
    ["A.8.24", "PCI-1.2.1"],
    "Enable SASL_SSL with SCRAM-SHA-512 and rotate broker certificates.",
    "Transaction events (including amounts and IDs) flow over plaintext PLAINTEXT:// brokers.",
    20),
  F(13, "Debug stack traces returned in production", "medium", "resolved", 4.8, "a_pay", "iast", 12_000, "low",
    ["A.8.25"],
    "Global error handler now returns sanitized 500s; details go to structured logging only.",
    "Instrumented runtime detected internal paths and DB DSN fragments leaking in error responses.",
    26),
  F(14, "GraphQL introspection enabled in production", "low", "open", 3.1, "a_gw", "api", 0, "low",
    ["PCI-6.4.1"],
    "Disable introspection and depth limiting in the prod schema.",
    "The gateway exposes full schema introspection, mapping all payment mutation entry points.",
    8),
  F(15, "Session idle timeout exceeds policy (45m)", "medium", "suppressed", 3.7, "a_auth", "config", 0, "low",
    ["PCI-8.3.9"],
    "N/A — suppressed pending product decision on session length.",
    "Sessions remain valid for 45 minutes idle; policy requires 15.",
    30),
  F(16, "Outdated OpenSSL 1.1.1 base image", "medium", "open", 5.9, "a_kyc", "dependency", 40_000, "low",
    ["A.8.8"],
    "Rebuild on Ubuntu 24.04 / OpenSSL 3.x base image.",
    "kyc-service runtime image ships OpenSSL 1.1.1w which is EOL.",
    17),
];

// ── Scans ────────────────────────────────────────────────────────────────────

export const seedScans: Scan[] = [
  {
    id: "s_seed1",
    name: "Nightly full-stack",
    type: "full",
    status: "completed",
    target: "all assets",
    initiatedBy: "scheduler",
    startedAt: ago(720),
    completedAt: ago(712),
    progress: 100,
    findingsIssued: 11,
    logs: [
      { t: ago(720), level: "info", msg: "Scan started · 8 assets · profile: production" },
      { t: ago(719), level: "info", msg: "SAST analysis on payments-api… 14,238 LoC" },
      { t: ago(717), level: "error", msg: "SAST · SQL injection in /payments/v2/refund [SIR-SAS-0001]" },
      { t: ago(716), level: "error", msg: "SECRETS · AWS key in git history (commit 9f3ac2) [SIR-SEC-0002]" },
      { t: ago(715), level: "warn", msg: "CONFIG · TLS 1.0 negotiated on api-gateway [SIR-CON-0006]" },
      { t: ago(713), level: "success", msg: "Scan completed in 8m 06s · 11 findings (4 critical)" },
    ],
  },
  {
    id: "s_seed2",
    name: "Drift watch · prod-use1",
    type: "drift",
    status: "completed",
    target: "cluster:prod-use1",
    initiatedBy: "scheduler",
    startedAt: ago(180),
    completedAt: ago(178),
    progress: 100,
    findingsIssued: 1,
    logs: [
      { t: ago(180), level: "info", msg: "Comparing live state vs Terraform baseline…" },
      { t: ago(179), level: "error", msg: "DRIFT · sg-ledger-db ingress 0.0.0.0/0:5432 [SIR-DRI-0005]" },
      { t: ago(178), level: "success", msg: "Drift scan completed · 1 critical drift" },
    ],
  },
  {
    id: "s_seed3",
    name: "Vendor risk · Acme Capital",
    type: "third_party",
    status: "completed",
    target: "vendor:acme-capital",
    initiatedBy: "Priya Sharma",
    startedAt: daysAgo(3),
    completedAt: daysAgo(3),
    progress: 100,
    findingsIssued: 0,
    logs: [
      { t: daysAgo(3), level: "info", msg: "Assessing vendor SBOMs and published posture…" },
      { t: daysAgo(3), level: "success", msg: "Vendor assessment completed · no blocking findings" },
    ],
  },
];

// ── Call alerts ──────────────────────────────────────────────────────────────

export const seedAlerts: CallAlert[] = [
  {
    id: "al_1",
    title: "Sev-1 · SQL injection in payments-api",
    severity: "critical",
    recipient: "Priya Sharma (on-call lead)",
    phone: "+91 98200 44556",
    policy: "Critical finding on money-mover asset → call on-call lead",
    status: "acknowledged",
    triggeredAt: ago(214),
    acknowledgedAt: ago(211),
    findingKey: "SIR-SAS-0001",
    transcript: [
      "SIRIUS: This is a Sirius severity one alert.",
      "SIRIUS: SQL injection detected in payments API, endpoint slash v2 slash refund.",
      "SIRIUS: Estimated money at risk, one point eight five million dollars.",
      "Priya: Acknowledged. Starting incident bridge now.",
    ],
    durationSec: 47,
  },
  {
    id: "al_2",
    title: "Sev-1 · Drift: database exposed to internet",
    severity: "critical",
    recipient: "Rahul Iyer (escalation)",
    phone: "+91 90040 77889",
    policy: "Unacknowledged 5 min → escalate to secondary",
    status: "escalated",
    triggeredAt: ago(176),
    findingKey: "SIR-DRI-0005",
    transcript: [
      "SIRIUS: Severity one. Ledger database security group opened to the internet.",
      "SIRIUS: Press one to acknowledge, or say escalate.",
      "Caller: (no response)",
    ],
    durationSec: 62,
  },
  {
    id: "al_3",
    title: "Sev-2 · Secret key leaked in repository",
    severity: "high",
    recipient: "Sneha Rao (service owner)",
    phone: "+91 99860 33221",
    policy: "Secrets finding on owned service → call owner",
    status: "resolved",
    triggeredAt: ago(90),
    acknowledgedAt: ago(88),
    findingKey: "SIR-SEC-0002",
    transcript: [
      "SIRIUS: Sirius alert. AWS secret key committed to payments repository.",
      "Sneha: Acknowledged — rotating the key.",
    ],
    durationSec: 31,
  },
  {
    id: "al_4",
    title: "Sev-2 · OTP brute force window",
    severity: "high",
    recipient: "Priya Sharma (on-call lead)",
    phone: "+91 98200 44556",
    policy: "Auth asset high finding → call on-call lead",
    status: "delivered",
    triggeredAt: ago(26),
    findingKey: "SIR-API-0007",
    transcript: ["SIRIUS: High severity. OTP endpoint accepts unlimited attempts."],
    durationSec: 18,
  },
];

// ── Audit / keys / reports / integrations / settings ─────────────────────────

export const seedAudit: AuditEvent[] = [
  { id: "au_1", at: ago(26), actor: "system", action: "alert.triggered", target: "SIR-API-0007 → Priya Sharma", meta: "voice" },
  { id: "au_2", at: ago(47), actor: "Priya Sharma", action: "finding.status", target: "SIR-SAS-0003 → in_progress" },
  { id: "au_3", at: ago(96), actor: "Aarav Mehta", action: "scan.start", target: "Drift watch · prod-use1" },
  { id: "au_4", at: ago(150), actor: "Sneha Rao", action: "finding.acknowledge", target: "SIR-SEC-0002 via voice call" },
  { id: "au_5", at: daysAgo(2), actor: "Aarav Mehta", action: "team.invite", target: "kavya@sirius.dev as member" },
  { id: "au_6", at: daysAgo(2), actor: "Priya Sharma", action: "policy.update", target: "Secrets findings page owners immediately" },
  { id: "au_7", at: daysAgo(3), actor: "system", action: "report.generate", target: "Board pack · August" },
  { id: "au_8", at: daysAgo(4), actor: "Rahul Iyer", action: "suppression.add", target: "SIR-CON-0015 (45m session)" },
  { id: "au_9", at: daysAgo(5), actor: "Aarav Mehta", action: "key.create", target: "ci-portal (scans:write, findings:read)" },
  { id: "au_10", at: daysAgo(7), actor: "Vikram Singh", action: "report.download", target: "SOC 2 evidence pack" },
  { id: "au_11", at: daysAgo(9), actor: "Priya Sharma", action: "team.invite", target: "devops@acmecapital.io as viewer" },
  { id: "au_12", at: daysAgo(12), actor: "system", action: "integration.sync", target: "Jira · 7 issues created" },
];

export const seedKeys: ApiKey[] = [
  { id: "k_1", name: "ci-portal", prefix: "sk_live_7Kx9", scopes: ["scans:write", "findings:read"], createdAt: daysAgo(5), lastUsedAt: ago(52), expiresAt: ahead(85), createdBy: "Aarav Mehta", status: "active" },
  { id: "k_2", name: "grafana-metrics", prefix: "sk_live_2Qm4", scopes: ["scans:read", "findings:read", "reports:read"], createdAt: daysAgo(28), lastUsedAt: ago(310), expiresAt: ahead(337), createdBy: "Priya Sharma", status: "active" },
  { id: "k_3", name: "legacy-exporter", prefix: "sk_live_9Bz1", scopes: ["admin"], createdAt: daysAgo(120), expiresAt: daysAgo(90), createdBy: "Aarav Mehta", status: "revoked" },
];

export const seedReports: Report[] = [
  { id: "r_1", name: "Board pack · August", type: "executive", frameworks: ["pci", "soc2"], from: daysAgo(31), to: daysAgo(1), createdAt: daysAgo(3), createdBy: "system", status: "ready", sizeKb: 214 },
  { id: "r_2", name: "SOC 2 evidence pack", type: "compliance", frameworks: ["soc2"], from: daysAgo(90), to: daysAgo(1), createdAt: daysAgo(4), createdBy: "Priya Sharma", status: "ready", sizeKb: 1087 },
  { id: "r_3", name: "Payments deep-dive", type: "technical", frameworks: [], from: daysAgo(14), to: daysAgo(1), createdAt: daysAgo(6), createdBy: "Rahul Iyer", status: "ready", sizeKb: 433 },
];

export const seedIntegrations: Integration[] = [
  { id: "i_slack", name: "Slack", category: "messaging", description: "Post findings and alerts to #security-ops", connected: true, events: 142 },
  { id: "i_jira", name: "Jira", category: "ticketing", description: "Auto-create tickets for critical findings", connected: true, events: 37 },
  { id: "i_pd", name: "PagerDuty", category: "ticketing", description: "Incident escalation alongside Sirius call alerts", connected: false, events: 0 },
  { id: "i_gh", name: "GitHub", category: "code", description: "PR annotations and push protection for secrets", connected: true, events: 289 },
  { id: "i_twilio", name: "Twilio Voice", category: "voice", description: "Programmable voice for severity-based call alerts", connected: true, events: 21 },
  { id: "i_aws", name: "AWS", category: "cloud", description: "CloudTrail, IAM and config drift ingestion", connected: true, events: 1204 },
];

export const seedPolicies: PolicyRule[] = [
  { id: "p_1", name: "Page owners on secrets findings", description: "Immediately call the on-call owner when a live secret is detected.", enabled: true, severityFloor: "high" },
  { id: "p_2", name: "Money-mover protection", description: "Critical findings on assets tagged money-mover trigger a Sev-1 call.", enabled: true, severityFloor: "critical" },
  { id: "p_3", name: "Drift auto-revert", description: "Automatically open a revert PR when security-critical drift is detected.", enabled: false, severityFloor: "critical" },
  { id: "p_4", name: "Dependency freeze window", description: "Block releases when a critical dependency finding is open.", enabled: true, severityFloor: "critical" },
  { id: "p_5", name: "Daily posture digest", description: "8am summary call of overnight scan results to the security lead.", enabled: false, severityFloor: "medium" },
];

export const seedSuppressions: Suppression[] = [
  { id: "sp_1", findingKey: "SIR-CON-0015", reason: "Product decision pending on session length (tracked in JIRA SEC-412)", scope: "this_finding", createdBy: "Rahul Iyer", createdAt: daysAgo(4), expiresAt: daysAgo(-26) },
  { id: "sp_2", findingKey: "SIR-API-0014", reason: "Introspection required for partner onboarding until Q4", scope: "all_similar", createdBy: "Priya Sharma", createdAt: daysAgo(19), expiresAt: daysAgo(-11) },
];

export const seedNotifications: Notification[] = [
  { id: "n_1", at: ago(26), title: "High finding on auth-service", body: "OTP brute-force window detected — owner called.", kind: "alert", read: false },
  { id: "n_2", at: ago(176), title: "Critical drift on ledger-db", body: "Security group opened to 0.0.0.0/0:5432. Escalation call placed.", kind: "alert", read: false },
  { id: "n_3", at: ago(712), title: "Nightly scan completed", body: "11 findings · 4 critical · money at risk $4.7M", kind: "scan", read: false },
  { id: "n_4", at: daysAgo(2), title: "Invite sent", body: "kavya@sirius.dev invited as Developer.", kind: "team", read: true },
  { id: "n_5", at: daysAgo(3), title: "Report ready", body: "Board pack · August generated.", kind: "system", read: true },
  { id: "n_6", at: daysAgo(5), title: "New API key", body: "ci-portal created with scans:write, findings:read.", kind: "system", read: true },
];

// ── Risk trend (90 days) ─────────────────────────────────────────────────────

export function seedRiskTrend(): RiskPoint[] {
  const pts: RiskPoint[] = [];
  for (let i = 89; i >= 0; i--) {
    const wave = Math.sin(i / 9) * 320_000;
    const driftUp = i < 14 ? 900_000 : 0;
    const base = 3_400_000 - (89 - i) * 12_000 + wave + driftUp;
    pts.push({
      date: daysAgo(i).slice(0, 10),
      risk: Math.max(180_000, Math.round(base)),
      open: 18 - Math.floor((89 - i) / 14),
      resolved: 4 + Math.floor((89 - i) / 7),
    });
  }
  return pts;
}

// ── Attack graph ─────────────────────────────────────────────────────────────

export const seedAttackNodes: AttackNode[] = [
  { id: "actor", label: "External actor", layer: 0, kind: "actor", x: 0, y: 6.5, z: 0 },
  { id: "gw", label: "api-gateway", layer: 1, kind: "endpoint", severity: "medium", x: -4, y: 2.2, z: 1 },
  { id: "waf", label: "waf-edge", layer: 1, kind: "endpoint", x: 4, y: 2.2, z: -1 },
  { id: "pay", label: "payments-api", layer: 2, kind: "api", severity: "critical", x: -3.2, y: -1.8, z: 2 },
  { id: "auth", label: "auth-service", layer: 2, kind: "service", severity: "critical", x: 2.8, y: -1.8, z: -2 },
  { id: "kyc", label: "kyc-service", layer: 2, kind: "service", severity: "high", x: 5.2, y: -1.6, z: 2.4 },
  { id: "led", label: "ledger-db", layer: 3, kind: "database", severity: "critical", x: -1.8, y: -5.6, z: 0.5 },
  { id: "s3", label: "s3://statements", layer: 3, kind: "bucket", severity: "critical", x: 3.4, y: -5.6, z: 2.2 },
  { id: "kafka", label: "kafka:txn-events", layer: 3, kind: "queue", severity: "medium", x: -5, y: -5.4, z: -2.2 },
];

export const seedAttackLinks: AttackLink[] = [
  { from: "actor", to: "gw", active: true, technique: "T1190 · Exploit public-facing app" },
  { from: "actor", to: "waf", active: false, technique: "T1595 · Active scanning" },
  { from: "gw", to: "pay", active: true, technique: "T1506 · SQL injection (SIR-SAS-0001)" },
  { from: "gw", to: "auth", active: true, technique: "T1130 · JWT none-alg (SIR-SAS-0003)" },
  { from: "waf", to: "kyc", active: false, technique: "T1210 · Dependency RCE" },
  { from: "pay", to: "led", active: true, technique: "T1071 · Direct DB write" },
  { from: "pay", to: "kafka", active: false, technique: "T1530 · Event tampering" },
  { from: "auth", to: "led", active: true, technique: "T1078 · Forged admin token" },
  { from: "kyc", to: "s3", active: true, technique: "T1530 · PII exfiltration" },
];

export const seedAttackPaths: AttackPath[] = [
  {
    id: "ap_1",
    name: "Refund injection → ledger write",
    nodeIds: ["actor", "gw", "pay", "led"],
    probability: 0.82,
    impactUsd: 1_850_000,
    techniques: ["T1190", "T1506", "T1071"],
    blocked: false,
  },
  {
    id: "ap_2",
    name: "Forged JWT → admin → ledger",
    nodeIds: ["actor", "gw", "auth", "led"],
    probability: 0.64,
    impactUsd: 2_400_000,
    techniques: ["T1190", "T1130", "T1078"],
    blocked: false,
  },
  {
    id: "ap_3",
    name: "KYC dependency → PII exfil",
    nodeIds: ["actor", "waf", "kyc", "s3"],
    probability: 0.41,
    impactUsd: 560_000,
    techniques: ["T1595", "T1210", "T1530"],
    blocked: true,
  },
];
