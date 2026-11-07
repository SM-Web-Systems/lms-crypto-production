import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';
import api, { API_BASE_URL } from '../lib/api';
import type { ApiResponse } from '../types/api';
import { ApiRequestError, assertApiSuccess } from '../utils/apiError';
import type { LessonProgress } from './courseCompletionService';
import { OfflineLearning, type LeaseStatus, type OfflinePackage, type OfflineStore, type SavedCourse } from './offlineLearning';
import { offlineSQLite as sqlite } from './offlineSQLite';

export const supportsOfflineLearning = (Platform.OS === 'android' || Platform.OS === 'ios')
  && Constants.executionEnvironment !== ExecutionEnvironment.StoreClient
  && Constants.expoConfig?.extra?.encryptedOfflineLearning === true;

const fingerprint = (value: string) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value);
const storageKey = async () => 'lms.offline.v1.' + await fingerprint(API_BASE_URL);
const options = {keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY};
const path = (courseId: string) => '/courses/' + encodeURIComponent(courseId) + '/offline-';
const auth = (token: string) => ({headers: {Authorization: 'Bearer ' + token}});
const vaultError = 'Could not open or save encrypted lessons on this device.';
const hex = /^[a-f0-9]{64}$/;
const fileName = /^lms-offline-[a-f0-9-]{36}\.db$/;

interface Metadata {scope: string; key: string; file: string}
let active: {scope: string; db: SQLiteDatabase} | null = null;

async function metadata(): Promise<Metadata | null> {
  const raw = await SecureStore.getItemAsync(await storageKey(), options);
  if (raw === null) return null;
  const value = JSON.parse(raw) as Metadata | null;
  if (!value || typeof value.scope !== 'string' || !hex.test(value.scope)
    || typeof value.key !== 'string' || !hex.test(value.key)
    || typeof value.file !== 'string' || !fileName.test(value.file)) throw new Error(vaultError);
  return value;
}

async function clear() {
  let previous: Metadata | null = null;
  try { previous = await metadata(); } catch { /* Erase the key even if its metadata is unreadable. */ }
  await SecureStore.deleteItemAsync(await storageKey(), options);
  const db = active?.db;
  active = null;
  await db?.closeAsync().catch(() => undefined);
  if (previous) await sqlite().deleteDatabaseAsync(previous.file).catch(() => undefined);
}

function repository(db: SQLiteDatabase): OfflineStore {
  const setting = async (name: string) =>
    (await db.getFirstAsync<{value: string}>('SELECT value FROM settings WHERE name = ?', name))?.value ?? null;
  const set = async (name: string, value: string) => {
    await db.runAsync('INSERT INTO settings(name,value) VALUES (?,?) ON CONFLICT(name) DO UPDATE SET value=excluded.value', name, value);
  };
  const decode = (row: {data: string}) => JSON.parse(row.data) as SavedCourse;
  return {
    list: async () => (await db.getAllAsync<{data: string}>('SELECT data FROM courses ORDER BY id')).map(decode),
    get: async id => {
      const row = await db.getFirstAsync<{data: string}>('SELECT data FROM courses WHERE id = ?', id);
      return row ? decode(row) : null;
    },
    save: async (course, notice) => {
      const upsert = async () => {
        await db.runAsync('INSERT INTO courses(id,data) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',
          course.pack.course.id, JSON.stringify(course));
      };
      try {
        if (notice === undefined) await upsert();
        else await db.withTransactionAsync(async () => {
          await upsert();
          await set('notice', notice);
        });
      } catch { throw new Error('Could not save the offline update. Check available device storage and try again.'); }
    },
    discard: async (id, notice) => {
      await db.withTransactionAsync(async () => {
        await db.runAsync('DELETE FROM courses WHERE id = ?', id);
        await set('notice', notice);
      });
    },
    notice: () => setting('notice'),
    clock: async () => Number(await setting('wall-clock')),
    setClock: now => set('wall-clock', String(now)),
  };
}

async function open(scope: string, create: boolean, verified: boolean) {
  if (active?.scope === scope) return repository(active.db);
  let config = await metadata();
  if (config && config.scope !== scope) {
    if (!verified) return null;
    await clear();
    config = null;
  }
  if (!config && !create) return null;
  const fresh = !config;
  if (!config) {
    const random = await Crypto.getRandomBytesAsync(32);
    const key = Array.from(random, byte => byte.toString(16).padStart(2, '0')).join('');
    config = {scope, key, file: 'lms-offline-' + Crypto.randomUUID() + '.db'};
  }
  let db: SQLiteDatabase | undefined;
  try {
    db = await sqlite().openDatabaseAsync(config.file, {useNewConnection: true});
    const cipher = await db.getFirstAsync<{cipher_version: string}>('PRAGMA cipher_version');
    if (!cipher?.cipher_version) throw new Error(vaultError);
    // The only interpolated value is a generated or validated 32-byte hex key.
    await db.execAsync(`PRAGMA key = "x'${config.key}'";`);
    await db.getFirstAsync('SELECT COUNT(*) FROM sqlite_master');
    await db.execAsync(`
      PRAGMA journal_mode=DELETE;
      PRAGMA temp_store=MEMORY;
      PRAGMA secure_delete=ON;
      CREATE TABLE IF NOT EXISTS courses (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS settings (name TEXT PRIMARY KEY, value TEXT NOT NULL);
    `);
    if (fresh) await SecureStore.setItemAsync(await storageKey(), JSON.stringify(config), options);
    active = {scope, db};
    return repository(db);
  } catch {
    await db?.closeAsync().catch(() => undefined);
    if (fresh && db) await sqlite().deleteDatabaseAsync(config.file).catch(() => undefined);
    throw new Error(vaultError);
  }
}

export const offlineLearning = new OfflineLearning({
  open, clear, fingerprint, id: () => Crypto.randomUUID(), now: () => Date.now(),
  download: async (token, id) => assertApiSuccess(
    await api.post<ApiResponse<OfflinePackage>>(path(id) + 'lease', undefined, auth(token)), 'Could not save this course.',
  ),
  inspect: async (token, id, leaseId) => assertApiSuccess(
    await api.get<ApiResponse<LeaseStatus>>(path(id) + 'lease/' + encodeURIComponent(leaseId), auth(token)), 'Could not verify offline access.',
  ),
  submit: async (token, id, operation) => assertApiSuccess(
    await api.put<ApiResponse<LessonProgress>>(path(id) + 'progress', operation, auth(token)), 'Could not sync offline progress.',
  ),
  rejection: error => {
    if (!(error instanceof ApiRequestError)) return null;
    if (error.status === 403 || error.status === 404 || error.code === 'OFFLINE_UNAVAILABLE') {
      return 'Offline access was withdrawn. The course and its pending updates were removed.';
    }
    if (error.status === 409) return 'The offline lease or course changed. Pending updates were discarded. Save the course again.';
    return null;
  },
});

export function setOfflineSession(token: string | null, verified = false) {
  return supportsOfflineLearning ? offlineLearning.setSession(token, verified) : Promise.resolve(true);
}
