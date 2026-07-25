/**
 * TextInputModal — reusable modal for capturing a single text value inline.
 *
 * Replaces window.prompt() across the LMS so that:
 *  - UX is consistent and keyboard-accessible.
 *  - Validation errors are shown in-place.
 *  - The existing text (initialValue) is preserved when editing.
 *
 * Props:
 *   isOpen        — controls visibility
 *   title         — modal heading
 *   description   — optional instructional sub-text
 *   label         — label above the textarea
 *   initialValue  — pre-filled value (e.g. existing recommendation text)
 *   placeholder   — textarea placeholder
 *   required      — if true, empty submission is rejected
 *   confirmLabel  — button text (default "Save")
 *   onConfirm(v)  — called with the trimmed value when the user saves
 *   onCancel()    — called when the user cancels or closes
 */

import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from './Button';

export interface TextInputModalProps {
  isOpen: boolean;
  title: string;
  description?: string;
  label: string;
  initialValue?: string;
  placeholder?: string;
  required?: boolean;
  confirmLabel?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

const TextInputModal: React.FC<TextInputModalProps> = ({
  isOpen,
  title,
  description,
  label,
  initialValue = '',
  placeholder = '',
  required = false,
  confirmLabel = 'Save',
  onConfirm,
  onCancel,
}) => {
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Reset value and error whenever the modal opens
  useEffect(() => {
    if (isOpen) {
      setValue(initialValue);
      setError(null);
      // Defer focus so the DOM is ready
      setTimeout(() => textareaRef.current?.focus(), 30);
    }
  }, [isOpen, initialValue]);

  const handleConfirm = () => {
    const trimmed = value.trim();
    if (required && !trimmed) {
      setError('This field is required.');
      return;
    }
    onConfirm(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onCancel();
    // Ctrl+Enter submits (convenient for textarea)
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleConfirm();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tim-title"
      onKeyDown={handleKeyDown}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-neutral-900/50 backdrop-blur-sm"
        aria-hidden
        onClick={onCancel}
      />

      {/* Panel */}
      <div className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl ring-1 ring-neutral-900/[0.08] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-neutral-100">
          <div>
            <h2 id="tim-title" className="text-base font-bold text-neutral-900">{title}</h2>
            {description && (
              <p className="text-sm text-neutral-600 mt-0.5 leading-relaxed">{description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="shrink-0 p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3">
          <div>
            <label
              htmlFor="tim-input"
              className="block text-sm font-semibold text-neutral-700 mb-1.5"
            >
              {label}
              {required && <span className="text-red-500 ml-0.5">*</span>}
            </label>
            <textarea
              id="tim-input"
              ref={textareaRef}
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                if (error) setError(null);
              }}
              placeholder={placeholder}
              rows={4}
              className={`w-full resize-y rounded-xl border px-3 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-accent-teal transition-colors ${
                error
                  ? 'border-red-300 focus:ring-red-400/50'
                  : 'border-neutral-200 focus:ring-accent-teal/40'
              }`}
            />
            {error && (
              <p className="text-xs text-red-600 mt-1">{error}</p>
            )}
            <p className="text-xs text-neutral-400 mt-1">Ctrl+Enter to save</p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-neutral-100">
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={handleConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default TextInputModal;
