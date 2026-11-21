# LMS Production Repo Sync — LMS-UX-003/004 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Push completed LMS-UX-003 (skeleton loading) and LMS-UX-004 (mint confirmation modal) to `origin/main` (`SM-Web-Systems/lms-crypto-production`) with zero secrets or PII in any committed file.

**Architecture:** Repo at `/home/webadmin/web-stack/html/LMS-AmmaWallet` is 4 commits ahead of `origin/main`. Three frontend files are modified (unstaged) and `docs/` is untracked. Two items in planning docs require redaction before committing. Push uses `~/.env.git-write` PAT.

**Tech Stack:** TypeScript/React (Vite), Express backend, SQLite/better-sqlite3, Vitest, git, GitHub

## Global Constraints

- NEVER commit `.env` or any file with real secret values — gitignore enforces this but verify
- Admin email must be replaced with `<alert_email>` in docs
- NFT minter public key must be replaced with `<NFT_MINTER_PUBKEY>` in docs
- All 293 backend tests must remain passing before push
- Repo root: `/home/webadmin/web-stack/html/LMS-AmmaWallet/` — branch `main`, remote `origin`

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `docs/superpowers/plans/2026-07-25-operational-safety-net.md` | Modify (4 lines) | Redact admin email + NFT minter public key |
| `LMS-Frontend/src/components/PageSkeletons.tsx` | Commit (already modified) | LMS-UX-003: skeleton loading components for cert eligibility |
| `LMS-Frontend/src/pages/AdminCertificates.tsx` | Commit (already modified) | LMS-UX-004: mint confirmation modal in admin certificates page |
| `LMS-Frontend/src/pages/StudentDashboard.tsx` | Commit (already modified) | LMS-UX-003: skeleton loading state in student dashboard |
| `docs/diagrams/*.mmd` (6 files) | Add untracked | Mermaid flow diagrams |
| `docs/superpowers/plans/*.md` (5 files) | Add untracked | UX plans (with redacted operational-safety-net.md) |
| `docs/superpowers/specs/*.md` (2 files) | Add untracked | Design specs |

---

### Task 1: Redact sensitive values in operational-safety-net.md

**Files:**
- Modify: `docs/superpowers/plans/2026-07-25-operational-safety-net.md`

**Interfaces:**
- Produces: clean docs with no admin emails or infrastructure keys

- [ ] **Step 1: Redact admin email (4 occurrences)**

```bash
sed -i 's/mukhtar\.meer@smwebsystems\.com/<alert_email>/g' \
  docs/superpowers/plans/2026-07-25-operational-safety-net.md
```

- [ ] **Step 2: Redact NFT minter public key**

```bash
sed -i 's/[REAL_MINTER_KEY_REDACTED]/<NFT_MINTER_PUBKEY>/g' \
  docs/superpowers/plans/2026-07-25-operational-safety-net.md
```

- [ ] **Step 3: Verify all redactions applied**

```bash
grep -n "mukhtar\|GBVR" docs/superpowers/plans/2026-07-25-operational-safety-net.md
```
Expected: zero matches.

- [ ] **Step 4: Full secret scan across all docs and modified source files**

```bash
grep -rn \
  -e "mukhtar\|christopher-fourquier\|TestnetAmma\|cfat_\|amma_de" \
  -e "GBOH\|GDDT\|GDLQ\|GB4S\|GBVR" \
  docs/ \
  LMS-Frontend/src/components/PageSkeletons.tsx \
  LMS-Frontend/src/pages/AdminCertificates.tsx \
  LMS-Frontend/src/pages/StudentDashboard.tsx 2>/dev/null
```
Expected: zero matches. Also scan for Stellar private keys:
```bash
grep -rPn "(?<![A-Z2-7])[S][A-Z2-7]{55}(?![A-Z2-7])" \
  docs/ \
  LMS-Frontend/src/components/PageSkeletons.tsx \
  LMS-Frontend/src/pages/AdminCertificates.tsx \
  LMS-Frontend/src/pages/StudentDashboard.tsx 2>/dev/null
```
Expected: zero matches (exit code 1).

---

### Task 2: Commit source code changes (LMS-UX-003 and LMS-UX-004)

**Files:**
- Commit: `LMS-Frontend/src/components/PageSkeletons.tsx`
- Commit: `LMS-Frontend/src/pages/AdminCertificates.tsx`
- Commit: `LMS-Frontend/src/pages/StudentDashboard.tsx`

**Interfaces:**
- Consumes: Task 1 (redactions confirmed clean)
- Produces: new commit on `main` with LMS-UX-003/004 source changes

- [ ] **Step 1: Run backend tests to confirm nothing is broken**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server && npx vitest run 2>&1 | tail -10
```
Expected: all tests pass. If any fail, do NOT commit — investigate first.

- [ ] **Step 2: Stage the 3 source files**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet
git add \
  LMS-Frontend/src/components/PageSkeletons.tsx \
  LMS-Frontend/src/pages/AdminCertificates.tsx \
  LMS-Frontend/src/pages/StudentDashboard.tsx
```

