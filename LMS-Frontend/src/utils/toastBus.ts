export type ToastVariant = 'error' | 'success' | 'info';

type PushFn = (message: string, variant: ToastVariant) => void;

let pushRef: PushFn | null = null;

/** Called once from ToastProvider mount. */
export function registerToastPush(fn: PushFn | null): void {
  pushRef = fn;
}

export function toastPush(message: string, variant: ToastVariant = 'error'): void {
  pushRef?.(message, variant);
}

export function toastError(message: string): void {
  toastPush(message, 'error');
}

export function toastSuccess(message: string): void {
  toastPush(message, 'success');
}

export function toastInfo(message: string): void {
  toastPush(message, 'info');
}
