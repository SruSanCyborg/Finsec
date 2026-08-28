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

/**
 * How much confidence a fix carries, in rustc's vocabulary.
 *
 * `enum Applicability { MachineApplicable, MaybeIncorrect, HasPlaceholders,
 * Unspecified }` is the canonical model and `cargo clippy --fix` applies only
 * the first — a discipline worth copying exactly, because the alternative is a
 * single `confidence: 0.84` that means nothing to anyone and gates nothing.
 *
 * It is a property of the *match*, not of the template. `execute("… %s" % uid)`
 * rewrites to bound parameters with the meaning intact, so it is machine
 * applicable; the same template against `"… %s %s" % uid` is a guess about how
 * many parameters were meant, and guessing is what `MaybeIncorrect` is for.
 */
export type Applicability = 'machine-applicable' | 'maybe-incorrect' | 'has-placeholders' | 'unspecified';

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
  /** Whether this may be applied without being asked for. */
  applicability: Applicability;
  /**
   * What changes about the running program, when something does.
   *
   * Separate from applicability on purpose, and reported rather than gated on.
   * Moving a secret to `os.environ` is unambiguously what the author meant —
   * machine applicable — *and* it makes the program need an environment
   * variable that must now be set. Both facts are true, only one decides
   * whether to apply automatically, and the other is what a person wants to
   * know before pressing y.
   */
  behaviourNote?: string;
}

/** A single-line replacement produced by a template. */
interface Replacement {
  line: number;
  next: string;
  target?: string;
  sideEffects?: { file: string; content: string }[];
  /** An import the patched file needs and may not already have. */
  requiresImport?: string;
  /** Inclusive 0-based line range to replace, when it is not the finding's line. */
  span?: [number, number];
  confidence: number;
  applicability: Applicability;
  behaviourNote?: string;
}

/** What the surrounding project already does, for templates that must match it. */
export interface FixContext {
  auth?: { name: string; importLine?: string };
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
/**
 * The fix actions there is a template for.
 *
 * Exported so a caller can tell "nothing here can be fixed automatically" from
 * "the template exists and this line no longer matches it", which are different
 * problems with different answers and used to produce the same sentence.
 */
export const FIX_TEMPLATES: readonly string[] = [
  'env_lookup',
  'parameterize_query',
  'redact_pii_log',
  'add_auth_decorator',
];

function buildReplacement(
  action: string,
  line: string,
  language: string,
  context: FixContext,
  file?: { lines: string[]; index: number },
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
        applicability: 'machine-applicable',
        behaviourNote: `the program will read ${envName} from the environment — set it before deploying`,
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

        // Counted, not assumed. One placeholder and one operand is the same
        // query with the value bound — the meaning is preserved exactly. Two
        // placeholders and one operand is a guess about what the author meant
        // to interpolate, and a guess is what `maybe-incorrect` is for.
        const wanted = (body.match(/%s|%d|%\(/g) ?? []).length;
        const supplied = bound.startsWith('(')
          ? bound.slice(1, -1).split(',').filter((part) => part.trim().length > 0).length
          : 1;

        return {
          line: 0,
          next: `${pad}${head}${quote}${body}${quote}, ${bound})${trail ?? ''}`,
          target: operand.trim().replace(/^\(|\)$/g, ''),
          confidence: 0.88,
          applicability: wanted === supplied ? 'machine-applicable' : 'maybe-incorrect',
          ...(wanted === supplied
            ? {}
            : { behaviourNote: `${wanted} placeholder(s) and ${supplied} value(s) — check the binding by hand` }),
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
          // `.format()` accepts named and positional fields and reorders them;
          // turning that into positional binds is a guess about intent.
          applicability: 'maybe-incorrect',
          behaviourNote: 'format fields become positional parameters — check the order',
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
          // Every field becomes one parameter, in the order it appeared: the
          // count cannot disagree, because both sides come from the same list.
          applicability: 'machine-applicable',
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
        // `redact()` is a helper this template assumes and does not create. The
        // patched line parses and the rule stops matching, so the verifier
        // passes it — and it would still raise a NameError at runtime in a
        // project that has no such function.
        applicability: 'maybe-incorrect',
        behaviourNote: 'calls redact(), which this fix does not define — add it or point it at yours',
      };
    }

    case 'add_auth_decorator': {
      if (!/^\s*(?:@|def |async def |function |export )/.test(line)) return undefined;

      // Only ever the decorator this project already uses. Inventing one gives
      // the reader code that fails at import and a finding that does not clear
      // — the verifier caught exactly that, and it should never have been
      // offered in the first place. Adding authentication where a project has
      // none is a design decision, not a lint fix.
      const auth = context.auth;
      if (!auth) return undefined;
      if (!file) return undefined;

      // Placement is not cosmetic. Decorators apply bottom-up, so
      //
      //   @login_required
      //   @bp.route("/refund")
      //   def refund(): ...
      //
      // registers the *undecorated* function with the router and the auth
      // wrapper is never reached — a fix that silently disables the protection
      // it claims to add. The decorator therefore goes immediately above the
      // definition, inside every routing decorator, which is also how the
      // project's own authenticated routes are written.
      const defIndex = findDefinitionLine(file.lines, file.index);
      if (defIndex === undefined) return undefined;

      const defLine = file.lines[defIndex]!;
      const defIndent = INDENT.exec(defLine)?.[1] ?? '';

      return {
        line: 0,
        span: [defIndex, defIndex],
        next: `${defIndent}@${auth.name}\n${defLine}`,
        target: auth.name,
        ...(auth.importLine ? { requiresImport: auth.importLine } : {}),
        // Lower than the others: ordering among several decorators is a
        // judgement this template makes only one rule about.
        confidence: 0.62,
        // It also changes who can reach the endpoint, which is the point and
        // is also the sort of thing nobody should discover from a diff they
        // did not ask to have applied.
        applicability: 'maybe-incorrect',
        behaviourNote: 'the endpoint now requires authentication — check the decorator order',
      };
    }

    default:
      return undefined;
  }
}

