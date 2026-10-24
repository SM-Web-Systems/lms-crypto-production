#!/usr/bin/env bash
# Explicit prepared checkout only. Phase 1 refuses container replacement.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "${LMS_PYTHON_BIN:-python3}" "$SCRIPT_DIR/release_preflight.py" "$@"
