/**
 * NM-D3 / AW-ADMIN-006 — Admin staff list page (/admin/admins)
 *
 * Lists all AmmaWallet internal admin accounts with role + status.
 * AW-ADMIN-006: Full lifecycle actions — invite, deactivate, reactivate, reset password.
 * Uses admin JWT from sessionStorage['aw_admin_token'].
 * Current admin identity from sessionStorage['aw_admin_info'] gates all write actions.
 */
import { useEffect, useState, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  ShieldCheck, LogOut, ArrowLeft, RefreshCw,
  AlertCircle, CheckCircle, XCircle, Loader2, Users,
  UserPlus, ShieldOff, KeyRound, X,
} from "lucide-react";

interface AdminAccount {
  id: number;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
  createdAt: string;
}

interface CurrentAdmin {
  id: number;
  role: string;
}

type AdminIntent = { action: 'deactivate' | 'reactivate'; target: AdminAccount };

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
    super_admin:    "bg-violet-100 text-violet-800",
    platform_admin: "bg-blue-100 text-blue-800",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${styles[role] ?? "bg-neutral-100 text-neutral-700"}`}>
      {role.replace(/_/g, " ")}
    </span>
  );
}

const ALL_ROLES = ["super_admin", "platform_admin", "account_manager", "support_agent"] as const;

const inputCls = "w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-900 placeholder-neutral-400 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100 transition";

export default function AdminAdmins() {
  const [admins, setAdmins]             = useState<AdminAccount[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);
  const [currentAdmin, setCurrentAdmin] = useState<CurrentAdmin | null>(null);
  const navigate = useNavigate();

  // AW-ADMIN-006: modal + action state
  const [confirmModal, setConfirmModal] = useState<AdminIntent | null>(null);
  const [resetModal, setResetModal]     = useState<AdminAccount | null>(null);
  const [inviteOpen, setInviteOpen]     = useState(false);

  const [actionBusy, setActionBusy]     = useState<number | null>(null);
  const [actionError, setActionError]   = useState<{ id: number; msg: string } | null>(null);

  const [inviteForm, setInviteForm]     = useState({ email: '', name: '', role: 'platform_admin', password: '' });
  const [inviteBusy, setInviteBusy]     = useState(false);
  const [inviteError, setInviteError]   = useState<string | null>(null);

  const [resetPwd, setResetPwd]         = useState('');
  const [resetError, setResetError]     = useState<string | null>(null);
  const [resetSuccess, setResetSuccess] = useState<number | null>(null);

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
    // Parse current admin identity for action gating — fail safely if missing/malformed
    try {
      const info = JSON.parse(sessionStorage.getItem("aw_admin_info") ?? "null");
      if (info && typeof info.id === "number" && typeof info.role === "string") {
        setCurrentAdmin({ id: info.id, role: info.role });
      }
    } catch { /* no action buttons shown */ }
    load();
  }, [load, navigate]);

  // ── Action gating ─────────────────────────────────────────────────────────
  const canInvite = currentAdmin?.role === 'super_admin' || currentAdmin?.role === 'platform_admin';

  const canDeactivate = (row: AdminAccount) => {
    if (!currentAdmin || !row.isActive || row.id === currentAdmin.id) return false;
    if (currentAdmin.role === 'super_admin') return true;
    return currentAdmin.role === 'platform_admin' && row.role !== 'super_admin';
  };

  const canReactivate = (row: AdminAccount) => {
    if (!currentAdmin || row.isActive) return false;
    if (currentAdmin.role === 'super_admin') return true;
    return currentAdmin.role === 'platform_admin' && row.role !== 'super_admin';
  };

  const canResetPassword = (row: AdminAccount) =>
    !!currentAdmin && currentAdmin.role === 'super_admin' && row.id !== currentAdmin.id;

  // ── Submit handlers ───────────────────────────────────────────────────────
  const submitInvite = async () => {
    if (inviteForm.password.length < 8) {
      setInviteError("Password must be at least 8 characters.");
      return;
    }
    setInviteBusy(true);
    setInviteError(null);
    try {
      const res = await adminFetch("/api/v1/internal/admins", {
        method: "POST",
        body: JSON.stringify(inviteForm),
      });
      if (res.status === 401) { logout(); return; }
      const d = await res.json();
      if (!res.ok) { setInviteError(d.error ?? `Error ${res.status}`); return; }
      setInviteOpen(false);
      setInviteForm({ email: '', name: '', role: 'platform_admin', password: '' });
      load();
    } catch {
      setInviteError("Network error — could not create admin.");
    } finally {
      setInviteBusy(false);
    }
  };

  const submitConfirmAction = async (intent: AdminIntent) => {
    setConfirmModal(null);
    setActionBusy(intent.target.id);
    setActionError(null);
    try {
      const res = await adminFetch(
        `/api/v1/internal/admins/${intent.target.id}/${intent.action}`,
        { method: "PATCH" },
      );
      if (res.status === 401) { logout(); return; }
      const d = await res.json();
      if (!res.ok) {
        setActionError({ id: intent.target.id, msg: d.error ?? `Error ${res.status}` });
        return;
      }
      load();
    } catch {
      setActionError({ id: intent.target.id, msg: `Network error — could not ${intent.action} admin.` });
    } finally {
      setActionBusy(null);
    }
  };

  const submitResetPassword = async (admin: AdminAccount) => {
    if (resetPwd.length < 12) {
      setResetError("Password must be at least 12 characters.");
      return;
    }
    setResetError(null);
    setActionBusy(admin.id);
    try {
      const res = await adminFetch(
        `/api/v1/internal/admins/${admin.id}/reset-password`,
        { method: "POST", body: JSON.stringify({ newPassword: resetPwd }) },
      );
      if (res.status === 401) { logout(); return; }
      const d = await res.json();
      if (!res.ok) { setResetError(d.error ?? `Error ${res.status}`); return; }
      setResetModal(null);
      setResetPwd('');
      setResetSuccess(admin.id);
      setTimeout(() => setResetSuccess(null), 5000);
    } catch {
      setResetError("Network error — could not reset password.");
    } finally {
      setActionBusy(null);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50">

      {/* ── Invite modal ──────────────────────────────────────────────────── */}
      {inviteOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="invite-modal-title"
          onKeyDown={(e) => e.key === 'Escape' && !inviteBusy && setInviteOpen(false)}
        >
          <div
            className="absolute inset-0 bg-neutral-900/50 backdrop-blur-sm"
            aria-hidden
            onClick={() => !inviteBusy && setInviteOpen(false)}
          />
          <div className="relative w-full max-w-sm bg-white rounded-2xl border border-neutral-200 shadow-xl flex flex-col">
            <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-neutral-100">
              <h2 id="invite-modal-title" className="text-base font-bold text-neutral-900 flex items-center gap-2">
                <UserPlus className="h-4 w-4 text-violet-600" aria-hidden />
                Invite admin
              </h2>
              <button type="button" onClick={() => !inviteBusy && setInviteOpen(false)}
                className="shrink-0 p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">Email</label>
                <input type="email" className={inputCls} placeholder="admin@example.com"
                  value={inviteForm.email}
                  onChange={(e) => setInviteForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">Full name</label>
                <input type="text" className={inputCls} placeholder="Full name"
                  value={inviteForm.name}
                  onChange={(e) => setInviteForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">Role</label>
                <select className={inputCls}
                  value={inviteForm.role}
                  onChange={(e) => setInviteForm(f => ({ ...f, role: e.target.value }))}>
                  {ALL_ROLES
                    .filter(r => currentAdmin?.role !== 'platform_admin' || r !== 'super_admin')
                    .map(r => <option key={r} value={r}>{r.replace(/_/g, " ")}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">Initial password</label>
                <input type="password" className={inputCls} placeholder="Min. 8 characters"
                  value={inviteForm.password}
                  onChange={(e) => setInviteForm(f => ({ ...f, password: e.target.value }))} />
              </div>
              {inviteError && (
                <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{inviteError}</p>
              )}
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-neutral-100">
              <button type="button" onClick={() => !inviteBusy && setInviteOpen(false)}
                className="text-sm font-medium text-neutral-600 border border-neutral-200 hover:bg-neutral-50 rounded-lg px-4 py-2 transition">
                Cancel
              </button>
              <button type="button" onClick={submitInvite} disabled={inviteBusy}
                className="text-sm font-medium text-white bg-violet-600 hover:bg-violet-700 rounded-lg px-4 py-2 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
                {inviteBusy
                  ? <><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />Creating…</>
                  : "Create account"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Deactivate / Reactivate confirm modal ─────────────────────────── */}
      {confirmModal !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-modal-title"
          onKeyDown={(e) => e.key === 'Escape' && setConfirmModal(null)}
        >
          <div
            className="absolute inset-0 bg-neutral-900/50 backdrop-blur-sm"
            aria-hidden
            onClick={() => setConfirmModal(null)}
          />
          <div className="relative w-full max-w-sm bg-white rounded-2xl border border-neutral-200 shadow-xl flex flex-col">
            <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-neutral-100">
              <h2 id="confirm-modal-title" className="text-base font-bold text-neutral-900">
                {confirmModal.action === 'deactivate' ? 'Deactivate admin?' : 'Reactivate admin?'}
              </h2>
              <button type="button" onClick={() => setConfirmModal(null)}
                className="shrink-0 p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="px-5 py-4 text-sm text-neutral-600 leading-relaxed">
              {confirmModal.action === 'deactivate' ? (
                <>Access will be revoked immediately for <strong className="font-semibold text-neutral-900">{confirmModal.target.name}</strong> ({confirmModal.target.email}). Their active JWT will be rejected on the next request. Reversible.</>
              ) : (
                <>Full admin access will be restored for <strong className="font-semibold text-neutral-900">{confirmModal.target.name}</strong> ({confirmModal.target.email}). They can sign in immediately.</>
              )}
            </p>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-neutral-100">
              <button type="button" onClick={() => setConfirmModal(null)}
                className="text-sm font-medium text-neutral-600 border border-neutral-200 hover:bg-neutral-50 rounded-lg px-4 py-2 transition">
                Cancel
              </button>
              <button type="button" onClick={() => submitConfirmAction(confirmModal)}
                className={`text-sm font-medium text-white rounded-lg px-4 py-2 transition ${
                  confirmModal.action === 'deactivate'
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}>
                {confirmModal.action === 'deactivate' ? 'Deactivate' : 'Reactivate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Reset password modal ──────────────────────────────────────────── */}
      {resetModal !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reset-modal-title"
          onKeyDown={(e) => e.key === 'Escape' && actionBusy !== resetModal.id && setResetModal(null)}
        >
          <div
            className="absolute inset-0 bg-neutral-900/50 backdrop-blur-sm"
            aria-hidden
            onClick={() => actionBusy !== resetModal.id && setResetModal(null)}
          />
          <div className="relative w-full max-w-sm bg-white rounded-2xl border border-neutral-200 shadow-xl flex flex-col">
            <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-neutral-100">
              <h2 id="reset-modal-title" className="text-base font-bold text-neutral-900 flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-neutral-600" aria-hidden />
                Reset password
              </h2>
              <button type="button" onClick={() => actionBusy !== resetModal.id && setResetModal(null)}
                className="shrink-0 p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <p className="text-sm text-neutral-600 leading-relaxed">
                Set a new password for <strong className="font-semibold text-neutral-900">{resetModal.name}</strong> ({resetModal.email}). They will need to use this password on their next sign in.
              </p>
              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">New password</label>
                <input
                  type="password"
                  className={inputCls}
                  placeholder="Min. 12 characters"
                  value={resetPwd}
                  onChange={(e) => setResetPwd(e.target.value)}
                />
              </div>
              {resetError && (
                <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{resetError}</p>
              )}
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-neutral-100">
              <button type="button" onClick={() => actionBusy !== resetModal.id && setResetModal(null)}
                className="text-sm font-medium text-neutral-600 border border-neutral-200 hover:bg-neutral-50 rounded-lg px-4 py-2 transition">
                Cancel
              </button>
              <button type="button"
                onClick={() => submitResetPassword(resetModal)}
                disabled={actionBusy === resetModal.id}
                className="text-sm font-medium text-white bg-neutral-800 hover:bg-neutral-900 rounded-lg px-4 py-2 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
                {actionBusy === resetModal.id
                  ? <><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />Resetting…</>
                  : "Set password"}
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
          <button type="button" onClick={logout}
            className="flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-800 transition">
            <LogOut className="h-3.5 w-3.5" aria-hidden />
            Sign out
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2">
          <Link to="/admin"
            className="flex items-center gap-1.5 text-sm text-violet-600 hover:text-violet-800 font-medium transition">
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
            <div className="flex items-center gap-2">
              {canInvite && (
                <button type="button"
                  onClick={() => { setInviteError(null); setInviteOpen(true); }}
                  className="flex items-center gap-1.5 text-xs font-medium text-white bg-violet-600 hover:bg-violet-700 rounded-lg px-3 py-1.5 transition">
                  <UserPlus className="h-3 w-3" aria-hidden />
                  Invite admin
                </button>
              )}
              <button type="button" onClick={load} disabled={loading}
                className="flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-800 border border-neutral-200 rounded-lg px-3 py-1.5 transition">
                <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} aria-hidden />
                Refresh
              </button>
            </div>
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
                <div key={admin.id}>
                  <div className="flex items-center gap-3 px-5 py-3.5">
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
                        {resetSuccess === admin.id && (
                          <span className="text-[10px] bg-emerald-100 text-emerald-700 rounded-full px-2 py-0.5 font-semibold flex items-center gap-1">
                            <CheckCircle className="h-3 w-3" aria-hidden />
                            Password reset
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-neutral-500 mt-0.5">{admin.email}</p>
                    </div>

                    {/* Row actions + ID */}
                    <div className="shrink-0 flex items-center gap-2">
                      {canDeactivate(admin) && (
                        <button type="button"
                          onClick={() => { setActionError(null); setConfirmModal({ action: 'deactivate', target: admin }); }}
                          disabled={actionBusy === admin.id}
                          title="Deactivate this admin"
                          className="flex items-center gap-1 text-[11px] font-medium text-red-600 border border-red-200 hover:bg-red-50 rounded-lg px-2.5 py-1 transition disabled:opacity-50 disabled:cursor-not-allowed">
                          {actionBusy === admin.id
                            ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                            : <ShieldOff className="h-3 w-3" aria-hidden />}
                          Deactivate
                        </button>
                      )}
                      {canReactivate(admin) && (
                        <button type="button"
                          onClick={() => { setActionError(null); setConfirmModal({ action: 'reactivate', target: admin }); }}
                          disabled={actionBusy === admin.id}
                          title="Reactivate this admin"
                          className="flex items-center gap-1 text-[11px] font-medium text-emerald-700 border border-emerald-200 hover:bg-emerald-50 rounded-lg px-2.5 py-1 transition disabled:opacity-50 disabled:cursor-not-allowed">
                          {actionBusy === admin.id
                            ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                            : <CheckCircle className="h-3 w-3" aria-hidden />}
                          Reactivate
                        </button>
                      )}
                      {canResetPassword(admin) && (
                        <button type="button"
                          onClick={() => { setResetPwd(''); setResetError(null); setResetModal(admin); }}
                          disabled={actionBusy === admin.id}
                          title="Reset password"
                          className="flex items-center gap-1 text-[11px] font-medium text-neutral-600 border border-neutral-200 hover:bg-neutral-50 rounded-lg px-2.5 py-1 transition disabled:opacity-50 disabled:cursor-not-allowed">
                          <KeyRound className="h-3 w-3" aria-hidden />
                          Reset pwd
                        </button>
                      )}

                      {/* ID + joined */}
                      <div className="text-right ml-1">
                        <p className="text-xs text-neutral-400 tabular-nums">#{admin.id}</p>
                        <p className="text-[10px] text-neutral-300 mt-0.5 tabular-nums">
                          {new Date(admin.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Per-row action error */}
                  {actionError?.id === admin.id && (
                    <div className="px-5 pb-3 flex items-center gap-2 text-xs text-red-700">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      {actionError.msg}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
