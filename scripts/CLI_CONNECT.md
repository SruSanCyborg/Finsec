# Connecting the real `sirius` CLI to the backend

The CLI lives on the `CLI` branch (checked out in `cli-worktree/`). It is a pure
REST+WS client: point it at the backend and its hosted scans run the backend's
engine and land in Neon, where the web console sees them.

## One-time setup

```bash
# build the CLI (Node ≥ 22)
cd cli-worktree
pnpm install
pnpm --filter sirius build
```

## Point the CLI at the backend

Set these env vars (or pass `--api-url`):

```bash
export SIRIUS_API_URL=http://127.0.0.1:8000/api/v1   # REST base (includes /api/v1)
export SIRIUS_WS_URL=ws://127.0.0.1:8000             # WS origin (NO /api/v1 — the CLI appends it)
export SIRIUS_API_KEY=demo-key
export SIRIUS_PROJECT_ID=11111111-1111-4111-8111-111111111111
```

> **The WS URL must be the origin** (`ws://host:8000`), not `/api/v1` — the CLI's
> stream module appends `/api/v1/scans/{id}/stream` itself. With both set, the
> CLI streams live findings over the WebSocket and falls back to polling.

## Verify the connection

```bash
node packages/cli/dist/cli.js doctor \
  --api-url http://127.0.0.1:8000/api/v1 \
  --ws-url ws://127.0.0.1:8000
# ok  scan mode        hosted · http://127.0.0.1:8000/api/v1
# ok  api reachable    ok
# ok  stream reachable ws://127.0.0.1:8000
# Ready to scan against the API.
```

## Run a hosted scan → Neon → web

```bash
node packages/cli/dist/cli.js scan ../sample-repo \
  --api-url http://127.0.0.1:8000/api/v1 \
  --ws-url ws://127.0.0.1:8000
```

The backend's worker scans the repo, streams findings over WS, stores them in
Neon. The web console (scans page) picks it up live via the same API + the
global `/api/v1/events` WebSocket.

## Windows note

`cmd` doesn't propagate `set VAR=...` to child processes the way bash exports
do — the CLI reads env vars at process start, so set them in the same shell
invocation (as above) or use `--api-url` explicitly.
