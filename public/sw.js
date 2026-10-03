// Service worker: rende l'app installabile e utilizzabile anche offline (solo il programma; i dati sono in IndexedDB).
const CACHE = 'manutenzione-fal-__V__';
const SHELL = ['./', './index.html', './assets/app.js?v=__V__', './assets/app.css?v=__V__', './assets/pdf.worker.min.mjs', './icon.svg', './icon-192.png', './manifest.webmanifest'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  // pagina: rete prima (aggiornamenti), cache se offline; risorse: cache prima
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((r) => (caches.open(CACHE).then((c) => c.put('./index.html', r.clone())), r)).catch(() => caches.match('./index.html')));
    return;
  }
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((r) => {
      if (r.ok) { const cl = r.clone(); caches.open(CACHE).then((c) => c.put(req, cl)); }
      return r;
    })),
  );
});
