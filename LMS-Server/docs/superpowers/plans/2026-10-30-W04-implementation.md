# W04 Course Completion Gating — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix premature course_completion rewards by adding a DB-backed predicate, course binding validation, and safe re-evaluation path for dedup-poisoned records.

**Architecture:** 8 files changed; no schema migration. New `isCourseCompleteForReward` predicate in `courseCompletionService.ts`; activation-time binding gate in `rewardService.ts`; dedup-safe re-evaluation in `rewardEligibilityService.ts`; producer guards in lessonCompletions, quizzes, submissions.

**Tech Stack:** Node.js + TypeScript, better-sqlite3, Express, Vitest + supertest.

**Spec:** `docs/superpowers/specs/2026-10-30-W04-course-completion-gating.md`

## Global Constraints

- Preserve W01–W03 tests and behaviors unchanged.
- No schema changes (no table reconstruction, no startup migration).
- All tests in reward-course-completion.test.ts use synthetic in-memory DB seeded via direct DB calls.
- No mocked progress percentage; actual lesson_completions rows required.
- `isCourseCompleteForReward` imported from courseCompletionService.ts.
- Error codes `MISSING_COURSE_BINDING`, `COURSE_NOT_FOUND`, `CONFLICTING_COURSE_BINDING` added to `rewardErrors.ts`.
- All new tests use `afterEach(() => db.exec('DELETE FROM ...'))` cleanup pattern matching existing test files.
- TypeScript strict: no `any` except where existing code uses it.

---

## Task 1: Error codes + predicate function

**Files:**
- Modify: `src/services/rewards/rewardErrors.ts`
- Modify: `src/services/courseCompletionService.ts`

**Interfaces:**
- Produces: `isCourseCompleteForReward(userId: string, courseId: string): boolean` exported from courseCompletionService
- Produces: `RewardError('MISSING_COURSE_BINDING', ..., 400)`, `RewardError('COURSE_NOT_FOUND', ..., 404)`, `RewardError('CONFLICTING_COURSE_BINDING', ..., 400)`

- [ ] **Step 1.1: Add error codes to rewardErrors.ts**

Read the file first. The `REWARD_ERROR_CODES` type union needs three new entries.

Current valid codes (add to union):
`'MISSING_COURSE_BINDING' | 'COURSE_NOT_FOUND' | 'CONFLICTING_COURSE_BINDING'`

Run: `grep -n 'RewardErrorCode\|REWARD_ERROR_CODES' src/services/rewards/rewardErrors.ts`

- [ ] **Step 1.2: Write failing tests for `isCourseCompleteForReward`**

In `src/__tests__/reward-course-completion.test.ts`, first describe block `'isCourseCompleteForReward'`:

```typescript
import { describe, it, expect, afterEach } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import request from 'supertest';
import app from '../app.js';
import { db } from '../config/database.js';
import { generateToken } from '../config/jwt.js';
import { isCourseCompleteForReward } from '../services/courseCompletionService.js';
import {
  createReward,
  activateReward,
  fundReward,
} from '../services/rewards/rewardService.js';
import { produceOutboxEvent, processPendingEvents } from '../services/rewards/rewardEligibilityService.js';

// Cleanup tables used by W04 tests
function cleanW04Tables(): void {
  db.exec(`
    DELETE FROM reward_eligibility_events;
    DELETE FROM reward_event_outbox;
    DELETE FROM reward_allocations;
    DELETE FROM reward_transactions;
    DELETE FROM reward_accounts;
    DELETE FROM rewards;
    DELETE FROM lesson_completions;
    DELETE FROM quiz_completions;
    DELETE FROM submissions;
    DELETE FROM students;
    DELETE FROM cohort_members;
    DELETE FROM sponsor_cohorts;
    DELETE FROM user_group_members;
    DELETE FROM user_groups;
    DELETE FROM user_links;
    DELETE FROM course_completion_requirements;
    DELETE FROM courses;
    DELETE FROM quizzes;
    DELETE FROM users WHERE id NOT IN (SELECT id FROM users WHERE email LIKE 'seed%');
  `);
}

function makeItem(id: string, type = 'lesson'): object {
  return { id, type, title: `Item ${id}` };
}

function courseSections(items: object[]): string {
  return JSON.stringify([{ id: 's1', title: 'Section 1', items }]);
}

// W04-L-1: lesson 1 of 3 not complete
it('W04-L-1: predicate false when not all lessons complete', () => {
  const userId = uuidv4();
  const courseId = uuidv4();
  db.prepare("INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'U', ?, 'h', 'student')").run(userId, `${userId}@t.com`);
  const i1 = uuidv4(), i2 = uuidv4(), i3 = uuidv4();
  db.prepare("INSERT INTO courses (id, title, description, course_code, sections) VALUES (?, 'C', 'd', 'CC1', ?)").run(courseId, courseSections([makeItem(i1), makeItem(i2), makeItem(i3)]));
  db.prepare("INSERT INTO lesson_completions (id, user_id, course_id, item_id, section_id, marked_by, progress_pct) VALUES (?, ?, ?, ?, 's1', ?, 100)").run(uuidv4(), userId, courseId, i1, userId);
  
  expect(isCourseCompleteForReward(userId, courseId)).toBe(false);
});

// W04-L-2: all lessons complete
it('W04-L-2: predicate true when all lessons complete', () => {
  // seed course + user + all 3 completions → true
});

// W04-L-3: empty course → false
it('W04-L-3: predicate false for empty course', () => {});

// W04-L-4: course not found → false
it('W04-L-4: predicate false when course does not exist', () => {});
```

