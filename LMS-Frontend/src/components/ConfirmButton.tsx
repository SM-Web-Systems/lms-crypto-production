/** A small button that asks "Are you sure?" inline instead of opening a browser dialog. */
import React, { useState } from 'react';

export const ConfirmButton: React.FC<{ label: string; confirmLabel: string; onConfirm: () => Promise<void> | void; disabled?: boolean }> = ({ label, confirmLabel, onConfirm, disabled }) => {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!asking) {
    return <button type="button" disabled={disabled} className="text-xs font-medium text-red-700 hover:underline disabled:opacity-50" onClick={() => setAsking(true)}>{label}</button>;
  }
  return (
    <span className="inline-flex items-center gap-2 text-xs">
      <button type="button" disabled={busy} className="font-semibold text-red-700 hover:underline"
        onClick={async () => { setBusy(true); try { await onConfirm(); } finally { setBusy(false); setAsking(false); } }}>{busy ? 'Working…' : confirmLabel}</button>
      <button type="button" className="text-neutral-600 hover:underline" onClick={() => setAsking(false)}>Cancel</button>
    </span>
  );
};
