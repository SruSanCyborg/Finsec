/**
 * Where a value came from, traced across statements.
 *
 * The injection rules matched a shape: an interpolation inside the argument of
 * an `execute` call. That shape is neither necessary nor sufficient.
 *
 * It missed the ordinary spelling, because the interpolation is usually not in
 * the call at all:
 *
 *     account = request.args["account"]
 *     q = "SELECT … WHERE account = '%s'" % account
 *     cur.execute(q)                                  ← nothing to match here
 *
 * And it fired on interpolation that cannot be an injection, because nothing
 * untrusted reaches it:
 *
 *     cur.execute(f"SELECT count(*) FROM {TABLE}")    ← TABLE is a constant
 *
 * So the question is not "is there an interpolation" but "does a value the
 * attacker controls reach this call". That is a dataflow question, and this is
 * the smallest analysis that answers it honestly: intra-procedural, flow-
 * ordered, over assignments within one function body.
 *
 * What it does not do is as important as what it does. It does not follow a
 * value into another function, through a container, or across a file — so it
 * *adds* proof where it can and never removes a finding on the strength of
 * having found none. An absence of proven taint is not a proof of safety, and a
 * scanner that treats it as one is worse than one that never looked.
 */

import { walk } from './parse.js';
import type { ParsedFile, SyntaxNode } from './parse.js';

/** One hop in the path from an untrusted source to a sink. */
export interface TaintStep {
  line: number;
  text: string;
}

export interface TaintPath {
  /** The expression that introduced it: `request.args["account"]`. */
  source: string;
  /** Assignments the value passed through, in order, ending at the sink's operand. */
  steps: TaintStep[];
}

/**
 * Expressions that introduce attacker-controlled data.
 *
 * Deliberately request-shaped. `os.environ` is not here: an environment
 * variable is operator input, and treating deployment configuration as hostile
 * would flag every correctly written application.
 */
