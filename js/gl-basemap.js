/* [모듈] js/gl-basemap.js — 태풍 지도 배경 '가벼운 지도 (WebGL · 시험)'·'Mapbox 실시간 타일': 벡터 타일(OpenFreeMap) 또는 Mapbox 주소의 그림 타일을 MapLibre GL(vendor/)이 GPU로 그린다 — 화면은 아트보드 뒤 캔버스(지도 위치·투영 1:1), 추출·틸트·영상·AE는 그 프레임 그림을 복제본에 넣고, 못 쓰면 파란 지도로 */
'use strict';

// ===================== 가벼운 지도(WebGL · 시험) · Mapbox 실시간 타일 =====================
// 구글 지도·Mapbox GL과 같은 방식 — 지도 '그림'(래스터 타일)을 받지 않고 도형 자료(벡터 타일)를 받아 브라우저의 WebGL(웹용 OpenGL)로 그린다.
// 'Mapbox 실시간 타일'(basemap 'mapbox')도 2026-10-12부터 이 엔진으로 그린다(옛 SVG <image> 타일 길은 없앴다): 넣어 둔 Mapbox 주소의 그림 타일을
//   가벼운 지도의 위성 사진과 같은 래스터 소스로(glbMbxSrc) — 화면·끌기·휠·카메라 재생·틸트·추출·렌더 전 미리 받기·디스크 캐시·출처가 같은 길이다.
//   다른 점: 넣어 둔 주소만(기본 출처 없음), 벡터로 바꾸지 않는다(주소 없음·못 알아봄·타일 실패 = 파란 지도 + 까닭), 다른 서버의 {z}/{x}/{y} 타일 틀도 받는다.
//   두 모드는 glbMode()로 가르고, 모드가 바뀌면(메뉴·되돌리기·작업 열기) 지도를 새로 만들어 처음 표시처럼 다시 불러온다(_glbSync → glbReset).
// 다른 지도 배경(파란·밝은/어두운 위성)의 코드 길은 건드리지 않는다: 이 두 모드일 때만 renderTyphoon이 GL을 보이고(glbMarkHidden·glbSync),
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
// 위성 사진(10-10, S.typhoon.glSat — 기본 1): 사용자가 'Mapbox 실시간 타일'에 넣어 둔 Mapbox 주소(localStorage — js/map-render.js mapboxUrlRaw)가 있으면
//   그 스타일을 Mapbox Static Tiles 그림 타일(래스터 — 다른 지도 라이브러리용으로 공식 제공)로 받아 맨 아래에 깐다(glbSatSrc). 그때는 자체 스타일(육지·바다 면·나라 경계)을
//   빼고 위성 사진만 — Studio에서 꾸민 모습 그대로(그 스타일은 나라 경계를 꺼 두었다). 주소가 없으면 데스크톱 기본 출처(비공개 토큰 + 기본 스타일 GLB_SAT_STYLE —
//   glbSatBuiltinUrl), 그것도 없거나 위성 타일을 한 장도 못 받으면 벡터만(알림). Mapbox 벡터 스타일(mapbox:// 소스·글꼴·스프라이트)을 MapLibre로 직접 그리지는 않는다(약관·호환성).
const GLB_LIB = 'vendor/maplibre-gl/maplibre-gl.js';           // MapLibre GL JS 5.24.0(BSD-3 — vendor/maplibre-gl/LICENSE.txt). 이 모드를 고를 때만 읽는다
const GLB_TILES = 'https://tiles.openfreemap.org/planet';      // OpenFreeMap 벡터 타일(TileJSON — 키·가입 없음, 무료, 출처 표기)
const GLB_ATTR = '지도 자료 © OpenStreetMap 기여자 · © OpenMapTiles · OpenFreeMap';
const GLB_ATTR_MBX = '지도 © Mapbox © OpenStreetMap · 위성 사진 © Maxar';   // 위성 사진을 깔 때(Mapbox 출처 표기 문서 — 위성은 Maxar)
const GLB_ATTR_MBXS = '지도 © Mapbox © OpenStreetMap (위성 사진이 들어 있으면 © Maxar)';   // Mapbox 실시간 타일 — 사용자 스타일(위성인지 모름)
const GLB_ATTR_XYZ = '지도 타일 © 넣어 둔 주소의 지도 제공자';                              // Mapbox 실시간 타일에 다른 서버 {z}/{x}/{y} 틀을 넣었을 때
const GLB_SAT_MAXZ = 22;          // Mapbox 그림 타일 최대 배율
const GLB_XYZ_MAXZ = 19;          // 다른 서버 타일 틀의 최대 배율(모름 — 흔한 값. 더 당기면 MapLibre가 늘려 그린다)
const GLB_SAT_STYLE = 'supermanpasa/cmsg6825m002h01r6eufdeg24';   // 기본 위성 사진 스타일(사용자 Mapbox Studio) — 토큰은 코드에 없고 데스크톱 비공개 파일에만(glbSatBuiltinUrl)
const GLB_SEA = '#0b2240';        // 바다 — 파란 지도 바다 그라디언트(#0e2a4e → #081a30)의 가운데
const GLB_BORDER = '#8fb3dc';     // 나라 경계(옅게)
const GLB_SNAP_MAX = 4096;        // 추출 그림 한 변 최대(px) — 틸트 블리드(5760)는 줄여 굽는다
const GLB_WAIT_MS = 12000;        // 처음 표시: 타일을 이만큼 못 받으면 파란 지도로
const GLB_SNAP_MS = 15000;        // 추출 한 장: 타일 기다리기 한도
const GLB_MERC_LAT = 85.051129;   // 웹 메르카토르 끝 위도
const GLB_WHY = {
  offline: '인터넷 연결이 없어요', lib: '지도 엔진 파일(vendor/maplibre-gl)을 못 읽었어요', webgl: '이 PC에서 WebGL을 쓸 수 없어요',
  tiles: '지도 서버(OpenFreeMap)에서 타일을 못 받았어요', timeout: '지도 서버 응답이 너무 늦어요', lost: 'GPU가 초기화돼 지도를 잃었어요',
  net: '위성 사진과 벡터 지도를 모두 못 받았어요. 인터넷(지도 서버) 연결을 확인해 주세요',   // 위성 사진을 골랐는데 둘 다 실패(glbFail이 tiles·timeout을 바꿈)
  // Mapbox 실시간 타일(10-12) — 벡터로 바꾸지 않고 파란 지도로
  nourl: 'Mapbox 주소가 없어요 — 지도 배경 메뉴 아래 칸에 넣고 [적용]을 눌러 주세요',
  badurl: '넣어 둔 Mapbox 주소를 알아보지 못했어요',   // 무엇이 틀렸는지는 glbFail이 glbUrlWhy로 덧붙인다
  mbxauth: 'Mapbox가 타일을 막았어요(401·403) — 토큰이나 URL 제한을 확인해 주세요',
  mbxtiles: 'Mapbox(넣어 둔 주소의 지도 서버)에서 타일을 못 받았어요',
};
// 상태: off(아직) · loading(불러오는 중 — 화면은 파란 지도) · ready(GL로 그림) · fail(파란 지도로 대체, why)
// satBad = 한 장도 못 받은 위성 타일 주소(이번 실행 동안 벡터만 — 다시 시도·위성 사진 다시 고르기·주소가 바뀌면 풂), satWhy = 그 까닭
// mode = 지금 지도를 만든 배경 종류('gl' · 'mapbox' — glbStart), mx* = Mapbox 실시간 타일 출처 해석 캐시, help = 주소 안내를 사용자가 펼치거나 접었나(null = 아직)
const _glb = { lib: null, live: null, exp: null, state: 'off', why: '', t0: 0, readyMs: 0, view: '', col: '', poll: 0, expT: 0, warnAt: 0, online: false, snaps: 0, snapMs: 0, proto: false, tj: null, tjAt: 0,
  tw: 0, satBad: '', satWhy: '', satW: 0, satT0: 0, mbRaw: null, mbBust: null, mbDef: null, mbSrc: null, mode: '', mxRaw: null, mxBust: null, mxSrc: null, help: null };
