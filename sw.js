/* =====================================================================
 * SERVICE WORKER
 * - "App shell" (HTML, JS, CSS, Leaflet, fuentes, iconos): se pide primero a
 *   internet (sin usar la caché del navegador, para no recibir versiones viejas)
 *   y se guarda; si no hay conexión o tarda más de 4 s, se usa la copia guardada.
 *   Así la tablet siempre muestra la última versión y arranca aunque no haya red.
 * - Teselas del mapa base (CARTO o Esri): se guardan (el mapa no cambia) para que
 *   el fondo aparezca aunque no haya internet.
 * - Datos de aviones y meteorología: SIEMPRE en vivo, nunca se cachean.
 *
 * Si cambias algún archivo de la app, sube el número de VERSION: la tablet lo
 * detecta (lo comprueba cada 30 min), descarga todo de nuevo y se recarga sola.
 * ===================================================================== */
const VERSION = 'v12';
const CACHE_APP = 'radar-app-' + VERSION;
const CACHE_MAPA = 'radar-mapa-v1';
const MAX_TESELAS = 400;

const APP_SHELL = [
  './', './index.html', './style.css', './app.js', './config.js', './manifest.webmanifest',
  './vendor/leaflet/leaflet.js', './vendor/leaflet/leaflet.css',
  './vendor/fonts/b612-400.woff2', './vendor/fonts/b612-700.woff2',
  './vendor/fonts/b612mono-400.woff2', './vendor/fonts/b612mono-700.woff2',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png',
];

self.addEventListener('install', (e) => {
  // cache: 'reload' = descargar de internet sí o sí, sin la caché HTTP del navegador
  // (GitHub Pages la deja 10 min; sin esto se podían mezclar archivos de dos versiones)
  e.waitUntil(
    caches.open(CACHE_APP)
      .then((c) => c.addAll(APP_SHELL.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
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

  // 1) Archivos de la propia app: primero internet (versión al día), si falla la copia guardada
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.open(CACHE_APP).then(async (cache) => {
        const deRed = new Promise((ok) => {
          const t = setTimeout(() => ok(null), 4000);           // sin respuesta en 4 s → copia guardada
          fetch(url.href, { cache: 'no-cache' })                 // 'no-cache' = pregunta al servidor si hay versión nueva
            .then((r) => { clearTimeout(t); if (r.ok) cache.put(req, r.clone()); ok(r.ok ? r : null); })
            .catch(() => { clearTimeout(t); ok(null); });
        });
        const r = await deRed;
        if (r) return r;
        const guardada = await cache.match(req, { ignoreSearch: true });
        if (guardada) return guardada;
        return req.mode === 'navigate' ? (await cache.match('./index.html')) || Response.error() : Response.error();
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
