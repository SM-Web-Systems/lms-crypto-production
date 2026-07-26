# AmmaWallet Admin Console Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the AmmaWallet admin UI so billing ops can post credits, suspend/unsuspend tenants, and view the admin list — without resorting to curl.

**Architecture:** All backend routes already exist (Phase 4). This plan is frontend-only: (D1) Post Credit form in AdminTenantDetail, (D2) Suspend/Unsuspend toggle in AdminTenantDetail, (D3) new AdminAdmins page at `/admin/admins`. All use `adminFetch()` (already defined in AdminTenantDetail) which adds the admin JWT from sessionStorage.

**Tech Stack:** TypeScript, React, Vite (AmmaWallet frontend). No backend changes.

## Global Constraints

- AW frontend build: `cd packages/web-app && npm run build` — must succeed
- AW frontend deploy: `rsync -a --delete dist/ /var/www/html/amma-wallet/dist/`
- Admin JWT is in `sessionStorage['aw_admin_token']` — 401 response triggers logout redirect
- RBAC: platform_admin can post credits but CANNOT suspend/unsuspend super_admin tenants (enforced by backend)
- All write operations must show a confirmation before firing the API call
- NM-D1 and NM-D2 are NICE-TO-HAVE — implement after Area A/B/C/E are complete

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `packages/web-app/src/pages/AdminTenantDetail.tsx` | Modify | Post Credit form (D1) + Suspend/Unsuspend toggle (D2) |
| `packages/web-app/src/pages/AdminAdmins.tsx` | Create | Admin list page (D3) |
| `packages/web-app/src/App.tsx` | Modify | Add `/admin/admins` route (D3) |
| `packages/web-app/src/pages/AdminConsole.tsx` | Modify | Add "Admins" link in nav (D3) |

---

### Task 1: Post Credit form in AdminTenantDetail (NM-D1)

**Files:**
- Modify: `packages/web-app/src/pages/AdminTenantDetail.tsx`

**API:** `POST /api/v1/internal/tenants/:id/credit`
Body: `{ amountXlm: number, eventType: string, note?: string }`
Response: `{ tenantId, newBalance, event: { id, eventType, amountXlm, ... } }`

- [ ] **Step 1: Add Post Credit state variables**

Near the top of `AdminTenantDetail` component (after existing state), add:

```typescript
const [creditForm, setCreditForm] = useState({ amount: '', type: 'manual_topup', note: '' });
const [creditLoading, setCreditLoading] = useState(false);
const [creditSuccess, setCreditSuccess] = useState<string | null>(null);
const [creditError, setCreditError] = useState<string | null>(null);
const [showCreditForm, setShowCreditForm] = useState(false);
```

- [ ] **Step 2: Add submit handler**

After the `load` callback, add:

