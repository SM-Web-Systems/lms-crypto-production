# LMS Improvement Plan

## Context

The LMS repository is clean and documented:

- Local and remote branches: `main` only.
- Current `main` SHA: `d722359ac9bbb80258a2e6d901f241cce3adcefc`.
- Deployed API and web build SHA: `f63124cfb5bf2ee952029af4bf9f394dd1f34c15`.
- LMS API health: `ok`.
- BVC course: 2 weeks, 7 sections, 56 items; 7 module quizzes + 1 final quiz (threshold 70); YouTube-primary video/audio; GitHub media downloads; native Markdown lessons/study guides; native flashcard decks; native mind maps.

Operations baseline is in place (`docs/operations/`), covering branch/PR workflow, release and rollback checklists, branch retirement, deployment record templates, SHA separation (source/API/web/content/migration), and a current production handover.

No deployment has occurred since the documentation merge. All improvements below start as documentation or small, reviewable changes and do not require immediate production deployment.

## Initiatives

### 1. E2E Test Coverage Expansion

- **Motivation:** Only 7 of 13+ student modules and 3 admin flows have E2E coverage. Payment, forum, course content, and NFT certificate flows are untested end-to-end.
- **Scope:** Add 4–6 new Playwright spec files for critical user journeys (e.g., payment success/failure, course content viewing, NFT badge minting, forum interactions).
- **Risk:** Low.
- **Effort:** M.
- **Dependencies:** Existing Playwright setup; stable test environment; non-flaky selectors for new flows.
- **Success criteria:**
  - At least 4 new E2E specs merged.
  - CI runs all E2E specs without new chronic flakiness.
  - Critical flows (payment, content viewing, NFT mint, forum) have at least one passing E2E scenario each.
- **First small change:** Document target E2E scenarios and priority order in this plan (done).

### 2. CI Pipeline Hardening

- **Motivation:** Deploy workflow has no configured secrets; CI has no `npm audit` step; no Dependabot config; no build-SHA verification in CI.
- **Scope:**
  - Add `npm audit` step to CI (fail on high/critical vulnerabilities or record as warning with tracking).
  - Add Dependabot configuration for `npm` dependencies.
  - Document required GitHub Secrets for deploy workflow (`DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`) without storing real values.
  - Optionally verify build SHA exposure in CI artifacts or logs.
- **Risk:** Low.
- **Effort:** S.
- **Dependencies:** Repository admin access to enable Dependabot and configure secrets (documentation only at first).
- **Success criteria:**
  - `dependabot.yml` present and valid.
  - CI includes `npm audit` step.
  - Deploy workflow documentation clearly lists required secrets and their purpose.
- **First small change:** Add `dependabot.yml` and an `npm audit` step to the CI workflow (in a follow-up PR after this plan is merged).

### 3. Stale Documentation Cleanup

- **Motivation:** `docs/DEPLOYMENT.md` is AmmaWallet content in the LMS repo. `DEPLOY.md` references Clerk auth (legacy from pre-production codebase). Production audit files reference pre-housekeeping SHAs.
- **Scope:**
  - Identify and remove or relocate AmmaWallet-specific docs from LMS.
  - Update or remove legacy Clerk references in `DEPLOY.md`.
  - Update production audit tracker references to current SHAs or mark as historical.
- **Risk:** Low.
- **Effort:** S.
- **Dependencies:** Clear understanding of which docs are authoritative for LMS vs AmmaWallet.
- **Success criteria:**
  - No AmmaWallet-specific deployment docs remain in LMS repo.
  - `DEPLOY.md` no longer implies Clerk is in use for LMS.
  - Production audit references align with current or clearly labeled historical SHAs.
- **First small change:** List all stale doc references and proposed actions in this plan (done).

### 4. Course Content QA Automation

