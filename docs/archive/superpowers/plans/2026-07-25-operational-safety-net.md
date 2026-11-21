# Operational Safety Net Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Catch a low minter wallet balance and LMS downtime before they cause silent failures — via a cron-driven Horizon balance check script (NM-E1), an enhanced health endpoint (NM-E3), and documented external uptime monitor setup (NM-E2).

**Architecture:** NM-E3 is nearly done — `GET /api/v1/health` already exists and returns `{status, timestamp, db, ammaWallet}`. This plan adds a `version` field and writes one test to lock down the shape. NM-E1 is a bash cron script that queries Stellar Horizon for the minter wallet balance and emails ops if it drops below 5 XLM. NM-E2 is an ops task (UptimeRobot configuration) documented here.

**Tech Stack:** Bash, curl, jq, postfix (already installed), Stellar Horizon API, Express + better-sqlite3 (LMS backend), vitest + supertest (backend tests).

## Global Constraints

- LMS test runner: `cd LMS-Server && npx vitest run --sequence.shuffle=false` — must stay green
- LMS frontend deploy: N/A for this plan (backend + ops only)
- Cron scripts: `/home/webadmin/scripts/` directory; owned by `webadmin`; logged to `/home/webadmin/logs/`
- Alert email: `<alert_email>` (via postfix relay)
- Minter public key: found in `NFT_MINTER_SECRET` env var — derive with `stellar-sdk` or store `NFT_MINTER_PUBKEY` separately
- Horizon endpoint: `https://horizon.stellar.org/accounts/<pubkey>` (mainnet, no auth needed)
- Alert threshold: < 5 XLM (per spec)
- Alert cooldown: 6 hours (one alert per check interval — cron runs every 6h)
- `jq` is required — verify installed: `which jq || sudo apt-get install -y jq`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `LMS-Server/src/app.ts` | Modify | Add `version` field to `sendHealthJson()` |
| `LMS-Server/src/__tests__/health.test.ts` | Create | Verify health endpoint shape |
| `/home/webadmin/scripts/check-minter-balance.sh` | Create | Horizon balance check + email alert cron script |
| `/home/webadmin/logs/` | Create (dir) | Log directory for cron output |
| `amma-wallet-docker/HARDENING-CHECKLIST.md` | Modify | Mark NM-E2 as documented |

---

### Task 1: Verify and enhance LMS health endpoint (NM-E3)

**Files:**
- Modify: `LMS-Server/src/app.ts`
- Create: `LMS-Server/src/__tests__/health.test.ts`

**Context:** `sendHealthJson()` in `app.ts` already returns `{status, timestamp, db, ammaWallet}`. This task adds `version` (from `LMS_VERSION` env var or `"unknown"`) and writes a test that locks down the response shape so uptime monitors can rely on `status === "ok"`.

- [ ] **Step 1: Write the failing test**

Create `LMS-Server/src/__tests__/health.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';

describe('GET /api/v1/health', () => {
  it('HLT-1: returns 200 with status ok and required fields', async () => {
    const res = await request(app)
      .get('/api/v1/health')
      .expect(200);

    expect(res.body.status).toBe('ok');
    expect(typeof res.body.timestamp).toBe('string');
    expect(res.body.db).toBe('ok');
    expect(typeof res.body.version).toBe('string');
  });

  it('HLT-2: GET /health (bare) also returns 200', async () => {
    const res = await request(app)
      .get('/health')
      .expect(200);

    expect(res.body.status).toBe('ok');
  });

  it('HLT-3: no auth required', async () => {
    // Should succeed without any Authorization header
    await request(app)
      .get('/api/v1/health')
      .expect(200);
  });
});
```

