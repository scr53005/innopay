// Minimal service worker for PWA
// This enables the app to be installed and improves storage persistence

const CACHE_NAME = 'innopay-v1';

self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing...');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activating...');
  event.waitUntil(clients.claim());
});

// Optional: Add basic offline support
self.addEventListener('fetch', (event) => {
  // Let requests go through to the network
  // You can add caching logic here later if needed
  event.respondWith(
    fetch(event.request).catch(() => {
      // If offline, you could return cached content here
      return new Response('Offline - please connect to the internet');
    })
  );
});
