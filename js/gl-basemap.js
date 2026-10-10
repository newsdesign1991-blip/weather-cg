/* [모듈] js/gl-basemap.js — 태풍 지도 배경 '가벼운 지도 (WebGL · 시험)': 벡터 타일(OpenFreeMap)을 MapLibre GL(vendor/)이 GPU로 그린다 — 화면은 아트보드 뒤 캔버스(지도 위치·투영 1:1), 추출·틸트·영상·AE는 그 프레임 그림을 복제본에 넣고, 못 쓰면 파란 지도로 */
'use strict';

// ===================== 가벼운 지도(WebGL · 시험) =====================
// 구글 지도·Mapbox GL과 같은 방식 — 지도 '그림'(래스터 타일)을 받지 않고 도형 자료(벡터 타일)를 받아 브라우저의 WebGL(웹용 OpenGL)로 그린다.
// (Mapbox 실시간 타일 모드는 그림 타일을 SVG <image>로 까는 것이라 다르다 — js/map-render.js updateMapboxTiles.)
// 다른 지도 배경(파란·위성·Mapbox)의 코드 길은 건드리지 않는다: 이 모드일 때만 renderTyphoon이 glbMarkHidden·glbSync를 부르고,
// 추출은 복제본의 #bgMapT에 data-glb가 있을 때만(glbInlineClone) 그림을 넣는다.
//
// 화면: .fit 안 #glMap(바다색 바탕) > #glMapIn(MapLibre 캔버스) — #cg(SVG) 뒤(z-index 0). 준비되면 renderTyphoon이 파란 바다·육지·지형을 숨겨
//   캔버스가 비치게 한다(위성 모드와 같은 자리). 남한 강조·시도선·격자(바다만)·태풍 경로·라벨은 SVG 그대로 위에.
// 투영: projLL은 메르카토르(경도 선형·위도 ln tan) — MapLibre 웹 메르카토르와 같은 식이라 중심·배율만 맞추면 1:1이다(glbView).
//   zoom = log2(2π·scale·S.map.s·k / 512) — k = 화면 px / 뷰박스 단위, 512 = MapLibre 타일 크기(세계 너비 = 512·2^zoom px).
// 움직임: 지도 끌기·휠(view-camera.js lightPanZoom)·렌더(renderTyphoon — 카메라 키 재생 animFastCam 포함)마다 glbSync →
//   카메라가 바뀌었으면 jumpTo + redraw(같은 프레임에 그림 — SVG 경로와 한 프레임도 안 어긋나게).
// 3D 틸트·이미지·영상·AE: 지도 그림은 늘 svgToImage·svgBlob의 SVG 복제본으로 굽는다 → 그 복제본의 #bgMapT 맨 아래에
//   이 프레임 영역의 GL 그림(<image>)을 넣는다(따로 쓰는 숨은 지도 하나 — 타일을 다 받을 때까지 기다림·시간 제한). 그래서 틸트(기존 원근 굽기)·
//   AE 블리드·카메라 레이어 나누기가 위성 그림과 똑같이 따라간다. 못 받으면 그 복제본만 파란 지도로 되돌리고 알린다.
// 위도 ±85.05° 밖(메르카토르 끝)은 타일이 없다 — 그 띠 밖은 그리지 않고 바다색(화면 #glMap 바탕·복제본 #typhoonOcean)으로 둔다.
const GLB_LIB = 'vendor/maplibre-gl/maplibre-gl.js';           // MapLibre GL JS 5.24.0(BSD-3 — vendor/maplibre-gl/LICENSE.txt). 이 모드를 고를 때만 읽는다
const GLB_TILES = 'https://tiles.openfreemap.org/planet';      // OpenFreeMap 벡터 타일(TileJSON — 키·가입 없음, 무료, 출처 표기)
const GLB_ATTR = '지도 자료 © OpenStreetMap 기여자 · © OpenMapTiles · OpenFreeMap';
const GLB_SEA = '#0b2240';        // 바다 — 파란 지도 바다 그라디언트(#0e2a4e → #081a30)의 가운데
const GLB_BORDER = '#8fb3dc';     // 나라 경계(옅게)
const GLB_SNAP_MAX = 4096;        // 추출 그림 한 변 최대(px) — 틸트 블리드(5760)는 줄여 굽는다
const GLB_WAIT_MS = 12000;        // 처음 표시: 타일을 이만큼 못 받으면 파란 지도로
const GLB_SNAP_MS = 15000;        // 추출 한 장: 타일 기다리기 한도
const GLB_MERC_LAT = 85.051129;   // 웹 메르카토르 끝 위도
const GLB_WHY = {
  offline: '인터넷 연결이 없어요', lib: '지도 엔진 파일(vendor/maplibre-gl)을 못 읽었어요', webgl: '이 PC에서 WebGL을 쓸 수 없어요',
  tiles: '지도 서버(OpenFreeMap)에서 타일을 못 받았어요', timeout: '지도 서버 응답이 너무 늦어요', lost: 'GPU가 초기화돼 지도를 잃었어요',
};
// 상태: off(아직) · loading(불러오는 중 — 화면은 파란 지도) · ready(GL로 그림) · fail(파란 지도로 대체, why)
const _glb = { lib: null, live: null, exp: null, state: 'off', why: '', t0: 0, readyMs: 0, view: '', col: '', poll: 0, expT: 0, warnAt: 0, online: false, snaps: 0, snapMs: 0, proto: false, tj: null, tjAt: 0 };
let _glbQ = Promise.resolve();

