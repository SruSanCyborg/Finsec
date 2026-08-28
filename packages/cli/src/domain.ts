/**
 * Convenience aliases over the generated contract types.
 *
 * `api/types.ts` is generated from contract/openapi.yaml and must never be
 * hand-edited. This module is the hand-written seam on top of it: short names
 * for the types used everywhere, plus the few runtime constants (severity
 * ordering, exit codes) that the schema can express as an enum but not as an
 * order.
 */

import type { components } from './api/types.js';

type S = components['schemas'];

export type Severity = S['Severity'];
export type Category = S['Category'];
export type ScanStatus = S['ScanStatus'];
export type ScanSource = S['ScanSource'];
export type BaselineState = S['BaselineState'];
export type Validity = S['Validity'];
export type VerifierStatus = S['VerifierStatus'];
export type FailOn = S['FailOn'];
export type FixAction = S['FixAction'];
export type TriageState = S['TriageState'];
export type TriageUpdate = S['TriageUpdate'];

export type Scan = S['Scan'];
export type ScanCreate = S['ScanCreate'];
export type Finding = S['Finding'];
export type FindingPage = S['FindingPage'];
export type FixSuggestion = S['FixSuggestion'];
export type Rule = S['Rule'];
export type Suppression = S['Suppression'];
export type Baseline = S['Baseline'];
export type Report = S['Report'];
export type Problem = S['Problem'];
export type SeverityCounts = S['SeverityCounts'];

export type WsFrame = S['WsFrame'];
export type WsScanStarted = S['WsScanStarted'];
export type WsFileScanning = S['WsFileScanning'];
export type WsFinding = S['WsFinding'];
export type WsProgress = S['WsProgress'];
export type WsScanCompleted = S['WsScanCompleted'];
export type WsError = S['WsError'];

/**
 * Severity ordering, least to most severe. The contract can enumerate these but
 * not rank them, and ranking is what `--severity-threshold` needs.
 */
export const SEVERITY_ORDER = ['info', 'low', 'medium', 'high', 'critical'] as const;

export const SEVERITIES: readonly Severity[] = SEVERITY_ORDER;

/** True when `severity` is at or above `threshold`. */
export function meetsThreshold(severity: Severity, threshold: Severity): boolean {
  return SEVERITY_ORDER.indexOf(severity) >= SEVERITY_ORDER.indexOf(threshold);
}

/**
 * Process exit codes, modeled on Snyk and fixed by the PRD.
 *
 * FINDINGS is deliberately not an error: a scan that completes and finds
 * problems has succeeded at its job. Only CLI_ERROR means something broke.
 */
export const ExitCode = {
  CLEAN: 0,
  FINDINGS: 1,
  CLI_ERROR: 2,
  NO_TARGET: 3,
} as const;

export type ExitCodeValue = (typeof ExitCode)[keyof typeof ExitCode];
