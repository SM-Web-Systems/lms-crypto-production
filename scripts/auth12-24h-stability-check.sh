#!/usr/bin/env bash
# Offline evidence verification only. Does not contact production or close AUTH-12.
# Usage: --evidence FILE --expected-sha FULL_SHA --started-at OFFSET_TIMESTAMP
# Exit: 0 PASS for supplied evidence, 1 FAIL, 2 PENDING/usage error.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON_BIN="${LMS_PYTHON_BIN:-python3}"
if [ -n "${LMS_STABILITY_REPORT:-}" ]; then
  "$PYTHON_BIN" "$SCRIPT_DIR/verify-stability.py" "$@" | tee "$LMS_STABILITY_REPORT"
else
  exec "$PYTHON_BIN" "$SCRIPT_DIR/verify-stability.py" "$@"
fi
