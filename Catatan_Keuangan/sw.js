/* Service Worker — membuat aplikasi bisa dibuka tanpa internet */
importScripts('version.js');
const CACHE = 'ck-' + self.APP_VERSION.v;
const ASSETS = [
  './',
  'index.html',
  'style.css',
  'app.js',
  'version.js',
  'config.js',
  'manifest.json',
  'lib/chart.umd.min.js',
  'lib/html2canvas.min.js',
  'lib/jspdf.umd.min.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' }))))
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('ck-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // Google Apps Script dll. langsung ke jaringan

  // Di server lokal: ambil versi terbaru dulu, cache hanya cadangan saat offline
  if (['localhost', '127.0.0.1'].includes(location.hostname)) {
    e.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req.mode === 'navigate' ? 'index.html' : req, copy));
        return res;
      }).catch(() => caches.match(req.mode === 'navigate' ? 'index.html' : req, { ignoreSearch: true }))
    );
    return;
  }

  if (req.mode === 'navigate') {
    e.respondWith(caches.match('index.html').then((r) => r || fetch(req)));
    return;
  }
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((r) => r || fetch(req))
  );
});
