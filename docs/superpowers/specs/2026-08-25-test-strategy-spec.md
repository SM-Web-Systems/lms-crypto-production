# Test Strategy Specification

**Status:** ACTIVE
**Date:** 2026-08-25

---

## Authorization Boundary

```
No production migration is authorized by this workflow.
No enhanced-provider activation is authorized by this workflow.
No blockchain operation is part of this workflow.
```

---

## Problem

There is no unified test strategy across the LMS and AmmaWallet repositories. Each project has grown its own testing conventions organically, leading to inconsistent coverage expectations, varying test command invocations, and no shared vocabulary for describing testing layers. This makes it difficult to enforce quality gates, onboard contributors, or compare test health across projects.

## Goals

1. Define the three testing layers (unit, integration, E2E) with clear boundaries for what each layer covers.
2. Establish TDD enforcement rules: when tests must be written before implementation, and when test-after is acceptable.
3. Specify a test matrix format that can be used in closeout documents and CI reporting.
4. Document the canonical test commands for each project and layer.
5. Set coverage expectations per layer and per project.
6. Define the "test count checkpoint" practice — maintaining accurate running totals in project memory.

## Non-Goals

- Migrating either project to a different test framework.
- Implementing CI/CD changes (that is a separate deployment concern).
- Writing actual tests (this spec defines strategy, not implementation).
- Changing the existing test directory structures.

## Scope

### Projects Covered

| Project | Path | Framework |
|---------|------|-----------|
| LMS Backend | `/home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server/` | vitest |
| LMS Frontend | `/home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend/` | vitest |
| LMS E2E | `/home/webadmin/web-stack/html/LMS-AmmaWallet/e2e/` | Playwright |
| AmmaWallet Backend | `/home/webadmin/web-stack/html/amma-wallet/packages/backend/` | vitest |
| AmmaWallet Frontend | `/home/webadmin/web-stack/html/amma-wallet/packages/web-app/` | vitest |

### Current Test Counts (Baseline)

| Project | Backend | Frontend | E2E | Total |
|---------|---------|----------|-----|-------|
| LMS | 1149 | 206 | 14 | 1369 |
| AmmaWallet | 492 | 23 | 0 | 515 |
| **Combined** | **1641** | **229** | **14** | **1884** |

### Canonical Test Commands

#### LMS

```bash
# Backend unit + integration tests
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server && npx vitest run

# Frontend component + unit tests
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend && npx vitest run

# E2E tests (auto-starts backend + frontend via webServer config)
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/e2e && npx playwright test
```

**LMS gotcha:** Never use `npx --prefix LMS-Server vitest run` — always `cd` first.

#### AmmaWallet

```bash
# Backend unit + integration tests
cd /home/webadmin/web-stack/html/amma-wallet/packages/backend && npx vitest run

# Frontend component + unit tests
cd /home/webadmin/web-stack/html/amma-wallet/packages/web-app && npx vitest run
```

### Testing Layers

#### Layer 1: Unit Tests

- **Scope:** Single function or class in isolation. Dependencies are mocked or stubbed.
- **Speed:** Sub-second per test file.
- **Naming:** `*.test.ts` co-located with source, or in `__tests__/` directory.
- **Coverage expectation:** All new business logic functions must have unit tests. Target: 80%+ line coverage on new code.

#### Layer 2: Integration Tests

- **Scope:** Multiple modules interacting together. Database calls use real in-memory or test databases. HTTP handlers tested via supertest or equivalent.
- **Speed:** Under 5 seconds per test file.
- **Naming:** `*.test.ts` (same as unit — vitest runs both). Integration tests are distinguished by their use of real dependencies (DB, HTTP layer).
- **Coverage expectation:** All API endpoints must have at least one happy-path and one error-path integration test.

#### Layer 3: E2E Tests

- **Scope:** Full application stack running. Browser automation (Playwright) exercises user flows end-to-end.
- **Speed:** Under 30 seconds per test.
- **Naming:** `*.spec.ts` in the `e2e/` directory.
- **Coverage expectation:** Critical user journeys (auth, dashboard access, primary workflows) must have E2E coverage.

### TDD Enforcement Rules

1. **Bug fixes:** Test-first required. Write a failing test that reproduces the bug before writing the fix.
2. **New API endpoints:** Test-first required. Define expected request/response in a test before implementing the route handler.
3. **New UI components:** Test-after acceptable. Write component tests after the component is visually verified.
4. **Refactoring:** Existing tests must pass before and after. No new tests required unless behavior changes.
5. **Schema migrations:** Integration test required that exercises the migration path (create table, insert, query).

### Test Matrix Format

Every phase closeout document must include a test matrix in this format:

```
| Test ID | Description | Layer | Status |
|---------|-------------|-------|--------|
| XXX-1   | description | Unit  | PASS   |
| XXX-2   | description | Integration | PASS |
| XXX-3   | description | E2E   | PASS   |
```

The `XXX` prefix is a short identifier for the feature (e.g., `INV` for invoices, `RBAC` for role-based access control).

### Coverage Expectations

| Layer | New Code | Existing Code |
|-------|----------|---------------|
| Unit | 80%+ lines | Best effort |
| Integration | All endpoints | Critical paths |
| E2E | Critical journeys | Smoke tests |

### Test Count Checkpoint Practice

After every phase completion:

1. Run all test suites for the affected project.
2. Record the new totals in the MEMORY.md entry for that project.
3. Include the delta (e.g., "+6 BE +4 FE tests") in the phase tag description.
4. If any test count decreases, document the reason (test consolidation, removal of obsolete tests).

## Acceptance Criteria

1. All three testing layers are defined with clear scope boundaries, naming conventions, and speed expectations.
2. TDD enforcement rules specify when test-first vs. test-after is required.
3. The test matrix format is documented with an example template.
4. Canonical test commands are listed for both LMS and AmmaWallet, including known gotchas.
5. Coverage expectations are quantified per layer.
6. The test count checkpoint practice is defined with steps for maintaining running totals.
7. Current baseline test counts are recorded for both projects.
