#!/bin/bash
# AUTH-12: 24-hour stability final check
# Run at or after 2026-10-23T12:37:16Z (14:37 SAST)
# to verify the full 24h observation window
set -euo pipefail

DEPLOY_START="2026-10-22T12:37:16Z"
REPORT_FILE="/home/webadmin/logs/auth12-24h-stability-report.txt"
DEPLOY_EPOCH=$(date -d "$DEPLOY_START" +%s)
NOW_EPOCH=$(date +%s)
ELAPSED_SEC=$((NOW_EPOCH - DEPLOY_EPOCH))
ELAPSED_HOURS=$(echo "scale=1; $ELAPSED_SEC / 3600" | bc)

{
echo "=============================================="
echo " AUTH-12: 24-HOUR STABILITY FINAL CHECK"
echo " Run at: $(date -u '+%Y-%m-%dT%H:%M:%SZ') ($(date '+%H:%M %Z'))"
echo " Deploy: $DEPLOY_START"
echo " Elapsed: ${ELAPSED_HOURS}h"
echo "=============================================="
echo ""

if [ "$ELAPSED_SEC" -lt 86400 ]; then
  echo "WARNING: Only ${ELAPSED_HOURS}h elapsed — 24h window not yet complete"
  echo ""
fi

echo "--- API Health ---"
HEALTH=$(curl -fsS --max-time 5 https://lms.smwebsystems.com/api/v1/health 2>/dev/null)
echo "$HEALTH" | python3 -c "
import sys,json
d = json.load(sys.stdin)
print(f'  status: {d[\"status\"]}')
print(f'  db: {d[\"checks\"][\"db\"][\"status\"]}')
print(f'  uptime: {d[\"uptime\"]}s ({d[\"uptime\"]/3600:.1f}h)')
print(f'  sha: {d[\"buildSha\"][:7]}')
print(f'  heap: {d[\"checks\"][\"memory\"][\"heapUsedMB\"]}MB')
" 2>/dev/null || echo "  FAIL: Health endpoint unreachable"
echo ""

echo "--- Container Status ---"
echo "  restarts: $(docker inspect --format='{{.RestartCount}}' lms-api 2>/dev/null)"
echo "  health: $(docker inspect --format='{{.State.Health.Status}}' lms-api 2>/dev/null)"
echo "  whoami: $(docker exec lms-api whoami 2>/dev/null)"
echo "  readOnly: $(docker inspect --format='{{.HostConfig.ReadonlyRootfs}}' lms-api 2>/dev/null)"
echo ""

echo "--- Errors ---"
ERRORS=$(docker logs lms-api 2>&1 | grep -ciE 'error|fatal|EACCES|EROFS|EPERM' || true)
echo "  Total errors in full log: $ERRORS"
echo ""

echo "--- Monitoring CSV Summary ---"
TOTAL_CSV=$(grep -c '^2026-10' /home/webadmin/logs/lms-health-monitor.csv 2>/dev/null || echo 0)
NON_OK=$(grep -v ',OK$' /home/webadmin/logs/lms-health-monitor.csv 2>/dev/null | grep -cv '^timestamp' || true)
NON_OK=${NON_OK:-0}
echo "  Total entries: $TOTAL_CSV"
echo "  Non-OK entries: $NON_OK"
echo "  Latest 3:"
tail -3 /home/webadmin/logs/lms-health-monitor.csv 2>/dev/null
echo ""

echo "--- Dead-Man Check ---"
DM_OK=$(grep -c 'OK:' /home/webadmin/logs/lms-deadman-check.log 2>/dev/null || echo 0)
DM_ALERT=$(grep -c 'ALERT:' /home/webadmin/logs/lms-deadman-check.log 2>/dev/null || echo 0)
echo "  OK entries: $DM_OK"
echo "  ALERT entries: $DM_ALERT"
echo ""

echo "--- Backup ---"
ls -la /home/webadmin/backups/lms-ammawallet-db/student_ms_20261023*.db 2>/dev/null || echo "  No Oct 23 backup yet"
echo ""

echo "--- Frontend ---"
echo "  HTTP $(curl -s -o /dev/null -w '%{http_code}' https://lms.smwebsystems.com/)"
echo ""

echo "--- Rollback Images ---"
docker images --format '  {{.Repository}}:{{.Tag}} ({{.ID}})' 2>/dev/null | grep pre-auth11
echo ""

echo "=== VERDICT ==="
PASS=true
[ "$(echo "$HEALTH" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])" 2>/dev/null)" != "ok" ] && PASS=false && echo "FAIL: API status not ok"
[ "$(docker inspect --format='{{.RestartCount}}' lms-api 2>/dev/null)" != "0" ] && PASS=false && echo "FAIL: Non-zero restarts"
[ "$ERRORS" -gt 0 ] && PASS=false && echo "FAIL: Errors found in logs ($ERRORS)"
[ "$NON_OK" -gt 0 ] && PASS=false && echo "FAIL: Non-OK monitoring entries ($NON_OK)"
[ "$ELAPSED_SEC" -lt 86400 ] && echo "CONDITION: Only ${ELAPSED_HOURS}h of 24h elapsed"

if $PASS; then
  echo "24-HOUR STABILITY: PASS"
else
  echo "24-HOUR STABILITY: FAIL — see above"
fi
} | tee "$REPORT_FILE"

echo ""
echo "Report saved to: $REPORT_FILE"
