#!/usr/bin/env bash
# Builds candidate images and prints their IDs for review. Never stops a service.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "${LMS_PYTHON_BIN:-python3}" -I -S "$SCRIPT_DIR/release_recovery.py" build "$@"
