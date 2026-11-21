# E2E Test Coverage Plan

## Context

Current E2E coverage includes 7 spec files (14 tests) in `e2e/tests/`:

| Spec file | Coverage area |
|-----------|---------------|
| `auth.spec.ts` | Admin login (valid + invalid credentials) |
| `health.spec.ts` | API health endpoint |
| `admin-dashboard.spec.ts` | Admin dashboard loads, system info |
| `student-dashboard.spec.ts` | Student dashboard loads |
| `quiz-flow.spec.ts` | Quiz page render, quiz API |
| `navigation.spec.ts` | Route navigation |
| `account-deletion.spec.ts` | Account deletion lifecycle |

## Missing Coverage

| Priority | Flow | Risk if untested |
|----------|------|------------------|
| 1 | Payment (Paystack webhook, Stellar monitor) | Financial — silent payment failures, duplicate charges |
| 2 | Course content viewing (all item types) | Learner experience — broken content, missing media |
| 3 | NFT certificate minting and badge gallery | Credential integrity — failed mints, missing badges |
| 4 | Forum interactions (posts, replies) | Community — broken posting, XSS, anonymization gaps |

## Target Scenarios

### 1. Payment Flow (`e2e/tests/payment-flow.spec.ts`)

- Student navigates to course pricing page.
- Paystack checkout initiates successfully.
- Payment confirmation updates student enrollment.
- Failed payment shows appropriate error state.
- Duplicate webhook delivery is handled idempotently.
- Expired payment session shows timeout message.

### 2. Course Content Viewing (`e2e/tests/course-content.spec.ts`)

- Student navigates course viewer through all 7 sections.
- Video items render YouTube embed or player.
- Audio items render player with progress tracking.
- Markdown lessons render formatted content.
- Download items provide working links.
- Flashcard decks load and flip correctly.
- Mind maps load and render.
- Quiz items show inline quiz taker.
- Lesson completion marking persists across page reloads.

### 3. NFT Certificate Flow (`e2e/tests/nft-certificate.spec.ts`)

- Admin can view certificate applications.
- Admin can approve a certificate application.
- Badge appears in student badge gallery after minting.
- Badge metadata displays correctly (course name, date, credential ID).
- Certificate verification page loads for valid credential ID.

### 4. Forum Interactions (`e2e/tests/forum.spec.ts`)

- Student can view forum channels.
- Student can create a new topic.
- Student can reply to an existing topic.
- Forum content is XSS-safe (script tags are escaped).
- Deleted user posts show anonymized author.

## Test Infrastructure

- **Auth fixtures:** `e2e/fixtures/auth.ts` provides `adminPage` and `studentPage` via API-based JWT login.
- **Config:** `e2e/playwright.config.ts` — testDir `./tests`, Chromium only, globalSetup seeds test users.
- **CI:** E2E job runs after backend+frontend jobs pass.

## Implementation Notes

- Payment tests will need mock Paystack responses (no real transactions in CI).
- NFT tests should use the test environment with `NFT_AUTO_MINT_ENABLED=false`.
- Course content tests depend on the BVC course being seeded in the test database.
- Forum tests need at least one course with forum enabled in the test seed.

## Success Criteria

- At least 4 new E2E spec files merged.
- CI runs all E2E specs without new chronic flakiness.
- Critical flows (payment, content viewing, NFT mint, forum) each have at least one passing E2E scenario.

## Guardrails

- No production credentials in tests.
- Use test environment only (`NODE_ENV=test`).
- No real payment transactions in CI.
- Mock external services (Paystack, Stellar Horizon) where needed.
- Use `test.skip()` for scenarios that require infrastructure not yet available.
