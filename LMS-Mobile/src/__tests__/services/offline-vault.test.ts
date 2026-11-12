import * as SecureStore from 'expo-secure-store';
import {openDatabaseAsync} from 'expo-sqlite';
import {offlineLearning, setOfflineSession} from '@/services/offlineLearningNative';

const mockDatabase = {
  getFirstAsync: jest.fn().mockResolvedValue(null),
  execAsync: jest.fn(),
  runAsync: jest.fn(),
  closeAsync: jest.fn().mockResolvedValue(undefined),
};
const mockPost = jest.fn();

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {expoConfig: {extra: {encryptedOfflineLearning: true}}},
  ExecutionEnvironment: {StoreClient: 'storeClient'},
}));
jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(async () => mockDatabase),
  deleteDatabaseAsync: jest.fn(async () => undefined),
}));
jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: {SHA256: 'SHA-256'},
  digestStringAsync: jest.fn(async () => 'a'.repeat(64)),
  getRandomBytesAsync: jest.fn(async () => new Uint8Array(32)),
  randomUUID: jest.fn(() => '12345678-1234-4234-8234-123456789012'),
}));
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(async () => undefined),
}));
jest.mock('@/lib/api', () => ({
  __esModule: true, API_BASE_URL: 'https://example.invalid/api/v1', default: {post: (...args: unknown[]) => mockPost(...args)},
}));

it('refuses to create a plaintext cache when SQLCipher is unavailable', async () => {
  mockPost.mockResolvedValueOnce({data: {success: true, data: {
    leaseId: 'lease', contentVersion: 'version', serverTime: 100_000, expiresAt: 160_000,
    course: {id: 'course', title: 'Course', sections: [{id: 's', items: [{id: 't', type: 'text', information: 'Private'}]}]},
    progress: [],
  }}});
  await setOfflineSession('test-token', true);
  await expect(offlineLearning.download('course')).rejects.toThrow('encrypted lessons');
  expect(openDatabaseAsync).toHaveBeenCalledTimes(1);
  expect(mockDatabase.getFirstAsync).toHaveBeenCalledWith('PRAGMA cipher_version');
  expect(mockDatabase.execAsync).not.toHaveBeenCalled();
  expect(mockDatabase.runAsync).not.toHaveBeenCalled();
  expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  expect(mockDatabase.closeAsync).toHaveBeenCalledTimes(1);
  await setOfflineSession(null);
});

it('says the device is out of storage when the encrypted store cannot be written', async () => {
  const {STORAGE_FULL_MESSAGE} = jest.requireActual('@/utils/storageErrors');
  mockDatabase.getFirstAsync.mockResolvedValueOnce({cipher_version: '4.6.0'});
  mockDatabase.execAsync.mockRejectedValueOnce(new Error('database or disk is full (code 13 SQLITE_FULL)'));
  mockPost.mockResolvedValueOnce({data: {success: true, data: {
    leaseId: 'lease', contentVersion: 'version', serverTime: 100_000, expiresAt: 160_000,
    course: {id: 'course', title: 'Course', sections: [{id: 's', items: [{id: 't', type: 'text', information: 'Text'}]}]},
  }}});
  await setOfflineSession('test-token', true);
  await expect(offlineLearning.download('course')).rejects.toThrow(STORAGE_FULL_MESSAGE);
});