```typescript
const handlePostCredit = async (e: React.FormEvent) => {
  e.preventDefault();
  const amount = parseFloat(creditForm.amount);
  if (!id || isNaN(amount) || amount <= 0 || amount > 1000) {
    setCreditError('Amount must be between 0.01 and 1000 XLM.');
    return;
  }
  if (!window.confirm(`Post ${amount.toFixed(4)} XLM (${creditForm.type}) to tenant #${id}?`)) return;
  setCreditLoading(true);
  setCreditError(null);
  setCreditSuccess(null);
  try {
    const res = await adminFetch(`/api/v1/internal/tenants/${id}/credit`, {
      method: 'POST',
      body: JSON.stringify({
        amountXlm: amount,
        eventType: creditForm.type,
        note: creditForm.note || undefined,
      }),
    });
    if (res.status === 401) { logout(); return; }
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setCreditError(d.error?.message ?? `Server error ${res.status}`);
      return;
    }
    const result = await res.json();
    setCreditSuccess(`Credit posted. New balance: ${parseFloat(result.newBalance).toFixed(4)} XLM`);
    setCreditForm({ amount: '', type: 'manual_topup', note: '' });
    setShowCreditForm(false);
    await load(); // refresh billing data
  } catch {
    setCreditError('Network error — could not post credit.');
  } finally {
    setCreditLoading(false);
  }
};
```

- [ ] **Step 3: Add Post Credit form JSX after the summary cards section**

After the `{/* Summary cards */}` section close tag, add:

```tsx
{/* Post Credit — NM-D1 */}
<div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
  <div className="px-5 py-4 border-b border-neutral-100 flex items-center justify-between">
    <h2 className="text-sm font-semibold text-neutral-900">Post Credit</h2>
    <button
      type="button"
      onClick={() => { setShowCreditForm(!showCreditForm); setCreditError(null); setCreditSuccess(null); }}
      className="text-xs text-violet-600 hover:text-violet-800 font-medium transition"
    >
      {showCreditForm ? 'Cancel' : '+ Post credit'}
    </button>
  </div>
  {creditSuccess && (
    <div className="px-5 py-3 bg-emerald-50 text-sm text-emerald-700 border-b border-emerald-100">
      {creditSuccess}
    </div>
  )}
  {showCreditForm && (
    <form onSubmit={handlePostCredit} className="px-5 py-4 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-neutral-600 mb-1">Amount (XLM)</label>
          <input
            type="number"
            min="0.01"
            max="1000"
            step="0.01"
            required
            value={creditForm.amount}
            onChange={(e) => setCreditForm({ ...creditForm, amount: e.target.value })}
            className="w-full text-sm rounded-lg border border-neutral-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-300"
            placeholder="10.00"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-neutral-600 mb-1">Event type</label>
          <select
            value={creditForm.type}
            onChange={(e) => setCreditForm({ ...creditForm, type: e.target.value })}
            className="w-full text-sm rounded-lg border border-neutral-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-300"
          >
            <option value="manual_topup">Manual top-up</option>
            <option value="refund">Refund</option>
            <option value="bundle_purchase">Bundle purchase</option>
          </select>
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-neutral-600 mb-1">Note (optional)</label>
        <input
          type="text"
          maxLength={200}
          value={creditForm.note}
          onChange={(e) => setCreditForm({ ...creditForm, note: e.target.value })}
          className="w-full text-sm rounded-lg border border-neutral-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-300"
          placeholder="Reason or reference"
        />
      </div>
      {creditError && <p className="text-xs text-red-600">{creditError}</p>}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={creditLoading}
          className="px-4 py-2 text-sm font-medium bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50 transition"
        >
          {creditLoading ? 'Posting…' : 'Post credit'}
        </button>
      </div>
    </form>
  )}
</div>
```

- [ ] **Step 4: Build and smoke test**

```bash
cd /home/webadmin/web-stack/html/amma-wallet/packages/web-app
npm run build 2>&1 | tail -5
rsync -a --delete dist/ /var/www/html/amma-wallet/dist/
```

Test: Log into admin console, open a tenant, click "+ Post credit", fill in 10 XLM manual_topup, confirm → verify balance updates.

- [ ] **Step 5: Commit**

```bash
cd /home/webadmin/web-stack/html/amma-wallet
git add packages/web-app/src/pages/AdminTenantDetail.tsx
git commit -m "feat(NM-D1): add Post Credit form to AdminTenantDetail"
```

---

### Task 2: Suspend/Unsuspend toggle (NM-D2)

**Files:**
- Modify: `packages/web-app/src/pages/AdminTenantDetail.tsx`

**APIs:**
- Suspend: `PATCH /api/v1/internal/tenants/:id/suspend` Body: `{ type: "hard", reason: string }`
- Unsuspend: `PATCH /api/v1/internal/tenants/:id/unsuspend` (no body needed)

- [ ] **Step 1: Add suspend state and handler**

Add state:
```typescript
const [suspendLoading, setSuspendLoading] = useState(false);
const [suspendError, setSuspendError] = useState<string | null>(null);
```

Add handler:
```typescript
const handleSuspendToggle = async () => {
  if (!id || !data) return;
  const isSuspended = !data.isActive;

  if (isSuspended) {
    // Unsuspend
    if (!window.confirm(`Unsuspend tenant #${id}? This will restore full access.`)) return;
    setSuspendLoading(true);
    setSuspendError(null);
    try {
      const res = await adminFetch(`/api/v1/internal/tenants/${id}/unsuspend`, { method: 'PATCH' });
      if (res.status === 401) { logout(); return; }
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setSuspendError(d.error?.message ?? `Error ${res.status}`);
        return;
      }
      await load();
    } catch {
      setSuspendError('Network error.');
    } finally {
      setSuspendLoading(false);
    }
  } else {
    // Suspend — prompt for reason
    const reason = window.prompt('Reason for suspension (required):');
    if (!reason?.trim()) return;
    if (!window.confirm(`Hard-suspend tenant #${id}? This blocks all wallet operations.`)) return;
    setSuspendLoading(true);
    setSuspendError(null);
    try {
      const res = await adminFetch(`/api/v1/internal/tenants/${id}/suspend`, {
        method: 'PATCH',
        body: JSON.stringify({ type: 'hard', reason: reason.trim() }),
      });
      if (res.status === 401) { logout(); return; }
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setSuspendError(d.error?.message ?? `Error ${res.status}`);
        return;
      }
      await load();
    } catch {
      setSuspendError('Network error.');
    } finally {
      setSuspendLoading(false);
    }
  }
};
```

- [ ] **Step 2: Add button to the Status summary card**

In the Status card (find `{data.isActive ? "Active" : "Suspended"}` JSX), add a button below the status line:

```tsx
{suspendError && <p className="text-xs text-red-500 mt-1">{suspendError}</p>}
<button
  type="button"
  onClick={handleSuspendToggle}
  disabled={suspendLoading}
  className={`mt-3 w-full text-xs font-medium px-3 py-1.5 rounded-lg border transition ${
    data.isActive
      ? 'border-red-200 text-red-600 hover:bg-red-50'
      : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50'
  } disabled:opacity-50`}
