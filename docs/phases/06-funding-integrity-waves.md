# Phase 6 — Funding and reward integrity (W01 to W09) and AUTH-14

**When:** 27 October – 13 November 2026
**Archive:** the W01–W03 files in [`docs/archive/superpowers/`](../archive/superpowers/), [`docs/archive/lms-server-docs/`](../archive/lms-server-docs/) (W02 to W08), the W08 and W09 specs, AUTH-14 files and `LMS-INTEGRATED-*` in [`docs/archive/release/`](../archive/release/), and the 2026-11-02 `auth14-*` files in `docs/archive/superpowers/`.

## Goal

Make sure money and rewards cannot be double-spent, over-allocated or shown wrongly, and release the result safely.

## What happened

Work ran in short "waves". Each one had a spec, a test-first plan and review rounds (R1, R2 and so on):

| Wave | Focus |
|---|---|
| W01 | Internal funding authorization and credit backing; binding Paystack payments; using each payment reference once, atomically |
| W02 | Binding a request to its intent, access checks before replay, binding nested allocations to their parent |
| W03 | Allocation caps and funded capacity; reconciling unused reservations; migration and schema validation |
| W04 | Real course completion as the gate for course-bound rewards; failing closed when a reward's scope is deleted |
| W05 | Reward types matching across the API, UI and database; safe errors |
| W06 | Reward dashboard target identity, ownership checks on create, blocked-refund messages |
| W07 | Matching billing data shapes and permission contracts |
| W08 | Portal actions limited to the user's current capabilities |
| W09 | Honest loading, error and empty states on every dashboard |

**AUTH-14** set up the "held release": deploys use reviewed images pinned to an exact commit, a guard holds all writes during migration, there are row-ID snapshot and foreign-key baselines, and a rehearsal runs on the server. The **integrated candidate** brought RBAC, the sponsor portal, course payments, reward funding, mobile, push and offline work together onto main. A staging release script was dated 13 November.

## Outcome

The funding and reward paths had gate checks and tests, and the integrated candidate was ready for the Phase 2 grant work.

## Key documents

- `release/LMS-INTEGRATED-CANDIDATE.md`
- `release/AUTH-14-held-release.md`
- `release/W09-spec.md` and `superpowers/specs/2026-10-30-W03-allocation-cap-revised.md`
