/**
 * The Response stage: proposing a fix, and checking it before offering it.
 *
 * This is the local counterpart to the hosted Cerebus endpoint. The PRD's
 * Cerebus is a dual-LLM design — a quarantined model reads untrusted code and
 * may only emit a structured action, a deterministic builder turns that action
 * into a diff, and a verifier re-runs the rule to confirm the finding is gone.
 *
 * **What is real here and what is not.** There is no LLM in this path, and the
 * panel says so. Stage one is a *template selector*, not a model: it maps the
 * rule's `fix_action` to a template and extracts a target from the AST. That is
 * strictly weaker than the PRD's design and strictly more honest than printing
 * a model name that never ran.
 *
 * Stage three, though, is entirely real, and it is the stage that matters. The
 * patch is applied to a copy of the source in memory, the file is re-parsed,
 * and the *same rule* is re-run against the result. `✓ PASS` means the rule no
 * longer fires. A fix that does not actually clear the finding is reported as
 * `fail` and never auto-applied — which is the whole point of a guardrail.
 */

import { parseSource } from './parse.js';
import { RULES, runRules } from './rules.js';
import type { RawFinding } from './rules.js';

export type VerifierStatus = 'pass' | 'fail' | 'escalated';

export interface LocalFixStage {
  name: string;
  detail: string;
  /** False where a stage is a deterministic stand-in for the hosted design. */
  real: boolean;
}

export interface LocalFix {
  action: string;
  target?: string;
  /** Unified diff against the file, one hunk. */
  diff: string;
  patched: string;
  sideEffects: { file: string; content: string }[];
  verifierStatus: VerifierStatus;
  verifierDetail: string;
  escalate: boolean;
  stages: LocalFixStage[];
  confidence: number;
}

/** A single-line replacement produced by a template. */
interface Replacement {
  line: number;
  next: string;
  target?: string;
  sideEffects?: { file: string; content: string }[];
  confidence: number;
}

/** `STRIPE_KEY` → `STRIPE_API_KEY`; a name someone would plausibly have set. */
function envNameFor(identifier: string): string {
  const upper = identifier.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase();
  if (/(KEY|TOKEN|SECRET|PASSWORD|DSN|URL)$/.test(upper)) return upper;
  return `${upper}_SECRET`;
}

const INDENT = /^(\s*)/;

/**
 * Splits a call's arguments on top-level commas.
 *
 * `"card %s", card.get("number")` is two arguments, not three — a naive split
 * on every comma would cut inside the nested call and produce nonsense.
 */
function splitArgs(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let current = '';

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]!;

    if (quote) {
      current += char;
      if (char === quote && text[i - 1] !== '\\') quote = null;
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      current += char;
      continue;
    }

    if (char === '(' || char === '[' || char === '{') depth += 1;
    if (char === ')' || char === ']' || char === '}') depth -= 1;

    if (char === ',' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += char;
  }

  if (current.trim()) parts.push(current);
  return parts;
}


/**
 * Turns one finding into one line-level replacement.
 *
 * Deliberately conservative: every template rewrites a single line and nothing
 * else. A template that cannot recognise the line it was handed returns
 * undefined rather than guessing, because a wrong patch to money-handling code
 * is worse than no patch.
 */
