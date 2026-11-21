# W04 — Genuine course completion and course-bound reward eligibility

Date: 2026-10-30
Branch: `codex/w04-course-completion-gating`
Base: `a58bf844` (W03-R5 merged to main)
Status: IN_PROGRESS

---

## 1. Problem statement

### 1.1 Premature `course_completion` outbox event (confirmed defect)

`lessonCompletions.ts:157` emits `course_completion` after every non-assessment
lesson completion inside the primary-write transaction:

```typescript
produceOutboxEvent('course_completion', courseId, callerId, { itemId, sectionId });
```

`evaluateEligibility` in `rewardEligibilityService.ts:191` permits this for any
`course_completion` reward:

```typescript
if (reward.reward_type === 'course_completion' && event.event_type !== 'course_completion') {
  return 'ineligible';
}
```

No DB-backed completion proof is required. A student who completes one lesson
in a 5-lesson course triggers the payout path.

### 1.2 Missing course binding (confirmed defect)

The consumer (`evaluateEligibility`) checks `event_type` and an optional
`requiredSourceId` from `eligibility_config`, but:

- `requiredSourceId` is optional; absent config allows any `course_completion` event
- Even with `requiredSourceId`, it only checks the event payload — no independent DB verification
- No authoritative binding is validated at activation time for non-cohort scopes

### 1.3 Dedup poisoning (confirmed defect)

The outbox has `UNIQUE(event_type, event_source_id, student_user_id)`.
`produceOutboxEvent` uses `INSERT OR IGNORE`.

The eligibility events table has `UNIQUE(reward_id, event_type, event_source_id, student_user_id)`.

Consequence: a premature event processed as `ineligible` (if any config check fires)
or any re-evaluation after the producer emits more than once — blocks legitimate
later completion for that (course, student) pair permanently.

For historical databases that already have premature ineligible events, legitimate
completion is silently blocked.

### 1.4 `getCourseProgress` cross-course defects (confirmed defects)

In `courseCompletionService.ts`:
- `hasApprovedSubmission` queries `submissions WHERE student_id=? AND status='approved'` — no `course_id` filter. Any approved submission from any course satisfies the gate.
- Required quiz lookup (`quizzes WHERE id = ?`) does not verify `quiz.course_id = courseId`. A required_quiz_id that belongs to a different course can be satisfied.
- Returns `lessonPercentage: 100` for a non-existent course and for empty courses.

### 1.5 Staff-mark path does not emit at all (gap)

`POST /courses/:courseId/students/:userId/lessons/:itemId/complete` marks lessons
for a student but never produces an outbox event. Staff completion of the final item
never triggers course_completion rewards.

---

## 2. Scope and constraints

- **In scope**: W04 only. W01–W03 financial/scope/replay/cap/migration behavior is preserved unchanged.
- **Synthetic databases only**. No live DB upgrade in this unit.
- **No new `lesson_completion` event type**. The existing `course_completion` event is used.
- **Schema change policy**: Avoid unless justified by a demonstrated W04 requirement. The dedup fix is achieved without schema reconstruction (UPDATE semantics on existing rows).
- **`getCourseProgress` contract**: Fix demonstrable defects (cross-course submission/quiz scope) while preserving the NFT certificate path's existing behavior; add test coverage for changed behavior.

---

## 3. Authoritative course completion predicate

**Function**: `isCourseCompleteForReward(userId: string, courseId: string): boolean`

Located in `courseCompletionService.ts` (alongside existing `getCourseProgress`).

**Algorithm**:

1. Look up course by `courseId`. If not found → **false** (course deleted or never existed).
2. Parse `sections` JSON → all items. If `items.length === 0` → **false** (empty course cannot be verified).
3. Look up `course_completion_requirements` for this course. If none → apply W04 strict default (see §3.1).
4. Lesson gate: ALL lesson items must have `lesson_completions.completed_at IS NOT NULL` for this (user, course). (This is always required for course_completion rewards — stricter than the certificate gate which has a configurable threshold.)
5. Quiz gate: for each id in `required_quiz_ids`:
   a. Verify `quizzes.course_id = courseId` — cross-course quiz cannot satisfy. If quiz does not exist or belongs to another course → **false**.
   b. Check `quiz_completions.passed = 1 AND score >= min_quiz_score` for this (quiz, user).
