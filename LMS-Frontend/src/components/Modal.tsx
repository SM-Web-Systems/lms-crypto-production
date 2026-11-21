import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Shared dialog (UX-024): same keyboard rules as ConfirmDialog — focus moves in and is trapped, Escape closes, focus returns. */
const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children }) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = `${useId()}-title`;
  // Latest onClose for the document listener without re-binding it each render.
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    if (!isOpen) return undefined;
    const opener = document.activeElement as HTMLElement | null;
    // Leave focus on a field the content auto-focused; otherwise start on the panel.
    if (!panelRef.current?.contains(document.activeElement)) panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); close.current(); return; }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) { e.preventDefault(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      const inside = panelRef.current.contains(active) && active !== panelRef.current;
      if (e.shiftKey && (active === first || !inside)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (active === last || !inside)) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (opener && document.contains(opener)) opener.focus();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        {/* Background overlay */}
        <div
          className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75"
          aria-hidden
          onClick={onClose}
        />

        {/* Modal panel */}
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full outline-none"
        >
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="flex items-center justify-between mb-4">
              <h2 id={titleId} className="text-lg font-semibold text-gray-900">{title}</h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="touch-target text-gray-400 hover:text-gray-500 transition-colors"
              >
                <X className="h-6 w-6" aria-hidden />
              </button>
            </div>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
};

export { Modal };
export default Modal;
