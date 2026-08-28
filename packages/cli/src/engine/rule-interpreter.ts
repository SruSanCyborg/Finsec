/**
 * Executing a YAML rule, rather than asking a server to.
 *
 * `sirius rules test` was the last command that still answered "not
 * implemented", and the reason it gave had drifted from the truth. It said it
 * needed a rule-execution endpoint. It does not: it needs something able to
 * *run* a rule document, and no such thing existed anywhere — the engine's
 * thirteen rules are compiled TypeScript matchers, and `rules validate` checks
 * a YAML rule's structure while explicitly disclaiming any opinion about
 * whether its patterns match what the author thinks.
 *
 * This is that missing piece, at an honest size. It is not Semgrep, and the
 * `unsupported` field is how it says so rather than failing quietly:
 *
 *   regex          fully supported, per line
 *   entropy        fully supported — Shannon bits over the matched text
 *   pattern        a metavariable subset: `$X` matches any single node,
 *                  `"..."` matches any string, and everything else must match
 *                  the target's node type and text
 *   pattern-either any of the alternatives
 *   patterns       all of them, on the same line
 *
 * A pattern the subset cannot express is reported as unsupported and the rule
 * is *not* silently treated as passing. Quietly returning "no findings" for a
 * pattern nobody executed is the failure mode that makes a rule tester worse
 * than none — the author reads a green result and ships a rule that fires on
 * nothing.
 */

import { parse as parseYaml } from 'yaml';

import { parseSource, walk } from './parse.js';
import type { ParsedFile, SyntaxNode } from './parse.js';
import { shannonEntropy } from './rules.js';

export interface RuleMatch {
  /** 1-indexed line the rule fired on. */
  line: number;
  /** The source line, trimmed. */
  text: string;
  /** Which clause of the rule matched: `regex`, `pattern`, `pattern-either[1]`. */
  via: string;
}

export interface RuleRun {
  id: string;
  matches: RuleMatch[];
  /** Clauses this interpreter could not execute, named so nobody trusts a pass. */
  unsupported: string[];
  /** Set when the document could not be read at all. */
  error?: string;
}

