import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuthStore } from "../store/auth";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Eye, EyeOff, Mail, Lock, Loader2 } from "lucide-react";
import { Turnstile } from "../components/Turnstile";
import { consumePendingOAuth } from "./OAuthConsent";

export default function LoginPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [twoFaRequired, setTwoFaRequired] = useState(false);
  const [twoFaToken, setTwoFaToken] = useState("");
  const [twoFaMethod, setTwoFaMethod] = useState("");
  const login = useAuthStore((s) => s.login);
  const isLoading = useAuthStore((s) => s.isLoading);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return toast.error(t("auth.fillAllFields"));
    if (!turnstileToken && !twoFaRequired) return toast.error("Please complete the human verification");
    try {
      await login(email, password, turnstileToken, twoFaToken || undefined);
      toast.success(t("auth.welcomeMessage"));
      // Check for pending OAuth flow — redirect back to consent page instead of dashboard
      const pendingOAuth = consumePendingOAuth();
      if (pendingOAuth) {
        navigate(`/oauth/authorize${pendingOAuth}`, { replace: true });
      } else {
        navigate("/dashboard");
      }
    } catch (err: any) {
      if (err.message?.startsWith("2FA_REQUIRED")) {
        const method = err.message.split(":")[1] || "totp";
        setTwoFaRequired(true);
        setTwoFaMethod(method);
        toast.info(
          method === "email" ? "A verification code was sent to your email"
          : method === "static" ? "Enter one of your backup codes"
          : "Enter the code from your authenticator app"
        );
      } else {
        toast.error(err.message || t("auth.loginFailed"));
      }
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen p-6">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <img src="/favicon-128.png" alt="Amma Wallet" className="w-16 h-16 mx-auto mb-4 rounded-2xl" />
          <h1 className="text-3xl font-bold text-stellar-text">{t("auth.welcomeBack")}</h1>
          <p className="mt-2 text-stellar-muted">{t("auth.signInSubtitle")}</p>
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

          <div>
            <label className="block text-sm font-medium text-stellar-muted mb-1.5">{t("auth.password")}</label>
            <div className="relative">
              <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-stellar-muted" />
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("auth.passwordPlaceholder")}
                className="w-full pl-10 pr-12 py-3 rounded-lg bg-stellar-dark border border-stellar-border text-stellar-text placeholder:text-stellar-muted/50 focus:outline-none focus:border-stellar-blue transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-stellar-muted hover:text-stellar-text transition-colors"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div className="text-right">
            <Link to="/forgot-password" className="text-sm text-stellar-blue hover:text-stellar-purple transition-colors">
              {t("auth.forgotPassword")}?
            </Link>
          </div>

          {/* 2FA Code Input */}
          {twoFaRequired && (
            <div className="space-y-2">
              <label className="block text-sm text-stellar-muted">2FA Verification Code</label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={8}
                value={twoFaToken}
                onChange={(e) => setTwoFaToken(e.target.value.replace(/[^0-9A-Za-z]/g, ""))}
                placeholder={twoFaMethod === "email" ? "Enter email code" : twoFaMethod === "static" ? "Enter your security code" : "Enter 6-digit code or backup code"}
                className="w-full px-4 py-3 rounded-xl bg-stellar-dark border border-stellar-border text-stellar-text placeholder:text-stellar-muted/50 focus:outline-none focus:border-stellar-blue text-center text-lg tracking-widest"
                autoFocus
              />
              <p className="text-xs text-stellar-muted text-center">
                {twoFaMethod === "email" ? "Check your email for a 6-digit code" : twoFaMethod === "static" ? "Enter one of your 8-character backup codes" : "Enter code from your authenticator app, or an 8-character backup code"}
              </p>
            </div>
          )}

          <Turnstile
            siteKey="0x4AAAAAAD2WUNs4ywHK6utW"
            onVerify={(token) => setTurnstileToken(token)}
            onExpire={() => setTurnstileToken("")}
          />

          <button
            type="submit"
            disabled={isLoading || !turnstileToken}
            className="w-full py-3 rounded-lg bg-stellar-blue text-white font-medium hover:bg-stellar-purple transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                {t("auth.signingIn")}
              </>
            ) : (
              t("auth.signIn")
            )}
          </button>
        </form>

        <p className="text-center text-sm text-stellar-muted">
          {t("auth.noAccount")}{" "}
          <Link to="/register" className="text-stellar-blue hover:text-stellar-purple transition-colors font-medium">
            {t("auth.createOne")}
          </Link>
        </p>
      </div>
    </div>
  );
}
