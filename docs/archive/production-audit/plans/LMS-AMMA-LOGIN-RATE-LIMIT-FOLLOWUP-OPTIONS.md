# LMS Amma-Login Rate-Limit Follow-Up — Fix Options

**Date:** 2026-09-02
**Root cause:** STALE_DEPLOYMENT_COPY

---

## Option A: Rebuild lms-api from current repo (SELECTED)

The fixes already exist in the codebase. Rebuild the `lms-api` container from `LMS-AmmaWallet/` source.

| Criterion | Assessment |
|---|---|
| Fixes both bugs | Yes — LOCKOUT-001 + AUTH-RL |
| Code changes needed | None — already fixed in repo |
| Risk | Low — same code that `lms_server` runs |
| Deployment | `docker compose build lms-api && docker compose up -d --no-deps lms-api` |

**Why selected:** No code changes required. The fix is already verified and deployed on `lms_server`.

---

## Option B: Also align the saplingx.com backend

The `lms_server` (saplingx.com) runs from the old `/html/LMS-Server/` copy. It should ideally be consolidated with the `lms-api` codebase.

| Criterion | Assessment |
|---|---|
| Reduces deployment complexity | Yes — single source of truth |
| Risk | Medium — requires Docker Compose restructuring |
| Scope | Beyond current incident |

**Status:** Documented as future work. Not blocking the current fix.

---

## Option C: Investigate shared-IP behavior

IP-based rate limiting can cause innocent users to be blocked if they share a public IP (office, university).

| Criterion | Assessment |
|---|---|
| Currently relevant | Only after fixing STALE_DEPLOYMENT_COPY |
| Fix complexity | Medium — requires authenticated-user keying |
| Priority | Follow-up after deployment fix |

---

## Decision Matrix

| Criterion | A | B | C |
|---|---|---|---|
| Fixes immediate bug | Yes | Yes | No |
| Code changes | None | Docker config | Backend code |
| Risk | Low | Medium | Medium |
| Priority | Immediate | Future | Future |

**Selected: Option A** — Rebuild lms-api. Options B and C are follow-up work.
