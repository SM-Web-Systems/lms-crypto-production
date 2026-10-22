/**
 * SsoCallback — receives the LMS JWT from the AmmaWallet SSO redirect.
 *
 * The LMS backend redirects here after a successful SSO assertion exchange:
 *   /sso-callback#token=<lms-jwt>
 *
 * Stores the token, removes it from the URL and hydrates the session from
 * /auth/me before selecting the effective workspace.
 *
 * Using a hash fragment means the token is never sent to any server as a
 * query parameter (never in nginx access logs, browser history URL bar shows it
 * but it's ephemeral and immediately replaced by the dashboard URL).
 */

import React, { useEffect, useRef, useState } from 'react';
import { Loader2, CheckCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import api from '../services/api';
import type { ApiResponse, User } from '../types/api';
import { homeForUser } from '../utils/authorization';
import { ApiRequestError } from '../utils/apiError';

const TOKEN_KEY = 'lms_token';

const SsoCallback: React.FC = () => {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [recoverable, setRecoverable] = useState(false);
  const { updateUser } = useAuth();
  const updateUserRef = useRef(updateUser);
  updateUserRef.current = updateUser;
  const navigate = useNavigate();
  const tokenRef = useRef(new URLSearchParams(window.location.hash.slice(1)).get('token'));

  useEffect(() => {
    // Parse hash fragment: #token=<jwt>
    const token = tokenRef.current;
    let cancelled = false;

    if (!token) {
      setError('SSO session data is missing. Please try signing in again.');
      return;
    }
    if (attempt > 0 && localStorage.getItem(TOKEN_KEY) !== token) {
      setRecoverable(false);
      setError('The active session changed. Return to your workspace or sign in again.');
      return;
    }

    // Store token — same mechanism as normal login
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      setError('Unable to store session. Please allow localStorage and try again.');
      return;
    }

    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    // The verified server context determines the workspace; JWT role hints do not.
    api.get<ApiResponse<User>>('/auth/me').then(response => {
      if (cancelled || localStorage.getItem(TOKEN_KEY) !== token) return;
      if (!response.data.success || !response.data.data) throw new Error('Invalid session');
      updateUserRef.current(response.data.data, token);
      setSuccess(true);
      navigate(homeForUser(response.data.data), {replace: true});
    }).catch((error: unknown) => {
      if (cancelled) return;
      const currentToken = localStorage.getItem(TOKEN_KEY);
      if (currentToken && currentToken !== token) return;
      const invalid = error instanceof ApiRequestError && error.status === 401;
      if (invalid && currentToken === token) localStorage.removeItem(TOKEN_KEY);
      setRecoverable(!invalid && currentToken === token);
      setError(invalid ? 'This session has expired or was revoked. Please sign in again.' : 'Unable to verify your session. Reconnect and try again.');
    });
    return () => { cancelled = true; };
  }, [navigate, attempt]);

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary-dark to-primary-medium flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center space-y-4">
          <h2 className="text-xl font-bold text-gray-900">Sign-in failed</h2>
          <p className="text-sm text-red-600">{error}</p>
          {recoverable && <button onClick={() => {setError(null);setAttempt(value=>value+1);}} className="rounded-lg bg-accent-teal px-4 py-2 text-white">Retry connection</button>}
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
