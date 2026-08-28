/**
 * Wire shapes to GUI domain types.
 *
 * `sirius serve` speaks the frozen contract: snake_case, an id-shaped severity
 * enum, `money_at_risk_inr`. The GUI's `@sirius/types` package speaks camelCase
 * and was written against a mock that invented dollar figures. Rather than bend
 * the daemon to the mock's shape, or bend the wire contract to a client's
 * preferences, this file is the one seam where the two vocabularies meet.
 *
 * One deliberate compromise, flagged rather than hidden: the GUI's money fields
 * are still named `...USD` (`moneyAtRiskUSD`, `totalUSD`) — renaming them is a
 * sweep through every component that reads one, which is out of scope for
 * wiring the two surfaces together. The *values* placed into them are real
 * rupees, not dollars, and every place the GUI displays money now formats with
 * `formatInr` (see `money.ts`) rather than the `$` the field name implies. The
 * name is wrong; the number and what it prints on screen are both real.
 */

import type {
  AttackPath,
  AttackPathNode,
  ComplianceControl,
  ComplianceFramework,
  ComplianceSummary,
  Finding,
  FindingCategory,
  FindingSeverity,
  FindingStatus,
  FixProposal,
  MoneyAtRisk,
  Project,
  Report,
  Rule,
  Scan,
  ScanStatus,
  Suppression,
} from '@sirius/types';

// ------------------------------------------------------------------ scalars

const SEVERITIES: FindingSeverity[] = ['critical', 'high', 'medium', 'low', 'info'];

export function asSeverity(value: unknown, fallback: FindingSeverity = 'medium'): FindingSeverity {
  return SEVERITIES.includes(value as FindingSeverity) ? (value as FindingSeverity) : fallback;
}

/**
 * `sirius scan` and `canceled` spell it with one L; the GUI's `ScanStatus`
 * spells it with two, the way most of its own vocabulary does. Both are read
 * back from the same word — this is the one place that has to know they differ.
 */
export function asScanStatus(value: unknown): ScanStatus {
  if (value === 'canceled') return 'cancelled';
  const known: ScanStatus[] = ['queued', 'running', 'completed', 'failed', 'cancelled'];
  return known.includes(value as ScanStatus) ? (value as ScanStatus) : 'queued';
}

// ------------------------------------------------------------------ project

interface WireProject {
  id: string;
  name: string;
  path: string;
  last_scan_id: string | null;
  last_scan_at: string | null;
  compliance_score: number | null;
  money_at_risk_inr: number;
  counts: Record<string, number>;
}

export function toProject(w: WireProject): Project {
  const counts = w.counts ?? {};
  return {
    id: w.id,
    name: w.name,
    // The daemon serves a directory on disk, not a git remote. Inventing a
    // repository URL would put a link in the UI that goes nowhere; the path is
    // the honest identity of a local scan target.
    repositoryUrl: w.path,
    branch: 'local',
    lastScanId: w.last_scan_id ?? undefined,
    lastScanTimestamp: w.last_scan_at ?? undefined,
    complianceScore: w.compliance_score ?? undefined,
    moneyAtRiskUSD: w.money_at_risk_inr,
    openFindingsCount: {
      critical: counts.critical ?? 0,
      high: counts.high ?? 0,
      medium: counts.medium ?? 0,
      low: counts.low ?? 0,
      info: counts.info ?? 0,
    },
    createdAt: w.last_scan_at ?? new Date(0).toISOString(),
    updatedAt: w.last_scan_at ?? new Date(0).toISOString(),
  };
}

// --------------------------------------------------------------------- scan

interface WireScan {
  id: string;
  project_id: string | null;
  target: string;
  status: string;
  source: string;
  origin: 'cli' | 'gui';
  started_at: string;
  finished_at: string | null;
  exit_code: number | null;
  counts: Record<string, number>;
  total_findings: number;
  money_at_risk_inr: number;
  compliance_score: number | null;
  files_scanned: number | null;
  error?: string;
}

