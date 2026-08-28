/**
 * A real narrative for an attack chain SIRIUS already found — Gemini's one
 * job in this codebase. Grounded strictly in the steps it's handed: told not
 * to invent a file, rule, or figure beyond them, the same discipline
 * `engine/ask.ts` applies to Cerebus's chat.
 */
import { HttpError } from '../server/http.js';
import { askGemini, geminiConfigured, GeminiError } from './gemini.js';

export interface AttackPathStepInput {
  role: string;
  ruleId: string;
  file: string;
  severity: string;
}

export interface ExplainAttackPathInput {
  title: string;
  narrative?: string;
  steps: AttackPathStepInput[];
  moneyAtRiskInr: number;
}

export async function explainAttackPath(input: ExplainAttackPathInput): Promise<string> {
  if (!geminiConfigured()) {
    throw new HttpError(
      503,
      'No model configured for attack-path narratives — set GEMINI_API_KEY.',
      'SIRIUS_ERR_NO_MODEL',
    );
  }

  const stepLines = input.steps
    .map((s, i) => `${i + 1}. role=${s.role}, rule=${s.ruleId}, file=${s.file}, severity=${s.severity}`)
    .join('\n');

  const system =
    'You are a security analyst narrating a real attack chain that a scanner already found in this ' +
    "codebase, from its own recorded steps. Do not invent a file, rule id, or figure that isn't given " +
    'below. Write a short numbered walkthrough, one sentence per step, in plain language a ' +
    'non-engineer could follow — what an attacker would actually do at each step and why it works. ' +
    'End with the real rupee exposure figure given. Keep it under 150 words.';

  const user =
    `Attack path: ${input.title}\n` +
    (input.narrative ? `Known summary: ${input.narrative}\n` : '') +
    `Steps, in order:\n${stepLines}\n\n` +
    `Total exposure: Rs ${input.moneyAtRiskInr.toLocaleString('en-IN')}.`;

  try {
    return await askGemini(system, user);
  } catch (err) {
    if (err instanceof GeminiError) {
      throw new HttpError(502, `The model call failed: ${err.message}`, 'SIRIUS_ERR_MODEL_CALL');
    }
    throw err;
  }
}
