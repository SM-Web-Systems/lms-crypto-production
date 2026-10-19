#!/usr/bin/env bash
# AUTH-09: Script validation tests
# Tests rollback.sh and deploy.sh fixes without touching production.
# Usage: ./scripts/test-scripts.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
pass=0
fail=0

check() {
  local name="$1" result="$2"
  if [ "$result" = "PASS" ]; then
    echo "  PASS  $name"
    pass=$((pass + 1))
  else
    echo "  FAIL  $name ($result)"
    fail=$((fail + 1))
  fi
}

echo "==> AUTH-09 Script Validation Tests"
echo ""

# --- T-01: rollback.sh uses public health URL by default ---
default_url=$(grep 'HEALTH_URL=' "$SCRIPT_DIR/rollback.sh" | head -1)
if echo "$default_url" | grep -q 'lms.smwebsystems.com'; then
  check "T-01: rollback.sh default health URL uses public proxy" "PASS"
else
  check "T-01: rollback.sh default health URL uses public proxy" "got: $default_url"
fi

# --- T-02: rollback.sh health URL is configurable ---
if grep -q 'HEALTH_URL:-' "$SCRIPT_DIR/rollback.sh" && grep -q '"$HEALTH_URL"' "$SCRIPT_DIR/rollback.sh"; then
  check "T-02: rollback.sh health URL is configurable via HEALTH_URL" "PASS"
else
  check "T-02: rollback.sh health URL is configurable via HEALTH_URL" "pattern not found"
fi

# --- T-03: rollback.sh no longer uses localhost:3001 ---
if grep -q '127\.0\.0\.1:3001' "$SCRIPT_DIR/rollback.sh"; then
  check "T-03: rollback.sh does not use unreachable localhost:3001" "still present"
else
  check "T-03: rollback.sh does not use unreachable localhost:3001" "PASS"
fi

# --- T-04: deploy.sh exits on SHA mismatch ---
sha_block=$(sed -n '/Build SHA mismatch/,+3p' "$SCRIPT_DIR/deploy.sh")
if echo "$sha_block" | grep -q 'exit 1'; then
  check "T-04: deploy.sh exits non-zero on SHA mismatch" "PASS"
else
  check "T-04: deploy.sh exits non-zero on SHA mismatch" "no exit found"
fi

# --- T-05: deploy.sh logs FAILED on SHA mismatch ---
if grep -q 'DEPLOY FAILED.*SHA mismatch' "$SCRIPT_DIR/deploy.sh"; then
  check "T-05: deploy.sh logs DEPLOY FAILED on SHA mismatch" "PASS"
else
  check "T-05: deploy.sh logs DEPLOY FAILED on SHA mismatch" "pattern not found"
fi

# --- T-06: deploy.sh normal success path unchanged ---
if grep -q 'DEPLOY SUCCESS' "$SCRIPT_DIR/deploy.sh" && grep -q 'Deploy SUCCESSFUL' "$SCRIPT_DIR/deploy.sh"; then
  check "T-06: deploy.sh success path preserved" "PASS"
else
  check "T-06: deploy.sh success path preserved" "success markers missing"
fi

# --- T-07: All scripts pass bash -n syntax check ---
all_pass="PASS"
for script in deploy.sh rollback.sh smoke-test.sh; do
  if ! bash -n "$SCRIPT_DIR/$script" 2>/dev/null; then
    all_pass="$script failed syntax check"
    break
  fi
done
check "T-07: All scripts pass bash -n syntax check" "$all_pass"

# --- T-08: rollback.sh has set -euo pipefail ---
if head -5 "$SCRIPT_DIR/rollback.sh" | grep -q 'set -euo pipefail'; then
  check "T-08: rollback.sh has set -euo pipefail" "PASS"
else
  check "T-08: rollback.sh has set -euo pipefail" "missing"
fi

# --- T-09: deploy.sh has set -euo pipefail ---
if head -10 "$SCRIPT_DIR/deploy.sh" | grep -q 'set -euo pipefail'; then
  check "T-09: deploy.sh has set -euo pipefail" "PASS"
else
  check "T-09: deploy.sh has set -euo pipefail" "missing"
fi

# --- T-10: COHORT-IDOR spec status updated ---
cohort_spec="$SCRIPT_DIR/../docs/release/COHORT-IDOR-remediation-spec.md"
if grep -q 'RESOLVED.*AUTH-03' "$cohort_spec"; then
  check "T-10: COHORT-IDOR spec status is RESOLVED" "PASS"
else
  check "T-10: COHORT-IDOR spec status is RESOLVED" "not updated"
fi

# --- Summary ---
echo ""
echo "==> Results: $pass passed, $fail failed"

if [ "$fail" -gt 0 ]; then
  exit 1
fi
exit 0