export function toScan(w: WireScan): Scan {
  const counts = w.counts ?? {};
  const status = asScanStatus(w.status);

  return {
    id: w.id,
    projectId: w.project_id ?? '',
    status,
    progress: {
      phase: status === 'completed' ? 'completed' : status === 'failed' ? 'completed' : 'ast_parsing',
      percentComplete: status === 'completed' || status === 'failed' ? 100 : 50,
      filesScanned: w.files_scanned ?? 0,
      totalFiles: w.files_scanned ?? 0,
      findingsFound: w.total_findings,
      elapsedTimeMs:
        w.finished_at && w.started_at ? Date.parse(w.finished_at) - Date.parse(w.started_at) : 0,
    },
    startedAt: w.started_at,
    completedAt: w.finished_at ?? undefined,
    // Whoever asked for the scan, since there is no login on a local daemon —
    // a `sarah.jenkins@finsec.io` placeholder here would claim an identity
    // nobody supplied.
    initiatedBy: w.origin === 'cli' ? 'terminal' : 'desktop app',
    summary: {
      totalFindings: w.total_findings,
      critical: counts.critical ?? 0,
      high: counts.high ?? 0,
      medium: counts.medium ?? 0,
      low: counts.low ?? 0,
      info: counts.info ?? 0,
      moneyAtRiskUSD: w.money_at_risk_inr,
      complianceScore: w.compliance_score ?? 0,
    },
    engineVersion: w.source === 'local' ? 'tree-sitter AST · local engine' : w.source,
  };
}

// ------------------------------------------------------------------ finding

interface WireFinding {
  id: string;
  scan_id: string;
  project_id: string | null;
  rule_id: string;
  file: string;
  line: number;
  severity: string;
  category: string;
  message: string;
  compliance_ref: string[];
  money_at_risk_inr: number;
  fingerprint: string | null;
  validity: string;
  fix_action: string | null;
  triage_state?: string;
}

// The engine's eight categories are already members of `FindingCategory` —
// `secrets`, `auth`, `pii`, `crypto`, `logging`, `ratelimit`, `supplychain` are
// literal values in the union, put there because they came from this project.
// `injection` is the one exception: the GUI's union has it, but under the same
// name, so this still needs nothing beyond a type-safe cast with a fallback.
const CATEGORIES: FindingCategory[] = [
  'secrets', 'auth', 'injection', 'pii', 'crypto', 'logging', 'ratelimit', 'supplychain',
];

function asCategory(value: string): FindingCategory {
  return CATEGORIES.includes(value as FindingCategory) ? (value as FindingCategory) : 'security';
}

/** `engine/threat.ts`'s `Exposure` — `verified_live | inactive | unknown` — onto the GUI's own four-value enum. */
function asSecretValidityStatus(value: string): 'valid' | 'revoked' | 'unknown' | 'expired' {
  if (value === 'verified_live') return 'valid';
  if (value === 'inactive') return 'revoked';
  return 'unknown';
}

function asFindingStatus(triageState: string | undefined): FindingStatus {
  switch (triageState) {
    // `.sirius/triage.json` has no "fixed" state — that is a fact about the
    // source file, not about a triage decision, and the daemon does not infer
    // it. "Triaged" is the honest word for "a person looked at this and
    // accepted it," which is what `accepted` on disk actually records.
    case 'accepted':
      return 'triaged';
    case 'suppressed':
      return 'ignored';
    case 'dismissed':
      return 'false_positive';
    default:
      return 'open';
  }
}