// 지금 태풍 지도 배경이 이 모드인가(준비와 상관없이)
function glbActive() { return !!(isTyphoon() && S.typhoon && S.typhoon.basemap === 'gl'); }
// 화면에 GL을 보이는가 — 준비됐고 노말 VF가 아님(VF는 패널 자르기·진입 슬라이드가 SVG 래퍼에 걸려 뒤 캔버스로는 못 맞춘다 → 파란 지도)
function glbShowing() { return glbActive() && _glb.state === 'ready' && S.res !== '1920x1080-vf'; }

// 자체 스타일 — 방송 지도 결(어두운 남색 바다·육지, 옅은 나라 경계, 글자 없음 → 글꼴·아이콘 요청 없음). 육지 색은 태풍 패널의 육지 색(T.landFill).
// OpenMapTiles에는 '육지' 면이 없어 바탕 = 육지, water(바다·호수) = 바다로 칠한다. 해안선 줄은 안 긋는다(물 면 테두리는 타일·날짜변경선 경계에서 줄이 생긴다).
function glbStyle(T) {
  const land = (T && T.landFill) || '#12325A';
  return {
    version: 8, name: 'wcg-light',
    sources: { omt: { type: 'vector', url: GLB_TILES, attribution: GLB_ATTR } },
    layers: [
      { id: 'land', type: 'background', paint: { 'background-color': land } },
      { id: 'sea', type: 'fill', source: 'omt', 'source-layer': 'water', filter: ['!=', ['get', 'brunnel'], 'tunnel'], paint: { 'fill-color': GLB_SEA, 'fill-antialias': true } },
      { id: 'border', type: 'line', source: 'omt', 'source-layer': 'boundary',
        filter: ['all', ['==', ['get', 'admin_level'], 2], ['!=', ['get', 'maritime'], 1], ['!', ['has', 'claimed_by']]],
        layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': GLB_BORDER, 'line-opacity': 0.32, 'line-width': 0.8 } },
    ],
  };
}

// 앱 지도 위치 → MapLibre 카메라. cam = {x,y,s}(S.map), proj = MAP.proj, k = 화면 px / 뷰박스 단위,
// (ox, oy) = 그림 왼쪽 위의 뷰박스 좌표, (cw, ch) = 그림 크기(px). MapLibre는 그림 가운데에 center를 둔다.
function glbView(cam, proj, k, ox, oy, cw, ch) {
  const s = +cam.s || 1;
  const lx = (ox + cw / 2 / k - cam.x) / s, ly = (oy + ch / 2 / k - cam.y) / s;   // 그림 가운데 → 지도 로컬(projLL)
  const mx = lx / proj.scale + proj.cx0, my = proj.cy0 - ly / proj.scale;          // 메르카토르(라디안)
  return { lng: mx * 180 / Math.PI, lat: (2 * Math.atan(Math.exp(my)) - Math.PI / 2) * 180 / Math.PI, zoom: Math.log2(2 * Math.PI * proj.scale * s * k / 512) };
}
// 위도 ±85.05°(타일이 있는 띠)의 뷰박스 y 범위 [위, 아래]
function glbBand(cam, proj) {
  const s = +cam.s || 1;
  return [cam.y + (-(Math.PI - proj.cy0) * proj.scale) * s, cam.y + ((Math.PI + proj.cy0) * proj.scale) * s];
}

// 디스크 캐시 길(데스크톱 앱) — OpenFreeMap 주소(TileJSON·벡터 타일)를 'wcgtile://'로 바꿔(transformRequest) MapLibre가 우리 받기(tileFetch →
// 메인 디스크 캐시 desktop/tile-cache.js)로 받게 한다. 한 번 본 타일은 다음엔 이 PC에서(버튼 없음). 웹·점검(브리지 없음)은 그대로 https.
const GLB_PROTO = 'wcgtile';
const glbCacheOn = () => !!(window.wcgDesktop && typeof window.wcgDesktop.tileGet === 'function');
function glbTransform(url) {
  return (_glb.proto && /^https:\/\/tiles\.openfreemap\.org\//.test(url)) ? { url: GLB_PROTO + '://' + url.slice(8) } : { url };
}
async function glbProtoLoad(params) {
  const r = await tileFetch('https://' + String(params.url).slice(GLB_PROTO.length + 3));
  if (params.type === 'json') return { data: JSON.parse(new TextDecoder().decode(r.data)) };
  const d = r.data;
  return { data: d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength) };
}
// MapLibre 엔진 — 처음 고를 때 한 번 읽는다(부팅·다른 모드엔 없음). 못 읽으면 null(다음에 다시)
function glbLoadLib() {
  if (window.maplibregl) { glbProtoInit(window.maplibregl); return Promise.resolve(window.maplibregl); }
  if (_glb.lib) return _glb.lib;
  _glb.lib = new Promise((res) => {
    const sc = document.createElement('script');
    let t = 0;
    const done = (ok) => { clearTimeout(t); res(ok && window.maplibregl ? window.maplibregl : null); };
    t = setTimeout(() => done(false), 20000);
    sc.onload = () => done(true); sc.onerror = () => done(false);
    sc.src = GLB_LIB;
    document.head.appendChild(sc);
  }).then((ml) => { if (!ml) _glb.lib = null; else glbProtoInit(ml); return ml; });
  return _glb.lib;
}
function glbProtoInit(ml) {
  if (_glb.proto || !glbCacheOn() || !ml || typeof ml.addProtocol !== 'function') return;
  try { ml.addProtocol(GLB_PROTO, glbProtoLoad); _glb.proto = true; } catch (e) { /* 그냥 https로 */ }
}
// 지도 하나 — 화면(live)·추출(exp, 숨김·그림 버퍼 보존). 사용자가 직접 끌지 않는다(앱이 카메라를 준다).
function glbMake(ml, box, exp) {
  const m = new ml.Map({
    container: box, style: glbStyle(S.typhoon), interactive: false, attributionControl: false,
    renderWorldCopies: true, fadeDuration: 0, minZoom: -2, maxZoom: 18, trackResize: !exp,
    transformConstrain: (center, zoom) => ({ center, zoom }),   // 화면을 세계 안으로 밀어 넣지 않는다(기본값은 극지방이 보이면 중심을 옮겨 앱 지도와 어긋난다)
    pixelRatio: exp ? 1 : Math.min(3, window.devicePixelRatio || 1), maxCanvasSize: [GLB_SNAP_MAX, GLB_SNAP_MAX],
    canvasContextAttributes: { antialias: false, preserveDrawingBuffer: false },   // 선·면 가장자리는 MapLibre가 셰이더로 다듬는다(MSAA 불필요 — 4096 그림이면 GPU 메모리 수백 MB). 추출은 그린 직후 같은 작업 안에서 읽는다
    cancelPendingTileRequestsWhileZooming: false,
    transformRequest: glbTransform,   // 데스크톱이면 디스크 캐시 길로(위 GLB_PROTO)
  });
  m.__ok = 0; m.__err = 0; m.__errMsg = '';
  m.on('sourcedata', (e) => { if (e && e.tile && e.sourceId === 'omt') m.__ok++; });
  m.on('error', (e) => { m.__err++; m.__errMsg = String((e && e.error && e.error.message) || 'error').slice(0, 200); });
  if (!exp) {
    m.on('resize', () => glbSync(true));   // 창·아트보드 크기가 바뀌면 배율을 다시
    m.on('webglcontextlost', () => { if (_glb.live === m) glbFail('lost'); });
  }
  return m;
}

// 화면 지도 시작(고를 때·이 모드인 작업을 열었을 때 — glbSync가 부른다)
async function glbStart() {
  if (_glb.state !== 'off') return;
  _glb.state = 'loading'; _glb.why = ''; _glb.t0 = performance.now(); _glb.view = '';
  glbUi();
  if (!_glb.online) {   // 한 번만 — 다시 연결되면 다시 시도, 아트보드 크기가 바뀌면(창·타임라인·사이드바) 배율을 다시
    _glb.online = true;
    window.addEventListener('online', () => { if (glbActive() && _glb.state === 'fail' && _glb.why !== 'lib' && _glb.why !== 'webgl') glbRetry(); });
    try { new ResizeObserver(() => { if (_glb.live && glbActive()) glbSync(true); }).observe(fit); } catch (e) { /* 창 크기 'resize'로도 맞춘다 */ }
  }
  if (navigator.onLine === false) { glbFail('offline'); return; }
  const ml = await glbLoadLib();
  if (_glb.state !== 'loading') return;
  if (!ml) { glbFail('lib'); return; }
  const host = $('#glMap'), box = $('#glMapIn');
  if (!host || !box) { glbFail('lib'); return; }
  try {
    host.style.display = ''; host.style.visibility = 'hidden';   // 크기가 있어야 타일을 고른다 — 준비될 때까지 안 보이게(위에 파란 지도)
    if (!_glb.live) _glb.live = glbMake(ml, box, false);
    _glb.live.__ok = 0; _glb.live.__err = 0;
  } catch (e) { glbFail('webgl'); return; }
  glbSync(true);
  clearTimeout(_glb.poll); _glb.poll = setTimeout(glbPoll, 60);
}
// 준비 확인 — 숨은 창에서도 돌게 타이머 + 동기 그리기(redraw)로 본다
function glbPoll() {
  _glb.poll = 0;
  const m = _glb.live;
  if (_glb.state !== 'loading' || !m) return;
  if (!glbActive()) { _glb.state = 'off'; glbSync(); return; }   // 기다리는 사이 다른 배경으로
  try { m.redraw(); } catch (e) { /* 그리기 실패는 아래 판정으로 */ }
  const el = performance.now() - _glb.t0;
  let done = false; try { done = m.loaded() && m.areTilesLoaded(); } catch (e) { done = false; }
  if (done && m.__ok > 0 && !m.__err) { glbReadyNow(); return; }
  if (m.__err && !m.__ok && el > 2500) { glbFail(navigator.onLine === false ? 'offline' : 'tiles'); return; }
  if (el > GLB_WAIT_MS) { glbFail(m.__ok ? 'timeout' : (m.__err ? 'tiles' : 'timeout')); return; }
  if (done && m.__ok > 0 && m.__err) { glbReadyNow(); return; }   // 일부 타일만 실패 — 받은 데까지 그린다(빈 칸은 육지색)
  _glb.poll = setTimeout(glbPoll, 100);
}
function glbReadyNow() {
  _glb.state = 'ready'; _glb.readyMs = performance.now() - _glb.t0;
  renderTyphoon();                                  // 파란 지도를 숨기고 GL을 보인다(glbMarkHidden·glbSync)
  tiltInvalidate(); if (camActive3d()) applyTilt();  // 틸트 그림에도 GL을
  glbUi();
  if (glbActive()) status(`가벼운 지도 (WebGL · 시험) 준비됨 — ${(_glb.readyMs / 1000).toFixed(1)}초`, true, 'ok');
}
function glbFail(why) {
  clearTimeout(_glb.poll); _glb.poll = 0;
  _glb.state = 'fail'; _glb.why = why;
  const host = $('#glMap'); if (host) host.style.display = 'none';
  if (isTyphoon()) renderTyphoon();                 // 파란 지도로 대체
  tiltInvalidate(); if (camActive3d()) applyTilt();
  glbUi();
  if (glbActive()) status('가벼운 지도를 못 불러와 파란 지도로 그려요 — ' + (GLB_WHY[why] || why), true, 'warn');
}
// 다시 시도 — 지도 엔진은 두고 지도를 새로 만든다(실패한 타일을 다시 받게)
function glbRetry() {
  clearTimeout(_glb.poll); _glb.poll = 0;
  for (const k of ['live', 'exp']) { const m = _glb[k]; _glb[k] = null; if (m) { try { m.remove(); } catch (e) { /* 이미 잃음 */ } } }
  const ex = $('#glMapExp'); if (ex) ex.remove();
  _glb.state = 'off'; _glb.why = '';
  glbSync(true);
}
// 메뉴에서 고름(js/map-render.js wireBasemap) — 실패했던 거면 다시 시도
function glbPicked() {
  if (_glb.state === 'fail') glbRetry(); else glbSync(true);
  glbUi();
  if (_glb.state === 'ready') status('가벼운 지도 (WebGL · 시험)', true);
  else if (S.res !== '1920x1080-vf') status('가벼운 지도 (WebGL · 시험) — 불러오는 중…', true);   // 곧 시작(glbStart) — 끝나면 준비·실패 알림이 덮는다
  else status('노말 VF 화면에서는 가벼운 지도를 아직 못 써요 — 파란 지도로 그려요', true, 'warn');
}

// renderTyphoon이 GL을 보일 때 숨기는 파란 지도 조각에 표시 — 추출 복제본이 GL 그림을 못 얻으면 이 표시로 되살린다(glbCloneFallback).
// #bgMapT의 data-glb = '이 화면은 GL 지도였다'(복제본이 그 프레임 GL 그림을 넣을지). 다른 모드에선 표시를 지운다(옛 DOM 그대로).
function glbMarkHidden(isGl, nodes) {
  const bg = $('#bgMapT');
  if (bg) { if (isGl) bg.setAttribute('data-glb', '1'); else bg.removeAttribute('data-glb'); }
  for (const n of nodes) { if (!n) continue; if (isGl && n.style.display !== 'none') n.setAttribute('data-glbhid', '1'); else n.removeAttribute('data-glbhid'); }
}

// 화면 지도를 지금 지도 위치에 맞춘다(끌기·휠·재생 프레임마다 — 바뀐 게 없으면 바로 끝)
function glbSync(force) {
  if (_glb.inSync) return;   // m.resize()가 곧바로 'resize'(→ 여기)를 부른다 — 바깥 한 번으로 충분
  if (!_glb.live && !glbActive()) return;   // 한 번도 안 썼고 이 모드도 아님 — 다른 배경의 끌기·렌더엔 아무 일 없이
  _glb.inSync = true;
  try { _glbSync(force); } finally { _glb.inSync = false; }
}
function _glbSync(force) {
  const host = $('#glMap'), box = $('#glMapIn'), attr = $('#glMapAttr');
  if (!host || !box) return;
  const act = glbActive();
  // 시작은 지금 그리기(renderTyphoon)가 끝난 뒤에 — 곧바로 실패(오프라인)하면 glbFail이 renderTyphoon을 다시 부르므로 겹치지 않게. glbStart가 다시 부른다(노말 VF는 못 쓰니 안 불러온다)
  if (act && _glb.state === 'off' && S.res !== '1920x1080-vf') { Promise.resolve().then(glbStart); return; }
  const m = _glb.live;
  if (!act || !m || _glb.state === 'fail') {
    if (host.style.display !== 'none') host.style.display = 'none';
    if (attr && attr.style.display !== 'none') attr.style.display = 'none';
    return;
  }
  const show = glbShowing();
  if (host.style.display === 'none') host.style.display = '';
  host.style.visibility = show ? '' : 'hidden';
  if (attr) attr.style.display = show ? '' : 'none';
  const fw = _fitCssW || fit.clientWidth || 1920, fh = _fitCssH || fit.clientHeight || 1080;
  const k = fw / 1920;
  // 타일이 있는 위도 띠만 캔버스로(밖은 #glMap 바다색) — 보통은 아트보드 전체
  const [b0, b1] = glbBand(S.map, MAP.proj);
  const top = Math.max(0, Math.floor(Math.max(0, b0) * k)), bot = Math.min(Math.ceil(fh), Math.ceil(Math.min(1080, b1) * k));
  const cw = Math.max(1, Math.ceil(fw)), ch = Math.max(1, bot - top);
  if (box.__w !== cw || box.__h !== ch || box.__t !== top) {
    box.__w = cw; box.__h = ch; box.__t = top;
    box.style.width = cw + 'px'; box.style.height = ch + 'px'; box.style.top = top + 'px';
    try { m.resize(); } catch (e) { /* 다음에 */ }
    force = true;
  }
  box.style.display = bot > top ? '' : 'none';
  const col = (S.typhoon && S.typhoon.landFill) || '#12325A';
  if (col !== _glb.col) { _glb.col = col; glbSetLand(m, col); force = true; }
  const v = glbView(S.map, MAP.proj, k, 0, top / k, cw, ch);
  const key = v.lng.toFixed(7) + ',' + v.lat.toFixed(7) + ',' + v.zoom.toFixed(6);
  if (!force && key === _glb.view) return;
  _glb.view = key;
  try {
    m.jumpTo({ center: [v.lng, v.lat], zoom: v.zoom });
    if (show) m.redraw();   // 같은 프레임에 그린다(다음 프레임으로 미루면 끌기 중 SVG 경로·라벨과 한 프레임 어긋난다)
  } catch (e) { /* 스타일 전 등 — 다음 동기화에 */ }
}
function glbSetLand(m, col) { try { if (m && m.getLayer && m.getLayer('land')) m.setPaintProperty('land', 'background-color', col); } catch (e) { /* 스타일 전 */ } }

// ---------- 추출(복제본에 그 프레임 그림) ----------
// 추출용 숨은 지도 — 그림 크기마다 컨테이너를 맞춘다. 30초 안 쓰면 반납
function glbExpMap(ml) {
  if (_glb.exp) return _glb.exp;
  let box = $('#glMapExp');
  if (!box) {
    box = document.createElement('div'); box.id = 'glMapExp'; box.setAttribute('aria-hidden', 'true');
    box.style.cssText = 'position:fixed;left:-40000px;top:0;width:64px;height:64px;pointer-events:none;overflow:hidden;contain:strict;';
    document.body.appendChild(box);
  }
  _glb.exp = glbMake(ml, box, true);
  return _glb.exp;
}
function glbDropExp() {
  _glb.expT = 0;
  const m = _glb.exp; _glb.exp = null;
  if (m) { try { m.remove(); } catch (e) { /* 이미 잃음 */ } }
  const box = $('#glMapExp'); if (box) box.remove();
}
const glbSleep = (ms) => new Promise((r) => setTimeout(r, ms));
// 한 장 — 뷰박스 영역(vb)을 pw×ph px로. 타일을 다 받을 때까지(시간 제한) 기다린 뒤 그 그림(data URL). 못 받으면 null
async function glbSnap(cam, vb, pw, ph, fast) {
  const ml = await glbLoadLib(); if (!ml) return null;
  let m;
  try { m = glbExpMap(ml); } catch (e) { return null; }
  clearTimeout(_glb.expT);
  const t0 = performance.now();
  const box = m.getContainer();
  if (box.__w !== pw || box.__h !== ph) { box.__w = pw; box.__h = ph; box.style.width = pw + 'px'; box.style.height = ph + 'px'; m.resize(); }
  const col = (S.typhoon && S.typhoon.landFill) || '#12325A';
  if (m.__col !== col) { m.__col = col; glbSetLand(m, col); }
  const v = glbView(cam, MAP.proj, pw / vb.w, vb.x, vb.y, pw, ph);
  if (!(v.zoom >= -2)) return null;   // 너무 줄임(MapLibre 최소 배율 밖)
  m.jumpTo({ center: [v.lng, v.lat], zoom: v.zoom });
  const e0 = m.__err;
  let done = false;
  for (;;) {
    try { m.redraw(); done = m.loaded() && m.areTilesLoaded(); } catch (e) { done = false; }
    if (done) break;
    if (performance.now() - t0 > GLB_SNAP_MS) break;
    await glbSleep(30);
  }
  _glb.expT = setTimeout(glbDropExp, 30000);
  if (!done || m.__err > e0 || !m.__ok) return null;
  let url = null;
  try { m.redraw(); url = m.getCanvas().toDataURL(fast ? 'image/jpeg' : 'image/png', fast ? 0.92 : undefined); } catch (e) { url = null; }
  _glb.snaps++; _glb.snapMs = performance.now() - t0;
  return url && url.length > 32 ? url : null;
}
// 추출 한 장씩 차례로(숨은 지도 하나를 같이 쓴다)
function glbQueue(fn) { const p = _glbQ.then(fn, fn); _glbQ = p.catch(() => {}); return p; }
// 복제본의 지도 위치 — 실제로 그려진 변환(끌기 중 CSS 변환이 있으면 그것)
function glbCamOf(bg) {
  const re = /translate\(\s*(-?[\d.e+-]+)(?:px)?[\s,]+(-?[\d.e+-]+)(?:px)?\s*\)\s*scale\(\s*(-?[\d.e+-]+)\s*\)/;
  const m = re.exec((bg.style && bg.style.transform) || '') || re.exec(bg.getAttribute('transform') || '');
  return m ? { x: +m[1], y: +m[2], s: +m[3] } : null;
}
// 복제본을 파란 지도로 되돌린다(GL 그림을 못 얻음)
function glbCloneFallback(clone) {
  clone.querySelectorAll('[data-glbhid]').forEach((n) => { n.style.display = ''; });
  const now = performance.now();
  if (now - _glb.warnAt > 8000) { _glb.warnAt = now; status('가벼운 지도 타일을 못 받아 이번 그림은 파란 지도로 그렸어요', true, 'warn'); }
}
// svgToImage·svgBlob·previewPng: GL 지도를 보이던 화면의 복제본이면 그 영역(viewBox — 없으면 프레임)의 GL 그림을 #bgMapT 맨 아래에 넣는다.
// W×H = 그 영역을 그릴 출력 px. fast = 미리보기(틸트 그림 — JPEG로 빨리). 넣었으면 true, 대상 아님 = undefined, 못 넣어 파란 지도로 = false
async function glbInlineClone(clone, W, H, viewBox, fast) {
  const bg = clone && clone.querySelector('#bgMapT');
  if (!bg || bg.getAttribute('data-glb') !== '1') return undefined;
  const cam = glbCamOf(bg) || { x: S.map.x, y: S.map.y, s: S.map.s };
  const p = String(viewBox || clone.getAttribute('viewBox') || '0 0 1920 1080').trim().split(/[\s,]+/).map(Number);
  const vb = { x: p[0] || 0, y: p[1] || 0, w: p[2] || 1920, h: p[3] || 1080 };
  const kx = (+W || vb.w) / vb.w;
  // 타일이 있는 위도 띠만 그린다 — 밖은 바다(#typhoonOcean)
  const [b0, b1] = glbBand(cam, MAP.proj);
  const y0 = Math.max(vb.y, b0), y1 = Math.min(vb.y + vb.h, b1);
  const oc = clone.querySelector('#typhoonOcean'); if (oc) oc.style.display = '';   // 바탕(띠 밖·그림 가장자리)
  if (!(y1 > y0)) return true;
  let pw = Math.max(1, Math.round(vb.w * kx)), ph = Math.max(1, Math.round((y1 - y0) * kx));
  const f = Math.min(1, GLB_SNAP_MAX / pw, GLB_SNAP_MAX / ph);
  if (f < 1) { pw = Math.max(1, Math.round(pw * f)); ph = Math.max(1, Math.round(ph * f)); }
  const reg = { x: vb.x, y: y0, w: vb.w, h: y1 - y0 };
  let url = await glbQueue(() => glbSnap(cam, reg, pw, ph, !!fast));
  // 타일 하나가 잠깐 실패해도 영상 한 프레임만 파란 지도로 튀지 않게 — 추출용 지도를 새로 만들어 한 번 더(받은 타일은 HTTP 캐시)
  if (!url && navigator.onLine !== false) url = await glbQueue(() => { glbDropExp(); return glbSnap(cam, reg, pw, ph, !!fast); });
  if (!url) { glbCloneFallback(clone); return false; }
  const s = cam.s || 1;
  const im = document.createElementNS('http://www.w3.org/2000/svg', 'image');
  im.setAttribute('data-glbimg', '1');
  im.setAttribute('x', (reg.x - cam.x) / s); im.setAttribute('y', (reg.y - cam.y) / s);
  im.setAttribute('width', reg.w / s); im.setAttribute('height', reg.h / s);
  im.setAttribute('preserveAspectRatio', 'none');
  im.setAttribute('href', url);
  bg.insertBefore(im, bg.firstChild);
  return true;
}
// 추출 전에 — 화면 지도가 불러오는 중이면 끝날 때까지(최대 GLB_WAIT_MS) 기다린다. 그래야 복제본이 '보일 화면'(GL 또는 대체 파란 지도)을 담는다
async function glbSettle() {
  if (!glbActive()) return;
  if (_glb.state === 'off') glbSync(true);
  const t0 = performance.now();
  while ((_glb.state === 'loading' || _glb.state === 'off') && glbActive() && performance.now() - t0 < GLB_WAIT_MS + 1000) await glbSleep(60);
}
const glbPending = () => glbActive() && (_glb.state === 'loading' || _glb.state === 'off') && S.res !== '1920x1080-vf';

// ---------- 렌더 전 미리 받기(js/export-video.js prefetchRenderTiles) ----------
// TileJSON(타일 주소 틀·배율 범위) — 디스크 캐시는 서버 max-age만큼만 두므로 타일 판(버전)이 바뀌면 따라간다. MapLibre도 같은 걸 받는다
async function glbTileJson() {
  if (_glb.tj && performance.now() - _glb.tjAt < 600000) return _glb.tj;
  try {
    const r = await tileFetch(GLB_TILES);
    const tj = JSON.parse(new TextDecoder().decode(r.data));
    if (!tj || !Array.isArray(tj.tiles) || !tj.tiles[0]) return null;
    _glb.tj = tj; _glb.tjAt = performance.now();
    return tj;
  } catch (e) { return null; }
}
// 카메라 프레임들(cams: camAt 값)을 추출할 때(glbInlineClone과 같은 영역·그림 크기 → 같은 배율) MapLibre가 쓸 벡터 타일 주소.
// 3D로 기울인 프레임은 블리드 영역(camBleedViewBox), 평면은 프레임. 벡터 타일(512)은 배율을 내림(floor)해 고른다(MapLibre coveringZoomLevel).
async function glbPrefetchUrls(cams) {
  const tj = await glbTileJson(); if (!tj) return [];
  const tmpl = tj.tiles[0], zmin = +tj.minzoom || 0, zmax = tj.maxzoom == null ? 14 : +tj.maxzoom;
  const [W] = RES[S.res].size;
  const { cx0, cy0, scale } = MAP.proj;
  const out = new Set();
  for (const c of cams) {
    const tilt = Math.abs(+c.rx || 0) > 0.05 || Math.abs(+c.ry || 0) > 0.05 || Math.abs(+c.rz || 0) > 0.05;
    const B = tilt ? CAM_BLEED : 0;
    const vb = { x: -1920 * B, y: -1080 * B, w: 1920 * (1 + 2 * B), h: 1080 * (1 + 2 * B) };
    let k = Math.round(W * (1 + 2 * B)) / vb.w;
    const [b0, b1] = glbBand(c, MAP.proj);
    const y0 = Math.max(vb.y, b0), y1 = Math.min(vb.y + vb.h, b1);
    if (!(y1 > y0)) continue;
    k *= Math.min(1, GLB_SNAP_MAX / (vb.w * k), GLB_SNAP_MAX / ((y1 - y0) * k));
    const zoom = glbView(c, MAP.proj, k, vb.x, y0, vb.w * k, (y1 - y0) * k).zoom;
    if (!(zoom >= -2)) continue;
    const z = Math.max(zmin, Math.min(zmax, Math.floor(zoom))), n = Math.pow(2, z), s = +c.s || 1;
    const ll = (x, y) => { const mx = (x - c.x) / s / scale + cx0, my = cy0 - (y - c.y) / s / scale; return [mx * 180 / Math.PI, Math.max(-GLB_MERC_LAT, Math.min(GLB_MERC_LAT, (2 * Math.atan(Math.exp(my)) - Math.PI / 2) * 180 / Math.PI))]; };
    const a = ll(vb.x, y0), b = ll(vb.x + vb.w, y1);
    const tx0 = Math.floor(_lon2xt(a[0], n)), tx1 = Math.floor(_lon2xt(b[0], n));
    const ty0 = Math.max(0, Math.floor(_lat2yt(a[1], n))), ty1 = Math.min(n - 1, Math.floor(_lat2yt(b[1], n)));
    if ((tx1 - tx0 + 1) * (ty1 - ty0 + 1) > 400) continue;   // 이상하게 넓으면 건너뜀(렌더 중에 받는다)
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      const X = ((tx % n) + n) % n;
      out.add(tmpl.replace('{z}', z).replace('{x}', X).replace('{y}', ty));
    }
  }
  return [...out];
}

