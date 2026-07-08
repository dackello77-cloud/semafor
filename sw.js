const CACHE_NAME = "semafor-pwa-v3";
const APP_SHELL = [
  "./",
  "./index.html",
  "./index.html?source=pwa",
  "./customer.html",
  "./css/styles.css",
  "./css/customer.css",
  "./js/app.js",
  "./js/supabase.js",
  "./manifest.webmanifest",
  "./assets/app-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request).catch(() =>
      caches.match(event.request).then((cached) => cached || caches.match("./index.html")),
    ),
  );
});

self.addEventListener("push", (event) => {
  let payload = {};

  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {
      title: "Semafor",
      body: event.data?.text() || "New update",
    };
  }

  const title = payload.title || "Semafor";
  const options = {
    body: payload.body || "New update",
    badge: payload.badge || "./assets/app-icon.png",
    icon: payload.icon || "./assets/app-icon.png",
    data: {
      url: payload.url || "./index.html",
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = event.notification.data?.url || "./index.html";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existingClient = clients.find((client) => "focus" in client);

      if (existingClient) {
        existingClient.focus();
        return;
      }

      return self.clients.openWindow(url);
    }),
  );
});
