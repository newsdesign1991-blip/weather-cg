// 날씨 CG 메이커 서비스워커 — 앱 설치 + 오프라인용.
// network-first: 온라인이면 '항상 최신'을 받아 업데이트가 바로 반영되고(개발·배포에 중요),
// 네트워크가 안 되면 마지막으로 받은 캐시로 오프라인 동작한다.
// v4(기능별 분할, MODULES.md): 페이지(index.html) 요청은 HTTP 캐시를 건너뛰고 늘 서버에 다시 확인한다(no-cache).
// js/·css/는 ?v=(내용 해시)로 주소가 바뀌므로 페이지만 최신이면 파일들이 한 벌로 맞는다. 옛 index.html이 HTTP 캐시에서 나오면
// 옛 ?v= 주소로 요청해도 서버(Pages)는 쿼리를 무시하고 새 파일을 줘서 옛것·새것이 섞일 수 있다. 오프라인 폴백에 ignoreSearch는 쓰지 않는다(버전이 섞임).
const CACHE = 'weathercg-v4';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || !req.url.startsWith(self.location.origin)) return;
  e.respondWith(
    (req.mode === 'navigate' ? fetch(req, { cache: 'no-cache' }) : fetch(req)).then((res) => {
      if (res && res.ok) { const clone = res.clone(); caches.open(CACHE).then((c) => c.put(req, clone)); }
      return res;
    }).catch(() => caches.match(req))   // 오프라인이면 캐시
  );
});