>
  {suspendLoading ? 'Working…' : data.isActive ? 'Suspend tenant' : 'Unsuspend tenant'}
</button>
```

- [ ] **Step 3: Build, deploy, smoke test**

```bash
npm run build 2>&1 | tail -5
rsync -a --delete dist/ /var/www/html/amma-wallet/dist/
```

Test: Suspend a tenant → status changes to "Suspended". Unsuspend → returns to "Active".

- [ ] **Step 4: Commit**

```bash
git add packages/web-app/src/pages/AdminTenantDetail.tsx
git commit -m "feat(NM-D2): add Suspend/Unsuspend toggle to AdminTenantDetail"
```

---

### Task 3: Admin list page at /admin/admins (NM-D3)

**Files:**
- Create: `packages/web-app/src/pages/AdminAdmins.tsx`
- Modify: `packages/web-app/src/App.tsx`
- Modify: `packages/web-app/src/pages/AdminConsole.tsx`

**API:** `GET /api/v1/internal/admins` — returns `{ admins: [{ id, email, role, isActive, lastLoginAt, createdAt }] }`

- [ ] **Step 1: Create AdminAdmins.tsx**

Create `packages/web-app/src/pages/AdminAdmins.tsx`:

```typescript
/**
 * AW Admin — Admin list page (/admin/admins)
 * GET /api/v1/internal/admins
 */
import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ShieldCheck, LogOut, ArrowLeft, Loader2, AlertCircle, Users } from "lucide-react";

interface AdminRecord {
  id: number;
  email: string;
  role: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

function adminFetch(path: string, options: RequestInit = {}) {
  const token = sessionStorage.getItem("aw_admin_token");
  return fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: token ? `Bearer ${token}` : "",
      ...(options.headers ?? {}),
    },
  });
}

