#!/usr/bin/env bash
#
# Runs the demo the way it will actually be run: inside the interactive shell,
# in a real pty, typing slash commands. Prints the transcript so a human can
# read what the audience would see.
#
# Usage: scripts/rehearse.sh [target-dir]
set -uo pipefail
set +m
cd "$(dirname "$0")/.."

TARGET="${1:-contract/fixtures/chaos-repo}"
OUT="${REHEARSE_OUT:-$(mktemp)}"

{
  sleep 4                       # banner + wordmark paint
  printf '/scan %s\r' "$TARGET"
  sleep 32                      # the scan, paced
  printf '/explain SIR-SEC-001\r'
  sleep 6
  printf '/exit\r'
  sleep 2
} | script -q /dev/null node packages/cli/dist/cli.js >"$OUT" 2>&1 &
RUNNER=$!

( sleep 90; kill -TERM $RUNNER 2>/dev/null ) &
WATCHDOG=$!
wait $RUNNER 2>/dev/null
kill $WATCHDOG 2>/dev/null
wait $WATCHDOG 2>/dev/null
pkill -f 'script -q /dev/null node packages/cli/dist/cli.js' 2>/dev/null

echo "transcript: $OUT"
cat "$OUT"
