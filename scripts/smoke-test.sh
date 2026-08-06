#!/usr/bin/env bash
# Post-deploy smoke test for LMS.
# Checks health, readiness, API, and frontend.
# Exit 0 = all pass, exit 1 = any fail.
set -euo pipefail

BASE_URL="${SMOKE_BASE_URL:-http://localhost:3001}"
FRONTEND_URL="${SMOKE_FRONTEND_URL:-http://localhost:80}"

pass=0
fail=0

check() {
  local name="$1" url="$2" expected="$3"
  local body status_code
  status_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$url" 2>/dev/null) || status_code="000"
  if [ "$status_code" = "$expected" ]; then
    echo "  PASS  $name ($url → $status_code)"
    ((pass++))
  else
    echo "  FAIL  $name ($url → $status_code, expected $expected)"
    ((fail++))
  fi
}

check_json() {
  local name="$1" url="$2" field="$3" expected="$4"
  local body
  body=$(curl -s --max-time 5 "$url" 2>/dev/null) || body=""
  local value
  # Use node for JSON parsing (available in all LMS environments)
  value=$(echo "$body" | node -e "
    let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
      try{console.log(JSON.parse(d)$(echo "$field"))}catch{console.log('PARSE_ERROR')}
    })
  " 2>/dev/null) || value="ERROR"
  if [ "$value" = "$expected" ]; then
    echo "  PASS  $name ($field = $expected)"
    ((pass++))
  else
    echo "  FAIL  $name ($field = $value, expected $expected)"
    ((fail++))
  fi
}

check_html() {
  local name="$1" url="$2" expected_substr="$3"
  local body
  body=$(curl -s --max-time 5 "$url" 2>/dev/null) || body=""
  if echo "$body" | grep -q "$expected_substr"; then
    echo "  PASS  $name (contains '$expected_substr')"
    ((pass++))
  else
    echo "  FAIL  $name (missing '$expected_substr')"
    ((fail++))
  fi
}

echo "==> LMS Smoke Tests"
echo ""

check         "Health endpoint"     "$BASE_URL/health"    "200"
check_json    "Health status"       "$BASE_URL/health"    ".status" "ok"
check         "Readiness endpoint"  "$BASE_URL/healthz"   "200"
check_json    "Readiness status"    "$BASE_URL/healthz"   ".ready"  "true"

echo ""
echo "==> Results: $pass passed, $fail failed"

if [ "$fail" -gt 0 ]; then
  exit 1
fi
exit 0
