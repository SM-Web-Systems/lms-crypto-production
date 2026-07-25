/**
 * NM-D3 — Admin staff list page (/admin/admins)
 *
 * Lists all AmmaWallet internal admin accounts with role + status.
 * Uses admin JWT from sessionStorage['aw_admin_token'].
 */
import { useEffect, useState, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  ShieldCheck, LogOut, ArrowLeft, RefreshCw,
  AlertCircle, CheckCircle, XCircle, Loader2, Users,
} from "lucide-react";

interface AdminAccount {
  id: number;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
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

function roleBadge(role: string) {
  const styles: Record<string, string> = {
    super_admin:     "bg-violet-100 text-violet-800",
    platform_admin:  "bg-blue-100 text-blue-800",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${styles[role] ?? "bg-neutral-100 text-neutral-700"}`}>
      {role.replace(/_/g, " ")}
    </span>
  );
}

export default function AdminAdmins() {
  const [admins, setAdmins] = useState<AdminAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const logout = () => {
    sessionStorage.removeItem("aw_admin_token");
    sessionStorage.removeItem("aw_admin_info");
    navigate("/admin/login");
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminFetch("/api/v1/internal/admins");
      if (res.status === 401) { logout(); return; }
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? `Server error ${res.status}`);
        return;
      }
      const d = await res.json();
      setAdmins(d.admins ?? []);
    } catch {
      setError("Network error — could not load admins.");
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!sessionStorage.getItem("aw_admin_token")) { navigate("/admin/login"); return; }
    load();
  }, [load, navigate]);

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
            Dashboard
          </Link>
          <span className="text-neutral-300">/</span>
          <span className="text-sm text-neutral-600 flex items-center gap-1">
            <Users className="h-4 w-4" aria-hidden />
            Admin accounts
          </span>
        </div>

        {error && (
          <div className="flex gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
            {error}
          </div>
        )}

        <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-neutral-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-neutral-900 flex items-center gap-2">
              <Users className="h-4 w-4 text-neutral-400" aria-hidden />
              Staff accounts ({admins.length})
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

          {loading ? (
            <div className="py-16 flex items-center justify-center text-neutral-400 gap-2">
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
              <span className="text-sm">Loading admins…</span>
            </div>
          ) : admins.length === 0 ? (
            <div className="py-16 text-center text-sm text-neutral-400">No admin accounts found.</div>
          ) : (
            <div className="divide-y divide-neutral-100">
              {admins.map((admin) => (
                <div key={admin.id} className="flex items-center gap-4 px-5 py-3.5">
                  {/* Active indicator */}
                  <div className="shrink-0">
                    {admin.isActive
                      ? <CheckCircle className="h-4 w-4 text-emerald-500" aria-hidden />
                      : <XCircle className="h-4 w-4 text-red-400" aria-hidden />}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-neutral-900">{admin.name}</p>
                      {roleBadge(admin.role)}
                      {!admin.isActive && (
                        <span className="text-[10px] bg-red-100 text-red-700 rounded-full px-2 py-0.5 font-semibold">
                          Deactivated
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-neutral-500 mt-0.5">{admin.email}</p>
                  </div>

                  {/* ID + joined */}
                  <div className="shrink-0 text-right">
                    <p className="text-xs text-neutral-400 tabular-nums">#{admin.id}</p>
                    <p className="text-[10px] text-neutral-300 mt-0.5 tabular-nums">
                      {new Date(admin.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
