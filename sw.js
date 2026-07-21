// 날씨 CG 메이커 서비스워커 — 앱 설치 + 오프라인용.
// network-first: 온라인이면 '항상 최신'을 받아 업데이트가 바로 반영되고(개발·배포에 중요),
// 네트워크가 안 되면 마지막으로 받은 캐시로 오프라인 동작한다.
const CACHE = 'weathercg-v2';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || !req.url.startsWith(self.location.origin)) return;
  e.respondWith(
    fetch(req).then((res) => {
      if (res && res.ok) { const clone = res.clone(); caches.open(CACHE).then((c) => c.put(req, clone)); }
      return res;
    }).catch(() => caches.match(req))   // 오프라인이면 캐시
  );
});
