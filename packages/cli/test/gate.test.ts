/**
 * The gate is the single most consequential pure function in the CLI: it decides
 * whether someone's pipeline goes red. It gets a truth table, not spot checks.
 */

import { describe, expect, it } from 'vitest';

import { evaluateGate } from '../src/gate.js';
import { ExitCode } from '../src/domain.js';
import type { Finding, Severity } from '../src/domain.js';

let counter = 0;

function finding(overrides: Partial<Finding> = {}): Finding {
  counter += 1;
  return {
    id: `id-${counter}`,
    file: 'src/app.py',
    line: 1,
    severity: 'high',
    rule_id: 'SIR-SEC-999',
    category: 'secrets',
    message: 'test finding',
    ...overrides,
  } as Finding;
}

describe('severity threshold', () => {
  const findings = [
    finding({ severity: 'critical' }),
    finding({ severity: 'high' }),
    finding({ severity: 'medium' }),
    finding({ severity: 'low' }),
    finding({ severity: 'info' }),
  ];

  const cases: Array<[Severity, number]> = [
    ['info', 5],
    ['low', 4],
    ['medium', 3],
    ['high', 2],
    ['critical', 1],
  ];

  it.each(cases)('threshold %s counts %i findings', (threshold, expected) => {
    const result = evaluateGate({ findings, severityThreshold: threshold, failOn: 'all' });
    expect(result.atOrAboveThreshold).toHaveLength(expected);
    expect(result.exitCode).toBe(ExitCode.FINDINGS);
  });

  it('passes clean when nothing reaches the threshold', () => {
    const result = evaluateGate({
      findings: [finding({ severity: 'low' }), finding({ severity: 'info' })],
      severityThreshold: 'high',
      failOn: 'all',
    });
    expect(result.blocked).toBe(false);
    expect(result.exitCode).toBe(ExitCode.CLEAN);
    expect(result.reasons).toEqual([]);
  });

  it('passes clean on an empty scan', () => {
    const result = evaluateGate({ findings: [], severityThreshold: 'low', failOn: 'all' });
    expect(result.exitCode).toBe(ExitCode.CLEAN);
  });
});

describe('fail-on predicate', () => {
  const findings = [
    finding({ severity: 'critical', validity: 'verified_live', baseline_state: 'unchanged' }),
    finding({ severity: 'critical', validity: 'inactive', baseline_state: 'new' }),
    finding({ severity: 'high', baseline_state: 'unchanged' }),
  ];

  it('all: every finding above the bar blocks', () => {
    const result = evaluateGate({ findings, severityThreshold: 'high', failOn: 'all' });
    expect(result.triggering).toHaveLength(3);
    expect(result.exitCode).toBe(ExitCode.FINDINGS);
  });

  it('new: only findings absent from the baseline block', () => {
    const result = evaluateGate({ findings, severityThreshold: 'high', failOn: 'new' });
    expect(result.triggering).toHaveLength(1);
    expect(result.triggering[0]?.baseline_state).toBe('new');
  });

  it('verified-secrets: only live secrets block', () => {
    const result = evaluateGate({ findings, severityThreshold: 'high', failOn: 'verified-secrets' });
    expect(result.triggering).toHaveLength(1);
    expect(result.triggering[0]?.validity).toBe('verified_live');
  });

  it('verified-secrets passes when every secret is already revoked', () => {
    const result = evaluateGate({
      findings: [finding({ severity: 'critical', validity: 'inactive' })],
      severityThreshold: 'low',
      failOn: 'verified-secrets',
    });
    expect(result.exitCode).toBe(ExitCode.CLEAN);
  });

  it('treats an unlabeled baseline_state as new, so a missing baseline fails closed', () => {
    const result = evaluateGate({
      findings: [finding({ severity: 'critical', baseline_state: undefined })],
      severityThreshold: 'high',
      failOn: 'new',
    });
    expect(result.blocked).toBe(true);
  });
});

describe('suppression', () => {
  it('never gates on suppressed findings', () => {
    const result = evaluateGate({
      findings: [finding({ severity: 'critical', suppressed: true })],
      severityThreshold: 'low',
      failOn: 'all',
    });
    expect(result.exitCode).toBe(ExitCode.CLEAN);
    expect(result.atOrAboveThreshold).toHaveLength(0);
  });
});

describe('policy checks are additive', () => {
  it('blocks on a live secret even when the flag predicate would not', () => {
    const result = evaluateGate({
      findings: [finding({ severity: 'low', validity: 'verified_live' })],
      severityThreshold: 'critical',
      failOn: 'all',
      policy: { require_no_verified_secrets: true },
    });
    expect(result.blocked).toBe(true);
    expect(result.reasons.join()).toMatch(/verified-live/);
  });

  it('blocks when new findings exceed the allowance', () => {
    const result = evaluateGate({
      findings: [
        finding({ severity: 'low', baseline_state: 'new' }),
        finding({ severity: 'low', baseline_state: 'new' }),
      ],
      severityThreshold: 'critical',
      failOn: 'all',
      policy: { max_new_findings: 1 },
    });
    expect(result.blocked).toBe(true);
    expect(result.reasons.join()).toMatch(/exceeds max 1/);
  });

  it('blocks when the compliance score is under the minimum', () => {
    const result = evaluateGate({
      findings: [],
      severityThreshold: 'critical',
      failOn: 'all',
      policy: { min_compliance_score: 80 },
      complianceScore: 72.5,
    });
    expect(result.blocked).toBe(true);
    expect(result.reasons.join()).toMatch(/below minimum 80/);
  });

  it('allows a passing score', () => {
    const result = evaluateGate({
      findings: [],
      severityThreshold: 'critical',
      failOn: 'all',
      policy: { min_compliance_score: 70 },
      complianceScore: 72.5,
    });
    expect(result.exitCode).toBe(ExitCode.CLEAN);
  });
});

describe('predicate description', () => {
  it('reports both axes separately, unlike the PRD mockup', () => {
    const result = evaluateGate({ findings: [], severityThreshold: 'high', failOn: 'verified-secrets' });
    expect(result.predicate).toBe('severity≥high, fail-on=verified-secrets');
  });
});