let _glbQ = Promise.resolve();

// 지금 태풍 지도 배경이 이 엔진으로 그리는 종류인가 — 'gl'(가벼운 지도) · 'mapbox'(Mapbox 실시간 타일) · ''(다른 배경)
function glbMode() {
  if (!isTyphoon() || !S.typhoon) return '';
  const b = S.typhoon.basemap;
  return b === 'gl' || b === 'mapbox' ? b : '';
}
const glbIsMbx = () => glbMode() === 'mapbox';
const glbName = () => (glbIsMbx() ? 'Mapbox 지도' : '가벼운 지도');   // 알림 글의 이름
// 지금 태풍 지도 배경이 이 엔진인가(준비와 상관없이)
function glbActive() { return !!glbMode(); }
// 화면에 GL을 보이는가 — 준비됐고 노말 VF가 아님(VF는 패널 자르기·진입 슬라이드가 SVG 래퍼에 걸려 뒤 캔버스로는 못 맞춘다 → 파란 지도)
// 지도를 만든 배경 종류와 지금 종류가 같아야 한다(가벼운 지도 ↔ Mapbox 실시간 타일로 바꾼 직후엔 아직 옛 지도 — _glbSync가 새로 만든다)
function glbShowing() { return glbActive() && _glb.state === 'ready' && _glb.mode === glbMode() && S.res !== '1920x1080-vf'; }

