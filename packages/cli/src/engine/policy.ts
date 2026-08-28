/**
 * Applying the project's own policy to a stream of findings.
 *
 * The gate has always known how to act on `baseline_state` and the renderers
 * have always known how to show it — but nothing ever set it, so `sirius
 * baseline set` recorded a floor that no scan ever read, and
 * `--fail-on new` blocked on findings that were not new. Two features that
 * existed on both sides of a gap nobody had bridged.
 *
 * Applied as a stream transformer rather than a pass over the results, because
 * a suppressed finding must never be *printed* — findings are rendered as they
 * arrive, and filtering afterwards would show the user something and then
 * quietly not count it.
 */

import { classify, findSuppression, loadBaseline, loadSuppressions } from './store.js';
import type { Suppression } from './store.js';
import type { WsFrame } from '../domain.js';

export interface PolicyOutcome {
  /** Findings withheld, and which suppression withheld each. */
  suppressed: { rule_id: string; file: string; reason: string }[];
  /** Suppressions that have lapsed, so their findings are reported again. */
  expired: Suppression[];
  baselineCommit: string | null | undefined;
  unchanged: number;
}

/**
 * Marks findings against the baseline and drops suppressed ones.
 *
 * `outcome` is filled in as the stream is consumed; read it once the stream is
 * exhausted.
 */
export async function* applyPolicy(
  frames: AsyncIterable<WsFrame>,
  root: string,
  outcome: PolicyOutcome,
): AsyncGenerator<WsFrame> {
  const baseline = loadBaseline(root);
  const suppressions = loadSuppressions(root);
  const now = new Date();

  outcome.baselineCommit = baseline?.commit_sha;

  // Reported once at the end: a lapsed exception is a decision that needs
  // retaking, and it should not go unmentioned just because nothing broke.
  outcome.expired = suppressions.filter(
    (entry) => entry.expires_at && Date.parse(entry.expires_at) <= now.getTime(),
  );

  for await (const frame of frames) {
    if (frame.type !== 'finding' || !frame.finding) {
      yield frame;
      continue;
    }

    const finding = frame.finding;

    const silencer = findSuppression(
      { rule_id: finding.rule_id, file: finding.file, ...(finding.fingerprint ? { fingerprint: finding.fingerprint } : {}) },
      suppressions,
      now,
    );

    if (silencer) {
      outcome.suppressed.push({
        rule_id: finding.rule_id,
        file: finding.file,
        reason: silencer.reason,
      });
      continue;
    }

    const state = classify(finding.fingerprint ?? undefined, baseline);
    finding.baseline_state = state;
    if (state === 'unchanged') outcome.unchanged += 1;

    yield frame;
  }
}

/** An empty outcome, for callers to hand in and read back. */
export function emptyPolicyOutcome(): PolicyOutcome {
  return { suppressed: [], expired: [], baselineCommit: undefined, unchanged: 0 };
}
