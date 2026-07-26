# LMS-UX-002 Credentials Error Banner — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When `getMyCredentials()` fails, show an amber inline error banner in the LMS Certificates section instead of silently hiding the section.

**Architecture:** Add one boolean state (`lmsCredentialsError`) to `StudentDashboard`. Update the fetch effect's `.catch()` to set the flag and leave `lmsCredentials` as `null`. Replace the single-condition JSX render with a two-branch render: error banner or credential cards. No backend changes.

**Tech Stack:** React + Tailwind CSS, `AlertCircle` icon (already imported from lucide-react at line 31).

## Global Constraints

- Frontend-only — `StudentDashboard.tsx` is the only file changed.
- No new npm dependencies — `AlertCircle` already imported.
- Deploy ONLY via `docker compose build web && docker compose up -d --no-deps web` from `/home/webadmin/web-stack/html/LMS-AmmaWallet` — never copy a local `dist/` manually.
- Test baseline: **293/293** vitest tests must still pass (no new backend tests needed — pure UI state change).
- Run vitest from: `/home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server`

---

## Files Modified / Created

| File | Action | Purpose |
|------|--------|---------|
| `LMS-Frontend/src/pages/StudentDashboard.tsx` | Modify | Add error state, update fetch catch, replace JSX render |
| `docs/diagrams/lms-nft-credentials-error-flow.mmd` | Create | Sequence diagram of three credential-load states |
| `docs/superpowers/specs/2026-07-26-lms-ux-002-credentials-error-design.md` | Create | Dev spec |
| `docs/superpowers/plans/2026-07-25-ux-findings.md` | Modify | Move LMS-UX-002 to Fixed |

---

### Task 1: Add error state + update fetch logic

**Files:**
- Modify: `LMS-Frontend/src/pages/StudentDashboard.tsx:98` (state) and `:155–158` (fetch)

**Interfaces:**
- Produces: `lmsCredentialsError: boolean` state + setter available to JSX in Task 2

---

- [ ] **Step 1: Add `lmsCredentialsError` state at line 98**

  Existing line 98:
  ```tsx
  const [lmsCredentials, setLmsCredentials] = useState<MyCredential[] | null>(null);
  ```

  Replace with:
  ```tsx
  const [lmsCredentials, setLmsCredentials] = useState<MyCredential[] | null>(null);
  const [lmsCredentialsError, setLmsCredentialsError] = useState(false);
  ```

- [ ] **Step 2: Update the `getMyCredentials()` fetch effect at lines 155–158**

  Existing block:
  ```tsx
  courseCompletionService
    .getMyCredentials()
    .then((list) => { if (!cancelled) setLmsCredentials(list); })
    .catch(() => { if (!cancelled) setLmsCredentials([]); });
  ```

  Replace with:
  ```tsx
  courseCompletionService
    .getMyCredentials()
    .then((list) => {
      if (!cancelled) {
        setLmsCredentials(list);
        setLmsCredentialsError(false);
      }
    })
    .catch(() => {
      if (!cancelled) {
        setLmsCredentials(null);
        setLmsCredentialsError(true);
      }
    });
  ```

- [ ] **Step 3: Verify the edit is correct**

  Re-read lines 96–162 and confirm:
  - `lmsCredentialsError` state declared after `lmsCredentials` on line 99.
  - `.then()` calls both `setLmsCredentials(list)` and `setLmsCredentialsError(false)`.
  - `.catch()` calls `setLmsCredentials(null)` and `setLmsCredentialsError(true)`.
  - No `setLmsCredentials([])` anywhere in this effect.

---

### Task 2: Replace JSX render with error-aware branch

**Files:**
- Modify: `LMS-Frontend/src/pages/StudentDashboard.tsx:518–569`

**Interfaces:**
- Consumes: `lmsCredentialsError: boolean` (Task 1), `lmsCredentials: MyCredential[] | null` (existing)
- Produces: updated JSX block that renders error banner OR cards OR nothing

---

