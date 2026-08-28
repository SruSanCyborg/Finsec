/**
 * Dependency manifests, as a second kind of scannable file.
 *
 * Every other rule in this engine walks a syntax tree, because that is what
 * separates `cur.execute(q, params)` from `cur.execute(q % uid)`. A manifest has
 * no syntax tree worth walking: `requirements.txt` is a line format, and
 * `package.json` is data. So supply-chain detection gets its own narrow path
 * rather than a fake AST — the same concession secrets already make, and for the
 * same reason. A dependency declaration is a lexical fact.
 *
 * The scanner walks these alongside source files and the findings are ordinary
 * findings: same fingerprint, same baseline, same suppression comment.
 */

import { readFileSync, existsSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

export type ManifestKind = 'npm' | 'pip';

export interface ManifestFile {
  /** Absolute path, as the scanner found it. */
  path: string;
  kind: ManifestKind;
  lines: string[];
  /**
   * Whether a lockfile sits beside it.
   *
   * This is the difference between a floating range being a finding and being
   * ordinary practice. `^4.17.21` in a repo with a `package-lock.json` resolves
   * to exactly one version with an integrity hash; the same line without one
   * resolves to whatever the registry serves that morning. Flagging every caret
   * regardless would bury the case that matters.
   *
   * Looked for *up* the tree, not just beside the manifest: a pnpm or yarn
   * workspace keeps one lockfile at the root and a `package.json` per package,
   * so checking only the sibling directory would call every package in every
   * monorepo unlocked and flag every caret in it.
   */
  locked: boolean;
}

const NPM_LOCKS = ['package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock', 'pnpm-lock.yaml'];
const PIP_LOCKS = ['requirements.lock', 'poetry.lock', 'Pipfile.lock', 'pdm.lock', 'uv.lock'];

/** Which manifest a path is, if it is one. */
export function manifestKind(path: string): ManifestKind | undefined {
  const name = basename(path);
  if (name === 'package.json') return 'npm';
  if (/^requirements(-[\w.]+)?\.txt$/.test(name)) return 'pip';
  return undefined;
}

export function readManifest(path: string): ManifestFile | undefined {
  const kind = manifestKind(path);
  if (!kind) return undefined;

  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return undefined;
  }

  return {
    path,
    kind,
    lines: text.split(/\r?\n/),
    // pip records hashes inline rather than in a separate file, so `--hash=`
    // anywhere in the file is that ecosystem's lockfile.
    locked: hasLockfile(dirname(path), kind) || (kind === 'pip' && /--hash=/.test(text)),
  };
}

/** A lockfile beside the manifest, or at any ancestor up to the repository root. */
function hasLockfile(from: string, kind: ManifestKind): boolean {
  const locks = kind === 'npm' ? NPM_LOCKS : PIP_LOCKS;
  let dir = resolve(from);

  for (;;) {
    if (locks.some((lock) => existsSync(join(dir, lock)))) return true;
    // Stop at the repository boundary; above it is somebody else's tree.
    if (existsSync(join(dir, '.git'))) return false;
    const parent = dirname(dir);
    if (parent === dir) return false;
    dir = parent;
  }
}
