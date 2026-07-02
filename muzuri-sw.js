/* =========================================================
   MUZURI — SERVICE WORKER
   1) Cache hors-ligne : l'app s'ouvre instantanément, même en avion
   2) Notifications push (VAPID) : rappels même app fermée
   ========================================================= */
const CACHE = "muzuri-v1";
const PRECACHE = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable.png",
  "./apple-touch-icon.png"
];

/* ---- Installation : pré-cache du cœur de l'app ---- */
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

/* ---- Activation : purge des vieux caches ---- */
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* ---- Stratégie réseau ----
   Pages/app : cache d'abord (instantané), mise à jour en arrière-plan.
   CDN (Tesseract, polices) : cache au premier passage puis hors-ligne.
   Supabase & API : toujours réseau (jamais mis en cache). */
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  if (url.hostname.includes("supabase.co") || url.hostname.includes("googleapis.com")) return;

  e.respondWith(
    caches.match(e.request).then((cached) => {
      const fetched = fetch(e.request)
        .then((resp) => {
          if (resp && resp.status === 200 && (url.origin === location.origin || url.hostname.includes("jsdelivr.net") || url.hostname.includes("gstatic.com") || url.hostname.includes("fonts.googleapis.com"))) {
            const clone = resp.clone();
            caches.open(CACHE).then((c) => c.put(e.request, clone));
          }
          return resp;
        })
        .catch(() => cached);
      return cached || fetched;
    })
  );
});

/* ---- Push : notification reçue du serveur (Edge Function + VAPID) ---- */
self.addEventListener("push", (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch (_) { data = { body: e.data && e.data.text() }; }
  const title = data.title || "Muzuri 🚀";
  e.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "Vous avez un rappel.",
      icon: "./icon-192.png",
      badge: "./icon-192.png",
      vibrate: [200, 100, 200],
      data: { url: data.url || "./index.html" }
    })
  );
});

/* ---- Clic sur la notification : ouvrir/refocaliser l'app ---- */
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) { if ("focus" in c) return c.focus(); }
      return clients.openWindow(e.notification.data?.url || "./index.html");
    })
  );
});