- [ ] **Step 2: Run test to confirm HLT-1 fails (version field missing)**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server
npx vitest run --sequence.shuffle=false src/__tests__/health.test.ts 2>&1 | tail -15
```

Expected: HLT-1 fails with `version undefined`.

- [ ] **Step 3: Add version to sendHealthJson() in app.ts**

Find `sendHealthJson()` in `LMS-Server/src/app.ts`. Update it:

```typescript
function sendHealthJson(res: Response): void {
  let dbStatus: 'ok' | 'error' = 'ok';
  try { db.prepare('SELECT 1').get(); } catch { dbStatus = 'error'; }
  res.json({
    status: dbStatus === 'ok' ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    version: process.env.LMS_VERSION ?? 'unknown',
    db: dbStatus,
    ammaWallet: {
      url: !!process.env.AMMA_WALLET_URL,
      apiKey: !!process.env.AMMA_WALLET_API_KEY,
      network: process.env.AMMA_WALLET_NETWORK ?? 'testnet',
    },
  });
}
```

- [ ] **Step 4: Run tests to confirm HLT-1/2/3 pass**

```bash
npx vitest run --sequence.shuffle=false src/__tests__/health.test.ts 2>&1 | tail -10
```

Expected: 3 passed.

- [ ] **Step 5: Run full suite**

```bash
npx vitest run --sequence.shuffle=false 2>&1 | tail -5
```

Expected: `283 passed` (280 + 3 new; exact total depends on order of plan execution).

- [ ] **Step 6: Verify health response live in running container**

```bash
curl -s https://lms.smwebsystems.com/api/v1/health | python3 -m json.tool
```

Expected output:
```json
{
  "status": "ok",
  "timestamp": "2026-07-25T...",
  "version": "unknown",
  "db": "ok",
  "ammaWallet": { ... }
}
```

- [ ] **Step 7: Commit**

```bash
git add LMS-Server/src/app.ts LMS-Server/src/__tests__/health.test.ts
git commit -m "feat(NM-E3): add version field to health endpoint; add HLT-1–3 tests"
```

---

### Task 2: Minter wallet balance cron script (NM-E1)

**Files:**
- Create: `/home/webadmin/scripts/check-minter-balance.sh`
- Create: `/home/webadmin/logs/` (directory)

**Context:** The minter public key is derived from `NFT_MINTER_SECRET` stored in `LMS-Server/.env`. To avoid loading the secret in the script, store the minter PUBLIC key separately as `NFT_MINTER_PUBKEY` in `/home/webadmin/.env.secrets`. The script reads this, calls Horizon, parses XLM balance with `jq`, and emails ops if < 5 XLM.

- [ ] **Step 1: Get and store minter public key**

```bash
# Source the LMS env to get NFT_MINTER_SECRET
source /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server/.env 2>/dev/null || true

# Derive public key from secret (requires node + stellar-sdk)
# Run inside the lms-api container which has stellar-sdk:
docker exec lms-server node -e "
const sdk = require('@stellar/stellar-sdk');
const kp = sdk.Keypair.fromSecret(process.env.NFT_MINTER_SECRET);
console.log('NFT_MINTER_PUBKEY=' + kp.publicKey());
"
```

Copy the output line and append to `/home/webadmin/.env.secrets`:
```bash
echo "NFT_MINTER_PUBKEY=<NFT_MINTER_PUBKEY>" >> /home/webadmin/.env.secrets
```

(Replace the placeholder key above with the actual derived key.)

- [ ] **Step 2: Create log directory**

```bash
mkdir -p /home/webadmin/logs
touch /home/webadmin/logs/minter-balance.log
```

- [ ] **Step 3: Verify jq is installed**

```bash
which jq || sudo apt-get install -y jq
jq --version
```

Expected: `jq-1.6` or later.

- [ ] **Step 4: Write the cron script**

Create `/home/webadmin/scripts/check-minter-balance.sh`:

```bash
#!/usr/bin/env bash
# check-minter-balance.sh — NM-E1
# Checks the Stellar mainnet minter wallet balance every 6h.
# Emails <alert_email> if balance < 5 XLM.
# Cron: 0 */6 * * * /home/webadmin/scripts/check-minter-balance.sh >> /home/webadmin/logs/minter-balance.log 2>&1

set -euo pipefail

ALERT_EMAIL="<alert_email>"
ALERT_THRESHOLD="5"   # XLM — alert if balance drops below this
HORIZON_URL="https://horizon.stellar.org/accounts"
LOG_PREFIX="[$(date '+%Y-%m-%d %H:%M:%S')] [minter-balance]"
COOLDOWN_FILE="/tmp/minter-balance-alert-sent"

