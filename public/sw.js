/**
 * AI妈妈 · Service Worker
 *
 * 策略（简单可靠优先，避免缓存旧页面导致看不到更新）：
 *   - 页面导航请求（HTML）：网络优先，失败才走缓存 → 断网也能打开
 *   - 静态资源（图标等）：缓存优先
 *   - 所有 /api/ 请求：一律直连网络，绝不缓存（数据必须最新）
 */
const CACHE = 'ai-mama-v1';
const PRECACHE = ['/', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/icon.svg'];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE).catch(() => {}))
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);

  // 只处理同源请求
  if (url.origin !== self.location.origin) return;

  // 接口请求：不缓存，直连网络
  if (url.pathname.startsWith('/api/')) return;

  // 页面导航：网络优先，失败回退缓存
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put('/', copy)).catch(() => {});
        return res;
      }).catch(() => caches.match('/'))
    );
    return;
  }

  // 其他静态资源：缓存优先
  e.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res.ok && req.method === 'GET') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => hit);
    })
  );
});
