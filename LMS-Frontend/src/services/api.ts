import axios, { AxiosInstance, isAxiosError } from "axios";
import { fromAxiosError } from "../utils/apiError";
import { toastError } from "../utils/toastBus";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api/v1";

const api: AxiosInstance = axios.create({
  timeout: 15000,
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

let tokenGetter: (() => Promise<string | null>) | null = null;
const unauthorizedListeners = new Set<(token:string)=>void>();
export function onUnauthorized(listener:(token:string)=>void) {
  unauthorizedListeners.add(listener);
  return ()=>{unauthorizedListeners.delete(listener);};
}

export function setTokenGetter(getter: () => Promise<string | null>) {
  tokenGetter = getter;
}

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

api.interceptors.request.use(async (config) => {
  // Let the runtime set multipart boundary; default JSON Content-Type breaks FormData uploads
  if (typeof FormData !== "undefined" && config.data instanceof FormData) {
    delete config.headers["Content-Type"];
  }
  if (tokenGetter) {
    try {
      const token = await tokenGetter();
      if (token && !config.headers.Authorization) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch {
      // Token retrieval failed; proceed without auth header
    }
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (!isAxiosError(error)) {
      return Promise.reject(error);
    }
    const reqUrl = error.config?.url ?? "";
    const status = error.response?.status;
    const authorization = error.config?.headers?.Authorization;
    const publicAuth = /\/auth\/(login|register|forgot-password|reset-password)(?:\?|$)/.test(reqUrl);
    if (status === 401 && !publicAuth && typeof authorization === 'string' && authorization.startsWith('Bearer ')) {
      unauthorizedListeners.forEach(listener=>listener(authorization.slice(7)));
    }
    const parsed = fromAxiosError(error);
    if (status === 429) {
      toastError(parsed.message);
    }
    return Promise.reject(parsed);
  },
);

export default api;
