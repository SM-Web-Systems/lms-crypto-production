#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# LMS Dead-Man Check (AUTH-10)
# ──────────────────────────────────────────────────────────────────────────────
#
# Purpose:
#   Verifies that the health monitor heartbeat file is recent.
#   If the heartbeat is stale (older than threshold), the health monitor
#   itself has stopped running — send an alert.
#
# Schedule: */15 * * * * (every 15 minutes via crontab)
#   Must run on a DIFFERENT schedule than the health monitor to detect its failure.
#
# Environment:
#   LMS_HEARTBEAT_FILE      — Heartbeat file path (must match lms-health-monitor.sh)
#   LMS_HEARTBEAT_MAX_AGE   — Maximum age in minutes before alert (default: 10)
#   LMS_ALERT_EMAIL         — Alert recipient
#
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

HEARTBEAT_FILE="${LMS_HEARTBEAT_FILE:-/home/webadmin/logs/lms-monitor-heartbeat}"
MAX_AGE_MIN="${LMS_HEARTBEAT_MAX_AGE:-10}"
ALERT_EMAIL="${LMS_ALERT_EMAIL:-mukhtar.meer@smwebsystems.com}"
LOG_FILE="/home/webadmin/logs/lms-deadman-check.log"
HOSTNAME_TAG=$(hostname)

ts() { date '+%Y-%m-%d %H:%M:%S'; }

# --- Check heartbeat file exists ---
if [ ! -f "$HEARTBEAT_FILE" ]; then
  echo "[$(ts)] ALERT: Heartbeat file missing ($HEARTBEAT_FILE) — monitor may never have run" >> "$LOG_FILE"

  MESSAGE="Subject: LMS DEAD-MAN ALERT on $HOSTNAME_TAG — Monitor Not Running
From: alert@smwebsystems.com
To: $ALERT_EMAIL

LMS Dead-Man Check Alert — $(ts)

The health monitor heartbeat file does not exist:
  $HEARTBEAT_FILE

The LMS health monitor (lms-health-monitor.sh) may not be configured or running.

Action required: verify the crontab entry and monitor script."

  printf "%s" "$MESSAGE" | msmtp "$ALERT_EMAIL" 2>/dev/null || {
    echo "[$(ts)] WARNING: Failed to send dead-man alert email" >> "$LOG_FILE"
  }
  exit 1
fi

# --- Check heartbeat age ---
heartbeat_mtime=$(stat -c %Y "$HEARTBEAT_FILE" 2>/dev/null) || heartbeat_mtime=0
now=$(date +%s)
age_seconds=$((now - heartbeat_mtime))
age_minutes=$((age_seconds / 60))

if [ "$age_minutes" -ge "$MAX_AGE_MIN" ]; then
  echo "[$(ts)] ALERT: Heartbeat stale — age=${age_minutes}min (threshold: ${MAX_AGE_MIN}min)" >> "$LOG_FILE"

  MESSAGE="Subject: LMS DEAD-MAN ALERT on $HOSTNAME_TAG — Monitor Stale
From: alert@smwebsystems.com
To: $ALERT_EMAIL

LMS Dead-Man Check Alert — $(ts)

The health monitor heartbeat is stale:
  File:      $HEARTBEAT_FILE
  Age:       ${age_minutes} minutes
  Threshold: ${MAX_AGE_MIN} minutes
  Last beat: $(cat "$HEARTBEAT_FILE" 2>/dev/null || echo "unreadable")

The LMS health monitor (lms-health-monitor.sh) may have stopped running.

Action required: check crontab, monitor script, and system logs."

  printf "%s" "$MESSAGE" | msmtp "$ALERT_EMAIL" 2>/dev/null || {
    echo "[$(ts)] WARNING: Failed to send dead-man alert email" >> "$LOG_FILE"
  }
  exit 1
fi

echo "[$(ts)] OK: heartbeat age=${age_minutes}min (threshold: ${MAX_AGE_MIN}min)" >> "$LOG_FILE"

# --- Trim log ---
if [ "$(wc -l < "$LOG_FILE")" -gt 5000 ]; then
  tmpf=$(mktemp)
  tail -5000 "$LOG_FILE" > "$tmpf"
  mv "$tmpf" "$LOG_FILE"
fi

exit 0
