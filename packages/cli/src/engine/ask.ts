/**
 * Cerebus's Q&A path: a real model, grounded only in facts this codebase
 * already recorded.
 *
 * Two grounding modes, one function. With a finding selected, it answers from
 * that finding's own cached facts (rule, message, severity, location,
 * money-at-risk, compliance refs) — `CachedFinding` carries no code snippet on
 * purpose (see `session.ts`), so it cannot see, and is told not to invent,
 * anything the finding record itself doesn't carry. With none selected, it
 * falls back to the project's most recent scan summary — still real numbers,
 * just less specific.
 *
 * `history` is what gives the composer memory: every prior turn in the open
 * session is threaded through as real conversation, not re-summarised, so a
 * follow-up like "so is the second one worse?" resolves against what was
 * actually said rather than a fresh, context-free call each time.
 */
import { HttpError } from '../server/http.js';
import type { CachedFinding } from '../session.js';
import { askGroq, groqConfigured, GroqError } from './groq.js';
import type { GroqMessage } from './groq.js';

export interface AskHistoryTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface ProjectAskContext {
  name: string;
  counts: Record<string, number>;
  moneyAtRiskInr: number;
  complianceScore: number | null;
}

function factsFor(finding: CachedFinding | null, project: ProjectAskContext | null): string {
  if (finding) {
    return [
      `Rule: ${finding.rule_id}`,
      finding.message ? `Description: ${finding.message}` : undefined,
      `Severity: ${finding.severity}`,
      `File: ${finding.file}:${finding.line}`,
      finding.money_at_risk_inr
        ? `Money at risk: Rs ${finding.money_at_risk_inr.toLocaleString('en-IN')}`
        : undefined,
      finding.compliance_ref?.length ? `Compliance clauses: ${finding.compliance_ref.join(', ')}` : undefined,
    ]
      .filter(Boolean)
      .join('\n');
  }

  if (project) {
    const counts = Object.entries(project.counts)
      .filter(([, n]) => n > 0)
      .map(([sev, n]) => `${n} ${sev}`)
      .join(', ');
    return [
      `Project: ${project.name}`,
      `No specific finding is selected — this is the project's most recent scan.`,
      counts ? `Open findings by severity: ${counts}` : 'No open findings on the last scan.',
      `Money at risk: Rs ${project.moneyAtRiskInr.toLocaleString('en-IN')}`,
      project.complianceScore !== null ? `Compliance score: ${project.complianceScore}/100` : undefined,
    ]
      .filter(Boolean)
      .join('\n');
  }

  return 'No scan has been run for this project yet, and no finding is selected.';
}

export async function askCerebus(
  finding: CachedFinding | null,
  project: ProjectAskContext | null,
  question: string,
  history: AskHistoryTurn[],
): Promise<string> {
  if (!groqConfigured()) {
    throw new HttpError(
      503,
      'Cerebus has no model configured — set GROQ_API_KEY to ask it questions.',
      'SIRIUS_ERR_NO_MODEL',
    );
  }

  const system =
    'You are Cerebus, a security analyst embedded in a compliance scanner for money-handling code. ' +
    "Answer only from the facts below and the conversation so far — do not invent file contents, " +
    "figures, or compliance clauses that aren't given. If asked about something the facts don't " +
    'cover — the actual source code, a live attack, a system outside this scan — say plainly that ' +
    `you cannot see that from here rather than guessing. Keep answers under 120 words.\n\n` +
    `Facts:\n${factsFor(finding, project)}`;

  const messages: GroqMessage[] = [
    { role: 'system', content: system },
    ...history.map((turn) => ({ role: turn.role, content: turn.content }) as GroqMessage),
    { role: 'user', content: question },
  ];

  try {
    return await askGroq(messages, { temperature: 0.3, maxTokens: 350 });
  } catch (err) {
    if (err instanceof GroqError) {
      throw new HttpError(502, `Cerebus's model call failed: ${err.message}`, 'SIRIUS_ERR_MODEL_CALL');
    }
    throw err;
  }
}