function buildReplacement(
  action: string,
  line: string,
  language: string,
): Replacement | undefined {
  const indent = INDENT.exec(line)?.[1] ?? '';

  switch (action) {
    case 'env_lookup': {
      // `NAME = "literal"` → an environment lookup, keeping the variable.
      const assignment = /^(\s*)([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(['"])(.*?)\3\s*$/.exec(line);
      if (!assignment) return undefined;

      const [, pad, identifier] = assignment;
      if (pad === undefined || !identifier) return undefined;

      const envName = envNameFor(identifier);
      const next =
        language === 'python'
          ? `${pad}${identifier} = os.environ["${envName}"]`
          : `${pad}${identifier} = process.env.${envName};`;

      return {
        line: 0,
        next,
        target: identifier,
        // The reason this template is safe to apply: it moves the secret out of
        // the file without leaving the reader guessing what to set instead.
        sideEffects: [{ file: '.env.example', content: `${envName}=` }],
        confidence: 0.92,
      };
    }

    case 'parameterize_query': {
      // Three ways a query gets built unsafely, all of which appear in real
      // code. Each becomes the same thing: a static query plus bound parameters.
      const call = /^(\s*)(.*?\bexecute\()(.+)\)(\s*)$/.exec(line);
      if (!call) return undefined;

      const [, pad, head, args, trail] = call;
      if (pad === undefined || !head || !args) return undefined;

      const placeholder = language === 'python' ? '%s' : '?';

      // `"... %s ..." % expr` or `... % (a, b)` — percent formatting.
      const percent = /^(['"])(.*)\1\s*%\s*(.+)$/.exec(args.trim());
      if (percent) {
        const [, quote, body, operand] = percent;
        if (!quote || body === undefined || !operand) return undefined;
        const bound = operand.trim().startsWith('(')
          ? operand.trim()
          : `(${operand.trim()},)`;
        return {
          line: 0,
          next: `${pad}${head}${quote}${body}${quote}, ${bound})${trail ?? ''}`,
          target: operand.trim().replace(/^\(|\)$/g, ''),
          confidence: 0.88,
        };
      }

      // `"...".format(a, b)`
      const dotFormat = /^(['"])(.*)\1\s*\.format\((.+)\)$/.exec(args.trim());
      if (dotFormat) {
        const [, quote, body, operand] = dotFormat;
        if (!quote || body === undefined || !operand) return undefined;
        return {
          line: 0,
          next: `${pad}${head}${quote}${body.replace(/\{[^}]*\}/g, placeholder)}${quote}, (${operand.trim()},))${trail ?? ''}`,
          target: operand.trim(),
          confidence: 0.84,
        };
      }

      // `f"... {expr} ..."` — an f-string interpolating straight into SQL.
      const fstring = /^f(['"])(.*)\1$/.exec(args.trim());
      if (fstring) {
        const [, quote, body] = fstring;
        if (!quote || body === undefined) return undefined;
        const params: string[] = [];
        const templated = body.replace(/\{([^}]+)\}/g, (_m, expr: string) => {
          params.push(expr.trim());
          return placeholder;
        });
        if (params.length === 0) return undefined;
        return {
          line: 0,
          next: `${pad}${head}${quote}${templated}${quote}, (${params.join(', ')},))${trail ?? ''}`,
          target: params[0],
          confidence: 0.81,
        };
      }

      return undefined;
    }

    case 'redact_pii_log': {
      // Wrap the *arguments*, not the format string. An earlier version wrapped
      // everything inside the call, which reads as a fix and changes nothing —
      // the verifier caught it, which is what the verifier is for.
      const log = /^(\s*)(.*\.(?:info|debug|warning|error|log)\()(.+)\)(\s*)$/.exec(line);
      if (!log) return undefined;

      const [, pad, head, args, trail] = log;
      if (pad === undefined || !head || !args) return undefined;
      if (args.includes('redact(')) return undefined;

      const parts = splitArgs(args);
      if (parts.length === 0) return undefined;

      // A lone argument is the message itself; anything after the first is data.
      const wrapped =
        parts.length === 1
          ? [`redact(${parts[0]!.trim()})`]
          : [parts[0]!.trim(), ...parts.slice(1).map((a) => `redact(${a.trim()})`)];

      return {
        line: 0,
        next: `${pad}${head}${wrapped.join(', ')})${trail ?? ''}`,
        target: (parts[1] ?? parts[0])?.trim(),
        confidence: 0.74,
      };
    }

    case 'add_auth_decorator': {
      // Inserted above the route, so the replacement is two lines.
      if (!/^\s*(?:@|def |async def |function |export )/.test(line)) return undefined;
      return {
        line: 0,
        next: `${indent}@require_auth\n${line}`,
        target: 'require_auth',
        confidence: 0.68,
      };
    }

    default:
      return undefined;
  }
}

/** A one-hunk unified diff, for display. */
function unifiedDiff(file: string, lineNumber: number, before: string, after: string): string {
  const addedCount = after.split('\n').length;
  const header = `@@ -${lineNumber},1 +${lineNumber},${addedCount} @@`;
  const minus = `-${before}`;
  const plus = after
    .split('\n')
    .map((l) => `+${l}`)
    .join('\n');
  return [`--- a/${file}`, `+++ b/${file}`, header, minus, plus].join('\n');
}

export interface BuildFixInput {
  filePath: string;
  source: string;
  /** 1-based, as findings report it. */
  line: number;
  ruleId: string;
  action: string;
}

/**
 * Builds a fix and verifies it, or explains why it could not.
 *
 * Returns undefined when no template covers the rule — an honest "not
 * implemented" rather than a plausible-looking patch nobody checked.
 */
export async function buildLocalFix(input: BuildFixInput): Promise<LocalFix | undefined> {
  const { filePath, source, line, ruleId, action } = input;

  const lines = source.split('\n');
  const original = lines[line - 1];
  if (original === undefined) return undefined;

  const language = filePath.endsWith('.py') ? 'python' : 'javascript';
  const replacement = buildReplacement(action, original, language);
  if (!replacement) return undefined;

  const patchedLines = [...lines];
  patchedLines[line - 1] = replacement.next;
  const patched = patchedLines.join('\n');

  // `os.environ` needs the import to exist, or the "fix" breaks the file.
  const needsOsImport =
    action === 'env_lookup' && language === 'python' && !/^\s*import\s+os\b/m.test(source);
  const finalSource = needsOsImport ? `import os\n${patched}` : patched;

  const verdict = await verify({ filePath, source: finalSource, ruleId, line });

  const stages: LocalFixStage[] = [
    {
      name: 'template selector',
      detail: `${action} → target ${replacement.target ?? 'n/a'}`,
      // Named honestly: the PRD puts a quarantined model here, and no model ran.
      real: false,
    },
    {
      name: 'diff builder',
      detail: `template: ${action}${needsOsImport ? ' (+ import os)' : ''}`,
      real: true,
    },
    {
      name: 'verifier',
      detail: verdict.detail,
      real: true,
    },
  ];

  return {
    action,
    ...(replacement.target ? { target: replacement.target } : {}),
    diff: unifiedDiff(filePath, line, original, replacement.next),
    patched: finalSource,
    sideEffects: replacement.sideEffects ?? [],
    verifierStatus: verdict.status,
    verifierDetail: verdict.detail,
    escalate: verdict.status !== 'pass',
    stages,
    confidence: replacement.confidence,
  };
}

/**
 * Re-runs the rule against the patched source.
 *
 * This is the guardrail. A template that produces syntactically plausible code
 * which still trips the rule has not fixed anything, and saying so is more
 * useful than a green tick.
 */
async function verify(input: {
  filePath: string;
  source: string;
  ruleId: string;
  line: number;
}): Promise<{ status: VerifierStatus; detail: string }> {
  const known = RULES.some((rule) => rule.id === input.ruleId);
  if (!known) {
    return { status: 'escalated', detail: `no local rule ${input.ruleId} to re-run` };
  }

  let parsed;
  try {
    parsed = await parseSource(input.filePath, input.source);
  } catch {
    return { status: 'fail', detail: 'patched source did not parse' };
  }

  if (!parsed) {
    return { status: 'escalated', detail: 'language not supported locally' };
  }

  // A parse error node means the patch produced code that is not valid at all.
  if (parsed.root.hasError === true) {
    return { status: 'fail', detail: 'patched source does not parse — not applied' };
  }

  let remaining: RawFinding[];
  try {
    remaining = runRules(parsed).filter((f) => f.rule_id === input.ruleId);
  } catch {
    return { status: 'escalated', detail: 'rule could not be re-run' };
  }

  if (remaining.length > 0) {
    return {
      status: 'fail',
      detail: `re-ran ${input.ruleId}, still ${remaining.length} match${remaining.length === 1 ? '' : 'es'}`,
    };
  }

  return { status: 'pass', detail: `re-ran ${input.ruleId}` };
}
