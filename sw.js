/**
 * Service Worker สำหรับ "ร้านข้าวต้มนายเง็ก - ครัว & แคชเชียร์"
 * รองรับการติดตั้งแบบ PWA, ทำงานออฟไลน์เบื้องต้น, และแสดงการแจ้งเตือนบนหน้าจอมือถือ (Lock Screen / Home Screen)
 */

const CACHE_NAME = 'naingek-pwa-v3';
const STATIC_ASSETS = [
  './',
  'index.html',
  'kitchen.html',
  'dashboard.html',
  'manifest.json',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
  'icons/favicon-32.png',
  'js/config.js',
  'js/menu-data.js',
  'js/app.js'
];

// 1. Install Event: Cache app shell assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[SW] Cache addAll warning:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// 2. Activate Event: Clean up outdated caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// 3. Fetch Event: Network-first for dynamic data, Cache fallback for static assets
self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);

  // Bypass Google Apps Script API calls or external analytics from caching
  if (
    requestUrl.hostname.includes('script.google.com') ||
    requestUrl.hostname.includes('script.googleusercontent.com') ||
    requestUrl.searchParams.has('action')
  ) {
    return; // Pass through straight to network
  }

  // Network-first for HTML pages and JS scripts so latest code is immediately reflected
  if (
    event.request.mode === 'navigate' ||
    event.request.destination === 'document' ||
    event.request.destination === 'script' ||
    requestUrl.pathname.endsWith('.js')
  ) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          }
          return response;
        })
        .catch(() => caches.match(event.request).then((res) => res || caches.match('kitchen.html')))
    );
    return;
  }

  // Stale-while-revalidate for local static assets
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});

// 4. Message Event: Display lockscreen notification triggered from kitchen page
self.addEventListener('message', (event) => {
  if (!event.data) return;

  if (event.data.type === 'SHOW_NOTIFICATION') {
    const { title, options } = event.data;
    const defaultOptions = {
      icon: 'icons/icon-192.png',
      badge: 'icons/icon-192.png',
      vibrate: [400, 200, 400, 200, 800],
      tag: 'order-alert',
      renotify: true,
      requireInteraction: true,
      data: { url: 'kitchen.html' }
    };
    const finalOptions = Object.assign({}, defaultOptions, options);
    
    event.waitUntil(
      self.registration.showNotification(title, finalOptions)
    );
  }
});

// 5. Push Event: Handle server push notifications if configured
self.addEventListener('push', (event) => {
  let data = {
    title: '🔔 [ร้านข้าวต้มนายเง็ก] ออเดอร์ใหม่เข้า!',
    body: 'มีลูกค้ารายการสั่งซื้อเข้ามาใหม่ในระบบ โปรดตรวจสอบหน้าจอครัว'
  };

  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    vibrate: [400, 200, 400, 200, 800],
    tag: data.tag || 'push-order-alert',
    renotify: true,
    requireInteraction: true,
    data: {
      url: 'kitchen.html',
      orderId: data.orderId || null
    }
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// 6. Notification Click Event: Focus or open the kitchen display when clicked from lockscreen
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || 'kitchen.html', self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If a window is already open, focus it
      for (const client of clientList) {
        if (client.url.includes('kitchen.html') && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open a new window
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
