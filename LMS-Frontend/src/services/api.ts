import axios, { AxiosInstance, isAxiosError } from "axios";
import { fromAxiosError } from "../utils/apiError";
import { toastError } from "../utils/toastBus";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api/v1";

const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

let tokenGetter: (() => Promise<string | null>) | null = null;

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
      if (token) {
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
    // Don't hard-redirect on auth endpoints: the auth context handles those errors
    // (showing form messages / clearing the session) and a redirect here would loop.
    const status = error.response?.status;
    if (status === 401) {
      const skipRedirect =
        reqUrl.includes("/auth/login") ||
        reqUrl.includes("/auth/me");
      if (!skipRedirect) {
        window.location.href = "/login";
      }
    }
    const parsed = fromAxiosError(error);
    if (status === 429) {
      toastError(parsed.message);
    }
    return Promise.reject(parsed);
  },
);

export default api;
