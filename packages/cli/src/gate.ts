/**
 * The quality gate: decides whether a scan blocks, and what exit code to use.
 *
 * This is a pure function on purpose (decisions.md D-002). The server sends its
 * own `exit_code` on `scan.completed`, but the CLI computes the verdict locally
 * so that gating is deterministic, unit-testable as a truth table, and correct
 * against the mock, offline, and under `--replay`. The server's value is treated
 * as a cross-check, not an authority.
 *
 * Two distinct axes, which the PRD's own ANSI mockup conflates (D-003):
 *   --severity-threshold  the BAR: which severities are even considered
 *   --fail-on             the PREDICATE: which of those actually block
 */

import { ExitCode, meetsThreshold } from './domain.js';
import type { ExitCodeValue, FailOn, Finding, Severity } from './domain.js';
import { plural } from './ui/kit.js';

/** Server-side quality-gate policy, as stored in the `policies` table. */
export interface Policy {
  fail_on_severity?: Severity;
  max_new_findings?: number | null;
  require_no_verified_secrets?: boolean;
  min_compliance_score?: number | null;
}

export interface GateInput {
  findings: readonly Finding[];
  severityThreshold: Severity;
  failOn: FailOn;
  /** Optional server-side policy. Its checks are additive: any one can block. */
  policy?: Policy | undefined;
  /** From `scan.completed`. Only needed for a policy's `min_compliance_score`. */
  complianceScore?: number | null | undefined;
}

export interface GateResult {
  exitCode: ExitCodeValue;
  blocked: boolean;
  /** Findings at or above the threshold, ignoring the predicate. */
  atOrAboveThreshold: Finding[];
  /** The subset that actually triggers the gate. */
  triggering: Finding[];
  /** Human-readable reasons, for the summary footer. */
  reasons: string[];
  /** e.g. `severity≥high, fail-on=verified-secrets` */
  predicate: string;
}

const DEFAULT_THRESHOLD: Severity = 'high';
const DEFAULT_FAIL_ON: FailOn = 'all';

/**
 * Suppressed findings never gate. The worker evaluates inline `# sirius-ignore`
 * comments and server-side suppression rows, and marks them; the CLI only has
 * to honor the flag.
 */
const isActive = (f: Finding) => !f.suppressed;

function matchesPredicate(finding: Finding, failOn: FailOn): boolean {
  switch (failOn) {
    case 'all':
      return true;
    case 'new':
      // Findings absent from the baseline. Anything unlabeled is treated as new,
      // which fails closed — a missing baseline should not silently open the gate.
      return (finding.baseline_state ?? 'new') === 'new';
    case 'verified-secrets':
      // Per the PRD, only live secrets flip the CI gate: most secrets found in
      // old commits are already revoked, and gating on them trains people to
      // ignore the gate.
      return finding.validity === 'verified_live';
    default: {
      const exhaustive: never = failOn;
      throw new Error(`unhandled fail-on predicate: ${String(exhaustive)}`);
    }
  }
}

export function evaluateGate(input: GateInput): GateResult {
  const severityThreshold = input.severityThreshold ?? DEFAULT_THRESHOLD;
  const failOn = input.failOn ?? DEFAULT_FAIL_ON;
  const policy = input.policy;

  const active = input.findings.filter(isActive);
  const atOrAboveThreshold = active.filter((f) => meetsThreshold(f.severity, severityThreshold));
  const triggering = atOrAboveThreshold.filter((f) => matchesPredicate(f, failOn));

  const reasons: string[] = [];

  if (triggering.length > 0) {
    const label =
      failOn === 'verified-secrets'
        ? `${triggering.length} verified-live secret${triggering.length === 1 ? '' : 's'}`
        : failOn === 'new'
          ? `${triggering.length} new finding${triggering.length === 1 ? '' : 's'} at or above ${severityThreshold}`
          : `${triggering.length} finding${triggering.length === 1 ? '' : 's'} at or above ${severityThreshold}`;
    reasons.push(label);
  }

  // Policy checks are additive — each one can block on its own, independent of
  // the flag predicate above.
  if (policy) {
    if (policy.fail_on_severity) {
      const overPolicyBar = active.filter((f) => meetsThreshold(f.severity, policy.fail_on_severity!));
      if (overPolicyBar.length > 0 && triggering.length === 0) {
        reasons.push(`policy: ${plural(overPolicyBar.length, 'finding')} at or above ${policy.fail_on_severity}`);
      }
    }

    if (policy.require_no_verified_secrets) {
      const live = active.filter((f) => f.validity === 'verified_live');
      if (live.length > 0 && failOn !== 'verified-secrets') {
        reasons.push(`policy: ${plural(live.length, 'verified-live secret')}`);
      }
    }

    if (typeof policy.max_new_findings === 'number') {
      const fresh = active.filter((f) => (f.baseline_state ?? 'new') === 'new');
      if (fresh.length > policy.max_new_findings) {
        reasons.push(`policy: ${fresh.length} new findings exceeds max ${policy.max_new_findings}`);
      }
    }

    if (typeof policy.min_compliance_score === 'number' && typeof input.complianceScore === 'number') {
      if (input.complianceScore < policy.min_compliance_score) {
        reasons.push(
          `policy: compliance score ${formatScore(input.complianceScore)} below minimum ${policy.min_compliance_score}`,
        );
      }
    }
  }

  const blocked = reasons.length > 0;

  return {
    exitCode: blocked ? ExitCode.FINDINGS : ExitCode.CLEAN,
    blocked,
    atOrAboveThreshold,
    triggering,
    reasons,
    predicate: `severity≥${severityThreshold}, fail-on=${failOn}`,
  };
}

/** `72.5` → `72`. The PRD renders 72.5 as "72/100"; floor rather than round. */
export function formatScore(score: number): number {
  return Math.floor(score);
}
