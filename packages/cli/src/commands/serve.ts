/**
 * `sirius serve` — run the engine as a local API for the desktop app.
 *
 * The one command whose output is meant to be read by another program. It prints
 * the URL and the token, and then stays up until it is stopped.
 *
 * `--print-config` exists for the desktop app's launcher: it emits a single JSON
 * line on stdout as soon as the port is bound, so a parent process can wait for
 * that line instead of sleeping for a second and hoping. Guessing at readiness
 * is how a window opens against a daemon that is not listening yet and shows an
 * empty project list that never fills in.
 */

import { CliError } from '../api/errors.js';

/** The root command's options, passed down by every command. */
interface GlobalFlags {
  apiUrl?: string;
  project?: string;
  profile?: string;
}

export interface ServeFlags {
  port?: number;
  host?: string;
  token?: string;
  root?: string;
  printConfig?: boolean;
}

const DEFAULT_PORT = 4020;

export async function runServe(flags: ServeFlags, _globals: GlobalFlags): Promise<void> {
  const { resolve } = await import('node:path');
  const { existsSync, statSync } = await import('node:fs');

  const requested = resolve(process.cwd(), flags.root ?? '.');
  if (!existsSync(requested) || !statSync(requested).isDirectory()) {
    throw new CliError(`Not a directory: ${requested}`, {
      hint: 'Point --root at the project you want the desktop app to open.',
    });
  }

  /**
   * The directory asked for, and not the project root above it.
   *
   * Walking up to the nearest `sirius.yaml` seemed right — that is where
   * `.sirius/` belongs — but it meant `--root contract/fixtures/chaos-repo`
   * served the whole repository, because the fixture sits inside a project that
   * has its own config at the top. The daemon would then scan somewhere the
   * user never named and report figures for it. `sirius scan <dir>` already
   * writes its cache inside the target for the same reason; this follows it.
   */
  const root = requested;

  /**
   * Loopback, and no option to change it.
   *
   * `--host 0.0.0.0` is one flag away from publishing a filesystem reader and a
   * source-code editor to the network, and the only client is a window on this
   * machine. Anyone who genuinely needs it across a network can put their own
   * proxy in front and make that decision explicitly.
   */
  const host = '127.0.0.1';

  const { startServer } = await import('../server/index.js');
  const { VERSION } = await import('../branding.js');

  const server = await startServer({
    root,
    version: VERSION,
    port: flags.port ?? DEFAULT_PORT,
    host,
    ...(flags.token ? { token: flags.token } : {}),
  });

  if (flags.printConfig) {
    // One line, terminated, flushed. The launcher reads until the newline.
    process.stdout.write(
      JSON.stringify({ url: server.url, ws_url: server.wsUrl, token: server.token, root, version: VERSION }) + '\n',
    );
  } else {
    process.stdout.write(
      `\n  sirius serve · ${VERSION}\n\n` +
        `  API    ${server.url}\n` +
        `  token  ${server.token}\n` +
        `  root   ${root}\n\n` +
        `  The desktop app reads these from SIRIUS_API_URL and SIRIUS_API_TOKEN:\n\n` +
        `    export SIRIUS_API_URL=${server.url}\n` +
        `    export SIRIUS_API_TOKEN=${server.token}\n\n` +
        `  Scans run here are written to .sirius/ in the project, so \`sirius fix\`,\n` +
        `  \`sirius report\` and \`sirius triage\` in a shell act on what the window shows.\n\n` +
        `  Ctrl-C to stop.\n\n`,
    );
  }

  await untilStopped(server.close);
}

/**
 * Blocks until the process is asked to stop, then shuts the server down.
 *
 * Without the explicit handler, Ctrl-C kills the process while the GUI still
 * holds a WebSocket, and the port stays bound long enough that starting the
 * daemon again reports `EADDRINUSE` — which reads as a broken tool rather than
 * as a socket that had not finished closing.
 */
function untilStopped(close: () => Promise<void>): Promise<void> {
  return new Promise<void>((resolveStop) => {
    let stopping = false;

    const stop = (): void => {
      if (stopping) return;
      stopping = true;
      process.stdout.write('\n  stopping…\n');
      void close().then(() => resolveStop());
    };

    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
    // The desktop app is the parent process. When it quits, its pipes close,
    // and a daemon that outlives the window it was started for is a stray
    // process holding a port on someone else's machine.
    process.stdin.on('end', stop);
    process.stdin.on('close', stop);
  });
}
