# Phase 10 C1 Implementation Plan — Component Tests Expansion

**Date:** 2026-08-04
**Spec:** `docs/superpowers/specs/2026-08-04-phase10-c1-component-tests-expansion-design.md`
**Branch:** `feat/phase10-c1-component-tests-expansion`

---

## Tasks

### T0: Branch Setup + Baseline
1. Create branch from main
2. Tag `pre-phase10-c1-2026-08-04`
3. Verify baseline: tsc clean, 25/25 frontend, 448/448 backend

### T1: Write Both Test Files
- `src/__tests__/components/AnnouncementsPanel.test.tsx` (10 tests)
- `src/__tests__/components/InlineQuizTaker.test.tsx` (8 tests)

### T2: Verification Gates (7 gates)
1. Frontend tsc
2. Frontend vitest (43/43)
3. Backend vitest (448/448)
4. Vite build
5. Docker build
6. HTTP 200
7. Health 200

### T3: Commit + Merge + Tag + Push + Closeout
