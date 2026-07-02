import axios, { AxiosInstance, isAxiosError } from 'axios';
import { fromAxiosError } from '../utils/apiError';

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL || 'http://localhost:3001/api/v1';

const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

let tokenGetter: (() => Promise<string | null>) | null = null;

/** AuthProvider injects the stored-JWT getter here so services stay auth-agnostic. */
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
  // Let the runtime set the multipart boundary; a default JSON Content-Type breaks uploads.
  if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
    delete config.headers['Content-Type'];
  }
  if (tokenGetter) {
    try {
      const token = await tokenGetter();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch {
      // Proceed without auth header; the server will return 401 if required.
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
    // The auth context drives navigation off the stored session, so we just
    // surface a structured error here rather than forcing a redirect.
    return Promise.reject(fromAxiosError(error));
  }
);

export default api;
