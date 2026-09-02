import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL || "";

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const token = searchParams.get("token");
    if (!token) {
      setStatus("error");
      setMessage("No verification token provided.");
      return;
    }

    fetch(`${API_BASE}/api/v1/auth/verify-email?token=${token}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setStatus("success");
          setMessage(data.message || "Email verified successfully!");
        } else {
          setStatus("error");
          setMessage(data.error || "Verification failed.");
        }
      })
      .catch(() => {
        setStatus("error");
        setMessage("Network error. Please try again.");
      });
  }, [searchParams]);

  return (
    <div className="flex items-center justify-center min-h-screen p-6">
      <div className="w-full max-w-md bg-stellar-card rounded-2xl p-8 border border-stellar-border text-center">
        <h1 className="text-2xl font-bold text-stellar-text mb-6">Email Verification</h1>

        {status === "loading" && (
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="w-12 h-12 text-stellar-blue animate-spin" />
            <p className="text-stellar-muted">Verifying your email...</p>
          </div>
        )}

        {status === "success" && (
          <div className="flex flex-col items-center gap-4">
            <CheckCircle className="w-16 h-16 text-green-500" />
            <p className="text-stellar-text text-lg">{message}</p>
            <button
              onClick={() => navigate("/dashboard")}
              className="mt-4 px-6 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-blue-500 text-white font-semibold hover:opacity-90 transition"
            >
              Go to Dashboard
            </button>
          </div>
        )}

        {status === "error" && (
          <div className="flex flex-col items-center gap-4">
            <XCircle className="w-16 h-16 text-red-500" />
            <p className="text-red-400 text-lg">{message}</p>
            <button
              onClick={() => navigate("/login")}
              className="mt-4 px-6 py-3 rounded-xl bg-stellar-dark border border-stellar-border text-stellar-text hover:bg-stellar-border transition"
            >
              Back to Login
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