Run: `npx vitest run src/__tests__/reward-course-completion.test.ts 2>&1 | tail -20`

Expected: RED — `isCourseCompleteForReward` not exported yet.

- [ ] **Step 1.3: Implement `isCourseCompleteForReward` in courseCompletionService.ts**

Add after the existing `getRequirements` function:

```typescript
/**
 * W04: Authoritative course completion predicate for reward eligibility.
 * Stricter than getCourseProgress (which is used for NFT certificates):
 * - Always requires ALL lesson items complete (ignores lesson_threshold flag)
 * - Verifies quiz course_id matches (no cross-course satisfaction)
 * - Verifies submission course_id (no cross-course satisfaction)
 * - Returns false for empty courses and non-existent courses (fail-closed)
 */
export function isCourseCompleteForReward(userId: string, courseId: string): boolean {
  const course = queryOne<{ sections: string }>(
    'SELECT sections FROM courses WHERE id = ?',
    [courseId]
  );
  if (!course) return false;

  const sections: CourseSection[] = parseFlatSections(course.sections || '[]');
  const allItems = sections.flatMap((s) => s.items);
  if (allItems.length === 0) return false; // empty course — fail-closed

  // 1. Lesson gate: ALL items required (W04 strict default)
  const completedRows = query<{ item_id: string }>(
    'SELECT item_id FROM lesson_completions WHERE user_id = ? AND course_id = ? AND completed_at IS NOT NULL',
    [userId, courseId]
  );
  const completedSet = new Set(completedRows.map((r) => r.item_id));
  const allLessonsDone = allItems.every((item) => completedSet.has(item.id));
  if (!allLessonsDone) return false;

  // 2. Quiz gate (from course requirements; course-scoped)
  const reqs = queryOne<CourseCompletionRequirements>(
    'SELECT * FROM course_completion_requirements WHERE course_id = ?',
    [courseId]
  );
  const requiredIds: string[] = JSON.parse(reqs?.required_quiz_ids ?? '[]');
  const minScore = reqs?.min_quiz_score ?? DEFAULT_REQS.min_quiz_score;

  for (const quizId of requiredIds) {
    // Cross-course quiz guard: quiz must belong to this course
    const quiz = queryOne<{ passing_score: number; course_id: string | null }>(
      'SELECT passing_score, course_id FROM quizzes WHERE id = ?',
      [quizId]
    );
    if (!quiz || quiz.course_id !== courseId) return false; // quiz doesn't exist or belongs to wrong course

    const completion = queryOne<{ passed: number; score: number }>(
      'SELECT passed, score FROM quiz_completions WHERE quiz_id = ? AND user_id = ?',
      [quizId, userId]
    );
    if (!completion || completion.passed !== 1 || (completion.score ?? 0) < minScore) return false;
  }

  // 3. Submission gate (course-scoped)
  if (reqs?.require_submissions) {
    const student = queryOne<{ id: string }>(
      'SELECT id FROM students WHERE user_id = ?',
      [userId]
    );
    if (!student) return false;
    const approved = queryOne<{ id: string }>(
      "SELECT id FROM submissions WHERE student_id = ? AND course_id = ? AND status = 'approved'",
      [student.id, courseId]
    );
    if (!approved) return false;
  }

  return true;
}
```

- [ ] **Step 1.4: Run test, expect GREEN for W04-L-1 and W04-L-4; fill in W04-L-2 and W04-L-3**

Complete the test stubs with full DB seeding:

