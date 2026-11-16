/**
 * Web Push for the home-screen web app (iPhone/iPad iOS 16.4+, Android, desktop).
 * On iPhone, Safari only offers push to a site that was added to the Home Screen and opened from there.
 */
import api from '../services/api';

export type WebPushStatus =
  | 'unsupported'      // this browser has no Web Push at all
  | 'needs-home-screen' // iPhone/iPad in a Safari tab: add to Home Screen first
  | 'server-off'       // the LMS server has no VAPID keys configured
  | 'denied'           // the person blocked notifications for this app
  | 'available'        // ready to ask
  | 'enabled';         // subscribed on this device

export function isIos(): boolean {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
}
export function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches === true;
}
function hasPushApis(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  try { return await navigator.serviceWorker.register('/sw.js', { scope: '/' }); } catch { return null; }
}

async function serverKey(): Promise<string | null> {
  const res = await api.get('/notifications/push/web/config');
  const data = res.data?.data as { enabled?: boolean; publicKey?: string | null } | undefined;
  return data?.enabled && data.publicKey ? data.publicKey : null;
}
function keyBytes(base64url: string): Uint8Array {
  const padded = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded); const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.getRegistration('/');
  return reg ? reg.pushManager.getSubscription() : null;
}

export async function getWebPushStatus(): Promise<WebPushStatus> {
  if (isIos() && !isStandalone()) return 'needs-home-screen';
  if (!hasPushApis()) return 'unsupported';
  if (!(await serverKey().catch(() => null))) return 'server-off';
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission === 'granted' && (await currentSubscription())) return 'enabled';
  return 'available';
}

/** Must be called from a tap: iOS only shows the permission prompt in response to a user gesture. */
export async function enableWebPush(): Promise<WebPushStatus> {
  if (isIos() && !isStandalone()) return 'needs-home-screen';
  if (!hasPushApis()) return 'unsupported';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'available';
  const key = await serverKey();
  if (!key) return 'server-off';
  const reg = (await registerServiceWorker()) ?? (await navigator.serviceWorker.ready);
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) as BufferSource });
  await api.put('/notifications/push/web/subscription', sub.toJSON());
  return 'enabled';
}

export async function disableWebPush(): Promise<WebPushStatus> {
  const sub = hasPushApis() ? await currentSubscription() : null;
  if (sub) {
    await api.post('/notifications/push/web/unsubscribe', { endpoint: sub.endpoint }).catch(() => undefined);
    await sub.unsubscribe().catch(() => false);
  }
  return getWebPushStatus();
}

export async function sendTestPush(): Promise<void> {
  await api.post('/notifications/push/web/test');
}

/** Renews this device's binding to the current sign-in. Silent and best effort; never prompts. */
export async function resyncWebPush(): Promise<void> {
  try {
    if (!hasPushApis() || Notification.permission !== 'granted') return;
    const sub = await currentSubscription();
    if (sub) await api.put('/notifications/push/web/subscription', sub.toJSON());
  } catch { /* Offline or push not configured: the next app open retries. */ }
}
