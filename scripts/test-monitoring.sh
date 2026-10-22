#!/usr/bin/env bash
# AUTH-10: Monitoring script validation tests
# Tests lms-health-monitor.sh and lms-deadman-check.sh without touching production.
# Usage: ./scripts/test-monitoring.sh
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

echo "==> AUTH-10 Monitoring Script Validation Tests"
echo ""

# --- M-01: Health monitor script exists and has correct syntax ---
if [ -f "$SCRIPT_DIR/lms-health-monitor.sh" ] && bash -n "$SCRIPT_DIR/lms-health-monitor.sh" 2>/dev/null; then
  check "M-01: lms-health-monitor.sh exists and passes syntax check" "PASS"
else
  check "M-01: lms-health-monitor.sh exists and passes syntax check" "missing or syntax error"
fi

# --- M-02: Health monitor has set -euo pipefail ---
if head -35 "$SCRIPT_DIR/lms-health-monitor.sh" 2>/dev/null | grep -q 'set -euo pipefail'; then
  check "M-02: lms-health-monitor.sh has set -euo pipefail" "PASS"
else
  check "M-02: lms-health-monitor.sh has set -euo pipefail" "missing"
fi

# --- M-03: Health monitor checks API health endpoint ---
if grep -q 'api/v1/health\|/health' "$SCRIPT_DIR/lms-health-monitor.sh" 2>/dev/null; then
  check "M-03: Health monitor checks API health endpoint" "PASS"
else
  check "M-03: Health monitor checks API health endpoint" "pattern not found"
fi

# --- M-04: Health monitor checks frontend availability ---
if grep -q 'lms.smwebsystems.com\|FRONTEND_URL\|frontend' "$SCRIPT_DIR/lms-health-monitor.sh" 2>/dev/null; then
  check "M-04: Health monitor checks frontend availability" "PASS"
else
  check "M-04: Health monitor checks frontend availability" "pattern not found"
fi

# --- M-05: Health monitor checks Docker container health ---
if grep -q 'docker inspect\|docker ps\|Health' "$SCRIPT_DIR/lms-health-monitor.sh" 2>/dev/null; then
  check "M-05: Health monitor checks Docker container health" "PASS"
else
  check "M-05: Health monitor checks Docker container health" "pattern not found"
fi

# --- M-06: Health monitor checks container restart count ---
if grep -q 'RestartCount\|restart' "$SCRIPT_DIR/lms-health-monitor.sh" 2>/dev/null; then
  check "M-06: Health monitor detects container restarts" "PASS"
else
  check "M-06: Health monitor detects container restarts" "pattern not found"
fi

# --- M-07: Health monitor checks for 5xx errors ---
if grep -q '5[0-9][0-9]\|5xx\|statusCode.*5' "$SCRIPT_DIR/lms-health-monitor.sh" 2>/dev/null; then
  check "M-07: Health monitor checks for 5xx errors in logs" "PASS"
else
  check "M-07: Health monitor checks for 5xx errors in logs" "pattern not found"
fi

# --- M-08: Health monitor checks disk space ---
if grep -q 'df \|disk\|DISK' "$SCRIPT_DIR/lms-health-monitor.sh" 2>/dev/null; then
  check "M-08: Health monitor checks disk space" "PASS"
else
  check "M-08: Health monitor checks disk space" "pattern not found"
fi

# --- M-09: Health monitor writes heartbeat file ---
if grep -q 'heartbeat\|HEARTBEAT' "$SCRIPT_DIR/lms-health-monitor.sh" 2>/dev/null; then
  check "M-09: Health monitor writes heartbeat file" "PASS"
else
  check "M-09: Health monitor writes heartbeat file" "pattern not found"
fi

# --- M-10: Health monitor logs results ---
if grep -q 'LOG_FILE\|log_file\|\.log\|\.csv' "$SCRIPT_DIR/lms-health-monitor.sh" 2>/dev/null; then
  check "M-10: Health monitor logs results" "PASS"
else
  check "M-10: Health monitor logs results" "pattern not found"
fi

# --- M-11: Dead-man check script exists and has correct syntax ---
if [ -f "$SCRIPT_DIR/lms-deadman-check.sh" ] && bash -n "$SCRIPT_DIR/lms-deadman-check.sh" 2>/dev/null; then
  check "M-11: lms-deadman-check.sh exists and passes syntax check" "PASS"
else
  check "M-11: lms-deadman-check.sh exists and passes syntax check" "missing or syntax error"
fi

# --- M-12: Dead-man check verifies heartbeat age ---
if grep -q 'heartbeat\|HEARTBEAT\|mtime\|age\|stale' "$SCRIPT_DIR/lms-deadman-check.sh" 2>/dev/null; then
  check "M-12: Dead-man check verifies heartbeat age" "PASS"
else
  check "M-12: Dead-man check verifies heartbeat age" "pattern not found"
fi

# --- M-13: Dead-man check has alert capability ---
if grep -q 'msmtp\|mail\|ALERT\|alert' "$SCRIPT_DIR/lms-deadman-check.sh" 2>/dev/null; then
  check "M-13: Dead-man check has alert capability" "PASS"
else
  check "M-13: Dead-man check has alert capability" "pattern not found"
fi

# --- M-14: Health monitor has configurable thresholds ---
if grep -q 'THRESHOLD\|threshold\|MAX_' "$SCRIPT_DIR/lms-health-monitor.sh" 2>/dev/null; then
  check "M-14: Health monitor has configurable thresholds" "PASS"
else
  check "M-14: Health monitor has configurable thresholds" "pattern not found"
fi

# --- Summary ---
echo ""
echo "==> Results: $pass passed, $fail failed"

if [ "$fail" -gt 0 ]; then
  exit 1
fi
exit 0