```typescript
// W04-L-2
it('W04-L-2: predicate true when all lessons complete', () => {
  const userId = uuidv4(), courseId = uuidv4();
  db.prepare("INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'U', ?, 'h', 'student')").run(userId, `${userId}@t.com`);
  const items = [uuidv4(), uuidv4(), uuidv4()];
  db.prepare("INSERT INTO courses (id, title, description, course_code, sections) VALUES (?, 'C', 'd', 'CC2', ?)").run(courseId, courseSections(items.map(makeItem)));
  for (const item of items) {
    db.prepare("INSERT INTO lesson_completions (id, user_id, course_id, item_id, section_id, marked_by, progress_pct) VALUES (?, ?, ?, ?, 's1', ?, 100)").run(uuidv4(), userId, courseId, item, userId);
  }
  expect(isCourseCompleteForReward(userId, courseId)).toBe(true);
});

// W04-L-3
it('W04-L-3: predicate false for empty course', () => {
  const userId = uuidv4(), courseId = uuidv4();
  db.prepare("INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'U', ?, 'h', 'student')").run(userId, `${userId}@t.com`);
  db.prepare("INSERT INTO courses (id, title, description, course_code, sections) VALUES (?, 'C', 'd', 'CC3', '[]')").run(courseId);
  expect(isCourseCompleteForReward(userId, courseId)).toBe(false);
});
```

- [ ] **Step 1.5: Run tests GREEN for predicate block**

Run: `npx vitest run src/__tests__/reward-course-completion.test.ts -t "W04-L" 2>&1 | tail -15`
Expected: all W04-L tests PASS.

- [ ] **Step 1.6: Add quiz and submission predicate tests (W04-Q-3, W04-S-2 as unit assertions)**

```typescript
it('W04-Q-3: cross-course quiz does not satisfy gate', () => {
  // course with required_quiz_ids pointing to a quiz from another course → false
});

it('W04-S-2: submission from different course does not satisfy gate', () => {
  // require_submissions = 1; submission exists but course_id mismatch → false
});
```

- [ ] **Step 1.7: Run all predicate tests GREEN, commit**

```bash
git add src/services/rewards/rewardErrors.ts src/services/courseCompletionService.ts src/__tests__/reward-course-completion.test.ts
git commit -m "feat(W04): add isCourseCompleteForReward predicate — fail-closed, course-scoped"
```

---

## Task 2: Fix `getCourseProgress` cross-course defects

**Files:**
- Modify: `src/services/courseCompletionService.ts`

**Interfaces:**
- Modifies: `getCourseProgress(userId, courseId): CourseProgress` — same signature, fixed behavior
- Consumer: `src/routes/progress.ts`, `src/routes/courseRequirements.ts`, NFT application routes (read-only callers)

- [ ] **Step 2.1: Write failing tests for cross-course defects**

```typescript
describe('getCourseProgress cross-course fixes', () => {
  it('W04-CCP-1: submission from different course does not satisfy require_submissions', () => {
    // Seed: course A with require_submissions=1, student has approved submission for course B
    // getCourseProgress(student, courseA).hasApprovedSubmission === false
  });

  it('W04-CCP-2: required quiz from different course does not satisfy quiz gate', () => {
    // course A requires quiz Q1; Q1 has course_id = courseB; student has passed Q1
    // getCourseProgress(student, courseA).allRequiredQuizzesPassed === false
  });
});
```

Run: `npx vitest run src/__tests__/reward-course-completion.test.ts -t "W04-CCP" 2>&1 | tail -10`
Expected: RED — current code checks `submissions WHERE student_id=? AND status='approved'` without course_id

- [ ] **Step 2.2: Fix `getCourseProgress` submission check**

In `courseCompletionService.ts`, change:
```typescript
// BEFORE
const approved = queryOne<{ id: string }>(
  "SELECT id FROM submissions WHERE student_id = ? AND status = 'approved'",
  [student.id]
);
// AFTER
const approved = queryOne<{ id: string }>(
  "SELECT id FROM submissions WHERE student_id = ? AND course_id = ? AND status = 'approved'",
  [student.id, courseId]
);
```

- [ ] **Step 2.3: Fix `getCourseProgress` quiz cross-course check**

In the quiz loop in `getCourseProgress`, after the existing quiz lookup, add:
```typescript
// Cross-course quiz guard (shared with isCourseCompleteForReward)
if (!quiz || quiz.course_id !== courseId) {
  requiredQuizzes.push({
    quizId,
    quizTitle: 'Unknown (cross-course quiz)',
    required: true,
    passed: false,   // treat cross-course quiz as not passed
    score: null,
    passingScore: reqs.min_quiz_score,
  });
  continue;
}
```

This requires adding `course_id` to the quiz SELECT:
```typescript
const quiz = queryOne<{ title: string; passing_score: number; course_id: string | null }>(
  'SELECT title, passing_score, course_id FROM quizzes WHERE id = ?',
  [quizId]
);
```

- [ ] **Step 2.4: Run tests GREEN, verify existing getCourseProgress tests still pass**

