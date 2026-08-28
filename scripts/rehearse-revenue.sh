#!/usr/bin/env bash
#
# Rehearses the revenue beat the way it will be run on stage: inside the
# interactive shell, in a real pty, typing slash commands.
#
# Its own script rather than more lines in rehearse.sh, because the two beats
# have different setups and different failure modes. The scan beat needs a repo
# with a leaked key in it; this one needs a batch and a set of books, and its
# characteristic failure is not a crash — it is fifty lines arriving in one
# paint, which reads as a paste rather than an agent working.
#
# The timing report at the end is the point. A beat that runs long is a beat
# that gets cut, and a beat that runs in 0.1s never lands at all.
#
# Usage: scripts/rehearse-revenue.sh
set -uo pipefail
set +m
cd "$(dirname "$0")/.."

CLI="$PWD/packages/cli/dist/cli.js"
[ -f "$CLI" ] || { echo "build first: pnpm --filter sirius build"; exit 2; }

OUT="${REHEARSE_OUT:-$(mktemp)}"
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT

# The data is generated outside the timed run, and directly into the staging
# directory — never into the repo, which is where an earlier version of this
# left a stray `batch/` behind every rehearsal.
node "$CLI" revenue gen "$STAGE/batch" --seed sirius-2026 >/dev/null 2>&1
node "$CLI" reconcile "$STAGE/books" --gen --seed sirius-books >/dev/null 2>&1

echo "staged: $(ls "$STAGE")"

{
  sleep 4                                  # banner + wordmark paint
  printf '/revenue detect batch --limit 10\r'
  sleep 12
  printf '/revenue recover batch --limit 30\r'
  sleep 14
  printf '/reconcile books\r'
  sleep 10
  printf '/exit\r'
  sleep 2
} | (cd "$STAGE" && script -q /dev/null node "$CLI") >"$OUT" 2>&1 &
RUNNER=$!

( sleep 90; pkill -f "script -q /dev/null node $CLI" 2>/dev/null ) &
WATCHDOG=$!
wait $RUNNER 2>/dev/null
kill $WATCHDOG 2>/dev/null
wait $WATCHDOG 2>/dev/null

echo "transcript: $OUT"
echo

# ---- did each beat actually land?
#
# Stripped once into a file, and grepped from the file rather than through a
# pipe. `sed … | grep -q` under `set -o pipefail` reports failure on every
# *successful* match: grep exits at the first hit, sed takes SIGPIPE, and the
# pipeline's status is sed's. The first version of this reported eight MISSes
# against a transcript that contained all eight.
PLAIN="$STAGE/transcript.txt"
sed 's/\x1b\[[0-9;]*[a-zA-Z]//g' "$OUT" >"$PLAIN"

check() {
  if grep -q "$2" "$PLAIN"; then
    printf '  ok    %s\n' "$1"
  else
    printf '  MISS  %s   (looked for: %s)\n' "$1" "$2"
  fi
}

echo "beats:"
check "detect streams records"        'sirius revenue'
check "diagnosis names the outage"    'gateway degradation'
check "cluster is held, not retried"  'held for review'
check "recovery timeline runs"        'RECOVERY RUN'
check "a rule refuses something"      'WHERE IT STOPPED'
check "money is attributed honestly"  'would have anyway'
check "reconciliation closes"         'RECONCILIATION'
check "exceptions are named"          'never settled'
echo

# ---- how long is each beat, run on its own?
echo "beat timings (paced, as on stage):"
for beat in "revenue detect batch --limit 10" "revenue recover batch --limit 30" "reconcile books"; do
  start=$(python3 -c 'import time; print(time.time())')
  ( cd "$STAGE" && SIRIUS_STREAM_PLAIN=1 node "$CLI" $beat >/dev/null 2>&1 )
  python3 -c "import sys,time; print(f'  {time.time()-float(sys.argv[1]):5.1f}s  {sys.argv[2]}')" "$start" "$beat"
done
