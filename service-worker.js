







// Minimal service worker to enable PWA installation
self.addEventListener('install', event => {
  self.skipWaiting();
});
self.addEventListener('fetch', event => {
  // Just network-first – necessary for PWA
  event.respondWith(fetch(event.request));
});