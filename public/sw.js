// Minimal service worker for PWA
// This enables the app to be installed and improves storage persistence

// IMPORTANT: Increment this version number whenever you deploy to force cache refresh
const CACHE_NAME = 'innopay-v2-20251123';

self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing v2-20251123...');
  // Skip waiting to activate new service worker immediately
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activating v2-20251123...');

  // Clear old caches
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: Clearing old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // Take control of all clients immediately
      return clients.claim();
    })
  );
});

// Network-first strategy: always try to fetch fresh content
self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Clone the response before caching
        const responseToCache = response.clone();

        // Cache the fresh response for offline use
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });

        return response;
      })
      .catch(() => {
        // If offline, try to serve from cache
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            console.log('Service Worker: Serving from cache:', event.request.url);
            return cachedResponse;
          }
          return new Response('Offline - please connect to the internet', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: new Headers({
              'Content-Type': 'text/plain'
            })
          });
        });
      })
  );
});
