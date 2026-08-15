# Post-Release Follow-Up TODO — Outbox, Redeploy, NFT Mint

**Date:** 2026-08-15
**Base commit:** a7549b1

## Item 1: Outbox Schema Mismatch

| Field | Value |
|-------|-------|
| Status | **COMPLETE** |
| Root Cause | Spot check queried `webhook_events` (no `status` column) instead of `reward_event_outbox` |
| Fix Required | None — correct table documented, stats retrieved |

| Task ID | Priority | Objective | Status |
|---------|----------|-----------|--------|
| OUT-1 | P0 | Identify correct outbox table | VERIFIED |
| OUT-2 | P0 | Query production outbox stats | VERIFIED |
| OUT-3 | P2 | Update spot-check report with correct stats | COMPLETE |
| OUT-4 | P3 | Consider exposing outbox stats via `/healthz` | NOT STARTED |

**Production outbox stats (2026-08-15):** 0 pending, 0 failed, 0 dead-lettered, 0 completed.
**Webhook events:** 0 total.

---

## Item 2: Frontend Docker Redeploy

| Field | Value |
|-------|-------|
| Status | **READY FOR DEPLOYMENT** |
| Fix Commit | a7549b1 — TS-only (type imports, property names) |
| Runtime Impact | None — no API/env/behavior change |
| Rollback | `docker compose up -d --no-deps web` with previous image tag |

| Task ID | Priority | Objective | Preconditions | Verification | Status |
|---------|----------|-----------|---------------|--------------|--------|
| FE-1 | P0 | Confirm fix is TS-only | Read diff | `git diff a7549b1~1..a7549b1 -- LMS-Frontend/` | VERIFIED |
| FE-2 | P0 | Docker build succeeds | FE-1 | `docker compose build web` → exit 0 | VERIFIED |
| FE-3 | P0 | Frontend tests pass | — | `cd LMS-Frontend && npx vitest run` → 206/206 | VERIFIED |
| FE-4 | P0 | E2E tests pass | — | `cd e2e && npx playwright test` → 14/14 | VERIFIED |
| FE-5 | P1 | Redeploy frontend container | FE-2, FE-3, FE-4, **human approval** | `docker compose up -d --no-deps web` | **AWAITING APPROVAL** |
| FE-6 | P1 | Verify HTTPS after redeploy | FE-5 | `curl -s -o /dev/null -w '%{http_code}' https://lms.smwebsystems.com/` → 200 | NOT STARTED |

**Redeploy command (requires approval):**
```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet
docker compose up -d --no-deps web
```

---

## Item 3: NFT Mint Verification

| Field | Value |
|-------|-------|
| Status | **BLOCKED** |
| Blockers | No testnet contract; production requires authorized admin mint |
| Risk Level | Low — mintService.ts had zero code changes |

| Task ID | Priority | Objective | Preconditions | Status |
|---------|----------|-----------|---------------|--------|
| NFT-1 | P0 | Confirm mintService.ts unchanged | — | VERIFIED (zero diff) |
| NFT-2 | P0 | Confirm SDK v16 imports work at runtime | — | VERIFIED (stellar-sdk-import.test.ts passes) |
| NFT-3 | P0 | Confirm all mint-related tests pass | — | VERIFIED (1091/1091 BE) |
| NFT-4 | P1 | Parameterize network passphrase for testnet | Design decision | NOT STARTED |
| NFT-5 | P1 | Deploy testnet contract | NFT-4 | BLOCKED |
| NFT-6 | P1 | Execute testnet mint | NFT-5 | BLOCKED |
| NFT-7 | P2 | First production mint verification | Authorized admin + approved application | BLOCKED |

---

## Decision Matrix

| Decision | Options | Recommendation |
|----------|---------|----------------|
| Frontend redeploy timing | Now vs. wait for 24h monitoring | Now — fix is TS-only, zero runtime risk |
| NFT verification approach | Testnet-first vs. production opportunistic | Testnet-first if time permits; otherwise wait for natural production mint |
| Outbox monitoring | Status quo vs. expose via `/healthz` | Defer — outbox is clean, scheduler handles retries |
