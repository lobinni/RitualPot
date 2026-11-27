#!/bin/sh
# Checks contracts/RitualPot.py the way CI does.
#
# 1. The file must parse (a syntax error would otherwise only show up on a validator).
# 2. tests/test_contract.py runs the contract offline against a stand-in for the GenVM SDK:
#    the architecture, the parsers, the money arithmetic, the refusals and the timings.
# 3. When the official GenVM linter is installed, it runs on the file exactly as deployed.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/contracts/RitualPot.py"

echo "-- syntax"
python3 -m py_compile "$SRC"
echo "ok"

echo "-- contract tests"
python3 "$ROOT/tests/test_contract.py"

if command -v genvm-lint >/dev/null 2>&1; then
  echo "-- genvm-lint"
  genvm-lint lint "$SRC"
  genvm-lint check "$SRC"
  genvm-lint typecheck "$SRC"
else
  echo "-- genvm-lint not installed; skipped (pip install genvm-linter)"
fi

echo "-- deployed code equals this source"
python3 "$ROOT/scripts/verify_deployment.py"
