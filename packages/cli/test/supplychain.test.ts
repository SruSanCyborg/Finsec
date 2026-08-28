/**
 * SIR-SEC-060, and the two ways a supply-chain rule earns its noise.
 *
 * This rule was in the PRD's table and in the demo replay and in no build. A
 * `--replay` demo showed a supply-chain finding that a live scan could not
 * produce, for as long as anyone cared to look.
 *
 * Implementing it means reading dependency manifests, which have no syntax tree
 * — so it is the one rule that does not walk an AST, and the one most able to
 * drown a real finding in ordinary practice. Both failure modes are pinned here:
 * a floating range is normal when a lockfile governs it, and a `"key": "value"`
 * pair means nothing until you know which block it is in.
 */

import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readManifest, manifestKind } from '../src/engine/manifests.js';
import { runManifestRules, RULES } from '../src/engine/rules.js';
import { localRule } from '../src/engine/catalog.js';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sirius-supply-'));
  // A repository boundary, so the lockfile search never escapes into the
  // developer's home directory and finds somebody else's lock.
  mkdirSync(join(dir, '.git'), { recursive: true });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

/** Writes a manifest and returns what the rule says about it. */
function check(name: string, body: string, at = dir) {
  mkdirSync(at, { recursive: true });
  writeFileSync(join(at, name), body, 'utf8');
  const manifest = readManifest(join(at, name));
  if (!manifest) throw new Error(`${name} was not recognised as a manifest`);
  return runManifestRules(manifest);
}

const PKG = (deps: Record<string, string>, scripts: Record<string, string> = {}) =>
  JSON.stringify({ name: 'app', version: '1.0.0', scripts, dependencies: deps }, null, 2);

describe('which files are manifests', () => {
  it('recognises the two ecosystems and nothing else', () => {
    expect(manifestKind('/a/package.json')).toBe('npm');
    expect(manifestKind('/a/requirements.txt')).toBe('pip');
    expect(manifestKind('/a/requirements-dev.txt')).toBe('pip');
    expect(manifestKind('/a/tsconfig.json')).toBeUndefined();
    expect(manifestKind('/a/notes.txt')).toBeUndefined();
    expect(manifestKind('/a/main.py')).toBeUndefined();
  });
});

