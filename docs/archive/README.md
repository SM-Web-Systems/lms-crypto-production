# Archive

These are the detailed specs, plans, reviews, evidence and notes from earlier development. They are kept for the audit trail and are not maintained. SHAs, test counts and production details in them describe the state at the time they were written. For a summary, read the [phase reports](../phases/).

Every file was moved with `git mv`, so `git log --follow <file>` still shows its full history.

## Where things moved (November 2026)

| Old location | New location |
|---|---|
| `docs/*.md` (QA pack, Wave 2, findings) | `2026-07-audit-and-qa/` |
| `docs/superpowers/` | `superpowers/` |
| `docs/release/*` (except the two files still in `docs/release/`) | `release/` |
| `docs/specs/`, `docs/audits/`, `docs/diagrams/` | `specs/`, `audits/`, `diagrams/` |
| `docs/deliverable-1/`, `docs/deliverable-3/` | `deliverable-1/`, `deliverable-3/` |
| `docs/forum/`, `docs/messaging/`, `docs/phase3/`, `docs/qa/` | same names here |
| Dated handovers and plans in `docs/operations/` | `operations/` |
| `notes/` | `notes/` |
| `production-audit/` | `production-audit/` |
| `specs/` (repository root) | `specs-2026-08-roadmap/` |
| `LMS-Server/docs/specs/`, `LMS-Server/docs/superpowers/`, old `LMS-Server/*_SPECIFICATION.md`, `FRONTEND_INTEGRATION.md`, `HOW_TO_PROMOTE_USER_TO_ADMIN.md` | `lms-server-docs/` |
| `output/playwright/*.png` | `screenshots/playwright/` |

A path such as `docs/release/AUTH-13-…md` mentioned inside an archived file now lives at `docs/archive/release/AUTH-13-…md`.
