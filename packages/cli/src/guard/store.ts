/**
 * Where a feed, its agents and its baselines live on disk.
 *
 * Same shape as the revenue store: a directory holding plain JSON a person can
 * open without this tool. Baselines are written back after a run, because the
 * loop only means anything if what an agent learned yesterday is still there
 * tomorrow — a control layer that forgets between runs judges every action as
 * though the agent were new, which is the same as having no behavioural stage.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { CliError } from '../api/errors.js';
import type { Agent, Baseline, ProposedAction } from './types.js';
import type { GeneratedFeed, Planted } from './synth.js';

export interface LoadedFeed {
  dir: string;
  agents: Agent[];
  actions: ProposedAction[];
  truth: Record<string, Planted>;
}

const AGENTS = 'agents.json';
const ACTIONS = 'actions.jsonl';
const TRUTH = 'truth.json';
const BASELINES = 'baselines';

export function writeFeed(dir: string, feed: GeneratedFeed): string {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, AGENTS), `${JSON.stringify(feed.agents, null, 2)}\n`, 'utf8');
  writeFileSync(
    join(dir, ACTIONS),
    feed.actions.map((a) => JSON.stringify(a)).join('\n') + '\n',
    'utf8',
  );
  writeFileSync(join(dir, TRUTH), `${JSON.stringify(feed.truth, null, 2)}\n`, 'utf8');
  return dir;
}

export function loadFeed(dir: string): LoadedFeed {
  const agentsPath = join(dir, AGENTS);
  const actionsPath = join(dir, ACTIONS);

  if (!existsSync(agentsPath) || !existsSync(actionsPath)) {
    throw new CliError(`No agent feed at ${dir}.`, {
      hint: 'Generate one:  sirius guard gen ' + dir,
    });
  }

  const agents = JSON.parse(readFileSync(agentsPath, 'utf8')) as Agent[];
  const actions = readFileSync(actionsPath, 'utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as ProposedAction);

  const truthPath = join(dir, TRUTH);
  const truth = existsSync(truthPath)
    ? (JSON.parse(readFileSync(truthPath, 'utf8')) as Record<string, Planted>)
    : {};

  return { dir, agents, actions, truth };
}

/** Baselines carried between runs, one file per agent. */
export function loadBaselines(dir: string): Record<string, Baseline> {
  const root = join(dir, BASELINES);
  if (!existsSync(root)) return {};

  const out: Record<string, Baseline> = {};
  for (const name of readdirSync(root)) {
    if (!name.endsWith('.json')) continue;
    try {
      const baseline = JSON.parse(readFileSync(join(root, name), 'utf8')) as Baseline;
      out[baseline.agent_id] = baseline;
    } catch {
      // A corrupt baseline is not an empty one. Skipping it silently would make
      // the agent look new and quietly widen what it is allowed to do, so it is
      // reported rather than swallowed.
      throw new CliError(`${join(root, name)} is not readable as a baseline.`, {
        hint: 'Move it aside — an unreadable baseline would make the agent look new.',
      });
    }
  }
  return out;
}

export function saveBaselines(dir: string, baselines: Record<string, Baseline>): string {
  const root = join(dir, BASELINES);
  mkdirSync(root, { recursive: true });
  for (const [agentId, baseline] of Object.entries(baselines)) {
    writeFileSync(join(root, `${agentId}.json`), `${JSON.stringify(baseline, null, 2)}\n`, 'utf8');
  }
  return root;
}
