# Phase 18 C1: Student Payment History — Design Spec

**Date:** 2026-08-06
**Baseline:** 639 tests (553 BE + 86 FE)

---

## Problem

Students who pay for NFT certificates have no way to view their payment history or download receipts. The backend endpoint `GET /payments/mine` exists and is tested, but no frontend page consumes it.

## Scope

- **1 new file:** `StudentPayments.tsx` (page component)
- **3 modified files:** `App.tsx` (route), `Layout.tsx` (nav link), `payments.ts` (add courseName to response)
- **1 modified service:** `courseCompletionService.ts` (update type to include courseName)
- **~6 new tests:** 4 FE (component) + 2 BE (response shape with courseName)
- **Frontend + minor backend change** (JOIN to add courseName)

## API Response Shape

### Current `GET /payments/mine`

```json
{
  "success": true,
  "data": [
    {
      "paymentId": "pay_abc123",
      "courseId": "course_xyz",
      "amountCents": 2500,
      "currency": "USD",
      "paymentMethod": "paystack",
      "status": "confirmed",
      "createdAt": "2026-08-01T12:00:00.000Z",
      "confirmedAt": "2026-08-01T12:05:00.000Z"
    }
  ]
}
```

### Enhanced (add courseName)

```json
{
  "success": true,
  "data": [
    {
      "paymentId": "pay_abc123",
      "courseId": "course_xyz",
      "courseName": "Blockchain Fundamentals",
      "amountCents": 2500,
      "currency": "USD",
      "paymentMethod": "paystack",
      "status": "confirmed",
      "createdAt": "2026-08-01T12:00:00.000Z",
      "confirmedAt": "2026-08-01T12:05:00.000Z"
    }
  ]
}
```

**Backend change:** Replace `SELECT * FROM payments WHERE user_id = ?` with `SELECT p.*, c.title AS course_name FROM payments p LEFT JOIN courses c ON p.course_id = c.id WHERE p.user_id = ?` in `getStudentPayments()`.

## Component Design: StudentPayments.tsx

### States

1. **Loading:** Skeleton placeholders while API fetches
2. **Empty:** "No payments yet" message with link to course page
3. **Error:** Error message with retry button
4. **Data:** Payment list table

### Payment List Table

| Column | Source | Format |
|--------|--------|--------|
| Date | createdAt | `new Date(createdAt).toLocaleDateString()` |
| Course | courseName | Text |
| Amount | amountCents, currency | `$25.00 USD` |
| Method | paymentMethod | Capitalize: "Paystack", "Stellar XLM", etc. |
| Status | status | Badge: green=confirmed, yellow=pending, blue=waived |
| Receipt | paymentId, status | Download link (confirmed/waived only) |

### Receipt Download

Link to `GET /payments/:paymentId/receipt` — opens PDF in new tab. Only shown for confirmed/waived payments.

### Navigation

Add to student nav in `Layout.tsx`:
```tsx
{ name: 'Payments', path: '/student/payments', icon: CreditCard },
```

Place after "My Submissions" and before "Course".

## Tests

### Frontend (4 tests)

- **PAY-FE-1:** Renders payment list with mock data (course name, amount, status badge)
- **PAY-FE-2:** Shows receipt download link for confirmed payments
- **PAY-FE-3:** Shows empty state when no payments
- **PAY-FE-4:** Shows error state with retry button

### Backend (2 tests)

- **PAY-BE-1:** `GET /payments/mine` returns courseName in response
- **PAY-BE-2:** `GET /payments/mine` returns empty array for user with no payments

## Rollback

- Frontend: Remove route from App.tsx, nav link from Layout.tsx, delete StudentPayments.tsx
- Backend: Revert getStudentPayments JOIN (SELECT * instead)
- No schema changes. No new tables.
