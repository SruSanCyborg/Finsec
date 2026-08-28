/**
 * Config precedence.
 *
 * The PRD names four config files but never orders them, so the ordering is our
 * decision — which makes it exactly the kind of thing that drifts silently
 * unless it is pinned down by tests.
 */

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig, loadIgnorePatterns } from '../src/config/load.js';

let root: string;
const savedEnv = { ...process.env };

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'sirius-config-'));
  // Point XDG at an empty dir so the developer's own ~/.config/sirius does not
  // leak into the test run.
  process.env.XDG_CONFIG_HOME = join(root, '__xdg__');
  for (const key of Object.keys(process.env)) {
    if (key.startsWith('SIRIUS_')) delete process.env[key];
  }
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  process.env = { ...savedEnv };
});

function writeProject(contents: string) {
  writeFileSync(join(root, 'sirius.yaml'), contents, 'utf8');
}

describe('defaults', () => {
  it('falls back to built-in values when nothing is configured', () => {
    const config = loadConfig({ cwd: root });
    expect(config.severityThreshold).toBe('high');
    expect(config.failOn).toBe('all');
    expect(config.rulesets).toEqual(['p/fintech-core']);
    expect(config.validateSecrets).toBe(false);
  });
});

describe('precedence', () => {
  it('sirius.yaml beats the defaults', () => {
    writeProject('severity_threshold: critical\nproject_id: proj-from-yaml\n');
    const config = loadConfig({ cwd: root });
    expect(config.severityThreshold).toBe('critical');
    expect(config.projectId).toBe('proj-from-yaml');
  });

  it('.siriuslintrc beats sirius.yaml', () => {
    writeProject('severity_threshold: critical\nfail_on: all\n');
    writeFileSync(join(root, '.siriuslintrc'), 'severity_threshold: low\n', 'utf8');
    const config = loadConfig({ cwd: root });
    expect(config.severityThreshold).toBe('low');
    expect(config.failOn).toBe('all');
  });

  it('a nearer .siriuslintrc beats a farther one', () => {
    writeProject('severity_threshold: critical\n');
    writeFileSync(join(root, '.siriuslintrc'), 'severity_threshold: medium\n', 'utf8');
    const nested = join(root, 'services', 'payments');
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(nested, '.siriuslintrc'), 'severity_threshold: low\n', 'utf8');

    expect(loadConfig({ cwd: nested }).severityThreshold).toBe('low');
    expect(loadConfig({ cwd: root }).severityThreshold).toBe('medium');
  });

  it('environment beats every file', () => {
    writeProject('project_id: from-yaml\n');
    process.env.SIRIUS_PROJECT_ID = 'from-env';
    expect(loadConfig({ cwd: root }).projectId).toBe('from-env');
  });

  it('flags beat the environment', () => {
    writeProject('project_id: from-yaml\n');
    process.env.SIRIUS_PROJECT_ID = 'from-env';
    const config = loadConfig({ cwd: root, overrides: { projectId: 'from-flag' } });
    expect(config.projectId).toBe('from-flag');
  });

  it('records where each value came from', () => {
    process.env.SIRIUS_API_URL = 'http://localhost:4010';
    const config = loadConfig({ cwd: root });
    expect(config.apiUrl).toBe('http://localhost:4010');
    expect(config.sources.apiUrl).toBe('environment');
  });
});

describe('project discovery', () => {
  it('finds sirius.yaml by walking up from a nested directory', () => {
    writeProject('project_id: walked-up\n');
    const nested = join(root, 'a', 'b', 'c');
    mkdirSync(nested, { recursive: true });
    expect(loadConfig({ cwd: nested }).projectId).toBe('walked-up');
  });
});

describe('validation', () => {
  it('rejects an unknown severity rather than passing it to the API', () => {
    writeProject('severity_threshold: catastrophic\n');
    expect(() => loadConfig({ cwd: root })).toThrow(/invalid settings/i);
  });

  it('reports malformed YAML with the file path', () => {
    writeProject('severity_threshold: [unclosed\n');
    expect(() => loadConfig({ cwd: root })).toThrow(/sirius\.yaml/);
  });

  it('errors when an explicitly named config file is missing', () => {
    expect(() => loadConfig({ cwd: root, overrides: { configFile: join(root, 'nope.yaml') } })).toThrow(
      /not found/i,
    );
  });
});

describe('.siriusignore', () => {
  it('reads glob patterns, dropping blanks and comments', () => {
    writeFileSync(join(root, '.siriusignore'), '# comment\n\nvendor/**\n*.min.js\n', 'utf8');
    expect(loadIgnorePatterns(root)).toEqual(['vendor/**', '*.min.js']);
  });

  it('returns nothing when the file is absent', () => {
    expect(loadIgnorePatterns(root)).toEqual([]);
  });
});
