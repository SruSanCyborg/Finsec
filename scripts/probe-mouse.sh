#!/usr/bin/env bash
#
# Drives the real shell inside a real pty and performs a real click-drag.
#
# `script` allocates the pty, so the CLI takes the isTTY path and emits the
# actual mode-setting escapes. The component tests cover the selection logic;
# this covers the thing they cannot — that a terminal is really put into drag
# reporting, and really taken back out of it on exit.
set -uo pipefail
# No job-control chatter when the watchdog is killed.
set +m
cd "$(dirname "$0")/.."

OUT=$(mktemp)
trap 'rm -f "$OUT"' EXIT

ESC=$'\033'

{
  sleep 3                                  # let the shell paint
  printf '/help\r'; sleep 2

  printf '%s[<0;5;4M' "$ESC"; sleep 0.1    # press on a transcript row
  for row in 5 6 7; do
    printf '%s[<32;5;%s M' "$ESC" "$row" | tr -d ' '; sleep 0.1
  done
  printf '%s[<0;5;7m' "$ESC"; sleep 1      # release -> copy

  printf '%s[<64;5;10M' "$ESC"; sleep 0.5  # wheel must still scroll

  # `/exit`, not Ctrl-C: closing the pipe does not reach the child as EOF
  # because `script` keeps its side of the pty open, so the shell would wait
  # forever. The outer timeout is the backstop.
  printf '/exit\r'; sleep 2
} | script -q /dev/null node packages/cli/dist/cli.js >"$OUT" 2>&1 &
RUNNER=$!

# macOS has no coreutils `timeout`, so the backstop is a watchdog: if the shell
# ever fails to exit, the probe still reports instead of hanging a CI job.
( sleep 45; kill -TERM $RUNNER 2>/dev/null ) &
WATCHDOG=$!
wait $RUNNER 2>/dev/null
kill $WATCHDOG 2>/dev/null
wait $WATCHDOG 2>/dev/null
# `script` outlives the pipeline; make sure nothing is left holding the pty.
pkill -f 'script -q /dev/null node packages/cli/dist/cli.js' 2>/dev/null

say() { printf '  %-24s %s\n' "$1" "$2"; }
check() { grep -qF "$2" "$OUT" && say "$1" "yes" || say "$1" "NO"; }

echo
check "drag reporting on"   "[?1002h"
check "SGR mouse on"        "[?1006h"
check "drag reporting off"  "[?1002l"
check "alt screen restored" "[?1049l"

if grep -qE 'copied [0-9]+ lines?' "$OUT"; then
  say "drag copied" "$(grep -oE 'copied [0-9]+ lines?' "$OUT" | head -1)"
else
  say "drag copied" "NO"
fi

# The original bug: an unhandled sequence typed into the prompt as text.
if grep -qE '\[<[0-9]+;[0-9]+;[0-9]+[Mm]' "$OUT"; then
  say "gibberish in prompt" "YES - regression"
else
  say "gibberish in prompt" "none"
fi
echo
