/**
 * The local daemon: `/api/v1` over loopback, served by the built-in engine.
 *
 * This is what makes the desktop app a client of something real. The GUI was
 * written against a mock that returned invented findings, invented scores and
 * invented money — which is a design prototype, not a security tool, and the
 * hackathon track disqualifies exactly that. The engine has been in this binary
 * since the CLI stopped being a pure client; the only thing missing was a way
 * for another process to ask it questions.
 *
 * It is deliberately not a general server. It binds to loopback, it mints a
 * token per run, and the set of directories it will touch is the set the user
 * has opened. A daemon that reads any path and runs any scan is a remote file
 * reader, and this one is started by double-clicking an app.
 */

import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';

import { WebSocketServer } from 'ws';
import type { WebSocket } from 'ws';

import {
  HANDLED,
  HttpError,
  Router,
  applyCors,
  mintToken,
  originAllowed,
  readJsonBody,
  sendJson,
  sendProblem,
  tokenFrom,
  tokenMatches,
} from './http.js';
import { registerScannerRoutes } from './routes.js';
import { registerGuardRoutes } from './routes-guard.js';
import { ScanRegistry } from './runner.js';
import { loadScan } from './scans.js';

const BASE = '/api/v1';

export interface ServeOptions {
  root: string;
  version: string;
  port: number;
  host: string;
  /** Supplied so a caller that already told the user the token can reuse it. */
  token?: string;
}

export interface RunningServer {
  url: string;
  wsUrl: string;
  token: string;
  close: () => Promise<void>;
}

export async function startServer(options: ServeOptions): Promise<RunningServer> {
  const token = options.token ?? mintToken();
  const scans = new ScanRegistry();
  const ctx = { root: options.root, version: options.version, scans };

  const router = new Router();
  registerScannerRoutes(router, ctx);
  registerGuardRoutes(router, ctx);

  const server = createServer((req, res) => {
    void handle(req, res).catch((error: unknown) => sendProblem(res, error));
  });

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    applyCors(req, res);

    if (req.method === 'OPTIONS') {
      res.writeHead(204).end();
      return;
    }

    const origin = req.headers.origin;
    if (origin && !originAllowed(origin)) {
      throw new HttpError(403, 'This daemon serves the local desktop app only.');
    }

    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const path = url.pathname.startsWith(BASE) ? url.pathname.slice(BASE.length) : url.pathname;

    // Health is reachable without the token, and says nothing a caller could
    // not learn by connecting. It exists so the app can tell "the daemon is not
    // running" from "the daemon rejected my token" — two very different things
    // to put in front of someone whose window is empty.
    const isHealth = path === '/healthz' || path === '/health';

    if (!isHealth && !tokenMatches(token, tokenFrom(req, url.searchParams))) {
      throw new HttpError(401, 'Missing or invalid API token.', 'SIRIUS_ERR_AUTH');
    }

    const matched = router.match(req.method ?? 'GET', path);
    if (matched === undefined) throw new HttpError(404, `No such endpoint: ${req.method} ${url.pathname}`);
    if (matched === 405) throw new HttpError(405, `${req.method} is not allowed on ${url.pathname}`);

    const body = req.method === 'POST' || req.method === 'PATCH' ? await readJsonBody(req) : undefined;

    const result = await matched.route.handler({
      params: matched.params,
      query: url.searchParams,
      body,
      req,
      res,
    });

    // A handler that wrote the response itself — a PDF download — has nothing
    // left to serialise, and writing a second time would throw after the client
    // already had the file.
    if (result === HANDLED) return;
    sendJson(res, 200, result ?? null);
  }

  // -------------------------------------------------------------- websocket

  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket: Duplex, head) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

    const reject = (code: number, reason: string): void => {
      // 4401 for auth, matching the contract's close code for the hosted
      // stream — the client already knows what that means and should not have
      // to learn a second convention for the local one.
      socket.write(`HTTP/1.1 ${code === 4401 ? 401 : 400} ${reason}\r\n\r\n`);
      socket.destroy();
    };

    if (!originAllowed(req.headers.origin)) return reject(403, 'Forbidden');
    if (!tokenMatches(token, tokenFrom(req, url.searchParams))) return reject(4401, 'Unauthorized');

    const path = url.pathname.startsWith(BASE) ? url.pathname.slice(BASE.length) : url.pathname;
    const scanId = /^\/scans\/([^/]+)\/stream$/.exec(path)?.[1];
    if (!scanId) return reject(404, 'Not Found');

    wss.handleUpgrade(req, socket, head, (ws) => streamScan(ws, decodeURIComponent(scanId)));
  });

  function streamScan(ws: WebSocket, scanId: string): void {
    const send = (frame: unknown): void => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(frame));
    };

    const running = scans.get(scanId);

    if (running) {
      // Subscribing replays every frame emitted so far before attaching. The
      // client does `POST /scans` and then opens this socket, and on a small
      // repo the engine can finish inside those two round trips — without the
      // replay the console renders empty and the spinner never resolves.
      const unsubscribe = running.subscribe(send);
      ws.on('close', unsubscribe);
      if (running.done) ws.close(1000, 'scan complete');
      else {
        const poll = setInterval(() => {
          if (!running.done) return;
          clearInterval(poll);
          if (ws.readyState === ws.OPEN) ws.close(1000, 'scan complete');
        }, 100);
        ws.on('close', () => clearInterval(poll));
      }
      return;
    }

    // Not in the registry: either a finished scan from an earlier run of the
    // daemon, or a scan the terminal produced. Both are on disk, and replaying
    // one is how the GUI shows a scan it did not start.
    const stored = loadScan(options.root, scanId);
    if (!stored) {
      ws.close(4404, 'no such scan');
      return;
    }

    send({ type: 'scan.started', scan_id: stored.id, files_total: stored.summary?.files_scanned ?? null });
    for (const finding of stored.findings) send({ type: 'finding', scan_id: stored.id, finding });
    send({
      type: 'scan.completed',
      scan_id: stored.id,
      status: stored.status,
      counts: stored.summary?.counts ?? {},
      money_at_risk_inr: stored.summary?.money_at_risk_inr ?? 0,
      compliance_score: stored.summary?.compliance_score ?? null,
      files_scanned: stored.summary?.files_scanned ?? null,
      exit_code: stored.exit_code,
    });
    ws.close(1000, 'replay complete');
  }

  await listen(server, options.port, options.host);

  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : options.port;
  const host = options.host === '::1' ? '[::1]' : options.host;

  return {
    url: `http://${host}:${port}${BASE}`,
    wsUrl: `ws://${host}:${port}${BASE}`,
    token,
    close: () =>
      new Promise<void>((resolveClose) => {
        wss.close();
        server.close(() => resolveClose());
        // Sockets the GUI is holding open keep `close` from ever calling back,
        // and a `serve` that will not exit on Ctrl-C is worse than one that
        // drops a stream mid-frame.
        for (const client of wss.clients) client.terminate();
      }),
  };
}

function listen(server: Server, port: number, host: string): Promise<void> {
  return new Promise((resolveListen, rejectListen) => {
    server.once('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        rejectListen(
          new Error(
            `Port ${port} is already in use — another \`sirius serve\` is probably still running.\n` +
              `  Stop it, or start this one on another port with --port.`,
          ),
        );
        return;
      }
      rejectListen(error);
    });
    server.listen(port, host, () => resolveListen());
  });
}
