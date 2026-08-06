#!/usr/bin/env bash
# Rollback LMS deploy to previous Docker images.
# Reads saved image IDs from .deploy-state/previous-images.txt.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="${DEPLOY_DIR:-$(dirname "$SCRIPT_DIR")}"
STATE_DIR="$DEPLOY_DIR/.deploy-state"
PREV_FILE="$STATE_DIR/previous-images.txt"
LOG_FILE="$STATE_DIR/deploy-log.txt"
TIMEOUT="${DEPLOY_TIMEOUT:-60}"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

if [ ! -f "$PREV_FILE" ]; then
  log "ERROR: No previous image state found at $PREV_FILE"
  log "Cannot rollback — no deploy state saved."
  exit 1
fi

cd "$DEPLOY_DIR"

log "==> Starting rollback"

# Read previous image IDs
api_image=$(grep '^api=' "$PREV_FILE" | cut -d= -f2)
web_image=$(grep '^web=' "$PREV_FILE" | cut -d= -f2)

if [ -z "$api_image" ] || [ -z "$web_image" ]; then
  log "ERROR: Missing image IDs in $PREV_FILE"
  exit 1
fi

log "Restoring api image: $api_image"
log "Restoring web image: $web_image"

# Tag previous images back to the compose service names
project_name=$(docker compose config --format json 2>/dev/null | node -e "
  let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
    console.log(JSON.parse(d).name || 'lms-ammawallet')
  })
" 2>/dev/null) || project_name="lms-ammawallet"

docker tag "$api_image" "${project_name}-api:latest" 2>/dev/null || true
docker tag "$web_image" "${project_name}-web:latest" 2>/dev/null || true

# Restart containers with previous images
docker compose up -d --no-deps api web

# Wait for API health
log "Waiting for API health..."
elapsed=0
while [ "$elapsed" -lt "$TIMEOUT" ]; do
  if curl -sf http://127.0.0.1:3001/health > /dev/null 2>&1; then
    log "API healthy after rollback (${elapsed}s)"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ROLLBACK SUCCESS" >> "$LOG_FILE"
    exit 0
  fi
  sleep 2
  ((elapsed += 2))
done

log "ERROR: API did not become healthy after rollback within ${TIMEOUT}s"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] ROLLBACK FAILED — API unhealthy" >> "$LOG_FILE"
exit 1
