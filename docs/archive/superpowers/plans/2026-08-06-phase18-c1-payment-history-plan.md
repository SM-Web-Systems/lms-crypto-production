# Phase 18 C1: Student Payment History — Implementation Plan

**Date:** 2026-08-06
**Spec:** `docs/superpowers/specs/2026-08-06-phase18-c1-payment-history-design.md`
**Baseline:** 639 tests (553 BE + 86 FE)

---

## Task Breakdown

### T0: Branch Setup + Baseline
- [ ] Create branch `feat/phase18-c1-payment-history`
- [ ] Tag `pre-phase18-c1-2026-08-06`
- [ ] Verify baseline: tsc, 553 BE, 86 FE, vite build

### T1: Backend — Add courseName to GET /payments/mine
- [ ] Update `getStudentPayments()` in paymentService.ts: JOIN courses to get title
- [ ] Add `courseName` to route response mapping in payments.ts
- [ ] Update frontend type in courseCompletionService.ts

### T2: Backend Tests (2 new)
- [ ] PAY-BE-1: GET /payments/mine includes courseName
- [ ] PAY-BE-2: GET /payments/mine returns empty array for no payments

### T3: Frontend — StudentPayments.tsx component
- [ ] Create `pages/StudentPayments.tsx` with loading/empty/error/data states
- [ ] Payment table: date, course, amount, method, status badge, receipt link
- [ ] Receipt link: `GET /payments/:paymentId/receipt` (confirmed/waived only)

### T4: Frontend — Route + Navigation
- [ ] Add route in App.tsx: `/student/payments` → StudentPayments
- [ ] Add nav link in Layout.tsx: "Payments" with CreditCard icon

### T5: Frontend Tests (4 new)
- [ ] PAY-FE-1: Renders payment list
- [ ] PAY-FE-2: Receipt link for confirmed payments
- [ ] PAY-FE-3: Empty state
- [ ] PAY-FE-4: Error state with retry

### T6: Verification
- [ ] tsc --noEmit (BE + FE)
- [ ] Backend tests: 555/555
- [ ] Frontend tests: 90/90
- [ ] Vite build
- [ ] Docker build web

### T7: Merge + Tag + Closeout
- [ ] Commit + merge to main
- [ ] Tag: `phase18-c1-complete-2026-08-06`
- [ ] Write closeout

## Dependencies
```
T0 → T1 → T2 → T3 → T4 → T5 → T6 → T7
```
