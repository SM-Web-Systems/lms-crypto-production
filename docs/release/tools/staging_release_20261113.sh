#!/usr/bin/env bash
# Staging release for 2026-11-13 (after the LMS-062 window). Run on the staging server as webadmin.
# Usage: staging_release_20261113.sh <phase> <sha>
#   build   <sha>  git archive -> docker build api + web with BUILD_SHA labels; prints image IDs
#   check   <sha>  synthetic API start on a throwaway copy of an empty DB + web nginx config test
#   deploy  <sha>  writer hold -> fresh .backup -> overlay with new images -> compose up -> verify -> release hold
#   rollback       previous overlay (6ae3127) -> compose up -> verify
set -euo pipefail
PHASE=${1:?phase}; SHA=${2:-}
REPO=/home/webadmin/lms-crypto-production
STATE=/home/webadmin/backups/lms-ammawallet-db
OVERLAYS=$STATE/staging-overlays
# Start from the overlay of the release that is LIVE (named in approved-release.json), so a config change made in an
# earlier release (a rotated key, a new setting) is never silently undone by the next one.
APPROVED_SHA=$(python3 -c "import json;print(json.load(open('$STATE/release-state/approved-release.json'))['approved_sha'])" 2>/dev/null || true)
LIVE_OVERLAY=$OVERLAYS/${APPROVED_SHA:0:7}-paystack-test-offline15-push-testnet-rewards-minbuild9.json
PREV_OVERLAY=${PREV_OVERLAY:-$LIVE_OVERLAY}
[ -f "$PREV_OVERLAY" ] || { echo "base overlay not found: $PREV_OVERLAY (set PREV_OVERLAY)"; exit 4; }
WORK=/home/webadmin/lms-release-${SHA:0:7}
log(){ echo "[$(date -u +%FT%TZ)] $*"; }

case "$PHASE" in
build)
  [[ $SHA =~ ^[0-9a-f]{40}$ ]] || { echo "full 40-char sha required"; exit 2; }
  mkdir -p "$WORK" && cd "$REPO" && git fetch -q origin main && git cat-file -e "$SHA^{commit}"
  git archive --format=tar "$SHA" LMS-Server LMS-Frontend > "$WORK/source.tar"
  rm -rf "$WORK/source" && mkdir "$WORK/source" && tar -xf "$WORK/source.tar" -C "$WORK/source"
  sha256sum "$WORK/source.tar" | tee "$WORK/source.sha256"
  nice -n 10 docker build -q --build-arg BUILD_SHA="$SHA" -t "lms-release-api:$SHA" "$WORK/source/LMS-Server" > "$WORK/api.id"
  nice -n 10 docker build -q --build-arg BUILD_SHA="$SHA" --build-arg VITE_AMMA_WALLET_URL=https://ammawallet.com/ -t "lms-release-web:$SHA" "$WORK/source/LMS-Frontend" > "$WORK/web.id"
  for k in api web; do id=$(cat "$WORK/$k.id"); rev=$(docker image inspect "$id" -f '{{index .Config.Labels "org.opencontainers.image.revision"}}'); log "$k $id revision=$rev"; [[ $rev == "$SHA" ]]; done
  ;;
check)
  # Start the new API on a COPY of last night's backup (real schema and data shape, no network),
  # so startup migrations such as the new reward_claims table run against staging data.
  API=$(cat "$WORK/api.id"); WEB=$(cat "$WORK/web.id"); TMP=$(mktemp -d "$WORK/synthetic.XXXX")
  SRC=$(ls -t $STATE/student_ms_*.db | head -1); cp "$SRC" "$TMP/student_ms.db"; chmod -R a+rwX "$TMP"
  cid=$(docker run -d --rm --network none -e NODE_ENV=production -e JWT_SECRET=synthetic-only-$(openssl rand -hex 16) -e DATABASE_PATH=/data/student_ms.db -v "$TMP:/data" "$API")
  for i in $(seq 1 30); do docker exec "$cid" node -e "fetch('http://127.0.0.1:3001/api/v1/health').then(r=>r.json()).then(j=>{console.log(j.status,j.buildSha);process.exit(j.buildSha==='$SHA'?0:1)}).catch(()=>process.exit(1))" && break; sleep 2; done
  docker exec "$cid" node -e "const D=require('better-sqlite3');const db=new D('/data/student_ms.db',{readonly:true});console.log('reward_claims', !!db.prepare(\"select 1 from sqlite_master where name='reward_claims'\").get())"
  docker logs "$cid" 2>&1 | grep -iE "refus|error" | head -5 || true
  docker stop "$cid" >/dev/null; rm -rf "$TMP"; docker run --rm --network none "$WEB" nginx -t
  log "synthetic checks passed (copy of $(basename "$SRC"))"
  ;;
