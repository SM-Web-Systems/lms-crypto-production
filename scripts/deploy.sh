#!/usr/bin/env bash
# Explicit prepared checkout only. Execution requires DEPLOY_EXECUTE=1 and policy.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# release_preflight.py is imported only from the reviewed scripts directory.
exec "${LMS_PYTHON_BIN:-python3}" -I -S "$SCRIPT_DIR/release_recovery.py" prepare "$@"
