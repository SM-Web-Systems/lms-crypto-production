#!/usr/bin/env bash
# Heartbeat liveness check; mail submission never proves delivery.
# Local changes are not installed into cron by this repository task.
set -euo pipefail
HEARTBEAT_FILE="${LMS_HEARTBEAT_FILE:-/home/webadmin/logs/lms-monitor-heartbeat}"
MAX_AGE_MIN="${LMS_HEARTBEAT_MAX_AGE:-10}"
ALERT_EMAIL="${LMS_ALERT_EMAIL-mukhtar.meer@smwebsystems.com}"
LOG_FILE="${LMS_DEADMAN_LOG:-/home/webadmin/logs/lms-deadman-check.log}"
HOSTNAME_TAG=$(hostname)
ts() { date -u '+%Y-%m-%dT%H:%M:%SZ'; }
if ! [[ "$MAX_AGE_MIN" =~ ^[0-9]{1,6}$ ]] || [ "$MAX_AGE_MIN" -lt 1 ]; then
  echo 'Invalid heartbeat threshold' >&2; exit 2
fi
reason=""
if [ ! -f "$HEARTBEAT_FILE" ]; then
  reason="Heartbeat file missing"
elif ! heartbeat_mtime=$(stat -c %Y "$HEARTBEAT_FILE" 2>/dev/null); then
  reason="Heartbeat timestamp unreadable"
elif ! [[ "$heartbeat_mtime" =~ ^[0-9]{1,12}$ ]]; then
  reason="Heartbeat timestamp invalid"
else
  now=$(date +%s)
  age_seconds=$((now - heartbeat_mtime))
  if [ "$age_seconds" -lt 0 ]; then reason="Heartbeat timestamp in the future"
  elif [ "$age_seconds" -ge "$((MAX_AGE_MIN * 60))" ]; then reason="Heartbeat stale: age=${age_seconds}s"
  fi
fi
if [ -n "$reason" ]; then
  echo "[$(ts)] ALERT: $reason" >> "$LOG_FILE"
  if [ -n "$ALERT_EMAIL" ]; then
    MESSAGE="Subject: LMS DEAD-MAN ALERT on $HOSTNAME_TAG
From: alert@smwebsystems.com
To: $ALERT_EMAIL

$reason. Verify the monitor, clock, permissions and cron configuration."
    if printf '%s' "$MESSAGE" | msmtp "$ALERT_EMAIL" 2>/dev/null; then
      echo "[$(ts)] MAIL_SUBMITTED: receipt unconfirmed" >> "$LOG_FILE"
    else
      echo "[$(ts)] MAIL_SUBMISSION_FAILED: alert remains active" >> "$LOG_FILE"
    fi
  fi
  exit 1
fi
echo "[$(ts)] OK: heartbeat age=${age_seconds}s (threshold: ${MAX_AGE_MIN}min)" >> "$LOG_FILE"
exit 0