6. Submission gate (if `require_submissions = 1`): find `students` row for userId. Look up `submissions WHERE student_id = ? AND course_id = courseId AND status = 'approved'`. If none → **false**.
7. All gates passed → **true**.

### 3.1 W04 strict default (no requirements row)

When no `course_completion_requirements` row exists for the course:
- Lesson gate: all items required (no threshold)
- No required quizzes
- No submission required

This is stricter than `getCourseProgress`'s defaults (which require nothing).

### 3.2 `getCourseProgress` bug fixes (shared helper)

Fixed within the same function:
- `hasApprovedSubmission` query adds `AND course_id = ?` filter.
- Quiz loop validates `quiz.course_id === courseId`; cross-course quiz → treated as not passed.
- `lessonPercentage = 100` when `totalLessonItems = 0` remains unchanged (NFT path expects it); document clearly.

The changed submission/quiz behavior affects NFT certificate eligibility for courses where requirements were previously satisfied by cross-course evidence. This is a correctness fix; the behavioral change is documented and tested.

---

## 4. Course binding policy per scope type

| Scope | Authority | Source |
|-------|-----------|--------|
| `sponsor_cohort` | `sponsor_cohorts.course_id` | Authoritative; always present; validated at activation |
| `teacher_class` | `eligibility_config.requiredCourseId` | Must be explicit; validated at activation |
| `employer_team` | `eligibility_config.requiredCourseId` | Must be explicit; validated at activation |
| `parent_family` | `eligibility_config.requiredCourseId` | Must be explicit; validated at activation |
| `parent_child` | `eligibility_config.requiredCourseId` | Must be explicit; validated at activation |

**Activation gate** (added to `activateReward`): if `reward.reward_type === 'course_completion'`:
- Resolve binding using the table above
- Verify the bound course exists in the database
- If binding absent (non-cohort scope without `requiredCourseId`) → throw `MISSING_COURSE_BINDING` (400)
- If binding present but course deleted → throw `COURSE_NOT_FOUND` (404)
- If `sponsor_cohort` scope: `requiredCourseId` in config, if present, must match `cohort.course_id`; conflict → `CONFLICTING_COURSE_BINDING` (400)

**`eligibility_config.requiredCourseId`** is the canonical field name for the non-cohort binding. The existing `requiredSourceId` field (if present) is treated as a legacy alias for backward compatibility (both are checked; conflict refuses).

---

## 5. Producer changes

### 5.1 Self-mark lesson (`lessonCompletions.ts`)

**Before**: always emits `course_completion` inside the transaction.

**After**: inside the same transaction, after writing `lesson_completions`, call
`isCourseCompleteForReward(callerId, courseId)`. Emit `course_completion` only if true.

Transaction boundary: the primary write and `produceOutboxEvent` call remain in the
same `db.transaction()`. The predicate check also runs inside the transaction (reads
the just-written row). This ensures atomicity: the event reflects the actual committed
state.

### 5.2 Staff-mark lesson (`lessonCompletions.ts`)

**Before**: no outbox event emitted.

**After**: same check — if `isCourseCompleteForReward(userId, courseId)` → emit
`course_completion`. Run `processPendingEvents()` after the write (best-effort,
outside the transaction).

### 5.3 Quiz pass (`quizzesController.ts`)

**Before**: emits `quiz_pass` only.

**After**: Keep `quiz_pass` for quiz-type rewards. Additionally, if the quiz has a
`course_id` and `isCourseCompleteForReward(userId, quiz.course_id)` → emit
`course_completion` for `quiz.course_id`. Both events are inside the atomic transaction.

### 5.4 Submission approval (`submissionsController.ts`)

**Before**: emits `grade_approved` only.

**After**: Keep `grade_approved`. Additionally, if `existing.course_id` is set and
`isCourseCompleteForReward(studentUserId, existing.course_id)` → emit `course_completion`
for `existing.course_id`. Both inside the atomic transaction.

