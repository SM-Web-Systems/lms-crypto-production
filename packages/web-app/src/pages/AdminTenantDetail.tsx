/**
 * AW-007/AW-009 — Admin tenant detail page (/admin/tenants/:id)
 *
 * Shows billing summary + recent billing events for a single tenant.
 * Uses admin JWT from sessionStorage['aw_admin_token'].
 */
import { useEffect, useState, useCallback } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import {
  ShieldCheck, LogOut, ArrowLeft, RefreshCw, AlertCircle,
  CheckCircle, XCircle, X, Loader2, TrendingUp, TrendingDown, Wallet,
  PlusCircle, Ban, RotateCcw,
} from "lucide-react";

interface BillingEvent {
  id: number;
  eventType: string;
  amountXlm: string;
  billingPeriod: string | null;
  userId: number | null;
  createdAt: string;
  notes?: string | null;
}

interface TenantBilling {
  tenantId: number;
  tenantName: string | null;
  tenantSlug: string;
  balance: string;
  isActive: boolean;
  suspendedAt: string | null;
  suspensionReason: string | null;
  debtLimit: string | null;
  acquisitionModeEnabled: boolean | null;
  gracePeriodDays: number | null;
  recentEvents: BillingEvent[];
  eventsHasMore: boolean;
  eventsNextCursor: number | null;
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

function eventTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    new_wallet_activation:    "Wallet activation",
    monthly_maintenance:      "Monthly maintenance",
    manual_topup:             "Manual top-up",
    bundle_purchase:          "Bundle purchase",
    wallet_funding:           "Wallet funding",
    refund:                   "Refund",
  };
  return labels[type] ?? type.replace(/_/g, " ");
}

function amountColor(amount: string): string {
  const n = parseFloat(amount);
  if (n > 0) return "text-emerald-600";
  if (n < 0) return "text-red-600";
  return "text-neutral-500";
}

