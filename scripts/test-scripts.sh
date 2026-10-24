#!/usr/bin/env bash
# Offline entrypoint behavior and shell parsing; no server/runtime requests.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON="${LMS_PYTHON_BIN:-python3}"
for script in deploy.sh rollback.sh smoke-test.sh; do
  bash -n "$SCRIPT_DIR/$script"
done
if output=$(env -i PATH="$PATH" LMS_PYTHON_BIN="$PYTHON" bash "$SCRIPT_DIR/deploy.sh" 2>&1); then
  echo 'FAIL: deployment accepted missing explicit target'
  exit 1
else
  status=$?
fi
if [ "$status" -ne 2 ] || [[ "$output" != *MISSING_REQUIRED_CONFIGURATION* ]]; then
  echo 'FAIL: deployment did not refuse safely'
  exit 1
fi
printf '%s\n' 'PASS: deploy/rollback/smoke shell syntax; deployment refuses missing explicit identity'
