# Batch 3 — Merge Report

> Date: 2026-07-28
> Merge commit: `bf64194`
> Tag: `batch3-complete-2026-07-28`
> Strategy: `--no-ff`

---

## Merge Details

| Field | Value |
|-------|-------|
| Source branch | `fix/backlog-batch3` |
| Target branch | `main` |
| Merge commit | `bf641940f8a29f402144a31734f2ef0ecd56bde6` |
| Tag | `batch3-complete-2026-07-28` |
| Files changed | 23 |
| Insertions | +693 |
| Deletions | -135 |
| GitHub | Pushed to SM-Web-Systems/amma-wallet-production |

---

## Commits Merged (12)

| Commit | Message |
|--------|---------|
| `b1178b4` | fix(push): prevent subscription takeover via conflict update (P3-8-F1) |
| `70f1fd4` | fix(curated): restrict /curated/seed to admin role (P3-9-F1) |
| `1ca8729` | fix(contacts): prevent PATCH body injection via additionalProperties (P3-6-F3) |
| `7c6997a` | fix(jobs): add concurrency guard to auto-suspension job (P1-3-F3) |
| `cc1080b` | fix(contacts): validate Stellar address with StrKey (P3-6-F2) |
| `ab3042f` | fix(2fa): invalidate old email codes on re-send (P3-7-F11) |
| `604979d` | fix(push): limit subscriptions to 10 per user (P3-8-F4) |
| `3450bba` | fix(jobs): check acquisitionModeEnabled in debt limit enforcement (P1-3-F1) |
| `982151c` | fix(2fa): reduce TOTP verification window from 2 to 1 (P3-7-F10) |
| `4b9e8d8` | fix(admin): rename CREDIT_ROLES to PRIVILEGED_ROLES (P0-2-F3) |
| `b942707` | fix(auth): enforce password complexity at all password-setting sites (P0-1-F14) |
| `bc42a3e` | docs: Batch 3 checkpoint report and TODO completion |

---

## Post-Merge Verification

- Backend tests: 488/488 PASS
- Web-app tests: 23/23 PASS
- No merge conflicts