export default function AdminTenantDetail() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<TenantBilling | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  // NM-D1: Post Credit form state
  const [creditType, setCreditType] = useState<"manual_topup" | "bundle_purchase">("manual_topup");
  const [creditAmount, setCreditAmount] = useState("");
  const [creditNotes, setCreditNotes] = useState("");
  const [creditSubmitting, setCreditSubmitting] = useState(false);
  const [creditResult, setCreditResult] = useState<string | null>(null);
  const [creditError, setCreditError] = useState<string | null>(null);

  // NM-D2: Suspend/Unsuspend state
  const [suspendBusy, setSuspendBusy] = useState(false);
  const [suspendError, setSuspendError] = useState<string | null>(null);

  // AW-ADMIN-005: Pagination state for billing events
  const [allEvents, setAllEvents] = useState<BillingEvent[]>([]);
  const [eventsHasMore, setEventsHasMore] = useState(false);
  const [eventsNextCursor, setEventsNextCursor] = useState<number | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [olderError, setOlderError] = useState<string | null>(null);
  type SuspendIntent =
    | { action: 'suspend'; suspendType: 'hard' | 'soft' }
    | { action: 'unsuspend' };
  const [statusModal, setStatusModal] = useState<SuspendIntent | null>(null);

  const logout = () => {
    sessionStorage.removeItem("aw_admin_token");
    sessionStorage.removeItem("aw_admin_info");
    navigate("/admin/login");
  };

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await adminFetch(`/api/v1/internal/tenants/${id}/billing`);
      if (res.status === 401) { logout(); return; }
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? `Server error ${res.status}`);
        return;
      }
      const json = await res.json();
      setData(json);
      // AW-ADMIN-005: reset pagination state on every full reload
      setAllEvents(json.recentEvents ?? []);
      setEventsHasMore(json.eventsHasMore ?? false);
      setEventsNextCursor(json.eventsNextCursor ?? null);
      setOlderError(null);
    } catch {
      setError("Network error — could not load billing data.");
    } finally {
      setLoading(false);
    }
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!sessionStorage.getItem("aw_admin_token")) { navigate("/admin/login"); return; }
    load();
  }, [load, navigate]);

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

  // NM-D1: Submit credit
  const handlePostCredit = async () => {
    const amount = parseFloat(creditAmount);
    if (!creditAmount || isNaN(amount) || amount <= 0) {
      setCreditError("Amount must be a positive number.");
      return;
    }
    setCreditSubmitting(true);
    setCreditResult(null);
    setCreditError(null);
    try {
      const res = await adminFetch(`/api/v1/internal/tenants/${id}/credit`, {
        method: "POST",
        body: JSON.stringify({ type: creditType, amount_xlm: amount, notes: creditNotes || undefined }),
      });
      if (res.status === 401) { logout(); return; }
      const d = await res.json();
      if (!res.ok) { setCreditError(d.error ?? `Error ${res.status}`); return; }
      setCreditResult(`+${parseFloat(d.amountCredited).toFixed(4)} XLM posted. New balance: ${parseFloat(d.newBalance).toFixed(4)} XLM`);
      setCreditAmount("");
      setCreditNotes("");
      load();
    } catch {
      setCreditError("Network error — could not post credit.");
    } finally {
      setCreditSubmitting(false);
    }
  };

  // AW-ADMIN-005: Cursor-paginated "Load older" events
  const loadOlderEvents = async () => {
    if (!eventsNextCursor || loadingOlder) return;
    setLoadingOlder(true);
    setOlderError(null);
    try {
      const res = await adminFetch(`/api/v1/internal/tenants/${id}/events?beforeId=${eventsNextCursor}`);
      if (res.status === 401) { logout(); return; }
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setOlderError(d.error ?? `Error ${res.status}`);
        return;
      }
      const page = await res.json();
      setAllEvents(prev => [...prev, ...page.events]);
      setEventsHasMore(page.hasMore);
      setEventsNextCursor(page.nextCursor);
    } catch {
      setOlderError("Network error — could not load older events.");
    } finally {
      setLoadingOlder(false);
    }
  };

  // NM-D2 / AW-ADMIN-007: Suspend / Unsuspend — open modal only
  const handleSuspend = () => setStatusModal({ action: 'suspend', suspendType: 'hard' });
  const handleUnsuspend = () => setStatusModal({ action: 'unsuspend' });
  const setSuspendType = (t: 'hard' | 'soft') =>
    setStatusModal(prev => prev?.action === 'suspend' ? { ...prev, suspendType: t } : prev);

  const submitStatusAction = async (action: 'suspend' | 'unsuspend') => {
    // AW-ADMIN-007: capture suspendType before clearing modal state
    const suspendType = statusModal?.action === 'suspend' ? statusModal.suspendType : 'hard';
    setStatusModal(null);
    setSuspendBusy(true);
    setSuspendError(null);
    try {
      const res = await adminFetch(
        `/api/v1/internal/tenants/${id}/${action}`,
        action === 'suspend'
          ? { method: "PATCH", body: JSON.stringify({ type: suspendType }) }
          : { method: "PATCH" }
      );
      if (res.status === 401) { logout(); return; }
      const d = await res.json();
      if (!res.ok) { setSuspendError(d.error ?? `Error ${res.status}`); return; }
      load();
    } catch {
      setSuspendError(`Network error — could not ${action} tenant.`);
    } finally {
      setSuspendBusy(false);
    }
  };

  const balance = data ? parseFloat(data.balance) : 0;

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* AW-ADMIN-001/007: Suspend/Unsuspend confirmation modal */}
      {statusModal !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="status-modal-title"
          onKeyDown={(e) => e.key === 'Escape' && setStatusModal(null)}
        >
          <div
            className="absolute inset-0 bg-neutral-900/50 backdrop-blur-sm"
            aria-hidden
            onClick={() => setStatusModal(null)}
          />
          <div className="relative w-full max-w-sm bg-white rounded-2xl border border-neutral-200 shadow-xl flex flex-col">
            <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-neutral-100">
              <h2 id="status-modal-title" className="text-base font-bold text-neutral-900">
                {statusModal.action === 'suspend'
                  ? statusModal.suspendType === 'hard' ? 'Hard suspend tenant?' : 'Soft suspend tenant?'
                  : 'Unsuspend tenant?'}
              </h2>
              <button
                type="button"
                onClick={() => setStatusModal(null)}
                className="shrink-0 p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {/* AW-ADMIN-007: suspend type radio group */}
            {statusModal.action === 'suspend' && (
              <div className="px-5 pt-4 pb-1 flex flex-col gap-2" role="radiogroup" aria-label="Suspend type">
                <label className={`flex items-start gap-3 cursor-pointer p-3 rounded-xl border transition-colors ${
                  statusModal.suspendType === 'hard'
                    ? 'border-red-300 bg-red-50'
                    : 'border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50'
                }`}>
                  <input
                    type="radio"
                    name="suspendType"
                    value="hard"
                    checked={statusModal.suspendType === 'hard'}
                    onChange={() => setSuspendType('hard')}
                    className="mt-0.5 accent-red-600"
                  />
                  <div>
                    <span className="text-sm font-semibold text-neutral-900">Hard suspend</span>
                    <p className="text-xs text-neutral-500 mt-0.5">Deactivates the account. Blocks wallets, transfers, and API access immediately.</p>
                  </div>
                </label>
                <label className={`flex items-start gap-3 cursor-pointer p-3 rounded-xl border transition-colors ${
                  statusModal.suspendType === 'soft'
                    ? 'border-amber-300 bg-amber-50'
                    : 'border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50'
                }`}>
                  <input
                    type="radio"
                    name="suspendType"
                    value="soft"
                    checked={statusModal.suspendType === 'soft'}
                    onChange={() => setSuspendType('soft')}
                    className="mt-0.5 accent-amber-600"
                  />
                  <div>
                    <span className="text-sm font-semibold text-neutral-900">Soft suspend</span>
                    <p className="text-xs text-neutral-500 mt-0.5">Blocks new activations and onboardings only. Existing wallets and SSO reads stay live.</p>
                  </div>
                </label>
              </div>
            )}
            <p className="px-5 py-4 text-sm text-neutral-600 leading-relaxed">
              {statusModal.action === 'suspend'
                ? statusModal.suspendType === 'hard'
                  ? 'All wallet operations will be blocked and the tenant account will be deactivated (isActive = false). New wallets, XLM transfers, and API access are blocked. SSO reads remain. Reversible.'
                  : 'New activations and onboardings will be blocked, but existing wallets and SSO reads remain live (isActive stays true). Reversible.'
                : 'Full wallet and API access will be restored immediately.'}
            </p>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-neutral-100">
              <button
                type="button"
                onClick={() => setStatusModal(null)}
                className="text-sm font-medium text-neutral-600 border border-neutral-200 hover:bg-neutral-50 rounded-lg px-4 py-2 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => submitStatusAction(statusModal.action)}
                className={`text-sm font-medium text-white rounded-lg px-4 py-2 transition ${
                  statusModal.action === 'suspend'
                    ? statusModal.suspendType === 'hard'
                      ? 'bg-red-600 hover:bg-red-700'
                      : 'bg-amber-600 hover:bg-amber-700'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                {statusModal.action === 'suspend'
                  ? statusModal.suspendType === 'hard' ? 'Hard suspend tenant' : 'Soft suspend tenant'
                  : 'Unsuspend tenant'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top nav */}
      <header className="bg-white border-b border-neutral-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-violet-600" aria-hidden />
            <span className="font-semibold text-neutral-900 text-sm">AmmaWallet Admin</span>
          </div>
          <button
            type="button"
            onClick={logout}
            className="flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-800 transition"
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden />
            Sign out
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2">
          <Link
            to="/admin"
            className="flex items-center gap-1.5 text-sm text-violet-600 hover:text-violet-800 font-medium transition"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            All tenants
          </Link>
          {data && (
            <>
              <span className="text-neutral-300">/</span>
              <span className="text-sm text-neutral-600">
                {data.tenantName ?? data.tenantSlug ?? `Tenant #${data.tenantId}`}
              </span>
            </>
          )}
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
            <span className="text-sm">Loading billing data…</span>
          </div>
        ) : data ? (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Balance */}
              <div className="bg-white rounded-2xl border border-neutral-200 p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-1">
                  <Wallet className="h-4 w-4 text-neutral-400" aria-hidden />
                  <p className="text-xs text-neutral-500 font-medium uppercase tracking-wide">Prepaid balance</p>
                </div>
                <p className={`text-3xl font-bold tabular-nums mt-1 ${
                  balance < 0 ? "text-red-600" : balance < 5 ? "text-amber-600" : "text-violet-700"
                }`}>
                  {balance.toFixed(4)}
                </p>
                <p className="text-xs text-neutral-400 mt-0.5">XLM</p>
              </div>

              {/* Status — NM-D2: suspend/unsuspend */}
              <div className="bg-white rounded-2xl border border-neutral-200 p-4 shadow-sm">
                <p className="text-xs text-neutral-500 font-medium uppercase tracking-wide mb-2">Status</p>
                <div className="flex items-center gap-2">
                  {data.isActive && !data.suspendedAt
                    ? <CheckCircle className="h-5 w-5 text-emerald-500" aria-hidden />
                    : <XCircle className="h-5 w-5 text-red-400" aria-hidden />}
                  <span className={`text-sm font-semibold ${data.isActive && !data.suspendedAt ? "text-emerald-700" : "text-red-600"}`}>
                    {data.isActive && !data.suspendedAt ? "Active" : data.isActive ? "Soft-suspended" : "Suspended"}
                  </span>
                </div>
                {data.suspensionReason && (
                  <p className="text-xs text-red-500 mt-1 truncate" title={data.suspensionReason}>
                    {data.suspensionReason}
                  </p>
                )}
                {suspendError && (
                  <p className="text-xs text-red-600 mt-1">{suspendError}</p>
                )}
                <div className="mt-3 flex gap-2">
                  {(!data.suspendedAt) ? (
                    <button
                      type="button"
                      onClick={handleSuspend}
                      disabled={suspendBusy}
                      className="flex items-center gap-1.5 text-xs font-medium text-red-600 border border-red-200 hover:bg-red-50 rounded-lg px-3 py-1.5 transition disabled:opacity-50"
                    >
                      <Ban className="h-3 w-3" aria-hidden />
                      {suspendBusy ? "Suspending…" : "Suspend"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleUnsuspend}
                      disabled={suspendBusy}
                      className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 border border-emerald-200 hover:bg-emerald-50 rounded-lg px-3 py-1.5 transition disabled:opacity-50"
                    >
                      <RotateCcw className="h-3 w-3" aria-hidden />
                      {suspendBusy ? "Unsuspending…" : "Unsuspend"}
                    </button>
                  )}
                </div>
              </div>

              {/* Policy */}
              <div className="bg-white rounded-2xl border border-neutral-200 p-4 shadow-sm">
                <p className="text-xs text-neutral-500 font-medium uppercase tracking-wide mb-2">Policy</p>
                <div className="space-y-1 text-xs text-neutral-700">
                  <div className="flex justify-between">
                    <span className="text-neutral-400">Debt limit</span>
                    <span className="font-medium">{data.debtLimit ? `${data.debtLimit} XLM` : "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-400">Acquisition mode</span>
                    <span className="font-medium">{data.acquisitionModeEnabled ? "On" : "Off"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-400">Grace period</span>
                    <span className="font-medium">{data.gracePeriodDays != null ? `${data.gracePeriodDays}d` : "—"}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Recent events */}
            <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-neutral-100 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-neutral-900">
                  Recent billing events ({allEvents.length}{eventsHasMore ? "+" : ""})
                </h2>
                <button
                  type="button"
                  onClick={load}
                  disabled={loading}
                  className="flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-800 border border-neutral-200 rounded-lg px-3 py-1.5 transition"
                >
                  <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} aria-hidden />
                  Refresh
                </button>
              </div>

              {allEvents.length === 0 ? (
                <div className="py-12 text-center text-sm text-neutral-400">No billing events yet.</div>
              ) : (
                <div className="divide-y divide-neutral-100">
                  {allEvents.map((event) => {
                    const amount = parseFloat(event.amountXlm);
                    const isCredit = amount > 0;
                    return (
                      <div key={event.id} className="flex items-center gap-4 px-5 py-3">
                        {/* Direction icon */}
                        <div className={`shrink-0 rounded-full p-1.5 ${isCredit ? "bg-emerald-50" : "bg-red-50"}`}>
                          {isCredit
                            ? <TrendingUp className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
                            : <TrendingDown className="h-3.5 w-3.5 text-red-500" aria-hidden />}
                        </div>

                        {/* Event info */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-neutral-800 capitalize">{eventTypeLabel(event.eventType)}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-neutral-400 tabular-nums">
                              {new Date(event.createdAt).toLocaleString()}
                            </span>
                            {event.billingPeriod && (
                              <span className="text-[10px] bg-neutral-100 text-neutral-500 px-1.5 py-0.5 rounded">
                                {event.billingPeriod}
                              </span>
                            )}
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
                        </div>

                        {/* Amount */}
                        <span className={`text-sm font-bold tabular-nums shrink-0 ${amountColor(event.amountXlm)}`}>
                          {amount > 0 ? "+" : ""}{amount.toFixed(4)} XLM
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
              {/* AW-ADMIN-005: Load older button */}
              {(eventsHasMore || olderError) && (
                <div className="px-5 py-4 border-t border-neutral-100 flex flex-col items-center gap-2">
                  {olderError && (
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 w-full text-center">
                      {olderError}
                    </p>
                  )}
                  {eventsHasMore && (
                    <button
                      type="button"
                      onClick={loadOlderEvents}
                      disabled={loadingOlder}
                      className="text-sm font-medium text-violet-700 border border-violet-200 hover:bg-violet-50 rounded-lg px-4 py-2 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {loadingOlder
                        ? <><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />Loading…</>
                        : "Load older"}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* NM-D1: Post Credit form */}
            <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-neutral-100 flex items-center gap-2">
                <PlusCircle className="h-4 w-4 text-violet-600" aria-hidden />
                <h2 className="text-sm font-semibold text-neutral-900">Post Credit</h2>
              </div>
              <div className="px-5 py-4 space-y-3">
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="flex-1 space-y-1">
                    <label className="text-xs font-medium text-neutral-600">Type</label>
                    <select
                      value={creditType}
                      onChange={(e) => setCreditType(e.target.value as "manual_topup" | "bundle_purchase")}
                      className="w-full text-sm border border-neutral-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-violet-400"
                    >
                      <option value="manual_topup">Manual top-up</option>
                      <option value="bundle_purchase">Bundle purchase</option>
                    </select>
                  </div>
                  <div className="flex-1 space-y-1">
                    <label className="text-xs font-medium text-neutral-600">Amount (XLM)</label>
                    <input
                      type="number"
                      min="0.0001"
                      step="0.01"
                      placeholder="e.g. 50"
                      value={creditAmount}
                      onChange={(e) => setCreditAmount(e.target.value)}
                      className="w-full text-sm border border-neutral-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-400"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-neutral-600">Notes (optional)</label>
                  <input
                    type="text"
                    placeholder="Reference or reason"
                    value={creditNotes}
                    onChange={(e) => setCreditNotes(e.target.value)}
                    className="w-full text-sm border border-neutral-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-400"
                  />
                </div>
                {creditError && (
                  <p className="text-xs text-red-600 flex items-center gap-1">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    {creditError}
                  </p>
                )}
                {creditResult && (
                  <p className="text-xs text-emerald-700 flex items-center gap-1">
                    <CheckCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    {creditResult}
                  </p>
                )}
                <button
                  type="button"
                  onClick={handlePostCredit}
                  disabled={creditSubmitting || !creditAmount}
                  className="flex items-center gap-2 text-sm font-medium bg-violet-600 hover:bg-violet-700 text-white rounded-xl px-4 py-2 transition disabled:opacity-50"
                >
                  {creditSubmitting
                    ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden />Posting…</>
                    : <><PlusCircle className="h-4 w-4" aria-hidden />Post credit</>}
                </button>
              </div>
            </div>
          </>
        ) : null}
      </main>
    </div>
  );
}
