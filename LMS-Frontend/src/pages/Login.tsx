import React, { useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { Loader2, Mail, Lock, Eye, EyeOff, Wallet, ChevronDown, ChevronUp } from 'lucide-react';
import { useAuth } from '../context/useAuth';
import { getErrorMessage } from '../utils/apiError';

// SSO initiate endpoint — browser is redirected here, not a fetch call
const AMMA_LOGIN_URL = '/api/v1/auth/amma-login';
const AMMA_WALLET_URL = 'https://ammawallet.com';

const SSO_ERROR_MESSAGES: Record<string, string> = {
  invalid_state: 'The sign-in session expired or was tampered with. Please try again.',
  assertion_failed: 'AmmaWallet could not verify your identity. Please try again.',
  user_error: 'Could not create your LMS session. Please contact support.',
};

const Login: React.FC = () => {
  const { login } = useAuth();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const passwordReset = (location.state as { passwordReset?: boolean } | null)?.passwordReset ?? false;
  const ssoErrorCode = searchParams.get('sso_error');
  const ssoErrorMsg = ssoErrorCode ? (SSO_ERROR_MESSAGES[ssoErrorCode] ?? 'Sign-in failed. Please try again.') : null;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ssoRequired, setSsoRequired] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showAdminForm, setShowAdminForm] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
    } catch (err) {
      const msg = getErrorMessage(err) || 'Invalid email or password.';
      if (msg.toLowerCase().includes('ammawallet') || msg.toLowerCase().includes('sso')) {
        setSsoRequired(true);
        setError('This account uses AmmaWallet for sign-in. Please use the button above.');
      } else {
        setSsoRequired(false);
        setError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-dark to-primary-medium flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <img src="/logo.png" alt="SM Web Systems" className="w-20 h-20 mx-auto mb-4" />
          <h1 className="text-4xl font-bold text-white mb-2">SM Web Systems</h1>
          <p className="text-white/80">Learning Management System</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8 space-y-5">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Welcome back</h2>
            <p className="text-sm text-gray-500 mt-1">Sign in with your AmmaWallet account to continue.</p>
          </div>

          {passwordReset && (
            <div className="rounded-lg bg-green-50 border border-green-200 text-green-800 text-sm px-4 py-3">
              Password updated successfully. Sign in with your new password.
            </div>
          )}

          {ssoErrorMsg && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-3">
              {ssoErrorMsg}
            </div>
          )}

          {ssoRequired && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-3">
              {error}
            </div>
          )}

          {/* Primary sign-in path */}
          <a
            href={AMMA_LOGIN_URL}
            className="w-full flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 text-white font-semibold py-3 rounded-lg transition-colors"
          >
            <Wallet className="h-5 w-5" />
            Sign in with AmmaWallet
          </a>

          <p className="text-center text-sm text-gray-600">
            Don&apos;t have an account?{' '}
            <a
              href={`${AMMA_WALLET_URL}/register`}
              className="text-primary-600 font-semibold hover:underline"
            >
              Create one on AmmaWallet
            </a>
          </p>

          {/* Admin / internal-account sign-in — collapsed by default */}
          <div className="pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setShowAdminForm((v) => !v)}
              className="w-full flex items-center justify-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors py-1"
            >
              {showAdminForm ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              Administrator sign in
            </button>

            {showAdminForm && (
              <form onSubmit={handleSubmit} className="mt-4 space-y-4">
                {!ssoRequired && error && (
                  <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">
                    {error}
                  </div>
                )}

                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                    Email
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <input
                      id="email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                      placeholder="you@example.com"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                      Password
                    </label>
                    <Link
                      to="/forgot-password"
                      className="text-xs text-primary-600 hover:underline"
                    >
                      Forgot password?
                    </Link>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-10 pr-10 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full flex items-center justify-center gap-2 border border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {submitting && <Loader2 className="h-5 w-5 animate-spin" />}
                  {submitting ? 'Signing in…' : 'Sign in'}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
