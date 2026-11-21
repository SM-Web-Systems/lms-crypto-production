# W05-R1 — Safe invalid-type errors and accurate follow-up tracking

Date: 2026-10-31
Branch: codex/w05-r1-error-safety
Base commit: 13c6b20 (W05 merge)
Scope: W05 validation-error safety only; W06–W09 excluded

---

## Defect

`createReward()` in `rewardService.ts` (line 65) uses `String(params.rewardType)` in the RewardError message when the type check fails:

```typescript
throw new RewardError('INVALID_REWARD_TYPE', `Invalid reward type: ${String(params.rewardType)}`, 400);
```

`String(val)` calls `val.toString()`. When the JSON body contains `{"rewardType": {"toString": null}}` or `{"rewardType": {"toString": "custom"}}`, the object's `toString` property is not callable. `String(obj)` throws `TypeError: Cannot convert object to primitive value` before the `RewardError` is constructed.

Result: the route's `catch` block receives a plain `TypeError`, not a `RewardError`. `handleRewardError` only catches `RewardError` — the TypeError falls through to the Express global error handler → 500 `INTERNAL_ERROR` instead of 400 `INVALID_REWARD_TYPE`.

This is a malformed-input error-contract defect, not a financial mutation risk: the type guard `typeof params.rewardType !== 'string'` correctly identifies the input as invalid before any DB operation. The TypeError fires only during error message construction, not during data access.

---

## Fix

Replace `String(params.rewardType)` with a stable constant message that lists accepted values without touching the input:

```typescript
throw new RewardError(
  'INVALID_REWARD_TYPE',
  `Invalid reward type. Accepted values: ${REWARD_TYPES.join(', ')}`,
  400,
);
```

This message is safe for any input including objects with non-callable or throwing conversion hooks.

---

## Follow-up tracking correction

`RewardDashboard.tsx` and `frontend/rewardService.ts` currently carry comments that reference "W06" as the follow-up for missing `course_completion`/`grade` form inputs. This is inaccurate: W06 is the parent child/family targeting discriminator fix. The missing course/grade config is a separate untracked item.

Fix: remove the W06 reference from both comments; replace with a reference to a dedicated follow-up item (e.g., `FOLLOW-UP: course-grade-form-inputs`).

---

## Test matrix

| ID | Input | Route | Expected |
|---|---|---|---|
| W5R1-T1 | `{"rewardType": {"toString": null}}` | POST /sponsor/rewards | 400 INVALID_REWARD_TYPE (no TypeError, no 500) |
| W5R1-T2 | `{"rewardType": {"toString": "custom"}}` | POST /sponsor/rewards | 400 INVALID_REWARD_TYPE |
| W5R1-T3 | Object with non-callable toString | direct `createReward()` | RewardError INVALID_REWARD_TYPE (no TypeError) |
| W5R1-T4 | Null-prototype object `Object.create(null)` | direct `createReward()` | RewardError INVALID_REWARD_TYPE |
| W5R1-T5 | Object with throwing `Symbol.toPrimitive` | direct `createReward()` | RewardError INVALID_REWARD_TYPE |
| W5R1-T6 | `{"rewardType": {"toString": null}}` | POST /employer/rewards | 400 INVALID_REWARD_TYPE |
| W5R1-T7 | `{"rewardType": {"toString": null}}` | POST /teacher/rewards | 400 INVALID_REWARD_TYPE |
| W5R1-T8 | `{"rewardType": {"toString": null}}` | POST /parent/rewards | 400 INVALID_REWARD_TYPE |
| W5R1-R1 | Regressions: null/missing/blank/padded/cased/unknown | sponsor route | 400 INVALID_REWARD_TYPE (unchanged) |
| W5R1-R2 | All 5 canonical types | sponsor route | 201 draft (unchanged) |
| W5R1-R3 | Unauthenticated canonical request | sponsor route | 401 (unchanged) |
| W5R1-R4 | Authenticated, no permission | sponsor route | 403 (unchanged) |
| W5R1-R5 | Valid same-key replay | direct service | same reward ID (unchanged) |
| W5R1-R6 | Different valid type same key | direct service | IDEMPOTENCY_CONFLICT (unchanged) |
| W5R1-FE1 | Create form select: old invalid options absent | React render | completion/achievement not in DOM |
| W5R1-FE2 | Create form submits canonical value unchanged | React interaction | submitted payload has exact string |

---

## Acceptance criteria

- [ ] `createReward()` returns 400 `INVALID_REWARD_TYPE` for JSON objects with non-callable/throwing toString
- [ ] No `String()` or `.toString()` called on rejected input in the validation path
- [ ] All 4 creation routes tested with `{"toString": null}` input
- [ ] W06 comment removed from `RewardDashboard.tsx` and `frontend/rewardService.ts`; replaced with dedicated follow-up reference
- [ ] Frontend interaction test: form submit sends exact canonical string, old options absent
- [ ] Existing W05 valid/invalid/replay/auth tests unchanged
- [ ] TypeScript builds clean (backend + frontend)
