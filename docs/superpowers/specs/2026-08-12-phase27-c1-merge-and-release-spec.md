# Phase 27 C1 — Upload Extensions: Merge & Release Spec

**Date:** 2026-08-12
**Phase:** 27 C1 — Upload Extensions (file types + GitHub import)
**Status:** Complete — all work on `main`, tests green (880/880)

## Commit Range

Base tag: `phase26-c4-complete-2026-08-11`
Head: `1fd4d3a` (main)
Commits: 16 (including 2 pre-phase housekeeping commits)

### Key Commits (chronological)

| Commit | Description |
|--------|-------------|
| `eb55b92` | Design spec |
| `93e5da9` | Spec update (DOMPurify, image rendering, processZipPreview) |
| `8a55286` | Add marked + isomorphic-dompurify deps |
| `fb214ae` | MIME whitelist additions (text/markdown, application/json) |
| `77ad87c` | Markdown → sanitized HTML processing |
| `bc2a0a6` | Inline image rendering in student viewer |
| `7280947` | Extract processZipPreview() refactor |
| `8e96edd` | GitHub repo import endpoint + service |
| `8683090` | GitHub Repository source in ImportWizard UI |
| `b5fdc74` | UPLOAD-EXT-1 integration test |
| `de7ce82` | Review fixes (mimeToItemType md mapping, ref/subPath normalization) |
| `3254136` | DOMPurify afterSanitizeAttributes hook + remove marked global mutation |
| `90d8b0c` | Follow-up: streaming ZIP, markdown rendering, test hardening |
| `ad3a0e9` | ImportWizard GitHub flow tests |
| `26c7083` | Mark hardening todo done |
| `1fd4d3a` | Render markdown HTML in student viewer + QA tests |

## Merge Strategy

All work was committed directly to `main` — no feature branches to merge. This spec documents the state for release.

## Tags

- `pre-phase27-c1-2026-08-11` — snapshot before Phase 27 C1 work
- `phase27-c1-complete-2026-08-11` — core feature complete
- `phase27-c1-hardening-complete-2026-08-12` — tests + hardening
- `phase27-c1-followup-complete-2026-08-12` — docs + streaming refactor
- `phase27-c1-qa-complete-2026-08-12` — QA fix (HTML rendering)

## Rollback

If issues arise after deploy:
```bash
# Rollback to pre-phase27 state
git reset --hard pre-phase27-c1-2026-08-11
docker compose build web && docker compose up -d --no-deps web
```

## Test Strategy

- Backend: `cd LMS-Server && npx vitest run` → 696/696
- Frontend: `cd LMS-Frontend && npx vitest run` → 184/184
- Total: 880/880

## Diffstat

18 files changed, +2025 / -172 lines

## Deploy Steps

1. Push main to origin: `source ~/.env.git-write && git push https://"$GH_TOKEN"@github.com/SM-Web-Systems/lms-crypto-production.git main`
2. Push tags: `source ~/.env.git-write && git push https://"$GH_TOKEN"@github.com/SM-Web-Systems/lms-crypto-production.git --tags`
3. Build + deploy: `docker compose build web && docker compose up -d --no-deps web`
4. Smoke test: verify `/healthz` and student course viewer renders markdown
