/**
 * SsoCallback — receives the LMS JWT from the AmmaWallet SSO redirect.
 *
 * The LMS backend redirects here after a successful SSO assertion exchange:
 *   /sso-callback#token=<lms-jwt>&role=<student|admin>
 *
 * This component:
 *   1. Reads the token and role from the URL hash fragment.
 *   2. Stores the token in localStorage (same key as normal login).
 *   3. Shows a brief "Wallet linked successfully" card for ~1.2 s.
 *   4. Hard-redirects to the appropriate dashboard, triggering AuthProvider
 *      to hydrate the session from the stored token.
 *
 * Using a hash fragment means the token is never sent to any server as a
 * query parameter (never in nginx access logs, browser history URL bar shows it
 * but it's ephemeral and immediately replaced by the dashboard URL).
 */

import React, { useEffect, useState } from 'react';
import { Loader2, CheckCircle } from 'lucide-react';

const TOKEN_KEY = 'lms_token';

const SsoCallback: React.FC = () => {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    // Parse hash fragment: #token=<jwt>&role=<role>
    const hash = window.location.hash.slice(1); // remove leading '#'
    const params = new URLSearchParams(hash);
    const token = params.get('token');
    const role  = params.get('role') as 'student' | 'admin' | null;

    if (!token) {
      setError('SSO session data is missing. Please try signing in again.');
      return;
    }

    // Store token — same mechanism as normal login
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      setError('Unable to store session. Please allow localStorage and try again.');
      return;
    }

    // Show success card briefly before redirecting
    const destination = role === 'admin' ? '/admin' : '/student';
    setSuccess(true);
    setTimeout(() => {
      window.location.replace(destination);
    }, 1200);
  }, []);

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary-dark to-primary-medium flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center space-y-4">
          <h2 className="text-xl font-bold text-gray-900">Sign-in failed</h2>
          <p className="text-sm text-red-600">{error}</p>
          <a
            href="/login"
            className="inline-block mt-4 bg-primary-600 hover:bg-primary-700 text-white font-semibold py-2 px-6 rounded-lg transition-colors"
          >
            Back to login
          </a>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary-dark to-primary-medium flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center space-y-4">
          <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
          <h2 className="text-xl font-bold text-gray-900">Wallet linked successfully</h2>
          <p className="text-sm text-gray-600">You will be redirected to your dashboard.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-dark to-primary-medium flex items-center justify-center px-4">
      <div className="text-center text-white space-y-4">
        <Loader2 className="h-10 w-10 animate-spin mx-auto" />
        <p className="text-lg font-medium">Completing sign-in…</p>
        <p className="text-sm text-white/70">You will be redirected shortly.</p>
      </div>
    </div>
  );
};

export default SsoCallback;
