# Production Repo Sync — AW-ADMIN-001…007 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Push completed AW-ADMIN-001 through AW-ADMIN-007 admin-console work to `origin/main` (`SM-Web-Systems/amma-wallet-production`) with zero secrets, PII, or credentials in any committed file.

**Architecture:** The repo already tracks `origin/main` and is 2 commits ahead. Six source files and two new doc directories are unstaged. We redact two identified items (a real user's Stellar public key and an admin email in planning docs), then commit in two logical batches (source code, then docs/diagrams), and push all commits together.

**Tech Stack:** TypeScript/React (Vite), Fastify backend, Drizzle ORM, Vitest, git, GitHub

## Global Constraints

- NEVER commit `.env`, `app.env`, or any file with real secret values — gitignore enforces this but verify
- NEVER leave a real Stellar secret key (`S…`), API token, password, or private key in any committed file
- Stellar *public* keys (`G…`) of real users must be redacted to `GTEST…` placeholders in docs
- Real email addresses of administrators must be replaced with `<admin_email>` in docs/examples
- All 214 backend tests must remain passing before push (confirmed state from this session)
- Repo: `/home/webadmin/web-stack/html/amma-wallet/` — branch `main`, remote `origin`

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `docs/superpowers/plans/2026-07-25-nft-credential-transparency.md` | Modify line 296 | Redact real user Stellar public key → placeholder |
| `docs/superpowers/plans/2026-07-26-aw-admin-003-004-credit-notes.md` | Modify line 268 | Redact admin email → `<admin_email>` |
| `packages/backend/src/routes/admin.ts` | Commit (already modified) | AW-ADMIN-005: new `GET /api/v1/internal/tenants/:id/events` cursor-pagination endpoint |
| `packages/backend/src/routes/admin-billing.test.ts` | Commit (already modified) | Tests for AW-ADMIN-005 billing-event pagination endpoint |
| `packages/backend/src/services/billing.service.ts` | Commit (already modified) | `getTenantBillingEventsPage()` + `tenantName`/`tenantSlug` additions |
| `packages/web-app/src/pages/AdminAdmins.tsx` | Commit (already modified) | AW-ADMIN-006: full admin lifecycle (invite, deactivate, reactivate, reset password) |
| `packages/web-app/src/pages/AdminConsole.tsx` | Commit (already modified) | Minor breadcrumb/link fix |
| `packages/web-app/src/pages/AdminTenantDetail.tsx` | Commit (already modified) | AW-ADMIN-001 (confirm modal), AW-ADMIN-002 (tenant name breadcrumb), AW-ADMIN-005 (Load older), AW-ADMIN-007 (soft/hard suspend selector) |
| `docs/diagrams/*.mmd` (9 files) | Add untracked | Mermaid flow diagrams for admin console features |
| `docs/superpowers/plans/*.md` (6 files) | Add untracked | Implementation plans and UX audit notes |
| `docs/superpowers/specs/*.md` (2 files) | Add untracked | Design specs |

---

### Task 1: Redact sensitive values in planning docs

**Files:**
- Modify: `docs/superpowers/plans/2026-07-25-nft-credential-transparency.md:296`
- Modify: `docs/superpowers/plans/2026-07-26-aw-admin-003-004-credit-notes.md:268`

**Interfaces:**
- Produces: clean docs with no real user wallet addresses or admin emails

- [ ] **Step 1: Redact the Stellar public key**

Open `docs/superpowers/plans/2026-07-25-nft-credential-transparency.md`.
Find line 296:
```typescript
const TEST_WALLET = '[REAL_WALLET_REDACTED — replaced with placeholder]';
```
Replace with:
```typescript
const TEST_WALLET = 'GTESTWALLETADDRESSPLACEHOLDERXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
```

- [ ] **Step 2: Redact the admin email**

Open `docs/superpowers/plans/2026-07-26-aw-admin-003-004-credit-notes.md`.
Find line 268:
```bash
    -d '{"email":"<admin_email>","password":"<admin_password>"}' \
```
Replace with:
```bash
    -d '{"email":"<admin_email>","password":"<admin_password>"}' \
```

- [ ] **Step 3: Verify no other sensitive strings remain in untracked docs**

```bash
grep -rn "GBOH\|mukhtar\|christopher-fourquier\|cfat_\|amma_de\|TestnetAmma\|stellarwallet" \
  docs/superpowers/ docs/diagrams/ 2>/dev/null
```
Expected: zero matches. If any appear, redact before continuing.

- [ ] **Step 4: Final Stellar secret-key scan (GS… pattern) across all staged + untracked files**

```bash
grep -rn "S[A-Z2-7]\{55\}" \
  packages/backend/src/routes/admin.ts \
  packages/backend/src/routes/admin-billing.test.ts \
  packages/backend/src/services/billing.service.ts \
  packages/web-app/src/pages/AdminAdmins.tsx \
  packages/web-app/src/pages/AdminConsole.tsx \
  packages/web-app/src/pages/AdminTenantDetail.tsx \
  docs/diagrams/ docs/superpowers/ 2>/dev/null
```
Expected: zero matches.

---

### Task 2: Commit source code changes (AW-ADMIN-001 through 007)

**Files:**
- Commit: `packages/backend/src/routes/admin.ts`
- Commit: `packages/backend/src/routes/admin-billing.test.ts`
- Commit: `packages/backend/src/services/billing.service.ts`
- Commit: `packages/web-app/src/pages/AdminAdmins.tsx`
- Commit: `packages/web-app/src/pages/AdminConsole.tsx`
- Commit: `packages/web-app/src/pages/AdminTenantDetail.tsx`

**Interfaces:**
- Consumes: Task 1 (redactions confirmed clean)
- Produces: new commit on `main` with all AW-ADMIN-001…007 source changes

- [ ] **Step 1: Confirm working directory is the repo root**

```bash
pwd
```
Expected: `/home/webadmin/web-stack/html/amma-wallet`

- [ ] **Step 2: Confirm the 6 files are modified and nothing else unexpected is staged**

```bash
git status
```
Expected: 6 files under "Changes not staged for commit", plus `docs/` under "Untracked files". No files in "Changes to be committed" yet.

- [ ] **Step 3: Run backend tests to confirm nothing is broken**

```bash
cd packages/backend && npx vitest run --reporter=verbose 2>&1 | tail -20
```
Expected: all tests pass (last session confirmed 214/214). If any fail, do NOT commit — investigate first.

- [ ] **Step 4: Stage the 6 source files**

```bash
cd /home/webadmin/web-stack/html/amma-wallet
git add \
  packages/backend/src/routes/admin.ts \
  packages/backend/src/routes/admin-billing.test.ts \
  packages/backend/src/services/billing.service.ts \
  packages/web-app/src/pages/AdminAdmins.tsx \
  packages/web-app/src/pages/AdminConsole.tsx \
  packages/web-app/src/pages/AdminTenantDetail.tsx
```

- [ ] **Step 5: Verify staged diff is clean — no secrets**

```bash
git diff --cached | grep -E "GS[A-Z2-7]{55}|password\s*=\s*['\"][^'\"<]|secret\s*=\s*['\"][^'\"<]" | head -10
```
Expected: zero matches.

- [ ] **Step 6: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(admin): AW-ADMIN-001/002/005/006/007 — confirm modal, breadcrumb, pagination, admin CRUD, suspend type

- AW-ADMIN-001: Suspend/Unsuspend now opens a confirmation modal instead of
  window.confirm; modal is keyboard-dismissible (Escape) and click-outside-
  dismissible
- AW-ADMIN-002: Tenant name surfaced in breadcrumb from billing API response
  (tenantName + tenantSlug now returned by getTenantBalanceSummary)
- AW-ADMIN-005: Cursor-paginated billing events via
  GET /api/v1/internal/tenants/:id/events?beforeId=N; "Load older" button
  in AdminTenantDetail appends pages without replacing earlier rows
- AW-ADMIN-006: AdminAdmins full lifecycle — invite, deactivate, reactivate,
  reset password; RBAC: platform_admin cannot reset super_admin passwords
- AW-ADMIN-007: Suspend modal offers hard vs soft radio choice; type sent in
  PATCH body; previous hard-coded "hard" removed

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 7: Verify commit was recorded**

```bash
git log --oneline -4
```
Expected: new commit at top, plus the 2 previously unpushed commits below it.

---

### Task 3: Add and commit docs (diagrams + superpowers plans/specs)

**Files:**
- Add: `docs/diagrams/` (9 `.mmd` Mermaid files)
- Add: `docs/superpowers/plans/` (6 `.md` files — redacted in Task 1)
- Add: `docs/superpowers/specs/` (2 `.md` files)

**Interfaces:**
- Consumes: Task 1 (redacted docs), Task 2 (source commit done)
- Produces: new commit with all documentation

- [ ] **Step 1: Confirm docs dirs are still untracked**

```bash
git status -- docs/diagrams docs/superpowers
```
Expected: both directories listed under "Untracked files".

- [ ] **Step 2: One last secret scan on the entire docs tree**

```bash
grep -rn \
  -e "S[A-Z2-7]\{55\}" \
  -e "GBOH\|GDDT\|GDLQ\|GB4S\|GBVR" \
  -e "mukhtar\|christopher-fourquier\|TestnetAmma\|cfat_\|amma_de" \
  docs/ 2>/dev/null
```
Expected: zero matches. If any appear, redact before staging.

- [ ] **Step 3: Stage docs directories**

```bash
git add docs/diagrams docs/superpowers
```

- [ ] **Step 4: Review staged file list**

```bash
git diff --cached --name-only
```
Expected: 9 `docs/diagrams/*.mmd` files and 8 `docs/superpowers/**/*.md` files.

- [ ] **Step 5: Commit docs**

```bash
git commit -m "$(cat <<'EOF'
docs: add Mermaid diagrams and superpowers plans for AW-ADMIN-001–007

Diagrams (docs/diagrams/):
- aw-admin-admins-lifecycle-flow.mmd
- aw-admin-billing-events-pagination-flow.mmd
- aw-admin-tenant-breadcrumb-data-flow.mmd
- aw-admin-tenant-status-confirm-flow.mmd
- aw-admin-tenant-suspend-type-flow.mmd
- lms-dashboard-skeleton-loading-flow.mmd
- lms-mint-confirmation-flow.mmd
- nft-credential-data-flow.mmd
- nft-credential-flow.mmd

Plans/specs (docs/superpowers/):
- 2026-07-25-admin-console-completion.md
- 2026-07-25-admin-console-ux-findings.md
- 2026-07-25-nft-credential-transparency.md (redacted: test wallet placeholder)
- 2026-07-26-audit-report.md
- 2026-07-26-aw-admin-003-004-credit-notes.md (redacted: admin_email placeholder)
- 2026-07-26-feature-audit.md
- 2026-07-26-aw-admin-003-004-credit-message-notes.md
- 2026-07-26-quick-wins-aw-lms-008-005.md

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Push all commits to origin/main

**Interfaces:**
- Consumes: Tasks 2 and 3 committed; total 4 commits ahead of origin
- Produces: `origin/main` updated with all work

- [ ] **Step 1: Confirm total commits queued for push**

```bash
git log --oneline origin/main..HEAD
```
Expected: 4 commits (2 already queued from last session + 2 new from Tasks 2–3).

- [ ] **Step 2: Dry-run check — confirm remote URL has no embedded token**

```bash
git remote get-url origin
```
Expected: `https://github.com/SM-Web-Systems/amma-wallet-production.git` (no `@token@` or PAT in URL).

- [ ] **Step 3: Push**

```bash
git push origin main
```
Expected output contains:
```
To https://github.com/SM-Web-Systems/amma-wallet-production.git
   <old_sha>..<new_sha>  main -> main
```
If it fails with `403` or auth error, verify git credential store is populated:
```bash
git credential-osxkeychain get <<< "protocol=https
host=github.com" 2>/dev/null || git config credential.helper
```
Use the GIT_PAT from `/home/webadmin/.env.secrets` if needed — but do NOT echo it to stdout. Supply it interactively or via `git credential approve`.

- [ ] **Step 4: Confirm remote is up to date**

```bash
git status
```
Expected: `Your branch is up to date with 'origin/main'.`

- [ ] **Step 5: Verify on GitHub (optional but recommended)**

```bash
git log --oneline -5
# Then confirm the top commit SHA matches what GitHub shows at:
# https://github.com/SM-Web-Systems/amma-wallet-production/commits/main
```

---

## Security Sign-Off Checklist

Before marking this plan complete, confirm each item:

- [ ] No `.env`, `app.env`, or secret file was staged or committed
- [ ] No Stellar secret key (`S…` 56-char) present in any committed file
- [ ] No real user wallet address present — replaced with placeholder
- [ ] No real admin email present in examples — replaced with `<admin_email>`
- [ ] No API tokens, PATs, JWTs, or bcrypt hashes present in any committed file
- [ ] `git diff --cached` and commit diffs reviewed and confirmed clean
- [ ] Remote URL contains no embedded credentials