// 자체 스타일 — 방송 지도 결(어두운 남색 바다·육지, 옅은 나라 경계, 글자 없음 → 글꼴·아이콘 요청 없음). 육지 색은 태풍 패널의 육지 색(T.landFill).
// OpenMapTiles에는 '육지' 면이 없어 바탕 = 육지, water(바다·호수) = 바다로 칠한다. 해안선 줄은 안 긋는다(물 면 테두리는 타일·날짜변경선 경계에서 줄이 생긴다).
// sat(glbSatSrc·glbMbxSrc 결과)가 있으면 그림 타일 스타일 — 바탕(바다색: 못 받은 칸·받기 전) + 그림 타일 하나. 벡터 타일은 안 받는다(육지·바다 면·경계를 다 빼므로).
//   raster-fade-duration 0 = 받자마자 다 보인다(추출 그림이 반쯤 비친 타일을 담지 않게). 최대 배율·출처는 출처마다(없으면 Mapbox 위성 값)
function glbStyle(T, sat) {
  if (sat) {
    return {
      version: 8, name: 'wcg-light-sat',
      sources: { sat: { type: 'raster', tiles: sat.tiles.slice(), tileSize: sat.tileSize, maxzoom: sat.maxzoom || GLB_SAT_MAXZ, attribution: glbAttrOf(sat) } },
      layers: [
        { id: 'bg', type: 'background', paint: { 'background-color': GLB_SEA } },
        { id: 'sat', type: 'raster', source: 'sat', paint: { 'raster-fade-duration': 0 } },
      ],
    };
  }
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

// 위성 사진 출처 — 사용자가 넣어 둔 Mapbox 주소(raw)에서 그림 타일 주소 틀을 만든다. 못 알아보면 null(벡터만).
//  - 스타일 주소(styles/v1/{user}/{style} — 스타일·WMTS·공유 .html·타일 틀 모두, 또는 mapbox://styles/{user}/{style}) →
//    Static Tiles 512px @2x(Studio에서 꾸민 그대로 서버가 그린 그림, tileSize 512)
//  - v4 래스터(/v4/mapbox.satellite 등) → 그 그림 타일(256px @2x, tileSize 256)
//  토큰(access_token)은 주소에서 그대로 옮긴다(코드·저장소엔 없음). 비밀 토큰(sk.)은 안 받는다(앱 쪽에 두면 안 되는 토큰 — Mapbox 문서).
//  bust = '적용'으로 다시 받기(js/map-render.js _mbxCacheBust — Mapbox 모드와 같은 표시).
function glbSatSrc(raw, bust) {
  const u = String(raw || '').trim(); if (!u) return null;
  const tok = (u.match(/access_token=([^&\s#]+)/) || [])[1] || ''; if (!tok || /^sk\./i.test(tok)) return null;
  const tail = 'access_token=' + tok + (bust ? '&_cb=' + bust : '');
  const st = u.match(/styles\/v1\/([^\/?#\s]+)\/([^\/?#\s]+)/) || u.match(/^mapbox:\/\/styles\/([^\/?#\s]+)\/([^\/?#\s]+)/);
  if (st) {
    const id = st[2].replace(/\.html$/, '');
    return { kind: 'style', tileSize: 512, tiles: ['https://api.mapbox.com/styles/v1/' + st[1] + '/' + id + '/tiles/512/{z}/{x}/{y}@2x?' + tail] };
  }
  const v4 = u.match(/\/v4\/([\w.-]+)/);
  if (v4) return { kind: 'v4', tileSize: 256, tiles: ['https://api.mapbox.com/v4/' + v4[1].replace(/\.json$/, '') + '/{z}/{x}/{y}@2x.jpg90?' + tail] };   // TileJSON 주소(….json)도
  return null;
}
// 'Mapbox 실시간 타일' 배경의 출처(10-12 — WebGL로 바꾸며): 위 해석 그대로(Studio의 Share → Third party 주소 — WMTS·CARTO·ArcGIS Online 모두
// …/styles/v1/{user}/{style}… 꼴이라 Static Tiles 512 @2x로) + 옛 SVG 길이 받던 다른 지도 서버의 {z}/{x}/{y} 타일 틀(https만, 토큰 없어도 — 256으로 본다).
// 출처 표기를 함께 단다(attr). 못 알아보면 null — 까닭은 glbUrlWhy.
function glbMbxSrc(raw, bust) {
  const s = glbSatSrc(raw, bust);
  if (s) { s.attr = GLB_ATTR_MBXS; return s; }
  const u = String(raw || '').trim();
  if (!/^https:[/][/]\S+$/i.test(u) || !/\{z\}/.test(u) || !/\{x\}/.test(u) || !/\{y\}/.test(u) || /mapbox\.com[/]/i.test(u)) return null;   // Mapbox 주소인데 위에서 못 알아봄(토큰 없음·비밀 토큰) = 못 씀
  let t = u.replace(/\{r\}/g, '@2x').replace(/\{s\}/g, 'a');   // 레티나 표시·서브도메인 자리(MapLibre가 모르는 칸)
  if (bust) t += (t.indexOf('?') >= 0 ? '&' : '?') + '_cb=' + bust;
  return { kind: 'xyz', tileSize: 256, maxzoom: GLB_XYZ_MAXZ, tiles: [t], attr: GLB_ATTR_XYZ };
}
// 넣은 주소를 왜 못 쓰는지 한 줄(지도 배경 메뉴 주소 칸 아래 — glbUrlNote) · 쓸 수 있거나 비었으면 ''.
// xyzOk = Mapbox 실시간 타일(다른 서버 {z}/{x}/{y} 틀도 받음) — 아니면 가벼운 지도 위성 사진(Mapbox 스타일·v4 래스터만)
function glbUrlWhy(raw, xyzOk) {
  const u = String(raw || '').trim();
  if (!u || (xyzOk ? glbMbxSrc(u) : glbSatSrc(u))) return '';
  const tok = (u.match(/access_token=([^&\s#]+)/) || [])[1] || '';
  if (/^sk\./i.test(tok)) return '비밀 토큰(sk.)이 든 주소예요 — 공개 토큰(pk.)이 든 주소를 넣어 주세요';
  if (/studio\.mapbox\.com/i.test(u)) return 'Mapbox Studio 화면 주소예요 — 스타일의 Share → Third party에서 Integration URL을 복사해 넣어 주세요';
  const mb = /mapbox\.com[/]/i.test(u) || /^mapbox:[/][/]/i.test(u);   // ([/] — 시험의 코드 자르기가 '//'를 주석으로 읽지 않게)
  if (mb && !tok) return '토큰(access_token)이 빠졌어요 — Integration URL을 끝까지 통째로 복사해 넣어 주세요';
  if (/^mapbox:[/][/]/i.test(u)) return 'mapbox:// 타일셋 주소는 못 써요 — 스타일의 Integration URL(https://api.mapbox.com/styles/v1/…)을 넣어 주세요';
  if (mb) return 'Mapbox 주소지만 스타일(…/styles/v1/…)이나 v4 래스터 주소가 아니에요 — 스타일의 Integration URL을 넣어 주세요';
  if (!/^https?:[/][/]/i.test(u)) return '주소 모양이 아니에요 — https://로 시작하는 주소를 통째로 붙여 넣어 주세요';
  if (!xyzOk) return 'Mapbox 주소가 아니에요 — 가벼운 지도의 위성 사진은 Mapbox 스타일 주소만 써요';
  if (/^http:/i.test(u)) return 'http 주소는 못 써요 — https:// 주소를 넣어 주세요';
  return '알아보지 못한 주소예요 — Mapbox 스타일 주소(…/styles/v1/…)나 {z}/{x}/{y}가 든 타일 주소를 넣어 주세요';
}
// Mapbox 실시간 타일 — 지금 쓸 출처(넣어 둔 주소만, 기본 출처 없음). 주소·다시 받기 표시가 같으면 다시 해석하지 않는다
function glbMbxSrcNow() {
  const raw = mapboxUrlRaw(), bust = _mbxCacheBust || '';
  if (raw !== _glb.mxRaw || bust !== _glb.mxBust) { _glb.mxRaw = raw; _glb.mxBust = bust; _glb.mxSrc = glbMbxSrc(raw, bust); }
  return _glb.mxSrc;
}
// 데스크톱 기본 출처 — 개인 주소가 없을 때 쓸 기본 스타일 주소(비공개 공개용 토큰 pk. — desktop/private/mapbox.token, Git 제외. 메인이 preload로 넘긴다).
// 웹·자동 점검·파일 없음 = ''. 토큰은 화면·프로젝트·로그에 내지 않는다(오류 글은 glbMake가 가린다)
function glbSatBuiltinUrl() {
  let tok = '';
  try { const d = typeof window !== 'undefined' && window.wcgDesktop; if (d && typeof d.mapboxToken === 'function') tok = String(d.mapboxToken() || '').trim(); } catch (e) { tok = ''; }
  return /^pk\.[\w.-]+$/.test(tok) ? 'https://api.mapbox.com/styles/v1/' + GLB_SAT_STYLE + '?access_token=' + tok : '';
}
// 지금 쓸 위성 출처 — 넣어 둔 Mapbox 주소가 먼저, 못 쓰면(없음·못 알아봄) 기본 출처(def: 1). 주소·다시 받기 표시·기본 토큰이 같으면 다시 해석하지 않는다(렌더·끌기마다 불린다)
function glbSatSrcNow() {
  const raw = mapboxUrlRaw(), bust = _mbxCacheBust || '', def = glbSatBuiltinUrl();
  if (raw !== _glb.mbRaw || bust !== _glb.mbBust || def !== _glb.mbDef) {
    _glb.mbRaw = raw; _glb.mbBust = bust; _glb.mbDef = def;
    let s = glbSatSrc(raw, bust);
    if (!s) { s = glbSatSrc(def, bust); if (s) s.def = 1; }
    _glb.mbSrc = s;
  }
  return _glb.mbSrc;
}
const glbSatPref = (T) => (T && T.glSat != null ? (+T.glSat ? 1 : 0) : 1);   // 고른 값(옛 작업 = 1 위성 사진)
// 이 작업의 가벼운 지도가 위성 사진을 까는가(고른 값 + 쓸 수 있는 Mapbox 출처, 노말 VF 아님 — VF는 늘 파란 지도) — 격자 기본값(js/typhoon-core.js typhoonGridIsSat)이 쓴다.
// 불러오는 중·실패와는 무관하다(그때그때 눈 단추가 다른 칸을 바꾸지 않게).
function glbSatOn(T) { return !!(T && T.basemap === 'gl' && S.res !== '1920x1080-vf' && glbSatPref(T) && glbSatSrcNow()); }
// 지금 그릴 그림 타일 출처 — 끈 경우·주소 없음·한 장도 못 받은 주소(satBad)면 null(벡터만).
// Mapbox 실시간 타일이면 넣어 둔 주소(glbMbxSrcNow) — null이면 그리지 않는다(파란 지도 — glbStart·glbSatFail이 실패로)
function glbSatNow() {
  if (glbIsMbx()) { const m = glbMbxSrcNow(); return m && m.tiles[0] !== _glb.satBad ? m : null; }
  if (!glbSatPref(S.typhoon)) return null;
  const s = glbSatSrcNow();
  return s && s.tiles[0] !== _glb.satBad ? s : null;
}
// 위성 사진을 골랐고 출처도 있는데 한 장도 못 받아 벡터만 그리는 중인가(알림·안내 한 줄) — 가벼운 지도만(Mapbox 실시간 타일은 벡터로 안 바꾼다)
function glbSatMissed() { if (glbIsMbx()) return false; const s = glbSatPref(S.typhoon) ? glbSatSrcNow() : null; return !!(s && _glb.satBad === s.tiles[0]); }
const glbKeyOf = (sat) => (sat ? sat.tiles[0] : 'vec');   // 지도 하나의 스타일 표시(바뀌면 setStyle)
const glbAttrOf = (sat) => (sat ? sat.attr || GLB_ATTR_MBX : GLB_ATTR);   // 그 스타일의 출처 표기
const glbAttrNow = () => (_glb.live && _glb.state !== 'fail' && _glb.live.__attr ? _glb.live.__attr : glbAttrOf(glbSatNow()));

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

// 디스크 캐시 길(데스크톱 앱) — OpenFreeMap 주소(TileJSON·벡터 타일)·Mapbox 위성 그림 타일을 'wcgtile://'로 바꿔(transformRequest) MapLibre가 우리 받기(tileFetch →
// 메인 디스크 캐시 desktop/tile-cache.js — 토큰은 열쇠에서 뺀다)로 받게 한다. 한 번 본 타일은 다음엔 이 PC에서(버튼 없음). 웹·점검(브리지 없음)은 그대로 https.
// 그림 타일도 ArrayBuffer로 넘기면 MapLibre가 ImageBitmap으로 풀어 캔버스가 오염되지 않는다(추출 toDataURL 가능).
const GLB_PROTO = 'wcgtile';
const glbCacheOn = () => !!(window.wcgDesktop && typeof window.wcgDesktop.tileGet === 'function');
function glbTransform(url) {
  return (_glb.proto && /^https:\/\/(tiles\.openfreemap\.org|api\.mapbox\.com)\//.test(url)) ? { url: GLB_PROTO + '://' + url.slice(8) } : { url };
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
  const sat = glbSatNow();
  const m = new ml.Map({
    container: box, style: glbStyle(S.typhoon, sat), interactive: false, attributionControl: false,
    renderWorldCopies: true, fadeDuration: 0, minZoom: -2, maxZoom: 18, trackResize: !exp,
    transformConstrain: (center, zoom) => ({ center, zoom }),   // 화면을 세계 안으로 밀어 넣지 않는다(기본값은 극지방이 보이면 중심을 옮겨 앱 지도와 어긋난다)
    pixelRatio: exp ? 1 : Math.min(3, window.devicePixelRatio || 1), maxCanvasSize: [GLB_SNAP_MAX, GLB_SNAP_MAX],
    canvasContextAttributes: { antialias: false, preserveDrawingBuffer: false },   // 선·면 가장자리는 MapLibre가 셰이더로 다듬는다(MSAA 불필요 — 4096 그림이면 GPU 메모리 수백 MB). 추출은 그린 직후 같은 작업 안에서 읽는다
    cancelPendingTileRequestsWhileZooming: false,
    transformRequest: glbTransform,   // 데스크톱이면 디스크 캐시 길로(위 GLB_PROTO)
  });
  m.__key = glbKeyOf(sat); m.__sat = !!sat; m.__attr = glbAttrOf(sat); glbCount0(m);
  // 받은 타일·오류를 소스마다 센다(omt = 벡터, sat = 위성 그림). 오류 글에서 토큰은 지운다(주소가 실려 올 수 있다)
  m.on('sourcedata', (e) => { if (e && e.tile && (e.sourceId === 'omt' || e.sourceId === 'sat')) { m.__ok++; m.__okS[e.sourceId]++; } });
  m.on('error', (e) => {
    m.__err++;
    if (e && (e.sourceId === 'omt' || e.sourceId === 'sat')) m.__errS[e.sourceId]++;
    m.__errMsg = String((e && e.error && e.error.message) || 'error').replace(/access_token=[^&\s"')]+/g, 'access_token=…').slice(0, 200);
    const st = +(e && e.error && e.error.status) || +((/\b([45]\d\d)\b/.exec(m.__errMsg) || [])[1]) || 0;   // 'tile http 401'(우리 받기)·AJAXError.status(https 직접)
    if (st) m.__errSt = st;
  });
  if (!exp) {
    m.on('resize', () => glbSync(true));   // 창·아트보드 크기가 바뀌면 배율을 다시
    m.on('webglcontextlost', () => { if (_glb.live === m) glbFail('lost'); });
  }
  return m;
}
// 받은 타일·오류 셈 비우기
function glbCount0(m) { m.__ok = 0; m.__err = 0; m.__okS = { omt: 0, sat: 0 }; m.__errS = { omt: 0, sat: 0 }; m.__errMsg = ''; m.__errSt = 0; }
// 위성 사진 켜기·끄기·주소가 바뀌면 스타일을 통째로 바꾼다(diff 없이 — 소스가 바뀐다). 카메라는 그대로. __key·__sat = 지금 이 지도의 스타일
function glbRestyle(m, sat) {
  m.__key = glbKeyOf(sat); m.__sat = !!sat; m.__attr = glbAttrOf(sat); glbCount0(m);
  if (m === _glb.live && _glb.state === 'loading') _glb.tw = performance.now();   // 불러오는 중에 바꾸면 기다린 시간도 처음부터(앞 스타일에서 기다린 시간으로 새 스타일을 실패 판정하지 않게)
  try { m.setStyle(glbStyle(S.typhoon, sat), { diff: false }); } catch (e) { /* 다음 동기화에 */ }
}
// 위성 사진 준비 판정 — ok(받음 — 일부 실패면 받은 데까지) · fail(한 장도 못 받음 → 벡터만으로) · wait. el = 기다린 시간(ms)
function glbSatCheck(m, el) {
  if (!m.__sat) return 'ok';
  let done = false; try { done = m.loaded() && m.areTilesLoaded(); } catch (e) { done = false; }
  if (m.__okS.sat > 0) return done ? 'ok' : 'wait';
  if (m.__errS.sat > 0 && (done || el > 2500)) return 'fail';
  return el > GLB_WAIT_MS ? 'fail' : 'wait';
}
// 위성 타일을 한 장도 못 받았다 — 이 주소는 이번 실행 동안 벡터만(다시 시도·위성 사진 다시 고르기로 풂), 화면 지도도 벡터로, 알림 한 번
// Mapbox 실시간 타일은 벡터로 바꾸지 않는다 — 그 주소 표시만 남기고 파란 지도 + 까닭(glbFail — 다시 시도·[적용]으로 풂)
function glbSatFail(m) {
  const st = m.__errSt;
  if (glbIsMbx()) {
    _glb.satBad = m.__key; _glb.satWhy = '';
    glbFail(navigator.onLine === false ? 'offline' : (st === 401 || st === 403) ? 'mbxauth' : 'mbxtiles');
    return;
  }
  const why = navigator.onLine === false ? GLB_WHY.offline : (st === 401 || st === 403) ? 'Mapbox 토큰이나 URL 제한을 확인해 주세요' : 'Mapbox에서 위성 사진 타일을 못 받았어요';
  const first = _glb.satBad !== m.__key;
  _glb.satBad = m.__key; _glb.satWhy = why;
  glbSync(true);   // 화면 지도 → 벡터(글자 표기도). 영상 렌더 중에도 스타일은 바꾼다(_glbSync — 카메라만 멈춤)
  if (m === _glb.live && m.__sat) glbRestyle(m, glbSatNow());   // 동기화가 못 바꿨으면 여기서 — 위성 실패 판정을 끝없이 되풀이하지 않게
  glbUi();
  // 불러오는 중이면 알림은 끝에 한 번만(준비 = glbReadyNow '벡터만', 벡터도 실패 = glbFail '모두 못 받음') — 경고 두 개가 잇달아 뜨지 않게
  if (first && glbActive() && _glb.state !== 'loading') status('위성 사진을 못 불러와 벡터 지도로 그려요 — ' + why, true, 'warn');
}
// 준비된 화면 지도의 스타일을 바꾼 뒤(위성 사진 ↔ 벡터만) — 위성이면 타일을 지켜보다 한 장도 못 받으면 벡터로, 받으면(벡터면 곧바로) 틸트 그림을 다시
function glbSatWatch() { clearTimeout(_glb.satW); _glb.satT0 = performance.now(); _glb.satW = setTimeout(glbSatPoll, 120); }
function glbSatPoll() {
  _glb.satW = 0;
  const m = _glb.live;
  if (!m || _glb.state !== 'ready' || !glbActive()) return;
  if (m.__sat) {
    const el = performance.now() - _glb.satT0;
    const r = glbSatCheck(m, el);
    if (r === 'fail') { glbSatFail(m); return; }   // → 벡터로 바꾸며 다시 여기(벡터는 곧바로 틸트)
    if (r === 'wait' && el < GLB_WAIT_MS * 2) { _glb.satW = setTimeout(glbSatPoll, 150); return; }
  }
  tiltInvalidate(); if (camActive3d()) applyTilt();   // 틸트 그림에도 바뀐 지도를
}

// 화면 지도 시작(고를 때·이 모드인 작업을 열었을 때 — glbSync가 부른다)
async function glbStart() {
  if (_glb.state !== 'off') return;
  _glb.state = 'loading'; _glb.why = ''; _glb.t0 = _glb.tw = performance.now(); _glb.view = ''; _glb.mode = glbMode();
  glbUi();
  if (!_glb.online) {   // 한 번만 — 다시 연결되면 다시 시도(주소 문제·엔진·WebGL은 연결과 무관), 아트보드 크기가 바뀌면(창·타임라인·사이드바) 배율을 다시
    _glb.online = true;
    window.addEventListener('online', () => { if (glbActive() && _glb.state === 'fail' && !['lib', 'webgl', 'nourl', 'badurl'].includes(_glb.why)) glbRetry(); });
    try { new ResizeObserver(() => { if (_glb.live && glbActive()) glbSync(true); }).observe(fit); } catch (e) { /* 창 크기 'resize'로도 맞춘다 */ }
  }
  // Mapbox 실시간 타일 — 넣어 둔 주소가 없거나 못 알아보면 엔진·타일을 받지 않고 곧바로 파란 지도(까닭 + 메뉴 주소 칸·안내)
  if (_glb.mode === 'mapbox' && !glbMbxSrcNow()) { glbFail(mapboxUrlRaw().trim() ? 'badurl' : 'nourl'); return; }
  // 오프라인 — 웹은 곧바로 파란 지도. 데스크톱(디스크 캐시 길)은 한 번 해 본다: 한 번 본 타일은 이 PC에 있다(기한 지난 것도 준다). 못 받으면 glbPoll이 'offline'으로
  if (navigator.onLine === false && !glbCacheOn()) { glbFail('offline'); return; }
  const ml = await glbLoadLib();
  if (_glb.state !== 'loading') return;
  if (!ml) { glbFail('lib'); return; }
  const host = $('#glMap'), box = $('#glMapIn');
  if (!host || !box) { glbFail('lib'); return; }
  try {
    host.style.display = ''; host.style.visibility = 'hidden';   // 크기가 있어야 타일을 고른다 — 준비될 때까지 안 보이게(위에 파란 지도)
    if (!_glb.live) _glb.live = glbMake(ml, box, false);
    else glbCount0(_glb.live);   // 위성 사진 켜기·주소가 바뀌었으면 아래 glbSync가 스타일을 바꾼다
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
  const el = performance.now() - _glb.tw;   // 기다린 시간(위성 → 벡터로 바꾸면 다시 0부터)
  if (m.__sat) {   // 위성 사진 — 그 그림 타일을 기다린다. 한 장도 못 받으면 벡터만으로 바꿔 처음부터 다시 기다린다(영상 렌더 중에도 — glbSatFail이 스타일을 바꾼다)
    const r = glbSatCheck(m, el);   // Mapbox 실시간 타일도 같은 판정 — 한 장도 못 받으면 벡터 대신 파란 지도(glbSatFail → glbFail)
    if (r === 'ok') { glbReadyNow(); return; }
    if (r === 'fail') { glbSatFail(m); if (_glb.state !== 'loading') return; _glb.tw = performance.now(); _glb.poll = setTimeout(glbPoll, 60); return; }
    if (el > GLB_WAIT_MS) { glbFail('timeout'); return; }   // 받고는 있는데 너무 늦다(벡터와 같은 규칙)
    _glb.poll = setTimeout(glbPoll, 100);
    return;
  }
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
  if (!glbActive()) return;
  if (glbIsMbx()) { status(`Mapbox 실시간 타일 (WebGL) 준비됨 — ${(_glb.readyMs / 1000).toFixed(1)}초`, true, 'ok'); return; }
  const sat = !!(_glb.live && _glb.live.__sat);
  // 위성 사진을 골랐는데 벡터로 준비됨 — 못 받음(불러오는 중엔 알리지 않았다 — glbSatFail) · 출처(Mapbox 주소) 없음. 까닭을 같은 줄에
  if (!sat && glbSatMissed()) status(`가벼운 지도 준비됨 — 위성 사진을 못 받아 벡터만 그려요(${_glb.satWhy})`, true, 'warn');
  else if (!sat && glbSatPref(S.typhoon) && !glbSatSrcNow()) status('가벼운 지도 준비됨 — Mapbox 주소가 없어 벡터만 그려요(지도 배경에서 주소를 넣으면 위성 사진)', true, 'warn');
  else status(`가벼운 지도 (WebGL · 시험)${sat ? ' · 위성 사진' : ''} 준비됨 — ${(_glb.readyMs / 1000).toFixed(1)}초`, true, 'ok');
}
function glbFail(why) {
  clearTimeout(_glb.poll); _glb.poll = 0;
  if ((why === 'tiles' || why === 'timeout') && glbSatMissed()) why = 'net';   // 위성 사진도(먼저 실패) 벡터도 못 받음 — 알림 하나로
  _glb.state = 'fail'; _glb.why = why;
  const host = $('#glMap'); if (host) host.style.display = 'none';
  if (isTyphoon()) renderTyphoon();                 // 파란 지도로 대체
  tiltInvalidate(); if (camActive3d()) applyTilt();
  glbUi();
  if (!glbActive()) return;
  if (why === 'nourl') status('Mapbox 실시간 타일 — 주소가 없어 파란 지도로 그려요(지도 배경 메뉴 아래 칸에 넣고 [적용] · 어디서 복사하는지 안내가 있어요)', true, 'warn');
  else status(glbName() + '를 못 불러와 파란 지도로 그려요 — ' + glbWhyText(why), true, 'warn');
}
// 실패 까닭 글 — 주소를 못 알아봤으면 무엇이 틀렸는지(glbUrlWhy)도
function glbWhyText(why) {
  const t = GLB_WHY[why] || why;
  if (why !== 'badurl') return t;
  const w = glbUrlWhy(mapboxUrlRaw(), true);
  return w ? t + ': ' + w : t;
}
// 지도를 버리고 처음 상태로(엔진은 둔다) — 다시 시도·배경 종류가 바뀜(가벼운 지도 ↔ Mapbox 실시간 타일)
function glbReset() {
  clearTimeout(_glb.poll); _glb.poll = 0; clearTimeout(_glb.satW); _glb.satW = 0;
  for (const k of ['live', 'exp']) { const m = _glb[k]; _glb[k] = null; if (m) { try { m.remove(); } catch (e) { /* 이미 잃음 */ } } }
  const ex = $('#glMapExp'); if (ex) ex.remove();
  _glb.state = 'off'; _glb.why = ''; _glb.satBad = ''; _glb.satWhy = '';
}
// 다시 시도 — 지도 엔진은 두고 지도를 새로 만든다(실패한 타일을 다시 받게 — 못 받은 위성 사진도 다시)
function glbRetry() {
  glbReset();
  glbSync(true);
}
// 지도 배경 팝오버의 [위성 사진 | 벡터만](S.typhoon.glSat — 되돌리기·저장에 따라간다). 다시 '위성 사진'을 누르면 못 받았던 주소도 다시 시도
function glbSetSat(v) {
  const T = S.typhoon; if (!T) return;
  v = v ? 1 : 0;
  const retry = v && !!_glb.satBad;
  if (glbSatPref(T) === v && !retry) { glbUi(); return; }
  if (glbSatPref(T) !== v) { pushUndo(); T.glSat = v; }
  _glb.satBad = ''; _glb.satWhy = '';
  renderTyphoon();   // GL 스타일(glbSync)·격자 기본값(위성 사진 = 끔)
  { const eye = $('#typGridEye'); if (eye) eye.classList.toggle('off', !typhoonGridOn(T)); }
  glbUi();
  status(!v ? '가벼운 지도 — 벡터만' : glbSatNow() ? '가벼운 지도 — 위성 사진(Mapbox)' : '가벼운 지도 — Mapbox 주소가 없어 벡터만 그려요', true);
}
// 지도 배경 팝오버 주소 칸(#bmMbxBox)의 [적용]을 눌렀다(js/map-render.js wireBasemap — 배경은 그대로) — 가벼운 지도면 새 주소로 위성 사진을 다시(실패 중이었으면 처음부터),
// Mapbox 실시간 타일이면 새 주소로 처음부터(못 알아보면 곧바로 파란 지도 + 까닭 — glbStart)
function glbUrlApplied() {
  _glb.satBad = ''; _glb.satWhy = '';
  if (glbIsMbx()) { glbRetry(); glbUi(); return; }
  if (_glb.state === 'fail') glbRetry();
  renderTyphoon();   // 스타일(glbSync — 새 주소면 위성 사진으로)·격자 기본값
  { const eye = $('#typGridEye'); if (eye) eye.classList.toggle('off', !typhoonGridOn(S.typhoon)); }
  glbUi();
}
// 메뉴에서 고름(js/map-render.js wireBasemap — 가벼운 지도·Mapbox 실시간 타일) — 실패했던 거면 다시 시도
function glbPicked() {
  if (_glb.state === 'fail') glbRetry(); else glbSync(true);
  glbUi();
  const mbx = glbIsMbx(), nm = mbx ? 'Mapbox 실시간 타일' : '가벼운 지도 (WebGL · 시험)';
  if (_glb.state === 'ready') status(nm + (!mbx && glbSatPref(S.typhoon) && !glbSatSrcNow() ? ' — Mapbox 주소가 없어 벡터만 그려요' : ''), true);
  else if (S.res !== '1920x1080-vf') status(nm + ' — 불러오는 중…', true);   // 곧 시작(glbStart) — 끝나면 준비·실패 알림이 덮는다(주소가 없으면 곧바로 그 안내)
  else status(`노말 VF 화면에서는 ${mbx ? 'Mapbox 실시간 타일' : '가벼운 지도'}를 아직 못 써요 — 파란 지도로 그려요`, true, 'warn');
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
  // 배경 종류가 바뀌었다(가벼운 지도 ↔ Mapbox 실시간 타일 — 메뉴·되돌리기·작업 열기) — 지도를 새로 만들어 처음 표시처럼(불러오는 동안 파란 지도, 끝에 준비·실패 알림·까닭)
  if (act && _glb.mode && _glb.mode !== glbMode() && _glb.state !== 'off') glbReset();
  // 시작은 지금 그리기(renderTyphoon)가 끝난 뒤에 — 곧바로 실패(오프라인)하면 glbFail이 renderTyphoon을 다시 부르므로 겹치지 않게. glbStart가 다시 부른다(노말 VF는 못 쓰니 안 불러온다)
  if (act && _glb.state === 'off' && S.res !== '1920x1080-vf') { Promise.resolve().then(glbStart); return; }
  const m = _glb.live;
  if (!act || !m || _glb.state === 'fail') {
    if (host.style.display !== 'none') host.style.display = 'none';
    if (attr && attr.style.display !== 'none') attr.style.display = 'none';
    return;
  }
  const col = (S.typhoon && S.typhoon.landFill) || '#12325A';
  // 위성 사진 켜기·끄기·Mapbox 주소가 바뀌었으면(되돌리기 포함) 스타일을 바꾼다 — 준비된 화면이면 그대로 보이며 타일이 차오르고, 지켜보다 다 받으면 틸트 그림을 다시(glbSatWatch).
  // 영상 렌더 중에도 바꾼다(불러오는 중에 위성 타일을 한 장도 못 받으면 벡터로 바꿔야 준비가 끝난다 — 아니면 프레임마다 glbSettle이 끝까지 기다린다)
  const sat = glbSatNow();
  if (!sat && glbIsMbx()) {   // Mapbox 실시간 타일인데 쓸 주소가 없어졌다 — 벡터로 바꾸지 않고 파란 지도로(지금 그리기가 끝난 뒤)
    host.style.visibility = 'hidden';
    Promise.resolve().then(() => { if (glbIsMbx() && _glb.state !== 'fail' && _glb.state !== 'off' && !glbSatNow()) glbFail(mapboxUrlRaw().trim() ? 'badurl' : 'nourl'); });
    return;
  }
  if (m.__key !== glbKeyOf(sat)) {
    glbRestyle(m, sat); _glb.col = col; force = true;
    if (attr) attr.textContent = glbAttrNow();
    tiltInvalidate();
    if (_glb.state === 'ready') glbSatWatch();
  }
  // 영상 렌더 중(MP4·PNG 시퀀스·MXF/MOV) — 화면은 가리개 아래이고 프레임 그림은 숨은 지도(glbSnap)가 따로 그린다. 화면 지도가 카메라를 따라가며
  // 화면 배율 타일을 따로 받지 않게 둔다(미리 받은 타일 밖 요청 0 — 위성 그림 타일은 요청마다 Mapbox 사용량). 끝나면 animOff → renderAll이 다시 맞춘다.
  // 다만 아직 한 번도 자리를 잡지 않은 지도(렌더 중에 처음 시작 — _glb.view 빈칸)는 한 번 맞춘다(크기 0이면 타일을 못 골라 준비가 안 끝난다)
  if (_exportingFrames && _glb.view) return;
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
// 한 장 — 뷰박스 영역(vb)을 pw×ph px로. 타일을 다 받을 때까지(시간 제한) 기다린 뒤 그 그림(data URL). 못 받으면 null.
// lenient = 다시 해 보는 두 번째(glbInlineClone) — 위성 사진은 몇 칸만 못 받았으면 받은 데까지 쓴다(그 칸은 바다색, 알림). 영상이 위성 ↔ 파란 지도로 튀지 않게
async function glbSnap(cam, vb, pw, ph, fast, lenient) {
  if (glbIsMbx() && !glbSatNow()) return null;   // Mapbox 실시간 타일 — 쓸 주소가 없거나 한 장도 못 받은 주소(벡터로 그리지 않는다 → 그 그림은 파란 지도)
  const ml = await glbLoadLib(); if (!ml) return null;
  let m;
  try { m = glbExpMap(ml); } catch (e) { return null; }
  clearTimeout(_glb.expT);
  const t0 = performance.now();
  const box = m.getContainer();
  if (box.__w !== pw || box.__h !== ph) { box.__w = pw; box.__h = ph; box.style.width = pw + 'px'; box.style.height = ph + 'px'; m.resize(); }
  const col = (S.typhoon && S.typhoon.landFill) || '#12325A';
  { const sat = glbSatNow(); if (m.__key !== glbKeyOf(sat)) { glbRestyle(m, sat); m.__col = col; } }   // 화면과 같은 스타일(위성 사진 / 벡터만)
  if (m.__col !== col) { m.__col = col; glbSetLand(m, col); }
  const v = glbView(cam, MAP.proj, pw / vb.w, vb.x, vb.y, pw, ph);
  if (!(v.zoom >= -2)) return null;   // 너무 줄임(MapLibre 최소 배율 밖)
  m.jumpTo({ center: [v.lng, v.lat], zoom: v.zoom });
  let e0 = m.__err, t1 = t0;
  let done = false;
  for (;;) {
    try { m.redraw(); done = m.loaded() && m.areTilesLoaded(); } catch (e) { done = false; }
    // 위성 타일을 한 장도 못 받음(토큰·주소 제한·서버) → 이번부터 벡터만(알림 한 번)으로 바꿔 이 그림도 벡터로 기다린다(파란 지도로 떨어지지 않게)
    if (m.__sat && !m.__okS.sat && m.__err > e0 && (done || performance.now() - t1 > 2500)) {
      glbSatFail(m);
      if (glbIsMbx()) { done = false; break; }   // Mapbox 실시간 타일은 벡터로 안 바꾼다 — 화면도 파란 지도로(glbFail), 이 그림도
      glbRestyle(m, glbSatNow()); m.__col = col;
      e0 = m.__err; t1 = performance.now(); done = false;
      continue;
    }
    if (done) break;
    if (performance.now() - t1 > GLB_SNAP_MS) break;
    if ((typeof exportCancelled === 'function' && exportCancelled())) break;   // 렌더 취소 — 이 장을 더 기다리지 않는다(루프가 곧 멈춘다)
    await glbSleep(30);
  }
  _glb.expT = setTimeout(glbDropExp, 30000);
  const part = lenient && m.__sat && m.__okS.sat > 0 && m.__err > e0;   // 위성 사진 일부만 못 받음 — 받은 데까지
  if (!done || (m.__err > e0 && !part) || !m.__ok) return null;
  if (part) { const now = performance.now(); if (now - _glb.warnAt > 8000) { _glb.warnAt = now; status((glbIsMbx() ? 'Mapbox 지도' : '위성 사진') + ' 타일 몇 칸을 못 받아 그 칸은 바다색으로 그렸어요', true, 'warn'); } }
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
  if (now - _glb.warnAt > 8000) { _glb.warnAt = now; status(glbName() + ' 타일을 못 받아 이번 그림은 파란 지도로 그렸어요', true, 'warn'); }
}
// 추출 한 장의 GL 그림 영역(reg — 뷰박스 vb에서 타일이 있는 위도 띠만, 밖은 바다)·크기(pw×ph — vb 너비를 W px로, 한 변 GLB_SNAP_MAX로 줄임).
// 띠가 비면 null. glbInlineClone과 렌더 전 미리 받기(glbPrefetchUrls)가 같이 써서 배율(→ MapLibre가 고를 타일)이 똑같다
function glbSnapBox(cam, vb, W) {
  const kx = (+W || vb.w) / vb.w;
  const [b0, b1] = glbBand(cam, MAP.proj);
  const y0 = Math.max(vb.y, b0), y1 = Math.min(vb.y + vb.h, b1);
  if (!(y1 > y0)) return null;
  let pw = Math.max(1, Math.round(vb.w * kx)), ph = Math.max(1, Math.round((y1 - y0) * kx));
  const f = Math.min(1, GLB_SNAP_MAX / pw, GLB_SNAP_MAX / ph);
  if (f < 1) { pw = Math.max(1, Math.round(pw * f)); ph = Math.max(1, Math.round(ph * f)); }
  return { reg: { x: vb.x, y: y0, w: vb.w, h: y1 - y0 }, pw, ph };
}
// svgToImage·svgBlob·previewPng: GL 지도를 보이던 화면의 복제본이면 그 영역(viewBox — 없으면 프레임)의 GL 그림을 #bgMapT 맨 아래에 넣는다.
// W×H = 그 영역을 그릴 출력 px. fast = 미리보기(틸트 그림 — JPEG로 빨리). 넣었으면 true, 대상 아님 = undefined, 못 넣어 파란 지도로 = false
async function glbInlineClone(clone, W, H, viewBox, fast) {
  const bg = clone && clone.querySelector('#bgMapT');
  if (!bg || bg.getAttribute('data-glb') !== '1') return undefined;
  const cam = glbCamOf(bg) || { x: S.map.x, y: S.map.y, s: S.map.s };
  const p = String(viewBox || clone.getAttribute('viewBox') || '0 0 1920 1080').trim().split(/[\s,]+/).map(Number);
  const vb = { x: p[0] || 0, y: p[1] || 0, w: p[2] || 1920, h: p[3] || 1080 };
  const sb = glbSnapBox(cam, vb, W);
  const oc = clone.querySelector('#typhoonOcean'); if (oc) oc.style.display = '';   // 바탕(띠 밖·그림 가장자리)
  if (!sb) return true;
  const { reg, pw, ph } = sb;
  let url = await glbQueue(() => glbSnap(cam, reg, pw, ph, !!fast));
  // 타일 하나가 잠깐 실패해도 영상 한 프레임만 파란 지도로 튀지 않게 — 추출용 지도를 새로 만들어 한 번 더(받은 타일은 HTTP 캐시)
  if (!url && navigator.onLine !== false && !(typeof exportCancelled === 'function' && exportCancelled())) url = await glbQueue(() => { glbDropExp(); return glbSnap(cam, reg, pw, ph, !!fast, true); });
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
  while ((_glb.state === 'loading' || _glb.state === 'off') && glbActive() && performance.now() - t0 < GLB_WAIT_MS + 1000 && !(typeof exportCancelled === 'function' && exportCancelled())) await glbSleep(60);   // 렌더 취소면 그만 기다림
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
// 카메라 프레임들(cams: camAt 값)을 추출할 때(glbInlineClone과 같은 영역·그림 크기 → 같은 배율 — glbSnapBox) MapLibre가 쓸 타일 주소.
// 3D로 기울인 프레임은 블리드 영역(camBleedViewBox), 평면은 프레임. MapLibre coveringZoomLevel(소스 코드 그대로):
//   z = (roundZoom ? 반올림 : 내림)(zoom + log2(512 / 소스 tileSize)), 0 아래면 0, 소스 maxzoom 위면 maxzoom.
//   벡터 타일(512) = 내림, 그림 타일(raster — roundZoom) = 반올림 — Static Tiles 512면 round(zoom), v4 256이면 round(zoom + 1).
// 위성 사진·Mapbox 실시간 타일이면 그림 타일만(벡터 타일은 안 쓴다), 아니면 벡터 타일만. 화면 지도가 불러오는 중이면 끝을 보고(위성 → 벡터만으로 바뀔 수 있다),
// 실패(파란 지도로 그림 — 엔진·WebGL·GPU·타일·시간)면 아무것도 안 받는다(쓰지 않을 위성 그림 타일 = 요청마다 Mapbox 사용량).
async function glbPrefetchUrls(cams) {
  if (glbPending()) await glbSettle();
  if (_glb.state === 'fail') return [];
  const sat = glbSatNow();
  if (!sat && glbIsMbx()) return [];   // Mapbox 실시간 타일인데 쓸 주소가 없다(파란 지도로 그림) — 벡터 타일도 안 받는다
  let tmpl, zmin, zmax, zOf;
  if (sat) { tmpl = sat.tiles[0]; zmin = 0; zmax = sat.maxzoom || GLB_SAT_MAXZ; zOf = (zm) => Math.round(zm + Math.log2(512 / sat.tileSize)); }   // 위성 사진·Mapbox 실시간 타일(glbStyle과 같은 최대 배율)
  else {
    const tj = await glbTileJson(); if (!tj) return [];
    tmpl = tj.tiles[0]; zmin = +tj.minzoom || 0; zmax = tj.maxzoom == null ? 14 : +tj.maxzoom; zOf = Math.floor;
  }
  const [W] = RES[S.res].size;
  const { cx0, cy0, scale } = MAP.proj;
  const out = new Set();
  for (const c of cams) {
    const tilt = Math.abs(+c.rx || 0) > 0.05 || Math.abs(+c.ry || 0) > 0.05 || Math.abs(+c.rz || 0) > 0.05;
    const B = tilt ? CAM_BLEED : 0;
    const vb = { x: -1920 * B, y: -1080 * B, w: 1920 * (1 + 2 * B), h: 1080 * (1 + 2 * B) };
    const sb = glbSnapBox(c, vb, Math.round(W * (1 + 2 * B)));
    if (!sb) continue;
    const { reg, pw, ph } = sb, y0 = reg.y, y1 = reg.y + reg.h;
    const zoom = glbView(c, MAP.proj, pw / reg.w, reg.x, reg.y, pw, ph).zoom;   // glbSnap과 같은 식
    if (!(zoom >= -2)) continue;
    const z = Math.max(zmin, Math.min(zmax, Math.max(0, zOf(zoom)))), n = Math.pow(2, z), s = +c.s || 1;
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
const GLB_STUDIO = 'https://studio.mapbox.com/';   // 주소 안내의 [열기] — 데스크톱은 기본 브라우저로(desktop/main.js 창 열기 처리)
// 지도 배경 팝오버의 상태 줄·다시 시도(js/map-render.js wireBasemap이 열 때·고를 때 부른다). 상태 줄은 지금 배경 칸에 —
// 가벼운 지도 = #bmGlBox(#bmGlState·#bmGlRetry), Mapbox 실시간 타일 = 주소 칸 #bmMbxBox(#bmMbxState·#bmMbxRetry)
function glbUi() {
  const mbx = glbIsMbx(), vf = S.res === '1920x1080-vf';
  let t;
  if (vf) t = '노말 VF 화면에서는 아직 못 써요 — 파란 지도로 그려요';
  else if (_glb.state === 'loading') t = mbx ? '불러오는 중… (처음엔 지도 엔진·Mapbox 타일을 받아요)' : '불러오는 중… (처음엔 지도 엔진·타일을 받아요)';
  else if (_glb.state === 'ready') t = `WebGL로 그리는 중${!mbx && _glb.live && _glb.live.__sat ? ' · 위성 사진' : ''} · 처음 표시 ${(_glb.readyMs / 1000).toFixed(1)}초`;
  else if (_glb.state === 'fail') t = _glb.why === 'nourl' ? 'Mapbox 주소가 없어 파란 지도로 그려요 — 아래 칸에 넣고 [적용]' : '못 불러와 파란 지도로 그려요 — ' + glbWhyText(_glb.why);
  else t = mbx ? '주소를 넣고 [적용]하면 WebGL로 그려요' : '고르면 지도 엔진과 타일을 불러와요';
  const retry = _glb.state === 'fail' && !vf && _glb.why !== 'nourl' && _glb.why !== 'badurl';   // 주소 문제는 다시 시도로 안 풀린다(주소 칸·까닭 한 줄)
  { const st = $('#bmGlState'), rt = $('#bmGlRetry');
    if (st) { st.textContent = t; st.dataset.state = _glb.state; }
    if (rt) rt.style.display = !mbx && retry ? '' : 'none'; }
  { const st = $('#bmMbxState'), rt = $('#bmMbxRetry');
    if (st) { st.textContent = mbx ? t : ''; st.dataset.state = _glb.state; st.style.display = mbx ? '' : 'none'; }
    if (rt) rt.style.display = mbx && retry ? '' : 'none'; }
  // [위성 사진 | 벡터만] — 고른 값. 위성 사진인데 못 까는 까닭(주소 없음·못 알아봄·못 받음)은 아래 한 줄로 + 그 칸을 흐리게(골랐지만 지금은 벡터)
  const pref = glbSatPref(S.typhoon), src = pref ? glbSatSrcNow() : null, raw = mapboxUrlRaw().trim();
  const missed = !!src && _glb.satBad === src.tiles[0];
  document.querySelectorAll('#bmGlSat button').forEach((b) => { b.classList.toggle('on', +b.dataset.glsat === pref); b.classList.toggle('miss', +b.dataset.glsat === 1 && !!pref && (!src || missed)); });
  const note = $('#bmGlSatNote');
  if (note) {
    let n = '';
    if (pref) {
      if (!src) n = raw ? '넣어 둔 Mapbox 주소(스타일·v4 래스터)를 알아보지 못해 벡터만 그려요 — 아래에 다시 넣고 적용하세요'
        : 'Mapbox 주소가 없어 벡터만 그려요 — 아래 칸에 Mapbox 스타일 URL을 넣고 적용하면 위성 사진이 깔려요';
      else if (missed) n = '위성 사진을 못 받아 벡터만 그려요 — ' + _glb.satWhy + ' (위성 사진을 다시 누르면 다시 받아요)';
      else if (raw && src.def) n = '넣어 둔 Mapbox 주소를 알아보지 못해 기본 위성 사진을 깔아요';
    }
    note.textContent = n; note.style.display = n ? '' : 'none';
  }
  // 주소 칸(#bmMbxBox — 'Mapbox 실시간 타일'과 같은 칸)을 가벼운 지도에서도: 위성 사진을 골랐는데 출처가 없거나 넣어 둔 주소로 못 받을 때만(적용해도 배경은 가벼운 지도 그대로 — js/map-render.js wireBasemap).
  // Mapbox 실시간 타일에선 늘 보인다(wireBasemap syncOpts)
  { const mb = $('#bmMbxBox'); if (mb && glbMode() === 'gl') mb.style.display = pref && !vf && (!src || (missed && !src.def)) ? '' : 'none'; }
  glbUrlNote();
  const at = glbAttrNow();
  { const a = $('#bmGlAttr'); if (a) a.textContent = at; }
  { const b = $('#glMapAttr'); if (b) b.textContent = at; }
}
// 주소 칸 아래 한 줄(#bmMbxWhy — 칸에 넣은 주소를 왜 못 쓰는지, 고치는 동안에도 바로)·주소 안내(#bmMbxHelp — 넣어 둔 주소가 없으면 펼쳐 둠, 사용자가 접거나 펼치면 그대로)
function glbUrlNote() {
  const mode = glbMode(), urlIn = $('#bmMbxUrl'), why = $('#bmMbxWhy');
  const w = mode ? glbUrlWhy(urlIn ? urlIn.value : mapboxUrlRaw(), mode === 'mapbox') : '';
  if (why) { why.textContent = w; why.style.display = w ? '' : 'none'; }
  const open = _glb.help != null ? _glb.help : !mapboxUrlRaw().trim();
  const hp = $('#bmMbxHelp'), hb = $('#bmMbxHelpBtn');
  if (hp) hp.hidden = !open;
  if (hb) hb.setAttribute('aria-expanded', open ? 'true' : 'false');
}
function glbWire() {
  const rt = $('#bmGlRetry');
  if (rt) rt.onclick = (e) => { e.stopPropagation(); glbRetry(); glbUi(); };
  const mr = $('#bmMbxRetry');
  if (mr) mr.onclick = (e) => { e.stopPropagation(); glbRetry(); glbUi(); };
  document.querySelectorAll('#bmGlSat button').forEach((b) => { b.onclick = (e) => { e.stopPropagation(); glbSetSat(+b.dataset.glsat); }; });
  // 주소 안내 [?] 펼치기·접기, Mapbox Studio 열기, 칸을 고치는 동안 까닭 한 줄
  const hb = $('#bmMbxHelpBtn');
  if (hb) hb.onclick = (e) => { e.stopPropagation(); const hp = $('#bmMbxHelp'); _glb.help = !!(hp && hp.hidden); glbUrlNote(); };
  const so = $('#bmMbxStudio');
  if (so) so.onclick = (e) => { e.stopPropagation(); window.open(GLB_STUDIO, '_blank', 'noopener'); };
  const urlIn = $('#bmMbxUrl');
  if (urlIn) urlIn.addEventListener('input', glbUrlNote);
  const at = glbAttrNow();
  const a = $('#bmGlAttr'); if (a) a.textContent = at;
  const b = $('#glMapAttr'); if (b) b.textContent = at;
}
// 데스크톱 기본 토큰이 왔다(preload가 비동기로 받는다 — js/boot.js가 부른다. 보통은 앱 스크립트보다 먼저 온다) — 가벼운 지도면 스타일(glbSync)·격자 기본값·안내를 다시
// (Mapbox 실시간 타일은 기본 토큰을 안 쓴다)
function glbTokenArrived() {
  if (glbMode() !== 'gl' || _glb.mbDef === glbSatBuiltinUrl()) return;   // 가벼운 지도가 아니거나 이미 그 토큰으로 정한 화면(출처는 glbSatSrcNow가 토큰이 바뀌면 다시 해석)
  renderTyphoon();
  { const eye = $('#typGridEye'); if (eye) eye.classList.toggle('off', !typhoonGridOn(S.typhoon)); }
  glbUi();
}
