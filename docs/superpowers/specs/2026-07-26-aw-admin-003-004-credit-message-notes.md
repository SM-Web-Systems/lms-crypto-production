# AW-ADMIN-003+004 Dev Spec: Credit Auto-Clear + Billing Event Notes

**Date:** 2026-07-26
**File:** `packages/web-app/src/pages/AdminTenantDetail.tsx` (frontend)
**Files (backend):** `packages/backend/src/services/billing.service.ts`, `packages/backend/src/routes/admin.ts`
**Effort:** AW-ADMIN-003 XS | AW-ADMIN-004 S

---

## AW-ADMIN-003 — Credit Success Auto-Clear

### Current Behaviour
After posting a credit, `creditResult` is set to `"+X.XXXX XLM posted. New balance: Y.YYYY XLM"`.
It persists on screen until the next credit submit (which calls `setCreditResult(null)` on line 125).
A stale success message can mislead an admin into thinking the most recent action just occurred.

### Desired Behaviour
The success message auto-disappears after **8 seconds**.
If a second credit is submitted before 8s, the old timer is cancelled (via `clearTimeout` in the effect cleanup), and a fresh 8s timer starts when the new message is set.

### Implementation (applied 2026-07-26)
```tsx
// lines 117–126 of AdminTenantDetail.tsx
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

### Constraints
- Frontend only — no backend change.
- No new dependencies.
- `clearTimeout` in cleanup prevents memory leaks on unmount.

### Test Strategy
| ID | Steps | Pass criterion |
|----|-------|----------------|
| M-1 | Post credit | Success banner appears |
| M-2 | Wait 8 s | Banner auto-disappears |
| M-3 | Post two credits quickly | Second message replaces first; 8s timer resets |
| M-4 | Navigate away before 8s | No memory leak / console error |

---

## AW-ADMIN-004 — Billing Event Notes

### Current Behaviour
`billing_events.notes` column exists in PostgreSQL and is populated for `manual_topup` and
`bundle_purchase` events (via `writeBillingCredit`). However:
- `getTenantBalanceSummary()` SELECT did not include `notes`.
- Fastify response schema did not declare `notes` → it was stripped from the JSON response.
- `BillingEvent` interface had no `notes` field.
- No UI element rendered notes.

The admin had no way to see the reason/reference for a credit from the UI.

### Desired Behaviour
Notes flow fully: DB → service SELECT → Fastify schema → `BillingEvent` interface → muted subtitle.
Only rendered when `event.notes` is truthy; long values truncated with `title` tooltip.

### Implementation (applied 2026-07-26)

**billing.service.ts:656** — added to SELECT:
```ts
notes: schema.billingEvents.notes,
```

**admin.ts:273** — added to Fastify recentEvents schema:
```ts
notes: { type: ["string", "null"] },
```

**AdminTenantDetail.tsx:22** — interface field:
```ts
notes?: string | null;
```

**AdminTenantDetail.tsx:379–385** — JSX subtitle:
```tsx
{event.notes && (
  <p
    className="text-xs text-neutral-500 mt-0.5 truncate"
    title={event.notes}
  >
    {event.notes}
  </p>
)}
```

### Constraints
- Requires `amma-api` container rebuild (backend source change).
- No DB schema change — column already exists.
- `notes` is `text("notes")` in schema → can be null; frontend handles with `event.notes && ...`.

### Test Strategy
| ID | Steps | Pass criterion |
|----|-------|----------------|
| M-5 | View events for tenant with notes-bearing credits | Muted subtitle text visible under event type label |
| M-6 | View events for tenant with null notes | No subtitle; row layout unchanged |
| M-7 | Long notes string | Text truncated; full text on `title` hover |
| M-8 | API response inspection | `curl GET /api/v1/internal/tenants/:id/billing` → `recentEvents[n].notes` present |

---

## Rollback

```bash
# Revert AdminTenantDetail.tsx (remove useEffect lines 117–126, remove notes JSX lines 379–385, remove notes from interface line 22)
# Revert billing.service.ts:656 (remove notes line)
# Revert admin.ts:273 (remove notes line)
# cd /home/webadmin/amma-wallet-docker && docker compose build amma-api && docker compose up -d --no-deps amma-api
# cd /home/webadmin/web-stack/html/amma-wallet/packages/web-app && npm run build
# rsync -a --delete dist/ /home/webadmin/web-stack/html/amma-wallet/dist/
```
