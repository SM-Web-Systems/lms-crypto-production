#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# LMS Health Monitor (AUTH-10)
# ──────────────────────────────────────────────────────────────────────────────
#
# Purpose:
#   Durable health monitoring for the LMS production stack.
#   Checks API, frontend, Docker health, restarts, 5xx errors, disk, and DB.
#   Writes a heartbeat file for dead-man detection.
#   Sends email alerts on threshold breaches.
#
# Schedule: */5 * * * * (every 5 minutes via crontab)
#
# Environment:
#   LMS_MONITOR_LOG     — Log file path (default: /home/webadmin/logs/lms-health-monitor.log)
#   LMS_MONITOR_CSV     — CSV history file (default: /home/webadmin/logs/lms-health-monitor-v2.csv)
#   LMS_HEARTBEAT_FILE  — Heartbeat file for dead-man check (default: /home/webadmin/logs/lms-monitor-heartbeat)
#   LMS_API_URL         — API health URL (default: https://lms.smwebsystems.com/api/v1/health)
#   LMS_FRONTEND_URL    — Frontend URL (default: https://lms.smwebsystems.com/)
#   LMS_ALERT_EMAIL     — Alert recipient (default: from disk_alert.sh pattern)
#   LMS_DISK_THRESHOLD  — Disk usage alert threshold percent (default: 75)
#   LMS_5XX_THRESHOLD   — 5xx count alert threshold (default: 0)
#   LMS_MAX_RESTART_COUNT — Restart count alert threshold (default: 0)
#
# Safety:
#   This script performs ONLY read-only checks. No mutations, no secrets in output.
#   Does not restart, redeploy, or modify production containers.
#
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# --- Configuration ---
LOG_FILE="${LMS_MONITOR_LOG:-/home/webadmin/logs/lms-health-monitor.log}"
CSV_FILE="${LMS_MONITOR_CSV:-/home/webadmin/logs/lms-health-monitor-v2.csv}"
HEARTBEAT_FILE="${LMS_HEARTBEAT_FILE:-/home/webadmin/logs/lms-monitor-heartbeat}"
API_URL="${LMS_API_URL:-https://lms.smwebsystems.com/api/v1/health}"
FRONTEND_URL="${LMS_FRONTEND_URL:-https://lms.smwebsystems.com/}"
ALERT_EMAIL="${LMS_ALERT_EMAIL-mukhtar.meer@smwebsystems.com}"
DISK_THRESHOLD="${LMS_DISK_THRESHOLD:-75}"
MAX_5XX="${LMS_5XX_THRESHOLD:-0}"
MAX_RESTART_COUNT="${LMS_MAX_RESTART_COUNT:-0}"

PYTHON_BIN="${LMS_PYTHON_BIN:-python3}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXPECTED_SHA="${LMS_EXPECTED_SHA:-}"
BACKUP_STATUS="${LMS_BACKUP_STATUS_FILE:-}"
ALERT_STATE="${LMS_ALERT_STATE_FILE:-${LOG_FILE}.alerts.json}"
ALERT_COOLDOWN="${LMS_ALERT_COOLDOWN_SECONDS:-900}"
BACKUP_MAX_AGE="${LMS_BACKUP_MAX_AGE_SECONDS:-97200}"
if ! [[ "$EXPECTED_SHA" =~ ^[a-fA-F0-9]{40}$ ]]; then echo 'LMS_EXPECTED_SHA must be a full reviewed deployed SHA' >&2; exit 2; fi
if ! [[ "$ALERT_COOLDOWN" =~ ^[0-9]{3,5}$ ]] || [ "$ALERT_COOLDOWN" -lt 300 ] || [ "$ALERT_COOLDOWN" -gt 86400 ]; then echo 'Invalid alert cooldown' >&2; exit 2; fi
if ! [[ "$BACKUP_MAX_AGE" =~ ^[0-9]{3,6}$ ]] || [ "$BACKUP_MAX_AGE" -lt 300 ] || [ "$BACKUP_MAX_AGE" -gt 604800 ]; then echo 'Invalid backup age threshold' >&2; exit 2; fi

for value in "$DISK_THRESHOLD" "$MAX_5XX" "$MAX_RESTART_COUNT"; do
  if ! [[ "$value" =~ ^[0-9]{1,9}$ ]]; then echo "Invalid monitoring threshold" >&2; exit 2; fi
done
if [ "$DISK_THRESHOLD" -lt 1 ] || [ "$DISK_THRESHOLD" -gt 100 ]; then echo "Invalid disk threshold" >&2; exit 2; fi

API_CONTAINER="lms-api"
WEB_CONTAINER="lms-web"
HOSTNAME_TAG=$(hostname)

ts() { date -u '+%Y-%m-%dT%H:%M:%SZ'; }

alerts=""
status="OK"

add_alert() {
  local msg="$1"
  alerts="${alerts}${msg}\n"
  status="ALERT"
  echo "[$(ts)] ALERT: $msg" >> "$LOG_FILE"
}

