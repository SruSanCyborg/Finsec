/**
 * Error types and the RFC-7807 mapping.
 *
 * Everything that goes wrong funnels through `CliError`, which carries the exit
 * code it should produce. Findings are not errors — a scan that completes and
 * finds problems exits 1 through the gate, never through here.
 */

import { ExitCode } from '../domain.js';
import type { ExitCodeValue, Problem } from '../domain.js';

export class CliError extends Error {
  readonly exitCode: ExitCodeValue;
  /** The `SIRIUS_ERR_*` code, when the server supplied one. */
  readonly code: string | undefined;
  /** Actionable next step shown under the message. */
  readonly hint: string | undefined;
  readonly cause: unknown;

  constructor(
    message: string,
    options: {
      exitCode?: ExitCodeValue;
      code?: string | undefined;
      hint?: string | undefined;
      cause?: unknown;
    } = {},
  ) {
    super(message);
    this.name = 'CliError';
    this.exitCode = options.exitCode ?? ExitCode.CLI_ERROR;
    this.code = options.code;
    this.hint = options.hint;
    this.cause = options.cause;
  }
}

/** No scannable target — an empty directory, or a path that does not exist. */
export class NoTargetError extends CliError {
  constructor(message: string, hint?: string) {
    super(message, { exitCode: ExitCode.NO_TARGET, hint });
    this.name = 'NoTargetError';
  }
}

function isProblem(body: unknown): body is Problem {
  return typeof body === 'object' && body !== null && 'title' in body;
}

/**
 * Turn a failed HTTP response into a `CliError`, preferring the server's
 * RFC-7807 problem detail over a bare status line.
 */
export function problemToError(status: number, body: unknown, url: string): CliError {
  const problem = isProblem(body) ? body : undefined;
  const detail = problem?.detail?.trim();
  const title = problem?.title?.trim();

  const message =
    detail && title && detail !== title
      ? `${title}: ${detail}`
      : (detail ?? title ?? `Request failed with HTTP ${status}`);

  return new CliError(message, {
    code: problem?.code,
    hint: hintForStatus(status, problem?.code),
    cause: { status, url, body },
  });
}

function hintForStatus(status: number, code?: string): string | undefined {
  if (code === 'SIRIUS_ERR_RULE_SCHEMA') return 'Run `sirius rules validate <file>` to see the schema errors.';
  switch (status) {
    case 401:
      return 'Check your API key — run `sirius login`, or set SIRIUS_API_KEY.';
    case 403:
      return 'That key is valid but lacks permission for this project.';
    case 404:
      return 'Check the scan or project id.';
    case 409:
      return 'The scan may still be running, or a fix was already applied.';
    case 429:
      return 'Rate limited. Secret validation is throttled by design — retry shortly.';
    case 503:
      return 'The API is unavailable. Retry, or use --replay for an offline run.';
    default:
      return undefined;
  }
}

/** Network-level failures, which are never the user's fault to diagnose alone. */
export function networkError(url: string, cause: unknown): CliError {
  const reason = cause instanceof Error ? cause.message : String(cause);
  return new CliError(`Cannot reach the sirius API at ${url} (${reason})`, {
    hint: 'Check SIRIUS_API_URL, or run `pnpm mock` to start the local mock backend.',
    cause,
  });
}
