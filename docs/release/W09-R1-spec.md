# W09-R1 — Parent dashboard request ownership and truthful metric display

Date: 2026-11-01
Branch: codex/w09-r1-request-ownership
Base: 2c6883ce9b8b5a2255f728ef89b839aa4e0a7827 (W09, PR #136)
Scope: ParentDashboard request ownership, false-zero metric, RewardDashboard allocation expand errors

---

## Independently reproduced regressions at 2c6883c

### Regression R1 — False-zero children count metric

**File**: `LMS-Frontend/src/pages/ParentDashboard.tsx`, line 102

```tsx
<p className="text-2xl font-bold text-neutral-900">{dashboard?.childrenCount ?? 0}</p>
```

When `getDashboard()` fails, `dashboard` remains `null`. `null?.childrenCount` is
`undefined`; `undefined ?? 0` renders `0`. The metric card shows "Linked Children: 0"
even though the count is unknown — a failed fetch masquerades as confirmed zero.

This violates the W09 truthfulness requirement: "a failed section must not masquerade
as empty" and the W09-R1 handover requirement: "failed dashboard data never appears as
a successful zero or empty children list."

**Fix**: Do not render the metric card when `dashboard === null` (i.e., when
`getDashboard` has failed or has not yet returned data). The top-level error alert
already informs the user of the failure; the metric card silently contradicting it is
the defect.

---

### Regression R2 — No request ownership guard in `load()`

**File**: `LMS-Frontend/src/pages/ParentDashboard.tsx`, `load` callback

```ts
const load = useCallback(async () => {
  setLoading(true);
  setError(null);
  setGroupsError(null);
  const [dashboardResult, groupsResult] = await Promise.allSettled([...]);
  // ← no guard: any concurrent load can commit here
  if (dashboardResult.status === 'rejected') { setError(...); } else { setDashboard(...); }
  ...
  setLoading(false);
}, []);
```

If `load()` is called while another `load()` is already awaiting (e.g., user clicks
Refresh during initial load), both continuations run after their respective promises
settle. The older one, settling last, overwrites the newer one's committed state.

**Scenario**: initial load awaits (req 1); Refresh clicked (req 2); req 2 settles
count=9 and renders; req 1 settles count=2 later and overwrites → user sees stale 2.
Same applies to error/loading/groups state from a superseded request.

**Fix**: `reqIdRef` monotonic counter, pattern from `RewardDashboard`:

```ts
const reqIdRef = useRef(0);

const load = useCallback(async () => {
  const myReqId = ++reqIdRef.current;
  setLoading(true);
  setError(null);
  setGroupsError(null);
  const [dashboardResult, groupsResult] = await Promise.allSettled([
    parentService.getDashboard(),
    parentService.getGroups(),
  ]);
  if (reqIdRef.current !== myReqId) return; // superseded — discard entire batch
  // ... commit state normally
  setLoading(false);
}, []);
```

Also add cleanup to the `useEffect` to invalidate any in-flight request on unmount:

```ts
useEffect(() => {
  load();
  return () => { ++reqIdRef.current; };
}, [load]);
```

**Concurrent-request policy**:
- Newer request owns all state slots (dashboard, groups, error, groupsError, loading).
- Older in-flight request is entirely discarded on settlement if its reqId is stale.
- Both success and failure results from stale requests are discarded.
- On unmount, in-flight requests are invalidated before any state commits.

---

## RewardDashboard allocation expand error (W09 deferred, now addressed)

**File**: `LMS-Frontend/src/components/RewardDashboard.tsx`, `toggleAllocations` catch

```ts
catch {
  if (targetEpochRef.current === myEpoch) {
    setExpanded((prev) => { const next = { ...prev }; delete next[rewardId]; return next; });
  }
}
```

When `getAllocations` fails, the expansion row silently collapses. The user receives no
indication that the data load failed and cannot retry without re-clicking the chevron
(which will try again — but the user does not know it failed).

The W09 spec noted this as "acceptable for secondary action". W09-R1 handover re-opens
for assessment: "Fix demonstrated in-scope shared reward allocation error handling if it
can be done safely within this unit."

**Fix**: Extend the `expanded` map value type to include `{ error: string }`:

```ts
type ExpandedValue = RewardAllocation[] | 'loading' | { error: string };
const [expanded, setExpanded] = useState<Record<string, ExpandedValue>>({});
```

In the catch block (epoch-guarded, already present):
```ts
if (targetEpochRef.current === myEpoch) {
  setExpanded((prev) => ({ ...prev, [rewardId]: { error: getErrorMessage(err, 'Could not load allocations.') } }));
}
```

In the render, detect the error state and show message + "Try again":
```tsx
const allocError = !Array.isArray(exp) && exp !== 'loading' && exp != null ? (exp as { error: string }).error : null;
```

Render path:
```tsx
{isExpanded && !isAllocLoading && (
  <tr>
    <td colSpan={6} ...>
      {allocError ? (
        <div role="alert" ...>
          <p>{allocError}</p>
          <Button onClick={() => { setExpanded(prev => { const n = {...prev}; delete n[r.id]; return n; }); toggleAllocations(r.id); }}>
            Try again
          </Button>
        </div>
      ) : allocs.length === 0 ? (
        <p>No allocations yet</p>
      ) : (
        <table>...</table>
      )}
    </td>
  </tr>
)}
```

**W06 stale-target protection**: The epoch guard in the catch block is already present
(W06-R2 fix). The "Try again" button only fires when the component is still mounted and
displaying that reward row. No new stale-target exposure is introduced.

---

## StudentDashboard assessment — DEFERRED (qualified W09/S3 closure)

**File**: `LMS-Frontend/src/pages/StudentDashboard.tsx`

Identified silent suppressions:
- Line 54: `quizService.getCompletionsForUser(uid).catch(() => { setQuizCompletions([]); })` — quiz failure silently becomes empty quiz list; affects stats/checklist
- Line 91: `courseService.fetchCourses({access: 'enrolled'}).catch(() => {})` — course load failure silently shows no courses; affects cert eligibility, checklist, progress
- Lines 74–76: `getCourseProgress(c.id).catch(() => null)` and `getCourseApplications(c.id, 'own').catch(() => [])` — per-course failures silently omit data

**User-facing consequence**: If these fetch calls fail, the student's engagement stats,
course checklist, cert eligibility, and onboarding checklist show incorrect zero/empty
data without any error indication or retry path.

**Assessment**: These failures affect secondary dashboard enrichment data, not a primary
blocking gate like the parent groups defect. The component uses a different architecture
(DataContext for submissions, multiple independent useEffects for enrichment) that would
require significant restructuring to add per-section error states and retry UIs. No
behavioral evidence of fix is available in this unit.

**Decision**: DEFER as `FOLLOW-UP(student-dashboard-error-states)`.

**Qualified W09/S3 closure**: W09 is closed for the documented scope:
- ParentDashboard getGroups suppression (W09): FIXED
- ParentDashboard false-zero metric (W09-R1): FIXED
- ParentDashboard request ownership (W09-R1): FIXED
- RewardDashboard allocation expand error display (W09-R1): FIXED
- StudentDashboard quiz/course suppression: DEFERRED (FOLLOW-UP(student-dashboard-error-states))
- RewardDashboard allocations-expand error (W09 spec §deferred): now FIXED in W09-R1
- Teacher/Employer/Sponsor dashboards: CORRECT (no changes needed, confirmed in W09 spec)

---

## Test matrix (loading-states-w09r1.test.tsx)

| ID | Scenario | Expected |
|----|----------|---------|
| W9R1-PARENT-1 | getDashboard fails → metric card | "Linked Children" NOT in DOM |
| W9R1-PARENT-2 | Refresh during initial; newer (count=9) completes first; older (count=2) settles late | Older discarded; 9 shown |
| W9R1-PARENT-3 | Refresh during initial; newer succeeds (count=5); older fails late | Old error not shown; 5 shown |
| W9R1-PARENT-4 | Initial load; both settle; loading disappears (baseline ownership confirmed) | Loading gone; data shown |
| W9R1-ALLOC-1 | getAllocations rejects → error message shown in expanded row | Error alert in row |
| W9R1-ALLOC-2 | getAllocations rejects → "Try again" button present | Button in DOM |
| W9R1-ALLOC-3 | getAllocations rejects → "Try again" → getAllocations succeeds → allocations shown | Alloc table shown; no error |
| W9R1-ALLOC-EPOCH | getAllocations in flight → target switch → old error does not populate new target | Epoch guard rejects stale error |

---

## Acceptance criteria

- [ ] getDashboard failure → metric card hidden (not zero)
- [ ] Two concurrent loads → older settlement discarded entirely
- [ ] Unmount during load → no state commits after unmount
- [ ] getAllocations failure → error alert + "Try again" in allocation row
- [ ] "Try again" retry → success → allocation table shown, error gone
- [ ] W06-R2 epoch guard preserved on allocation expand error
- [ ] All existing W09/W08/W06 reward and parent tests pass unmodified
- [ ] TSC clean, Vite build clean
