/**
 * What this particular codebase already does.
 *
 * A fix that inserts `@require_auth` into a project that has never heard of
 * `require_auth` produces code that fails at import — and, because the rule's
 * own pattern does not recognise that name, does not even clear the finding it
 * claimed to fix. A remediation has to be written in the project's vocabulary,
 * not the linter's.
 *
 * So before proposing a decorator, look for one the project already uses, and
 * carry its import along with it. When there is nothing to find, the honest
 * answer is to propose nothing: adding authentication where none exists is a
 * design decision, not a lint fix.
 */

import { readFileSync } from 'node:fs';

import { collectFiles } from './scanner.js';
import { AUTH_DECORATORS } from './rules.js';

export interface AuthConvention {
  /** The decorator as written, without the `@` — e.g. `login_required`. */
  name: string;
  /** The import that makes it available, if one was found. */
  importLine?: string;
  /** How many files use it. Ties break toward the more common one. */
  uses: number;
}

/** Any decorator line, capturing the dotted name without arguments. */
const DECORATOR = /^\s*@([A-Za-z_][\w.]*)/gm;

/**
 * Finds the authentication decorator this project already uses.
 *
 * Returns undefined when the project has none, which is the common case for
 * the kind of codebase this linter is pointed at — and the case where a fix
 * must decline rather than invent one.
 */
export function findAuthConvention(root: string, limit = 400): AuthConvention | undefined {
  let files: string[];
  try {
    files = collectFiles(root, { maxFiles: limit });
  } catch {
    return undefined;
  }

  const counts = new Map<string, number>();
  const imports = new Map<string, string>();

  for (const file of files) {
    let source: string;
    try {
      source = readFileSync(file, 'utf8');
    } catch {
      continue;
    }

    const seen = new Set<string>();
    for (const match of source.matchAll(DECORATOR)) {
      const name = match[1];
      if (!name || !AUTH_DECORATORS.test(name)) continue;
      seen.add(name);
    }

    for (const name of seen) {
      counts.set(name, (counts.get(name) ?? 0) + 1);
      if (!imports.has(name)) {
        const found = findImport(source, name);
        if (found) imports.set(name, found);
      }
    }
  }

  if (counts.size === 0) return undefined;

  const [name, uses] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]!;
  const importLine = imports.get(name);

  return { name, uses, ...(importLine ? { importLine } : {}) };
}

/** The import statement that brings `name` into scope, if the file has one. */
function findImport(source: string, name: string): string | undefined {
  // Only the bare identifier matters; `@auth.login_required` is imported as `auth`.
  const root = name.split('.')[0];
  if (!root) return undefined;

  for (const line of source.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('import ') && !trimmed.startsWith('from ')) continue;

    // Word-boundary match, so `from x import authorized` does not satisfy `auth`.
    if (new RegExp(`\\b${root}\\b`).test(trimmed)) return trimmed;
  }

  return undefined;
}
