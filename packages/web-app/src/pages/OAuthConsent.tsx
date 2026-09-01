import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getAccessToken } from "../lib/api";
import { API_BASE } from "../lib/constants";
import { Shield, CheckCircle, Loader2, AlertCircle } from "lucide-react";

const OAUTH_STORAGE_KEY = "pendingOAuth";

/** Save pending OAuth params and redirect to login */
export function savePendingOAuth(search: string) {
  sessionStorage.setItem(OAUTH_STORAGE_KEY, search);
}

/** Check for and consume pending OAuth params after login */
export function consumePendingOAuth(): string | null {
  const params = sessionStorage.getItem(OAUTH_STORAGE_KEY);
  if (params) sessionStorage.removeItem(OAUTH_STORAGE_KEY);
  return params;
}

interface ConsentInfo {
  client_name: string;
  client_id: string;
  scopes: string;
  redirect_uri: string;
  state: string;
  code_challenge: string;
  code_challenge_method: string;
}

export default function OAuthConsent() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "consent" | "approving" | "error">("loading");
  const [consent, setConsent] = useState<ConsentInfo | null>(null);
  const [error, setError] = useState("");

  const callAuthorize = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      // Not logged in — save OAuth params and redirect to login
      savePendingOAuth(window.location.search);
      navigate("/login", { replace: true });
      return;
    }

    try {
      const qs = searchParams.toString();
      const res = await fetch(`${API_BASE}/api/v1/oauth/authorize?${qs}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error_description || body.error || `Error ${res.status}`);
        setStatus("error");
        return;
      }

      const data = await res.json();

      if (data.action === "consent_required") {
        setConsent(data as ConsentInfo);
        setStatus("consent");
      } else if (data.redirect_url) {
        // Already consented — redirect to RP callback
        window.location.href = data.redirect_url;
      } else {
        setError("Unexpected response from authorization server");
        setStatus("error");
      }
    } catch (err: any) {
      setError(err.message || "Failed to contact authorization server");
      setStatus("error");
    }
  }, [searchParams, navigate]);

  useEffect(() => {
    callAuthorize();
  }, [callAuthorize]);

  const handleApprove = async () => {
    if (!consent) return;
    setStatus("approving");

    const token = getAccessToken();
    if (!token) {
      savePendingOAuth(window.location.search);
      navigate("/login", { replace: true });
      return;
    }

    try {
      // 1. Grant consent
      const consentRes = await fetch(`${API_BASE}/api/v1/oauth/consent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          client_id: consent.client_id,
          scopes: consent.scopes,
        }),
      });

      if (!consentRes.ok) {
        const body = await consentRes.json().catch(() => ({}));
        setError(body.error_description || body.error || "Failed to grant consent");
        setStatus("error");
        return;
      }

      // 2. Re-call authorize (now with consent granted)
      const qs = searchParams.toString();
      const authRes = await fetch(`${API_BASE}/api/v1/oauth/authorize?${qs}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });

      if (!authRes.ok) {
        const body = await authRes.json().catch(() => ({}));
        setError(body.error_description || body.error || "Authorization failed");
        setStatus("error");
        return;
      }

      const data = await authRes.json();
      if (data.redirect_url) {
        window.location.href = data.redirect_url;
      } else {
        setError("Authorization did not return a redirect");
        setStatus("error");
      }
    } catch (err: any) {
      setError(err.message || "Authorization failed");
      setStatus("error");
    }
  };

  const handleDeny = () => {
    // Redirect back to RP with error
    const redirectUri = searchParams.get("redirect_uri");
    const state = searchParams.get("state");
    if (redirectUri) {
      const url = new URL(redirectUri);
      url.searchParams.set("error", "access_denied");
      if (state) url.searchParams.set("state", state);
      window.location.href = url.toString();
    } else {
      navigate("/dashboard", { replace: true });
    }
  };

  const scopeLabels: Record<string, string> = {
    openid: "Verify your identity",
    profile: "View your profile information",
    email: "View your email address",
  };

  if (status === "loading" || status === "approving") {
    return (
      <div className="flex items-center justify-center min-h-screen p-6">
        <div className="text-center space-y-4">
          <Loader2 size={40} className="animate-spin text-purple-500 mx-auto" />
          <p className="text-stellar-muted">
            {status === "approving" ? "Authorizing..." : "Loading..."}
          </p>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex items-center justify-center min-h-screen p-6">
        <div className="w-full max-w-md bg-stellar-card border border-stellar-border rounded-2xl p-6 text-center space-y-4">
          <AlertCircle size={40} className="text-red-500 mx-auto" />
          <h2 className="text-xl font-bold text-stellar-text">Authorization Error</h2>
          <p className="text-stellar-muted">{error}</p>
          <button
            onClick={() => navigate("/dashboard", { replace: true })}
            className="px-4 py-2 bg-stellar-card border border-stellar-border rounded-lg text-stellar-text hover:bg-stellar-hover"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // Consent screen
  return (
    <div className="flex items-center justify-center min-h-screen p-6">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <img src="/favicon-128.png" alt="Amma Wallet" className="w-16 h-16 mx-auto mb-4 rounded-2xl" />
          <h1 className="text-2xl font-bold text-stellar-text">Authorize Access</h1>
        </div>

        <div className="bg-stellar-card border border-stellar-border rounded-2xl p-6 space-y-5">
          <div className="flex items-center gap-3">
            <Shield size={24} className="text-purple-500 flex-shrink-0" />
            <div>
              <p className="text-stellar-text font-medium">{consent?.client_name}</p>
              <p className="text-sm text-stellar-muted">wants to access your account</p>
            </div>
          </div>

          <div className="border-t border-stellar-border pt-4">
            <p className="text-sm font-medium text-stellar-text mb-3">This will allow the application to:</p>
            <ul className="space-y-2">
              {consent?.scopes.split(" ").map((scope) => (
                <li key={scope} className="flex items-center gap-2 text-sm text-stellar-muted">
                  <CheckCircle size={16} className="text-green-500 flex-shrink-0" />
                  {scopeLabels[scope] || scope}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={handleDeny}
              className="flex-1 px-4 py-2.5 bg-stellar-card border border-stellar-border rounded-lg text-stellar-text hover:bg-stellar-hover font-medium"
            >
              Deny
            </button>
            <button
              onClick={handleApprove}
              className="flex-1 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium"
            >
              Approve
            </button>
          </div>
        </div>

        <p className="text-xs text-center text-stellar-muted">
          You can revoke access at any time from your account settings.
        </p>
      </div>
    </div>
  );
}
