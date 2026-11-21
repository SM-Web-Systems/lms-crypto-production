import api from './api';
import { getStoredToken } from '../context/AuthContext';

/** Download an authenticated file with the current session and save it as `filename`. */
export async function downloadWithSession(path: string, filename: string, params?: Record<string, string>) {
  const token = getStoredToken(); // session marker, not a credential; the cookie authenticates
  if (!token) throw new Error('Please sign in to download this file.');

  const { data } = await api.get<Blob>(path, {
    params,
    responseType: 'blob',
  });
  if (getStoredToken() !== token) throw new Error('Your session changed. Try the download again.');

  const url = URL.createObjectURL(data);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