---

## 6. Consumer changes (`rewardEligibilityService.ts`)

### 6.1 `evaluateEligibility` — course-binding verification

After event-type check, for `course_completion` events consumed by `course_completion`
rewards:

1. Resolve the reward's bound course (see §4 policy; NOT from event data).
2. Verify `event.event_source_id === boundCourseId`. If mismatch → `ineligible`.
3. Call `isCourseCompleteForReward(event.student_user_id, boundCourseId)`. If false → `ineligible`.

### 6.2 Dedup fix — allow re-evaluation of ineligible records

**`already_processed` check** (lines 144–148): Only return `'already_processed'` if the
existing eligibility row has `result = 'eligible'`. An `ineligible` existing row does
NOT block re-evaluation.

**Eligibility insertion**: when re-evaluating an existing `ineligible` row to `eligible`,
UPDATE the row (`result = 'eligible', evaluated_at = datetime('now')`) rather than
attempting a new INSERT (which would violate the UNIQUE constraint).

No schema changes required. The UNIQUE constraint `(reward_id, event_type, event_source_id, student_user_id)` is preserved; we UPDATE existing rows instead of re-inserting.

### 6.3 `produceOutboxEvent` — dedup reset for ineligible

**Before**: `INSERT OR IGNORE` silently skips if any (event_type, event_source_id, student_user_id) row exists.

**After**: explicit check:
1. If row exists with `status = 'pending'` → skip (already queued).
2. If row exists with `status = 'completed'` AND any eligibility event for this tuple has `result = 'eligible'` → skip (already paid).
3. If row exists but was completed-ineligible (no eligible result) → UPDATE status to `'pending'` to allow re-evaluation.
4. If row exists with `status = 'failed'` → already handled by outbox retry worker; skip duplicate insert.
5. If no row → INSERT new row (original behavior).

This preserves outbox history (no deletes) while allowing legitimate retry.

---

## 7. Transaction and retry semantics

- Producer predicate check + outbox insert: **same `db.transaction()`** as the primary write. Atomic.
- `processPendingEvents()`: outside the transaction (retryable). Failure does not roll back the primary write.
- Consumer processes each event independently. Per-reward error is logged, does not block other rewards.
- Outbox worker retry: unchanged; exponential backoff, max 5 attempts.
- Idempotent re-evaluation: UPDATE semantics prevent double-eligible.
- Allocation state machine protects against double-release (existing W02 safeguard unchanged).

---

## 8. Eligibility time semantics

For `course_completion` rewards:
- **Point-in-time proof**: the predicate is evaluated against current DB state at consumer processing time, not at event emission time.
- **Reward activated after completion**: if a student completed the course before the reward was activated, no outbox event exists; no retroactive payment. Separately authorized operator assessment required.
- **Course content changes after emission**: if requirements are relaxed after a premature emission, the re-evaluation (once triggered by a valid event) uses current requirements.
- **Revoked access**: if `canAccessCourse` is revoked, the student is no longer enrolled. No additional revocation is implemented in this unit; the audience snapshot and allocation state machine are unchanged (existing W01–W02 safeguards).

---

## 9. Error codes (new)

| Code | HTTP | Condition |
|------|------|-----------|
| `MISSING_COURSE_BINDING` | 400 | Non-cohort `course_completion` reward activated without `requiredCourseId` in `eligibility_config` |
| `COURSE_NOT_FOUND` | 404 | Bound course does not exist at activation time |
| `CONFLICTING_COURSE_BINDING` | 400 | `eligibility_config.requiredCourseId` conflicts with `sponsor_cohort.course_id` |

---

## 10. Test matrix

