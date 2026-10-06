/* Enzi Admin service worker — order alerts.
 *
 * Deliberately no offline caching: the admin shows live stock and payments, and
 * a stale cached screen there does more harm than a "you're offline" error.
 * This worker only receives push messages and opens the right screen on tap.
 */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Enzi Admin", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "Enzi Admin";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-96.png",
      tag: data.tag || undefined,
      // Re-alert even if an older notification with the same tag is still showing.
      renotify: Boolean(data.tag),
      // Stays on screen until someone acts on it — a new order shouldn't
      // quietly slide away while everyone's busy at the counter.
      requireInteraction: true,
      vibrate: [250, 120, 250, 120, 500],
      timestamp: Date.now(),
      data: { url: data.url || "/orders" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/orders", self.location.origin).href;

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // Reuse an open admin window rather than stacking new ones.
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin) {
          await client.focus();
          if ("navigate" in client) return client.navigate(target);
          return;
        }
      }
      return self.clients.openWindow(target);
    })()
  );
});
