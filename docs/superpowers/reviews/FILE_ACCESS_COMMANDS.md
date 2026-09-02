# File Access Commands — Quick Reference

> Date: 2026-07-29
> Base path: `/home/webadmin/web-stack/html/amma-wallet`

---

## Navigation

```bash
# Go to repo root
cd /home/webadmin/web-stack/html/amma-wallet

# Go to audit docs
cd docs/superpowers/reviews

# Go to backend source
cd packages/backend/src

# Go to frontend source
cd packages/web-app/src
```

---

## Start Here — Reading Order

```bash
# 1. Quick overview (5 min)
cat docs/superpowers/reviews/EXECUTIVE_SUMMARY.md

# 2. Full handoff package guide (3 min)
cat docs/superpowers/reviews/FINAL_AUDIT_HANDOFF_PACKAGE.md

# 3. Detailed narrative (10 min)
cat docs/superpowers/reviews/AUDIT_NARRATIVE.md

# 4. Evidence mapping (5 min)
cat docs/superpowers/reviews/AUDIT_EVIDENCE_INDEX.md

# 5. Final closure (1 min)
cat docs/superpowers/reviews/AUDIT_CLOSURE_MEMO.md
```

---

## Quick Previews (first 30 lines)

```bash
# Executive summary preview
head -30 docs/superpowers/reviews/EXECUTIVE_SUMMARY.md

# Findings database preview
head -50 FINDINGS.md

# Cumulative status preview
head -40 CUMULATIVE_STATUS.md

# Manual audit checklist preview
head -45 docs/superpowers/reviews/MANUAL_AUDIT_CHECKLIST.md

# Batch 5 strategy preview
head -30 docs/superpowers/reviews/BATCH5_OPTIONAL_STRATEGY.md
```

---

## Primary Status Files

```bash
# Master findings database (319 entries)
cat FINDINGS.md

# Cumulative status with severity breakdowns
cat CUMULATIVE_STATUS.md

# Deferred backlog with fix markers
cat TODO_LOW_PRIORITY.md
```

---

## Manual Audit Package

```bash
# System scope and feature map
cat docs/superpowers/reviews/MANUAL_AUDIT_SCOPE.md

# Full checklist (141 tests)
cat docs/superpowers/reviews/MANUAL_AUDIT_CHECKLIST.md

# Tester setup and procedures
cat docs/superpowers/reviews/MANUAL_AUDIT_TESTER_GUIDE.md

# Findings tracker template
cat docs/superpowers/reviews/MANUAL_AUDIT_FINDINGS_TRACKER.md

# Execution TODO tracker
cat docs/superpowers/todos/MANUAL_AUDIT_TODO.md
```

---

## Batch Artifacts

```bash
# Batch 1 (9 LOW fixes)
cat docs/superpowers/specs/BACKLOG_BATCH1_DEV_SPEC.md
cat docs/superpowers/plans/BACKLOG_BATCH1_IMPLEMENTATION_PLAN.md
cat docs/superpowers/reviews/BACKLOG_BATCH1_CODE_REVIEW_CHECKLIST.md

# Batch 2 (10 fixes)
cat docs/superpowers/specs/BACKLOG_BATCH2_DEV_SPEC.md
cat docs/superpowers/plans/BACKLOG_BATCH2_IMPLEMENTATION_PLAN.md
cat docs/superpowers/reviews/BACKLOG_BATCH2_CODE_REVIEW_CHECKLIST.md

# Batch 3 (11 security fixes)
cat docs/superpowers/specs/BACKLOG_BATCH3_DEV_SPEC.md
cat docs/superpowers/plans/BACKLOG_BATCH3_IMPLEMENTATION_PLAN.md
cat docs/superpowers/reviews/BACKLOG_BATCH3_CODE_REVIEW_CHECKLIST.md

# Batch 4 (TOCTOU fix)
cat docs/superpowers/specs/BACKLOG_BATCH4_DEV_SPEC.md
cat docs/superpowers/plans/BACKLOG_BATCH4_IMPLEMENTATION_PLAN.md
cat docs/superpowers/reviews/BACKLOG_BATCH4_CODE_REVIEW_CHECKLIST.md
```

---

## Search Commands

```bash
# Find all CRITICAL findings
grep -n "CRITICAL" FINDINGS.md

# Find all resolved findings
grep -n "✅" TODO_LOW_PRIORITY.md

# Count tests per section in manual audit
grep -c "^### " docs/superpowers/reviews/MANUAL_AUDIT_CHECKLIST.md

# List all test IDs
grep "^### " docs/superpowers/reviews/MANUAL_AUDIT_CHECKLIST.md

# Find a specific finding by ID
grep -A 5 "P1-2-F2" FINDINGS.md

# Find a specific test by ID
grep -A 10 "AUTH-001" docs/superpowers/reviews/MANUAL_AUDIT_CHECKLIST.md

# Search all audit docs for a keyword
grep -rl "TOCTOU" docs/superpowers/

# Count tests by section
for p in AUTH TOTP WALLET STELLAR ADMIN SSO SEC BILLING CONTACT TOKEN PORT MISC REG EXP; do
  c=$(grep -c "^### ${p}-" docs/superpowers/reviews/MANUAL_AUDIT_CHECKLIST.md)
  echo "$p: $c"
done

# Find all Mermaid diagrams
grep -rn "mermaid" docs/superpowers/reviews/MANUAL_AUDIT_*.md
```

---

## Git Commands

```bash
# Recent history
git log --oneline -15

# All tags
git tag -l | sort

# Diff since a batch
git diff batch3-complete-2026-07-28..batch4-complete-2026-07-29 --stat

# Files changed in a batch
git log --oneline batch3-complete-2026-07-28..batch4-complete-2026-07-29

# View merge commit
git show 01d17bd --stat
```

---

## VS Code Commands

```bash
# Open repo
code /home/webadmin/web-stack/html/amma-wallet

# Open specific files
code docs/superpowers/reviews/EXECUTIVE_SUMMARY.md
code docs/superpowers/reviews/MANUAL_AUDIT_CHECKLIST.md
code docs/superpowers/reviews/FINAL_AUDIT_HANDOFF_PACKAGE.md
code FINDINGS.md
code CUMULATIVE_STATUS.md
```

---

## Production Operations

```bash
# Health check
/home/webadmin/scripts/amma-monitor.sh

# Container status
docker ps --filter name=amma

# API logs
docker logs amma-api --tail 50

# Run backend tests
cd packages/backend && npx vitest run

# Run web-app tests
cd packages/web-app && npx vitest run

# Deploy (after merge to main)
cd /home/webadmin/amma-wallet-docker
docker compose build amma-api
docker compose up -d --no-deps amma-api
```

---

## Key Source Files

```bash
# Billing TOCTOU fix (Batch 4)
cat packages/backend/src/services/billing.service.ts | head -350

# Wallet creation with billing check
cat packages/backend/src/routes/wallets.ts

# Auth middleware
cat packages/backend/src/middleware/auth.ts

# Rate limiting
grep -n "rateLimit" packages/backend/src/routes/auth.ts

# TOCTOU test suite
cat packages/backend/src/services/billing-toctou.test.ts
```
