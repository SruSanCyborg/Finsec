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
 *
 * `--diff` withholds findings the same way. It was parsed, stored in the config,
 * echoed into the JSON envelope as `diff_aware`, and acted on by nothing: a scan
 * of an unchanged tree against its own baseline reported every finding and
 * exited 1, which is the opposite of what the flag promises. Same shape as
 * `--ruleset`, which was also wired to nothing — a flag that errs toward more
 * output is never caught by a missing result.
 */

import { complianceScore } from './scanner.js';
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
  /** Findings held back by `--diff` because the baseline already had them. */
  withheldAsUnchanged: number;
}

export interface PolicyOptions {
  /** `--diff`: report only what the baseline does not already contain. */
  diffOnly?: boolean;
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
  options: PolicyOptions = {},
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

  // The completed frame carries counts, money and the score, all computed by
  // the engine before this transformer withheld anything. Left alone, a
  // suppressed critical stays in the headline: still counted, still adding its
  // rupees, still dragging the score down — withheld from the list and nowhere
  // else. Track enough to correct it as it goes past.
  const withheldCounts: Record<string, number> = {};
  let withheldMoney = 0;
  let filesSeen = 0;

  for await (const frame of frames) {
    if (frame.type === 'file.scanning') {
      filesSeen += 1;
      yield frame;
      continue;
    }

    if (frame.type === 'scan.completed') {
      const anythingWithheld = Object.keys(withheldCounts).length > 0;
      yield anythingWithheld ? corrected(frame, withheldCounts, withheldMoney, filesSeen) : frame;
      continue;
    }

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
      withheldCounts[finding.severity] = (withheldCounts[finding.severity] ?? 0) + 1;
      withheldMoney += finding.money_at_risk_inr ?? 0;
      continue;
    }

    const state = classify(finding.fingerprint ?? undefined, baseline);
    finding.baseline_state = state;
    if (state === 'unchanged') outcome.unchanged += 1;

    // Withheld, not filtered afterwards — and counted out of the totals by the
    // same path suppression uses. Dropping a finding from the list while
    // leaving it in the count is a bug this surface has already shipped once.
    if (options.diffOnly && state === 'unchanged') {
      outcome.withheldAsUnchanged += 1;
      withheldCounts[finding.severity] = (withheldCounts[finding.severity] ?? 0) + 1;
      withheldMoney += finding.money_at_risk_inr ?? 0;
      continue;
    }

    yield frame;
  }
}

/**
 * The completion frame with the withheld findings taken back out of it.
 *
 * The score is recomputed rather than adjusted: it is not linear in the counts,
 * so subtracting a penalty would not give the number a fresh scan of the same
 * tree produces. Same function, same inputs, same answer.
 */
function corrected(
  frame: WsFrame & { type: 'scan.completed' },
  withheld: Record<string, number>,
  withheldMoney: number,
  fileCount: number,
): WsFrame {
  const counts: Record<string, number> = { ...(frame.counts ?? {}) };
  for (const [severity, n] of Object.entries(withheld)) {
    counts[severity] = Math.max(0, (counts[severity] ?? 0) - n);
    if (counts[severity] === 0) delete counts[severity];
  }

  const remaining = Object.values(counts).reduce((sum, n) => sum + n, 0);

  return {
    ...frame,
    counts,
    money_at_risk_inr: Math.max(0, (frame.money_at_risk_inr ?? 0) - withheldMoney),
    compliance_score: complianceScore(counts, fileCount),
    // Advisory — the gate is computed client-side — but a completed frame that
    // says "1" with nothing left to report would be a lie either way.
    exit_code: remaining > 0 ? (frame.exit_code ?? 1) : 0,
  } as WsFrame;
}

/** An empty outcome, for callers to hand in and read back. */
export function emptyPolicyOutcome(): PolicyOutcome {
  return { suppressed: [], expired: [], baselineCommit: undefined, unchanged: 0, withheldAsUnchanged: 0 };
}
