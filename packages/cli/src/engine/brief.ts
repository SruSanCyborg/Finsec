/**
 * The facts a brief is written from, gathered by running the thing.
 *
 * Every number in the document comes from here, and everything here comes from
 * an actual run — a guard evaluation over a generated feed, and a scan of the
 * demo fixture. Nothing is typed into the prose.
 *
 * That rule exists because a slide deck whose numbers drift from the tool is
 * worse than no deck: the first person to run the commands finds a figure that
 * does not reproduce, and then doubts the ones that would have. `artifact:check`
 * exists for the same reason on the published page (D-039).
 */

import { evaluateFeed, moneyMoved, tally } from '../guard/loop.js';
import { generateFeed } from '../guard/synth.js';
import type { Decision } from '../guard/types.js';
import type { Planted } from '../guard/synth.js';

export interface GuardFacts {
  actions: number;
  agents: number;
  counts: Record<string, number>;
  /** Share of actions that proceeded with nobody asked. */
  autonomy: number;
  allowedPaise: number;
  stoppedPaise: number;
  trimmedPaise: number;
  /** Ordinary actions, and how many of them were interrupted. */
  ordinary: number;
  ordinaryIntervened: number;
  /** Planted kind → the tiers it landed on. */
  byPlanted: Array<{ planted: string; tiers: Record<string, number> }>;
  /** One worked example: the injection, with its full ladder. */
  injection?: {
    id: string;
    amountPaise: number;
    counterparty: string;
    intent: string;
    instruction: string;
    source: string;
    signals: Array<{ tier: string; stage: string; says: string; basis?: string }>;
    deciding?: string;
  };
}

export interface ScanFacts {
  findings: number;
  moneyInr: number;
  score: number;
  files: number;
  rules: number;
  topFinding?: { ruleId: string; message: string; file: string; line: number; moneyInr: number; clauses: string[] };
}

export interface BriefFacts {
  guard: GuardFacts;
  scan?: ScanFacts;
  generatedAt: string;
}

/** Runs a guard evaluation and reduces it to what the brief needs. */
export function collectGuardFacts(): GuardFacts {
  const feed = generateFeed();
  const { decisions } = evaluateFeed(feed.actions, feed.agents);
  const byId = new Map(decisions.map((d) => [d.action_id, d]));
  const byAction = new Map(feed.actions.map((a) => [a.id, a]));

  const counts = tally(decisions);
  const money = moneyMoved(decisions, feed.actions);

  const groups = new Map<string, Record<string, number>>();
  let ordinary = 0;
  let ordinaryIntervened = 0;

  for (const [actionId, planted] of Object.entries(feed.truth) as Array<[string, Planted]>) {
    const tier = byId.get(actionId)?.tier ?? 'allow';
    const row = groups.get(planted) ?? {};
    row[tier] = (row[tier] ?? 0) + 1;
    groups.set(planted, row);

    if (planted === 'none') {
      ordinary += 1;
      if (tier !== 'allow') ordinaryIntervened += 1;
    }
  }

  // The worked example. Chosen as the first planted injection rather than
  // whichever action happens to look worst, so the document shows the case it
  // claims to show.
  const injectionId = Object.entries(feed.truth).find(([, p]) => p === 'prompt_injection')?.[0];
  const injectionAction = injectionId ? byAction.get(injectionId) : undefined;
  const injectionDecision = injectionId ? byId.get(injectionId) : undefined;

  return {
    actions: feed.actions.length,
    agents: feed.agents.length,
    counts,
    autonomy: feed.actions.length > 0 ? (counts.allow ?? 0) / feed.actions.length : 0,
    allowedPaise: money.allowed_paise,
    stoppedPaise: money.stopped_paise,
    trimmedPaise: money.trimmed_paise,
    ordinary,
    ordinaryIntervened,
    byPlanted: [...groups.entries()]
      .filter(([planted]) => planted !== 'none')
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([planted, tiers]) => ({ planted, tiers })),
    ...(injectionAction && injectionDecision
      ? {
          injection: {
            id: injectionAction.id,
            amountPaise: injectionAction.amount_paise,
            counterparty: injectionAction.counterparty.id,
            intent: injectionAction.intent,
            instruction: injectionAction.instruction?.text ?? '',
            source: injectionAction.instruction?.source ?? 'unknown',
            signals: injectionDecision.signals.map((s) => ({
              tier: s.tier,
              stage: s.stage,
              says: s.says,
              ...(s.basis ? { basis: s.basis } : {}),
            })),
            ...(injectionDecision.deciding ? { deciding: injectionDecision.deciding.id } : {}),
          },
        }
      : {}),
  };
}

/** Scans a directory and reduces it to what the brief needs. */
export async function collectScanFacts(root: string): Promise<ScanFacts | undefined> {
  const { scanDirectory } = await import('./scanner.js');
  const { RULES } = await import('./rules.js');

  const findings: Array<{
    rule_id: string;
    message: string;
    file: string;
    line: number;
    money_at_risk_inr?: number;
    compliance_ref?: string[];
    severity: string;
  }> = [];
  let money = 0;
  let score = 0;
  let files = 0;

  try {
    for await (const frame of scanDirectory(root)) {
      if (frame.type === 'finding' && frame.finding) findings.push(frame.finding as never);
      if (frame.type === 'scan.completed') {
        money = (frame as { money_at_risk_inr?: number }).money_at_risk_inr ?? 0;
        score = (frame as { compliance_score?: number }).compliance_score ?? 0;
      }
      if (frame.type === 'file.scanning') files += 1;
    }
  } catch {
    return undefined;
  }

  const top = [...findings].sort((a, b) => (b.money_at_risk_inr ?? 0) - (a.money_at_risk_inr ?? 0))[0];

  return {
    findings: findings.length,
    moneyInr: money,
    score,
    files,
    rules: RULES.length,
    ...(top
      ? {
          topFinding: {
            ruleId: top.rule_id,
            message: top.message,
            file: top.file,
            line: top.line,
            moneyInr: top.money_at_risk_inr ?? 0,
            clauses: top.compliance_ref ?? [],
          },
        }
      : {}),
  };
}

export async function collectBriefFacts(scanRoot?: string): Promise<BriefFacts> {
  return {
    guard: collectGuardFacts(),
    ...(scanRoot ? { scan: await collectScanFacts(scanRoot) } : {}),
    generatedAt: new Date().toISOString(),
  };
}

/** Decisions, for callers that want the raw list rather than the summary. */
export type { Decision };
