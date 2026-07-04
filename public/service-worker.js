/**
 * Service Worker for Forge PWA
 * Implements caching strategies for offline support with proper error handling
 */

const CACHE_NAME = 'forge-cache-v4';
const RUNTIME_CACHE = 'forge-runtime-v4';
const OFFLINE_URL = '/offline.html';

// Files to cache immediately on install
const PRECACHE_URLS = [
  '/',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  OFFLINE_URL
];

// Install event - cache core assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
      .catch((error) => {
        console.error('Service Worker install failed:', error);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  const currentCaches = [CACHE_NAME, RUNTIME_CACHE];
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return cacheNames.filter((cacheName) => !currentCaches.includes(cacheName));
      })
      .then((cachesToDelete) => {
        return Promise.all(cachesToDelete.map((cacheToDelete) => {
          return caches.delete(cacheToDelete);
        }));
      })
      .then(() => self.clients.claim())
  );
});

// Helper: Clean up old cache entries (limit cache size)
async function cleanupCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();

  if (keys.length > maxEntries) {
    const keysToDelete = keys.slice(0, keys.length - maxEntries);
    await Promise.all(keysToDelete.map(key => cache.delete(key)));
  }
}

// Fetch event - smart caching strategies
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  const { request } = event;
  const url = new URL(request.url);

  // Strategy: NetworkOnly for OpenAI API (always fresh)
  if (url.hostname.includes('openai.com')) {
    event.respondWith(fetch(request));
    return;
  }

  // Strategy: NetworkFirst for Supabase Auth (fresh when online, cached when offline)
  if (url.hostname.includes('supabase.co') && url.pathname.includes('/auth/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Clone BEFORE consuming the response
          const responseToCache = response.clone();

          // Cache successful responses
          if (response.ok) {
            caches.open(RUNTIME_CACHE).then((cache) => {
              cache.put(request, responseToCache);
              // Limit auth cache size
              cleanupCache(RUNTIME_CACHE, 10);
            });
          }
          return response;
        })
        .catch(() => {
          // Fallback to cache if network fails
          return caches.match(request);
        })
    );
    return;
  }

  // Strategy: Different strategies for different Supabase endpoints
  if (url.hostname.includes('supabase.co')) {
    // For mutations, always go to network (no caching)
    if (request.method === 'POST' || request.method === 'PUT' ||
        request.method === 'DELETE' || request.method === 'PATCH') {
      event.respondWith(fetch(request));
      return;
    }

    // For food_entries GET requests: Use NetworkFirst (always fetch fresh data)
    // This prevents stale cache from overwriting optimistic updates
    if (url.pathname.includes('/food_entries')) {
      event.respondWith(
        fetch(request)
          .then((response) => {
            // Clone BEFORE consuming the response
            const responseToCache = response.clone();

            // Cache successful responses for offline fallback
            if (response.ok) {
              caches.open(RUNTIME_CACHE).then((cache) => {
                cache.put(request, responseToCache);
                cleanupCache(RUNTIME_CACHE, 100);
              });
            }
            return response;
          })
          .catch(() => {
            // Only if network fails, use cached data
            return caches.match(request).then((cachedResponse) => {
              return cachedResponse || caches.match(OFFLINE_URL);
            });
          })
      );
      return;
    }

    // For other Supabase GET requests: Use StaleWhileRevalidate (fast response, background update)
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        const fetchPromise = fetch(request)
          .then((networkResponse) => {
            // Clone BEFORE consuming the response
            const responseToCache = networkResponse.clone();

            if (networkResponse.ok) {
              caches.open(RUNTIME_CACHE).then((cache) => {
                cache.put(request, responseToCache);
                // Limit API cache size
                cleanupCache(RUNTIME_CACHE, 100);
              });
            }
            return networkResponse;
          })
          .catch((error) => {
            console.error('Network request failed:', error);
            return cachedResponse || caches.match(OFFLINE_URL);
          });

        return cachedResponse || fetchPromise;
      })
    );
    return;
  }

  // Strategy: CacheFirst for static assets (images, fonts, etc.)
  if (request.destination === 'image' ||
      request.destination === 'font' ||
      request.destination === 'style' ||
      url.pathname.match(/\.(png|jpg|jpeg|svg|gif|woff|woff2|ttf|eot|css)$/)) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }

        return fetch(request)
          .then((response) => {
            // Clone BEFORE consuming the response
            const responseToCache = response.clone();

            // Only cache successful same-origin responses
            if (response.ok && url.origin === self.location.origin) {
              caches.open(RUNTIME_CACHE).then((cache) => {
                cache.put(request, responseToCache);
                // Limit static asset cache
                cleanupCache(RUNTIME_CACHE, 100);
              });
            }
            return response;
          })
          .catch((error) => {
            console.error('Failed to fetch static asset:', error);
            // Return offline page for navigation requests
            if (request.destination === 'document') {
              return caches.match(OFFLINE_URL);
            }
            throw error;
          });
      })
    );
    return;
  }

  // Default strategy: Network first with cache fallback for HTML pages
  event.respondWith(
    fetch(request)
      .then((response) => {
        // Clone BEFORE consuming the response
        const responseToCache = response.clone();

        // Cache successful HTML responses
        if (response.ok && request.destination === 'document') {
          caches.open(RUNTIME_CACHE).then((cache) => {
            cache.put(request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        // Fallback to cache, then offline page
        return caches.match(request).then((cachedResponse) => {
          return cachedResponse || caches.match(OFFLINE_URL);
        });
      })
  );
});

// Message event - handle service worker updates
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
