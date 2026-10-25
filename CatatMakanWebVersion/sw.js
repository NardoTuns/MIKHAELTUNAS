// Service worker Catat Makan: aplikasi tetap terbuka tanpa internet & pembaruan lewat tombol Update.
// Baris CACHE dan ASSETS dibuat otomatis oleh `node tools/build-sw.mjs` — jalankan setiap kali mengubah file.
const CACHE = 'catatmakan-2.0.0-a05e268b46';
const ASSETS = ["./","css/app.css","icons/apple-touch-icon.png","icons/badge-96.png","icons/favicon.svg","icons/icon-192.png","icons/icon-512.png","icons/maskable-512.png","index.html","js/app.js","js/config.js","js/core/aicoach.js","js/core/analyzer.js","js/core/db.js","js/core/fooddb.js","js/core/nutrition.js","js/core/online.js","js/core/period.js","js/core/quicklog.js","js/core/reminders.js","js/core/report.js","js/core/stats.js","js/core/sync.js","js/core/util.js","js/state.js","js/ui/analysis.js","js/ui/calc.js","js/ui/charts.js","js/ui/dom.js","js/ui/foodform.js","js/ui/history.js","js/ui/home.js","js/ui/progress.js","js/ui/settings.js","js/ui/users.js","manifest.webmanifest","vendor/jspdf.umd.min.js","vendor/zxing.min.js","version.json"];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS.map((a) => new Request(a, { cache: 'reload' })))));
  // Tidak langsung skipWaiting: versi baru menunggu sampai pengguna menekan "Perbarui".
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('catatmakan-') && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// Hanya file aplikasi (daftar ASSETS) yang dilayani dari cache; permintaan lain (data, API) selalu ke jaringan.
const SCOPE_PATH = new URL(self.registration.scope).pathname;
const ASSET_SET = new Set(ASSETS.map((a) => (a === './' ? '' : a)));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(SCOPE_PATH)) return; // Apps Script & Open Food Facts
  const rel = url.pathname.slice(SCOPE_PATH.length);
  if (rel === 'version.json') {
    e.respondWith(fetch(req, { cache: 'no-store' }).catch(() => caches.match('version.json')));
    return;
  }
  if (req.mode === 'navigate') {
    e.respondWith((async () => (await caches.match('index.html')) || fetch(req))());
    return;
  }
  if (!ASSET_SET.has(rel)) return;
  e.respondWith((async () => (await caches.match(rel === '' ? './' : rel, { ignoreSearch: true })) || fetch(req))());
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const client = all.find((c) => c.url.startsWith(self.registration.scope));
    if (client) {
      await client.focus();
      const act = new URL(target).searchParams.get('act');
      if (act) client.postMessage({ type: 'ACTION', action: act });
      else if (new URL(target).hash) client.navigate(target).catch(() => {});
      return;
    }
    await self.clients.openWindow(target);
  })());
});
