/* LMS service worker: Web Push only. It deliberately does not cache pages or API data. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let message = {};
  try { message = event.data ? event.data.json() : {}; } catch { message = {}; }
  const title = typeof message.title === 'string' ? message.title : 'LMS update';
  const body = typeof message.body === 'string' ? message.body : 'You have a new LMS notification. Open the app to view it.';
  const url = typeof message.url === 'string' && /^\/(?!\/)/.test(message.url) ? message.url : '/';
  // iOS requires every push to show a notification, or it revokes the subscription.
  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: '/icons/app-192.png',
    badge: '/icons/app-192.png',
    tag: typeof message.notificationId === 'string' ? message.notificationId : undefined,
    data: { url },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if (new URL(client.url).origin === self.location.origin && 'focus' in client) {
        await client.focus();
        if ('navigate' in client) await client.navigate(url).catch(() => {});
        return;
      }
    }
    await self.clients.openWindow(url);
  })());
});