describe('a floating version range', () => {
  it('is a finding when nothing pins it', () => {
    const found = check('package.json', PKG({ lodash: '^4.17.21', left: '*' }));
    expect(found).toHaveLength(2);
    expect(found.every((f) => f.severity === 'low')).toBe(true);
  });

  it('is ordinary practice when a lockfile governs it', () => {
    writeFileSync(join(dir, 'package-lock.json'), '{}', 'utf8');
    // Same manifest, opposite verdict — and the verdict is right both times.
    // `^4.17.21` under a lockfile resolves to one version with an integrity
    // hash; without one it resolves to whatever the registry serves that
    // morning. Flagging both would flag every caret in every repository.
    expect(check('package.json', PKG({ lodash: '^4.17.21', left: '*' }))).toEqual([]);
  });

  it('is governed by a lockfile at the workspace root, not just beside it', () => {
    // A pnpm or yarn workspace keeps one lockfile at the root and a
    // package.json per package. Looking only in the sibling directory calls
    // every package in every monorepo unlocked.
    writeFileSync(join(dir, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n', 'utf8');
    const pkg = join(dir, 'packages', 'api');
    expect(check('package.json', PKG({ lodash: '^4.17.21' }), pkg)).toEqual([]);
  });

  it('stops looking at the repository boundary', () => {
    // Above `.git` is somebody else's tree, and a lockfile up there governs
    // nothing here.
    const inner = join(dir, 'vendored');
    mkdirSync(inner, { recursive: true });
    mkdirSync(join(inner, '.git'), { recursive: true });
    writeFileSync(join(dir, 'package-lock.json'), '{}', 'utf8');
    expect(check('package.json', PKG({ lodash: '^4.17.21' }), inner)).toHaveLength(1);
  });

  it('accepts pip hashes as that ecosystem\'s lockfile', () => {
    // pip records integrity inline rather than in a separate file.
    const pinned = 'requests>=2.28 --hash=sha256:abc123\n';
    expect(check('requirements.txt', pinned)).toEqual([]);
  });
});

describe('a dependency from outside the registry', () => {
  it('is a finding whatever the lockfile says', () => {
    writeFileSync(join(dir, 'package-lock.json'), '{}', 'utf8');
    // A lockfile pins *which* commit, not who can change what is at the end of
    // that URL, and none of it went through the registry's checks.
    const found = check('package.json', PKG({ tools: 'git+https://github.com/acme/tools.git' }));
    expect(found).toHaveLength(1);
    expect(found[0]?.severity).toBe('high');
    expect(found[0]?.message).toContain('outside the registry');
  });

  it('catches the pip spellings: an editable install, a URL, and a wheel', () => {
    const found = check(
      'requirements.txt',
      [
        'stripe==7.1.0',
        '-e git+https://github.com/acme/ledger.git#egg=ledger',
        'https://cdn.acme.dev/risk-1.0.0-py3-none-any.whl',
      ].join('\n'),
    );
    expect(found).toHaveLength(2);
    // Named by the egg where the line gives one, so the message stays readable.
    expect(found[0]?.message).toContain('"ledger"');
  });
});

describe('an install-time script', () => {
  it('is a finding, because it runs with whatever credentials CI has', () => {
    const found = check('package.json', PKG({}, { postinstall: 'node ./setup.js', build: 'tsc' }));
    expect(found).toHaveLength(1);
    expect(found[0]?.message).toContain('postinstall');
  });

  it('does not flag the ordinary scripts beside it', () => {
    expect(check('package.json', PKG({}, { build: 'tsc', test: 'vitest', start: 'node .' }))).toEqual([]);
  });
});

describe('reading package.json as data rather than as lines', () => {
  it('does not mistake a bin entry for a dependency', () => {
    // This was a real false positive on this repository: `"sirius":
    // "./dist/cli.js"` under `bin` was reported as a dependency resolved
    // outside the registry. A key-value pair looks the same everywhere in a
    // JSON file, and only its position says what it means.
    const body = JSON.stringify(
      { name: 'sirius', bin: { sirius: './dist/cli.js' }, dependencies: { ink: '5.0.1' } },
      null,
      2,
    );
    expect(check('package.json', body)).toEqual([]);
  });

  it('says nothing about a manifest it cannot parse', () => {
    // A broken package.json is the build's problem, not a security finding, and
    // guessing at one from half a file is how a scanner loses trust.
    expect(check('package.json', '{ "dependencies": { "a": ')).toEqual([]);
  });

  it('points at a real line, so the finding can be acted on', () => {
    const found = check('package.json', PKG({ safe: '1.0.0', bad: 'file:../hack' }));
    expect(found).toHaveLength(1);
    const line = found[0]!.line;
    const source = PKG({ safe: '1.0.0', bad: 'file:../hack' }).split('\n');
    expect(source[line - 1]).toContain('"bad"');
  });
});

describe('how the rule describes itself', () => {
  it('says which manifests it reads, not which languages', () => {
    // It inherited the default python/javascript/typescript list, so
    // `sirius rules show SIR-SEC-060` claimed it applied to source files it
    // never opens.
    const rule = localRule('SIR-SEC-060', '0.0.0');
    expect(rule?.languages).toEqual(['package.json', 'requirements.txt']);
  });

  it('keeps every manifest rule in the category `rules show` checks', () => {
    // `rules show` prints "this rule is a compiled AST matcher … it runs
    // against the parsed syntax tree", which is true of twelve rules and false
    // of this one. It picks the wording by category, so a manifest rule filed
    // anywhere else would be described as something it is not.
    for (const rule of RULES) {
      if (rule.run) continue;
      expect(rule.category, `${rule.id} reads manifests but is not supplychain`).toBe('supplychain');
    }
  });

  it('is the only rule with no source pass', () => {
    // If this ever fails, the sentence above needs a better signal than
    // category — and so does anything else that assumes one manifest rule.
    expect(RULES.filter((rule) => !rule.run).map((rule) => rule.id)).toEqual(['SIR-SEC-060']);
  });
});
