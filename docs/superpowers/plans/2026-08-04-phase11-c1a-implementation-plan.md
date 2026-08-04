# Phase 11 C1a Implementation Plan — Manual Payment Foundation

**Date:** 2026-08-04
**Spec:** `docs/superpowers/specs/2026-08-04-phase11-c1a-manual-payment-design.md`
**Branch:** `feat/phase11-c1a-manual-payment`

---

## Tasks

### T0: Branch Setup + Baseline
1. Create branch from main
2. Tag `pre-phase11-c1a-2026-08-04`
3. Verify baseline: tsc clean, 48/48 frontend, 454/454 backend

### T1: Database Migrations
- Add `ensurePaymentsTables()` to `database.ts`
- Creates `course_pricing` + `payments` tables
- Adds `payment_id` column to `course_nft_applications`
- Add types to `types/index.ts`

### T2: Backend Service + Endpoints
- Create `paymentService.ts` (8 functions)
- Create `payments.ts` routes (5 endpoints)
- Register routes in `app.ts`
- Add payment gate to mint endpoint in `nftApplications.ts`
- Add payment record creation to apply endpoint in `nftApplications.ts`

### T3: Backend Tests (10 cases)
- `LMS-Server/src/__tests__/payments.test.ts`
- PAY-B1 through PAY-B10

### T4: Frontend Components
- Create `PricingManagement.tsx`
- Modify `AdminCertificates.tsx` (payment column, confirm/waive buttons)
- Modify `StudentQuizzes.tsx` (replace placeholder)
- Add service methods to `adminCertificateService.ts` + `courseCompletionService.ts`
- Add types to `types/api.ts`

### T5: Frontend Tests (7 cases)
- `LMS-Frontend/src/__tests__/components/PricingManagement.test.tsx`
- PAY-F1 through PAY-F7

### T6: Verification Gates (7 gates)
1. Frontend tsc
2. Frontend vitest (55/55)
3. Backend vitest (464/464)
4. Vite build
5. Docker build
6. HTTP 200
7. Health 200

### T7: Commit + Merge + Tag + Closeout