const SOURCES: { pattern: RegExp; what: string }[] = [
  { pattern: /\brequest\.(args|form|json|values|data|files|cookies|headers)\b/, what: 'HTTP request' },
  { pattern: /\brequest\.get_json\s*\(/, what: 'HTTP request body' },
  { pattern: /\breq\.(body|query|params|cookies|headers)\b/, what: 'HTTP request' },
  { pattern: /\bevent\.(body|queryStringParameters|pathParameters)\b/, what: 'event payload' },
  { pattern: /\b(flask\.)?request\b\s*\[/, what: 'HTTP request' },
  { pattern: /\binput\s*\(/, what: 'stdin' },
  { pattern: /\bsys\.argv\b/, what: 'command line' },
  { pattern: /\bprocess\.argv\b/, what: 'command line' },
];

/**
 * Calls that render a value safe to interpolate.
 *
 * Kept narrow, and coercion is the honest core of it: `int(x)` cannot carry a
 * quote. Anything broader risks clearing taint that is still there, which is
 * the failure mode that matters — a false negative in an injection scanner.
 */
const SANITIZERS =
  /^\s*(int|float|bool|len|escape|quote|shlex\.quote|re\.escape|urllib\.parse\.quote|html\.escape|bleach\.clean|saniti[sz]e|Number|parseInt|parseFloat|encodeURIComponent)\s*\(/;

interface TaintEvent {
  line: number;
  name: string;
  /** Absent when the assignment cleared the taint. */
  path?: TaintPath;
}

export interface TaintTable {
  /** The path by which `name` is tainted at `line`, if it is. */
  at(line: number, name: string): TaintPath | undefined;
  /** The first tainted identifier used anywhere inside `node`. */
  reaching(node: SyntaxNode): TaintPath | undefined;
  /** Names bound once at module level to a literal — constants, not inputs. */
  isConstant(name: string): boolean;
  /** True when the file had anything worth tracing. */
  active: boolean;
}

const ASSIGNMENT_TYPES = new Set(['assignment', 'variable_declarator', 'assignment_expression']);

/** Identifier names appearing anywhere under a node. */
function identifiersIn(node: SyntaxNode): string[] {
  const names: string[] = [];
  for (const child of walk(node)) {
    if (child.type === 'identifier' || child.type === 'shorthand_property_identifier') {
      names.push(child.text);
    }
  }
  return names;
}

function sourceOf(text: string): string | undefined {
  for (const source of SOURCES) if (source.pattern.test(text)) return source.what;
  return undefined;
}

/** `x = …` → the name being bound, when it is a plain name. */
function boundName(node: SyntaxNode): string | undefined {
  const left = node.childForFieldName('left') ?? node.childForFieldName('name');
  if (!left) return undefined;
  return left.type === 'identifier' ? left.text : undefined;
}

function boundValue(node: SyntaxNode): SyntaxNode | undefined {
  return node.childForFieldName('right') ?? node.childForFieldName('value') ?? undefined;
}

const oneLine = (text: string): string => {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > 72 ? `${flat.slice(0, 69)}…` : flat;
};

export function analyzeTaint(file: ParsedFile): TaintTable {
  const events: TaintEvent[] = [];
  const constants = new Set<string>();

  // Module-level names bound once to a literal. `TABLE = "settlements"` is not
  // an injection vector, and interpolating it is not a finding — this is the
  // set that lets the rule say so rather than flagging every f-string.
  const reassigned = new Set<string>();
  for (const node of walk(file.root)) {
    if (!ASSIGNMENT_TYPES.has(node.type)) continue;
    const name = boundName(node);
    const value = boundValue(node);
    if (!name || !value) continue;

    const atModuleLevel = !enclosingFunction(node);
    const literal =
      (value.type === 'string' || value.type === 'string_literal' || value.type === 'integer' || value.type === 'float' || value.type === 'number') &&
      identifiersIn(value).length === 0;

    if (constants.has(name) || reassigned.has(name)) {
      constants.delete(name);
      reassigned.add(name);
    } else if (atModuleLevel && literal) {
      constants.add(name);
    } else {
      reassigned.add(name);
    }
  }

  // Flow-ordered within the file. Recording an event per assignment, rather
  // than one environment per function, is what lets a lookup answer "was this
  // tainted *at this line*" — a name cleaned after the sink must not make the
  // sink look safe.
  for (const node of walk(file.root)) {
    if (!ASSIGNMENT_TYPES.has(node.type)) continue;
    const name = boundName(node);
    const value = boundValue(node);
    if (!name || !value) continue;

    const line = node.startPosition.row + 1;
    const text = value.text;

    if (SANITIZERS.test(text)) {
      events.push({ line, name });
      continue;
    }

    const direct = sourceOf(text);
    if (direct) {
      events.push({ line, name, path: { source: direct, steps: [{ line, text: oneLine(node.text) }] } });
      continue;
    }

    // Propagation: the right-hand side mentions something already tainted.
    let carried: TaintPath | undefined;
    for (const used of identifiersIn(value)) {
      const found = lookup(events, line, used);
      if (found) {
        carried = found;
        break;
      }
    }

    if (carried) {
      events.push({
        line,
        name,
        path: { source: carried.source, steps: [...carried.steps, { line, text: oneLine(node.text) }] },
      });
    } else {
      events.push({ line, name });
    }
  }

  return {
    at: (line, name) => lookup(events, line, name),
    reaching(node) {
      const line = node.startPosition.row + 1;
      if (sourceOf(node.text)) {
        return { source: sourceOf(node.text) as string, steps: [{ line, text: oneLine(node.text) }] };
      }
      for (const used of identifiersIn(node)) {
        const found = lookup(events, line, used);
        if (found) return found;
      }
      return undefined;
    },
    isConstant: (name) => constants.has(name),
    active: events.length > 0,
  };
}

/** The most recent binding of `name` at or before `line`. */
function lookup(events: readonly TaintEvent[], line: number, name: string): TaintPath | undefined {
  let found: TaintEvent | undefined;
  for (const event of events) {
    if (event.name !== name) continue;
    if (event.line > line) break;
    found = event;
  }
  return found?.path;
}

function enclosingFunction(node: SyntaxNode): SyntaxNode | undefined {
  let current: SyntaxNode | null = node.parent;
  while (current) {
    if (/function_definition|function_declaration|method_definition|arrow_function|function_expression/.test(current.type)) {
      return current;
    }
    current = current.parent;
  }
  return undefined;
}

/** `request.args["a"] → account → q` — the path, as one readable line. */
export function describePath(path: TaintPath): string {
  const hops = path.steps.map((step) => `${step.text} (line ${step.line})`);
  return `${path.source}: ${hops.join('  →  ')}`;
}
