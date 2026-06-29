import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle, Info, X } from 'lucide-react';
import { registerToastPush, type ToastVariant } from '../utils/toastBus';

type ToastItem = { id: number; message: string; variant: ToastVariant };

let idSeq = 0;
const DISMISS_MS = 6000;

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback((message: string, variant: ToastVariant) => {
    const id = ++idSeq;
    setItems((prev) => [...prev, { id, message, variant }]);
    window.setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, DISMISS_MS);
  }, []);

  useEffect(() => {
    registerToastPush(push);
    return () => registerToastPush(null);
  }, [push]);

  const dismiss = (id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <>
      {children}
      <div
        className="fixed bottom-4 right-4 z-[200] flex max-w-[min(100vw-2rem,24rem)] flex-col gap-2 pointer-events-none sm:bottom-6 sm:right-6"
        aria-live="polite"
        aria-relevant="additions"
      >
        {items.map((t) => {
          const styles =
            t.variant === 'success'
              ? 'border-emerald-200/90 bg-emerald-50/95 text-emerald-950'
              : t.variant === 'info'
                ? 'border-sky-200/90 bg-sky-50/95 text-sky-950'
                : 'border-red-200/90 bg-red-50/95 text-red-950';
          const Icon = t.variant === 'success' ? CheckCircle : t.variant === 'info' ? Info : AlertCircle;
          return (
            <div
              key={t.id}
              role="alert"
              className={`pointer-events-auto flex gap-3 rounded-xl border px-3 py-3 shadow-updraft ring-1 ring-neutral-900/[0.06] ${styles}`}
            >
              <Icon className="h-5 w-5 shrink-0 mt-0.5 opacity-90" aria-hidden />
              <p className="text-sm leading-relaxed flex-1 min-w-0">{t.message}</p>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                className="shrink-0 rounded-md p-1 opacity-70 hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-neutral-400"
                aria-label="Dismiss notification"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
};