export default function AdminAdmins() {
  const [admins, setAdmins] = useState<AdminRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const logout = () => {
    sessionStorage.removeItem("aw_admin_token");
    sessionStorage.removeItem("aw_admin_info");
    navigate("/admin/login");
  };

  useEffect(() => {
    if (!sessionStorage.getItem("aw_admin_token")) { navigate("/admin/login"); return; }
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await adminFetch("/api/v1/internal/admins");
        if (res.status === 401) { logout(); return; }
        if (!res.ok) { setError(`Server error ${res.status}`); return; }
        const d = await res.json();
        setAdmins(d.admins ?? []);
      } catch {
        setError("Network error — could not load admins.");
      } finally {
        setLoading(false);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="bg-white border-b border-neutral-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-violet-600" aria-hidden />
            <span className="font-semibold text-neutral-900 text-sm">AmmaWallet Admin</span>
          </div>
          <button type="button" onClick={logout}
            className="flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-800 transition">
            <LogOut className="h-3.5 w-3.5" aria-hidden />
            Sign out
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center gap-2">
          <Link to="/admin" className="flex items-center gap-1.5 text-sm text-violet-600 hover:text-violet-800 font-medium transition">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            All tenants
          </Link>
          <span className="text-neutral-300">/</span>
          <span className="text-sm text-neutral-600">Admins</span>
        </div>

        <div className="flex items-center gap-3">
          <Users className="h-5 w-5 text-neutral-500" aria-hidden />
          <h1 className="text-lg font-semibold text-neutral-900">Platform admins ({admins.length})</h1>
        </div>

        {error && (
          <div className="flex gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
            {error}
          </div>
        )}

        {loading ? (
          <div className="py-24 flex items-center justify-center text-neutral-400 gap-2">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            <span className="text-sm">Loading admins…</span>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
            {admins.length === 0 ? (
              <div className="py-12 text-center text-sm text-neutral-400">No admins found.</div>
            ) : (
              <div className="divide-y divide-neutral-100">
                {admins.map((admin) => (
                  <div key={admin.id} className="flex items-center gap-4 px-5 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-neutral-800 truncate">{admin.email}</p>
                      <p className="text-xs text-neutral-400 mt-0.5">
                        ID #{admin.id} · Joined {new Date(admin.createdAt).toLocaleDateString()}
                        {admin.lastLoginAt && ` · Last login ${new Date(admin.lastLoginAt).toLocaleDateString()}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-[10px] px-2 py-0.5 rounded font-medium capitalize ${
                        admin.role === 'super_admin' ? 'bg-violet-100 text-violet-700' : 'bg-blue-50 text-blue-600'
                      }`}>
                        {admin.role.replace(/_/g, ' ')}
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${
                        admin.isActive ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'
                      }`}>
                        {admin.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Add route to App.tsx**

In `packages/web-app/src/App.tsx`, find where `/admin` routes are defined (near the `AdminConsole` and `AdminTenantDetail` routes). Add:

```typescript
import AdminAdmins from "./pages/AdminAdmins";
// ...
<Route path="/admin/admins" element={<AdminAdmins />} />
```

- [ ] **Step 3: Add "Admins" link to AdminConsole.tsx nav**

In `AdminConsole.tsx`, find the header nav area. Add a link:

```tsx
<Link to="/admin/admins"
  className="flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-800 transition">
  <Users className="h-3.5 w-3.5" aria-hidden />
  Admins
</Link>
```

Make sure `Users` is imported from `lucide-react`.

- [ ] **Step 4: Build, deploy, smoke test**

```bash
cd /home/webadmin/web-stack/html/amma-wallet/packages/web-app
npm run build 2>&1 | tail -5
rsync -a --delete dist/ /var/www/html/amma-wallet/dist/
```

Test: Log into admin console → click "Admins" link → verify list shows platform admins with role chips.

- [ ] **Step 5: Commit**

```bash
cd /home/webadmin/web-stack/html/amma-wallet
git add packages/web-app/src/pages/AdminAdmins.tsx packages/web-app/src/App.tsx packages/web-app/src/pages/AdminConsole.tsx
git commit -m "feat(NM-D3): add admin list page at /admin/admins"
```

---

## Self-Review Checklist

- [x] **Spec coverage:** NM-D1 (Task 1 Post Credit), NM-D2 (Task 2 Suspend/Unsuspend), NM-D3 (Task 3 Admin list) — all covered
- [x] **No placeholders:** all handlers, JSX, and the full AdminAdmins component are complete
- [x] **adminFetch duplicated in AdminAdmins:** follows the same pattern as existing pages — refactoring is not in scope for this plan
- [x] **RBAC enforced by backend:** frontend only hides/shows buttons; backend returns 403 for unauthorized attempts
- [x] **Confirmation dialogs:** window.confirm for all destructive actions (suspend, credit post)
- [x] **401 handling:** every adminFetch error path checks for 401 and calls logout()
