// bee-doo Scout – Service Worker v1.0
const CACHE_NAME = 'bee-doo-scout-v1';
const OFFLINE_URL = '/offline.html';

// Dateien die IMMER gecacht werden (App Shell)
const PRECACHE_URLS = [
  '/',
  '/scouting.html',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/offline.html'
];

// ─── INSTALL ────────────────────────────────────────
self.addEventListener('install', (event) => {
  console.log('[SW] Installing bee-doo Scout Service Worker...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Pre-caching app shell');
        return cache.addAll(PRECACHE_URLS);
      })
      .then(() => self.skipWaiting())
  );
});

// ─── ACTIVATE ───────────────────────────────────────
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// ─── FETCH (Network First, Cache Fallback) ──────────
self.addEventListener('fetch', (event) => {
  // Skip cross-origin requests (APIs, CDNs etc.)
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    // Try network first
    fetch(event.request)
      .then((response) => {
        // If successful, cache a copy
        if (response.ok) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(async () => {
        // Network failed – try cache
        const cachedResponse = await caches.match(event.request);
        if (cachedResponse) {
          return cachedResponse;
        }

        // If it's a navigation request, show offline page
        if (event.request.mode === 'navigate') {
          return caches.match(OFFLINE_URL);
        }

        // For other resources, return a simple error
        return new Response('Offline', {
          status: 503,
          statusText: 'Service Unavailable'
        });
      })
  );
});

// ─── PUSH NOTIFICATIONS ─────────────────────────────
self.addEventListener('push', (event) => {
  console.log('[SW] Push received');
  
  let data = {
    title: 'bee-doo Scout',
    body: 'Neue Benachrichtigung',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    tag: 'bee-doo-notification',
    data: { url: '/scouting.html' }
  };

  if (event.data) {
    try {
      const payload = event.data.json();
      data = { ...data, ...payload };
    } catch (e) {
      data.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon,
      badge: data.badge,
      tag: data.tag,
      vibrate: [200, 100, 200],
      data: data.data,
      actions: [
        { action: 'open', title: 'Öffnen' },
        { action: 'dismiss', title: 'Schließen' }
      ]
    })
  );
});

// ─── NOTIFICATION CLICK ─────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const urlToOpen = event.notification.data?.url || '/scouting.html';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        // Focus existing window if available
        for (const client of windowClients) {
          if (client.url.includes('bee-doo') && 'focus' in client) {
            return client.focus();
          }
        }
        // Otherwise open new window
        return clients.openWindow(urlToOpen);
      })
  );
});

// ─── BACKGROUND SYNC (for offline form submissions) ──
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-scout-data') {
    console.log('[SW] Background sync: syncing scout data');
    event.waitUntil(syncScoutData());
  }
});

async function syncScoutData() {
  try {
    // Get queued data from IndexedDB
    const db = await openDB();
    const tx = db.transaction('outbox', 'readonly');
    const store = tx.objectStore('outbox');
    const items = await getAllFromStore(store);
    
    for (const item of items) {
      try {
        await fetch(item.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item.data)
        });
        // Remove from outbox after successful sync
        const deleteTx = db.transaction('outbox', 'readwrite');
        deleteTx.objectStore('outbox').delete(item.id);
      } catch (err) {
        console.error('[SW] Sync failed for item:', item.id);
      }
    }
  } catch (err) {
    console.error('[SW] Background sync error:', err);
  }
}

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('bee-doo-scout', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('outbox', { keyPath: 'id', autoIncrement: true });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function getAllFromStore(store) {
  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
