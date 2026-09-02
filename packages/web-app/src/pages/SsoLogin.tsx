/**
 * SsoLogin — AmmaWallet login page used during an SSO redirect flow.
 *
 * Entry: /sso/login?callback=<url>&state=<state-jwt>
 *
 * Flow:
 *   1. User arrives here redirected from a relying party (e.g. LMS).
 *   2. If already authenticated, request assertion immediately.
 *   3. Otherwise show the standard login form.
 *   4. After successful login, call POST /api/v1/sso/token to get an assertion.
 *   5. Redirect the browser to callbackUrl?assertion=<token>&state=<state>.
 */

import { useState, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { useAuthStore } from "../store/auth";
import { getAccessToken } from "../lib/api";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Eye, EyeOff, Mail, Lock, Loader2, ArrowRight } from "lucide-react";
import { Turnstile } from "../components/Turnstile";

export default function SsoLoginPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const callbackUrl = searchParams.get("callback") ?? "";
  const state       = searchParams.get("state") ?? "";

  const [email,        setEmail]        = useState("");
  const [password,     setPassword]     = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [twoFaRequired, setTwoFaRequired]   = useState(false);
  const [twoFaToken,    setTwoFaToken]      = useState("");
  const [twoFaMethod,   setTwoFaMethod]     = useState("");
  const [asserting, setAsserting] = useState(false);
  const [pageError, setPageError] = useState("");

  const login          = useAuthStore((s) => s.login);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading      = useAuthStore((s) => s.isLoading);

  // Safe display of the relying-party origin (avoids showing raw callback URL)
  const rpOrigin = (() => {
    try { return new URL(callbackUrl).hostname; }
    catch { return callbackUrl; }
  })();

  // Request an assertion JWT from AmmaWallet then redirect to the RP callback.
  async function requestAssertion() {
    setAsserting(true);
    const accessToken = getAccessToken();
    if (!accessToken) {
      setPageError("No active session. Please sign in first.");
      setAsserting(false);
      return;
    }
    try {
      const res = await fetch("/api/v1/sso/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ callbackUrl, state }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `SSO token request failed (${res.status})`);
      }
      const { assertionToken } = await res.json() as { assertionToken: string };

      // Build the redirect URL (callback is already a full HTTPS URL)
      const redirect = new URL(callbackUrl);
      redirect.searchParams.set("assertion", assertionToken);
      redirect.searchParams.set("state", state);
      window.location.href = redirect.toString();
    } catch (err: any) {
      setPageError(err.message || "SSO failed. Please try again.");
      setAsserting(false);
    }
  }

  // If already authenticated when the page mounts, go straight to assertion.
  useEffect(() => {
    if (isAuthenticated && callbackUrl && state) {
      requestAssertion();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Guard: missing required SSO params ──────────────────────────────────
  if (!callbackUrl || !state) {
    return (
      <div className="flex items-center justify-center min-h-screen p-6">
        <div className="text-center">
          <p className="text-red-400 mb-4">Invalid SSO request — missing required parameters.</p>
          <Link to="/login" className="text-stellar-blue hover:text-stellar-purple transition-colors">
            ← Back to login
          </Link>
        </div>
      </div>
    );
  }

  // ── Loading overlay while asserting / redirecting ────────────────────────
  if (asserting) {
    return (
      <div className="flex items-center justify-center min-h-screen p-6">
        <div className="text-center space-y-4">
          <Loader2 size={36} className="animate-spin text-stellar-blue mx-auto" />
          <p className="text-stellar-text font-medium">Signing you in to {rpOrigin}…</p>
          <p className="text-stellar-muted text-sm">Redirecting, please wait.</p>
        </div>
      </div>
    );
  }

  // ── Login form ───────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPageError("");

    if (!email || !password) {
      toast.error(t("auth.fillAllFields"));
      return;
    }
    if (!turnstileToken && !twoFaRequired) {
      toast.error("Please complete the human verification");
      return;
    }

    try {
      await login(email, password, turnstileToken, twoFaToken || undefined);
      // login() resolves → tokens are set → request assertion
      await requestAssertion();
    } catch (err: any) {
      // 2FA challenge — show the code input instead of redirecting
      if (err.message?.startsWith("2FA_REQUIRED")) {
        const method = err.message.split(":")[1] || "totp";
        setTwoFaRequired(true);
        setTwoFaMethod(method);
        toast.info(
          method === "email"  ? "A verification code was sent to your email"
          : method === "static" ? "Enter one of your backup codes"
          :                       "Enter the code from your authenticator app",
        );
        return;
      }

      // If auth succeeded but a post-login step (e.g. wallet sync) failed,
      // we still have a valid token — proceed to assertion.
      if (getAccessToken()) {
        await requestAssertion();
        return;
      }

      toast.error(err.message || t("auth.loginFailed"));
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen p-6">
      <div className="w-full max-w-md space-y-6">

        {/* Header */}
        <div className="text-center">
          <img
            src="/favicon-128.png"
            alt="Amma Wallet"
            className="w-16 h-16 mx-auto mb-4 rounded-2xl"
          />
          <h1 className="text-2xl font-bold text-stellar-text">Sign in to continue</h1>
        </div>

        {/* SSO context banner */}
        <div className="rounded-xl border border-stellar-blue/30 bg-stellar-blue/10 px-4 py-3">
          <p className="text-sm font-semibold text-stellar-text mb-0.5">
            <span className="text-stellar-blue">{rpOrigin}</span> is requesting access to your AmmaWallet.
          </p>
          <p className="text-xs text-stellar-muted leading-relaxed">
            After signing in, you will be returned there automatically.
          </p>
        </div>

        {pageError && (
          <div className="rounded-lg bg-red-900/30 border border-red-700 text-red-300 text-sm px-4 py-3">
            {pageError}
          </div>
        )}

        {/* Login form */}
        <form
          onSubmit={handleSubmit}
          className="space-y-4 bg-stellar-card border border-stellar-border rounded-2xl p-6"
        >
          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-stellar-muted mb-1.5">
              {t("auth.email")}
            </label>
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

          {/* Password */}
          <div>
            <label className="block text-sm font-medium text-stellar-muted mb-1.5">
              {t("auth.password")}
            </label>
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
            <Link
              to="/forgot-password"
              className="text-sm text-stellar-blue hover:text-stellar-purple transition-colors"
            >
              {t("auth.forgotPassword")}?
            </Link>
          </div>

          {/* 2FA code input */}
          {twoFaRequired && (
            <div className="space-y-2">
              <label className="block text-sm text-stellar-muted">2FA Verification Code</label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={8}
                value={twoFaToken}
                onChange={(e) => setTwoFaToken(e.target.value.replace(/[^0-9A-Za-z]/g, ""))}
                placeholder={
                  twoFaMethod === "email"  ? "Enter email code"
                  : twoFaMethod === "static" ? "Enter your security code"
                  :                           "Enter 6-digit code or backup code"
                }
                className="w-full px-4 py-3 rounded-xl bg-stellar-dark border border-stellar-border text-stellar-text placeholder:text-stellar-muted/50 focus:outline-none focus:border-stellar-blue text-center text-lg tracking-widest"
                autoFocus
              />
              <p className="text-xs text-stellar-muted text-center">
                {twoFaMethod === "email"  ? "Check your email for a 6-digit code"
                : twoFaMethod === "static" ? "Enter one of your 8-character backup codes"
                :                            "Enter code from your authenticator app, or an 8-character backup code"}
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
            disabled={isLoading || (!turnstileToken && !twoFaRequired)}
            className="w-full py-3 rounded-lg bg-stellar-blue text-white font-medium hover:bg-stellar-purple transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <><Loader2 size={18} className="animate-spin" /> {t("auth.signingIn")}</>
            ) : (
              <>{t("auth.signIn")} <ArrowRight size={16} /></>
            )}
          </button>
        </form>

        <p className="text-center text-sm text-stellar-muted">
          Don&apos;t have an AmmaWallet account?{" "}
          <Link
            to="/register"
            className="text-stellar-blue hover:text-stellar-purple transition-colors font-medium"
          >
            {t("auth.createOne")}
          </Link>
        </p>
      </div>
    </div>
  );
}
