/* =====================================================================
 * SERVICE WORKER
 * - "App shell" (HTML, JS, CSS, Leaflet, iconos): se sirve desde la caché
 *   para arrancar al instante y se actualiza en segundo plano.
 * - Teselas del mapa base (CARTO o Esri): se guardan (el mapa no cambia) para que
 *   el fondo aparezca aunque no haya internet.
 * - Datos de aviones y meteorología: SIEMPRE en vivo, nunca se cachean.
 *
 * Si cambias algún archivo de la app, sube el número de VERSION para
 * forzar que la tablet descargue la versión nueva.
 * ===================================================================== */
const VERSION = 'v9';
const CACHE_APP = 'radar-app-' + VERSION;
const CACHE_MAPA = 'radar-mapa-v1';
const MAX_TESELAS = 400;

const APP_SHELL = [
  './', './index.html', './style.css', './app.js', './config.js', './manifest.webmanifest',
  './vendor/leaflet/leaflet.js', './vendor/leaflet/leaflet.css',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_APP).then((c) => c.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  // Borra cachés de versiones anteriores
  e.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((k) => k.startsWith('radar-app-') && k !== CACHE_APP).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // 1) Archivos de la propia app: caché primero y actualización en segundo plano
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.open(CACHE_APP).then(async (cache) => {
        const enCache = await cache.match(req, { ignoreSearch: true });
        const red = fetch(req).then((r) => { if (r.ok) cache.put(req, r.clone()); return r; }).catch(() => null);
        if (enCache) { e.waitUntil(red); return enCache; }
        return (await red) || (req.mode === 'navigate' ? cache.match('./index.html') : Response.error());
      })
    );
    return;
  }

  // 2) Teselas del mapa base: caché primero; si no está, red y se guarda
  if (url.hostname.endsWith('basemaps.cartocdn.com') || url.hostname === 'server.arcgisonline.com') {
    e.respondWith(
      caches.open(CACHE_MAPA).then(async (cache) => {
        const enCache = await cache.match(req);
        if (enCache) return enCache;
        const r = await fetch(req);
        if (r.ok || r.type === 'opaque') {
          cache.put(req, r.clone());
          // Limita el tamaño de la caché de teselas
          cache.keys().then((k) => { if (k.length > MAX_TESELAS) k.slice(0, k.length - MAX_TESELAS).forEach((x) => cache.delete(x)); });
        }
        return r;
      })
    );
  }
  // 3) Todo lo demás (aviones, tiempo, lluvia): directo a la red, sin caché
});
