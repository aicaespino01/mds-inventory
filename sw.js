// Lets the app open quickly and even without signal.
// App files: always try the internet first (so updates show right away), fall back to the saved copy.
// Firebase / Excel libraries: versioned links never change, so the saved copy is used first.
const CACHE = 'mds-inventory-v2';
const SHELL = [
  './', './index.html', './css/app.css', './manifest.webmanifest', './assets/logo.png',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png',
  './js/app.js', './js/config.js', './js/logic.js', './js/state.js', './js/ui.js', './js/icons.js', './js/seed.js',
  './js/views-home.js', './js/views-forms.js', './js/views-more.js', './js/views-suppliers.js', './js/store-local.js', './js/store-firebase.js', './js/export.js',
];
const CDN = ['https://www.gstatic.com/firebasejs/', 'https://cdn.sheetjs.com/'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (CDN.some((p) => req.url.startsWith(p))) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()));
      return res;
    })));
    return;
  }

  if (url.origin === self.location.origin) {
    e.respondWith(fetch(req, { cache: 'no-cache' }).then((res) => {
      if (res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()));
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('./index.html'))));
  }
});
