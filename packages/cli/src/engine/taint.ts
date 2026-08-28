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
 * It follows a value into another function within the same file, by summary.
 * Each function is asked two questions once — *if parameter i were tainted,
 * would that taint reach the return value, and would it reach a sink?* — and
 * the answers are then used at every call site. This is the classical
 * function-summary approach, and it is what turns
 *
 *     def run(cur, q): cur.execute(q)      ← the sink is here
 *     run(cur, request.args["q"])          ← the bug is here
 *
 * from two innocent-looking lines into one finding with a path through both.
 *
 * What it still does not do is as important as what it does. It does not cross
 * a file, resolve a method on a value whose class it cannot see, follow taint
 * through a container, or reason about aliasing — so it *adds* proof where it
 * can and never removes a finding on the strength of having found none. An
 * absence of proven taint is not a proof of safety, and a scanner that treats
 * it as one is worse than one that never looked.
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

/**
 * What one function does to a value passed into it.
 *
 * Computed once per function and reused at every call site, which is the whole
 * economy of the approach: the body is analysed once rather than re-analysed
 * down every path that reaches it.
 */
export interface FunctionSummary {
  name: string;
  params: string[];
  /** Parameter indices whose taint reaches the value the function returns. */
  returnsTaintFrom: number[];
  /** Parameter indices that reach a dangerous call inside the body. */
  sinksParam: { index: number; sink: string; line: number }[];
}

