# Activation Blocker Loop Document

**Date:** 2026-08-20

## Safe Repeated Actions

The following actions are safe to repeat in any order:

1. Run enhanced provider tests: `cd LMS-Server && npx vitest run src/services/__tests__/enhancedStellarProvider.test.ts`
2. Run full backend test suite: `cd LMS-Server && npx vitest run`
3. Run full frontend test suite: `cd LMS-Web && npx vitest run`
4. Run E2E tests: `cd e2e && npx playwright test`
5. Review error code prefixes in test output.
6. Verify rollback by checking factory default behavior.
7. Review migration SQL (read-only, no execution).

## Stop Conditions

Stop the loop when ANY of the following are true:

- A test fails that was previously passing.
- A code change is made that is not covered by an existing test.
- A migration is executed without explicit approval.
- The `NFT_PROVIDER` environment variable is changed in production.
- An approval gate is bypassed.

## Current Status

- Tests: 40/40 enhanced provider tests passing.
- Implementation: Complete (structured error codes, in-process lock, bounded polling, tx_hash protection).
- Awaiting: Independent code review, full suite verification, migration approval.

## What NOT To Do

- Do NOT execute migration SQL.
- Do NOT set `NFT_PROVIDER=enhanced` in any deployed environment.
- Do NOT modify the CHECK constraint on `mint_status`.
- Do NOT add automatic retry logic for unknown submissions.

Activation is not authorized by implementation readiness.
