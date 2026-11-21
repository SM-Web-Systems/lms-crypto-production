# AW-ADMIN-003+004 Credit Auto-Clear + Billing Notes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (1) Auto-clear the "credit posted" success message after 8 seconds. (2) Surface the `notes` field from billing events DB → API → frontend subtitle.

**Architecture:**
- AW-ADMIN-003: One `useEffect` in `AdminTenantDetail.tsx` watches `creditResult`; schedules `clearTimeout` cleanup. No backend change needed.
- AW-ADMIN-004: Three-layer addition — `billing.service.ts` SELECT, Fastify JSON schema in `admin.ts`, frontend `BillingEvent` interface, and a 2-line JSX subtitle. Requires `amma-api` container rebuild.

**Tech Stack:** React (web-app), Fastify + Drizzle ORM (backend), Docker Compose, rsync deploy.

## Global Constraints

- Backend source: `/home/webadmin/web-stack/html/amma-wallet/packages/backend/src/`
- Frontend source: `/home/webadmin/web-stack/html/amma-wallet/packages/web-app/src/`
- Backend container rebuild: `cd /home/webadmin/amma-wallet-docker && docker compose build amma-api && docker compose up -d --no-deps amma-api`
- Frontend deploy (NOT local dist copy): `cd /home/webadmin/web-stack/html/amma-wallet/packages/web-app && npm run build && rsync -a --delete dist/ /var/www/html/amma-wallet/dist/`
- AmmaWallet test suite: `cd /home/webadmin/amma-wallet-docker && docker exec amma-api npx vitest run` — baseline **214 tests** (backend tests are inside the container). No new backend tests required for these changes.
- No new npm dependencies.

---

## Files Modified / Created

| File | Action |
|------|--------|
| `packages/web-app/src/pages/AdminTenantDetail.tsx` | Modify: useEffect, BillingEvent interface, notes JSX |
| `packages/backend/src/services/billing.service.ts` | Modify: add `notes` to SELECT |
| `packages/backend/src/routes/admin.ts` | Modify: add `notes` to Fastify response schema |
| `docs/superpowers/specs/2026-07-26-aw-admin-003-004-credit-message-notes.md` | Create: dev spec |
| `docs/superpowers/plans/2026-07-25-admin-console-ux-findings.md` | Modify: mark AW-ADMIN-003+004 fixed |

---

### Task 1: AW-ADMIN-003 — Auto-clear credit success message

**Files:**
- Modify: `packages/web-app/src/pages/AdminTenantDetail.tsx:112–115`

**Interfaces:**
- Consumes: `creditResult: string | null` state (line 79), `setCreditResult` setter
- Produces: nothing new — side-effect only

---

- [ ] **Step 1: Add auto-clear useEffect after the existing load effect**

  Current block at lines 112–115:
  ```tsx
  useEffect(() => {
    if (!sessionStorage.getItem("aw_admin_token")) { navigate("/admin/login"); return; }
    load();
  }, [load, navigate]);
  ```

  Insert immediately after the closing `}, [load, navigate]);` line:
  ```tsx
  // AW-ADMIN-003: auto-clear creditResult success message after 8 seconds
  useEffect(() => {
    if (!creditResult) return;
    const timer = setTimeout(() => {
      setCreditResult(null);
    }, 8000);
    return () => {
      clearTimeout(timer);
    };
  }, [creditResult]);
  ```

- [ ] **Step 2: Verify placement**

  Re-read lines 112–125 and confirm the new effect appears after the load effect and before `handlePostCredit`.

---

### Task 2: AW-ADMIN-004 (backend) — Add notes to billing SELECT

**Files:**
- Modify: `packages/backend/src/services/billing.service.ts:649–656`

**Interfaces:**
- Consumes: `schema.billingEvents.notes` (confirmed at schema/index.ts:968)
- Produces: `recentEvents[n].notes: string | null` in the returned object

---

