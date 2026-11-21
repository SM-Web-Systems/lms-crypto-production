# W06 — Parent child/family target discriminator

Date: 2026-10-31
Status: SPEC
Branch: codex/w06-parent-discriminator

---

## Scope

Validate and carry the explicit `targetType` discriminator on parent reward creation and listing routes. The backend already maps `'family'` → `parent_family`; all other values (including `'child'`) silently default to `parent_child`. This spec closes the validation gap (no rejection of invalid supplied values) and the frontend gap (no `targetType` in `CreateRewardParams` or `listRewards`).

Excludes: W07 billing, W08 portal availability, W09 general load states, FOLLOW-UP(course-grade-form-inputs), new reward types, schema migrations, real provider enabling.

---

## Required contract

| Input | POST scope_type | GET scope_type |
| --- | --- | --- |
| `targetType` omitted | `parent_child` (legacy) | `parent_child` (legacy) |
| `targetType: 'child'` | `parent_child` | `parent_child` |
| `targetType: 'family'` | `parent_family` | `parent_family` |
| `targetType: <any other value>` | 400 INVALID_TARGET_TYPE | 400 INVALID_TARGET_TYPE |

"Any other value" includes: `null`, `''`, `'FAMILY'`, `'Child'`, `'unknown'`, `123`, `true`, `[]`, `{}`, padded strings, and for GET: repeated query params (`?targetType=child&targetType=family`).

The error response uses a **constant safe message** — no coercion, serialization, or method invocation on rejected input.

---

## Backend changes

### `LMS-Server/src/services/rewards/rewardErrors.ts`

Add `INVALID_TARGET_TYPE` to `REWARD_ERROR_CODES`.

### `LMS-Server/src/routes/parent.ts`

Replace `resolveParentScopeType(targetType?: string): ScopeType` with:

```typescript
function resolveParentScopeType(rawTargetType: unknown): ScopeType {
  if (rawTargetType === undefined) return 'parent_child';  // legacy omit
  if (rawTargetType === 'child')   return 'parent_child';  // explicit child
  if (rawTargetType === 'family')  return 'parent_family'; // explicit family
  // Any explicitly supplied invalid value — do NOT coerce/serialize/invoke hooks
  throw new RewardError(
    'INVALID_TARGET_TYPE',
    'Invalid target type. Accepted values: child, family',
    400,
  );
}
```

Call sites:
- POST body: `resolveParentScopeType(req.body.targetType)` — unchanged (body is already `unknown`)
- GET query: `resolveParentScopeType(req.query.targetType)` — remove unsafe `as string` cast

`req.query.targetType` is `string | string[] | ParsedQs | ParsedQs[] | undefined`. Passing it as `unknown` means:
- omitted → `undefined` → legacy child
- single `'child'` or `'family'` → resolved
- array (`?targetType=child&targetType=family`) → fails equality checks → 400
- ParsedQs object → fails equality checks → 400

---

## Frontend changes

### `LMS-Frontend/src/services/rewardService.ts`

Add `targetType?: 'child' | 'family'` to `CreateRewardParams`. The existing `createReward` already posts the full params object — adding `targetType` here carries it through automatically.

Update `listRewards` signature:
```typescript
async listRewards(role: string, scopeId: string, targetType?: 'child' | 'family'): Promise<Reward[]>
```
Include `targetType` in query params when provided (omit when undefined for backward compatibility).

### `LMS-Frontend/src/components/RewardDashboard.tsx`

Add `targetType?: 'child' | 'family'` to `RewardDashboardProps`. Pass through to `listRewards` call and into `RewardCreateForm` (so creation also carries the correct scope for parent role).

Add `targetType` to the `useCallback`/`useEffect` dependency arrays where it affects fetch identity (prevents stale family data showing after switching target).

### `LMS-Frontend/src/pages/ParentDashboard.tsx`

Pass `targetType="family"` to `<RewardDashboard>` in the groups section. The rewards section currently only iterates family groups; no child-scope rewards section exists (W08 scope).

---

## Test matrix

### Backend (reward-parent.test.ts additions — W06 describe block)

| ID | Category | Scenario | Expected |
| --- | --- | --- | --- |
| W6-B-1 | Characterize existing | POST child (explicit) | 201, parent_child |
| W6-B-2 | Characterize existing | POST family (explicit) | 201, parent_family |
| W6-B-3 | Characterize existing | POST omitted | 201, parent_child |
| W6-B-4 | Invalid POST | `targetType: 'FAMILY'` | 400, INVALID_TARGET_TYPE |
| W6-B-5 | Invalid POST | `targetType: ''` | 400, INVALID_TARGET_TYPE |
| W6-B-6 | Invalid POST | `targetType: null` | 400, INVALID_TARGET_TYPE |
| W6-B-7 | Invalid POST | `targetType: 123` | 400, INVALID_TARGET_TYPE |
| W6-B-8 | Invalid POST | `targetType: []` | 400, INVALID_TARGET_TYPE |
| W6-B-9 | Invalid POST | `targetType: {}` | 400, INVALID_TARGET_TYPE |
| W6-B-10 | Invalid POST | `targetType: 'child '` (padded) | 400, INVALID_TARGET_TYPE |
| W6-B-11 | Invalid GET | `?targetType=INVALID&scopeId=...` | 400, INVALID_TARGET_TYPE |
| W6-B-12 | Invalid GET | `?targetType=child&targetType=family` (array) | 400, INVALID_TARGET_TYPE |
| W6-B-13 | GET family | family scopeId + targetType=family | 200, parent_family rewards |
| W6-B-14 | Same scopeId ambiguity | same ID as child user + family group → child only via targetType | 201 child, 201 family (different scope_type) |
| W6-B-15 | Replay — different targetType same key | POST child key; POST family same key | 409 IDEMPOTENCY_CONFLICT |
| W6-B-16 | Invalid → no key consumed | invalid targetType does not persist idempotency key | subsequent valid use of same key succeeds |
| W6-B-17 | Foreign family | not-owner family group | 403 SCOPE_DENIED |
| W6-B-18 | Wrong group_type | non-family group with targetType=family | 403 SCOPE_DENIED |
| W6-B-19 | No reg | W05 invalid reward type still rejects | 400 INVALID_REWARD_TYPE |
| W6-B-20 | No reg | W03 cap enforcement still active | 400 AUDIENCE_EXCEEDS_CAP |

### Frontend (RewardComponents.test.tsx additions — W06 describe block)

| ID | Scenario | Expected |
| --- | --- | --- |
| W6-FE-1 | RewardDashboard parent+targetType='family' calls listRewards with targetType | mockListRewards called with ('parent', scopeId, 'family') |
| W6-FE-2 | RewardDashboard without targetType calls listRewards without 3rd arg | mockListRewards called with ('sponsor', scopeId) / no targetType |
| W6-FE-3 | createReward called with targetType in params | mockCreateReward params includes targetType='family' |
| W6-FE-4 | Non-parent role with targetType=undefined → unchanged | no regression in sponsor/employer/teacher flows |

---

## Invariants preserved

- W02: ownership/scope validation, 404 non-disclosure, replay binding — unchanged
- W03: allocation cap enforcement, audience limits — unchanged
- W04: course binding, completion proof, deleted scope fail-closed — unchanged
- W05: INVALID_REWARD_TYPE safe error construction — unchanged
- Legacy omitted-targetType callers continue to work via `undefined` → `parent_child` path
- No schema migration, no new reward type, no provider enabling
