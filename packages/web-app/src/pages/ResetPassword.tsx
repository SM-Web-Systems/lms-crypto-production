import { useState, useEffect } from "react";
import { useSearchParams, Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Lock, Loader2, ArrowLeft, CheckCircle, Check } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL || "";

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      toast.error("Invalid or missing reset token");
      navigate("/forgot-password");
    }
  }, [token, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return toast.error("Password must be at least 8 characters");
    if (!/[A-Z]/.test(password)) return toast.error("Password must contain an uppercase letter");
    if (!/\d/.test(password)) return toast.error("Password must contain a number");
    if (password !== confirmPassword) return toast.error("Passwords don't match");

    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Reset failed");
      setSuccess(true);
    } catch (err: any) {
      toast.error(err.message || "Failed to reset password");
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <div className="flex items-center justify-center min-h-screen p-6">
        <div className="w-full max-w-md space-y-6 text-center">
          <div className="w-16 h-16 mx-auto rounded-full bg-green-500/10 flex items-center justify-center">
            <CheckCircle size={32} className="text-green-400" />
          </div>
          <h1 className="text-2xl font-bold text-stellar-text">Password Reset Successfully</h1>
          <p className="text-stellar-muted">Your password has been updated. You can now sign in with your new password.</p>
          <Link
            to="/login"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-stellar-blue text-white font-medium hover:bg-stellar-purple transition-colors"
          >
            Sign In
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen p-6">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <img src="/favicon-128.png" alt="Amma Wallet" className="w-16 h-16 mx-auto mb-4 rounded-2xl" />
          <h1 className="text-3xl font-bold text-stellar-text">Reset Password</h1>
          <p className="mt-2 text-stellar-muted">Enter your new password below</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 bg-stellar-card border border-stellar-border rounded-2xl p-6">
          <div>
            <label className="block text-sm font-medium text-stellar-muted mb-1.5">New Password</label>
            <div className="relative">
              <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-stellar-muted" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter new password"
                className="w-full pl-10 pr-4 py-3 rounded-lg bg-stellar-dark border border-stellar-border text-stellar-text placeholder:text-stellar-muted/50 focus:outline-none focus:border-stellar-blue transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-stellar-muted mb-1.5">Confirm Password</label>
            <div className="relative">
              <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-stellar-muted" />
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                className="w-full pl-10 pr-4 py-3 rounded-lg bg-stellar-dark border border-stellar-border text-stellar-text placeholder:text-stellar-muted/50 focus:outline-none focus:border-stellar-blue transition-colors"
              />
            </div>
          </div>

          {password.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs">
                <Check size={12} className={password.length >= 8 ? "text-green-400" : "text-stellar-muted/40"} />
                <span className={password.length >= 8 ? "text-green-400" : "text-stellar-muted/40"}>At least 8 characters</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <Check size={12} className={/[A-Z]/.test(password) ? "text-green-400" : "text-stellar-muted/40"} />
                <span className={/[A-Z]/.test(password) ? "text-green-400" : "text-stellar-muted/40"}>One uppercase letter</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <Check size={12} className={/\d/.test(password) ? "text-green-400" : "text-stellar-muted/40"} />
                <span className={/\d/.test(password) ? "text-green-400" : "text-stellar-muted/40"}>One number</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <Check size={12} className={password === confirmPassword && confirmPassword.length > 0 ? "text-green-400" : "text-stellar-muted/40"} />
                <span className={password === confirmPassword && confirmPassword.length > 0 ? "text-green-400" : "text-stellar-muted/40"}>Passwords match</span>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 rounded-lg bg-stellar-blue text-white font-medium hover:bg-stellar-purple transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isLoading ? <><Loader2 size={18} className="animate-spin" /> Resetting...</> : "Reset Password"}
          </button>
        </form>

        <p className="text-center text-sm text-stellar-muted">
          <Link to="/login" className="text-stellar-blue hover:text-stellar-purple transition-colors font-medium inline-flex items-center gap-1">
            <ArrowLeft size={14} /> Back to Login
          </Link>
        </p>
      </div>
    </div>
  );
}