- [ ] **Step 1: Add `notes` to the SELECT in `getTenantBalanceSummary()`**

  Current block (lines 649–656):
  ```ts
      db
        .select({
          id: schema.billingEvents.id,
          eventType: schema.billingEvents.eventType,
          amountXlm: schema.billingEvents.amountXlm,
          billingPeriod: schema.billingEvents.billingPeriod,
          userId: schema.billingEvents.userId,
          createdAt: schema.billingEvents.createdAt,
        })
  ```

  Replace with:
  ```ts
      db
        .select({
          id: schema.billingEvents.id,
          eventType: schema.billingEvents.eventType,
          amountXlm: schema.billingEvents.amountXlm,
          billingPeriod: schema.billingEvents.billingPeriod,
          userId: schema.billingEvents.userId,
          createdAt: schema.billingEvents.createdAt,
          notes: schema.billingEvents.notes,
        })
  ```

- [ ] **Step 2: Verify**

  Re-read lines 649–658 and confirm `notes: schema.billingEvents.notes,` is present as the last select field before the closing `})`.

---

### Task 3: AW-ADMIN-004 (backend) — Add notes to Fastify response schema

**Files:**
- Modify: `packages/backend/src/routes/admin.ts:262–274`

**Interfaces:**
- Consumes: `notes` field now returned by `getTenantBalanceSummary()` (Task 2)
- Produces: Fastify serialises `notes` into the JSON response body

---

- [ ] **Step 1: Add `notes` property to the Fastify recentEvents schema**

  Current `recentEvents.items.properties` block (lines 266–273):
  ```ts
                  properties: {
                    id:            { type: "number" },
                    eventType:     { type: "string" },
                    amountXlm:     { type: "string" },
                    billingPeriod: { type: ["string", "null"] },
                    userId:        { type: ["number", "null"] },
                    createdAt:     { type: "string", format: "date-time" },
                  },
  ```

  Replace with:
  ```ts
                  properties: {
                    id:            { type: "number" },
                    eventType:     { type: "string" },
                    amountXlm:     { type: "string" },
                    billingPeriod: { type: ["string", "null"] },
                    userId:        { type: ["number", "null"] },
                    createdAt:     { type: "string", format: "date-time" },
                    notes:         { type: ["string", "null"] },
                  },
  ```

- [ ] **Step 2: Verify**

  Re-read lines 262–276 and confirm `notes: { type: ["string", "null"] },` appears after `createdAt`.

---

### Task 4: AW-ADMIN-004 (frontend) — Extend BillingEvent interface + render notes

**Files:**
- Modify: `packages/web-app/src/pages/AdminTenantDetail.tsx:15–22` (interface) and `:352–367` (JSX)

**Interfaces:**
- Consumes: `notes: string | null` now in API response (Tasks 2+3)
- Produces: `BillingEvent.notes?: string | null` available to JSX

---

- [ ] **Step 1: Add `notes` to BillingEvent interface (lines 15–22)**

  Current interface:
  ```ts
  interface BillingEvent {
    id: number;
    eventType: string;
    amountXlm: string;
    billingPeriod: string | null;
    userId: number | null;
    createdAt: string;
  }
  ```

  Replace with:
  ```ts
  interface BillingEvent {
    id: number;
    eventType: string;
    amountXlm: string;
    billingPeriod: string | null;
    userId: number | null;
    createdAt: string;
    notes?: string | null;
  }
  ```

- [ ] **Step 2: Render notes subtitle in the event row (after line 366)**

  Current block ending at line 366:
  ```tsx
                          {event.userId && (
                            <span className="text-[10px] text-neutral-400">user #{event.userId}</span>
                          )}
                        </div>
  ```

  Replace with:
  ```tsx
                          {event.userId && (
                            <span className="text-[10px] text-neutral-400">user #{event.userId}</span>
                          )}
                        </div>
                        {event.notes && (
                          <p
                            className="text-xs text-neutral-500 mt-0.5 truncate"
                            title={event.notes}
                          >
                            {event.notes}
                          </p>
                        )}
  ```

- [ ] **Step 3: Verify both edits**

  Re-read lines 15–23 (interface has `notes?: string | null`) and lines 362–375 (notes subtitle renders after userId span, inside the `flex-1 min-w-0` div).

---

### Task 5: Rebuild amma-api container

**Files:**
- No source changes — container rebuild only.

---

- [ ] **Step 1: Rebuild and restart amma-api**

  ```bash
  cd /home/webadmin/amma-wallet-docker
  docker compose build amma-api && docker compose up -d --no-deps amma-api
  ```

  Expected: build completes; container restarts.

