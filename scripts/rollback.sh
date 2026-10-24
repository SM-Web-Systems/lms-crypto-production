#!/usr/bin/env bash
# Guarded recovery: exact policy plus unchanged schema/financial state.
# DEPLOY_EXECUTE=1 required. No database restore, pruning or ignored failures.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "${LMS_PYTHON_BIN:-python3}" -I -S "$SCRIPT_DIR/release_recovery.py" rollback "$@"