/**
 * The line a decorator belongs immediately above: the first `def`/`function` at
 * or after `from`. Bounded, because a decorator far from any definition means
 * the shape was not what the template assumed.
 */
function findDefinitionLine(lines: string[], from: number): number | undefined {
  for (let i = from; i < Math.min(lines.length, from + 12); i += 1) {
    if (/^\s*(?:async\s+)?(?:def|function)\b/.test(lines[i] ?? '')) return i;
  }
  return undefined;
}

/** A one-hunk unified diff, for display. */
function unifiedDiff(file: string, lineNumber: number, before: string, after: string): string {
  const removedCount = before.split('\n').length;
  const addedCount = after.split('\n').length;
  const header = `@@ -${lineNumber},${removedCount} +${lineNumber},${addedCount} @@`;
  const minus = before
    .split('\n')
    .map((l) => `-${l}`)
    .join('\n');
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
  /** Conventions discovered in the project; see engine/conventions.ts. */
  context?: FixContext;
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
  const replacement = buildReplacement(action, original, language, input.context ?? {}, {
    lines,
    index: line - 1,
  });
  if (!replacement) return undefined;

  const [from, to] = replacement.span ?? [line - 1, line - 1];
  const patchedLines = [...lines];
  patchedLines.splice(from, to - from + 1, replacement.next);
  const patched = patchedLines.join('\n');

  // An added symbol needs its import, or the "fix" breaks the file it fixed.
  const needsOsImport =
    action === 'env_lookup' && language === 'python' && !/^\s*import\s+os\b/m.test(source);

  const extraImport =
    replacement.requiresImport && !source.includes(replacement.requiresImport)
      ? replacement.requiresImport
      : undefined;

  const prelude = [needsOsImport ? 'import os' : undefined, extraImport].filter(Boolean).join('\n');
  const finalSource = prelude ? `${prelude}\n${patched}` : patched;

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
      detail: `template: ${action}${prelude ? ` (+ ${prelude.split('\n').length} import)` : ''}`,
      real: true,
    },
    {
      name: 'verifier',
      detail: verdict.detail,
      real: true,
    },
    {
      name: 'applicability',
      detail:
        replacement.applicability === 'machine-applicable'
          ? 'machine-applicable — applied without asking'
          : `${replacement.applicability} — needs --unsafe-fixes`,
      real: true,
    },
  ];

  return {
    action,
    ...(replacement.target ? { target: replacement.target } : {}),
    diff: unifiedDiff(filePath, from + 1, lines.slice(from, to + 1).join('\n'), replacement.next),
    patched: finalSource,
    sideEffects: replacement.sideEffects ?? [],
    verifierStatus: verdict.status,
    verifierDetail: verdict.detail,
    escalate: verdict.status !== 'pass',
    stages,
    confidence: replacement.confidence,
    applicability: replacement.applicability,
    ...(replacement.behaviourNote ? { behaviourNote: replacement.behaviourNote } : {}),
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

  // The third condition the design report asks for, after "resolves it" and
  // "reparses", is that the fix converges — ESLint caps its fixer loop at ten
  // passes and treats exhaustion as a bug report about conflicting rules.
  //
  // Here it follows from the two checks above rather than needing a third.
  // Fixes are selected by findings, and the rule that produced this finding no
  // longer matches, so nothing would select this line a second time. Saying
  // that is honest; running the template again is not the same test, and it
  // was actively wrong — `add_auth_decorator` inserts a line, so re-running it
  // against the same index reads the decorator it just wrote and reports a
  // template that converges perfectly well as non-idempotent.
  return { status: 'pass', detail: `re-ran ${input.ruleId}, no match — nothing would select it again` };
}
