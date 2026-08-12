# Phase 27 C1 — Merge & Release To-Do

## Pre-merge Checks

- [x] Backend tests green (696/696)
- [x] Frontend tests green (184/184)
- [x] No merge conflicts (all work on main)
- [x] All Phase 27 tags in place

## Push to Origin

- [x] Push main (16 commits) to origin
- [x] Push tags to origin

## Post-push Verification

- [x] Confirm origin/main matches local HEAD

## Deploy to Production

- [x] `docker compose build web`
- [x] `docker compose up -d --no-deps web`
- [x] Verify `/healthz` returns OK
- [x] Verify student course viewer renders markdown content

## Documentation

- [x] Merge & release spec: `docs/superpowers/specs/2026-08-12-phase27-c1-merge-and-release-spec.md`
- [x] This to-do list: `docs/superpowers/plans/2026-08-12-phase27-c1-merge-todo.md`
- [x] Release note: `docs/superpowers/plans/2026-08-12-phase27-c1-release-note.md`
- [x] Update MEMORY.md with Phase 27 C1 entry