Run: `npx vitest run src/__tests__/reward-course-completion.test.ts -t "W04-CCP" 2>&1 | tail -10`
Run: `npx vitest run src/__tests__/ 2>&1 | grep -E "passed|failed" | tail -5`

Expected: W04-CCP tests GREEN, no regressions.

- [ ] **Step 2.5: Commit**

```bash
git add src/services/courseCompletionService.ts src/__tests__/reward-course-completion.test.ts
git commit -m "fix(W04): course-scope submission and quiz validation in getCourseProgress"
```

---

## Task 3: Activation-time course binding validation

**Files:**
- Modify: `src/services/rewards/rewardService.ts`

**Interfaces:**
- Consumes: `RewardError('MISSING_COURSE_BINDING', ..., 400)`, `RewardError('COURSE_NOT_FOUND', ..., 404)`, `RewardError('CONFLICTING_COURSE_BINDING', ..., 400)` from Task 1
- Modifies: `activateReward(rewardId, actorId, idempotencyKey)` — new validation before audience snapshot

- [ ] **Step 3.1: Write failing activation binding tests**

```typescript
describe('course_completion activation binding', () => {
  it('W04-B-3: teacher_class reward without requiredCourseId refuses activation', () => {
    // create teacher_class course_completion reward, no eligibility_config
    // activateReward → throws MISSING_COURSE_BINDING
  });

  it('W04-B-4: sponsor_cohort reward with conflicting requiredCourseId refuses activation', () => {
    // create sponsor_cohort reward, eligibility_config.requiredCourseId = different course
    // activateReward → throws CONFLICTING_COURSE_BINDING
  });

  it('W04-B-5: sponsor_cohort reward without conflicting config activates OK', () => {
    // create sponsor_cohort reward, no requiredCourseId in config → uses cohort.course_id → OK
  });

  it('W04-B-6: teacher_class reward with valid requiredCourseId activates OK', () => {
    // create teacher_class reward, eligibility_config = { requiredCourseId: existingCourseId }
    // activateReward → succeeds
  });
});
```

Run: RED — no binding check yet.

- [ ] **Step 3.2: Implement activation binding check in `activateReward`**

Find `activateReward` in `rewardService.ts`. Add binding validation before the audience snapshot step:

```typescript
// W04: Course binding validation for course_completion rewards
if (reward.reward_type === 'course_completion') {
  const config = reward.eligibility_config ? JSON.parse(reward.eligibility_config) as Record<string, unknown> : null;
  const configCourseId = typeof config?.requiredCourseId === 'string' ? config.requiredCourseId : null;

  let boundCourseId: string | null = null;

  if (reward.scope_type === 'sponsor_cohort') {
    const cohort = db.prepare('SELECT course_id FROM sponsor_cohorts WHERE id = ?').get(reward.scope_id) as { course_id: string } | undefined;
    if (!cohort) throw new RewardError('SCOPE_DENIED', 'Cohort not found', 404);
    boundCourseId = cohort.course_id;
    // Conflict check: if config also specifies a course, it must match
    if (configCourseId && configCourseId !== boundCourseId) {
      throw new RewardError('CONFLICTING_COURSE_BINDING',
        `eligibility_config.requiredCourseId (${configCourseId}) conflicts with cohort.course_id (${boundCourseId})`, 400);
    }
  } else {
    // Non-cohort scopes require explicit binding
    if (!configCourseId) {
      throw new RewardError('MISSING_COURSE_BINDING',
        'course_completion rewards with non-cohort scope require eligibility_config.requiredCourseId', 400);
    }
    boundCourseId = configCourseId;
  }

  // Verify bound course exists
  const courseExists = db.prepare('SELECT id FROM courses WHERE id = ?').get(boundCourseId);
  if (!courseExists) {
    throw new RewardError('COURSE_NOT_FOUND', `Bound course ${boundCourseId} not found`, 404);
  }
}
```

- [ ] **Step 3.3: Run tests GREEN**

Run: `npx vitest run src/__tests__/reward-course-completion.test.ts -t "W04-B" 2>&1 | tail -15`
Expected: W04-B-3 through W04-B-6 GREEN.

- [ ] **Step 3.4: Commit**

```bash
git add src/services/rewards/rewardService.ts src/__tests__/reward-course-completion.test.ts
git commit -m "feat(W04): activation-time course binding validation for course_completion rewards"
```

---

## Task 4: Consumer — course binding + DB proof in `evaluateEligibility`

**Files:**
- Modify: `src/services/rewards/rewardEligibilityService.ts`

**Interfaces:**
- Consumes: `isCourseCompleteForReward` from courseCompletionService
- Modifies: `evaluateEligibility`, `processEvent`, `produceOutboxEvent`

- [ ] **Step 4.1: Write failing consumer tests**

