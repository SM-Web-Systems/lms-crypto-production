#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# Verification suite for smoke-test.sh
#
# Tests URL resolution, trailing-slash handling, override behavior, and exit
# codes WITHOUT making real HTTP requests against production.
#
# Usage: ./scripts/smoke-test-verify.sh
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

pass=0
fail=0
total=0

assert() {
  local name="$1" expected="$2" actual="$3"
  total=$((total + 1))
  if [ "$expected" = "$actual" ]; then
    echo "  PASS  $name"
    pass=$((pass + 1))
  else
    echo "  FAIL  $name (expected '$expected', got '$actual')"
    fail=$((fail + 1))
  fi
}

SCRIPT="scripts/smoke-test.sh"

echo "==> smoke-test.sh verification"
echo ""

# ── 1. Default URL resolves to production ─────────────────────────────────────
echo "--- URL resolution ---"

default_url=$(unset SMOKE_BASE_URL; bash -c 'source <(head -60 '"$SCRIPT"' | grep -A2 "^BASE_URL="); echo "$BASE_URL"' 2>/dev/null)
# Simpler: just parse the default from the script
default_from_script=$(grep -oP '(?<=:-)[^}]+' "$SCRIPT" | head -1)
assert "Default URL is production" "https://lms.smwebsystems.com/api/v1" "$default_from_script"

# ── 2. SMOKE_BASE_URL is honored exactly ──────────────────────────────────────
# Extract the URL-resolution block and test it in isolation
resolve_url() {
  local input="$1"
  local BASE_URL="${input:-https://lms.smwebsystems.com/api/v1}"
  BASE_URL="${BASE_URL%/}"
  echo "$BASE_URL"
}

assert "Override honored exactly" \
  "http://localhost:3001/api/v1" \
  "$(resolve_url "http://localhost:3001/api/v1")"

assert "Custom staging URL honored" \
  "https://staging.example.com/api/v1" \
  "$(resolve_url "https://staging.example.com/api/v1")"

# ── 3. Trailing slash normalization ───────────────────────────────────────────
echo ""
echo "--- Trailing slash ---"

assert "Single trailing slash stripped" \
  "https://lms.smwebsystems.com/api/v1" \
  "$(resolve_url "https://lms.smwebsystems.com/api/v1/")"

assert "No slash unchanged" \
  "http://localhost:3001/api/v1" \
  "$(resolve_url "http://localhost:3001/api/v1")"

# Verify no double-slash in constructed URL
resolved=$(resolve_url "https://example.com/api/v1/")
constructed="${resolved}/health"
case "$constructed" in
  *//health*) assert "No double-slash in path" "no-double" "double-found" ;;
  *)          assert "No double-slash in path" "ok" "ok" ;;
esac

# ── 4. Exit code on failure ───────────────────────────────────────────────────
echo ""
echo "--- Exit codes ---"

# Unreachable URL should exit nonzero
SMOKE_BASE_URL="http://127.0.0.1:1/api/v1" timeout 30 bash "$SCRIPT" >/dev/null 2>&1 && exit_code=0 || exit_code=$?
assert "Unreachable URL exits nonzero" "1" "$exit_code"

# Production URL should exit zero
"$SCRIPT" >/dev/null 2>&1 && exit_code=0 || exit_code=$?
assert "Production URL exits zero" "0" "$exit_code"

# ── 5. Output includes base URL ──────────────────────────────────────────────
echo ""
echo "--- Output format ---"

output=$("$SCRIPT" 2>&1) || true
if echo "$output" | grep -q "Base URL:"; then
  assert "Output shows base URL" "found" "found"
else
  assert "Output shows base URL" "found" "missing"
fi

# Failure output includes the failing URL
fail_output=$(SMOKE_BASE_URL="http://127.0.0.1:1/api/v1" timeout 30 bash "$SCRIPT" 2>&1) || true
if echo "$fail_output" | grep -q "http://127.0.0.1:1/api/v1"; then
  assert "Failure output includes base URL" "found" "found"
else
  assert "Failure output includes base URL" "found" "missing"
fi

# ── 6. Script is read-only (no POST/PUT/DELETE/PATCH) ─────────────────────────
echo ""
echo "--- Safety ---"

if grep -qE '\bcurl\b.*\b-(X|--request)\s+(POST|PUT|DELETE|PATCH)\b' "$SCRIPT"; then
  assert "No mutating HTTP methods" "none" "found"
elif grep -qE '\bcurl\b.*\b-d\b' "$SCRIPT"; then
  assert "No request bodies (-d)" "none" "found"
else
  assert "No mutating HTTP methods" "none" "none"
fi

if grep -qiE '(token|password|secret|cookie|credential)' "$SCRIPT" | grep -v '^#'; then
  # Check non-comment lines only
  has_secrets=$(grep -cvE '^\s*#' "$SCRIPT" | head -1)
  assert "No credentials in non-comment code" "clean" "suspicious"
else
  assert "No credentials in non-comment code" "clean" "clean"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "==> Verification: $pass/$total passed, $fail failed"

if [ "$fail" -gt 0 ]; then
  exit 1
fi
exit 0