- [ ] **Step 1: Replace the LMS Certificates section (lines 518–569)**

  Existing block (lines 518–569):
  ```tsx
        {/* LMS Certificates — sourced from /credentials/mine */}
        {lmsCredentials !== null && lmsCredentials.length > 0 && (
          <section>
            <h2 className="text-lg font-bold text-neutral-900 mb-4">LMS Certificates</h2>
            <div className="space-y-3">
              {lmsCredentials.map((cred) => (
                <div
                  key={cred.credentialId}
                  className="rounded-xl border border-violet-200/80 bg-gradient-to-br from-violet-50/60 via-white to-indigo-50/40 px-4 py-4 shadow-card ring-1 ring-neutral-900/[0.02]"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-neutral-900 truncate">
                          {cred.courseTitle ?? cred.quizTitle ?? 'Certificate'}
                        </p>
                        {cred.courseCode && (
                          <span className="text-xs text-neutral-500 font-mono">{cred.courseCode}</span>
                        )}
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-100 text-violet-900 text-xs font-medium">
                          <Award className="h-3 w-3" aria-hidden />
                          NFT Issued
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-neutral-500">
                        {cred.issuedAt && (
                          <span>Issued {new Date(cred.issuedAt).toLocaleDateString()}</span>
                        )}
                        {cred.walletAddress && (
                          <span className="font-mono">
                            {cred.walletAddress.slice(0, 4)}…{cred.walletAddress.slice(-4)}
                          </span>
                        )}
                      </div>
                    </div>
                    {cred.txHash && (
                      <a
                        href={`https://stellar.expert/explorer/public/tx/${cred.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 inline-flex items-center gap-1.5 text-xs font-medium text-violet-600 hover:text-violet-800 hover:underline transition-colors"
                      >
                        View on Stellar
                        <ExternalLink className="h-3 w-3" aria-hidden />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
  ```

  Replace with:
  ```tsx
        {/* LMS Certificates — sourced from /credentials/mine */}
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
                {lmsCredentials!.map((cred) => (
                  <div
                    key={cred.credentialId}
                    className="rounded-xl border border-violet-200/80 bg-gradient-to-br from-violet-50/60 via-white to-indigo-50/40 px-4 py-4 shadow-card ring-1 ring-neutral-900/[0.02]"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-neutral-900 truncate">
                            {cred.courseTitle ?? cred.quizTitle ?? 'Certificate'}
                          </p>
                          {cred.courseCode && (
                            <span className="text-xs text-neutral-500 font-mono">{cred.courseCode}</span>
                          )}
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-100 text-violet-900 text-xs font-medium">
                            <Award className="h-3 w-3" aria-hidden />
                            NFT Issued
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-neutral-500">
                          {cred.issuedAt && (
                            <span>Issued {new Date(cred.issuedAt).toLocaleDateString()}</span>
                          )}
                          {cred.walletAddress && (
                            <span className="font-mono">
                              {cred.walletAddress.slice(0, 4)}…{cred.walletAddress.slice(-4)}
                            </span>
                          )}
                        </div>
                      </div>
                      {cred.txHash && (
                        <a
                          href={`https://stellar.expert/explorer/public/tx/${cred.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 inline-flex items-center gap-1.5 text-xs font-medium text-violet-600 hover:text-violet-800 hover:underline transition-colors"
                        >
                          View on Stellar
                          <ExternalLink className="h-3 w-3" aria-hidden />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
  ```

- [ ] **Step 2: Verify edit is correct**

  Re-read lines 518 onwards. Confirm:
  - Outer condition is `(lmsCredentialsError || (lmsCredentials !== null && lmsCredentials.length > 0))`.
  - Error branch renders the amber banner with `AlertCircle` + message text.
  - Success branch renders credential cards with `lmsCredentials!.map(...)`.
  - Closing `)}` at end of section block.

---

### Task 3: Write Mermaid diagram

**Files:**
- Create: `docs/diagrams/lms-nft-credentials-error-flow.mmd`

---

- [ ] **Step 1: Write diagram file**

  Content:
  ```
  %% LMS-UX-002: getMyCredentials() — three UI states
  %% File: LMS-Frontend/src/pages/StudentDashboard.tsx

  sequenceDiagram
      participant S as Student Browser
      participant D as StudentDashboard
      participant API as LMS API /credentials/mine

      S->>D: Navigate to /dashboard
      D->>API: getMyCredentials()

      alt Success — credentials exist
          API-->>D: 200 [{credentialId, courseTitle, txHash, …}]
          D->>S: Render "LMS Certificates" section with violet credential cards
      else Success — no credentials yet
          API-->>D: 200 []
          D->>S: Section hidden (lmsCredentials=[], lmsCredentialsError=false)
      else Network / server error
          API-->>D: 5xx / network failure
          D->>S: Render "LMS Certificates" section with amber error banner
          Note over S: "We could not load your certificates right now.<br/>Please refresh the page to try again."
      end
  ```

- [ ] **Step 2: Confirm file exists**

  ```bash
  ls /home/webadmin/web-stack/html/LMS-AmmaWallet/docs/diagrams/lms-nft-credentials-error-flow.mmd
  ```

  Expected: file path printed (no "No such file" error).

---

### Task 4: Write dev spec

**Files:**
- Create: `docs/superpowers/specs/2026-07-26-lms-ux-002-credentials-error-design.md`

---

- [ ] **Step 1: Write spec file** (see content in plan below)

  The spec must include:
  - Current vs desired behavior.
  - Error message copy (exact string).
  - Constraints.
  - Manual test matrix (three states × expected output).

- [ ] **Step 2: Confirm file exists**

  ```bash
  ls /home/webadmin/web-stack/html/LMS-AmmaWallet/docs/superpowers/specs/2026-07-26-lms-ux-002-credentials-error-design.md
  ```

---

### Task 5: Run vitest regression check

**Files:**
- No changes — verification only.

---

- [ ] **Step 1: Run full suite**

  ```bash
  cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server
  npx vitest run
  ```

  Expected output (last 4 lines):
  ```
  Test Files  22 passed (22)
       Tests  293 passed (293)
  ```

  If any test fails: **stop, do not proceed to Task 6. Use systematic-debugging.**

---

### Task 6: Docker build + deploy

**Files:**
- No source changes — build and deploy only.

---

- [ ] **Step 1: Build and restart lms-web**

  ```bash
  cd /home/webadmin/web-stack/html/LMS-AmmaWallet
  docker compose build web && docker compose up -d --no-deps web
  ```

  Expected: build completes, no TypeScript errors, container starts.

- [ ] **Step 2: Confirm container is up**

  ```bash
  docker ps --format "table {{.Names}}\t{{.Status}}" | grep lms-web
  ```

  Expected: `lms-web   Up N seconds`

- [ ] **Step 3: HTTP smoke test**

  ```bash
  curl -s -o /dev/null -w "%{http_code}" https://lms.smwebsystems.com/
  ```

  Expected: `200`

---

### Task 7: Update UX findings doc

**Files:**
- Modify: `docs/superpowers/plans/2026-07-25-ux-findings.md`

---

- [ ] **Step 1: Add LMS-UX-002 to the "Fixed" table at the top**

  In the table under `## Fixed in this session`, add row:
  ```markdown
  | LMS-UX-002: `getMyCredentials()` error silently hid certificates section | `StudentDashboard.tsx:98,155–158,518–569` | Added `lmsCredentialsError` state; catch sets `true`; render shows amber banner instead of hiding section |
  ```

- [ ] **Step 2: Strike through / annotate LMS-UX-002 in "Open issues"**

  Find `### LMS-UX-002:` heading and replace with:
  ```markdown
  ### ~~LMS-UX-002: LMS Certificates section shows nothing on fetch error~~ — FIXED 2026-07-26
  - `lmsCredentialsError` state added; fetch catch sets flag; amber banner renders in section on error.
  - See spec: `docs/superpowers/specs/2026-07-26-lms-ux-002-credentials-error-design.md`
  ```

---

## Manual Verification Matrix (post-deploy)

| State | How to trigger | Expected UI |
|-------|---------------|-------------|
| Success (credentials exist) | Log in as student with minted NFT cred | "LMS Certificates" heading + violet credential cards; no banner |
| True empty | Log in as student with no credentials | "LMS Certificates" section absent entirely |
| Network error | Temporarily return 500 from `/api/v1/credentials/mine` (or use browser DevTools → Network → block URL) | "LMS Certificates" heading + amber banner: "We could not load your certificates right now. Please refresh the page to try again." |

---

## Code Review Note

**Summary of change:** `StudentDashboard.tsx` — 3 surgical edits.
1. New `lmsCredentialsError: boolean` state (1 line).
2. Fetch effect `.catch()` now sets `lmsCredentialsError(true)` + `lmsCredentials(null)` instead of silently setting `[]` (3 lines changed).
3. JSX render condition widened from `lmsCredentials !== null && length > 0` to also fire when `lmsCredentialsError` is true; inner content branches on flag (banner vs cards).

**Risk:** Low. The credential cards JSX is unchanged; it's just moved into the `: (...)` branch. The `lmsCredentials!` non-null assertion is safe because the else-branch only executes when `lmsCredentialsError` is false AND `lmsCredentials !== null && length > 0`.

**Rollback:** Revert the 3 edits in `StudentDashboard.tsx`; rebuild `lms-web`.
