import React, { useCallback, useRef, useState } from 'react';
import ConfirmDialog from '../components/ConfirmDialog';
import { getErrorMessage } from '../utils/apiError';

export interface ConfirmActionOptions {
  title: string;
  /** Say what happens, to whom and how much; ReactNode so amounts and names can be bold. */
  description: React.ReactNode;
  /** Verb + amount, e.g. "Release 0.2000000 XLM". Never "OK" or "Yes". */
  confirmLabel: string;
  variant?: 'primary' | 'danger';
  /** Label for the button that backs out, when "Cancel" would be ambiguous (e.g. "Keep reward"). */
  cancelLabel?: string;
  /** Runs on confirm. If it throws, the dialog stays open and shows the error. */
  action: () => Promise<unknown>;
}

type Pending = ConfirmActionOptions & { resolve: (done: boolean) => void };

/**
 * One confirm dialog per page for money and destructive actions (UX-001).
 * `ask` resolves true once the action succeeded, false if the person cancelled.
 * While the action runs, `busy` is true and repeat clicks are ignored.
 * `reset` closes the dialog for a page whose subject changed (resolves false);
 * a request already sent still finishes but can no longer touch the dialog.
 */
export function useConfirmAction() {
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);
  const generation = useRef(0);
  const pendingRef = useRef<Pending | null>(null);
  pendingRef.current = pending;

  const ask = useCallback((opts: ConfirmActionOptions) => new Promise<boolean>(resolve => {
    setError(null);
    setPending({ ...opts, resolve });
  }), []);

  const reset = useCallback(() => {
    generation.current += 1;
    running.current = false;
    pendingRef.current?.resolve(false);
    setPending(null);
    setBusy(false);
    setError(null);
  }, []);

  const confirm = async () => {
    if (!pending || running.current) return;
    const mine = generation.current;
    running.current = true;
    setBusy(true);
    setError(null);
    try {
      await pending.action();
      if (generation.current !== mine) return;
      setPending(null);
      pending.resolve(true);
    } catch (err) {
      if (generation.current === mine) setError(getErrorMessage(err, 'That did not work. Try again.'));
    } finally {
      if (generation.current === mine) {
        running.current = false;
        setBusy(false);
      }
    }
  };

  const cancel = () => {
    if (running.current) return;
    pending?.resolve(false);
    setPending(null);
  };

  const dialog = (
    <ConfirmDialog
      isOpen={pending !== null}
      title={pending?.title ?? ''}
      description={pending?.description}
      confirmLabel={pending?.confirmLabel}
      confirmVariant={pending?.variant ?? 'danger'}
      cancelLabel={pending?.cancelLabel}
      loading={busy}
      error={error}
      onConfirm={() => void confirm()}
      onCancel={cancel}
    />
  );

  return { ask, dialog, busy, reset };
}