- [ ] **Step 3: Verify staged diff is clean**

```bash
git diff --cached | grep -E "^\+[^+]" | grep -iE "secret\s*=\s*['\"][^'\"<]|password\s*=\s*['\"][^'\"<]|GBVR|mukhtar" | head -5
```
Expected: zero matches.

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(ux): LMS-UX-003/004 — skeleton loading + mint confirmation modal

- LMS-UX-003: StudentDashboard shows skeleton loading state while
  certificate eligibility data is being fetched; new CertEligibilitySkeleton
  and related skeleton components added to PageSkeletons.tsx
- LMS-UX-004: AdminCertificates mint action now opens a confirmation modal
  before submitting; prevents accidental mints and shows wallet address to
  be used

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 5: Verify commit recorded**

```bash
git log --oneline -6
```
Expected: new commit at top, plus the 4 previously unpushed commits below it.

---

### Task 3: Add and commit docs

**Files:**
- Add: `docs/diagrams/` (6 `.mmd` files)
- Add: `docs/superpowers/plans/` (5 `.md` files — operational-safety-net.md redacted)
- Add: `docs/superpowers/specs/` (2 `.md` files)
- Add: `docs/cert-journey-states.mmd` (root-level diagram)

**Interfaces:**
- Consumes: Task 1 (redacted docs), Task 2 (source commit done)
- Produces: new commit with all documentation

- [ ] **Step 1: One final secret scan on full docs tree**

```bash
grep -rn \
  -e "mukhtar\|christopher-fourquier\|TestnetAmma\|cfat_\|amma_de" \
  -e "GBOH\|GDDT\|GDLQ\|GB4S\|GBVR" \
  /home/webadmin/web-stack/html/LMS-AmmaWallet/docs/ 2>/dev/null
```
Expected: zero matches.

- [ ] **Step 2: Stage docs directory**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet
git add docs/
```

- [ ] **Step 3: Review staged file list**

```bash
git diff --cached --name-only
```
Expected: `docs/diagrams/*.mmd` files, `docs/superpowers/plans/*.md`, `docs/superpowers/specs/*.md`, plus the root `docs/cert-journey-states.mmd` if present.

- [ ] **Step 4: Commit docs**

```bash
git commit -m "$(cat <<'EOF'
docs: add Mermaid diagrams and superpowers plans for LMS-UX-003/004 + safety net

Diagrams (docs/diagrams/):
- cert-journey-states.mmd
- lms-admin-certificates-mint-confirm-flow.mmd
- lms-certificate-eligibility-loading-flow.mmd
- lms-nft-badges-layout.mmd
- lms-nft-credentials-error-flow.mmd
- lms-progress-flow.mmd

Plans/specs (docs/superpowers/):
- 2026-07-25-certificate-journey-messaging.md
- 2026-07-25-operational-safety-net.md (redacted: alert_email + NFT_MINTER_PUBKEY placeholders)
- 2026-07-25-student-progress-clarity.md
- 2026-07-25-ux-findings.md
- 2026-07-26-lms-ux-001-nft-badges-grid.md
- 2026-07-26-lms-ux-002-credentials-error-banner.md
- 2026-07-26-lms-ux-001-nft-badges-grid-design.md
- 2026-07-26-lms-ux-002-credentials-error-design.md
- 2026-07-26-lms-production-repo-sync.md (this plan)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Push all commits to origin/main

**Interfaces:**
- Consumes: Tasks 2 and 3 committed; total 6 commits ahead of origin
- Produces: `origin/main` updated

- [ ] **Step 1: Confirm total commits queued**

```bash
git log --oneline origin/main..HEAD
```
Expected: 6 commits.

- [ ] **Step 2: Update credential store with write PAT**

```bash
source ~/.env.git-write
GIT_USER=$(curl -s -H "Authorization: Bearer $GH_TOKEN" https://api.github.com/user | python3 -c "import sys,json; print(json.load(sys.stdin)['login'])")
printf 'https://%s:%s@github.com\n' "$GIT_USER" "$GH_TOKEN" > ~/.git-credentials
chmod 600 ~/.git-credentials
```

- [ ] **Step 3: Push**

```bash
git push origin main 2>&1
```
Expected: `172e7c5..HEAD  main -> main` (or equivalent SHA range).

- [ ] **Step 4: Confirm up to date**

```bash
git status
```
Expected: `Your branch is up to date with 'origin/main'.`

---

## Security Sign-Off Checklist

- [ ] No `.env` or secret file staged or committed
- [ ] No Stellar private key (`S…` 56-char) in any committed file
- [ ] Admin email replaced with `<alert_email>` in all planning docs
- [ ] NFT minter public key replaced with `<NFT_MINTER_PUBKEY>` in all planning docs
- [ ] No API tokens, PATs, JWTs, or bcrypt hashes in any committed file
- [ ] Remote URL confirmed clean (no embedded credentials)
