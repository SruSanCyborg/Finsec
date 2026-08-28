/**
 * Real AST parsing, via tree-sitter compiled to WebAssembly.
 *
 * This is the part that makes sirius a scanner rather than a client for one.
 * Findings come from walking a genuine syntax tree, not from grepping — which
 * is what lets a rule tell `cur.execute(query)` apart from
 * `cur.execute("..." % uid)`, and what keeps the false-positive rate low enough
 * to be worth gating a build on.
 *
 * `web-tree-sitter` is pinned to 0.24.7: the 0.26 ABI rejects the prebuilt
 * grammars in `tree-sitter-wasms`, which fail to load with a bare `Error` and no
 * message. If you bump one, bump both and re-run the engine tests.
 */

import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';

const require = createRequire(import.meta.url);

export type SupportedLanguage = 'python' | 'javascript' | 'typescript' | 'go';

const EXTENSIONS: Record<string, SupportedLanguage> = {
  '.py': 'python',
  '.js': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.jsx': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.go': 'go',
};

/** The extensions a scan will actually open, for saying so when none matched. */
export const SUPPORTED_EXTENSIONS: readonly string[] = Object.keys(EXTENSIONS);

/**
 * The languages there is a grammar for.
 *
 * Distinct from what a rule *claims* in its `languages` field, and the two are
 * checked against each other — a rule may not advertise a language the parser
 * cannot even open, which is how `doctor` came to print `go`.
 */
export const SUPPORTED_LANGUAGES: readonly string[] = [...new Set(Object.values(EXTENSIONS))];

export function languageOf(path: string): SupportedLanguage | undefined {
  return EXTENSIONS[extname(path).toLowerCase()];
}

/** Minimal shape of a tree-sitter node, so the rules do not import the library. */
export interface SyntaxNode {
  type: string;
  text: string;
  startPosition: { row: number; column: number };
  endPosition: { row: number; column: number };
  childCount: number;
  namedChildCount: number;
  child(index: number): SyntaxNode | null;
  namedChild(index: number): SyntaxNode | null;
  childForFieldName(field: string): SyntaxNode | null;
  parent: SyntaxNode | null;
  /** True anywhere under this node tree-sitter could not parse. */
  hasError?: boolean;
}

interface ParserLike {
  setLanguage(language: unknown): void;
  parse(source: string): { rootNode: SyntaxNode };
}

let initialized: Promise<void> | null = null;
const languages = new Map<SupportedLanguage, unknown>();
let ParserCtor: (new () => ParserLike) & { init(): Promise<void> };
let LanguageApi: { load(path: string): Promise<unknown> };

async function ensureInitialized(): Promise<void> {
  if (initialized) return initialized;

  initialized = (async () => {
    // The package is CommonJS and its export shape moves between versions: in
    // 0.24 `require` returns the Parser constructor itself, in 0.26 it returns
    // a namespace with `.Parser`. Resolve both.
    const mod = require('web-tree-sitter') as Record<string, unknown>;
    ParserCtor = (mod.Parser ?? mod.default ?? mod) as typeof ParserCtor;

    await ParserCtor.init();

    // `Language` is attached to the constructor by `init()`, so it must be read
    // afterwards — reading it earlier yields undefined and the failure surfaces
    // much later as an unhelpful "not a constructor".
    const afterInit = ParserCtor as unknown as Record<string, unknown>;
    LanguageApi = (afterInit.Language ?? mod.Language) as typeof LanguageApi;
  })();

  return initialized;
}

async function loadLanguage(language: SupportedLanguage): Promise<unknown> {
  const cached = languages.get(language);
  if (cached) return cached;

  await ensureInitialized();
  const wasm = require.resolve(`tree-sitter-wasms/out/tree-sitter-${language}.wasm`);
  const loaded = await LanguageApi.load(wasm);
  languages.set(language, loaded);
  return loaded;
}

export interface ParsedFile {
  path: string;
  language: SupportedLanguage;
  source: string;
  lines: string[];
  root: SyntaxNode;
}

export async function parseFile(path: string): Promise<ParsedFile | undefined> {
  const language = languageOf(path);
  if (!language) return undefined;

  let source: string;
  try {
    source = readFileSync(path, 'utf8');
  } catch {
    return undefined;
  }

  return parseSource(path, source);
}

/**
 * Parses source held in memory rather than read from disk.
 *
 * This is what makes the fix verifier real: a proposed patch is applied to a
 * copy of the source and re-parsed, and the rule is re-run against the result.
 * Without it a verifier could only claim the fix worked; with it, the claim is
 * checked before anything is written to the user's file.
 */
export async function parseSource(
  path: string,
  source: string,
): Promise<ParsedFile | undefined> {
  const language = languageOf(path);
  if (!language) return undefined;

  // Load the grammar first. `ParserCtor` does not exist until initialisation
  // has run, and constructing before awaiting is an ordering bug that presents
  // as "ParserCtor is not a constructor".
  const grammar = await loadLanguage(language);

  // A parser is cheap; a grammar is not. Grammars are cached, parsers are not,
  // because tree-sitter parsers are stateful and reusing one across files in
  // flight is a good way to produce a tree for the wrong source.
  const parser = new ParserCtor();
  parser.setLanguage(grammar);

  return {
    path,
    language,
    source,
    lines: source.split('\n'),
    root: parser.parse(source).rootNode,
  };
}

/** Depth-first walk over every node in the tree. */
export function* walk(node: SyntaxNode): Generator<SyntaxNode> {
  yield node;
  for (let i = 0; i < node.childCount; i += 1) {
    const child = node.child(i);
    if (child) yield* walk(child);
  }
}

/** The nearest enclosing node of one of the given types, if any. */
export function enclosing(node: SyntaxNode, types: readonly string[]): SyntaxNode | undefined {
  let current = node.parent;
  while (current) {
    if (types.includes(current.type)) return current;
    current = current.parent;
  }
  return undefined;
}
