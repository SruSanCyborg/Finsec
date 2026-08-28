#!/usr/bin/env bash
#
# Drives every slash command through the interactive shell in a real pty and
# checks each one produced what it should.
#
# Separate from the two rehearsals, which are about demo beats and their timing.
# This is about coverage: a command can exist in the CLI, be listed in the
# palette, and still fail the moment the shell dispatches it — a wrong argument
# order, a flag the shell strips, a subcommand nobody wired. Every one of those
# has happened here at least once.
#
# Usage: scripts/shell-check.sh
set -uo pipefail
set +m
cd "$(dirname "$0")/.."

CLI="$PWD/packages/cli/dist/cli.js"
[ -f "$CLI" ] || { echo "build first: pnpm --filter sirius build"; exit 2; }

OUT="${SHELL_CHECK_OUT:-$(mktemp)}"
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT

# Small fixtures: this checks that commands run, not that they are fast.
cp -R contract/fixtures/chaos-repo/. "$STAGE"/
git -C "$STAGE" init -q 2>/dev/null
git -C "$STAGE" add -A 2>/dev/null
git -C "$STAGE" -c user.email=demo@example.com -c user.name=demo commit -qm seed 2>/dev/null

node "$CLI" revenue gen "$STAGE/batch" --seed check --payments 220 --checkouts 60 --invoices 40 >/dev/null 2>&1
node "$CLI" reconcile "$STAGE/books" --gen --seed check --orders 90 >/dev/null 2>&1
node "$CLI" guard gen "$STAGE/guardfeed" --seed check --actions 120 >/dev/null 2>&1

# A record id and a trail to point the explain/audit checks at.
RECORD=$(cd "$STAGE" && node "$CLI" revenue detect batch --limit 1 2>/dev/null | grep -oE '(inv|pay|chk)_[0-9]+' | head -1)
(cd "$STAGE" && SIRIUS_REVENUE_PACE=0 node "$CLI" revenue recover batch >/dev/null 2>&1)
TRAIL=$(cd "$STAGE" && ls batch/recovery-*.json 2>/dev/null | head -1)

echo "staged in $STAGE — record $RECORD, trail $TRAIL"
echo

# Pacing stays ON, at a low setting.
#
# Turning it off made twelve of these look like failures. The shell repaints a
# viewport; output that arrives faster than a repaint scrolls past and is never
# painted at all, so it never reaches this transcript — which is exactly the
# defect pacing exists to prevent, and exactly what a person would see. A
# coverage check that disables the mechanism under test is checking nothing.
#
# For the same reason every marker below is drawn from the *tail* of a
# command's output. The last screenful is what survives on screen; the banner
# at the top of a fifty-line report does not.
{
  sleep 4
  for cmd in \
    "/doctor" \
    "/scan . --json" \
    "/rules list --ruleset p/secrets" \
    "/rules show SIR-SEC-001" \
    "/explain SIR-SEC-001" \
    "/baseline show" \
    "/report --format json" \
    "/badge" \
    "/revenue detect batch --limit 3" \
    "/revenue detect batch --kind payment --limit 3" \
    "/revenue eval batch" \
    "/revenue explain $RECORD" \
    "/revenue recover batch --limit 5" \
    "/revenue sweep --seeds 2 --payments 150 --checkouts 40 --invoices 30" \
    "/revenue stress --seeds 1 --payments 150 --checkouts 40 --invoices 30" \
    "/revenue audit --verify $TRAIL" \
    "/brief --plain" \
    "/guard agents guardfeed" \
    "/guard eval guardfeed --limit 6" \
    "/guard score guardfeed" \
    "/reconcile books" \
    "/reconcile books --exceptions"
  do
    printf '%s\r' "$cmd"
    sleep 5
  done

  # The two that take the whole terminal, last, each with the key that quits it.
  # A handover that failed would leave the shell unusable, so anything after
  # these would fail too — which is why they run at the end.
  # `/triage` is inline now: a panel above the prompt, answered with one key.
  # No handover, so no unmount and nothing to come back from.
  printf '/triage\r'; sleep 5
  printf 'a';          sleep 3
  printf 'q';          sleep 3
  printf '/watch .\r'; sleep 6
  printf '\003';       sleep 5
  printf '/rules list\r'; sleep 4
  printf '/exit\r'
  sleep 2
} | (cd "$STAGE" && SIRIUS_REVENUE_PACE=12 SIRIUS_SCAN_PACE=40 script -q /dev/null node "$CLI") >"$OUT" 2>&1 &
RUNNER=$!

