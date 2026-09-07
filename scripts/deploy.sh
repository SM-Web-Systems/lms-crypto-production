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

DB_VOLUME_PATH="/var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db"
BACKUP_DIR="/home/webadmin/backups/lms-ammawallet-db"

# --- Pre-deploy DB backup (Hardening Item 2, Incident 2026-09-06) ---
backup_db() {
  log "==> Creating pre-deploy DB backup"
  mkdir -p "$BACKUP_DIR"
  local ts
  ts=$(date +%Y%m%d_%H%M%S)
  local backup_file="$BACKUP_DIR/pre-deploy_${ts}.db"

  if [ -n "$DRY_RUN" ]; then
    log "DRY RUN: would backup $DB_VOLUME_PATH → $backup_file"
    return 0
  fi

  if ! sudo test -f "$DB_VOLUME_PATH"; then
    log "WARNING: DB not found at $DB_VOLUME_PATH — skipping backup (first deploy?)"
    return 0
  fi

  # Use SQLite .backup for WAL-safe snapshot
  sudo sqlite3 "$DB_VOLUME_PATH" ".backup '$backup_file'" || {
    log "ERROR: Pre-deploy DB backup failed. Aborting deploy."
    exit 1
  }
  sudo chown webadmin:webadmin "$backup_file"
  chmod 600 "$backup_file"

  local size
  size=$(stat -c%s "$backup_file" 2>/dev/null || echo 0)
  if [ "$size" -lt 4096 ]; then
    log "ERROR: Pre-deploy backup is suspiciously small (${size} bytes). Aborting deploy."
    exit 1
  fi

  log "    Backup: $backup_file ($size bytes)"
  echo "$backup_file" > "$STATE_DIR/pre-deploy-backup.txt"
}

# --- Post-deploy data validation (Hardening Item 3, Incident 2026-09-06) ---
# Minimum thresholds based on known production baseline (Sep 2026)
MIN_USERS=10
MIN_COURSES=3
MIN_NFTS=5

verify_data() {
  log "==> Verifying data integrity (row-count check)"

  if [ -n "$DRY_RUN" ]; then
    log "DRY RUN: would verify row counts"
    return 0
  fi

  local counts
  counts=$(docker exec lms-api node -e "
    const Database = require('better-sqlite3');
    const db = new Database('/app/data/student_ms.db', { readonly: true });
    const r = {};
    for (const t of ['users','courses','nft_credentials']) {
      r[t] = db.prepare('SELECT COUNT(*) as c FROM '+t).get().c;
    }
    console.log(JSON.stringify(r));
    db.close();
  " 2>/dev/null) || counts=""

  if [ -z "$counts" ]; then
    log "WARNING: Could not query row counts (container not ready?). Skipping data check."
    return 0
  fi

  local users courses nfts
  users=$(echo "$counts" | python3 -c "import sys,json; print(json.load(sys.stdin)['users'])" 2>/dev/null) || users=0
  courses=$(echo "$counts" | python3 -c "import sys,json; print(json.load(sys.stdin)['courses'])" 2>/dev/null) || courses=0
  nfts=$(echo "$counts" | python3 -c "import sys,json; print(json.load(sys.stdin)['nft_credentials'])" 2>/dev/null) || nfts=0

  log "    Row counts: users=$users courses=$courses nft_credentials=$nfts"

  if [ "$users" -lt "$MIN_USERS" ] || [ "$courses" -lt "$MIN_COURSES" ] || [ "$nfts" -lt "$MIN_NFTS" ]; then
    log "CRITICAL: Data integrity check FAILED! Counts below thresholds (min: users=$MIN_USERS courses=$MIN_COURSES nfts=$MIN_NFTS)"
    local pre_deploy_backup
    pre_deploy_backup=$(cat "$STATE_DIR/pre-deploy-backup.txt" 2>/dev/null || echo "")
    if [ -n "$pre_deploy_backup" ] && [ -f "$pre_deploy_backup" ]; then
      log "    Pre-deploy backup available at: $pre_deploy_backup"
      log "    MANUAL RESTORE REQUIRED — review before restoring."
    fi
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] DEPLOY FAILED — data integrity check: users=$users courses=$courses nfts=$nfts" >> "$LOG_FILE"
    exit 1
  fi

  log "    Data integrity OK"
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

# --- Pre-deploy DB backup ---
backup_db

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
  if curl -sf https://lms.smwebsystems.com/api/v1/health > /dev/null 2>&1; then
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

# --- Post-deploy data validation ---
verify_data

# --- Build SHA verification ---
if [ -z "$DRY_RUN" ] && [ "$BUILD_SHA" != "unknown" ]; then
  actual_sha=$(curl -s https://lms.smwebsystems.com/api/v1/health | node -e "
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