interface MatchClause {
  kind?: unknown;
  pattern?: unknown;
  patterns?: unknown;
  'pattern-either'?: unknown;
  regex?: unknown;
  entropy?: unknown;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Runs a rule document against one file.
 *
 * The file is parsed when the rule needs an AST and left as text when it does
 * not, so a pure-regex rule works on a language the engine has no grammar for.
 */
export async function runRuleDocument(
  document: string,
  target: { path: string; source: string },
): Promise<RuleRun> {
  let parsed: unknown;
  try {
    parsed = parseYaml(document);
  } catch (failure) {
    return { id: '', matches: [], unsupported: [], error: `not valid YAML: ${String(failure)}` };
  }

  const root = isRecord(parsed) && isRecord(parsed.rule) ? parsed.rule : parsed;
  if (!isRecord(root)) return { id: '', matches: [], unsupported: [], error: 'no rule document found' };

  const id = typeof root.id === 'string' ? root.id : '';
  const match = isRecord(root.match) ? (root.match as MatchClause) : undefined;
  if (!match) return { id, matches: [], unsupported: [], error: 'rule has no `match:` clause' };

  const lines = target.source.split('\n');
  const matches: RuleMatch[] = [];
  const unsupported: string[] = [];

  // Parsed lazily: a regex-only rule should work on a file the engine has no
  // grammar for, and paying for a parse it never uses would be the reason it
  // could not.
  let tree: ParsedFile | undefined;
  let treeAttempted = false;
  const astOf = async (): Promise<ParsedFile | undefined> => {
    if (!treeAttempted) {
      treeAttempted = true;
      try {
        tree = await parseSource(target.path, target.source);
      } catch {
        tree = undefined;
      }
    }
    return tree;
  };

  const record = (line: number, via: string): void => {
    if (matches.some((existing) => existing.line === line && existing.via === via)) return;
    matches.push({ line, text: (lines[line - 1] ?? '').trim(), via });
  };

  /** One leaf clause: a regex, an entropy gate, or an AST pattern. */
  const runClause = async (clause: unknown, label: string): Promise<void> => {
    if (typeof clause === 'string') {
      // A bare string under `pattern:` is an AST pattern.
      await runPattern(clause, label);
      return;
    }
    if (!isRecord(clause)) {
      unsupported.push(`${label}: not a pattern this interpreter understands`);
      return;
    }

    if (typeof clause.regex === 'string') {
      runRegex(clause.regex, label);
      return;
    }
    if (typeof clause.pattern === 'string') {
      await runPattern(clause.pattern, label);
      return;
    }
    if (isRecord(clause.entropy)) {
      runEntropy(clause.entropy, label);
      return;
    }
    unsupported.push(`${label}: ${Object.keys(clause).join(', ') || 'empty clause'}`);
  };

  const runRegex = (source: string, label: string): void => {
    let expression: RegExp;
    try {
      expression = new RegExp(source);
    } catch (failure) {
      unsupported.push(`${label}: regex does not compile — ${String(failure)}`);
      return;
    }
    lines.forEach((line, index) => {
      if (expression.test(line)) record(index + 1, label);
    });
  };

  /**
   * Shannon entropy over the string literals on each line.
   *
   * Measured on the literal rather than the whole line, because a line of prose
   * clears 3.5 bits comfortably and would make the gate meaningless.
   */
  const runEntropy = (clause: Record<string, unknown>, label: string): void => {
    const minimum = typeof clause.min_bits === 'number' ? clause.min_bits : 3.5;
    lines.forEach((line, index) => {
      for (const literal of line.match(/(['"`])([^'"`]{8,})\1/g) ?? []) {
        const value = literal.slice(1, -1);
        if (shannonEntropy(value) >= minimum) {
          record(index + 1, label);
          return;
        }
      }
    });
  };

  const runPattern = async (pattern: string, label: string): Promise<void> => {
    const file = await astOf();
    if (!file) {
      unsupported.push(`${label}: needs a syntax tree and ${target.path} has no grammar here`);
      return;
    }

    const shape = compilePattern(pattern);
    if (!shape) {
      unsupported.push(`${label}: pattern is not in the supported subset`);
      return;
    }

    for (const node of walk(file.root)) {
      if (shape.test(node)) record(node.startPosition.row + 1, label);
    }
  };

  // ---- the clause tree -----------------------------------------------------
  if (match.regex !== undefined) await runClause({ regex: match.regex }, 'regex');
  if (match.pattern !== undefined) await runClause({ pattern: match.pattern }, 'pattern');

  if (Array.isArray(match.patterns)) {
    for (const [index, clause] of match.patterns.entries()) {
      await runClause(clause, `patterns[${index}]`);
    }
  }

  if (Array.isArray(match['pattern-either'])) {
    for (const [index, clause] of (match['pattern-either'] as unknown[]).entries()) {
      await runClause(clause, `pattern-either[${index}]`);
    }
  }

  matches.sort((a, b) => a.line - b.line || a.via.localeCompare(b.via));
  return { id, matches, unsupported };
}

// ---------------------------------------------------------------- patterns

interface CompiledPattern {
  test(node: SyntaxNode): boolean;
}

/**
 * A Semgrep-shaped pattern, reduced to what can be checked honestly.
 *
 * Real Semgrep parses the pattern with the target language's own grammar and
 * unifies metavariables across the tree. That is a large piece of work and
 * pretending to it would be worse than declining: this normalises both sides to
 * a token shape and compares, with `$X` standing for one token and `"..."` for
 * any string literal.
 *
 * It is enough for the call-shaped patterns the catalogue actually uses —
 * `$CUR.execute("..." % $X)` — and it says so when it is not.
 */
function compilePattern(pattern: string): CompiledPattern | undefined {
  const wanted = tokenise(pattern.trim());
  if (wanted.length === 0) return undefined;

  // A pattern of nothing but metavariables matches every node in the file,
  // which is never what an author meant.
  if (wanted.every((token) => token.startsWith('$'))) return undefined;

  return {
    test(node: SyntaxNode): boolean {
      // Only compare against nodes that could plausibly be the whole
      // expression, or every sub-token of a match would report its own line.
      if (node.type !== 'call' && node.type !== 'call_expression' && node.type !== 'binary_operator') {
        return false;
      }
      const actual = tokenise(node.text);
      if (actual.length !== wanted.length) return false;

      return wanted.every((token, index) => {
        const found = actual[index] as string;
        if (token.startsWith('$')) return true;
        if (token === '"..."' || token === "'...'") return /^["'`]/.test(found);
        return token === found;
      });
    },
  };
}

/** Splits source into comparable tokens: identifiers, strings, and punctuation. */
function tokenise(text: string): string[] {
  const tokens: string[] = [];
  // A prefixed string is one token, so the string alternatives come first. With
  // the identifier alternative leading, the `f` of an f-string matched as its
  // own identifier and `f"…"` arrived as two tokens — which made every
  // f-string one token longer than the pattern written to match it, and the
  // length check rejected it before any comparison happened.
  const expression =
    /[fbruFBRU]?"[^"]*"|[fbruFBRU]?'[^']*'|[fbruFBRU]?`[^`]*`|\$?[A-Za-z_][A-Za-z0-9_]*|[(),.[\]{}%+*/-]|\S/g;

  for (const token of text.replace(/\s+/g, ' ').match(expression) ?? []) {
    // f-strings and their prefixes normalise to a plain string, so a pattern
    // written with `"..."` matches the f-string form the rule is aimed at.
    tokens.push(/^[fbru]?["'`]/.test(token) ? `"${'...'}"` : token);
  }
  return tokens;
}
