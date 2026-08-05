# Phase 16 C1: Invoice/Receipt PDF Generation — Design Spec

**Date:** 2026-08-05
**Scope:** PDF receipt generation for confirmed/waived payments
**Risk:** LOW — read-only on existing payment data, one new dependency

---

## Overview

Students and admins can download a PDF receipt for any confirmed or waived payment.
The endpoint `GET /payments/:id/receipt` returns a PDF with payment details,
student information, course name, and payment method specifics (Paystack ref, Stellar TX hash).

## Architecture

- **invoiceService.ts** — `getReceiptData()` (JOINs payments+users+courses), `generateReceiptPdf()` (pdfkit)
- **payments.ts** — new route `GET /payments/:paymentId/receipt` with owner-or-admin access check
- **pdfkit** — pure JS PDF generation, no native dependencies

## Access Control

- Payment owner can download their own receipt
- Admin (`role === 'admin'`) can download any receipt
- Other students get 403
- Unauthenticated requests get 401 (via `router.use(authenticate)`)
- Pending/failed payments return 400 (receipt only for confirmed/waived)

## PDF Content

| Field | Source |
|-------|--------|
| Receipt No | `payment.id` (first 8 chars) |
| Date | `confirmed_at` or `created_at` |
| Student | `users.name` |
| Email | `users.email` |
| Course | `courses.title` |
| Course Code | `courses.course_code` |
| Amount | `payment.amount_cents` / 100 |
| Payment Method | `payment.payment_method` (formatted) |
| Status | Paid / Waived |
| Paystack Ref | if applicable |
| Stellar TX | if applicable |
| Notes | if present |

## Tests (7 cases)

| ID | Test | Expected |
|----|------|----------|
| INV-1 | Owner downloads confirmed receipt | 200 + PDF |
| INV-2 | Owner downloads waived receipt | 200 + PDF |
| INV-3 | Owner requests pending payment | 400 |
| INV-4 | Non-owner student requests | 403 |
| INV-5 | Admin downloads any receipt | 200 + PDF |
| INV-6 | Unknown payment | 404 |
| INV-7 | getReceiptData returns joined data | Correct fields |