```typescript
describe('evaluateEligibility course_completion', () => {
  it('W04-D-4: forged event with courseId but no DB proof → ineligible', () => {
    // active sponsor_cohort course_completion reward; event_source_id = cohort.course_id
    // student in audience; no lesson completions
    // evaluateEligibility → ineligible
  });

  it('W04-D-5: legitimate DB proof → eligible', () => {
    // same reward; all lessons complete
    // evaluateEligibility → eligible
  });

  it('W04-B-1: event for different course → ineligible', () => {
    // reward bound to courseA; event.event_source_id = courseB → ineligible
  });

  it('W04-D-1: premature ineligible row + genuine completion → eligible on re-evaluation', () => {
    // 1. seed ineligible eligibility row (from prior premature processing)
    // 2. complete all lessons
    // 3. produceOutboxEvent (should reset to pending)
    // 4. processPendingEvents()
    // 5. allocation.status === 'eligible'
  });

  it('W04-D-2: outbox dedup reset on completed-ineligible', () => {
    // outbox row exists with status='completed' and no eligible eligibility record
    // produceOutboxEvent → should reset to pending
    // check: outbox row status = 'pending'
  });
});
```

Run: RED.

- [ ] **Step 4.2: Implement consumer course binding + DB proof**

At the top of `rewardEligibilityService.ts`, import:
```typescript
import { isCourseCompleteForReward } from '../../services/courseCompletionService.js';
```
Wait — rewardEligibilityService is already in services/rewards/. So:
```typescript
import { isCourseCompleteForReward } from '../courseCompletionService.js';
```

In `evaluateEligibility`, after the grade_approved conflict-of-interest check and before the `requiredEventType` check, add for `course_completion`:

```typescript
// W04: For course_completion events + course_completion rewards, verify binding + DB proof
if (event.event_type === 'course_completion' && reward.reward_type === 'course_completion') {
  // Resolve the reward's bound course (authoritative, independent of event payload)
  const config = reward.eligibility_config ? JSON.parse(reward.eligibility_config) as Record<string, unknown> : null;

  let boundCourseId: string | null = null;
  if (reward.scope_type === 'sponsor_cohort') {
    const cohort = db.prepare('SELECT course_id FROM sponsor_cohorts WHERE id = ?').get(reward.scope_id) as { course_id: string } | undefined;
    boundCourseId = cohort?.course_id ?? null;
  } else {
    boundCourseId = typeof config?.requiredCourseId === 'string' ? config.requiredCourseId : null;
  }

  if (!boundCourseId) return 'ineligible'; // no binding → fail-closed

  // Event must be for the reward's bound course
  if (event.event_source_id !== boundCourseId) return 'ineligible';

  // Independent DB proof — do not trust payload alone
  if (!isCourseCompleteForReward(event.student_user_id, boundCourseId)) return 'ineligible';
}
```

- [ ] **Step 4.3: Fix `already_processed` dedup — allow re-evaluation of ineligible**

Change the existing check:
```typescript
// BEFORE
const existing = db.prepare(
  `SELECT id FROM reward_eligibility_events
   WHERE reward_id = ? AND event_type = ? AND event_source_id = ? AND student_user_id = ?`
).get(reward.id, event.event_type, event.event_source_id, event.student_user_id);
if (existing) return 'already_processed';

// AFTER
const existing = db.prepare(
  `SELECT id, result FROM reward_eligibility_events
   WHERE reward_id = ? AND event_type = ? AND event_source_id = ? AND student_user_id = ?`
).get(reward.id, event.event_type, event.event_source_id, event.student_user_id) as
  { id: string; result: string } | undefined;

// Only block if already eligible (payment path started)
if (existing?.result === 'eligible') return 'already_processed';
```

- [ ] **Step 4.4: Fix eligibility event INSERT for re-evaluation (UPDATE ineligible → eligible)**

Change the eligibility event recording in `processEvent`:
```typescript
// BEFORE
db.prepare(
  `INSERT OR IGNORE INTO reward_eligibility_events
   (id, reward_id, event_type, event_source_id, student_user_id, result, idempotency_key)
   VALUES (?, ?, ?, ?, ?, ?, ?)`
).run(
  uuidv4(), reward.id, event.event_type, event.event_source_id,
  event.student_user_id, result,
  `elig-${reward.id}-${event.event_type}-${event.event_source_id}-${event.student_user_id}`
);

// AFTER — re-read the existing row (we already have it from the dedup check above)
// Need to expose `existing` from evaluateEligibility; instead, restructure slightly.
// Since evaluateEligibility returns the result, and processEvent handles the INSERT,
// pass the existing row context. Simpler: repeat the lookup in processEvent for INSERT.
```

Actually, the cleaner approach: the `existing` row check is inside `evaluateEligibility`. Change `processEvent` to handle the UPDATE case after receiving `result`. Add a helper:

