/* =========================================================
   MUZURI — SERVICE WORKER
   1) Met l'appli en cache pour qu'elle marche même en mode avion
   2) Gère les notifications push (comme avant)
   ========================================================= */

const CACHE_NAME = "muzuri-cache-v1";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable.png",
  "./apple-touch-icon.png"
];

/* À l'installation : on télécharge et on garde une copie de l'appli */
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(APP_SHELL).catch(() => {
        /* Si un fichier de la liste manque (icône renommée, etc.), on ne bloque pas
           tout le cache pour autant — on met en cache ce qu'on peut. */
        return Promise.allSettled(APP_SHELL.map((url) => cache.add(url)));
      });
    })
  );
});

/* Nettoyage des anciennes versions du cache lors d'une mise à jour */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

/* Stratégie "cache d'abord, réseau en secours" :
   Hors-ligne (mode avion) -> l'appli se charge quand même depuis le cache.
   En ligne -> on sert le cache tout de suite (rapide), et on met à jour
   discrètement le cache en arrière-plan pour la prochaine fois. */
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached); /* pas de réseau -> on garde ce qu'on avait en cache */

      return cached || networkFetch;
    })
  );
});

/* ---------- Notifications push (inchangé) ---------- */
self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(self.registration.showNotification(data.title || "Muzuri", {
    body: data.body || "Vous avez un rappel.",
    icon: data.icon, badge: data.icon,
    vibrate: [200, 100, 200],
    data: { url: data.url || "/" }
  }));
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data?.url || "/"));
});
