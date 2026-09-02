import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../shared/store/auth";
import { Eye, EyeOff, Loader2, Check, X, Phone, Mail } from "lucide-react";
import { toast } from "sonner";

export default function RegisterPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const register = useAuthStore((s) => s.register);

  const [mode, setMode] = useState<"email" | "phone">("email");
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);

  const hasIdentifier = mode === "email" ? email.trim().length > 0 : phoneNumber.trim().length > 0;
  const rules = [
    { key: "rule8chars", ok: password.length >= 8 },
    { key: "ruleUppercase", ok: /[A-Z]/.test(password) },
    { key: "ruleNumber", ok: /\d/.test(password) },
    { key: "ruleMatch", ok: password.length > 0 && password === confirmPw },
  ];
  const allValid = rules.every((r) => r.ok) && hasIdentifier;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasIdentifier) return toast.error(t("auth.emailOrPhoneRequired", "Email or phone number is required"));
    if (!allValid) return toast.error(t("auth.fixPasswordReqs"));
    setLoading(true);
    try {
      await register({
        email: mode === "email" ? email.trim() : undefined,
        phoneNumber: mode === "phone" ? phoneNumber.trim() : undefined,
        password,
        firstName: firstName || undefined,
        lastName: lastName || undefined,
      });
      toast.success(t("auth.accountCreated"));
      navigate("/onboarding");
    } catch (err: any) {
      toast.error(err.message || t("auth.registerFailed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[600px] w-[380px] bg-stellar-bg p-5 overflow-y-auto">
      <h1 className="text-lg font-bold text-white mb-1">{t("auth.createAccount")}</h1>
      <p className="text-xs text-stellar-muted mb-4">{t("auth.createSubtitle")}</p>

      <form onSubmit={handleSubmit} className="space-y-2.5 flex-1">
        {/* Name fields */}
        <div className="grid grid-cols-2 gap-2">
          <input
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder={t("auth.firstNamePlaceholder")}
            className="px-3 py-2 rounded-lg bg-stellar-card border border-stellar-border text-white text-sm placeholder:text-stellar-muted focus:outline-none focus:border-stellar-blue"
          />
          <input
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder={t("auth.lastNamePlaceholder")}
            className="px-3 py-2 rounded-lg bg-stellar-card border border-stellar-border text-white text-sm placeholder:text-stellar-muted focus:outline-none focus:border-stellar-blue"
          />
        </div>

        {/* Email / Phone toggle */}
        <div className="flex gap-1 bg-stellar-card rounded-lg p-0.5">
          <button
            type="button"
            onClick={() => setMode("email")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
              mode === "email" ? "bg-stellar-blue text-white" : "text-stellar-muted hover:text-white"
            }`}
          >
            <Mail size={12} /> {t("auth.email", "Email")}
          </button>
          <button
            type="button"
            onClick={() => setMode("phone")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
              mode === "phone" ? "bg-stellar-blue text-white" : "text-stellar-muted hover:text-white"
            }`}
          >
            <Phone size={12} /> {t("auth.phone", "Phone")}
          </button>
        </div>

        {mode === "email" ? (
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("auth.emailPlaceholder")}
            className="w-full px-3 py-2 rounded-lg bg-stellar-card border border-stellar-border text-white text-sm placeholder:text-stellar-muted focus:outline-none focus:border-stellar-blue"
          />
        ) : (
          <input
            type="tel"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            placeholder="+14155552671"
            className="w-full px-3 py-2 rounded-lg bg-stellar-card border border-stellar-border text-white text-sm placeholder:text-stellar-muted focus:outline-none focus:border-stellar-blue"
          />
        )}

        {/* Password fields */}
        <div className="relative">
          <input
            type={showPw ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t("auth.createPassword")}
            className="w-full px-3 py-2 pr-10 rounded-lg bg-stellar-card border border-stellar-border text-white text-sm placeholder:text-stellar-muted focus:outline-none focus:border-stellar-blue"
          />
          <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-stellar-muted">
            {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
        <input
          type="password"
          value={confirmPw}
          onChange={(e) => setConfirmPw(e.target.value)}
          placeholder={t("auth.confirmPassword")}
          className="w-full px-3 py-2 rounded-lg bg-stellar-card border border-stellar-border text-white text-sm placeholder:text-stellar-muted focus:outline-none focus:border-stellar-blue"
        />

        {/* Password rules */}
        <div className="space-y-1">
          {rules.map((r) => (
            <div key={r.key} className="flex items-center gap-1.5 text-[10px]">
              {r.ok ? <Check size={10} className="text-green-400" /> : <X size={10} className="text-stellar-muted" />}
              <span className={r.ok ? "text-green-400" : "text-stellar-muted"}>{t(`auth.${r.key}`)}</span>
            </div>
          ))}
        </div>

        <button
          type="submit"
          disabled={loading || !allValid}
          className="w-full py-2.5 rounded-xl bg-stellar-blue text-white text-sm font-medium hover:bg-stellar-purple transition-colors disabled:opacity-50"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 size={14} className="animate-spin" /> {t("auth.creatingAccount")}
            </span>
          ) : (
            t("auth.createAccount")
          )}
        </button>
      </form>

      <p className="text-xs text-stellar-muted mt-3 text-center">
        {t("auth.hasAccount")}{" "}
        <button onClick={() => navigate("/login")} className="text-stellar-blue hover:underline">
          {t("auth.signInLink")}
        </button>
      </p>
    </div>
  );
}
