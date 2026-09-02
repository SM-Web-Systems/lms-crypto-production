import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { authApi } from "../../shared/lib/api";
import { Link } from "react-router-dom";
import { KeyRound, ArrowLeft, Mail, CheckCircle } from "lucide-react";
import { toast } from "sonner";

export default function ForgotPassword() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  const resetMutation = useMutation({
    mutationFn: () => authApi.forgotPassword(email),
    onSuccess: () => {
      setSent(true);
      toast.success(t("auth.resetEmailSent", "Reset email sent"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (sent) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <CheckCircle size={48} className="text-green-400 mb-4" />
        <h2 className="text-lg font-bold text-white mb-2">
          {t("auth.checkEmail", "Check your email")}
        </h2>
        <p className="text-sm text-stellar-muted mb-6">
          {t("auth.resetInstructions", "If an account exists with that email, you'll receive a password reset link.")}
        </p>
        <Link
          to="/login"
          className="text-sm text-stellar-blue hover:underline flex items-center gap-1"
        >
          <ArrowLeft size={14} />
          {t("auth.backToLogin", "Back to login")}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-full p-6">
      <KeyRound size={32} className="text-stellar-blue mb-4" />
      <h1 className="text-lg font-bold text-white mb-1">
        {t("auth.forgotPassword", "Forgot Password")}
      </h1>
      <p className="text-xs text-stellar-muted mb-6 text-center">
        {t("auth.forgotDesc", "Enter your email and we'll send you a reset link.")}
      </p>

      <div className="w-full space-y-3">
        <div className="relative">
          <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stellar-muted" />
          <input
            type="email"
            placeholder={t("auth.email", "Email address")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-stellar-card border border-stellar-border rounded-lg pl-10 pr-3 py-2.5 text-sm text-white placeholder:text-stellar-muted"
          />
        </div>

        <button
          onClick={() => resetMutation.mutate()}
          disabled={!email || resetMutation.isPending}
          className="w-full py-2.5 rounded-lg bg-stellar-blue text-white text-sm font-medium disabled:opacity-50"
        >
          {resetMutation.isPending ? "..." : t("auth.sendResetLink", "Send Reset Link")}
        </button>

        <Link
          to="/login"
          className="block text-center text-xs text-stellar-muted hover:text-white"
        >
          {t("auth.backToLogin", "Back to login")}
        </Link>
      </div>
    </div>
  );
}
