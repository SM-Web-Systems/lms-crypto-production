import { useState } from "react";

interface PinModalProps {
  title: string;
  onSubmit: (pin: string) => Promise<void>;
  onCancel: () => void;
}

export default function PinModal({ title, onSubmit, onCancel }: PinModalProps) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.length < 6) {
      setError("PIN must be at least 6 characters");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await onSubmit(pin);
    } catch (err: any) {
      setError(err.message || "Incorrect PIN");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <form
        onSubmit={handleSubmit}
        className="bg-stellar-card border border-stellar-border rounded-2xl p-8 w-full max-w-sm space-y-4"
      >
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        <input
          type="password"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder="Enter your PIN"
          autoFocus
          className="w-full px-4 py-3 rounded-lg bg-stellar-dark border border-stellar-border text-white placeholder:text-stellar-muted focus:outline-none focus:border-stellar-blue"
        />
        {error && <p className="text-sm text-stellar-danger">{error}</p>}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-lg border border-stellar-border text-stellar-muted hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 py-2.5 rounded-lg bg-stellar-blue text-white font-medium hover:bg-stellar-purple transition-colors disabled:opacity-50"
          >
            {loading ? "..." : "Confirm"}
          </button>
        </div>
      </form>
    </div>
  );
}
