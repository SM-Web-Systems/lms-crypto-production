# Phase 12 C1: Paystack Payment Automation — Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Automate payment collection via Paystack checkout (fiat) and Stellar native payments (XLM/USDC), replacing manual-only confirmation while keeping manual as fallback.

**Architecture:** Paystack hosted checkout (SAQ-A PCI-compliant) with server-side webhook verification. Stellar payments via Horizon polling with memo-based matching. All payment confirmations flow through existing `confirmPayment()` to maintain idempotency.

**Tech Stack:** Express, better-sqlite3, Paystack REST API (HMAC SHA-512 webhooks), @stellar/stellar-sdk (Horizon API), vitest + supertest.

## Global Constraints

- SQLite with synchronous better-sqlite3 — no async DB calls
- Express 4 sync handlers for DB-only routes, async for external API calls
- Paystack keys: `PAYSTACK_SECRET_KEY`, `PAYSTACK_PUBLIC_KEY` in `.env`
- Stellar wallet: `PAYMENT_RECEIVING_WALLET` in `.env`
- Feature flag: none (extends existing payment system)
- Backward compatible: manual confirm/waive unchanged
- Tests: vitest + supertest, `_resetForTests(schemaSQL)` in beforeEach via setup.ts

---

### Task 1: Database Migrations

**Files:**
- Modify: `LMS-Server/database/schema.sql`
- Modify: `LMS-Server/src/config/database.ts`
- Modify: `LMS-Server/src/types/index.ts`

**Schema changes:**
1. `webhook_events` table (new)
2. ALTER `payments` — add `paystack_reference`, `paystack_access_code`, `stellar_tx_hash`, `stellar_memo`
3. ALTER `course_pricing` — add `stellar_price_xlm`, `stellar_price_usdc`
4. Expand `payments.status` CHECK to include `failed`, `refunded`
5. Update TypeScript types

---

### Task 2: paystackService + paymentService Extensions

**Files:**
- Create: `LMS-Server/src/services/paystackService.ts`
- Modify: `LMS-Server/src/services/paymentService.ts`

**paystackService exports:**
- `initializeTransaction(email, amountCents, reference, callbackUrl, metadata)` — POST to Paystack /transaction/initialize
- `verifyTransaction(reference)` — GET from Paystack /transaction/verify/:reference
- `verifyWebhookSignature(rawBody, signature)` — HMAC SHA-512 check
- `createRefund(reference, merchantNote?)` — POST to Paystack /refund

**paymentService extensions:**
- `createPaystackPayment(userId, courseId, applicationId, amountCents, reference, accessCode)` — insert with payment_method='paystack'
- `createStellarPayment(userId, courseId, applicationId, amountCents, memo)` — insert with payment_method='stellar_xlm'
- `failPayment(paymentId)` — set status='failed'
- `refundPayment(paymentId, notes?)` — set status='refunded'
- `getPaymentByReference(reference)` — lookup by paystack_reference
- `getPaymentByStellarMemo(memo)` — lookup by stellar_memo
- `getStudentPayments(userId)` — list user's own payments
- `setCoursePricing()` extended for stellar_price_xlm, stellar_price_usdc

---

### Task 3: stellarPaymentMonitor Service

**Files:**
- Create: `LMS-Server/src/services/stellarPaymentMonitor.ts`

**Exports:**
- `class StellarPaymentMonitor` with `start()`, `stop()`, `poll()` methods
- Polls Horizon `/accounts/{dest}/payments` with cursor persistence
- Matches payment memos to `payments.stellar_memo`
- Auto-confirms matching payments with correct amount

---

### Task 4: Backend Routes

**Files:**
- Modify: `LMS-Server/src/routes/payments.ts`
- Modify: `LMS-Server/src/app.ts` (webhook raw body middleware)

**New endpoints:**
- `POST /payments/checkout/paystack` — create Paystack checkout session
- `POST /payments/checkout/stellar` — generate Stellar payment instructions
- `POST /webhooks/paystack` — handle Paystack webhook (public, sig-verified)
- `GET /payments/:paymentId/status` — payment status (owner or admin)
- `POST /admin/payments/:paymentId/refund` — trigger refund
- `GET /students/me/payments` — student payment history

**Extended endpoints:**
- `PUT /admin/courses/:courseId/pricing` — add stellar_price_xlm, stellar_price_usdc
- `GET /courses/:courseId/pricing` — add stellar prices + paymentMethods array

---

### Task 5: Backend Tests (~15 cases)

**Files:**
- Modify: `LMS-Server/src/__tests__/payments.test.ts`

**Test cases (PAY-B11 to PAY-B25):**
- PAY-B11: Paystack checkout creates payment + returns URL
- PAY-B12: Paystack checkout rejects free course
- PAY-B13: Paystack checkout rejects already-paid
- PAY-B14: Webhook charge.success confirms payment
- PAY-B15: Webhook invalid signature returns 401
- PAY-B16: Webhook duplicate event is idempotent
- PAY-B17: Webhook charge.failed sets status to failed
- PAY-B18: Stellar checkout returns memo + address
- PAY-B19: Stellar checkout rejects missing XLM price
- PAY-B20: Payment status returns correct state
- PAY-B21: Payment status rejects wrong user
- PAY-B22: Refund updates status to refunded
- PAY-B23: Refund rejects non-paystack payment
- PAY-B24: Student payment history returns own payments
- PAY-B25: Pricing endpoint includes stellar fields

---

### Task 6: Frontend Components

**Files:**
- Create: `LMS-Frontend/src/components/PaymentCheckout.tsx`
- Modify: `LMS-Frontend/src/components/PricingManagement.tsx`
- Modify: `LMS-Frontend/src/services/courseCompletionService.ts` (if needed)

---

### Task 7: Frontend Tests (~10 cases)

**Files:**
- Create: `LMS-Frontend/src/__tests__/components/PaymentCheckout.test.tsx`
- Modify: `LMS-Frontend/src/__tests__/components/PricingManagement.test.tsx`

---

### Task 8: Verification + Merge + Tag

- TypeScript clean (backend + frontend)
- All backend tests pass (~521)
- All frontend tests pass (~79)
- Vite production build clean
- Merge to main, tag `phase12-c1-complete-2026-08-05`