( sleep 240; pkill -f "script -q /dev/null node $CLI" 2>/dev/null ) &
WATCHDOG=$!
wait $RUNNER 2>/dev/null
kill $WATCHDOG 2>/dev/null
wait $WATCHDOG 2>/dev/null

# Stripped to a file and grepped from the file: `sed | grep -q` under pipefail
# fails on a *successful* match, because grep exits first and sed takes SIGPIPE.
PLAIN="$STAGE/transcript.txt"
sed 's/\x1b\[[0-9;]*[a-zA-Z]//g' "$OUT" >"$PLAIN"

fails=0
# Markers are matched as extended regexes, so runs of whitespace can be written
# as `[[:space:]]+` rather than as a literal count of spaces. A marker that
# spelled the gap between two columns as exactly two spaces went stale the day
# the column widened to three, and then reported the feature broken for months
# while the feature worked — the check failing, not the thing checked.
check() {
  if grep -Eq "$2" "$PLAIN"; then
    printf '  ok    %s\n' "$1"
  else
    printf '  FAIL  %s   (no "%s" in the transcript)\n' "$1" "$2"
    fails=$((fails + 1))
  fi
}

echo "every slash command, dispatched by the shell:"
echo "(markers are from the tail of each command — the top of a long report scrolls past)"
check "/doctor"                  "Ready to scan locally"
check "/scan --json"             '"exit_code"'
check "/rules list --ruleset"    "rules · local engine"
check "/rules show"              "compiled AST matcher"
check "/explain"                 "order-of-magnitude estimate"
check "/baseline show"           "baseline"
check "/report --format json"    "Verify with"
check "/badge"                   "badge.svg"
check "/revenue detect"          "Expected recovery is a forecast"
check "/revenue detect --kind"   "showing payments"
check "/revenue eval"            "the operating threshold"
check "/revenue explain"         "WHAT ACTUALLY HAPPENS"
check "/revenue recover"         "hash-chained and signed"
check "/revenue stress"           "touched nothing out of bounds in any of them"
check "/revenue sweep"           "beat every capacity-matched heuristic"
check "/revenue audit --verify"  "chained and unbroken"
check "/brief"                   "Written to PDF with"
check "/guard agents"            "anything else is escalated"
check "/guard eval"              "proceeded with nobody asked"
check "/guard score"             "ordinary actions were intervened on"
check "/reconcile"               "EXCEPTIONS"
check "/triage asks inline"      "a accept   d dismiss   s suppress"
check "/triage records"          "accepted[[:space:]]+SIR-SEC"
check "/watch handover"          "handed the terminal to /watch"
check "/watch came back"         "/watch finished"
# Not "12 rules": the catalogue grows, and a marker pinned to its size fails the
# day a rule is added, reporting a broken handover that is nothing of the kind.
check "shell alive afterwards"   "rules · local engine"

echo
# A command that fails prints `error:` into the transcript. Any at all is worth
# looking at, so they are counted and shown rather than summarised away.
errors=$(grep -c "^ error:" "$PLAIN" || true)
if [ "$errors" != "0" ]; then
  echo "  $errors error line(s) in the transcript:"
  grep -h "^ error:" "$PLAIN" | sort -u | sed 's/^/    /'
  fails=$((fails + 1))
else
  echo "  no command reported an error"
fi

echo
echo "transcript: $OUT"
[ "$fails" -eq 0 ] || exit 1
