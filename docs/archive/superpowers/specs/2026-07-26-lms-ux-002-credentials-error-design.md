# LMS-UX-002 Dev Spec: Credentials Fetch Error Banner

**Date:** 2026-07-26
**File:** `LMS-Frontend/src/pages/StudentDashboard.tsx`
**Effort:** S (3 edits, no new files)
**Diagram:** `docs/diagrams/lms-nft-credentials-error-flow.mmd`

---

## Current Behaviour (broken)

```tsx
// Fetch
.catch(() => { if (!cancelled) setLmsCredentials([]); });   // ← silent

// Render
{lmsCredentials !== null && lmsCredentials.length > 0 && (
  <section>...</section>
)}
```

A network error sets `lmsCredentials = []`. The render condition evaluates `false`.
The LMS Certificates section disappears entirely — identical to a student with
zero credentials. Students who have earned NFT certificates see nothing and may
believe they have no credentials.

---

## Desired Behaviour

| State | `lmsCredentials` | `lmsCredentialsError` | UI |
|-------|------------------|-----------------------|----|
| Still loading | `null` | `false` | Section hidden |
| Success, has creds | `[…]` (non-empty) | `false` | Section with violet credential cards |
| Success, no creds | `[]` | `false` | Section hidden |
| **Fetch error** | `null` | **`true`** | **Section with amber error banner** |

---

## Error Message Copy

> "We could not load your certificates right now. Please refresh the page to try again."

Displayed inline within the LMS Certificates `<section>`, with an `AlertCircle` amber icon.
No retry button — students are directed to refresh the page.

---

## Constraints

- **Frontend only.** No backend changes.
- **No new npm dependencies.** `AlertCircle` already imported from `lucide-react` at line 31.
- **No new automated tests.** Pure UI state change; existing 293 vitest tests cover the backend.
- **lmsCredentials is `null` on error (not `[]`).** `[]` is reserved for a successful empty response.

---

## Implementation (applied 2026-07-26)

### T-1 — State declaration (line 99)
```tsx
const [lmsCredentials, setLmsCredentials] = useState<MyCredential[] | null>(null);
const [lmsCredentialsError, setLmsCredentialsError] = useState(false);   // ← added
```

### T-2 — Fetch effect (lines 156–169)
```tsx
courseCompletionService
  .getMyCredentials()
  .then((list) => {
    if (!cancelled) {
      setLmsCredentials(list);
      setLmsCredentialsError(false);    // ← clear flag on success
    }
  })
  .catch(() => {
    if (!cancelled) {
      setLmsCredentials(null);          // ← leave as null (not [])
      setLmsCredentialsError(true);     // ← set flag
    }
  });
```

### T-3 — JSX render (line 530)
```tsx
{(lmsCredentialsError || (lmsCredentials !== null && lmsCredentials.length > 0)) && (
  <section>
    <h2 className="text-lg font-bold text-neutral-900 mb-4">LMS Certificates</h2>
    {lmsCredentialsError ? (
      <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" aria-hidden />
        <span>
          We could not load your certificates right now. Please refresh the page to try again.
        </span>
      </div>
    ) : (
      <div className="space-y-3">
        {lmsCredentials!.map((cred) => (/* credential cards — unchanged */))}
      </div>
    )}
  </section>
)}
```

---

## Manual Test Matrix

| ID | Trigger | Expected result |
|----|---------|----------------|
| M-1 | Student with minted NFT cred, endpoint healthy | "LMS Certificates" heading + violet cards; no banner |
| M-2 | Student with no credentials, endpoint healthy | "LMS Certificates" section absent entirely |
| M-3 | Simulate error: DevTools → Network → block `/api/v1/credentials/mine` | "LMS Certificates" heading + amber banner with exact copy above |
| M-4 | After M-3, unblock and refresh | Section shows correctly (success path) |

---

## Review Note

**Risk:** Low. Card JSX is unchanged — just moved into the non-error branch.
`lmsCredentials!` non-null assertion in the else-branch is safe: the branch
only executes when `lmsCredentialsError` is `false` AND `lmsCredentials !== null && length > 0`.

**Rollback:** Revert T-1/T-2/T-3 in `StudentDashboard.tsx`; rebuild `lms-web`.