```typescript
function upsertEligibilityEvent(
  rewardId: string, event: OutboxEvent, result: 'eligible' | 'ineligible'
): void {
  const idemKey = `elig-${rewardId}-${event.event_type}-${event.event_source_id}-${event.student_user_id}`;

  // Check if a row already exists
  const existing = db.prepare(
    `SELECT id FROM reward_eligibility_events
     WHERE reward_id = ? AND event_type = ? AND event_source_id = ? AND student_user_id = ?`
  ).get(rewardId, event.event_type, event.event_source_id, event.student_user_id) as
    { id: string } | undefined;

  if (existing) {
    // UPDATE existing row (covers ineligible → eligible re-evaluation)
    db.prepare(
      `UPDATE reward_eligibility_events
       SET result = ?, evaluated_at = datetime('now')
       WHERE id = ?`
    ).run(result, existing.id);
  } else {
    db.prepare(
      `INSERT OR IGNORE INTO reward_eligibility_events
       (id, reward_id, event_type, event_source_id, student_user_id, result, idempotency_key)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(uuidv4(), rewardId, event.event_type, event.event_source_id,
          event.student_user_id, result, idemKey);
  }
}
```

Replace the existing INSERT in `processEvent` with `upsertEligibilityEvent(reward.id, event, result)`.

- [ ] **Step 4.5: Fix `produceOutboxEvent` dedup reset**

Replace the current `INSERT OR IGNORE` with:

```typescript
export function produceOutboxEvent(
  eventType: 'course_completion' | 'quiz_pass' | 'milestone' | 'grade_approved' | 'custom',
  eventSourceId: string,
  studentUserId: string,
  eventData?: Record<string, unknown>,
): void {
  const existing = db.prepare(
    `SELECT id, status FROM reward_event_outbox
     WHERE event_type = ? AND event_source_id = ? AND student_user_id = ?`
  ).get(eventType, eventSourceId, studentUserId) as
    { id: string; status: string } | undefined;

  if (!existing) {
    // No prior row — insert fresh
    db.prepare(
      `INSERT OR IGNORE INTO reward_event_outbox
       (id, event_type, event_source_id, student_user_id, event_data, status)
       VALUES (?, ?, ?, ?, ?, 'pending')`
    ).run(uuidv4(), eventType, eventSourceId, studentUserId,
          eventData ? JSON.stringify(eventData) : null);
    return;
  }

  if (existing.status === 'pending') return; // already queued

  if (existing.status === 'completed') {
    // Check if any eligible result was recorded — if so, payment is done
    const hasEligible = db.prepare(
      `SELECT id FROM reward_eligibility_events
       WHERE event_type = ? AND event_source_id = ? AND student_user_id = ? AND result = 'eligible'
       LIMIT 1`
    ).get(eventType, eventSourceId, studentUserId);
    if (hasEligible) return; // already paid; don't re-trigger

    // Completed but all results were ineligible → reset to pending for re-evaluation
    db.prepare(
      `UPDATE reward_event_outbox
       SET status = 'pending', attempt_count = 0, completed_at = NULL, error_message = NULL,
           event_data = ?, last_attempt_at = NULL
       WHERE id = ?`
    ).run(eventData ? JSON.stringify(eventData) : null, existing.id);
    return;
  }

  // failed → outbox retry worker handles; skip duplicate insert
}
```

- [ ] **Step 4.6: Run consumer tests GREEN**

Run: `npx vitest run src/__tests__/reward-course-completion.test.ts -t "W04-D|W04-B-1" 2>&1 | tail -20`

- [ ] **Step 4.7: Run full suite, verify no regressions**

Run: `npx vitest run 2>&1 | grep -E "Tests|passed|failed" | tail -5`

- [ ] **Step 4.8: Commit**

```bash
git add src/services/rewards/rewardEligibilityService.ts src/services/courseCompletionService.ts src/__tests__/reward-course-completion.test.ts
git commit -m "fix(W04): course binding verification and dedup-safe re-evaluation in eligibility consumer"
```

---

## Task 5: Fix producers

**Files:**
- Modify: `src/routes/lessonCompletions.ts`
- Modify: `src/controllers/quizzesController.ts`
- Modify: `src/controllers/submissionsController.ts`

**Interfaces:**
- Consumes: `isCourseCompleteForReward` from courseCompletionService

- [ ] **Step 5.1: Write failing producer tests (service-level)**

```typescript
describe('producer guards', () => {
  it('W04-P-1: self-mark lesson 1 of 3 — no course_completion outbox event', () => {
    // seed course with 3 lessons; mark lesson 1 complete via DB
    // call isCourseCompleteForReward → false
    // assert: no outbox row with event_type='course_completion' and event_source_id=courseId
    // (Test the predicate guard logic, not the HTTP route)
  });

  it('W04-P-2: mark final lesson — course_completion event emitted', () => {
    // mark all lessons complete; then mark final one → predicate true
    // assert: outbox row exists
  });
});
```

Note: HTTP route tests are in the end-to-end section (Task 6). Producer unit tests
here focus on the predicate call outcome.

- [ ] **Step 5.2: Fix self-mark producer in `lessonCompletions.ts`**

Import `isCourseCompleteForReward`:
```typescript
import { isCourseCompleteForReward } from '../services/courseCompletionService.js';
```

Change the atomic transaction to:
```typescript
const atomicWrite = db.transaction(() => {
  execute(
    `INSERT INTO lesson_completions (id, user_id, course_id, item_id, section_id, marked_by, progress_pct)
     VALUES (?, ?, ?, ?, ?, ?, 100)
     ON CONFLICT (user_id, course_id, item_id)
     DO UPDATE SET completed_at = datetime('now'), marked_by = excluded.marked_by, progress_pct = 100
     WHERE completed_at IS NULL`,
    [uuidv4(), callerId, courseId, itemId, sectionId, callerId]
  );

  // W04: Only emit course_completion when the full predicate is satisfied
  // The predicate reads the just-written row (same transaction = consistent)
  if (isCourseCompleteForReward(callerId, courseId)) {
    produceOutboxEvent('course_completion', courseId, callerId, { itemId, sectionId });
  }
});
```

- [ ] **Step 5.3: Fix staff-mark producer in `lessonCompletions.ts`**

The staff-mark route currently has no outbox logic. Add after the `execute(...)` call:

```typescript
execute(
  `INSERT INTO lesson_completions ...`,
  [uuidv4(), userId, courseId, itemId, sectionId, callerId]
);