// ---------- 메뉴 ----------
// 지도 배경 팝오버의 상태 줄·다시 시도(js/map-render.js wireBasemap이 열 때·고를 때 부른다)
function glbUi() {
  const st = $('#bmGlState'), rt = $('#bmGlRetry');
  if (!st) return;
  let t;
  if (S.res === '1920x1080-vf') t = '노말 VF 화면에서는 아직 못 써요 — 파란 지도로 그려요';
  else if (_glb.state === 'loading') t = '불러오는 중… (처음엔 지도 엔진·타일을 받아요)';
  else if (_glb.state === 'ready') t = `WebGL로 그리는 중 · 처음 표시 ${(_glb.readyMs / 1000).toFixed(1)}초`;
  else if (_glb.state === 'fail') t = '못 불러와 파란 지도로 그려요 — ' + (GLB_WHY[_glb.why] || _glb.why);
  else t = '고르면 지도 엔진과 타일을 불러와요';
  st.textContent = t;
  st.dataset.state = _glb.state;
  if (rt) rt.style.display = _glb.state === 'fail' && S.res !== '1920x1080-vf' ? '' : 'none';
}
function glbWire() {
  const rt = $('#bmGlRetry');
  if (rt) rt.onclick = (e) => { e.stopPropagation(); glbRetry(); glbUi(); };
  const a = $('#bmGlAttr'); if (a) a.textContent = GLB_ATTR;
  const b = $('#glMapAttr'); if (b) b.textContent = GLB_ATTR;
}
