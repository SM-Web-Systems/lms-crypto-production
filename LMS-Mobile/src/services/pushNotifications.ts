import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { DevicePushToken } from 'expo-notifications';
import api, { API_BASE_URL } from '../lib/api';
import type { ApiResponse } from '../types/api';
import { ApiRequestError, assertApiSuccess } from '../utils/apiError';
import { notificationIdPattern, PushLifecycle } from './pushLifecycle';

export const pushChannel = 'lms-updates';
const projectId = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
export const supportsNativePush = (Platform.OS === 'android' || Platform.OS === 'ios')
  && Constants.executionEnvironment !== ExecutionEnvironment.StoreClient
  && typeof projectId === 'string' && notificationIdPattern.test(projectId);

const hash = (value: string) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value);
const secureOptions = {keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY};
// Separate credentials and generations for builds connected to different LMS environments.
const storageKey = () => hash(API_BASE_URL).then(value => 'lms.push.v1.' + value);
const auth = (jwt: string) => ({headers: {Authorization: 'Bearer ' + jwt}, timeout: 8000});

// Load the native module only after the runtime and project checks.
export function loadNativeNotifications(): typeof import('expo-notifications') {
  return require('expo-notifications');
}

// The app only ever shows LMS push notifications, so a fence clears all of them. Notifications the
// system presented while the app was in the background may not carry their data payload here, so
// filtering on that payload left them in the tray after sign-out.
export async function dismissStaleNotifications(revision: number) {
  const notifications = loadNativeNotifications();
  if (revision !== pushNotifications.getSnapshot().revision) return;
  await notifications.dismissAllNotificationsAsync();
  if (revision === pushNotifications.getSnapshot().revision) {
    notifications.clearLastNotificationResponse();
  }
}

export const pushNotifications = new PushLifecycle<DevicePushToken>({
  read: async () => SecureStore.getItemAsync(await storageKey(), secureOptions),
  write: async value => SecureStore.setItemAsync(await storageKey(), value, secureOptions),
  createIdentity: async () => {
    const bytes = await Crypto.getRandomBytesAsync(32);
    return {
      installationId: Crypto.randomUUID(),
      credential: Array.from(bytes, value => value.toString(16).padStart(2, '0')).join(''),
    };
  },
  hash,
  configured: async jwt => {
    if (Platform.OS === 'android' && !Constants.expoConfig?.extra?.androidPushConfigured) return null;
    const config = assertApiSuccess(await api.get<ApiResponse<{enabled: boolean; projectId: string | null}>>(
      '/notifications/push/config', auth(jwt),
    ), 'Push notifications are unavailable.');
    return config.enabled && config.projectId === projectId ? config.projectId : null;
  },
  permission: async prompt => {
    const notifications = loadNativeNotifications();
    if (Platform.OS === 'android') {
      await notifications.setNotificationChannelAsync(pushChannel, {
        name: 'LMS updates',
        importance: notifications.AndroidImportance.DEFAULT,
      });
    }
    const allowed = (permission: Awaited<ReturnType<typeof notifications.getPermissionsAsync>>) =>
      permission.granted || permission.ios?.status === notifications.IosAuthorizationStatus.PROVISIONAL;
    const permission = await notifications.getPermissionsAsync();
    if (allowed(permission)) return true;
    return prompt && permission.canAskAgain && allowed(await notifications.requestPermissionsAsync());
  },
  expoToken: async (id, devicePushToken) => {
    const notifications = loadNativeNotifications();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        notifications.getExpoPushTokenAsync({projectId: id, devicePushToken}),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('Push registration timed out')), 15000);
        }),
      ]);
      return result.data;
    } finally {
      clearTimeout(timer);
    }
  },
  register: async (jwt, installation, id, expoToken) => {
    assertApiSuccess(await api.put<ApiResponse<{generation: number}>>('/notifications/push/installation',
      {...installation, projectId: id, expoToken, platform: Platform.OS}, auth(jwt),
    ), 'Could not enable push notifications.');
  },
  unregister: async installation => {
    assertApiSuccess(await api.post<ApiResponse<{generation: number}>>('/notifications/push/unregister',
      installation, {headers: {Authorization: false}, timeout: 5000},
    ), 'Could not turn off push notifications.');
  },
  stale: error => error instanceof ApiRequestError && error.code === 'STALE_INSTALLATION',
  dismiss: () => {
    void dismissStaleNotifications(pushNotifications.getSnapshot().revision).catch(() => undefined);
  },
});

export function setPushSession(ownerId: string | null, token?: string) {
  return supportsNativePush ? pushNotifications.setSession(ownerId, token) : Promise.resolve(true);
}

export interface NotificationDetail {
  id: string;
  title: string;
  body: string;
  link: string | null;
  read: number;
}

export async function readPushNotification(id: string) {
  if (!notificationIdPattern.test(id)) throw new Error('This notification is unavailable.');
  return pushNotifications.withSession(async jwt => {
    const result = assertApiSuccess(await api.get<ApiResponse<{notification: NotificationDetail}>>(
      '/notifications/' + id, auth(jwt),
    ), 'Could not open this notification.');
    if (result.notification.id !== id) throw new Error('This notification is unavailable.');
    return result.notification;
  });
}

export async function markPushNotificationRead(id: string) {
  if (!notificationIdPattern.test(id)) return;
  await pushNotifications.withSession(jwt => api.put('/notifications/' + id + '/read', undefined, auth(jwt)));
}
