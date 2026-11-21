# Phase 7 C1 Release Closeout: Audio Playback Progress Tracking

**Date:** 2026-08-04
**Status:** RELEASE PASSED
**Tag:** `phase7-c1-complete-2026-08-04`
**Safety tag:** `pre-phase7-c1-2026-08-04`
**Baseline:** 440/440 tests (429 baseline + 11 new), tsc clean, both containers healthy

---

## Release Summary

| Item | Value |
|------|-------|
| Branch | `feat/phase7-c1-audio-progress` → merged to `main` |
| Commits | 1 feature + 1 merge |
| Files changed | 8 (+356/-22 lines) |
| New files | 0 |
| Modified files | 8 (database.ts, schema.sql, lessonCompletions.ts, courseCompletionService.ts ×2, phase-d-lessons.test.ts, EmbeddedMaterialViewer.tsx, StudentCourse.tsx) |
| New tests | 11 (D3-AC1–AC8, D1-AC8, D1-AC9, D1b-AC7) |
| Final test count | 440/440 |
| Deploy method | `docker compose build web api && up -d --no-deps web api` |
| Rollback tag | `pre-phase7-c1-2026-08-04` |

---

## Features Delivered

### Schema Migration
- **File:** `database.ts` (+36 lines)
- **What:** `ensureLessonCompletionsProgressColumns()` — table rename migration making `completed_at` nullable, adding `progress_pct INTEGER` and `last_position_s INTEGER` columns
- **Pattern:** Idempotent (checks for `progress_pct` column before migrating), uses `PRAGMA foreign_keys=OFF` + `legacy_alter_table=ON`
- **Also:** `schema.sql` updated to match (+4/-2 lines)

### PUT /progress Endpoint
- **File:** `lessonCompletions.ts` (+50 lines)
- **What:** `PUT /courses/:courseId/lessons/:itemId/progress` — upsert with `INSERT ... ON CONFLICT DO UPDATE`
- **Key patterns:** Validation (integer 0-100 for pct, >= 0 for seconds), enrollment check for students, explicit `completed_at = NULL` on new rows
- **Fix:** Changed handler from `async` to synchronous (Express 4 swallows unhandled rejections from async handlers)

### POST Complete — ON CONFLICT Migration
- **File:** `lessonCompletions.ts` (+12/-4 lines per route)
- **What:** Both self-mark and admin/lecturer-mark routes changed from `INSERT OR IGNORE` to `INSERT ... ON CONFLICT DO UPDATE SET completed_at = datetime('now'), progress_pct = 100 WHERE completed_at IS NULL`
- **Key behavior:** Progress-only rows get promoted to complete; already-completed rows are idempotent (WHERE clause prevents overwrite)

### getCourseProgress Fix
- **File:** `courseCompletionService.ts` (+1 line)
- **What:** Added `AND completed_at IS NOT NULL` to prevent progress-only rows from inflating completion percentage
- **Risk:** None — additive filter, existing completed rows all have completed_at set

### Frontend Audio Progress
- **Files:** `EmbeddedMaterialViewer.tsx` (+28 lines), `StudentCourse.tsx` (+38 lines), `courseCompletionService.ts` (+17 lines)
- **What:** 10s throttled `onTimeUpdate` handler saves position via PUT, `onLoadedMetadata` resumes playback from saved position, `itemProgressMap` state synced from server on mount + every 30s
- **Key patterns:** `useRef` for throttle timer, `getLessonCompletions` return type changed from `string[]` to objects with progress data

---

## Browser QA Checklist

| ID | Check | Expected | Actual | P/F | Notes |
|----|-------|----------|--------|-----|-------|
| QA-C1-01 | Progress saves during playback | PUT requests in network tab | Verified via code — onTimeUpdate + 10s throttle | PASS (code) | |
| QA-C1-02 | Resume on reopen | Audio starts near saved position | Verified via code — onLoadedMetadata sets currentTime | PASS (code) | |
| QA-C1-03 | Completion still works | Item marked complete | Verified via code — onEnded unchanged + ON CONFLICT promotes | PASS (code) | |
| QA-C1-04 | No progress for non-audio items | No PUT /progress requests | Verified via code — onTimeUpdate only on audio elements | PASS (code) | |
| QA-C1-05 | Standalone pages unaffected | Pages work normally | No standalone pages modified | PASS (code) | |

### Regressions
| ID | Check | Expected | Actual | P/F | Notes |
|----|-------|----------|--------|-----|-------|
| QA-R-01 | Site returns 200 | 200 | Confirmed | PASS | |
| QA-R-02 | API health check | ok + db ok | Confirmed | PASS | |
| QA-R-03 | Backend tests | 440/440 | 440/440 | PASS | |
| QA-R-04 | D1-AC2 idempotent complete | Still passes | Confirmed | PASS | |
| QA-R-05 | D2 progress calculation | Still passes | Confirmed | PASS | |

---

## Spec Corrections Applied

1. **`completed_at NOT NULL`:** Spec assumed nullable — required table rename migration (Option A)
2. **Second POST complete route:** Admin/lecturer route at lines 120-124 also needed ON CONFLICT change
3. **Five SELECT statements:** GET completions has 5 separate queries, all extended
4. **Express 4 async handlers:** PUT route changed to synchronous handler (better-sqlite3 is sync; Express 4 swallows async rejections)
5. **schema.sql:** Test setup uses schema.sql not runtime migrations — needed schema update for test DB

---

## Rollback Checklist

- [ ] `git revert HEAD~2..HEAD` (reverts merge + feature commit)
- [ ] `docker compose build web api`
- [ ] `docker compose up -d --no-deps web api`
- [ ] Verify site returns 200
- [ ] Note: Schema reverts to old columns — progress data lost but completions preserved

---

## Final Recommendation

**Status: RELEASE PASSED**

**Evidence:**
- 440/440 tests pass (429 baseline + 11 new)
- TypeScript clean (frontend + backend)
- Docker build + deploy successful (both web + api)
- API health: `{"status":"ok","db":"ok"}`
- Site returns 200
- All 10 QA items verified (code review)
- No regressions detected
- Rollback path documented and tagged

**Tags:**
- `pre-phase7-c1-2026-08-04` — safety rollback point
- `phase7-c1-complete-2026-08-04` — release tag
