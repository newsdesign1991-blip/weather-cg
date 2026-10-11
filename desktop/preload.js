// 데스크톱 판 표식 + 헬퍼 주소. 웹앱은 window.wcgDesktop 이 없으면 웹판(3720 헬퍼)으로 그대로 동작한다.
const { contextBridge, ipcRenderer } = require('electron');

let helper = { url: null, kind: null, ver: 0 };
try { helper = ipcRenderer.sendSync('wcg:helper') || helper; } catch (e) {}
let dataPortalKey = '';
try { dataPortalKey = ipcRenderer.sendSync('wcg:data-key') || ''; } catch (e) {}
// Mapbox 기본 공개 토큰(desktop/private/mapbox.token) — 비동기로 한 번(받는 곳 없는 옛 메인이면 곧바로 거절 → ''. sendSync는 그때 창이 멈춘다).
// 보통은 앱 스크립트보다 먼저 온다. 늦으면 js/boot.js가 mapboxTokenReady()를 기다려 가벼운 지도를 다시 맞춘다
let mapboxToken = '';
const mapboxTokenReady = ipcRenderer.invoke('wcg:mapbox-token').then((t) => { mapboxToken = typeof t === 'string' ? t : ''; return !!mapboxToken; }, () => false);

// 창 닫기 전 묻기(main.js·desktop/close-guard.js) — 메인이 닫기를 막고 물으면 웹앱이 건 콜백(onCloseAsk)을 부른다.
// 웹앱이 아직 안 걸었으면(부팅 전·로드 실패 안내 화면) 물을 작업이 없으니 바로 'close' — 메인의 시간 제한(5초)을 기다리지 않게.
let closeAskCb = null;
const closeReply = (id, act) => { try { ipcRenderer.send('wcg:close-reply', { id: Math.floor(+id) || 0, act: String(act || '') }); } catch (e) {} };
ipcRenderer.on('wcg:close-ask', (_e, id) => {
  if (!closeAskCb) { closeReply(id, 'close'); return; }
  try { closeAskCb(id); } catch (err) { closeReply(id, 'close'); }   // 웹앱 쪽이 던지면 막지 않고 닫는다(작업은 자동 저장돼 있다)
});

contextBridge.exposeInMainWorld('wcgDesktop', {
  isDesktop: true,
  dataPortalKey,              // 비공개 번들 설정에서 읽은 기본 키(화면·프로젝트·로그에 출력하지 않음)
  mapboxToken: () => mapboxToken,             // Mapbox 기본 공개 토큰(pk. — 가벼운 지도 위성 사진, js/gl-basemap.js glbSatBuiltinUrl). 아직 안 왔거나 없으면 ''. 화면·프로젝트·로그에 출력하지 않음
  mapboxTokenReady: () => mapboxTokenReady,   // 토큰이 오면 true(없음·옛 메인 = false) — 약속은 함수 반환값이어야 contextBridge를 건넌다
  helperUrl: helper.url,       // 내장 헬퍼면 http://127.0.0.1:3721
  helperKind: helper.kind,     // 'embedded' | 'external'
  platform: process.platform,
  versions: { electron: process.versions.electron, chrome: process.versions.chrome },
  // 창 버튼(최소화·최대화·닫기) 색을 앱 제목줄 색에 맞춘다 — { color: '#hex', symbolColor: '#hex' }
  setTitleBar: (o) => { try { ipcRenderer.send('wcg:titlebar', { color: String(o && o.color || ''), symbolColor: String(o && o.symbolColor || '') }); } catch (e) {} },
  // 앱 안 날씨누리 창(단기예보) 열기 — 화면이 뜰 때마다 통보문 글을 onWnuri 로 보내 준다(main.js '날씨누리 창')
  openWnuri: (url) => ipcRenderer.invoke('wcg:wnuri-open', String(url || '')),
  // 받는 것: { text, announce, url, first, err } 또는 { closed: true } — 한 번만 건다(다시 부르면 앞 것을 바꾼다)
  onWnuri: (cb) => {
    ipcRenderer.removeAllListeners('wcg:wnuri');
    if (typeof cb === 'function') ipcRenderer.on('wcg:wnuri', (_e, d) => { try { cb(d); } catch (err) {} });
  },
  // 미해군(JTWC) 자료 받기 — 'rss/jtwc.rss' 또는 'products/wp2726.tcw'(RSS의 전체 주소도 됨). 그 밖 주소는 메인이 거절한다(desktop/jtwc.js).
  // 돌려주는 것: { ok: true, status, url, text } 또는 { ok: false, err: 'denied'|'timeout'|'too-big'|'http'|'net', status?, detail? }
  jtwcFetch: (p) => ipcRenderer.invoke('wcg:jtwc-fetch', String(p || '')),
  // 공공데이터포털(apis.data.go.kr) 자료 받기 — 메인이 연결을 모아 다시 쓰고 늦은 새 연결은 하나 더 보낸다(desktop/data-fetch.js). 그 밖 주소는 거절.
  // 돌려주는 것: { ok: true, status, text, sent } 또는 { ok: false, err: 'denied'|'proxy'|'off'|'timeout'|'too-big'|'net', detail?, sent }
  dataFetch: (u, o) => ipcRenderer.invoke('wcg:data-fetch', String(u || ''), { timeoutMs: Math.floor(+(o && o.timeoutMs)) || 0 }),
  // 지도 타일 받기(디스크 캐시 — desktop/tile-cache.js). 지도 타일 서버 주소만, 그 밖은 'denied'(웹앱이 그냥 fetch로).
  // 돌려주는 것: { ok: true, status, type, body(Uint8Array), hit, stale? } 또는 { ok: false, err: 'denied'|'net'|'timeout'|'http'|'too-big', status? }
  tileGet: (u) => ipcRenderer.invoke('wcg:tile-get', String(u || '')),
  // 렌더 결과 '폴더 열기'(main.js·desktop/reveal.js) — 방금 저장한 파일 경로 찾기와 탐색기에서 골라 보이기.
  // savedPath({ name, dir?(고른 폴더 이름), sub?[하위 폴더], download?, waitMs? }) → 경로 또는 ''(모름)
  // revealPath(경로) → { ok: true, path } 또는 { ok: false, err: 'denied'|'gone'|'not-allowed' } — 이번 실행에 저장한 곳만, 실행 파일 열기 없음
  savedPath: (h) => ipcRenderer.invoke('wcg:saved-path', {
    name: String((h && h.name) || ''), dir: h && h.dir != null ? String(h.dir) : '',
    sub: Array.isArray(h && h.sub) ? h.sub.slice(0, 8).map(String) : [], download: !!(h && h.download), waitMs: Math.floor(+(h && h.waitMs)) || 0,
  }),
  revealPath: (p) => ipcRenderer.invoke('wcg:reveal-path', String(p || '')),
  // 창 닫기 전 묻기 — cb(번호)는 곧바로 closeReply(번호, 'close'|'wait')로, 팝업에서 고르면 closeReply(번호, 'close'|'stay')로 답한다(한 번만 건다)
  onCloseAsk: (cb) => { closeAskCb = typeof cb === 'function' ? cb : null; },
  closeReply: (id, act) => closeReply(id, act),
});
