// Service worker de Helios Fantasy: permite instalar la app. Siempre intenta la red primero (así ves la última versión)
// y solo usa la copia guardada si no hay conexión. No toca Firebase ni nada de otros dominios.
const CACHE = 'helios-v1';
self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== self.location.origin) return;
  e.respondWith(
    fetch(r).then((res) => {
      if (res && res.ok) { const c = res.clone(); caches.open(CACHE).then((x) => x.put(r, c)).catch(() => {}); }
      return res;
    }).catch(() => caches.match(r).then((m) => m || (r.mode === 'navigate' ? caches.match('./') : undefined) || Response.error()))
  );
});
