// 날씨 CG 메이커 서비스워커 — 앱 설치 + 오프라인용.
// network-first: 온라인이면 '항상 최신'을 받아 업데이트가 바로 반영되고(개발·배포에 중요),
// 네트워크가 안 되면 마지막으로 받은 캐시로 오프라인 동작한다.
// v4(기능별 분할, MODULES.md): 페이지(index.html) 요청은 HTTP 캐시를 건너뛰고 늘 서버에 다시 확인한다(no-cache).
// js/·css/는 ?v=(내용 해시)로 주소가 바뀌므로 페이지만 최신이면 파일들이 한 벌로 맞는다. 옛 index.html이 HTTP 캐시에서 나오면
// 옛 ?v= 주소로 요청해도 서버(Pages)는 쿼리를 무시하고 새 파일을 줘서 옛것·새것이 섞일 수 있다. 오프라인 폴백에 ignoreSearch는 쓰지 않는다(버전이 섞임).
// - 판 올림(activate): 옛 판 캐시(weathercg-…)의 항목을 새 캐시로 옮겨 담은 뒤 지운다. 옛 캐시에는 방금 그 방문에서 받은
//   index·js·css가 한 벌로 들어 있다. 그냥 지우면 배포 뒤 첫 방문에서 캐시가 통째로 비어, 곧바로 오프라인이 되면 앱이 안 열린다.
// - js/·css/의 ?v= 응답을 담을 때는 같은 경로의 옛 ?v= 항목을 먼저 지운다(배포마다 캐시가 커지지 않게).
//   성공한 응답만 담으므로 남는 것은 늘 마지막으로 받은 index와 그 js·css 한 벌이다.
const CACHE = 'weathercg-v4';
const VERSIONED = /\/(?:js|css)\/[^/?#]+\?v=/;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  const old = (await caches.keys()).filter((k) => k !== CACHE);
  try {   // 옛 판 항목 옮겨 담기 — 최근에 만든 캐시부터, 새 캐시에 이미 있는 주소는 그대로 둔다
    const to = await caches.open(CACHE);
    for (const k of old.filter((n) => /^weathercg-/.test(n)).reverse()) {
      const from = await caches.open(k);
      for (const req of await from.keys()) {
        if (await to.match(req)) continue;
        const res = await from.match(req);
        if (res) await to.put(req, res);
      }
    }
  } catch (err) { /* 옮기지 못해도 판 올림은 계속 */ }
  await Promise.all(old.map((k) => caches.delete(k)));
  await self.clients.claim();
})()));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || !req.url.startsWith(self.location.origin)) return;
  e.respondWith(
    (req.mode === 'navigate' ? fetch(req, { cache: 'no-cache' }) : fetch(req)).then((res) => {
      if (res && res.ok) {
        const clone = res.clone();
        const save = caches.open(CACHE).then((c) => (VERSIONED.test(req.url) ? c.delete(req, { ignoreSearch: true }) : Promise.resolve()).then(() => c.put(req, clone))).catch(() => {});
        try { e.waitUntil(save); } catch (err) { /* 이미 끝난 이벤트면 그냥 둔다 */ }
      }
      return res;
    }).catch(() => caches.match(req))   // 오프라인이면 캐시
  );
});
