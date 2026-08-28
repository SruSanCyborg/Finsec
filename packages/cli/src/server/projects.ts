/**
 * The list of directories the daemon will serve.
 *
 * The CLI has never had a concept of a project: it scans the directory you are
 * standing in, and `sirius.yaml` marks the root. The GUI has a project switcher,
 * which needs a list — so a project here is exactly one thing, a directory on
 * this machine, and the list is the directories someone has opened in the GUI.
 *
 * Kept beside `config.toml` rather than in `.sirius/`, because it is a fact
 * about this user's window, not about any of the projects in it. Registering a
 * project must not write a file into a repository the user did not ask to
 * modify.
 */

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';

import { findProjectRoot } from '../config/load.js';
import { HttpError } from './http.js';

export interface ProjectRecord {
  id: string;
  name: string;
  /** Absolute path on this machine. The identity of the project. */
  path: string;
  added_at: string;
}

function projectsPath(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  return xdg ? join(xdg, 'sirius', 'projects.json') : join(homedir(), '.config', 'sirius', 'projects.json');
}

/**
 * A stable id derived from the path.
 *
 * Not a UUID: the GUI stores the selected project id and reopens it next
 * launch, and a fresh id per run would lose that selection every time. The path
 * is already the identity, so the id may as well be a function of it.
 */
function idFor(path: string): string {
  let hash = 0;
  for (let i = 0; i < path.length; i += 1) hash = (Math.imul(31, hash) + path.charCodeAt(i)) | 0;
  return `proj-${(hash >>> 0).toString(36)}`;
}

function read(): ProjectRecord[] {
  const file = projectsPath();
  if (!existsSync(file)) return [];
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as { projects?: ProjectRecord[] };
    return Array.isArray(parsed.projects) ? parsed.projects : [];
  } catch {
    return [];
  }
}

function write(projects: ProjectRecord[]): void {
  const file = projectsPath();
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ projects }, null, 2) + '\n', 'utf8');
}

/**
 * Every known project, with the daemon's own root guaranteed to be among them
 * and first.
 *
 * The root is always present because the daemon is serving it: a GUI that
 * connects and shows an empty project list has nothing to offer, and the one
 * directory it certainly can scan is the one the user started the daemon in.
 */
export function listProjects(root: string): ProjectRecord[] {
  const rootRecord = register(root);
  return [rootRecord, ...read().filter((p) => p.path !== rootRecord.path)];
}

export function register(path: string): ProjectRecord {
  const absolute = resolve(path);

  if (!existsSync(absolute) || !statSync(absolute).isDirectory()) {
    throw new HttpError(400, `Not a directory on this machine: ${absolute}`, 'SIRIUS_ERR_NO_TARGET');
  }

  const existing = read();
  const found = existing.find((p) => p.path === absolute);
  if (found) return found;

  const record: ProjectRecord = {
    id: idFor(absolute),
    name: basename(absolute) || absolute,
    path: absolute,
    added_at: new Date().toISOString(),
  };
  write([...existing, record]);
  return record;
}

export function findProject(root: string, id: string): ProjectRecord | undefined {
  return listProjects(root).find((p) => p.id === id);
}

/**
 * Where a project's state lives, which is not always the project itself.
 *
 * `.sirius/` holds the baseline, the suppressions and the triage decisions —
 * facts about a codebase, not about a subdirectory of it — so the CLI writes it
 * at the nearest `sirius.yaml` and reads it from there. The daemon has to agree,
 * or the two surfaces keep separate baselines and each shows findings the other
 * has already accepted. That is the failure the golden rule was written to
 * prevent, arriving through the back door.
 *
 * The distinction matters most for the demo fixture: `contract/fixtures/chaos-repo`
 * is what gets scanned, and the state for it belongs to the repository above it.
 */
export function storeRoot(dir: string): string {
  return findProjectRoot(dir)?.dir ?? dir;
}

export interface ResolvedProject {
  /** The directory to scan. */
  dir: string;
  /** The directory `.sirius/` lives in. At or above `dir`. */
  store: string;
}

/**
 * The project a request is about.
 *
 * Requests name a project by id, never by path. A daemon that scanned whatever
 * absolute path arrived in a request body would be a remote file reader for
 * anything that got hold of the token — this is the function that makes the set
 * of reachable directories exactly the set the user has opened.
 */
export function rootFor(root: string, projectId: string | null | undefined): ResolvedProject {
  if (!projectId) return { dir: root, store: storeRoot(root) };
  const project = findProject(root, projectId);
  if (!project) throw new HttpError(404, `No such project: ${projectId}`);
  return { dir: project.path, store: storeRoot(project.path) };
}
