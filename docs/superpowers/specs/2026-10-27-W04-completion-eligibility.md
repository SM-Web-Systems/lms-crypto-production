# W04: Course completion eligibility scoping

Date: 2026-10-27 | Priority: P1 | Stage: S2-T04
Audit: `docs/audits/2026-10-26-platform-wiring-audit.md` finding W04

## Problem

Two defects in the reward eligibility pipeline cause premature and cross-course reward triggers.

### Defect 1: Premature event production

`lessonCompletions.ts:157` fires `produceOutboxEvent('course_completion', courseId, callerId, { itemId, sectionId })` on every individual lesson completion. The event type is `'course_completion'` but the trigger is a single lesson mark — not actual course completion.

### Defect 2: Missing course-scope check in eligibility

`evaluateEligibility()` in `rewardEligibilityService.ts:137-198` matches `reward_type === 'course_completion'` against `event_type === 'course_completion'` (line 191). It does **not** verify:
- The event's `event_source_id` (courseId) matches the reward's scope
- The student actually completed all required lessons/assessments in the course

The `requiredSourceId` config check (lines 183-186) could scope to a specific course, but only when `eligibilityConfig.requiredSourceId` is explicitly set on the reward. Without it, any course's lesson completion triggers any active course_completion reward the student participates in.

### Ripwire evidence

- `evaluateEligibility` (rank 1 for completion query): complexity 20/26, highest in the subsystem
- `getCourseProgress` exists in `courseCompletionService.ts:55` (rank 21) — calculates actual completion percentage — **never called from eligibility**
- `produceOutboxEvent` (rank 28): 2 callers (lesson completion route, quiz submission)

### Impact

A student completing lesson 1 of Course A receives a `course_completion` reward intended for finishing Course B, provided both rewards use `course_completion` type and the student is in both audiences.

## Intended behavior

### Fix 1: Event production

Replace the per-lesson `course_completion` outbox event with a genuine course-completion check:

```ts
// After lesson completion write:
const progress = getCourseProgress(callerId, courseId);
if (progress.completionPct === 100) {
  produceOutboxEvent('course_completion', courseId, callerId, { completionPct: 100 });
}
// Individual lesson completions produce 'lesson_completion' (or nothing)
```

### Fix 2: Eligibility source binding

In `evaluateEligibility()`, when `reward.reward_type === 'course_completion'`:
1. **Always** verify `event.event_source_id` matches the reward's course scope (derive from reward's `scope_type` and `scope_id`, or from `eligibilityConfig.courseId`)
2. Verify the event data confirms actual completion (not just a lesson mark)

## Invariants

1. `course_completion` outbox events fire only when a course is fully completed.
2. Eligibility evaluation for `course_completion` rewards verifies the source course matches the reward's scope.
3. Individual lesson completions do not trigger course-level rewards.
4. Quiz pass events (`quiz_pass`) remain separate and unaffected.

## Touched files

| File | Change |
| --- | --- |
| `src/routes/lessonCompletions.ts` | Replace line 157: check course progress before emitting `course_completion`; import `getCourseProgress` |
| `src/services/rewards/rewardEligibilityService.ts` | Add course-scope check in `evaluateEligibility()` for `course_completion` rewards |
| `src/services/courseCompletionService.ts` | No change; `getCourseProgress()` already exists |
| `src/__tests__/reward-completion-scope.test.ts` | **New**: course-completion scoping tests |

## TDD steps

1. **RED**: Single lesson completion on a multi-lesson course → expect no `course_completion` outbox event → currently produces one.
2. **RED**: Complete all lessons in Course A → expect `course_completion` event with courseId=A → verify.
3. **RED**: Course A completion triggers eligibility for Course B reward → expect ineligible → currently eligible.
4. **GREEN**: Add completion check before outbox event in lesson completion route.
5. **GREEN**: Add source-course validation in `evaluateEligibility()`.
6. **REFACTOR**: Ensure quiz-pass and grade-approved paths remain unaffected.

## Acceptance criteria

- [ ] Single lesson completion does not produce `course_completion` outbox event
- [ ] Full course completion (all lessons done) produces `course_completion` event
- [ ] Cross-course eligibility is rejected
- [ ] Quiz pass events still trigger `quiz_pass` rewards correctly
- [ ] Characterization probe W04 fails
- [ ] Existing eligibility tests pass
- [ ] Independent review completed
