// Amma Wallet Service Worker
const CACHE_NAME = "amma-v1";

// Install event
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

// Activate event
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Push notification handler
self.addEventListener("push", (event) => {

  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: "Amma Wallet", body: event.data.text() };
  }

  const options = {
    body: data.body || "",
    icon: data.icon || "/icon-192.png",
    badge: data.badge || "/icon-192.png",
    vibrate: [100, 50, 100],
    data: data.data || {},
    actions: data.actions || [],
    tag: data.tag || "amma-notification",
    renotify: true,
  };

  event.waitUntil(
    self.registration.showNotification(data.title || "Amma Wallet", options)
  );
});

// Notification click handler
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // Focus existing window or open new one
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