deploy)
  API=$(cat "$WORK/api.id"); WEB=$(cat "$WORK/web.id")
  NEW=$OVERLAYS/${SHA:0:7}-paystack-test-offline15-push-testnet-rewards-minbuild9.json
  PAYOUT_ENV=/home/webadmin/.config/lms-provider-preparation/reward-testnet-payout.env  # REWARD_PAYOUT_SECRET=S... (testnet pool only, mode 600)
  [ "$(stat -c %a "$PAYOUT_ENV")" = 600 ] || { echo "payout env missing or not 600"; exit 3; }
  MAINNET_ENV=/home/webadmin/.config/lms-provider-preparation/reward-mainnet-payout.env  # REWARD_MAINNET_POOL_PUBLIC / REWARD_MAINNET_PAYOUT_SECRET (mode 600)
  if [ "${MAINNET_PAYOUTS:-0}" = 1 ]; then [ "$(stat -c %a "$MAINNET_ENV")" = 600 ] || { echo "mainnet payout env missing or not 600"; exit 3; }; fi
  MAINNET_PAYOUTS=${MAINNET_PAYOUTS:-0} CLAIM_COOLDOWN_HOURS=${CLAIM_COOLDOWN_HOURS:-24} TREASURY_SOURCE=${TREASURY_SOURCE:-} CLAIM_NETWORK_LINE=${CLAIM_NETWORK_LINE:-} python3 - "$PREV_OVERLAY" "$NEW" "$API" "$WEB" "$PAYOUT_ENV" "$MAINNET_ENV" <<'PY'
import json,sys,os
src,dst,api,web,penv,menv=sys.argv[1:]
def read(path): return dict(l.strip().split('=',1) for l in open(path) if '=' in l)
d=json.load(open(src))
d['services']['api']['image']=api; d['services']['web']['image']=web
env=d['services']['api']['environment']
# Web push keys (generated once on the server, never displayed): merged in when the file exists.
wp='/home/webadmin/.config/lms-provider-preparation/web-push-vapid.env'
if os.path.exists(wp):
    env.update(read(wp))
# AmmaWallet testnet activation (separate from sign-in): file holds AMMA_TESTNET_ACTIVATION_API_KEY=... (mode 600); the signing key is read from its PEM.
net=os.environ.get('ACTIVATION_NETWORK','testnet')  # testnet (default) or mainnet: mainnet needs its own tenant key file, never the sign-in key
act='/home/webadmin/.config/lms-provider-preparation/amma-%s-activation.env' % net
keyname='AMMA_%s_ACTIVATION_API_KEY' % net.upper()
defbase='https://api.ammawallet.com' if net=='mainnet' else 'https://testnet.ammawallet.com'
pem='/home/webadmin/.config/lms-activation/lms-staging-2026-11.ed25519.pem'
if os.environ.get('ACTIVATION_OFF')=='1':
    for k in [k for k in env if k.startswith('AMMA_ACTIVATION_')]: env.pop(k)
elif os.path.exists(pem) and (net=='mainnet' or os.path.exists(act)):
    import base64
    # Mainnet activation uses the production partner key already used for mainnet sign-in (AmmaWallet gave it activation scopes on 2026-11-17); testnet uses its own file.
    if net=='mainnet':
        a={'AMMA_MAINNET_ACTIVATION_API_KEY': read('/home/webadmin/lms-crypto-production/LMS-Server/.env').get('AMMA_WALLET_API_KEY','').strip()}
    else:
        a=read(act)
    key=a.get(keyname,'')
    if key:
        env.update({'AMMA_ACTIVATION_ENABLED':'on','AMMA_ACTIVATION_BASE_URL':a.get('AMMA_ACTIVATION_BASE_URL',defbase),
          'AMMA_ACTIVATION_API_KEY':key,'AMMA_ACTIVATION_KEY_ID':'lms-staging-2026-11',
          'AMMA_ACTIVATION_PRIVATE_KEY_B64':base64.b64encode(open(pem,'rb').read()).decode()})
