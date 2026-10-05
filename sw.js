/* バレー記録 — オフライン用 Service Worker
   ページ本体(index.html)は「まずネット、ダメならキャッシュ」。
   なので index.html を差し替えて commit するだけで、次の起動から新しくなります。
   それ以外（アイコンなど）は今までどおりキャッシュ優先。 */
const CACHE = 'volley-ver19-1';
const NET_TIMEOUT = 2200;      // この時間で返ってこなければキャッシュを使う
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function put(req, res) {
  if (res && res.status === 200 && res.type === 'basic') {
    const copy = res.clone();
    caches.open(CACHE).then(c => c.put(req, copy));
  }
}

/* ページ本体：ネット優先（遅い・圏外ならキャッシュ） */
function netFirst(req) {
  return new Promise(resolve => {
    let done = false;
    const fin = r => { if (!done && r) { done = true; resolve(r); } };
    const timer = setTimeout(() => { if (!done) caches.match(req).then(fin); }, NET_TIMEOUT);
    fetch(req).then(res => {
      clearTimeout(timer);
      put(req, res);
      fin(res);
    }).catch(() => {
      clearTimeout(timer);
      caches.match(req).then(hit => fin(hit || new Response('offline', { status: 503 })));
    });
  });
}

/* それ以外：キャッシュを返しつつ裏で更新 */
function staleWhileRevalidate(req) {
  return caches.match(req).then(hit => {
    const net = fetch(req).then(res => { put(req, res); return res; }).catch(() => hit);
    return hit || net;
  });
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const isPage = req.mode === 'navigate'
    || url.pathname.endsWith('/')
    || /\.html?$/i.test(url.pathname);

  e.respondWith(isPage ? netFirst(req) : staleWhileRevalidate(req));
});
