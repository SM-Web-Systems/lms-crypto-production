import React, { useEffect, useId, useRef } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from './Button';

export interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  confirmVariant?: 'primary' | 'danger';
  cancelLabel?: string;
  loading?: boolean;
  /** Shown on the confirm button, with a spinner, while `loading`. */
  loadingLabel?: string;
  /** Shown inside the dialog, e.g. when the confirmed action failed. */
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  description,
  confirmLabel = 'Confirm',
  confirmVariant = 'danger',
  cancelLabel = 'Cancel',
  loading = false,
  loadingLabel = 'Working…',
  error,
  onConfirm,
  onCancel,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const titleId = `${id}-title`;
  const descId = `${id}-desc`;

  // Latest values for the document-level listener without re-binding it.
  const live = useRef({ loading, onCancel });
  live.current = { loading, onCancel };

  useEffect(() => {
    if (!isOpen) return undefined;
    const opener = document.activeElement as HTMLElement | null;
    // Move focus into the dialog, unless the person already clicked or tabbed into it.
    const t = setTimeout(() => {
      const panel = panelRef.current;
      if (panel && !panel.contains(document.activeElement)) panel.focus();
    }, 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (!live.current.loading) live.current.onCancel();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled])'));
      if (items.length === 0) { e.preventDefault(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      // The panel itself holds focus when the dialog opens; Shift+Tab from there must wrap too.
      const inside = panelRef.current.contains(active) && active !== panelRef.current;
      if (e.shiftKey && (active === first || !inside)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (active === last || !inside)) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', onKey);
      if (opener && document.contains(opener)) opener.focus();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
    >
      <div
        className="absolute inset-0 bg-neutral-900/50 backdrop-blur-sm"
        aria-hidden
        onClick={loading ? undefined : onCancel}
      />
      <div ref={panelRef} tabIndex={-1} className="relative w-full max-w-sm rounded-2xl bg-white shadow-2xl ring-1 ring-neutral-900/[0.08] outline-none">
        <div className="px-5 py-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-500">
              <AlertTriangle className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0">
              <h2 id={titleId} className="text-base font-bold text-neutral-900">
                {title}
              </h2>
              <div id={descId} className="text-sm text-neutral-600 mt-1 leading-relaxed break-words">{description}</div>
              {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2 px-5 py-4 border-t border-neutral-100">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onCancel}
            disabled={loading}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={confirmVariant}
            size="sm"
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" aria-hidden />{loadingLabel}</> : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
