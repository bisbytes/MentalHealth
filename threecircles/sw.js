// Three Circles service worker: works offline and shows check-in reminders.
const CACHE = "three-circles-v2";
const SHELL = ["./", "index.html", "config.js", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png", "icons/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network first, so updates show up; the cache keeps the app working offline.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const cacheable = url.origin === location.origin || /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!cacheable) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match("./")))
  );
});

const ZONES = { red: "Red", drive: "Drive", green: "Green" };

// Check-ins made from a notification wait here until the app next opens,
// because a service worker can't reach the app's localStorage.
function pendingStore(mode, fn) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open("three-circles", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("pending", { keyPath: "id" });
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction("pending", mode);
      fn(tx.objectStore("pending"));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    };
  });
}

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) {}
  const options = {
    body: data.body || "Which circle are you in right now?",
    icon: "icons/icon-192.png",
    badge: "icons/icon-192.png",
    tag: "check-in",
    renotify: true,
    data: { url: self.registration.scope + "#checkin" },
  };
  // Phones that show three action buttons get one per circle; elsewhere a tap opens the app.
  if ((self.Notification && Notification.maxActions) >= 3) {
    options.actions = Object.keys(ZONES).map((z) => ({ action: z, title: ZONES[z] }));
  }
  event.waitUntil(self.registration.showNotification(data.title || "Three Circles", options));
});

function openApp(url, message) {
  return self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
    const win = wins.find((w) => w.url.startsWith(self.registration.scope));
    if (win) { win.postMessage(message); return win.focus(); }
    return self.clients.openWindow(url);
  });
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const zone = event.action;
  if (ZONES[zone]) {
    const at = new Date();
    const entry = { id: at.getTime().toString(36) + Math.random().toString(36).slice(2, 8), zone, at: at.toISOString(), note: "" };
    event.waitUntil(
      pendingStore("readwrite", (store) => store.put(entry))
        .then(() => self.clients.matchAll({ type: "window", includeUncontrolled: true }))
        .then((wins) => wins.forEach((w) => w.postMessage({ type: "pending" })))
        .then(() => self.registration.showNotification("Saved: " + ZONES[zone], {
          body: "Checked in at " + at.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) + ".",
          icon: "icons/icon-192.png",
          badge: "icons/icon-192.png",
          tag: "check-in",
          silent: true,
          data: { url: self.registration.scope + "#history" },
        }))
    );
    return;
  }
  const url = (event.notification.data && event.notification.data.url) || self.registration.scope + "#checkin";
  event.waitUntil(openApp(url, { type: url.endsWith("#history") ? "history" : "checkin" }));
});
