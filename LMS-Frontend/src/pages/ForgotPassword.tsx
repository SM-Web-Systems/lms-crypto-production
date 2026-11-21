import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Loader2, Wallet, ArrowRight } from 'lucide-react';
import { authService } from '../services/authService';
import { getErrorMessage } from '../utils/apiError';

const AMMA_WALLET_URL = 'https://ammawallet.com';

type Method = 'wallet' | 'email';

/**
 * ForgotPassword asks how the person signs in. AmmaWallet accounts reset on AmmaWallet; accounts with
 * an LMS password get the LMS reset email. `?method=email` (and the older `?admin=true`) preselect email.
 */
const ForgotPassword: React.FC = () => {
  const [searchParams] = useSearchParams();
  const preselectEmail = searchParams.get('method') === 'email' || searchParams.get('admin') === 'true';
  const [method, setMethod] = React.useState<Method | null>(preselectEmail ? 'email' : null);

  const choice = (value: Method, label: string) => (
    <label className="flex items-center gap-3 cursor-pointer rounded-lg border border-gray-200 px-3 py-2.5 hover:bg-gray-50 has-[:checked]:border-primary-500 has-[:checked]:bg-primary-50">
      <input
        type="radio"
        name="sign-in-method"
        value={value}
        checked={method === value}
        onChange={() => setMethod(value)}
        className="accent-primary-600"
      />
      <span className="text-sm text-gray-800">{label}</span>
    </label>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-dark to-primary-medium flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <img src="/logo.png" alt="SM Web Systems" className="w-20 h-20 mx-auto mb-4" />
          <h1 className="text-4xl font-bold text-white mb-2">SM Web Systems</h1>
          <p className="text-white/80">Learning Management System</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8 space-y-5">
          <h2 className="text-2xl font-bold text-gray-900">Reset your password</h2>

          <div role="radiogroup" aria-labelledby="sign-in-method-label" className="space-y-2">
            <p id="sign-in-method-label" className="text-sm font-medium text-gray-700">How do you sign in?</p>
            {choice('wallet', 'With AmmaWallet')}
            {choice('email', 'With my email and an LMS password')}
          </div>

          {method === 'wallet' && (
            <a
              href={`${AMMA_WALLET_URL}/forgot-password`}
              className="w-full flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 text-white font-semibold py-3 rounded-lg transition-colors"
            >
              <Wallet className="h-5 w-5" aria-hidden="true" />
              Reset password on AmmaWallet
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </a>
          )}

          {method === 'email' && <EmailReset />}

          <p className="text-center text-sm text-gray-600">
            <Link to="/login" className="text-primary-600 font-semibold hover:underline">
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

/** LMS password reset. The reply is the same whether or not the account exists (no enumeration). */
const EmailReset: React.FC = () => {
  const [email, setEmail] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // The form unmounts on success; move focus to the message so it is read out and focus isn't lost.
  const statusRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (submitted) statusRef.current?.focus();
  }, [submitted]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await authService.forgotPassword(email);
      setSubmitted(true);
    } catch (err) {
      setError(getErrorMessage(err) || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div ref={statusRef} tabIndex={-1} role="status" className="rounded-lg bg-green-50 border border-green-200 text-green-800 text-sm px-4 py-4 space-y-1">
        <p className="font-semibold">Check your email</p>
        <p>
          If <strong>{email}</strong> has an LMS password, we have sent a reset link. It expires in 1 hour.
        </p>
        <p>If you usually sign in with AmmaWallet, choose that option instead.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div role="alert" aria-live="assertive">
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">{error}</div>
        )}
      </div>
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
          placeholder="you@example.com"
        />
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="w-full flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 text-white font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {submitting && <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />}
        {submitting ? 'Sending…' : 'Send reset link'}
      </button>
    </form>
  );
};

export default ForgotPassword;
