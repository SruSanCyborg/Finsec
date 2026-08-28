/**
 * A very small router over `node:http`.
 *
 * There is no framework here on purpose. This serves one client on the loopback
 * interface, and the alternative was adding an HTTP framework to a CLI whose
 * whole pitch is that it runs with nothing installed and no backend. Twenty
 * routes and one path-parameter matcher is less code than the adapter would be.
 */

import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

export type Handler = (ctx: RequestContext) => Promise<unknown> | unknown;

export interface RequestContext {
  params: Record<string, string>;
  query: URLSearchParams;
  body: unknown;
  req: IncomingMessage;
  res: ServerResponse;
}

interface Route {
  method: string;
  segments: string[];
  handler: Handler;
}

/**
 * Thrown by a handler to answer with a status other than 200.
 *
 * Modelled on the Problem shape the contract already uses, so an error from the
 * local daemon and an error from a hosted Core read identically to the client.
 */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

/** Returned by a handler that has written the response itself (a file download). */
export const HANDLED = Symbol('handled');

export class Router {
  private readonly routes: Route[] = [];

  add(method: string, pattern: string, handler: Handler): this {
    this.routes.push({ method, segments: pattern.split('/').filter(Boolean), handler });
    return this;
  }

  get = (pattern: string, handler: Handler) => this.add('GET', pattern, handler);
  post = (pattern: string, handler: Handler) => this.add('POST', pattern, handler);
  patch = (pattern: string, handler: Handler) => this.add('PATCH', pattern, handler);
  delete = (pattern: string, handler: Handler) => this.add('DELETE', pattern, handler);

  /**
   * The first route whose shape matches, with its path parameters extracted.
   *
   * Returns a `405` marker rather than a miss when the path matches but the verb
   * does not, because "no such route" and "wrong method" are different bugs and
   * a client that gets 404 for the second one goes looking in the wrong place.
   */
  match(method: string, path: string): { route: Route; params: Record<string, string> } | 405 | undefined {
    const parts = path.split('/').filter(Boolean);
    let pathMatched = false;

    for (const route of this.routes) {
      if (route.segments.length !== parts.length) continue;

      const params: Record<string, string> = {};
      let ok = true;
      for (const [i, segment] of route.segments.entries()) {
        const part = parts[i] as string;
        if (segment.startsWith(':')) {
          params[segment.slice(1)] = decodeURIComponent(part);
          continue;
        }
        if (segment !== part) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;

      pathMatched = true;
      if (route.method === method) return { route, params };
    }

    return pathMatched ? 405 : undefined;
  }
}

/**
 * A bearer token, minted per run and printed once.
 *
 * This daemon reads any file the user can read, and `POST .../fix` writes to
 * source files. On a shared or multi-user machine every other local process can
 * reach a loopback port, so "it is only bound to 127.0.0.1" is not on its own an
 * access control. The token is what stops a page open in a browser from driving
 * a scan of the user's home directory and reading the results back.
 */
export function mintToken(): string {
  return randomUUID().replace(/-/g, '');
}

/**
 * Constant-time-ish comparison.
 *
 * The tokens are fixed-length hex from `randomUUID`, so a length check leaks
 * nothing, and the loop below does not exit early on the first differing byte.
 * Not a defence against a determined local attacker who can already time the
 * process — but comparing with `===` in an auth path is the kind of thing that
 * gets copied into somewhere it does matter.
 */
export function tokenMatches(expected: string, supplied: string | undefined): boolean {
  if (!supplied || supplied.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) diff |= expected.charCodeAt(i) ^ supplied.charCodeAt(i);
  return diff === 0;
}

/** The bearer token on a request, from the header or the `?token=` fallback. */
export function tokenFrom(req: IncomingMessage, query?: URLSearchParams): string | undefined {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice('Bearer '.length).trim();
  // Browsers cannot set headers on a WebSocket upgrade. Same fallback the
  // contract already specifies for the hosted stream (D-004).
  return query?.get('token') ?? undefined;
}

/**
 * Which origins may call this.
 *
 * The Vite dev server, the Tauri webview, and nothing else. A wildcard would
 * mean any page the user has open could talk to the daemon; the token would
 * still stop it reading anything, but there is no reason to accept the request
 * at all.
 */
export function originAllowed(origin: string | undefined): boolean {
  if (!origin) return true; // curl, the CLI itself, and same-origin requests.
  if (origin === 'null') return true; // A file:// page in the packaged webview.
  try {
    const url = new URL(origin);
    if (url.protocol === 'tauri:' || url.protocol === 'asset:') return true;
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
  } catch {
    return false;
  }
}

export function applyCors(req: IncomingMessage, res: ServerResponse): void {
  const origin = req.headers.origin;
  if (origin && originAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Max-Age', '600');
}

export function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    // The daemon answers from disk and the engine, never from a cache, and a
    // webview that caches `GET /scans` shows a history that stops updating.
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

export function sendProblem(res: ServerResponse, error: unknown): void {
  const status = error instanceof HttpError ? error.status : 500;
  const detail = error instanceof Error ? error.message : String(error);
  const code = error instanceof HttpError ? error.code : undefined;
  sendJson(res, status, {
    type: 'about:blank',
    title: status === 500 ? 'Internal error' : detail,
    status,
    detail,
    ...(code ? { code } : {}),
  });
}

/**
 * Reads and parses a JSON request body.
 *
 * Capped, because this is a local daemon with no proxy in front of it to do the
 * capping for it, and an unbounded read is a way to make the process that holds
 * the user's scan results run out of memory.
 */
export async function readJsonBody(req: IncomingMessage, limit = 1_000_000): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of req) {
    const buf = chunk as Buffer;
    size += buf.length;
    if (size > limit) throw new HttpError(413, 'Request body too large.');
    chunks.push(buf);
  }

  if (size === 0) return undefined;

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'Request body is not valid JSON.');
  }
}
