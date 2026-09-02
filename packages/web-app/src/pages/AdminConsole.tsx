/**
 * AW-007/AW-008 — Internal admin console (/admin)
 *
 * Lists all tenants with balance and active status.
 * Uses admin JWT from sessionStorage['aw_admin_token'].
 * Links to /admin/tenants/:id for per-tenant billing detail.
 */
import { useEffect, useState, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  ShieldCheck, LogOut, RefreshCw, AlertCircle, Building2,
  CheckCircle, XCircle, ChevronRight, Loader2, Users,
} from "lucide-react";

interface Tenant {
  id: number;
  slug: string;
  name: string;
  contactEmail: string | null;
  prepaidXlmBalance: string;
  isActive: boolean;
  suspendedAt: string | null;
  suspensionReason: string | null;
}

interface AdminInfo {
  id: number;
  email: string;
  name: string;
  role: string;
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

export default function AdminConsole() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const adminInfo: AdminInfo | null = (() => {
    try { return JSON.parse(sessionStorage.getItem("aw_admin_info") ?? "null"); }
    catch { return null; }
  })();

  const logout = () => {
    sessionStorage.removeItem("aw_admin_token");
    sessionStorage.removeItem("aw_admin_info");
    navigate("/admin/login");
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminFetch("/api/v1/internal/tenants");
      if (res.status === 401) { logout(); return; }
      if (!res.ok) { setError(`Server error ${res.status}`); return; }
      const data = await res.json();
      setTenants(data.tenants ?? []);
    } catch {
      setError("Network error — could not load tenants.");
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!sessionStorage.getItem("aw_admin_token")) { navigate("/admin/login"); return; }
    load();
  }, [load, navigate]);

  const totalBalance = tenants.reduce((sum, t) => sum + parseFloat(t.prepaidXlmBalance || "0"), 0);

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Top nav */}
      <header className="bg-white border-b border-neutral-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-violet-600" aria-hidden />
            <span className="font-semibold text-neutral-900 text-sm">AmmaWallet Admin</span>
          </div>
          <div className="flex items-center gap-4">
            {adminInfo && (
              <span className="text-xs text-neutral-500">
                {adminInfo.name} <span className="bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded text-[10px] font-semibold ml-1">{adminInfo.role}</span>
              </span>
            )}
            <button
              type="button"
              onClick={logout}
              className="flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-800 transition"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden />
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl border border-neutral-200 p-4 shadow-sm">
            <p className="text-xs text-neutral-500 font-medium uppercase tracking-wide">Total tenants</p>
            <p className="text-3xl font-bold text-neutral-900 mt-1">{tenants.length}</p>
          </div>
          <div className="bg-white rounded-2xl border border-neutral-200 p-4 shadow-sm">
            <p className="text-xs text-neutral-500 font-medium uppercase tracking-wide">Active tenants</p>
            <p className="text-3xl font-bold text-emerald-600 mt-1">{tenants.filter((t) => t.isActive).length}</p>
          </div>
          <div className="bg-white rounded-2xl border border-neutral-200 p-4 shadow-sm">
            <p className="text-xs text-neutral-500 font-medium uppercase tracking-wide">Total prepaid balance</p>
            <p className={`text-3xl font-bold ${totalBalance < 0 ? 'text-red-600' : 'text-violet-700'} mt-1`}>{totalBalance.toFixed(4)} <span className="text-base font-semibold text-neutral-500">XLM</span></p>
          </div>
        </div>

        {/* Quick links */}
        <div className="flex gap-3">
          <Link
            to="/admin/admins"
            className="flex items-center gap-2 text-sm font-medium text-violet-600 hover:text-violet-800 border border-violet-200 hover:border-violet-400 bg-white rounded-xl px-4 py-2.5 transition shadow-sm"
          >
            <Users className="h-4 w-4" aria-hidden />
            Staff accounts
          </Link>
        </div>

        {/* Tenant list */}
        <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-neutral-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-neutral-500" aria-hidden />
              <h2 className="text-sm font-semibold text-neutral-900">Tenants</h2>
            </div>
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-800 border border-neutral-200 rounded-lg px-3 py-1.5 transition disabled:opacity-50"
            >
              <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} aria-hidden />
              Refresh
            </button>
          </div>

          {error && (
            <div className="m-4 flex gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
              {error}
            </div>
          )}

          {loading ? (
            <div className="py-16 flex items-center justify-center text-neutral-400 gap-2">
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
              <span className="text-sm">Loading tenants…</span>
            </div>
          ) : tenants.length === 0 ? (
            <div className="py-16 text-center text-sm text-neutral-400">No tenants found.</div>
          ) : (
            <div className="divide-y divide-neutral-100">
              {tenants.map((tenant) => (
                <Link
                  key={tenant.id}
                  to={`/admin/tenants/${tenant.id}`}
                  className="flex items-center gap-4 px-5 py-4 hover:bg-neutral-50 transition group"
                >
                  {/* Status icon */}
                  <div className="shrink-0">
                    {tenant.isActive
                      ? <CheckCircle className="h-5 w-5 text-emerald-500" aria-hidden />
                      : <XCircle className="h-5 w-5 text-red-400" aria-hidden />}
                  </div>

                  {/* Tenant info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <p className="text-sm font-semibold text-neutral-900 truncate">{tenant.name}</p>
                      <span className="text-xs text-neutral-400 font-mono shrink-0">{tenant.slug}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      {tenant.contactEmail && (
                        <span className="text-xs text-neutral-400 truncate">{tenant.contactEmail}</span>
                      )}
                      {!tenant.isActive && tenant.suspensionReason && (
                        <span className="text-xs text-red-500 truncate">
                          Suspended: {tenant.suspensionReason}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Balance */}
                  <div className="text-right shrink-0">
                    <p className={`text-sm font-bold tabular-nums ${
                      parseFloat(tenant.prepaidXlmBalance) < 0
                        ? "text-red-600"
                        : parseFloat(tenant.prepaidXlmBalance) < 5
                          ? "text-amber-600"
                          : "text-neutral-900"
                    }`}>
                      {parseFloat(tenant.prepaidXlmBalance).toFixed(4)}
                    </p>
                    <p className="text-[10px] text-neutral-400">XLM</p>
                  </div>

                  <ChevronRight className="h-4 w-4 text-neutral-300 group-hover:text-neutral-500 shrink-0 transition" aria-hidden />
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
