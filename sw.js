// Kelimeci offline copy. Always tries the network first, so a new version shows up straight away;
// falls back to the saved copy when there is no connection.
const CACHE = 'kelimeci-v14';
const CORE = ['./', 'index.html', 'style.css', 'game.js', 'words.js', 'theme-modern.css', 'theme-cool.css', 'manifest.webmanifest', 'icon-192.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  const ours = url.origin === location.origin || url.hostname.endsWith('gstatic.com') || url.hostname.endsWith('googleapis.com');
  if (e.request.method !== 'GET' || !ours) return;
  e.respondWith(
    fetch(e.request).then(res => {
      if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: url.origin === location.origin }).then(hit => hit || caches.match('index.html')))
  );
});
