import type { AxiosResponse, AxiosError } from 'axios';
import { isAxiosError } from 'axios';
import type { ApiResponse } from '../types/api';

export type ApiValidationDetail = { field: string; message: string };

export class ApiRequestError extends Error {
  readonly status?: number;
  readonly code?: string;
  readonly details?: ApiValidationDetail[];

  constructor(opts: {
    message: string;
    status?: number;
    code?: string;
    details?: ApiValidationDetail[];
  }) {
    super(opts.message);
    this.name = 'ApiRequestError';
    this.status = opts.status;
    this.code = opts.code;
    this.details = opts.details;
  }
}

function formatFieldLabel(field: string): string {
  const spaced = field.replace(/_/g, ' ').replace(/([A-Z])/g, ' $1').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Build a single user-facing string from backend `error` object. */
export function formatApiErrorPayload(
  error?: { message?: string; details?: ApiValidationDetail[] } | null
): string {
  if (!error) return '';

  const details = error.details;
  if (Array.isArray(details) && details.length > 0) {
    const parts = details.map((d) => {
      if (!d?.message) return '';
      return d.field ? `${formatFieldLabel(d.field)}: ${d.message}` : d.message;
    });
    const joined = parts.filter(Boolean).join(' · ');
    if (joined) return joined;
  }

  const msg = typeof error.message === 'string' ? error.message.trim() : '';
  return msg;
}

const STATUS_USER_MESSAGES: Record<number, string> = {
  400: 'We couldn’t process that request. Check your input and try again.',
  401: 'Please sign in again to continue.',
  403: 'You don’t have permission to do that.',
  404: 'We couldn’t find what you were looking for.',
  409: 'That conflicts with existing data. Refresh and try again.',
  422: 'Some information needs to be corrected.',
  429: 'Too many attempts. Please wait a moment and try again.',
  500: 'Something went wrong on our end. Please try again in a few minutes.',
  502: 'The server is temporarily unavailable. Please try again.',
  503: 'The service is temporarily unavailable. Please try again.',
};

function isGenericAxiosMessage(message: string): boolean {
  return /^Request failed with status code \d+$/i.test(message) || message === 'Network Error';
}

function messageFromAxiosData(data: unknown): { message: string; code?: string; details?: ApiValidationDetail[] } | null {
  if (!data || typeof data !== 'object') return null;
  const body = data as { error?: { message?: string; code?: string; details?: ApiValidationDetail[] } };
  const formatted = formatApiErrorPayload(body.error);
  if (formatted) {
    return {
      message: formatted,
      code: body.error?.code,
      details: body.error?.details,
    };
  }
  const topLevel = typeof (data as { message?: string }).message === 'string' ? (data as { message: string }).message.trim() : '';
  if (topLevel) return { message: topLevel };
  return null;
}

/** Turn an axios error into a structured error (used by the API client interceptor). */
export function fromAxiosError(err: AxiosError): ApiRequestError {
  const status = err.response?.status;
  const parsed = messageFromAxiosData(err.response?.data);
  let message = parsed?.message || '';
  if (!message && status != null && STATUS_USER_MESSAGES[status]) {
    message = STATUS_USER_MESSAGES[status];
  }
  if (!message && err.code === 'ERR_NETWORK') {
    message = 'Unable to reach the server. Check your internet connection and try again.';
  }
  if (!message && err.code === 'ECONNABORTED') {
    message = 'The request took too long. Please try again.';
  }
  if (!message && typeof err.message === 'string' && err.message && !isGenericAxiosMessage(err.message)) {
    message = err.message;
  }
  if (!message && status != null) {
    message = `Request failed (${status}). Please try again.`;
  }
  if (!message) {
    message = 'Something went wrong. Please try again.';
  }
  return new ApiRequestError({
    message,
    status,
    code: parsed?.code,
    details: parsed?.details,
  });
}

/** Normalize any thrown value to a clear message for UI (alerts, inline errors, toasts). */
export function getErrorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (err instanceof ApiRequestError) return err.message;
  if (isAxiosError(err)) {
    const fromBody = messageFromAxiosData(err.response?.data);
    if (fromBody?.message) return fromBody.message;
    const status = err.response?.status;
    if (status != null && STATUS_USER_MESSAGES[status]) return STATUS_USER_MESSAGES[status];
    if (err.code === 'ERR_NETWORK') {
      return 'Unable to reach the server. Check your internet connection and try again.';
    }
    if (err.code === 'ECONNABORTED') {
      return 'The request took too long. Please try again.';
    }
    if (typeof err.message === 'string' && err.message && !isGenericAxiosMessage(err.message)) {
      return err.message;
    }
    if (status != null) {
      return `Request failed (${status}). Please try again.`;
    }
    return fallback;
  }
  if (err instanceof Error && err.message && !isGenericAxiosMessage(err.message)) {
    return err.message;
  }
  if (typeof err === 'string' && err.trim()) return err.trim();
  return fallback;
}

/** Use after a successful HTTP response when the API uses `{ success, data, error }`. */
export function assertApiSuccess<T>(response: AxiosResponse<ApiResponse<T>>, fallback: string): T {
  const payload = response.data;
  if (payload.success && payload.data !== undefined && payload.data !== null) {
    return payload.data;
  }
  const msg = formatApiErrorPayload(payload.error) || fallback;
  throw new ApiRequestError({
    message: msg,
    details: payload.error?.details,
    code: payload.error?.code,
  });
}

/** For responses with `success: true` and no payload (e.g. DELETE). */
export function assertApiOk(response: AxiosResponse<ApiResponse<unknown>>, fallback: string): void {
  const payload = response.data;
  if (payload.success) return;
  const msg = formatApiErrorPayload(payload.error) || fallback;
  throw new ApiRequestError({
    message: msg,
    details: payload.error?.details,
    code: payload.error?.code,
  });
}

/** Parse JSON error body from a failed `fetch` (e.g. file download). */
export async function messageFromFailedFetchResponse(
  response: Response,
  fallback: string
): Promise<string> {
  try {
    const text = await response.clone().text();
    if (text) {
      try {
        const j = JSON.parse(text) as { error?: { message?: string; details?: ApiValidationDetail[] } };
        const m = formatApiErrorPayload(j.error);
        if (m) return m;
      } catch {
        const trimmed = text.trim();
        if (trimmed.length > 0 && trimmed.length < 240) return trimmed;
      }
    }
  } catch {
    /* ignore */
  }
  const status = response.status;
  if (status && STATUS_USER_MESSAGES[status]) return STATUS_USER_MESSAGES[status];
  return fallback;
}
