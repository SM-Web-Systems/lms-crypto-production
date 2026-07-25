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
  CheckCircle, XCircle, Loader2, TrendingUp, TrendingDown, Wallet,
  PlusCircle, Ban, RotateCcw,
} from "lucide-react";

interface BillingEvent {
  id: number;
  eventType: string;
  amountXlm: string;
  billingPeriod: string | null;
  userId: number | null;
  createdAt: string;
}

interface TenantBilling {
  tenantId: number;
  balance: string;
  isActive: boolean;
  suspendedAt: string | null;
  suspensionReason: string | null;
  debtLimit: string | null;
  acquisitionModeEnabled: boolean | null;
  gracePeriodDays: number | null;
  recentEvents: BillingEvent[];
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
      setData(await res.json());
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

  // NM-D2: Suspend / Unsuspend
  const handleSuspend = async () => {
    if (!window.confirm("Hard-suspend this tenant? All operations except SSO reads will be blocked.")) return;
    setSuspendBusy(true);
    setSuspendError(null);
    try {
      const res = await adminFetch(`/api/v1/internal/tenants/${id}/suspend`, {
        method: "PATCH",
        body: JSON.stringify({ type: "hard" }),
      });
      if (res.status === 401) { logout(); return; }
      const d = await res.json();
      if (!res.ok) { setSuspendError(d.error ?? `Error ${res.status}`); return; }
      load();
    } catch {
      setSuspendError("Network error — could not suspend tenant.");
    } finally {
      setSuspendBusy(false);
    }
  };

  const handleUnsuspend = async () => {
    if (!window.confirm("Unsuspend this tenant? This restores full access.")) return;
    setSuspendBusy(true);
    setSuspendError(null);
    try {
      const res = await adminFetch(`/api/v1/internal/tenants/${id}/unsuspend`, { method: "PATCH" });
      if (res.status === 401) { logout(); return; }
      const d = await res.json();
      if (!res.ok) { setSuspendError(d.error ?? `Error ${res.status}`); return; }
      load();
    } catch {
      setSuspendError("Network error — could not unsuspend tenant.");
    } finally {
      setSuspendBusy(false);
    }
  };

  const balance = data ? parseFloat(data.balance) : 0;

  return (
    <div className="min-h-screen bg-neutral-50">
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
              <span className="text-sm text-neutral-600">Tenant #{data.tenantId}</span>
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
                  Recent billing events ({data.recentEvents.length})
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

              {data.recentEvents.length === 0 ? (
                <div className="py-12 text-center text-sm text-neutral-400">No billing events yet.</div>
              ) : (
                <div className="divide-y divide-neutral-100">
                  {data.recentEvents.map((event) => {
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