- **Motivation:** BVC course has 56 items across 7 sections. No automated validation that all media URLs resolve, Markdown renders, or quiz thresholds are met.
- **Scope:** Add a content integrity script that:
  - Validates course structure (weeks, sections, items).
  - Checks media URLs (YouTube, GitHub) for reachability.
  - Verifies quiz configurations (e.g., passing thresholds, required questions).
  - Ensures all lesson/study guide Markdown files exist and are non-empty.
- **Risk:** Low (read-only validation; no content mutation).
- **Effort:** M.
- **Dependencies:** Access to course content source (repo or export); stable network for URL checks.
- **Success criteria:**
  - Script runs successfully in CI or locally.
  - All current BVC course items pass validation.
  - Any broken links or missing files are surfaced as actionable errors.
- **First small change:** Document content validation criteria in this plan (done).

### 5. Frontend Performance Baseline

- **Motivation:** No Lighthouse or Core Web Vitals baseline recorded. No bundle size tracking in CI.
- **Scope:**
  - Record baseline Lighthouse scores (Performance, Accessibility, Best Practices, SEO) for key pages (home, course viewer, quiz, dashboard).
  - Record bundle sizes for main frontend entry points.
  - Optionally add Lighthouse CI or a simple CI step that fails on significant regressions.
- **Risk:** Low.
- **Effort:** S.
- **Dependencies:** Ability to run Lighthouse locally or in CI; stable test URLs.
- **Success criteria:**
  - Baseline metrics documented.
  - CI includes at least a bundle-size check or Lighthouse run.
  - Clear targets defined for future performance work.
- **First small change:** Document current bundle size estimates and target metrics in this plan.

### 6. Payment Flow Hardening

- **Motivation:** Paystack webhook HMAC and Stellar payment monitor exist but have limited test coverage for edge cases (duplicate webhooks, expired sessions, partial payments).
- **Scope:** Add targeted unit tests for payment edge cases:
  - Duplicate webhook delivery.
  - Expired or timed-out payment sessions.
  - Partial or mismatched amounts.
  - Invalid or tampered signatures.
  - Race conditions between webhook and polling.
- **Risk:** Low (tests only; no behavior change initially).
- **Effort:** M.
- **Dependencies:** Existing payment service code and test setup.
- **Success criteria:**
  - New unit tests cover identified edge cases.
  - Tests pass in CI.
  - Any gaps or risky patterns are documented for future refactoring.
- **First small change:** Document specific edge cases to test in this plan (done).

## Prioritization

Recommended order (balancing risk, effort, and impact):

1. **CI Pipeline Hardening** — foundational for safe future changes.
2. **Stale Documentation Cleanup** — reduces confusion and maintenance cost.
3. **E2E Test Coverage Expansion** — improves confidence in critical flows.
4. **Payment Flow Hardening** — reduces financial and security risk.
5. **Course Content QA Automation** — protects learner experience and content integrity.
6. **Frontend Performance Baseline** — enables informed performance work later.

This order front-loads low-effort, high-clarity improvements (CI and docs), then builds test coverage around the most sensitive flows (payments, E2E), and finally adds content and performance baselines.

## Guardrails

All work under this plan must:

- Follow the new branch/PR/release workflow in `docs/operations/`.
- Use safe branch retirement procedures before deleting any feature branch.
- Respect SHA separation: source, API build, web build, content, and migration SHAs are recorded independently when relevant.
- Avoid production deployment without explicit approval.
- Protect BVC course content, learner data, quizzes, and NFT credentials:
  - No content mutation without dry-run and backup (for data migrations).
  - No changes that could invalidate existing learner progress or quiz attempts.
  - No changes to NFT credential logic without targeted tests and review.
- Keep changes small and reviewable:
  - Prefer multiple small PRs over large, risky changes.
  - Start with documentation or tests before refactors.
- Never commit secrets, tokens, database paths, backup locations, or user data.

This plan is a living document. Initiatives may be reprioritized or refined as new information emerges, but any change to scope or risk profile should be reflected here before implementation.
