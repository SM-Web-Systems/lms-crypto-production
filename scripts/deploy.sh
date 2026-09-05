#!/usr/bin/env bash
# Automated deploy script for LMS Docker stack.
# Usage: ./scripts/deploy.sh
#
# Environment:
#   DEPLOY_DIR      — repo root (default: parent of this script)
#   DEPLOY_TIMEOUT  — health check timeout in seconds (default: 60)
#   DEPLOY_DRY_RUN  — if set, print commands without executing
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="${DEPLOY_DIR:-$(dirname "$SCRIPT_DIR")}"
STATE_DIR="$DEPLOY_DIR/.deploy-state"
LOG_FILE="$STATE_DIR/deploy-log.txt"
TIMEOUT="${DEPLOY_TIMEOUT:-60}"
DRY_RUN="${DEPLOY_DRY_RUN:-}"
CAN_ROLLBACK=""

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

run() {
  if [ -n "$DRY_RUN" ]; then
    log "DRY RUN: $*"
  else
    "$@"
  fi
}

cd "$DEPLOY_DIR"
mkdir -p "$STATE_DIR"

BUILD_SHA="$(git -C "$DEPLOY_DIR" rev-parse HEAD 2>/dev/null || echo 'unknown')"
export BUILD_SHA

log "==> LMS Deploy starting"
log "    Directory: $DEPLOY_DIR"
log "    Timeout:   ${TIMEOUT}s"
log "    Build SHA: $BUILD_SHA"
if [ -n "$(git -C "$DEPLOY_DIR" status --porcelain 2>/dev/null)" ]; then
  log "    WARNING: Working tree is dirty"
fi
[ -n "$DRY_RUN" ] && log "    DRY RUN MODE"

# --- Pre-deploy checks ---
log "==> Pre-deploy checks"

# Check docker is available
if ! command -v docker &>/dev/null; then
  log "ERROR: docker not found"
  exit 1
fi

if ! docker compose version &>/dev/null; then
  log "ERROR: docker compose not available"
  exit 1
fi

# Check disk space (need at least 500MB)
avail_mb=$(df -BM --output=avail "$DEPLOY_DIR" | tail -1 | tr -d ' M')
if [ "$avail_mb" -lt 500 ]; then
  log "ERROR: Insufficient disk space (${avail_mb}MB available, 500MB required)"
  exit 1
fi
log "    Disk: ${avail_mb}MB available"

# --- Save current state ---
log "==> Saving current image state"

project_name=$(docker compose config --format json 2>/dev/null | node -e "
  let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
    console.log(JSON.parse(d).name || 'lms-ammawallet')
  })
" 2>/dev/null) || project_name="lms-ammawallet"

api_image=$(docker inspect --format='{{.Image}}' lms-api 2>/dev/null) || api_image=""
web_image=$(docker inspect --format='{{.Image}}' lms-web 2>/dev/null) || web_image=""

if [ -n "$api_image" ] && [ -n "$web_image" ]; then
  echo "api=$api_image" > "$STATE_DIR/previous-images.txt"
  echo "web=$web_image" >> "$STATE_DIR/previous-images.txt"
  log "    Saved: api=$api_image"
  log "    Saved: web=$web_image"
  CAN_ROLLBACK="1"
else
  log "    WARNING: Could not capture current image IDs (first deploy?)"
  echo "api=" > "$STATE_DIR/previous-images.txt"
  echo "web=" >> "$STATE_DIR/previous-images.txt"
fi

# --- Build ---
log "==> Building images"
run docker compose build

# --- Deploy API (rolling) ---
log "==> Deploying API container"
run docker compose up -d --no-deps api

# Wait for API health
log "==> Waiting for API health..."
elapsed=0
while [ "$elapsed" -lt "$TIMEOUT" ]; do
  if [ -n "$DRY_RUN" ]; then
    log "DRY RUN: skipping health wait"
    break
  fi
  if curl -sf http://127.0.0.1:3001/health > /dev/null 2>&1; then
    log "    API healthy after ${elapsed}s"
    break
  fi
  sleep 2
  ((elapsed += 2))
done

if [ -z "$DRY_RUN" ] && [ "$elapsed" -ge "$TIMEOUT" ]; then
  log "ERROR: API did not become healthy within ${TIMEOUT}s"
  if [ -n "$CAN_ROLLBACK" ]; then
    log "==> Rolling back..."
    "$SCRIPT_DIR/rollback.sh"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] DEPLOY FAILED — API health timeout, rolled back" >> "$LOG_FILE"
  else
    log "WARNING: No previous state — cannot rollback (first deploy?)"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] DEPLOY FAILED — API health timeout, no previous state to rollback" >> "$LOG_FILE"
  fi
  exit 1
fi

# --- Deploy Web ---
log "==> Deploying Web container"
run docker compose up -d --no-deps web

# Give nginx a moment to start
sleep 2

# --- Smoke tests ---
log "==> Running smoke tests"
if [ -n "$DRY_RUN" ]; then
  log "DRY RUN: skipping smoke tests"
else
  if "$SCRIPT_DIR/smoke-test.sh"; then
    log "==> Smoke tests PASSED"
  else
    log "ERROR: Smoke tests FAILED"
    if [ -n "$CAN_ROLLBACK" ]; then
      log "==> Rolling back..."
      "$SCRIPT_DIR/rollback.sh"
      echo "[$(date '+%Y-%m-%d %H:%M:%S')] DEPLOY FAILED — smoke tests failed, rolled back" >> "$LOG_FILE"
    else
      log "WARNING: No previous state — cannot rollback (first deploy?)"
      echo "[$(date '+%Y-%m-%d %H:%M:%S')] DEPLOY FAILED — smoke tests failed, no previous state to rollback" >> "$LOG_FILE"
    fi
    exit 1
  fi
fi

# --- Build SHA verification ---
if [ -z "$DRY_RUN" ] && [ "$BUILD_SHA" != "unknown" ]; then
  actual_sha=$(curl -s http://127.0.0.1:3001/health | node -e "
    let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
      try{console.log(JSON.parse(d).buildSha||'ERROR')}catch{console.log('ERROR')}
    })
  " 2>/dev/null) || actual_sha="ERROR"
  if [ "$actual_sha" = "$BUILD_SHA" ]; then
    log "    Build SHA verified: $actual_sha"
  else
    log "    WARNING: Build SHA mismatch (expected=$BUILD_SHA, actual=$actual_sha)"
  fi
fi

# --- Success ---
log "==> Deploy SUCCESSFUL"
branch=$(git -C "$DEPLOY_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'unknown')
echo "[$(date '+%Y-%m-%d %H:%M:%S')] DEPLOY SUCCESS sha=$BUILD_SHA branch=$branch services=api,web" >> "$LOG_FILE"

# Prune old images
run docker image prune -f --filter "until=24h" 2>/dev/null || true

log "==> Done"
