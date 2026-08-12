# Phase 27 C1 — Upload Extensions (2026-08-12)

This phase extends the LMS upload and import system to support richer courseware and GitHub-based workflows.

## What's New

### New file types
- **.md (Markdown)** — rendered as sanitized HTML in the student course viewer
- **.json** — stored as downloadable resources
- **Images (.png/.jpg/.jpeg/.gif)** — rendered inline in the student viewer

### GitHub repository import
- New "GitHub Repository" option in ImportWizard
- Server-side ZIP download from GitHub API, org-whitelisted to SM-Web-Systems
- Reuses the existing ZIP import pipeline for preview and commit

### Security & hardening
- Markdown HTML sanitized with DOMPurify (including `afterSanitizeAttributes` hook enforcing `target="_blank"` and `rel="noopener noreferrer"` on links)
- Additional backend and frontend tests covering markdown rendering, link security, and GitHub import flows

## Impact

- Lecturers and admins can import course content directly from GitHub repositories
- Students see properly formatted markdown content (headings, lists, code, links) instead of raw text
- Inline images improve readability of visual course materials

## Metrics

- **Automated tests:** 880 total (696 backend, 184 frontend)
- **Files changed:** 18 (+2,025 / -172 lines)
- **No breaking changes** to existing upload/import flows

## Tags

- `phase27-c1-complete-2026-08-11`
- `phase27-c1-hardening-complete-2026-08-12`
- `phase27-c1-followup-complete-2026-08-12`
- `phase27-c1-qa-complete-2026-08-12`