export function toFinding(w: WireFinding): Finding {
  return {
    id: w.id,
    scanId: w.scan_id,
    projectId: w.project_id ?? '',
    ruleId: w.rule_id,
    title: w.message,
    description: w.message,
    severity: asSeverity(w.severity),
    status: asFindingStatus(w.triage_state),
    category: asCategory(w.category),
    filePath: w.file,
    startLine: w.line,
    endLine: w.line,
    // No snippet: the daemon never sends one — see the note in server/routes.ts.
    // A blank field here is honest; a placeholder line of code would not be.
    moneyAtRiskUSD: w.money_at_risk_inr,
    secretValidity:
      w.validity === 'unknown'
        ? undefined
        : { status: asSecretValidityStatus(w.validity), lastCheckedAt: new Date().toISOString() },
    baselineState: undefined,
    fingerprint: w.fingerprint ?? undefined,
    complianceMappings: w.compliance_ref.map((ref) => {
      const [framework, controlId] = ref.split(':');
      return { framework: framework ?? ref, controlId: controlId ?? '' };
    }),
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
}

// --------------------------------------------------------------- money/rules

interface WireMoneyAtRisk {
  total_inr: number;
  by_severity_inr: Record<string, number>;
  by_finding_inr: Record<string, number>;
  trend: Array<{ at: string; amount_inr: number }>;
  model_version: string;
}

export function toMoneyAtRisk(w: WireMoneyAtRisk): MoneyAtRisk {
  return {
    totalUSD: w.total_inr,
    criticalUSD: w.by_severity_inr.critical ?? 0,
    highUSD: w.by_severity_inr.high ?? 0,
    mediumUSD: w.by_severity_inr.medium ?? 0,
    breakdownByFindingId: w.by_finding_inr,
    trendHistory: w.trend.map((t) => ({ timestamp: t.at, amountUSD: t.amount_inr })),
    valuationModelVersion: w.model_version,
  };
}

interface WireRule {
  id: string;
  version: string;
  category: string;
  severity: string;
  message: string;
  enabled: boolean;
}

export function toRule(w: WireRule): Rule {
  return {
    id: w.id,
    code: w.id,
    name: w.message,
    category: asCategory(w.category),
    severity: asSeverity(w.severity),
    description: w.message,
    isEnabled: w.enabled,
  };
}

// ------------------------------------------------------------- compliance

interface WireFrameworkControl {
  clause: string;
  rules: string[];
  status: 'passing' | 'failing';
}

interface WireFramework {
  id: string;
  name: string;
  version: string | null;
  total_controls: number;
  failing_controls: number;
  passing_controls: number;
  controls: WireFrameworkControl[];
  scanned_at: string | null;
}

export function toComplianceFramework(w: WireFramework): ComplianceFramework {
  return {
    id: w.id,
    name: w.name,
    version: w.version ?? 'current',
    overallScore: w.total_controls ? Math.round((w.passing_controls / w.total_controls) * 100) : 100,
    passedCount: w.passing_controls,
    failedCount: w.failing_controls,
    totalCount: w.total_controls,
    references: w.controls.map((c) => ({
      frameworkId: w.id,
      section: c.clause,
      requirementTitle: `${c.clause} — ${c.rules.join(', ')}`,
      status: c.status === 'passing' ? 'compliant' : 'non_compliant',
      associatedFindingIds: [],
    })),
    lastAuditedAt: w.scanned_at ?? undefined,
  };
}

export function toComplianceSummary(frameworks: WireFramework[], projectId: string): ComplianceSummary {
  const totals = frameworks.reduce(
    (acc, f) => ({
      total: acc.total + f.total_controls,
      passing: acc.passing + f.passing_controls,
      failing: acc.failing + f.failing_controls,
    }),
    { total: 0, passing: 0, failing: 0 },
  );

  return {
    projectId,
    overallScore: totals.total ? Math.round((totals.passing / totals.total) * 100) : 100,
    evaluatedCount: totals.total,
    passingCount: totals.passing,
    failingCount: totals.failing,
    partialCount: 0,
    lastAuditedAt: frameworks.find((f) => f.scanned_at)?.scanned_at ?? undefined,
  };
}

export function toComplianceControls(frameworks: WireFramework[]): ComplianceControl[] {
  return frameworks.flatMap((f) =>
    f.controls.map((c) => ({
      id: `${f.id}:${c.clause}`,
      frameworkId: f.id,
      section: c.clause,
      title: `${f.id} ${c.clause}`,
      description: `Checked by ${c.rules.join(', ')}.`,
      status: c.status === 'passing' ? 'pass' : 'fail',
      affectedFindingIds: [],
      category: f.id,
    })),
  );
}

// ------------------------------------------------------------- attack paths

interface WireAttackStep {
  order: number;
  role: string;
  finding_id: string;
  rule_id: string;
  file: string;
  severity: string;
}

interface WireAttackPath {
  id: string;
  title: string;
  severity: string;
  narrative: string;
  money_at_risk_inr: number;
  steps: WireAttackStep[];
}

export function toAttackPath(w: WireAttackPath, projectId: string): AttackPath {
  // `s.role` is the daemon's own vocabulary ('entry' | 'pivot' | 'target'),
  // and 'entry' happens to already be a value `AttackPathNodeView` recognises
  // shape-wise. The other two map onto the closest thing it draws differently:
  // a mid-chain step reads as a `finding` (diamond), the chain's end reads as
  // an `asset` (rounded box) — a step's *position*, used previously, doesn't
  // carry this distinction at all when the daemon already told us the role.
  const typeForRole = (role: string): AttackPathNode['type'] =>
    role === 'entry' ? 'entry' : role === 'target' ? 'asset' : 'finding';

  const nodes = w.steps.map((s, i) => ({
    id: `${w.id}-${i}`,
    label: `${s.role} — ${s.rule_id} (${s.file})`,
    type: typeForRole(s.role),
    severity: asSeverity(s.severity),
    findingId: s.finding_id,
    metadata: { role: s.role, ruleId: s.rule_id, file: s.file },
  }));

  return {
    id: w.id,
    projectId,
    title: w.title,
    description: w.narrative,
    severity: asSeverity(w.severity),
    entryNodeId: nodes[0]?.id ?? w.id,
    targetNodeId: nodes[nodes.length - 1]?.id ?? w.id,
    entryLabel: nodes[0]?.label ?? w.title,
    targetLabel: nodes[nodes.length - 1]?.label ?? w.title,
    nodes,
    edges: nodes.slice(1).map((node, i) => ({
      id: `${w.id}-edge-${i}`,
      sourceNodeId: nodes[i]!.id,
      targetNodeId: node.id,
    })),
    nodeCount: nodes.length,
    findingCount: w.steps.length,
    financialExposureUSD: w.money_at_risk_inr,
    findingIds: w.steps.map((s) => s.finding_id),
    // The GUI's own scale is 0-10, not the percentage the engine has no
    // opinion on. Derived from the chain length rather than invented: a
    // single-hop exposure is closer to exploitable than a five-hop one, and
    // this says only that much, clamped to the documented range.
    estimatedExploitabilityScore: Math.max(1, Math.min(10, 9 - w.steps.length)),
  };
}

// ------------------------------------------------------------------- fixes

interface WireFix {
  finding_id: string;
  rule_id: string;
  action: string;
  diff: string;
  patched: string;
  provenance: string;
  verifier_status: 'pass' | 'fail' | 'escalated';
  verifier_detail: string;
  applicability: string;
  confidence: number;
  escalate: boolean;
  applied?: boolean;
}

export function toFixProposal(w: WireFix, finding: Finding): FixProposal {
  const diffLines = w.diff.split('\n');
  const additions = diffLines.filter((l) => l.startsWith('+') && !l.startsWith('+++')).length;
  const deletions = diffLines.filter((l) => l.startsWith('-') && !l.startsWith('---')).length;

  return {
    id: `fix-${w.finding_id}`,
    findingId: w.finding_id,
    projectId: finding.projectId,
    title: w.action || `Fix ${w.rule_id}`,
    // What actually ran. `w.provenance` is always `template selector` — no LLM
    // runs in this engine, and this string must never claim one did.
    summary: `${w.provenance} · ${w.applicability}`,
    proposalStatus: 'ready',
    verifierStatus:
      w.verifier_status === 'pass' ? 'passed' : w.verifier_status === 'fail' ? 'failed' : 'escalated',
    verifierMessage: w.verifier_detail,
    diff: {
      filePath: finding.filePath,
      oldCode: '',
      newCode: w.patched,
      additionsCount: additions,
      deletionsCount: deletions,
    },
    steps: [w.action],
    verificationChecks: [
      {
        name: 'Cerebus verifier',
        status: w.verifier_status === 'pass' ? 'pass' : w.verifier_status === 'fail' ? 'fail' : 'pending',
        message: w.verifier_detail,
      },
    ],
    createdAt: new Date().toISOString(),
  };
}

// ------------------------------------------------------------------ reports

interface WireReportListing {
  scan_id: string;
  created_at: string | null;
  compliance_score: number | null;
  money_at_risk_inr: number;
  formats: string[];
}

export function toReport(w: WireReportListing, projectId: string): Report {
  return {
    id: w.scan_id,
    projectId,
    scanId: w.scan_id,
    type: 'compliance',
    title: `Scan ${w.scan_id.slice(0, 12)}`,
    status: 'ready',
    generatedAt: w.created_at ?? new Date(0).toISOString(),
    createdBy: 'sirius engine',
    summary: {
      overallScore: w.compliance_score ?? 0,
      // The listing endpoint carries the score and the money figure only —
      // per-severity counts and control pass/fail would need the scan's own
      // findings, which `useReportQuery` fetches separately for the detail
      // view. Zero here is "not fetched yet," not "there are none."
      totalFindings: 0,
      criticalCount: 0,
      highCount: 0,
      mediumCount: 0,
      moneyAtRiskUSD: w.money_at_risk_inr,
      passedControlsCount: 0,
      failedControlsCount: 0,
    },
  };
}

// ------------------------------------------------------------- suppressions

interface WireSuppression {
  rule_id?: string;
  path_glob?: string;
  fingerprint?: string;
  reason: string;
  expires_at: string | null;
  created_at: string;
  expired: boolean;
}

export function toSuppression(w: WireSuppression, projectId: string, index: number): Suppression {
  return {
    id: `${w.rule_id ?? w.fingerprint ?? 'sup'}-${index}`,
    projectId,
    ruleId: w.rule_id ?? '*',
    scope: w.path_glob ? 'path' : w.rule_id ? 'rule' : 'project',
    // The engine records a free-text reason, not one of the GUI's five
    // categories — there is nothing in `.sirius/suppressions.json` to classify
    // it by. `accepted_risk` is the closest honest default.
    reason: 'accepted_risk',
    reasonText: w.reason,
    status: w.expired ? 'expired' : 'active',
    createdBy: 'sirius CLI',
    createdAt: w.created_at,
    expiresAt: w.expires_at ?? undefined,
    affectedFindingIds: [],
  };
}