# Versioned evidence format. Never append incompatible rows to historical AUTH-12 CSV.
CSV_HEADER="timestamp,api_health,frontend_http,api_docker_health,web_docker_health,api_restarts,five_xx_count,disk_pct,db_status,sha,web_restarts,api_uid,api_read_only,collection_ok,status"
if [ -f "$CSV_FILE" ] && [ "$(head -1 "$CSV_FILE")" != "$CSV_HEADER" ]; then
  echo 'Incompatible monitoring CSV header; preserve history and select a separate v2 file' >&2; exit 2
fi
if [ ! -f "$CSV_FILE" ]; then echo "$CSV_HEADER" > "$CSV_FILE"; fi

# --- 1. API health endpoint ---
api_health="unknown"
api_response=$(curl -fsS --max-time 10 "$API_URL" 2>/dev/null) || api_response=""
if [ -n "$api_response" ]; then
  api_health=$(echo "$api_response" | "$PYTHON_BIN" -c "import sys,json; print(json.load(sys.stdin).get('status','unknown'))" 2>/dev/null) || api_health="parse_error"
fi
case "$api_health" in ok|error|degraded|unknown|parse_error) ;; *) api_health=invalid ;; esac
if [ "$api_health" != "ok" ]; then
  add_alert "API health check failed (status=$api_health)"
fi

# --- 2. Frontend availability ---
frontend_http=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$FRONTEND_URL" 2>/dev/null) || frontend_http="000"
if [ "$frontend_http" != "200" ]; then
  add_alert "Frontend unavailable (HTTP $frontend_http)"
fi

# --- 3. Docker container health status ---
api_docker_health=$(docker inspect --format='{{.State.Health.Status}}' "$API_CONTAINER" 2>/dev/null) || api_docker_health="unknown"
if [ "$api_docker_health" != "healthy" ]; then
  add_alert "API container Docker health: $api_docker_health (expected: healthy)"
fi

web_docker_health=$(docker inspect --format='{{.State.Health.Status}}' "$WEB_CONTAINER" 2>/dev/null) || web_docker_health="unknown"
if [ "$web_docker_health" != "healthy" ]; then
  add_alert "Web container Docker health: $web_docker_health (expected: healthy)"
fi

# --- 4. Container restart count ---
api_restarts=$(docker inspect --format='{{.RestartCount}}' "$API_CONTAINER" 2>/dev/null) || api_restarts="-1"
if ! [[ "$api_restarts" =~ ^[0-9]{1,9}$ ]] || [ "$api_restarts" -gt "$MAX_RESTART_COUNT" ]; then
  add_alert "API container RestartCount=$api_restarts (threshold: $MAX_RESTART_COUNT)"
fi

# Additional release-evidence fields; failures are never normalized to OK.
web_restarts=$(docker inspect --format='{{.RestartCount}}' "$WEB_CONTAINER" 2>/dev/null) || web_restarts=-1
if ! [[ "$web_restarts" =~ ^[0-9]{1,9}$ ]] || [ "$web_restarts" -gt "$MAX_RESTART_COUNT" ]; then add_alert "Web RestartCount=$web_restarts"; fi
api_uid=$(docker exec "$API_CONTAINER" id -u 2>/dev/null) || api_uid=-1
if ! [[ "$api_uid" =~ ^[0-9]{1,9}$ ]] || [ "$api_uid" -le 0 ]; then add_alert "API UID failed or unreadable: $api_uid"; fi
api_read_only=$(docker inspect --format='{{.HostConfig.ReadonlyRootfs}}' "$API_CONTAINER" 2>/dev/null) || api_read_only=unknown
if [ "$api_read_only" != true ]; then add_alert "API read-only root failed or unreadable: $api_read_only"; fi
sha=$(printf '%s' "$api_response" | "$PYTHON_BIN" -c "import sys,json; print(json.load(sys.stdin).get('buildSha','unknown'))" 2>/dev/null) || sha=unknown
if ! [[ "$sha" =~ ^[a-fA-F0-9]{40}$ ]]; then add_alert 'Build SHA missing or invalid'; fi
if [ "$sha" != "$EXPECTED_SHA" ]; then add_alert 'Unexpected build SHA; compare approved release identity'; fi

# --- 5. 5xx errors in recent logs (last 5 minutes) ---
reconciliation_count=0
if recent_logs=$(docker logs "$API_CONTAINER" --since 5m --tail 10000 2>&1); then
  five_xx_count=$(printf '%s\n' "$recent_logs" | grep -c '"statusCode":5[0-9][0-9]' || true)
  if reconciliation_count=$(printf '%s\n' "$recent_logs" | "$PYTHON_BIN" "$SCRIPT_DIR/monitor_evidence.py" reconciliation 2>/dev/null); then
    if [ "$reconciliation_count" -gt 0 ]; then add_alert "Reconciliation signals in recent logs: $reconciliation_count; review provider evidence through the authorized reconciliation process"; fi
  else
    reconciliation_count=unknown
    add_alert 'Reconciliation evidence collection failed'
  fi
