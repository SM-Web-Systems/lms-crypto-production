#!/usr/bin/env bash
# Post-deploy smoke test for LMS.
# Checks health, readiness, and API endpoints.
# Exit 0 = all pass, exit 1 = any fail.
set -euo pipefail

BASE_URL="${SMOKE_BASE_URL:-http://localhost:3001}"

pass=0
fail=0

check() {
  local name="$1" url="$2" expected="$3"
  local body status_code
  status_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$url" 2>/dev/null) || status_code="000"
  if [ "$status_code" = "$expected" ]; then
    echo "  PASS  $name ($url → $status_code)"
    pass=$((pass + 1))
  else
    echo "  FAIL  $name ($url → $status_code, expected $expected)"
    fail=$((fail + 1))
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
    pass=$((pass + 1))
  else
    echo "  FAIL  $name ($field = $value, expected $expected)"
    fail=$((fail + 1))
  fi
}

echo "==> LMS Smoke Tests"
echo ""

check         "Health endpoint"     "$BASE_URL/health"    "200"
check_json    "Health status"       "$BASE_URL/health"    ".status" "ok"
check         "Readiness endpoint"  "$BASE_URL/healthz"   "200"
check_json    "Readiness status"    "$BASE_URL/healthz"   ".ready"  "true"
check         "Courses API"         "$BASE_URL/api/v1/courses" "200"

# Build SHA — verify the field is present (non-empty string)
build_sha=$(curl -s --max-time 5 "$BASE_URL/health" 2>/dev/null | node -e "
  let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
    try{const v=JSON.parse(d).buildSha;console.log(typeof v==='string'&&v.length>0?'present':'missing')}catch{console.log('missing')}
  })
" 2>/dev/null) || build_sha="missing"
if [ "$build_sha" = "present" ]; then
  echo "  PASS  Build SHA present"
  pass=$((pass + 1))
else
  echo "  FAIL  Build SHA missing from health response"
  fail=$((fail + 1))
fi

echo ""
echo "==> Results: $pass passed, $fail failed"

if [ "$fail" -gt 0 ]; then
  exit 1
fi
exit 0
