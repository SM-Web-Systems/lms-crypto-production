# Phase 2 — Feature build-out (internal phases 2 to 27)

**When:** 3–12 August 2026
**Archive:** the 2026-08-03 to 2026-08-12 files in [`docs/archive/superpowers/plans`](../archive/superpowers/plans/) and [`specs`](../archive/superpowers/specs/) (`phaseN-*`, `phase-a` to `phase-g`, `upload-extensions-*`, `course-*`), and [`docs/archive/qa/`](../archive/qa/).

## Goal

Turn the LMS into a complete platform: richer courses, payments, sponsors, roles, notifications and certificates.

## What was built

This work was planned and closed in about 26 short internal "phases", each with a design, a plan and a close-out note.

| Area | Highlights |
|---|---|
| Courses | New item types in the course builder and student viewer, smart completion, audio progress, quiz UX, course import (ZIP, bulk upload, data model and template), uploads for Markdown, JSON and images, GitHub repository import |
| Payments | Manual payments, freemium tiers, Paystack and Stellar payment automation, invoice and receipt PDFs, payment history and payment analytics |
| Sponsors and cohorts | Sponsor portal v2, sponsor cohorts, cohort completion tracking and status changes, bulk invites, a spending report |
| Roles | Capability-based RBAC (76 permissions), phases A–G adding parent, teacher, employer, sponsor, instructor and TA roles, admin tiers |
| Certificates | NFT badge improvements, a QR code on the certificate PDF, social sharing, a badge gallery and search, dynamic share images, bulk export |
| Platform | Multi-tenant structure, structured logging and request tracing, an OpenAPI spec, notifications v2, email templates, a deploy pipeline, global search, an E2E test framework, accessibility fixes, dead-code cleanup |

## Outcome

By 12 August the automated suite had 880 tests. A status check on 14 August counted 1,185 passing tests and 58 database tables. The student, admin and super-admin roles were ready for production. Most other roles worked but had no onboarding yet.

## Key documents

- `superpowers/specs/2026-08-14-developed-vs-remaining-inventory.md`: the best single summary of what existed and what was left at the end of this phase.
- `superpowers/plans/2026-08-12-phase27-c1-release-note.md`: the last release note in this run.
