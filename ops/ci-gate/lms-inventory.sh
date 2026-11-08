#!/bin/bash
# Runs the reviewed read-only inventory tool from the prepared, verified LMS checkout
# (previously the workflow shipped the same file inline over SSH).
set -eu
: "${DEPLOY_DIR:?}"
export LMS_INVENTORY_MODE="$1" LMS_INVENTORY_MANIFEST="${2:-}"
: "${LMS_INVENTORY_TOOL_SHA256:?}"
case "$LMS_INVENTORY_TOOL_SHA256" in *[!0-9a-f]*|'') exit 2 ;; esac
test "${#LMS_INVENTORY_TOOL_SHA256}" -eq 64
case "$DEPLOY_DIR" in /*) ;; *) exit 2 ;; esac
cd -- "$DEPLOY_DIR"
test -z "$(git --no-optional-locks status --porcelain=v1 --untracked-files=all 2>/dev/null)"
tool=scripts/server_rbac_inventory.py
test -f "$tool" && test ! -L "$tool"
test "$(git --no-optional-locks hash-object --no-filters -- "$tool")" = "$(git --no-optional-locks rev-parse "HEAD:$tool")"
exec python3 -I "$tool"
