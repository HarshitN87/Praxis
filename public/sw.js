/**
 * Minimal offline shell.
 *
 * Praxis holds all its data in IndexedDB, so the only thing the service
 * worker needs to do is make the app itself load without a network. There is
 * no API to cache, no sync to reconcile, and no background fetch.
 */

const CACHE = 'praxis-shell-v1';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg'];

/**
 * Vite fingerprints the bundle filenames, so they cannot be listed here.
 * They are also requested BEFORE this worker takes control on a first visit,
 * which would otherwise leave the app cached but unrunnable until a second
 * load: index.html would come back from cache and then fail to find its
 * script. So read the built asset URLs straight out of index.html at install
 * time and precache them too.
 */
async function precacheBuiltAssets(cache) {
  try {
    const res = await fetch('/index.html', { cache: 'no-cache' });
    const html = await res.text();
    const urls = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
    if (urls.length) await cache.addAll(urls);
  } catch {
    // A failed precache must never block installation — the runtime handler
    // below will pick these up on the next request.
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then(async (cache) => {
        await cache.addAll(SHELL);
        await precacheBuiltAssets(cache);
      })
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return;

  // Network-first for navigations so a deployed update is picked up promptly,
  // falling back to the cached shell when offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('/index.html', copy));
          return res;
        })
        .catch(() => caches.match('/index.html').then((r) => r || Response.error())),
    );
    return;
  }

  // Cache-first for hashed static assets.
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
          }
          return res;
        }),
    ),
  );
});