| ID | Scenario | Type | Result |
|----|----------|------|--------|
| W04-L-1 | Lesson 1 of 3 complete: no event, no payment | service unit | pass: no outbox row, no eligibility |
| W04-L-2 | All 3 lessons complete: event emitted, payment triggered | service unit | pass: outbox row, allocation eligible |
| W04-L-3 | Empty course (0 items): predicate false, no event | service unit | pass |
| W04-L-4 | Rounded 100% but item missing DB row: predicate false | service unit | pass |
| W04-Q-1 | Quiz pass, quiz is final req, all lessons done: course_completion event emitted | service unit | pass |
| W04-Q-2 | Quiz pass, lessons not done yet: no course_completion event | service unit | pass |
| W04-Q-3 | Quiz from different course: cross-course quiz does not satisfy gate | service unit | pass |
| W04-S-1 | Submission approval, final req, all lessons done: course_completion emitted | service unit | pass |
| W04-S-2 | Submission approval, submission belongs to different course: does not satisfy gate | service unit | pass |
| W04-B-1 | Sponsor cohort reward: bound to cohort.course_id; event for different course → ineligible | service unit | pass |
| W04-B-2 | Teacher class reward: requiredCourseId in config; event matches + DB proof → eligible | service unit | pass |
| W04-B-3 | Teacher class reward: missing requiredCourseId → activateReward throws MISSING_COURSE_BINDING | service unit | pass |
| W04-B-4 | Sponsor cohort reward: conflicting requiredCourseId in config → activateReward throws | service unit | pass |
| W04-D-1 | Premature ineligible outbox row + genuine completion: re-evaluation succeeds | service unit | pass |
| W04-D-2 | Outbox dedup reset: completed-ineligible row reset to pending on re-emit | service unit | pass |
| W04-D-3 | Two rewards for course A and B; learner completes A: only A-bound reward pays | service unit | pass |
| W04-D-4 | Forged event with courseId but no DB proof: ineligible | service unit | pass |
| W04-D-5 | Legitimate DB proof: eligible | service unit | pass |
| W04-R-1 | Repeated final-lesson calls (idempotent ON CONFLICT): one effective completion | service unit | pass |
| W04-R-2 | Worker retry on completed-ineligible: safe retry path succeeds on genuine completion | service unit | pass |
| W04-E-1 | End-to-end HTTP: funded/activated sponsor reward → complete all lessons → auto-release | HTTP integration | pass |
| W04-E-2 | End-to-end HTTP: non-cohort teacher reward → complete lessons/quiz → manual release | HTTP integration | pass |
| W04-G-1 | grade/quiz/custom reward: behavior unchanged after W04 | service regression | pass |
| W04-W-1 | W03 cap, unused reservation, migration regressions: full suite still passes | regression | pass |

---

## 11. Files changed

| File | Change |
|------|--------|
| `src/services/courseCompletionService.ts` | Add `isCourseCompleteForReward`; fix cross-course submission/quiz bugs in `getCourseProgress` |
| `src/services/rewards/rewardEligibilityService.ts` | Fix dedup logic; add course-binding verification in `evaluateEligibility`; fix `produceOutboxEvent` dedup reset |
| `src/routes/lessonCompletions.ts` | Fix producer in self-mark and staff-mark routes |
| `src/controllers/quizzesController.ts` | Fix producer (emit course_completion on quiz pass if final requirement) |
| `src/controllers/submissionsController.ts` | Fix producer (emit course_completion on approval if final requirement) |
| `src/services/rewards/rewardService.ts` | Add activation-time binding validation for course_completion rewards |
| `src/services/rewards/rewardErrors.ts` | Add MISSING_COURSE_BINDING, COURSE_NOT_FOUND, CONFLICTING_COURSE_BINDING |
| `src/__tests__/reward-course-completion.test.ts` | New: W04 behavioral tests (all scenarios in §10) |

---

## 12. Compatibility and rollback

- No schema changes → no migration required.
- Existing rewards without `requiredCourseId` in eligibility_config that are already active: not affected at activation (gate only runs at activation time). The consumer binding check applies at evaluation time; rewards without binding in non-cohort scopes return `ineligible` (fail-closed).
- Historical premature outbox rows: the dedup reset in `produceOutboxEvent` recovers them when the genuine completion event would be produced.
- Historical premature eligibility rows (ineligible): `evaluateEligibility` re-evaluates these on next event processing, updating in-place.
- Rollback: revert the 8 changed files; no schema to roll back.
