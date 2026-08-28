/**
 * What a config file says when it is wrong.
 *
 * Two failures, both of which let a run proceed under settings nobody intended.
 *
 * A bad *value* produced an error message that was literally `[`. The hint was
 * `cause.message.split('\n')[0]`, and a Zod error's message is a pretty-printed
 * JSON array, so the first line is the opening bracket:
 *
 *     error: sirius.yaml has invalid settings
 *       [
 *
 * Every hand-written error in this CLI names the problem and the fix. This one
 * named a punctuation mark.
 *
 * A misspelled *key* said nothing at all. Zod objects are non-strict, so
 * `min_complaince_score: 80` parses cleanly and applies nothing — the config
 * looks stricter than the run actually is, which is the direction that matters
 * for a gate.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CliError } from '../src/api/errors.js';
import { loadConfig } from '../src/config/load.js';

let dir: string;
let warnings: string[];
let restore: typeof process.stderr.write;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sirius-config-'));
  warnings = [];
  restore = process.stderr.write.bind(process.stderr);
  process.stderr.write = ((chunk: string) => {
    warnings.push(String(chunk));
    return true;
  }) as typeof process.stderr.write;
});

afterEach(() => {
  process.stderr.write = restore;
  rmSync(dir, { recursive: true, force: true });
});

const writeConfig = (yaml: string) => writeFileSync(join(dir, 'sirius.yaml'), yaml, 'utf8');

describe('a value the schema rejects', () => {
  it('names the key and what was expected', () => {
    writeConfig('severity_threshold: catastrophic\n');

    try {
      loadConfig({ cwd: dir, overrides: {} });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(CliError);
      const hint = (error as CliError).hint ?? '';
      expect(hint).toContain('severity_threshold');
      expect(hint).toContain('critical');
      // The bug: the hint was the first line of a pretty-printed JSON array.
      expect(hint.trim()).not.toBe('[');
    }
  });

  it('reports several mistakes without burying the first', () => {
    writeConfig('severity_threshold: catastrophic\nfail_on: sometimes\n');

    try {
      loadConfig({ cwd: dir, overrides: {} });
      expect.unreachable('should have thrown');
    } catch (error) {
      const hint = (error as CliError).hint ?? '';
      expect(hint).toContain('severity_threshold');
      expect(hint).toContain('fail_on');
    }
  });
});

describe('a key the schema does not know', () => {
  it('says so rather than ignoring it in silence', () => {
    // A misspelled gate key means the gate does not exist, and the file still
    // reads as though it does.
    writeConfig('policy:\n  min_complaince_score: 80\n');
    loadConfig({ cwd: dir, overrides: {} });

    const said = warnings.join('');
    expect(said).toContain('not recognised');
    expect(said).toContain('policy.min_complaince_score');
  });

  it('catches a typo at the top level too', () => {
    writeConfig('severity_treshold: high\n');
    loadConfig({ cwd: dir, overrides: {} });
    expect(warnings.join('')).toContain('severity_treshold');
  });

  it('stays quiet when every key is real', () => {
    // A warning on a correct file would be noise on every command, and noise is
    // how a real warning stops being read.
    writeConfig('severity_threshold: high\npolicy:\n  min_compliance_score: 80\n  require_no_verified_secrets: true\n');
    loadConfig({ cwd: dir, overrides: {} });
    expect(warnings.join('')).not.toContain('not recognised');
  });

  it('does not warn about a file that sets nothing', () => {
    writeConfig('# nothing here yet\n');
    loadConfig({ cwd: dir, overrides: {} });
    expect(warnings.join('')).not.toContain('not recognised');
  });
});
