#!/usr/bin/env bash
#
# Runs the demo the way it will actually be run: inside the interactive shell,
# in a real pty, typing slash commands. Prints the transcript so a human can
# read what the audience would see.
#
# The scan target is copied to a temp directory first, because `/fix` writes to
# disk and a rehearsal must never leave the fixtures modified.
#
# Usage: scripts/rehearse.sh [target-dir]
set -uo pipefail
set +m
cd "$(dirname "$0")/.."

SOURCE="${1:-contract/fixtures/chaos-repo}"
OUT="${REHEARSE_OUT:-$(mktemp)}"
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT

cp -R "$SOURCE"/. "$STAGE"/
# A repo of its own, so the git archaeology in the threat stage has history to
# read rather than silently finding nothing.
git -C "$STAGE" init -q 2>/dev/null
git -C "$STAGE" add -A 2>/dev/null
git -C "$STAGE" -c user.email=demo@example.com -c user.name=demo commit -qm "seed" 2>/dev/null

{
  sleep 4                       # banner + wordmark paint
  printf '/scan %s\r' "$STAGE"
  sleep 32                      # the scan, paced
  printf '/explain SIR-SEC-001\r'
  sleep 5
  printf '/fix SIR-SEC-001\r'
  sleep 6
  printf 'y\r'                  # accept the diff
  sleep 4
  printf '/exit\r'
  sleep 2
} | script -q /dev/null node packages/cli/dist/cli.js >"$OUT" 2>&1 &
RUNNER=$!

( sleep 120; kill -TERM $RUNNER 2>/dev/null ) &
WATCHDOG=$!
wait $RUNNER 2>/dev/null
kill $WATCHDOG 2>/dev/null
wait $WATCHDOG 2>/dev/null
pkill -f 'script -q /dev/null node packages/cli/dist/cli.js' 2>/dev/null

echo "transcript: $OUT"
echo "did the fix reach disk?"
grep -n "os.environ" "$STAGE/src/config.py" 2>/dev/null || echo "  (config.py unchanged)"
echo
cat "$OUT"
