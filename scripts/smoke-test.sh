#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# LMS Post-Deploy Smoke Test
# ──────────────────────────────────────────────────────────────────────────────
#
# Purpose:
#   Read-only health and availability checks against the LMS API.
#   Called by deploy.sh after container swap and by the GitHub Actions
#   deploy workflow as a final verification step.
#
# Environment:
#   SMOKE_BASE_URL  API base URL including the /api/v1 prefix.
#                   Default: https://lms.smwebsystems.com/api/v1
#
# Examples:
#   ./scripts/smoke-test.sh                                        # production
#   SMOKE_BASE_URL=http://localhost:3001/api/v1 ./scripts/smoke-test.sh  # local
#   SMOKE_BASE_URL=https://staging.example.com/api/v1 ./scripts/smoke-test.sh
#
# Checks performed (all read-only, no authentication, no mutations):
#   1. GET $BASE_URL/health        — HTTP 200
#   2. GET $BASE_URL/health        — JSON .status = "ok"
#   3. GET $BASE_URL/health        — JSON .checks.db.status = "ok"
#   4. GET $BASE_URL/courses       — HTTP 401 (auth enforced, route alive)
#   5. GET $BASE_URL/health        — JSON .buildSha present
#
# Not checked:
#   GET /healthz  — Root-level readiness probe for container orchestration.
#                   Not routable through the nginx reverse proxy under /api/v1.
#                   Docker healthcheck handles readiness at the container level.
#
# Safety:
#   This script performs ONLY unauthenticated GET requests.
#   It does NOT create, modify, or delete users, roles, courses, submissions,
#   rewards, certificates, payments, or blockchain assets.
#   It does NOT send credentials or tokens in output.
#
# Exit codes:
#   0  All checks passed
#   1  One or more checks failed
#
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# --- URL resolution --------------------------------------------------------
BASE_URL="${SMOKE_BASE_URL:-https://lms.smwebsystems.com/api/v1}"
# Strip trailing slashes to avoid doubled paths (e.g. /api/v1//health)
BASE_URL="${BASE_URL%/}"

pass=0
fail=0

# --- Check helpers ----------------------------------------------------------

check() {
  local name="$1" url="$2" expected="$3"
  local status_code
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
  local body value
  body=$(curl -s --max-time 5 "$url" 2>/dev/null) || body=""
  # Use node for JSON parsing (available in all LMS environments)
  value=$(echo "$body" | node -e "
    let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
      try{console.log(JSON.parse(d)$(echo "$field"))}catch{console.log('PARSE_ERROR')}
    })
  " 2>/dev/null) || value="ERROR"
  if [ "$value" = "$expected" ]; then
    echo "  PASS  $name (.${field} = $expected)"
    pass=$((pass + 1))
  else
    echo "  FAIL  $name ($url → .${field} = $value, expected $expected)"
    fail=$((fail + 1))
  fi
}

# --- Run checks -------------------------------------------------------------

echo "==> LMS Smoke Tests"
echo "    Base URL: $BASE_URL"
echo ""

# 1. Health endpoint returns 200
check         "Health endpoint"     "$BASE_URL/health"    "200"

# 2. Health status is "ok"
check_json    "Health status"       "$BASE_URL/health"    ".status" "ok"

# 3. Database is reachable (replaces root-level /healthz readiness probe)
check_json    "DB readiness"        "$BASE_URL/health"    ".checks.db.status" "ok"

# 4. Courses route is alive (401 = auth enforced, proves API routing works)
check         "Courses API"         "$BASE_URL/courses"   "401"

# 5. Build SHA is present (non-empty string)
build_sha=$(curl -s --max-time 5 "$BASE_URL/health" 2>/dev/null | node -e "
  let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
    try{const v=JSON.parse(d).buildSha;console.log(typeof v==='string'&&v.length>0?'present':'missing')}catch{console.log('missing')}
  })
" 2>/dev/null) || build_sha="missing"
if [ "$build_sha" = "present" ]; then
  echo "  PASS  Build SHA present"
  pass=$((pass + 1))
else
  echo "  FAIL  Build SHA missing from health response ($BASE_URL/health)"
  fail=$((fail + 1))
fi

# --- Summary ----------------------------------------------------------------

echo ""
echo "==> Results: $pass passed, $fail failed"

if [ "$fail" -gt 0 ]; then
  exit 1
fi
exit 0
