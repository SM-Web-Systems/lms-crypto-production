# Phase 21 C2: Quiz UX Improvements — Design Spec

**Date:** 2026-08-06
**Status:** Draft
**Scope:** Frontend-only quiz UX enhancements (no backend changes)

## 1. Current State

### InlineQuizTaker (student-facing)
- Sequential question navigation (Previous/Next)
- Answer tracking via `answers: Record<string, string>`
- Submission via `quizService.submitQuiz()` → `POST /quizzes/:id/submit`
- Pass/fail result display with score percentage
- Retake button
- 8 tests (IQ-1 through IQ-8)

### What's Missing
1. **No confirmation modal** — quiz submits immediately on "Submit Quiz"
2. **No progress indicator** — no "Question X of Y" display
3. **No feedback after submission** — no per-question correct/incorrect highlighting
4. **No review mode** — can't see which answers were right/wrong after submission
5. **No keyboard navigation** — no arrow key or Enter support

### AdminQuizPreview (existing pattern)
Already shows per-question correctness in result view — correct answers in green, wrong in red. We adapt this pattern for student review mode.

## 2. Design

All changes are **frontend-only** — no backend modifications needed. The backend already returns `answers` (submitted values) and `score/total/passed` in the `QuizCompletion` response. For review mode, the backend already sends `correctIndex`/`correctAnswer` to admin/lecturer roles. For students, we use the score and passed status (not correct answers — students should NOT see answer keys).

### 2.1 Progress Indicator

Add a progress bar and "Question X of Y" text to the quiz-taking view.

**Location:** Inside InlineQuizTaker, visible during `taking` step.

```tsx
{/* Progress indicator */}
<div style={{ marginBottom: '1rem' }}>
  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
    <span>Question {qi + 1} of {quiz.questions.length}</span>
    <span>{answeredCount} answered</span>
  </div>
  <div style={{ background: '#e5e7eb', borderRadius: '4px', height: '6px' }}>
    <div style={{ width: `${((qi + 1) / quiz.questions.length) * 100}%`, background: '#2563eb', borderRadius: '4px', height: '6px', transition: 'width 0.3s' }} />
  </div>
</div>
```

### 2.2 Submission Confirmation Modal

Add a confirmation dialog before quiz submission.

**Trigger:** When user clicks "Submit Quiz" button.
**Content:** "Are you sure you want to submit? You answered X of Y questions."
**Actions:** "Cancel" (return to quiz) | "Submit" (proceed with submission)

**Implementation:** Use the existing `Modal` component from `components/Modal.tsx` if it exists. Otherwise, use a simple inline dialog.

### 2.3 Immediate Feedback After Submission

After submission, show a summary with:
- Overall score and pass/fail status (already exists)
- Per-question summary: question text, your answer, correct/incorrect indicator
- For passed quizzes: green banner
- For failed quizzes: red banner with retake option

**Security constraint:** Students must NOT see correct answers for questions they got wrong. Only show:
- "Correct" (green check) or "Incorrect" (red X) per question
- The student's submitted answer
- This prevents answer harvesting via retakes

### 2.4 Review Mode

After submission, add a "Review Answers" button that shows each question with:
- Question text
- Student's answer
- Correct/Incorrect indicator (no correct answer shown)

**Data source:** `result.answers` (from QuizCompletion) already contains the student's submitted answers. The `score` and `total` tell us overall performance. For per-question correctness, we compare `result.score * result.total / 100` to determine how many were correct, but we can't determine WHICH ones without the answer key.

**Revised approach:** Since the backend strips answer keys from student responses, and we don't want to expose correct answers, the review mode will show:
- Question text
- Student's submitted answer
- Overall score (not per-question correctness)

This keeps the quiz secure while still allowing review.

### 2.5 Keyboard Navigation

Add keyboard support during quiz taking:
- **Left Arrow / Up Arrow:** Previous question
- **Right Arrow / Down Arrow:** Next question
- **Enter:** Submit (only on last question when all answered)
- **1-4 number keys:** Select option for multiple choice

**Implementation:** `useEffect` with `keydown` event listener on the quiz container, active only during `taking` step.

## 3. File Inventory

### Modified Files (1)
| File | Change |
|------|--------|
| `LMS-Frontend/src/components/InlineQuizTaker.tsx` | Add all 5 features inline |

### New Test Files (1)
| File | Tests |
|------|-------|
| `LMS-Frontend/src/__tests__/components/InlineQuizTaker.test.tsx` | +4 tests (confirmation modal, progress indicator, keyboard nav, review mode) |

### No Backend Changes
The backend already provides everything needed:
- `POST /quizzes/:id/submit` returns `QuizCompletion` with `score`, `total`, `passed`, `answers`
- No new endpoints, no schema changes

## 4. Detailed Changes to InlineQuizTaker.tsx

### New State Variables
```typescript
const [showConfirm, setShowConfirm] = useState(false);  // Confirmation modal
const [showReview, setShowReview] = useState(false);     // Review mode
```

### Progress Indicator
- Added between question header and question content
- Shows "Question X of Y" + progress bar + answered count

### Confirmation Modal
- `showConfirm` state toggled by Submit button
- Dialog shows answer count, asks confirmation
- On confirm: calls existing submit logic

### Review Mode
- `showReview` state toggled by "Review Answers" button in result view
- Maps over questions showing question text + student's answer
- No correct answers shown (security)

### Keyboard Navigation
- `useEffect` with `keydown` listener during `taking` step
- Arrow keys for navigation, Enter for submit (last question), number keys for MC

## 5. Test Plan

### Frontend Tests (+4)
| ID | Test | Description |
|----|------|-------------|
| IQ-9 | Confirmation modal | Submit button shows confirmation, Cancel returns to quiz |
| IQ-10 | Progress indicator | Shows "Question X of Y" during quiz taking |
| IQ-11 | Keyboard navigation | Arrow keys navigate between questions |
| IQ-12 | Review mode | Review button shows submitted answers after completion |

### Backend Tests (+4)
Since there are no backend changes, the 4 BE tests will be additional quiz behavior tests:
| ID | Test | Description |
|----|------|-------------|
| QZ-1 | Submit returns answers | QuizCompletion response includes submitted answers |
| QZ-2 | Submit returns score breakdown | Response includes score, total, passed |
| QZ-3 | Re-submit overwrites | Second submission replaces first |
| QZ-4 | Stripped response | Student quiz response has no correctIndex/correctAnswer |

**Expected totals:** 583 + 4 = 587 BE, 109 + 4 = 113 FE → **700 total**

## 6. Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Answer key exposure in review mode | Never show correct answers to students — only show "correct/incorrect" indicator based on score |
| Keyboard nav conflicts with text inputs | Disable arrow key nav when focus is on short_answer input |
| Modal z-index conflicts | Use same pattern as existing modals in codebase |

## 7. Out of Scope

- Timer/countdown (no quiz time limit feature in backend)
- Flashcard type support in InlineQuizTaker (admin-only preview feature)
- Per-question correct answer display for students
- New backend endpoints