- [ ] **Step 2: Confirm container is healthy**

  ```bash
  docker ps --format "table {{.Names}}\t{{.Status}}" | grep amma-api
  ```

  Expected: `amma-api   Up N seconds (healthy)` or `Up N seconds`.

- [ ] **Step 3: Spot-check API returns notes**

  Get the admin JWT first (from sessionStorage in browser, or from `.env.secrets` `AMMA_ADMIN_PASSWORD` to re-login), then:

  ```bash
  TOKEN=$(curl -s -X POST https://ammawallet.com/api/v1/internal/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"<admin_email>","password":"<admin_password>"}' \
    | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

  curl -s -H "Authorization: Bearer $TOKEN" \
    https://ammawallet.com/api/v1/internal/tenants/2/billing \
    | python3 -c "import sys,json; d=json.load(sys.stdin); [print(e.get('notes')) for e in d['recentEvents'][:3]]"
  ```

  Expected: prints `None` or a note string per event (not a KeyError).

---

### Task 6: Build and deploy AmmaWallet frontend

**Files:**
- No source changes — build and deploy only.

---

- [ ] **Step 1: Build**

  ```bash
  cd /home/webadmin/web-stack/html/amma-wallet/packages/web-app
  npm run build
  ```

  Expected: Vite build succeeds, no TypeScript errors.

- [ ] **Step 2: Deploy**

  ```bash
  rsync -a --delete dist/ /var/www/html/amma-wallet/dist/
  ```

  Expected: rsync exits 0.

- [ ] **Step 3: HTTP smoke test**

  ```bash
  curl -s -o /dev/null -w "%{http_code}" https://ammawallet.com/
  ```

  Expected: `200`.

---

### Task 7: Write dev spec

**Files:**
- Create: `docs/superpowers/specs/2026-07-26-aw-admin-003-004-credit-message-notes.md`

---

- [ ] **Step 1: Write spec** (see spec content below in plan)

- [ ] **Step 2: Confirm file exists**

  ```bash
  ls /home/webadmin/web-stack/html/amma-wallet/docs/superpowers/specs/2026-07-26-aw-admin-003-004-credit-message-notes.md
  ```

---

### Task 8: Update AW UX findings doc

**Files:**
- Modify: `docs/superpowers/plans/2026-07-25-admin-console-ux-findings.md`

---

- [ ] **Step 1: Add Fixed rows to the findings table**

  In the "Open issues" section, add a `## Fixed` heading (or amend an existing fixed table) with entries for AW-ADMIN-003 and AW-ADMIN-004.

---

## Manual Verification Checklist (post-deploy)

| ID | Trigger | Expected |
|----|---------|----------|
| M-1 | Post a credit → observe success banner | Banner appears with "+X XLM posted…" |
| M-2 | Wait 8 seconds without touching page | Banner auto-disappears |
| M-3 | Post another credit immediately | New banner appears; 8s timer restarts |
| M-4 | View billing events for tenant with notes | Muted subtitle text visible under event type |
| M-5 | View billing events for tenant without notes | No subtitle; layout unchanged |
| M-6 | Long notes value (> row width) | Text truncated with `…`; full text on hover (`title`) |

---

## Review Note

**Changes summary:**
1. `AdminTenantDetail.tsx` — new `useEffect` (6 lines): watches `creditResult`, sets 8s timer, cleans up with `clearTimeout`.
2. `billing.service.ts` — 1 line added to SELECT: `notes: schema.billingEvents.notes`.
3. `admin.ts` — 1 line added to Fastify schema: `notes: { type: ["string", "null"] }`.
4. `AdminTenantDetail.tsx` — `BillingEvent` interface: 1 field added (`notes?: string | null`). JSX: 6 lines added (conditional `<p>` subtitle).

**Risks:** Low.
- The `useEffect` cleanup prevents memory leaks; existing `setCreditResult(null)` on new submit fires before the timer anyway (timer reschedules on the null→string transition).
- Fastify serialisation strips unknown fields; adding `notes` to the schema ensures it is included, not stripped.
- `notes` is nullable in the DB; `{event.notes && ...}` safely hides the subtitle when null/undefined.
