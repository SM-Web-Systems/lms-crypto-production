import { useState } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { useAuthStore } from "../store/auth";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Eye, EyeOff, Mail, Lock, User, Loader2, Check, X } from "lucide-react";
import { Turnstile } from "../components/Turnstile";

export default function RegisterPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const register = useAuthStore((s) => s.register);
  const isLoading = useAuthStore((s) => s.isLoading);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isFromLms = searchParams.get("source") === "lms";

  const rules = [
    { label: t("auth.rule8chars"), valid: password.length >= 8 },
    { label: t("auth.ruleUppercase"), valid: /[A-Z]/.test(password) },
    { label: t("auth.ruleNumber"), valid: /\d/.test(password) },
    { label: t("auth.ruleMatch"), valid: password.length > 0 && password === confirmPassword },
  ];

  const allValid = rules.every((r) => r.valid);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return toast.error(t("auth.fillAllFields"));
    if (!allValid) return toast.error(t("auth.fixPasswordReqs"));
    if (!turnstileToken) return toast.error("Please complete the human verification");
    try {
      await register(email, password, firstName || undefined, lastName || undefined, turnstileToken);
      toast.success(t("auth.accountCreated"));
      navigate("/dashboard");
    } catch (err: any) {
      toast.error(err.message || t("auth.registerFailed"));
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen p-6">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <img src="/favicon-128.png" alt="Amma Wallet" className="w-16 h-16 mx-auto mb-4 rounded-2xl" />
          <h1 className="text-3xl font-bold text-stellar-text">{t("auth.createAccount")}</h1>
          <p className="mt-2 text-stellar-muted">{t("auth.createSubtitle")}</p>
        </div>

        {isFromLms && (
          <div className="rounded-xl border border-stellar-blue/30 bg-stellar-blue/10 px-4 py-3">
            <p className="text-sm font-semibold text-stellar-text mb-0.5">LMS enrollment</p>
            <p className="text-xs text-stellar-muted leading-relaxed">
              Create this wallet to receive your NFT course certificates on the Stellar blockchain.
              Once registered, return to the LMS and sign in with AmmaWallet to link your account.
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 bg-stellar-card border border-stellar-border rounded-2xl p-6">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-stellar-muted mb-1.5">{t("auth.firstName")}</label>
              <div className="relative">
                <User size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-stellar-muted" />
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder={t("auth.firstNamePlaceholder")}
                  className="w-full pl-10 pr-4 py-3 rounded-lg bg-stellar-dark border border-stellar-border text-stellar-text placeholder:text-stellar-muted/50 focus:outline-none focus:border-stellar-blue transition-colors"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-stellar-muted mb-1.5">{t("auth.lastName")}</label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder={t("auth.lastNamePlaceholder")}
                className="w-full px-4 py-3 rounded-lg bg-stellar-dark border border-stellar-border text-stellar-text placeholder:text-stellar-muted/50 focus:outline-none focus:border-stellar-blue transition-colors"
              />
            </div>
          </div>

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
                placeholder={t("auth.createPassword")}
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

          <div>
            <label className="block text-sm font-medium text-stellar-muted mb-1.5">{t("auth.confirmPassword")}</label>
            <div className="relative">
              <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-stellar-muted" />
              <input
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={t("auth.repeatPassword")}
                className="w-full pl-10 pr-4 py-3 rounded-lg bg-stellar-dark border border-stellar-border text-stellar-text placeholder:text-stellar-muted/50 focus:outline-none focus:border-stellar-blue transition-colors"
              />
            </div>
          </div>

          <div className="space-y-1.5 pt-1">
            {rules.map((rule, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                {rule.valid ? (
                  <Check size={14} className="text-green-400" />
                ) : (
                  <X size={14} className="text-stellar-muted/50" />
                )}
                <span className={rule.valid ? "text-green-400" : "text-stellar-muted/50"}>
                  {rule.label}
                </span>
              </div>
            ))}
          </div>

          <Turnstile
            siteKey="0x4AAAAAAD2WUNs4ywHK6utW"
            onVerify={(token) => setTurnstileToken(token)}
            onExpire={() => setTurnstileToken("")}
          />

          <button
            type="submit"
            disabled={isLoading || !allValid || !turnstileToken}
            className="w-full py-3 rounded-lg bg-stellar-blue text-white font-medium hover:bg-stellar-purple transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                {t("auth.creatingAccount")}
              </>
            ) : (
              t("auth.createAccount")
            )}
          </button>
        </form>

        <p className="text-center text-sm text-stellar-muted">
          {t("auth.hasAccount")}{" "}
          <Link to="/login" className="text-stellar-blue hover:text-stellar-purple transition-colors font-medium">
            {t("auth.signInLink")}
          </Link>
        </p>
      </div>
    </div>
  );
}
