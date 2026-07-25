import { useState } from "react";
import { Mail, X, Loader2 } from "lucide-react";
import { useAuthStore } from "../store/auth";
import { getAccessToken } from "../lib/api";
import { toast } from "sonner";

const API_BASE = import.meta.env.VITE_API_URL || "";

export default function EmailVerificationBanner() {
  const user = useAuthStore((s) => s.user);
  const [dismissed, setDismissed] = useState(false);
  const [sending, setSending] = useState(false);

  if (!user || user.isEmailVerified || dismissed) return null;

  const handleResend = async () => {
    setSending(true);
    try {
      const token = getAccessToken();
      const res = await fetch(`${API_BASE}/api/v1/auth/resend-verification`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Verification email sent! Check your inbox.");
      } else {
        toast.error(data.error || "Failed to send email");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 mx-4 mt-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <Mail className="w-5 h-5 text-amber-400 shrink-0" />
        <p className="text-sm text-amber-200">
          Please verify your email address.{" "}
          <button
            onClick={handleResend}
            disabled={sending}
            className="underline text-amber-400 hover:text-amber-300 font-medium"
          >
            {sending ? <Loader2 className="w-3 h-3 inline animate-spin" /> : "Resend verification email"}
          </button>
        </p>
      </div>
      <button onClick={() => setDismissed(true)} className="text-amber-400/50 hover:text-amber-400">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