if os.environ.get('MAINNET_PAYOUTS')=='1':
    m=read(menv); secret=m['REWARD_MAINNET_PAYOUT_SECRET']; pool=m['REWARD_MAINNET_POOL_PUBLIC']
    assert secret.startswith('S') and len(secret)==56 and pool.startswith('G') and len(pool)==56
    env.update({'REWARD_STELLAR_NETWORK':'public','REWARD_STELLAR_DESTINATION':pool,'REWARD_PAYOUT_SECRET':secret,
      'REWARD_MAINNET_PAYOUTS':'on','REWARD_PAYOUT_MAX_CLAIM_STROOPS':os.environ.get('MAX_CLAIM_STROOPS','1000000'),'REWARD_PAYOUT_DAILY_CAP_STROOPS':'10000000',
      'REWARD_TREASURY_PILOT_TOTAL_STROOPS':'100000000','REWARD_CLAIM_NEW_WALLET_COOLDOWN_HOURS':os.environ.get('CLAIM_COOLDOWN_HOURS','24')})
    if os.environ.get('CLAIM_NETWORK_LINE')=='1': env['REWARD_CLAIM_NETWORK_LINE']='on'
    ts=os.environ.get('TREASURY_SOURCE','')
    if ts:
        assert ts.startswith('G') and len(ts)==56  # public sending account for backing deposits (not a secret)
        env['REWARD_TREASURY_SOURCE_ACCOUNT']=ts
else:
    secret=read(penv)['REWARD_PAYOUT_SECRET']; assert secret.startswith('S') and len(secret)==56
    env.update({'REWARD_STELLAR_NETWORK':'testnet',
      'REWARD_STELLAR_DESTINATION':'GCEZVCKKLHVRLPGLL66UVNRPWM42PWSW44ALII73YQFNPIC2EW7DUY3M',
      'REWARD_TREASURY_PILOT_TOTAL_STROOPS':'100000000','REWARD_PAYOUT_SECRET':secret,'REWARD_CLAIM_NEW_WALLET_COOLDOWN_HOURS':os.environ.get('CLAIM_COOLDOWN_HOURS','24')})
    for k in ('REWARD_MAINNET_PAYOUTS','REWARD_PAYOUT_MAX_CLAIM_STROOPS','REWARD_PAYOUT_DAILY_CAP_STROOPS'): env.pop(k,None)
os.umask(0o077); json.dump(d,open(dst,'w'),indent=1); print(dst, env['REWARD_STELLAR_NETWORK'])
PY
  log "writer hold on"; docker exec lms-api touch /app/data/.writer-hold
  sleep 5
  BK=$STATE/pre-${SHA:0:7}-$(date -u +%Y%m%dT%H%M%SZ).sqlite3
  docker exec lms-api node -e "require('better-sqlite3')('/app/data/student_ms.db',{readonly:true}).backup('/app/data/release-backup.sqlite3').then(()=>console.log('backup ok'))"
  (umask 077; docker cp lms-api:/app/data/release-backup.sqlite3 "$BK"); docker exec lms-api rm -f /app/data/release-backup.sqlite3; sha256sum "$BK" | tee "$BK.sha256"
  cd "$REPO" && docker compose -f docker-compose.yml -f "$NEW" up -d
  for i in $(seq 1 40); do s=$(docker inspect -f '{{.State.Health.Status}}' lms-api); [ "$s" = healthy ] && break; sleep 3; done
  curl -s https://lms.smwebsystems.com/api/v1/health | python3 -c "import sys,json;j=json.load(sys.stdin);print(j['status'],j['buildSha'],j['writerHold']);sys.exit(0 if j['buildSha']=='$SHA' else 1)"
  docker exec lms-api rm -f /app/data/.writer-hold; log "writer hold released"
  python3 - "$STATE/release-state/approved-release.json" "$SHA" <<'PY'
import json,sys
p,sha=sys.argv[1:]; d=json.load(open(p)); d['approved_sha']=sha; d['manifest_id']=f'staging-{sha[:7]}-same-schema'; json.dump(d,open(p,'w'))
PY
  log "approved-release.json -> $SHA"
  ;;
rollback)
  docker exec lms-api touch /app/data/.writer-hold; cd "$REPO" && docker compose -f docker-compose.yml -f "$PREV_OVERLAY" up -d
  for i in $(seq 1 40); do s=$(docker inspect -f '{{.State.Health.Status}}' lms-api); [ "$s" = healthy ] && break; sleep 3; done
  docker exec lms-api rm -f /app/data/.writer-hold; log "rolled back to $PREV_OVERLAY (repoint approved-release.json to 6ae3127 by hand)"
  ;;
*) echo "unknown phase"; exit 2;;
esac
