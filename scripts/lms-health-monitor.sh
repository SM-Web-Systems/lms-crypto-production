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
#   LMS_MONITOR_CSV     — CSV history file (default: /home/webadmin/logs/lms-health-monitor.csv)
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
CSV_FILE="${LMS_MONITOR_CSV:-/home/webadmin/logs/lms-health-monitor.csv}"
HEARTBEAT_FILE="${LMS_HEARTBEAT_FILE:-/home/webadmin/logs/lms-monitor-heartbeat}"
API_URL="${LMS_API_URL:-https://lms.smwebsystems.com/api/v1/health}"
FRONTEND_URL="${LMS_FRONTEND_URL:-https://lms.smwebsystems.com/}"
ALERT_EMAIL="${LMS_ALERT_EMAIL:-mukhtar.meer@smwebsystems.com}"
DISK_THRESHOLD="${LMS_DISK_THRESHOLD:-75}"
MAX_5XX="${LMS_5XX_THRESHOLD:-0}"
MAX_RESTART_COUNT="${LMS_MAX_RESTART_COUNT:-0}"

API_CONTAINER="lms-api"
WEB_CONTAINER="lms-web"
HOSTNAME_TAG=$(hostname)

ts() { date '+%Y-%m-%d %H:%M:%S'; }

alerts=""
status="OK"

add_alert() {
  local msg="$1"
  alerts="${alerts}${msg}\n"
  status="ALERT"
  echo "[$(ts)] ALERT: $msg" >> "$LOG_FILE"
}

# --- Initialize CSV header if missing ---
if [ ! -f "$CSV_FILE" ]; then
  echo "timestamp,api_health,frontend_http,api_docker_health,web_docker_health,api_restarts,5xx_count,disk_pct,db_status,status" > "$CSV_FILE"
fi

# --- 1. API health endpoint ---
api_health="unknown"
api_response=$(curl -fsS --max-time 10 "$API_URL" 2>/dev/null) || api_response=""
if [ -n "$api_response" ]; then
  api_health=$(echo "$api_response" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','unknown'))" 2>/dev/null) || api_health="parse_error"
fi
if [ "$api_health" != "ok" ]; then
  add_alert "API health check failed (status=$api_health, url=$API_URL)"
fi

# --- 2. Frontend availability ---
frontend_http=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$FRONTEND_URL" 2>/dev/null) || frontend_http="000"
if [ "$frontend_http" != "200" ]; then
  add_alert "Frontend unavailable (HTTP $frontend_http, url=$FRONTEND_URL)"
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
if [ "$api_restarts" -gt "$MAX_RESTART_COUNT" ] 2>/dev/null; then
  add_alert "API container RestartCount=$api_restarts (threshold: $MAX_RESTART_COUNT)"
fi

# --- 5. 5xx errors in recent logs (last 5 minutes) ---
five_xx_count=$(docker logs "$API_CONTAINER" --since 5m 2>&1 | grep -c '"statusCode":5[0-9][0-9]' 2>/dev/null) || five_xx_count="0"
if [ "$five_xx_count" -gt "$MAX_5XX" ] 2>/dev/null; then
  add_alert "5xx errors detected: $five_xx_count in last 5 minutes (threshold: $MAX_5XX)"
fi

# --- 6. Database readiness ---
db_status="unknown"
if [ -n "$api_response" ]; then
  db_status=$(echo "$api_response" | python3 -c "import sys,json; print(json.load(sys.stdin).get('checks',{}).get('db',{}).get('status','unknown'))" 2>/dev/null) || db_status="parse_error"
fi
if [ "$db_status" != "ok" ]; then
  add_alert "Database readiness check failed (status=$db_status)"
fi

# --- 7. Disk space ---
disk_pct=$(df -h / | awk 'NR==2 {print $5}' | sed 's/%//')
if [ "$disk_pct" -ge "$DISK_THRESHOLD" ] 2>/dev/null; then
  add_alert "Disk usage at ${disk_pct}% (threshold: ${DISK_THRESHOLD}%)"
fi

# --- Write heartbeat ---
date '+%Y-%m-%d %H:%M:%S' > "$HEARTBEAT_FILE"

# --- Log result ---
echo "[$(ts)] $status: api=$api_health frontend=$frontend_http docker_api=$api_docker_health docker_web=$web_docker_health restarts=$api_restarts 5xx=$five_xx_count disk=${disk_pct}% db=$db_status" >> "$LOG_FILE"

# --- Append to CSV ---
echo "$(ts),$api_health,$frontend_http,$api_docker_health,$web_docker_health,$api_restarts,$five_xx_count,$disk_pct,$db_status,$status" >> "$CSV_FILE"

# --- Trim CSV to last 5000 entries ---
if [ "$(wc -l < "$CSV_FILE")" -gt 5001 ]; then
  tmpf=$(mktemp)
  head -1 "$CSV_FILE" > "$tmpf"
  tail -5000 "$CSV_FILE" >> "$tmpf"
  mv "$tmpf" "$CSV_FILE"
fi

# --- Send alert email if any issues ---
if [ "$status" = "ALERT" ] && [ -n "$ALERT_EMAIL" ]; then
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

  printf "%s" "$MESSAGE" | msmtp "$ALERT_EMAIL" 2>/dev/null || {
    echo "[$(ts)] WARNING: Failed to send alert email" >> "$LOG_FILE"
  }
fi

# --- Trim log to last 10000 lines ---
if [ "$(wc -l < "$LOG_FILE")" -gt 10000 ]; then
  tmpf=$(mktemp)
  tail -10000 "$LOG_FILE" > "$tmpf"
  mv "$tmpf" "$LOG_FILE"
fi

exit 0
