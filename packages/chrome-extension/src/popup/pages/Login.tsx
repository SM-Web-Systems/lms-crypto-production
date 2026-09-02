import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../shared/store/auth";
import { Eye, EyeOff, Loader2, Phone, Mail } from "lucide-react";
import { toast } from "sonner";

export default function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);

  const [mode, setMode] = useState<"email" | "phone">("email");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);

  // 2FA state
  const [twoFaRequired, setTwoFaRequired] = useState(false);
  const [twoFaMethod, setTwoFaMethod] = useState("");
  const [twoFaToken, setTwoFaToken] = useState("");
  const [twoFaMessage, setTwoFaMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier || !password) return toast.error(t("auth.fillAllFields"));
    setLoading(true);
    try {
      const res = await login(
        mode === "phone" ? identifier : identifier,
        password,
        twoFaRequired ? twoFaToken : undefined
      );

      if (res?.twoFaRequired) {
        setTwoFaRequired(true);
        setTwoFaMethod(res.twoFaMethod);
        setTwoFaMessage(res.message);
        setLoading(false);
        return;
      }

      toast.success(t("auth.welcomeMessage"));
      navigate("/dashboard");
    } catch (err: any) {
      toast.error(err.message || t("auth.loginFailed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-[600px] w-[380px] bg-stellar-bg p-6">
      <div className="w-14 h-14 rounded-full bg-gradient-to-br from-stellar-blue to-stellar-purple mb-4" />
      <h1 className="text-lg font-bold text-white mb-1">{t("auth.welcomeBack")}</h1>
      <p className="text-xs text-stellar-muted mb-6">{t("auth.signInSubtitle")}</p>

      <form onSubmit={handleSubmit} className="w-full space-y-3">
        {!twoFaRequired ? (
          <>
            {/* Email / Phone toggle */}
            <div className="flex gap-1 bg-stellar-card rounded-lg p-0.5">
              <button
                type="button"
                onClick={() => { setMode("email"); setIdentifier(""); }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  mode === "email" ? "bg-stellar-blue text-white" : "text-stellar-muted hover:text-white"
                }`}
              >
                <Mail size={12} /> {t("auth.email", "Email")}
              </button>
              <button
                type="button"
                onClick={() => { setMode("phone"); setIdentifier(""); }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  mode === "phone" ? "bg-stellar-blue text-white" : "text-stellar-muted hover:text-white"
                }`}
              >
                <Phone size={12} /> {t("auth.phone", "Phone")}
              </button>
            </div>

            <input
              type={mode === "email" ? "email" : "tel"}
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder={mode === "email" ? t("auth.emailPlaceholder") : "+14155552671"}
              className="w-full px-3 py-2.5 rounded-lg bg-stellar-card border border-stellar-border text-white text-sm placeholder:text-stellar-muted focus:outline-none focus:border-stellar-blue"
            />
            <div className="relative">
              <input
                type={showPw ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("auth.passwordPlaceholder")}
                className="w-full px-3 py-2.5 pr-10 rounded-lg bg-stellar-card border border-stellar-border text-white text-sm placeholder:text-stellar-muted focus:outline-none focus:border-stellar-blue"
              />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-stellar-muted"
              >
                {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-xs text-stellar-muted text-center">{twoFaMessage}</p>
            <input
              type="text"
              value={twoFaToken}
              onChange={(e) => setTwoFaToken(e.target.value)}
              placeholder={t("auth.twoFaCodePlaceholder", "Enter code")}
              maxLength={8}
              className="w-full px-3 py-2.5 rounded-lg bg-stellar-card border border-stellar-border text-white text-sm text-center tracking-widest placeholder:text-stellar-muted focus:outline-none focus:border-stellar-blue"
            />
          </>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 rounded-xl bg-stellar-blue text-white text-sm font-medium hover:bg-stellar-purple transition-colors disabled:opacity-50"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 size={14} className="animate-spin" /> {t("auth.signingIn")}
            </span>
          ) : twoFaRequired ? (
            t("auth.verify", "Verify")
          ) : (
            t("auth.signIn")
          )}
        </button>
      </form>

      <div className="flex flex-col items-center gap-2 mt-4">
        <button
          onClick={() => navigate("/forgot-password")}
          className="text-xs text-stellar-muted hover:text-stellar-blue"
        >
          {t("auth.forgotPassword", "Forgot password?")}
        </button>
        <p className="text-xs text-stellar-muted">
          {t("auth.noAccount")}{" "}
          <button onClick={() => navigate("/register")} className="text-stellar-blue hover:underline">
            {t("auth.createOne")}
          </button>
        </p>
      </div>
    </div>
  );
}