// W04: Check completion and emit event for the target student
if (isCourseCompleteForReward(userId, courseId)) {
  produceOutboxEvent('course_completion', courseId, userId, { itemId, sectionId, markedBy: callerId });
}
```

The staff-mark route is not inside a `db.transaction()` — the execute is direct. Wrap it in a transaction to match the pattern:

```typescript
const atomicWrite = db.transaction(() => {
  execute(/* INSERT INTO lesson_completions */);
  if (isCourseCompleteForReward(userId, courseId)) {
    produceOutboxEvent('course_completion', courseId, userId, { itemId, sectionId, markedBy: callerId });
  }
});
atomicWrite();
```

Add `processPendingEvents()` after the transaction (outside, retryable).

- [ ] **Step 5.4: Fix quiz producer in `quizzesController.ts`**

Import `isCourseCompleteForReward`:
```typescript
import { isCourseCompleteForReward } from '../services/courseCompletionService.js';
```

Inside the `atomicWrite` transaction, after the existing `produceOutboxEvent('quiz_pass', ...)`:

```typescript
// W04: also emit course_completion if this quiz pass completes the course
if (passed === 1 && quiz.course_id && isCourseCompleteForReward(userId, quiz.course_id)) {
  produceOutboxEvent('course_completion', quiz.course_id, userId,
    { triggeredBy: 'quiz_pass', quizId, courseId: quiz.course_id });
}
```

- [ ] **Step 5.5: Fix submission producer in `submissionsController.ts`**

Inside the `atomicWrite` transaction, after the existing `produceOutboxEvent('grade_approved', ...)`:

```typescript
// W04: also emit course_completion if this approval completes the course
if (existing.course_id && isCourseCompleteForReward(studentRecord.user_id, existing.course_id)) {
  produceOutboxEvent('course_completion', existing.course_id, studentRecord.user_id,
    { triggeredBy: 'grade_approved', submissionId: id, courseId: existing.course_id });
}
```

- [ ] **Step 5.6: Run producer tests GREEN**

Run: `npx vitest run src/__tests__/reward-course-completion.test.ts -t "W04-P|W04-Q|W04-S" 2>&1 | tail -15`

- [ ] **Step 5.7: Run full suite, no regressions**

Run: `npx vitest run 2>&1 | grep -E "Tests|passed|failed" | tail -5`

- [ ] **Step 5.8: Commit**

```bash
git add src/routes/lessonCompletions.ts src/controllers/quizzesController.ts src/controllers/submissionsController.ts src/__tests__/reward-course-completion.test.ts
git commit -m "fix(W04): guard producers — emit course_completion only after full predicate verification"
```

---

## Task 6: End-to-end HTTP integration tests + dedup/retry scenarios

**Files:**
- Modify: `src/__tests__/reward-course-completion.test.ts`

- [ ] **Step 6.1: Write E2E test W04-E-1 (sponsor cohort, auto-release)**

```typescript
it('W04-E-1: sponsor cohort — complete all lessons → auto-release', async () => {
  // Seed: sponsor, student, cohort → course_id=courseId, course with 2 lessons
  // Seed: reward (course_completion, auto_release=true, amount=500000 stroops)
  //   Fund + activate via service calls
  // HTTP: POST /courses/:courseId/lessons/:item1/complete (student token)
  //   → 200; check: no outbox row with course_completion yet
  // HTTP: POST /courses/:courseId/lessons/:item2/complete (student token)
  //   → 200; check: outbox row exists, allocation.status='eligible', allocation.released_at IS NOT NULL
  // Assert ledger: recipient.available_stroops > 0; funder.available_stroops decreased
});
```

- [ ] **Step 6.2: Write E2E test W04-E-2 (teacher class, manual release)**

```typescript
it('W04-E-2: teacher class — complete lessons + quiz → manual release eligibility', async () => {
  // Seed: teacher, student, teacher_class group + membership
  // Seed: course with 2 lessons + 1 quiz (course_id = courseId)
  //   course_completion_requirements: require_all_lessons=1, required_quiz_ids=[quizId]
  // Seed: reward (course_completion, teacher_class scope, eligibility_config.requiredCourseId = courseId)
  //   Fund + activate
  // Complete lesson 1 → predicate false, no event
  // Complete lesson 2 → predicate false (quiz not passed), no event
  // Pass quiz → predicate true → course_completion event → processPendingEvents → eligible
  // allocation.status = 'eligible'; reward still not released (manual)
});
```

- [ ] **Step 6.3: Write dedup/retry scenario W04-D-1 full HTTP path**

```typescript
it('W04-D-1-HTTP: premature ineligible history + genuine completion succeeds', async () => {
  // Seed active sponsor reward for course; student in audience
  // Manually insert a pre-existing outbox row (status=completed, ineligible eligibility event)
  // Complete all lessons via HTTP → produceOutboxEvent resets outbox to pending
  // processPendingEvents() → eligible
  // assert allocation.status = 'eligible'
});
```

- [ ] **Step 6.4: Write multi-course isolation test W04-D-3**

```typescript
it('W04-D-3: completing course A only qualifies A-bound reward', async () => {
  // 2 courses, 2 sponsor_cohort rewards bound to courseA and courseB respectively
  // Student enrolled in both cohorts
  // Complete all lessons in courseA only
  // Reward A: eligible; Reward B: not eligible
});
```

- [ ] **Step 6.5: Write role/access test W04-R-1**

```typescript
it('W04-R-1: repeated final-lesson calls result in one effective completion', async () => {
  // Complete last lesson twice (ON CONFLICT DO UPDATE WHERE completed_at IS NULL)
  // Second call is a no-op on completion; predicate still true
  // One outbox row; one eligibility event; one allocation payout
});
```

- [ ] **Step 6.6: Run all W04 tests GREEN**

Run: `npx vitest run src/__tests__/reward-course-completion.test.ts 2>&1 | tail -20`
Expected: all W04-* tests PASS.

- [ ] **Step 6.7: Run full suite, count tests, verify W03 regressions pass**

Run: `npx vitest run 2>&1 | grep -E "Test Files|Tests |passed|failed|skip" | tail -5`
Expected: prior 2148 tests pass + new W04 tests; 0 failures.

- [ ] **Step 6.8: TSC clean**

Run: `npx tsc --noEmit 2>&1 | tail -5`
Expected: no errors.

- [ ] **Step 6.9: Commit**

```bash
git add src/__tests__/reward-course-completion.test.ts
git commit -m "test(W04): end-to-end and dedup/retry integration scenarios"
```

---

## Task 7: Independent security review + final verification

- [ ] **Step 7.1: Dispatch independent Opus review**

Review targets:
1. `isCourseCompleteForReward` — can it be bypassed? (empty sections, malformed JSON, null course_id in quiz, cross-course submission)
2. `evaluateEligibility` course binding — does the resolution correctly refuse absent binding?
3. `produceOutboxEvent` dedup reset — can this cause double payment?
4. Activation gate — can an already-active reward bypass it? (idempotency path)
5. Staff-mark route — authorization sufficient?

- [ ] **Step 7.2: Address valid findings, re-review if MEDIUM+**

- [ ] **Step 7.3: Final full test run**

Run: `npx vitest run --reporter=verbose 2>&1 | grep -E "PASS|FAIL|skip" | tail -40`

- [ ] **Step 7.4: Final TSC**

Run: `npx tsc --noEmit`

- [ ] **Step 7.5: Push branch, open PR**

```bash
git push -u origin codex/w04-course-completion-gating
gh pr create --title "fix(rewards): W04 — genuine course completion gating and course-bound eligibility" \
  --body "..."
```
