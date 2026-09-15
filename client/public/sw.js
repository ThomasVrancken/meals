// Minimal service worker: offline app shell + last-seen data.
// No precache manifest (Vite's hashed build filenames aren't known ahead of
// time) — everything is cached opportunistically as it's fetched.

const CACHE_NAME = 'two-pans-v1';
const API_CACHE = 'two-pans-api-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME && key !== API_CACHE)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return; // never cache mutating calls

  const url = new URL(request.url);

  // API reads: network-first, cache the last good response so the app
  // still shows something with no connection.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(API_CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Navigations (index.html) MUST be network-first: it references the
  // current build's content-hashed JS/CSS filenames, which change on every
  // deploy. Cache-first here could strand a returning user on a stale shell
  // pointing at assets that no longer exist. Falls back to cache offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Hashed static assets (JS/CSS/icons): cache-first is safe and fast — a
  // changed file always gets a new filename.
  event.respondWith(
    caches.match(request).then((cached) => {
      const fetchPromise = fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