else
  five_xx_count="-1"
  add_alert "Unable to read container logs"
fi
if [ "$five_xx_count" -gt "$MAX_5XX" ] 2>/dev/null; then
  add_alert "5xx errors detected: $five_xx_count in last 5 minutes (threshold: $MAX_5XX)"
fi

# --- 6. Database readiness ---
db_status="unknown"
if [ -n "$api_response" ]; then
  db_status=$(echo "$api_response" | "$PYTHON_BIN" -c "import sys,json; print(json.load(sys.stdin).get('checks',{}).get('db',{}).get('status','unknown'))" 2>/dev/null) || db_status="parse_error"
fi
case "$db_status" in ok|error|degraded|unknown|parse_error) ;; *) db_status=invalid ;; esac
if [ "$db_status" != "ok" ]; then
  add_alert "Database readiness check failed (status=$db_status)"
fi
if [ -z "$BACKUP_STATUS" ] || ! "$PYTHON_BIN" "$SCRIPT_DIR/monitor_evidence.py" backup --path "$BACKUP_STATUS" --max-age "$BACKUP_MAX_AGE" 2>/dev/null; then
  add_alert 'Backup evidence failed, missing, stale or unreadable; verify the independent backup job'
fi

# --- 7. Disk space ---
disk_pct=$(df -h / | awk 'NR==2 {print $5}' | sed 's/%//') || disk_pct=-1
if ! [[ "$disk_pct" =~ ^[0-9]{1,3}$ ]] || [ "$disk_pct" -ge "$DISK_THRESHOLD" ]; then
  add_alert "Disk usage at ${disk_pct}% (threshold: ${DISK_THRESHOLD}%)"
fi

# --- Write heartbeat ---
date -u '+%Y-%m-%dT%H:%M:%SZ' > "$HEARTBEAT_FILE"

# --- Log result ---
echo "[$(ts)] $status: api=$api_health frontend=$frontend_http docker_api=$api_docker_health docker_web=$web_docker_health restarts=$api_restarts 5xx=$five_xx_count disk=${disk_pct}% db=$db_status" >> "$LOG_FILE"

# --- Append to CSV ---
collection_ok=false
[ "$status" = "OK" ] && collection_ok=true
echo "$(ts),$api_health,$frontend_http,$api_docker_health,$web_docker_health,$api_restarts,$five_xx_count,$disk_pct,$db_status,$sha,$web_restarts,$api_uid,$api_read_only,$collection_ok,$status" >> "$CSV_FILE"

# --- Trim CSV to last 5000 entries ---
if [ "$(wc -l < "$CSV_FILE")" -gt 5001 ]; then
  tmpf=$(mktemp)
  head -1 "$CSV_FILE" > "$tmpf"
  tail -5000 "$CSV_FILE" >> "$tmpf"
  mv "$tmpf" "$CSV_FILE"
fi

# --- Send alert email if any issues ---
if [ "$status" = "ALERT" ] && [ -n "$ALERT_EMAIL" ]; then
  mail_gate=0
  "$PYTHON_BIN" "$SCRIPT_DIR/monitor_evidence.py" mail-gate --state "$ALERT_STATE" --cooldown "$ALERT_COOLDOWN" 2>/dev/null || mail_gate=$?
  if [ "$mail_gate" -eq 3 ]; then
    echo "[$(ts)] MAIL_SUPPRESSED: cooldown active; alert remains visible" >> "$LOG_FILE"
  elif [ "$mail_gate" -ne 0 ]; then
    echo "[$(ts)] MAIL_STATE_FAILED: no mail attempted; inspect private cooldown state" >> "$LOG_FILE"
  else
  MESSAGE="Subject: LMS Health Alert on $HOSTNAME_TAG
From: alert@smwebsystems.com
To: $ALERT_EMAIL

LMS Health Monitor Alert — $(ts)

$(echo -e "$alerts")

Checks:
  API health:       $api_health
  Frontend HTTP:    $frontend_http
  Docker API:       $api_docker_health
  Docker Web:       $web_docker_health
  API restarts:     $api_restarts
  5xx (5min):       $five_xx_count
  Disk:             ${disk_pct}%
  DB:               $db_status"

  if printf "%s" "$MESSAGE" | msmtp "$ALERT_EMAIL" 2>/dev/null; then
    echo "[$(ts)] MAIL_SUBMITTED: receipt unconfirmed" >> "$LOG_FILE"
  else
    echo "[$(ts)] MAIL_SUBMISSION_FAILED: alert remains active" >> "$LOG_FILE"
  fi
  fi
fi

# --- Trim log to last 10000 lines ---
if [ "$(wc -l < "$LOG_FILE")" -gt 10000 ]; then
  tmpf=$(mktemp)
  tail -10000 "$LOG_FILE" > "$tmpf"
  mv "$tmpf" "$LOG_FILE"
fi

[ "$status" = "OK" ] && exit 0
exit 1