# Load minter public key from secrets
SECRETS_FILE="/home/webadmin/.env.secrets"
if [[ ! -f "$SECRETS_FILE" ]]; then
  echo "$LOG_PREFIX ERROR: secrets file not found at $SECRETS_FILE"
  exit 1
fi

MINTER_PUBKEY=$(grep '^NFT_MINTER_PUBKEY=' "$SECRETS_FILE" | cut -d= -f2 | tr -d '"' | tr -d "'")
if [[ -z "$MINTER_PUBKEY" ]]; then
  echo "$LOG_PREFIX ERROR: NFT_MINTER_PUBKEY not found in $SECRETS_FILE"
  exit 1
fi

echo "$LOG_PREFIX Checking balance for $MINTER_PUBKEY"

# Fetch account from Horizon
HTTP_STATUS=$(curl -s -o /tmp/minter-horizon-response.json -w "%{http_code}" \
  "${HORIZON_URL}/${MINTER_PUBKEY}")

if [[ "$HTTP_STATUS" != "200" ]]; then
  echo "$LOG_PREFIX ERROR: Horizon returned HTTP $HTTP_STATUS"
  exit 1
fi

# Extract XLM (native) balance
XLM_BALANCE=$(jq -r '
  .balances[]
  | select(.asset_type == "native")
  | .balance
' /tmp/minter-horizon-response.json)

if [[ -z "$XLM_BALANCE" ]]; then
  echo "$LOG_PREFIX ERROR: Could not parse XLM balance from Horizon response"
  exit 1
fi

echo "$LOG_PREFIX Minter wallet balance: ${XLM_BALANCE} XLM"

# Compare balance to threshold (using awk for float comparison)
IS_LOW=$(awk -v bal="$XLM_BALANCE" -v thresh="$ALERT_THRESHOLD" \
  'BEGIN { print (bal + 0 < thresh + 0) ? "1" : "0" }')

if [[ "$IS_LOW" == "1" ]]; then
  # Check cooldown (reset daily via tmpfs — no persistent state needed)
  COOLDOWN_DATE=$(date '+%Y-%m-%d')
  if [[ -f "$COOLDOWN_FILE" ]]; then
    LAST_ALERT_DATE=$(cat "$COOLDOWN_FILE")
    if [[ "$LAST_ALERT_DATE" == "$COOLDOWN_DATE" ]]; then
      echo "$LOG_PREFIX WARN: balance is low (${XLM_BALANCE} XLM) but alert already sent today — skipping"
      exit 0
    fi
  fi

  echo "$LOG_PREFIX ALERT: balance ${XLM_BALANCE} XLM is below threshold ${ALERT_THRESHOLD} XLM — sending email"

  SUBJECT="[ALERT] AmmaWallet minter wallet low: ${XLM_BALANCE} XLM"
  BODY="The AmmaWallet NFT minter wallet balance is critically low.

Wallet:   ${MINTER_PUBKEY}
Balance:  ${XLM_BALANCE} XLM
Threshold: ${ALERT_THRESHOLD} XLM

Action required: Top up the minter wallet before the next mint attempt.
See: https://stellar.expert/explorer/public/account/${MINTER_PUBKEY}

This alert will not repeat until tomorrow."

  echo "$BODY" | mail -s "$SUBJECT" -r "noreply@smwebsystems.com" "$ALERT_EMAIL"
  echo "$COOLDOWN_DATE" > "$COOLDOWN_FILE"
  echo "$LOG_PREFIX Alert email sent to $ALERT_EMAIL"
else
  echo "$LOG_PREFIX OK: balance ${XLM_BALANCE} XLM is above threshold"
fi

rm -f /tmp/minter-horizon-response.json
```

- [ ] **Step 5: Make executable and test manually**

```bash
chmod +x /home/webadmin/scripts/check-minter-balance.sh
/home/webadmin/scripts/check-minter-balance.sh
```

Expected output:
```
[2026-07-25 ...] [minter-balance] Checking balance for <NFT_MINTER_PUBKEY>...
[2026-07-25 ...] [minter-balance] Minter wallet balance: 16.09 XLM
[2026-07-25 ...] [minter-balance] OK: balance 16.09 XLM is above threshold
```

- [ ] **Step 6: Install cron entry**

```bash
(crontab -l 2>/dev/null; echo "0 */6 * * * /home/webadmin/scripts/check-minter-balance.sh >> /home/webadmin/logs/minter-balance.log 2>&1") | crontab -
crontab -l  # verify entry is present
```

Expected: cron entry shows up in crontab listing.

- [ ] **Step 7: Test alert path (temporary threshold)**

To verify the email path works, temporarily lower the threshold:

```bash
# Edit the script, change ALERT_THRESHOLD to 1000 (higher than current balance)
# Then run to trigger alert
sed 's/ALERT_THRESHOLD="5"/ALERT_THRESHOLD="1000"/' /home/webadmin/scripts/check-minter-balance.sh | bash
# Check inbox for alert email
# Then restore: edit the file back to ALERT_THRESHOLD="5"
```

- [ ] **Step 8: Commit**

```bash
cd /home/webadmin
git -C /home/webadmin/web-stack/html/LMS-AmmaWallet add docs/ 2>/dev/null || true
# The script lives outside the git repo — document its existence
echo "Script location: /home/webadmin/scripts/check-minter-balance.sh" >> /home/webadmin/web-stack/html/LMS-AmmaWallet/docs/superpowers/plans/2026-07-25-operational-safety-net.md
```

---

### Task 3: External uptime monitoring documentation (NM-E2)

**This is an ops task, not a code task.** It documents the UptimeRobot setup for the codebase.

- [ ] **Step 1: Set up UptimeRobot monitors**

1. Go to https://uptimerobot.com and log in (or create free account)
2. Add monitor for `lms.smwebsystems.com`:
   - Type: HTTP(s)
   - URL: `https://lms.smwebsystems.com/api/v1/health`
   - Interval: 5 minutes
   - Alert contact: <alert_email>
   - Keyword check (optional): `"status":"ok"`
3. Add monitor for `ammawallet.com`:
   - URL: `https://ammawallet.com/api/v1/health`
   - Same settings
4. Add monitor for `api.ammawallet.com`:
   - URL: `https://api.ammawallet.com/api/v1/health`
   - Same settings

- [ ] **Step 2: Verify monitors are green**

After 5–10 minutes, confirm all monitors show "Up" status in UptimeRobot dashboard.

- [ ] **Step 3: Update HARDENING-CHECKLIST.md**

Open `/home/webadmin/amma-wallet-docker/HARDENING-CHECKLIST.md`. Find the P2 (external uptime monitoring) entry and mark it DONE:

```markdown
- [x] **P2** — External uptime monitoring: UptimeRobot 5-min checks for
  lms.smwebsystems.com, ammawallet.com, api.ammawallet.com (all checking /api/v1/health).
  Set up 2026-07-25.
```

- [ ] **Step 4: Commit documentation update**

```bash
git -C /home/webadmin/amma-wallet-docker add HARDENING-CHECKLIST.md
git -C /home/webadmin/amma-wallet-docker commit -m "ops(NM-E2): mark external uptime monitoring DONE in hardening checklist"
```

---

## Self-Review Checklist

- [x] **Spec coverage:** NM-E1 (Task 2 cron script), NM-E2 (Task 3 UptimeRobot), NM-E3 (Task 1 health endpoint) — all covered
- [x] **No placeholders:** all bash code, email body, and jq expressions are complete
- [x] **Health endpoint already existed:** plan correctly extends it (version field only) rather than rebuilding
- [x] **Cooldown logic included:** alert once per day, not every 6h — prevents email flooding
- [x] **Alert test step included:** shows how to verify email path works
- [x] **jq dependency check included:** Step 3 in Task 2
- [x] **Test count:** starts at 280, ends at 283 (+ 3 HLT tests); no backend changes for E1/E2
