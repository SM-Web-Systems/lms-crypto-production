import React from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Wallet, ArrowRight, KeyRound } from 'lucide-react';
import { authService } from '../services/authService';
import { getErrorMessage } from '../utils/apiError';

const AMMA_WALLET_URL = 'https://ammawallet.com';

/**
 * ForgotPassword — password resets are handled by AmmaWallet for standard users.
 * Local-password admin accounts can still request a reset via the LMS backend
 * by navigating directly to /forgot-password?admin=true (not linked publicly).
 */
const ForgotPassword: React.FC = () => {
  const isAdmin = new URLSearchParams(window.location.search).get('admin') === 'true';

  if (isAdmin) {
    return <AdminForgotPassword />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-dark to-primary-medium flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <img src="/logo.png" alt="SM Web Systems" className="w-20 h-20 mx-auto mb-4" />
          <h1 className="text-4xl font-bold text-white mb-2">SM Web Systems</h1>
          <p className="text-white/80">Learning Management System</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8 space-y-6 text-center">
          <div className="space-y-2">
            <div className="flex justify-center">
              <div className="bg-primary-50 rounded-full p-4">
                <Wallet className="h-8 w-8 text-primary-600" />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-gray-900">Reset your password</h2>
            <p className="text-gray-500 text-sm">
              Your LMS account is linked to AmmaWallet. To reset your password,
              use the AmmaWallet password reset flow.
            </p>
          </div>

          <a
            href={`${AMMA_WALLET_URL}/forgot-password`}
            className="w-full flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 text-white font-semibold py-3 rounded-lg transition-colors"
          >
            <Wallet className="h-5 w-5" />
            Reset password on AmmaWallet
            <ArrowRight className="h-4 w-4" />
          </a>

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

// Admin-only local password reset — not linked from the public UI
const AdminForgotPassword: React.FC = () => {
  const [email, setEmail] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-dark to-primary-medium flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <img src="/logo.png" alt="SM Web Systems" className="w-20 h-20 mx-auto mb-4" />
          <h1 className="text-4xl font-bold text-white mb-2">SM Web Systems</h1>
          <p className="text-white/80">Learning Management System</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8 space-y-5">
          <div className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-gray-500" />
            <div>
              <h2 className="text-xl font-bold text-gray-900">Admin password reset</h2>
              <p className="text-xs text-gray-500 mt-0.5">For local administrator accounts only.</p>
            </div>
          </div>

          {submitted ? (
            <div className="rounded-lg bg-green-50 border border-green-200 text-green-800 text-sm px-4 py-4 space-y-1">
              <p className="font-semibold">Check your email</p>
              <p>If <strong>{email}</strong> is a local admin account, a reset link has been sent. It expires in 1 hour.</p>
            </div>
          ) : (
            <>
              {error && (
                <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">
                  {error}
                </div>
              )}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                    placeholder="admin@example.com"
                  />
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 text-white font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {submitting && <Loader2 className="h-5 w-5 animate-spin" />}
                  {submitting ? 'Sending…' : 'Send reset link'}
                </button>
              </form>
            </>
          )}

          <p className="text-center text-sm text-gray-600">
            <Link to="/login" className="text-primary-600 font-semibold hover:underline">Back to sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;
