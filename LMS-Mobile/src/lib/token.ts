import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const TOKEN_KEY = 'lms_token';
let memory: string | null | undefined;
let reading: Promise<string | null> | null = null;
let revision = 0;
let writing: Promise<void> = Promise.resolve();
function persist(work: () => Promise<void>): Promise<void> {
  const next = writing.then(work);
  writing = next.catch(() => undefined);
  return next;
}

export async function getStoredToken(): Promise<string | null> {
  if (memory !== undefined) return memory;
  if (reading) return reading;
  const started = revision;
  reading = (async () => {
    // SecureStore has no web implementation. The preview uses tab-scoped storage.
    const token = Platform.OS === 'web' ? sessionStorage.getItem(TOKEN_KEY) : await SecureStore.getItemAsync(TOKEN_KEY);
    if (revision === started) memory = token;
    return memory ?? null;
  })().finally(() => { reading = null; });
  return reading;
}

/** Keep the live session usable even if persistence is unavailable. */
export async function setStoredToken(token: string): Promise<boolean> {
  revision++; memory = token;
  try {
    await persist(async () => {
      if (Platform.OS === 'web') sessionStorage.setItem(TOKEN_KEY, token);
      else await SecureStore.setItemAsync(TOKEN_KEY, token);
    });
    return true;
  } catch { return false; }
}

export async function clearStoredToken(): Promise<void> {
  revision++; memory = null;
  await persist(async () => {
    if (Platform.OS === 'web') sessionStorage.removeItem(TOKEN_KEY);
    else await SecureStore.deleteItemAsync(TOKEN_KEY);
  });
}
