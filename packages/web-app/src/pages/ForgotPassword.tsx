import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Mail, Loader2, ArrowLeft, CheckCircle } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL || "";

export default function ForgotPasswordPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return toast.error(t("auth.emailRequired"));
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw new Error(t("auth.resetRequestFailed"));
      setSent(true);
    } catch (err: any) {
      toast.error(err.message || t("auth.resetRequestFailed"));
    } finally {
      setIsLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="flex items-center justify-center min-h-screen p-6">
        <div className="w-full max-w-md space-y-6 text-center">
          <div className="w-16 h-16 mx-auto rounded-full bg-green-500/10 flex items-center justify-center">
            <CheckCircle size={32} className="text-green-400" />
          </div>
          <h1 className="text-2xl font-bold text-stellar-text">{t("auth.resetEmailSent")}</h1>
          <p className="text-stellar-muted">{t("auth.resetEmailSentDesc")}</p>
          <Link
            to="/login"
            className="inline-flex items-center gap-2 text-stellar-blue hover:text-stellar-purple transition-colors font-medium"
          >
            <ArrowLeft size={16} />
            {t("auth.backToLogin")}
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
          <h1 className="text-3xl font-bold text-stellar-text">{t("auth.forgotPassword")}</h1>
          <p className="mt-2 text-stellar-muted">{t("auth.forgotPasswordDesc")}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 bg-stellar-card border border-stellar-border rounded-2xl p-6">
          <div>
            <label className="block text-sm font-medium text-stellar-muted mb-1.5">{t("auth.email")}</label>
            <div className="relative">
              <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-stellar-muted" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("auth.emailPlaceholder")}
                autoFocus
                className="w-full pl-10 pr-4 py-3 rounded-lg bg-stellar-dark border border-stellar-border text-stellar-text placeholder:text-stellar-muted/50 focus:outline-none focus:border-stellar-blue transition-colors"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 rounded-lg bg-stellar-blue text-white font-medium hover:bg-stellar-purple transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                {t("auth.sending")}
              </>
            ) : (
              t("auth.sendResetLink")
            )}
          </button>
        </form>

        <p className="text-center text-sm text-stellar-muted">
          <Link to="/login" className="text-stellar-blue hover:text-stellar-purple transition-colors font-medium inline-flex items-center gap-1">
            <ArrowLeft size={14} />
            {t("auth.backToLogin")}
          </Link>
        </p>
      </div>
    </div>
  );
}