/** A finding the interprocedural pass found that no single statement shows. */
export interface CallSiteFinding {
  /** Where the call is — the line a person has to change. */
  line: number;
  /** The function called, and the line inside it where the value is used. */
  callee: string;
  sink: string;
  sinkLine: number;
  path: TaintPath;
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
  /** What each function in this file does with its arguments. */
  summaries: ReadonlyMap<string, FunctionSummary>;
  /** Calls that hand a tainted value to a function that sinks it. */
  callSites: CallSiteFinding[];
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

/**
 * Calls that do something dangerous with what they are given.
 *
 * The summariser's own list rather than the rule catalogue's, because a summary
 * is about the shape of a function and the rules are about the shape of a line.
 * Kept narrow: a false entry here invents a finding at every call site.
 */
const SINK_CALL = /(^|\.)(execute|executemany|raw|query)$|^os\.system$|^subprocess\.(run|call|Popen|check_output)$|child_process\.exec$/;

/** The parameter names of a function definition, in order. */
function parametersOf(fn: SyntaxNode): string[] {
  const list = fn.childForFieldName('parameters');
  if (!list) return [];

  const names: string[] = [];
  for (let i = 0; i < list.namedChildCount; i += 1) {
    const child = list.namedChild(i);
    if (!child) continue;
    // `x`, `x=1`, `x: int` — the name is the first identifier either way.
    const name = child.type === 'identifier' ? child.text : identifiersIn(child)[0];
    if (name) names.push(name);
  }
  return names;
}

/**
 * What happens inside one function if `seed` arrives tainted.
 *
 * A small flow-ordered pass over the body only — the same propagation the file
 * level does, run against a single seeded name.
 */
function traceWithin(
  fn: SyntaxNode,
  seed: string,
): { returnsTaint: boolean; sinks: { sink: string; line: number }[] } {
  const tainted = new Set([seed]);
  const sinks: { sink: string; line: number }[] = [];
  let returnsTaint = false;

  const mentionsTainted = (node: SyntaxNode): boolean =>
    identifiersIn(node).some((name) => tainted.has(name));

  for (const node of walk(fn)) {
    if (ASSIGNMENT_TYPES.has(node.type)) {
      const name = boundName(node);
      const value = boundValue(node);
      if (!name || !value) continue;

      if (SANITIZERS.test(value.text)) tainted.delete(name);
      else if (mentionsTainted(value)) tainted.add(name);
      else tainted.delete(name);
      continue;
    }

    if (node.type === 'return_statement' && mentionsTainted(node)) {
      returnsTaint = true;
      continue;
    }

    if (node.type === 'call' || node.type === 'call_expression') {
      const callee = node.childForFieldName('function')?.text ?? '';
      if (!SINK_CALL.test(callee)) continue;
      const args = node.childForFieldName('arguments');
      if (args && mentionsTainted(args)) {
        sinks.push({ sink: callee, line: node.startPosition.row + 1 });
      }
    }
  }

  return { returnsTaint, sinks };
}

/**
 * One summary per function in the file.
 *
 * Each parameter is seeded separately, because "this function sinks its second
 * argument" is a different fact from "it sinks its first", and a summary that
 * cannot tell them apart reports the wrong argument at every call site.
 */
export function summarise(file: ParsedFile): Map<string, FunctionSummary> {
  const summaries = new Map<string, FunctionSummary>();

  for (const node of walk(file.root)) {
    if (!/^(function_definition|function_declaration|method_definition)$/.test(node.type)) continue;
    const name = node.childForFieldName('name')?.text;
    if (!name) continue;

    const params = parametersOf(node);
    const returnsTaintFrom: number[] = [];
    const sinksParam: FunctionSummary['sinksParam'] = [];

    params.forEach((param, index) => {
      const { returnsTaint, sinks } = traceWithin(node, param);
      if (returnsTaint) returnsTaintFrom.push(index);
      for (const hit of sinks) sinksParam.push({ index, sink: hit.sink, line: hit.line });
    });

    summaries.set(name, { name, params, returnsTaintFrom, sinksParam });
  }

  return summaries;
}

export function analyzeTaint(file: ParsedFile): TaintTable {
  const events: TaintEvent[] = [];
  const constants = new Set<string>();
  const summaries = summarise(file);
  const callSites: CallSiteFinding[] = [];

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

    // And through a call, by summary: `q = build(request.args["x"])` is only
    // tainted if `build` actually returns what it was given. Assuming every
    // call passes taint through would flag `q = escape(dirty)`; assuming none
    // does is how the whole class gets missed.
    if (carried) {
      const call = callWithin(value);
      const summary = call && summaries.get(calleeName(call));
      if (call && summary) {
        const index = taintedArgumentIndex(call, line, events);
        if (index >= 0 && !summary.returnsTaintFrom.includes(index)) carried = undefined;
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

  // A tainted value handed to a function that sinks it. The finding belongs at
  // the call — that is the line somebody has to change — but it names the sink
  // inside the callee, because otherwise the report says a plain function call
  // is a SQL injection and leaves the reader to find out why.
  for (const node of walk(file.root)) {
    if (node.type !== 'call' && node.type !== 'call_expression') continue;

    const summary = summaries.get(calleeName(node));
    if (!summary || summary.sinksParam.length === 0) continue;

    const line = node.startPosition.row + 1;
    const args = argumentNodes(node);

    for (const hit of summary.sinksParam) {
      const argument = args[hit.index];
      if (!argument) continue;

      const reaching = taintOf(argument, line, events);
      if (!reaching) continue;

      callSites.push({
        line,
        callee: summary.name,
        sink: hit.sink,
        sinkLine: hit.line,
        path: {
          source: reaching.source,
          steps: [
            ...reaching.steps,
            { line, text: `${summary.name}(…) — reaches ${hit.sink} at line ${hit.line}` },
          ],
        },
      });
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
    summaries,
    callSites,
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

/** The call expression on the right-hand side, if the value is one. */
function callWithin(node: SyntaxNode): SyntaxNode | undefined {
  if (node.type === 'call' || node.type === 'call_expression') return node;
  for (const child of walk(node)) {
    if (child.type === 'call' || child.type === 'call_expression') return child;
  }
  return undefined;
}

function calleeName(call: SyntaxNode): string {
  const fn = call.childForFieldName('function');
  if (!fn) return '';
  // `obj.method(…)` summarises under `method`: the file defines it by that name
  // and this analysis cannot resolve the receiver's type anyway.
  return fn.text.split('.').at(-1) ?? '';
}

function argumentNodes(call: SyntaxNode): SyntaxNode[] {
  const list = call.childForFieldName('arguments');
  if (!list) return [];
  const out: SyntaxNode[] = [];
  for (let i = 0; i < list.namedChildCount; i += 1) {
    const child = list.namedChild(i);
    if (child) out.push(child);
  }
  return out;
}

/** Which argument of this call is tainted, or -1. */
function taintedArgumentIndex(call: SyntaxNode, line: number, events: readonly TaintEvent[]): number {
  return argumentNodes(call).findIndex((argument) => Boolean(taintOf(argument, line, events)));
}

/** The taint reaching one expression: a source directly, or a tainted name. */
function taintOf(node: SyntaxNode, line: number, events: readonly TaintEvent[]): TaintPath | undefined {
  const direct = sourceOf(node.text);
  if (direct) return { source: direct, steps: [{ line, text: oneLine(node.text) }] };
  for (const used of identifiersIn(node)) {
    const found = lookup(events, line, used);
    if (found) return found;
  }
  return undefined;
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
