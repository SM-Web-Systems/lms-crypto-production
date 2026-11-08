#!/bin/bash
# Root-owned copy of the reviewed bootstrap from lms-crypto-production deploy.yml.
APPROVED_SHA="$1"; DEPLOY_EXECUTE_REQUEST="$2"; DEPLOY_REPOSITORY=SM-Web-Systems/lms-crypto-production
set -eu
: "${DEPLOY_DIR:?Explicit prepared checkout required}"
: "${APPROVED_SHA:?Exact approved SHA required}"
# Trusted bootstrap precedes ALL code from the server checkout.
# An old deploy.sh cannot be trusted to validate itself.
case "$DEPLOY_DIR" in /*) ;; *) exit 2 ;; esac
case "$APPROVED_SHA" in *[!0-9a-f]*|'') exit 2 ;; esac
test "${#APPROVED_SHA}" -eq 40
test "$DEPLOY_REPOSITORY" = 'SM-Web-Systems/lms-crypto-production'
cd -- "$DEPLOY_DIR" 2>/dev/null
test "$(pwd -P)" = "$DEPLOY_DIR"
checkout_root="$(git --no-optional-locks rev-parse --show-toplevel 2>/dev/null)"
test "$checkout_root" = "$DEPLOY_DIR"
actual_sha="$(git --no-optional-locks rev-parse HEAD 2>/dev/null)"
test "$actual_sha" = "$APPROVED_SHA"
remote="$(git --no-optional-locks remote get-url origin 2>/dev/null)"
case "$remote" in
  https://github.com/SM-Web-Systems/lms-crypto-production|https://github.com/SM-Web-Systems/lms-crypto-production.git|git@github.com:SM-Web-Systems/lms-crypto-production.git|ssh://git@github.com/SM-Web-Systems/lms-crypto-production.git) ;;
  *) exit 2 ;;
esac
dirty="$(git --no-optional-locks status --porcelain=v1 --untracked-files=all 2>/dev/null)"
test -z "$dirty"
for file in scripts/deploy.sh scripts/release_preflight.py scripts/release_recovery.py scripts/rollback.sh; do
  test -f "$file" && test ! -L "$file"
  git --no-optional-locks ls-files --error-unmatch -- "$file" >/dev/null 2>&1
  expected_blob="$(git --no-optional-locks rev-parse "$APPROVED_SHA:$file" 2>/dev/null)"
  actual_blob="$(git --no-optional-locks hash-object --no-filters -- "$file" 2>/dev/null)"
  test "$actual_blob" = "$expected_blob"
done
export DEPLOY_SHA="$APPROVED_SHA"
case "$DEPLOY_EXECUTE_REQUEST" in
  false) export DEPLOY_EXECUTE=0 ;;
  true) export DEPLOY_EXECUTE=1 ;;
  *) exit 2 ;;
esac
# Operator preparation is separate; cron can still read this checkout.
exec bash ./scripts/deploy.sh
