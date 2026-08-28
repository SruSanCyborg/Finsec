/**
 * Reading and writing a batch.
 *
 * A batch is a directory of three files, and the separation between two of them
 * is the whole design:
 *
 *   records.jsonl   what the detector is allowed to see
 *   truth.jsonl     the labels, which it is not
 *   manifest.json   seed, counts, split rule, injected incidents
 *
 * Anything that scores records loads `records.jsonl` only. Anything that
 * measures loads both. That is enforced by the shape of the functions here
 * rather than by anybody remembering, because "we were careful not to peek" is
 * not a property you can check a month later.
 *
 * JSONL rather than JSON: a batch is a stream of records, it should be
 * greppable, and a 50,000-row array in one line is not a file anyone can debug.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import type { BatchManifest, GeneratedBatch } from './synth.js';
import type { GroundTruth, RiskRecord } from './types.js';

const RECORDS = 'records.jsonl';
const TRUTH = 'truth.jsonl';
const MANIFEST = 'manifest.json';

export interface LoadedBatch {
  dir: string;
  manifest: BatchManifest;
  records: RiskRecord[];
}

export function writeBatch(dir: string, batch: GeneratedBatch): string {
  const target = resolve(dir);
  mkdirSync(target, { recursive: true });

  writeFileSync(
    join(target, RECORDS),
    batch.records.map((record) => JSON.stringify(record)).join('\n') + '\n',
    'utf8',
  );

  writeFileSync(
    join(target, TRUTH),
    [...batch.truth.entries()]
      .map(([id, truth]) => JSON.stringify({ id, ...truth }))
      .join('\n') + '\n',
    'utf8',
  );

  writeFileSync(join(target, MANIFEST), JSON.stringify(batch.manifest, null, 2) + '\n', 'utf8');
  return target;
}

/** Loads the records and the manifest. Never the labels — see the header. */
export function loadBatch(dir: string): LoadedBatch {
  const target = resolve(dir);
  const recordsPath = join(target, RECORDS);
  if (!existsSync(recordsPath)) {
    throw new Error(`No batch at ${dir} — ${RECORDS} is missing.`);
  }

  const records = readLines(recordsPath).map((line) => JSON.parse(line) as RiskRecord);

  const manifestPath = join(target, MANIFEST);
  const manifest = existsSync(manifestPath)
    ? (JSON.parse(readFileSync(manifestPath, 'utf8')) as BatchManifest)
    : ({
        schema: 'sirius.batch/v1',
        seed: 'unknown',
        generated_at: '',
        as_of: '',
        counts: { payments: 0, checkouts: 0, invoices: 0 },
        split_rule: 'unknown',
        incidents: [],
      } satisfies BatchManifest);

  return { dir: target, manifest, records };
}

/**
 * Loads the labels, separately and explicitly.
 *
 * Called by `eval` and by the recovery simulator, which needs an outcome to
 * simulate. Nothing that produces a score may call it.
 */
export function loadTruth(dir: string): Map<string, GroundTruth> {
  const path = join(resolve(dir), TRUTH);
  if (!existsSync(path)) {
    throw new Error(
      `No labels at ${dir} — ${TRUTH} is missing, so nothing here can be scored against anything.`,
    );
  }

  const truth = new Map<string, GroundTruth>();
  for (const line of readLines(path)) {
    const { id, ...rest } = JSON.parse(line) as GroundTruth & { id: string };
    truth.set(id, rest);
  }
  return truth;
}

export function hasTruth(dir: string): boolean {
  return existsSync(join(resolve(dir), TRUTH));
}

function readLines(path: string): string[] {
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0);
}
