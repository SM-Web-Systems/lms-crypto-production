import axios, { AxiosInstance, isAxiosError } from "axios";
import { fromAxiosError } from "../utils/apiError";
import { toastError } from "../utils/toastBus";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api/v1";

/** Sent on every request. The API requires it for cookie-authenticated writes (CSRF protection). */
export const CSRF_HEADERS = { "X-LMS-CSRF": "1" } as const;

const api: AxiosInstance = axios.create({
  timeout: 15000,
  baseURL: API_BASE_URL,
  // The session token is an HttpOnly cookie set by the API.
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
    ...CSRF_HEADERS,
  },
});

/** fetch() options for authenticated downloads: send the session cookie and the CSRF header. */
export function authFetchInit(init: RequestInit = {}): RequestInit {
  return { ...init, credentials: "include", headers: { ...CSRF_HEADERS, ...(init.headers ?? {}) } };
}

let tokenGetter: (() => Promise<string | null>) | null = null;
const unauthorizedListeners = new Set<(token:string)=>void>();
export function onUnauthorized(listener:(token:string)=>void) {
  unauthorizedListeners.add(listener);
  return ()=>{unauthorizedListeners.delete(listener);};
}

/** Supplies the current session marker (not a credential); see AuthContext. */
export function setTokenGetter(getter: () => Promise<string | null>) {
  tokenGetter = getter;
}

/** The current session marker, or null when signed out. Not a credential. */
export async function getAuthToken(): Promise<string | null> {
  if (tokenGetter) {
    try {
      return await tokenGetter();
    } catch {
      return null;
    }
  }
  return null;
}

type MarkedConfig = { sessionMarker?: string | null };

api.interceptors.request.use(async (config) => {
  // Let the runtime set multipart boundary; default JSON Content-Type breaks FormData uploads
  if (typeof FormData !== "undefined" && config.data instanceof FormData) {
    delete config.headers["Content-Type"];
  }
  (config as typeof config & MarkedConfig).sessionMarker = await getAuthToken();
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (!isAxiosError(error)) {
      return Promise.reject(error);
    }
    const reqUrl = error.config?.url ?? "";
    const status = error.response?.status;
    const marker = (error.config as (typeof error.config & MarkedConfig) | undefined)?.sessionMarker;
    const explicitBearer = typeof error.config?.headers?.Authorization === 'string';
    const publicAuth = /\/auth\/(login|register|forgot-password|reset-password|session)(?:\?|$)/.test(reqUrl);
    if (status === 401 && !publicAuth && !explicitBearer && marker) {
      unauthorizedListeners.forEach(listener=>listener(marker));
    }
    // File downloads use responseType 'blob', so a JSON error body arrives as a Blob.
    const body: unknown = error.response?.data;
    if (error.response && body instanceof Blob && body.type.includes('json')) {
      try { error.response.data = JSON.parse(await body.text()); } catch { /* keep the status message */ }
    }
    const parsed = fromAxiosError(error);
    if (status === 429) {
      toastError(parsed.message);
    }
    return Promise.reject(parsed);
  },
);

export default api;
