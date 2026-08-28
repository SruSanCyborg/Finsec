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

# ---- the VERIFIED LIVE beat, if the operator supplied a key for it.
#
# The fixture's key is a non-functional placeholder, so `--validate-secrets`
# asks Stripe, is told no, and correctly reports `inactive` — which is the tool
# working and the demo's headline badge never appearing. A real *test-mode* key
# makes the badge honest: the credential really is accepted right now, and the
# money model already prices test mode at a hundredth of a live key, so nothing
# is overstated.
#
# The key is written into the staged copy only. It never touches the repo, and
# a live key is refused outright: this script sends whatever it is given to
# Stripe, and that is not a thing to do with a credential that can move money.
SCAN_FLAGS=""
DEMO_KEY="${SIRIUS_DEMO_STRIPE_KEY:-}"

if [ -n "$DEMO_KEY" ]; then
  case "$DEMO_KEY" in
    sk_test_*|rk_test_*)
      printf '\n# Supplied by SIRIUS_DEMO_STRIPE_KEY for the rehearsal. Test mode.\n' >>"$STAGE/src/config.py"
      printf 'STRIPE_TEST_KEY = "%s"\n' "$DEMO_KEY" >>"$STAGE/src/config.py"
      SCAN_FLAGS=" --validate-secrets"
      echo "demo key: test-mode key staged, validation on"
      ;;
    *)
      echo "demo key: REFUSED — SIRIUS_DEMO_STRIPE_KEY is not an sk_test_/rk_test_ key." >&2
      echo "          This script sends it to Stripe. Never give it one that can move money." >&2
      exit 2
      ;;
  esac
else
  echo "demo key: none — set SIRIUS_DEMO_STRIPE_KEY to a Stripe *test* key to rehearse the VERIFIED LIVE badge"
fi

# A repo of its own, so the git archaeology in the threat stage has history to
# read rather than silently finding nothing.
git -C "$STAGE" init -q 2>/dev/null
git -C "$STAGE" add -A 2>/dev/null
git -C "$STAGE" -c user.email=demo@example.com -c user.name=demo commit -qm "seed" 2>/dev/null

{
  sleep 4                       # banner + wordmark paint
  printf '/scan %s%s\r' "$STAGE" "$SCAN_FLAGS"
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

# Stripped to a file and grepped from the file: `sed | grep -q` under pipefail
# reports failure on a *successful* match, because grep exits at the first hit
# and sed takes SIGPIPE.
PLAIN="$STAGE/transcript.txt"
sed 's/\x1b\[[0-9;]*[a-zA-Z]//g' "$OUT" >"$PLAIN"

echo
if [ -n "$SCAN_FLAGS" ]; then
  if grep -q "VERIFIED LIVE" "$PLAIN"; then
    echo "  ok    the VERIFIED LIVE badge fired"
  else
    echo "  MISS  no VERIFIED LIVE badge — the key was staged but Stripe did not accept it"
    echo "        (an expired or rotated test key reads as inactive, which is the tool being right)"
  fi
else
  echo "  --    VERIFIED LIVE not rehearsed: no test key supplied"
fi

echo
cat "$OUT"
