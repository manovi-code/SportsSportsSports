/* Mann's Sports Dashboard — app-shell cache. API calls are never cached here. */
const SHELL = 'mann-shell-20261118';
self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(['./', './index.html', './sw.js']).catch(() => {})).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('mann-shell-') && k !== SHELL).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== self.location.origin) return;
  if (u.pathname.includes('apis') || u.search.includes('view=')) return;
  e.respondWith((async () => {
    try {
      const r = await fetch(e.request);
      const c = await caches.open(SHELL); c.put(e.request, r.clone()).catch(() => {});
      return r;
    } catch (err) {
      const hit = await caches.match(e.request) || await caches.match('./index.html') || await caches.match('./');
      if (hit) return hit; throw err;
    }
  })());
});
