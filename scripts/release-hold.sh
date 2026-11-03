#!/usr/bin/env bash
# Resumes writers on the verified held candidate. DEPLOY_EXECUTE=1 required.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "${LMS_PYTHON_BIN:-python3}" -I -S "$SCRIPT_DIR/release_recovery.py" release-hold "$@"
