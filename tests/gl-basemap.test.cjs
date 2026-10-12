// 태풍 지도 배경 '가벼운 지도 (WebGL · 시험)'(js/gl-basemap.js) — 메뉴·엔진 파일·자체 스타일·투영 정렬(MapLibre 웹 메르카토르와 1:1)·
// 추출 복제본 넣기/되돌리기·다른 4모드 길 그대로(정적). WCG_BOOT_CHECK=1이면 실제 앱(숨은 Electron + 실제 OpenFreeMap 타일)도:
//   WCG_BOOT_CHECK=1 node --test tests/gl-basemap.test.cjs
// 인터넷이 없으면 실제 앱 검사의 GL 부분은 건너뛴다(대체 파란 지도 검사는 그대로).
// 위성 사진(10-10): 출처 주소 해석·스타일·켜기·준비 판정·저장 키·격자 기본값은 늘, 실제 앱은 gl-satellite.boot-eval.js(가짜 주소 pk.TEST + 합성 그림 타일 — 토큰 없이).
// Mapbox 실시간 타일(10-12 — 같은 WebGL 길): 주소 해석·까닭 한 줄·모드·시작/실패·배선·메뉴·옛 작업은 늘, 실제 앱은 gl-mapbox.boot-eval.js(가짜 주소 pk.TEST + 합성 그림 타일).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const appSource = require('../tools/app-source.cjs');   // js/·css/로 나뉜 앱을 '한 파일' 텍스트로(MODULES.md)

const root = path.join(__dirname, '..');
const html = appSource(path.join(root, 'index.html'));
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n');

// 이름으로 최상위 정의 하나를 잘라낸다(괄호 균형 — tilt-gl.test.cjs와 같은 방식)
function pick(name) {
  const heads = [`async function ${name}(`, `function ${name}(`, `const ${name} = `, `let ${name} = `];
  let s = -1;
  for (const h of heads) { const re = new RegExp('^' + h.replace(/[$()]/g, '\\$&'), 'm'); const m = re.exec(html); if (m) { s = m.index; break; } }
  assert.ok(s >= 0, 'not found: ' + name);
  const isFn = html.startsWith('function', s) || html.startsWith('async function', s);
  let i = s, depth = 0, q = null, seenBody = false;
  for (; i < html.length; i++) {
    const ch = html[i];
    if (q) { if (ch === '\\') { i++; continue; } if (ch === q) q = null; continue; }
    if (ch === '/' && html[i + 1] === '/') { i = html.indexOf('\n', i); continue; }
    if (ch === "'" || ch === '"' || ch === '`') { q = ch; continue; }
    if (ch === '{' || ch === '(' || ch === '[') { depth++; if (ch === '{') seenBody = true; continue; }
    if (ch === '}' || ch === ')' || ch === ']') { depth--; if (isFn && depth === 0 && ch === '}' && seenBody) { i++; break; } continue; }
    if (!isFn && depth === 0 && ch === ';') { i++; break; }
  }
  return html.slice(s, i);
}
const CONSTS = ['GLB_LIB', 'GLB_TILES', 'GLB_ATTR', 'GLB_ATTR_MBX', 'GLB_ATTR_MBXS', 'GLB_ATTR_XYZ', 'GLB_SAT_MAXZ', 'GLB_XYZ_MAXZ', 'GLB_SAT_STYLE', 'GLB_SEA', 'GLB_BORDER', 'GLB_SNAP_MAX', 'GLB_WAIT_MS', 'GLB_SNAP_MS', 'GLB_MERC_LAT'];
function ctxWith(names, extra) {
  const ctx = Object.assign({ console, Math, Number, String, JSON, Promise }, extra || {});
  vm.createContext(ctx);
  vm.runInContext(CONSTS.map(pick).join('\n') + '\n' + names.map(pick).join('\n') + '\n;globalThis.__x = {' + [...CONSTS, ...names].join(',') + '};', ctx);
  return ctx.__x;
}

test('메뉴: 지도 배경 5개 — 옛 4개는 글자 하나 안 바뀌고 맨 뒤에 가벼운 지도 (WebGL · 시험)', () => {
  const pop = /<div id="basemapPop"[\s\S]*?<div class="bmMbx" id="bmMbxBox"/.exec(html);
  assert.ok(pop, '#basemapPop');
  const opts = [...html.matchAll(/<button data-bm="(\w+)" class="bmOpt">[\s\S]*?<\/span>([^<]+)<\/button>/g)].map((m) => m[1] + ':' + m[2].trim());
  assert.deepEqual(opts, ['blue:파란 지도', 'satellite:밝은 위성지도', 'satdark:어두운 위성지도', 'mapbox:Mapbox 실시간 타일', 'gl:가벼운 지도 (WebGL · 시험)']);
  for (const line of [
    '<button data-bm="blue" class="bmOpt"><span class="bmSw" style="background:linear-gradient(135deg,#173a6b,#0e2547)"></span>파란 지도</button>',
    '<button data-bm="satellite" class="bmOpt"><span class="bmSw" style="background:linear-gradient(135deg,#3a5a3a,#26506a)"></span>밝은 위성지도</button>',
    '<button data-bm="satdark" class="bmOpt"><span class="bmSw" style="background:linear-gradient(135deg,#1c2b22,#14202e)"></span>어두운 위성지도</button>',
    '<button data-bm="mapbox" class="bmOpt"><span class="bmSw" style="background:linear-gradient(135deg,#2b7a5b,#1c4a6e)"></span>Mapbox 실시간 타일</button>',
  ]) assert.ok(html.includes(line), '옛 메뉴 줄이 바뀜: ' + line);
  // 상태 줄·다시 시도·출처, 아트보드 뒤 캔버스 자리(#cg보다 앞 = 뒤에 깔림), 출처는 SVG 밖
  for (const id of ['bmGlBox', 'bmGlState', 'bmGlRetry', 'bmGlAttr', 'glMap', 'glMapIn', 'glMapAttr']) assert.ok(html.includes(`id="${id}"`), id);
  assert.ok(html.indexOf('id="glMap"') < html.indexOf('<svg id="cg"'), '#glMap은 #cg 앞(뒤에 깔림)');
  assert.ok(html.indexOf('id="glMapAttr"') > html.indexOf('</svg>\n    <div id="frameGuide"'), '출처는 SVG 밖(추출 안 됨)');
  assert.ok(!/[\u{1F300}-\u{1FAFF}☀-➿]/u.test(/<div class="bmMbx bmGl"[\s\S]*?<\/div>\s*<\/div>/.exec(html)[0]), '이모지 없음');
});

test('엔진 파일: vendor/maplibre-gl(5.24.0, BSD-3) — 저장소에 파일로, 부팅 태그 없이 고를 때만 읽는다', () => {
  const js = fs.readFileSync(path.join(root, 'vendor/maplibre-gl/maplibre-gl.js'));
  const lic = read('vendor/maplibre-gl/LICENSE.txt'), readme = read('vendor/maplibre-gl/README.txt');
  assert.match(js.subarray(0, 300).toString('utf8'), /MapLibre GL JS[\s\S]*3-Clause BSD[\s\S]*v5\.24\.0/);
  assert.match(lic, /MapLibre contributors[\s\S]*Redistribution and use in source and binary forms/);
  const sha = crypto.createHash('sha256').update(js).digest('hex');
  assert.ok(readme.includes(sha), 'README의 sha256 = 실제 파일(고치지 않은 원본) ' + sha);
  const X = ctxWith([]);
  assert.equal(X.GLB_LIB, 'vendor/maplibre-gl/maplibre-gl.js');
  assert.ok(fs.existsSync(path.join(root, X.GLB_LIB)));
  assert.ok(!/<script[^>]+src="vendor\//.test(html), '부팅 때 안 읽는다(정적 <script> 없음)');
  assert.equal(X.GLB_TILES, 'https://tiles.openfreemap.org/planet', 'OpenFreeMap TileJSON(키 없음)');
  // 비밀값·키 없음 — 위성 사진 토큰은 사용자가 넣어 둔 주소(localStorage)에서만 옮긴다(코드에 토큰·키 글자 없음)
  const src = read('js/gl-basemap.js');
  assert.ok(!/\b[ps]k\.[A-Za-z0-9_-]{8,}/.test(src) && !/key=/.test(src), '비밀값·키 없음');
  assert.ok(!/access_token=[A-Za-z0-9]/.test(src), '토큰 값 글자 없음(주소에서 읽은 tok만 붙인다)');
});

test('자체 스타일: 바탕 = 육지(태풍 패널 육지 색), water = 바다, 옅은 나라 경계 — 글자·아이콘·래스터 없음(글꼴·스프라이트 요청 없음)', () => {
  const X = ctxWith(['glbStyle']);
  const s = JSON.parse(JSON.stringify(X.glbStyle({ landFill: '#123456' })));   // vm 쪽 배열·객체를 이쪽 것으로
  assert.equal(s.version, 8);
  assert.equal(s.glyphs, undefined); assert.equal(s.sprite, undefined);
  assert.deepEqual(Object.keys(s.sources), ['omt']);
  assert.deepEqual(JSON.parse(JSON.stringify(s.sources.omt)), { type: 'vector', url: X.GLB_TILES, attribution: X.GLB_ATTR });
  assert.deepEqual(s.layers.map((l) => l.id + ':' + l.type + ':' + (l['source-layer'] || '')), ['land:background:', 'sea:fill:water', 'border:line:boundary']);
  assert.equal(s.layers[0].paint['background-color'], '#123456');
  assert.equal(X.glbStyle(null).layers[0].paint['background-color'], '#12325A', '기본 육지 = 파란 지도 육지 색');
  assert.equal(s.layers[1].paint['fill-color'], X.GLB_SEA);
  assert.ok(!s.layers.some((l) => l.type === 'symbol' || l.type === 'raster'), '글자·그림 타일 없음');
  assert.ok(!s.layers.some((l) => l.type === 'line' && l['source-layer'] === 'water'), '물 면 테두리 줄 없음(타일·날짜변경선 경계 줄)');
  assert.match(X.GLB_ATTR, /OpenStreetMap/); assert.match(X.GLB_ATTR, /OpenMapTiles/);
  assert.deepEqual(JSON.parse(JSON.stringify(X.glbStyle({ landFill: '#123456' }, null))), s, '위성 출처가 없으면(null) 벡터 스타일 그대로');
});

// 위성 사진(10-10) — 가짜 토큰(pk.TEST)만 쓴다
const STYLE_URL = 'https://api.mapbox.com/styles/v1/user1/ckstyle01/wmts?access_token=pk.TEST';
const SAT512 = 'https://api.mapbox.com/styles/v1/user1/ckstyle01/tiles/512/{z}/{x}/{y}@2x?access_token=pk.TEST';
test('위성 사진 출처(glbSatSrc): 스타일 주소 → Static Tiles 512 @2x, v4 래스터 → 그 그림 256 @2x, 토큰·주소 없으면 null(벡터만)', () => {
  const X = ctxWith(['glbSatSrc']);
  const P = (u, b) => JSON.parse(JSON.stringify(X.glbSatSrc(u, b)));
  const style = { kind: 'style', tileSize: 512, tiles: [SAT512] };
  for (const u of [
    STYLE_URL,                                                                                       // Studio 공유 — 서드파티 WMTS
    'https://api.mapbox.com/styles/v1/user1/ckstyle01?access_token=pk.TEST',                         // 스타일 JSON 주소
    'https://api.mapbox.com/styles/v1/user1/ckstyle01.html?title=view&access_token=pk.TEST#3/36/127', // 공유 링크(.html)
    'https://api.mapbox.com/styles/v1/user1/ckstyle01/tiles/256/{z}/{x}/{y}@2x?access_token=pk.TEST', // Mapbox 모드가 쓰는 타일 틀
    '  mapbox://styles/user1/ckstyle01?access_token=pk.TEST  ',                                       // 스타일 URL + 토큰
  ]) assert.deepEqual(P(u), style, u);
  assert.deepEqual(P(STYLE_URL, '42'), { kind: 'style', tileSize: 512, tiles: [SAT512 + '&_cb=42'] }, "'적용'으로 다시 받기 표시(_cb) — Mapbox 모드와 같은 꼴");
  const v4 = { kind: 'v4', tileSize: 256, tiles: ['https://api.mapbox.com/v4/mapbox.satellite/{z}/{x}/{y}@2x.jpg90?access_token=pk.TEST'] };
  assert.deepEqual(P('https://api.mapbox.com/v4/mapbox.satellite/{z}/{x}/{y}.png?access_token=pk.TEST'), v4);
  assert.deepEqual(P('https://api.mapbox.com/v4/mapbox.satellite.json?secure&access_token=pk.TEST'), v4, 'TileJSON 주소');
  for (const u of ['', '   ', null, 'https://api.mapbox.com/styles/v1/user1/ckstyle01/wmts', 'https://example.com/{z}/{x}/{y}.png?access_token=pk.TEST', 'mapbox://styles/user1/ckstyle01'])
    assert.equal(X.glbSatSrc(u), null, String(u));
});

test('위성 사진 스타일: 바탕(바다색) + 그림 타일 하나 — 벡터 타일·육지·바다 면·경계 없음, 받자마자 다 보임(페이드 0), 출처 Mapbox·Maxar', () => {
  const X = ctxWith(['glbSatSrc', 'glbAttrOf', 'glbStyle']);
  const sat = X.glbSatSrc(STYLE_URL);
  const s = JSON.parse(JSON.stringify(X.glbStyle({ landFill: '#123456' }, sat)));
  assert.equal(s.version, 8); assert.equal(s.glyphs, undefined); assert.equal(s.sprite, undefined);
  assert.deepEqual(s.sources, { sat: { type: 'raster', tiles: [SAT512], tileSize: 512, maxzoom: 22, attribution: X.GLB_ATTR_MBX } });
  assert.deepEqual(s.layers.map((l) => l.id + ':' + l.type), ['bg:background', 'sat:raster'], '위성 사진만(그 스타일은 나라 경계를 꺼 두었다 — 겹치지 않게)');
  assert.equal(s.layers[0].paint['background-color'], X.GLB_SEA, '못 받은 칸·받기 전 = 바다색');
  assert.equal(s.layers[1].paint['raster-fade-duration'], 0, '추출 그림이 반쯤 비친 타일을 담지 않게');
  const v4 = JSON.parse(JSON.stringify(X.glbStyle(null, X.glbSatSrc('https://api.mapbox.com/v4/mapbox.satellite/{z}/{x}/{y}.png?access_token=pk.TEST'))));
  assert.equal(v4.sources.sat.tileSize, 256);
  assert.match(X.GLB_ATTR_MBX, /© Mapbox/); assert.match(X.GLB_ATTR_MBX, /© OpenStreetMap/); assert.match(X.GLB_ATTR_MBX, /Maxar/);
  sat.tiles[0] = 'changed'; assert.equal(s.sources.sat.tiles[0], SAT512, '스타일은 주소 틀 사본을 가진다');
});

test('위성 사진 켜기(glbSatPref·glbSatOn·glbSatNow): 고른 값 + 쓸 수 있는 Mapbox 출처(넣어 둔 주소 → 데스크톱 기본 토큰), 못 받은 주소(satBad)는 벡터만, 노말 VF는 격자도 파란 지도처럼 — 격자 기본값은 불러오기 성공·실패와 무관', () => {
  let url = STYLE_URL, tok = '';
  const ctx = vm.createContext({ console, Math, Number, String, JSON, Promise, S: { typhoon: { basemap: 'gl' } }, isTyphoon: () => true, mapboxUrlRaw: () => url, window: { wcgDesktop: { mapboxToken: () => tok } } });
  vm.runInContext("let _mbxCacheBust = '';\n" + CONSTS.map(pick).join('\n') + '\n' + ['_glb', 'glbMode', 'glbIsMbx', 'glbSatBuiltinUrl', 'glbSatSrc', 'glbMbxSrc', 'glbMbxSrcNow', 'glbSatSrcNow', 'glbSatPref', 'glbSatOn', 'glbSatNow', 'glbSatMissed', 'glbKeyOf'].map(pick).join('\n') +
    '\nglobalThis.__x = { _glb, glbSatPref, glbSatOn, glbSatNow, glbSatMissed, glbKeyOf, glbSatSrcNow };', ctx);
  const X = ctx.__x, T = ctx.S.typhoon;
  assert.equal(X.glbSatPref(T), 1, '옛 작업(glSat 없음) = 위성 사진');
  assert.equal(X.glbSatPref(null), 1);
  assert.equal(X.glbSatOn(T), true); assert.equal(X.glbSatNow().tiles[0], SAT512); assert.equal(X.glbKeyOf(X.glbSatNow()), SAT512);
  T.glSat = 0; assert.equal(X.glbSatOn(T), false); assert.equal(X.glbSatNow(), null); assert.equal(X.glbKeyOf(null), 'vec');
  T.glSat = '1'; assert.equal(X.glbSatPref(T), 1);
  T.glSat = 1; url = ''; assert.equal(X.glbSatOn(T), false, '주소 없음 = 벡터만(격자도 파란 지도처럼)'); assert.equal(X.glbSatNow(), null);
  url = 'https://example.com/{z}/{x}/{y}.png'; assert.equal(X.glbSatOn(T), false, '못 알아보는 주소');
  url = STYLE_URL; X._glb.satBad = SAT512;
  assert.equal(X.glbSatNow(), null, '한 장도 못 받은 주소 = 벡터만'); assert.equal(X.glbSatOn(T), true, '격자 칸은 그대로(눈 단추가 그때그때 다른 칸을 바꾸지 않게)');
  assert.equal(X.glbSatMissed(), true, '못 받아 벡터만 = 알림·안내 한 줄');
  vm.runInContext("_mbxCacheBust = '7'", ctx); assert.equal(X.glbSatNow().tiles[0], SAT512 + '&_cb=7', "'적용'(다시 받기) = 새 주소라 다시 시도");
  assert.equal(X.glbSatMissed(), false);
  vm.runInContext("_mbxCacheBust = ''; _glb.satBad = ''", ctx);
  // 데스크톱 기본 출처(비공개 토큰 → 기본 스타일 Static Tiles) — 넣어 둔 주소가 없거나 못 알아볼 때만
  const DEF = 'https://api.mapbox.com/styles/v1/supermanpasa/cmsg6825m002h01r6eufdeg24/tiles/512/{z}/{x}/{y}@2x?access_token=pk.TESTDEFAULT.fake';
  tok = 'pk.TESTDEFAULT.fake';
  assert.equal(X.glbSatNow().tiles[0], SAT512, '넣어 둔 주소가 먼저'); assert.equal(X.glbSatSrcNow().def, undefined);
  url = ''; assert.equal(X.glbSatNow().tiles[0], DEF); assert.equal(X.glbSatSrcNow().def, 1); assert.equal(X.glbSatOn(T), true, '주소 없어도 기본 출처면 위성(격자 끔 칸)');
  url = 'https://example.com/{z}/{x}/{y}.png'; assert.equal(X.glbSatNow().tiles[0], DEF, '못 알아보는 주소 → 기본 출처');
  for (const bad of ['sk.secret.token', 'pk.bad token', '']) { tok = bad; assert.equal(X.glbSatNow(), null, '공개 토큰 모양이 아니면 기본 출처 없음 ' + JSON.stringify(bad)); }
  tok = 'pk.TESTDEFAULT.fake'; url = STYLE_URL;
  ctx.S.res = '1920x1080-vf'; assert.equal(X.glbSatOn(T), false, '노말 VF = 늘 파란 지도 → 격자도 파란 지도처럼'); ctx.S.res = '1920x1080';
  assert.equal(X.glbSatOn(T), true);
  for (const bm of ['blue', 'satellite', 'satdark', 'mapbox']) { T.basemap = bm; assert.equal(X.glbSatOn(T), false, bm); }
});

test('스타일 바꾸기(glbRestyle): 화면 지도가 불러오는 중이면 기다린 시간도 처음부터 — 앞 스타일에서 기다린 시간으로 새 스타일을 실패 판정하지 않게', () => {
  let now = 9000;
  const set = [];
  const X = ctxWith(['_glb', 'glbKeyOf', 'glbAttrOf', 'glbCount0', 'glbRestyle'], { performance: { now: () => now }, glbStyle: (T, sat) => ({ sat: !!sat }), S: { typhoon: {} } });
  const mk = () => ({ setStyle: (st) => set.push(st) });
  const live = mk(), exp = mk();
  X._glb.live = live; X._glb.state = 'loading'; X._glb.tw = 1000;
  X.glbRestyle(live, { tiles: ['https://api.mapbox.com/x/{z}/{x}/{y}'] });
  assert.equal(X._glb.tw, 9000); assert.equal(live.__sat, true); assert.equal(live.__key, 'https://api.mapbox.com/x/{z}/{x}/{y}'); assert.equal(live.__ok, 0);
  now = 12000; X.glbRestyle(exp, null); assert.equal(X._glb.tw, 9000, '추출용 지도는 화면 시계를 안 건드림');
  X._glb.state = 'ready'; X.glbRestyle(live, null); assert.equal(X._glb.tw, 9000, '준비된 화면은 glbSatWatch가 따로 잰다'); assert.equal(live.__key, 'vec');
  assert.equal(set.length, 3);
});

test('위성 사진 준비 판정(glbSatCheck): 받으면 ok(일부 실패는 받은 데까지) · 한 장도 못 받으면 fail(→ 벡터만) · 아니면 wait', () => {
  const X = ctxWith(['glbSatCheck']);
  const m = (o) => Object.assign({ __sat: true, __okS: { omt: 0, sat: 0 }, __errS: { omt: 0, sat: 0 }, loaded: () => o.done, areTilesLoaded: () => o.done }, o);
  assert.equal(X.glbSatCheck(m({ __sat: false, done: false }), 0), 'ok', '벡터 스타일이면 판정 안 함');
  assert.equal(X.glbSatCheck(m({ done: true, __okS: { omt: 0, sat: 3 } }), 100), 'ok');
  assert.equal(X.glbSatCheck(m({ done: true, __okS: { omt: 0, sat: 3 }, __errS: { omt: 0, sat: 2 } }), 100), 'ok', '일부 실패 — 받은 데까지');
  assert.equal(X.glbSatCheck(m({ done: false, __okS: { omt: 0, sat: 3 } }), 30000), 'wait', '받는 중(늦으면 부르는 쪽 시간 제한)');
  assert.equal(X.glbSatCheck(m({ done: true, __errS: { omt: 0, sat: 4 } }), 100), 'fail', '다 끝났는데 한 장도 못 받음(토큰·주소 제한)');
  assert.equal(X.glbSatCheck(m({ done: false, __errS: { omt: 0, sat: 4 } }), 1000), 'wait');
  assert.equal(X.glbSatCheck(m({ done: false, __errS: { omt: 0, sat: 4 } }), 2600), 'fail');
  assert.equal(X.glbSatCheck(m({ done: false }), X.GLB_WAIT_MS + 1), 'fail', '아무 응답 없이 너무 늦음');
  assert.equal(X.glbSatCheck(m({ done: false }), 1000), 'wait');
});

test('저장 키·옛 작업: glSat은 태풍 스타일 키(기본 1 = 위성 사진)·프로젝트·개인 배치에, 옛 작업은 기본값으로 보강', () => {
  assert.ok(/const TYPHOON_STYLE_KEYS = \[[^\]]*'basemap', 'glSat'/.test(html));
  const ctx = vm.createContext({ console, Math, JSON, Object, S: {}, window: {} });
  vm.runInContext(['TYPHOON_DEFAULTS', 'typhoonStyleDefaults', 'initTyphoonData', 'TYPHOON_STYLE_KEYS', 'TYPHOON_PER_WORK_KEYS', 'applyTyphoonStyle'].map(pick).join('\n') + '\nglobalThis.__x = { TYPHOON_DEFAULTS, initTyphoonData, applyTyphoonStyle };', ctx);
  assert.equal(ctx.__x.TYPHOON_DEFAULTS.glSat, 1);
  ctx.S.typhoon = { issues: [{ points: [] }], sel: 0, basemap: 'gl', lineWidth: 5 };   // glSat 없는 옛 작업
  ctx.__x.initTyphoonData(); assert.equal(ctx.S.typhoon.glSat, 1); assert.equal(ctx.S.typhoon.basemap, 'gl');
  ctx.S.typhoon = { issues: [{ points: [] }], sel: 0, basemap: 'gl', glSat: 0, lineWidth: 5 };
  ctx.__x.initTyphoonData(); assert.equal(ctx.S.typhoon.glSat, 0, '저장된 벡터만은 그대로');
  ctx.window.WCG_DEFAULTS = { typhoonStyle: { basemap: 'gl', glSat: 0 } };   // 구운 기본값(배치)에 담긴 값이 이긴다 — basemap과 같은 규칙
  ctx.S.typhoon = { glSat: 1 }; ctx.__x.applyTyphoonStyle(); assert.equal(ctx.S.typhoon.glSat, 0);
  for (const f of ['js/project-io.js', 'js/preset-slots.js']) assert.ok(read(f).includes('basemap: T.basemap, glSat: T.glSat,'), f + ' — 기본 배치 굽기에 함께');
});

test('격자 기본값: 가벼운 지도 + 위성 사진이면 위성처럼 끔(gridShowSat), 벡터만·주소 없음은 파란 지도처럼 켬 — 다른 4모드는 옛 규칙 그대로', () => {
  let satOn = true;
  const ctx = vm.createContext({ console, glbSatOn: (T) => !!(T && T.basemap === 'gl' && satOn && T.glSat !== 0) });
  vm.runInContext(['typhoonGridIsSat', 'typhoonGridOn', 'typhoonGridToggle'].map(pick).join('\n') +
    "\nfunction oldIsSat(T) { const bm = (T && T.basemap) || 'blue'; return bm === 'satellite' || bm === 'satdark'; }\nglobalThis.__x = { typhoonGridIsSat, typhoonGridOn, typhoonGridToggle, oldIsSat };", ctx);
  const X = ctx.__x;
  for (const bm of [undefined, 'blue', 'satellite', 'satdark', 'mapbox', 'weird']) for (const glSat of [undefined, 0, 1]) {
    const T = { basemap: bm, glSat };
    assert.equal(X.typhoonGridIsSat(T), X.oldIsSat(T), '옛 규칙 그대로 ' + bm);
  }
  assert.equal(X.typhoonGridIsSat(null), false);
  assert.equal(X.typhoonGridOn({ basemap: 'gl', glSat: 1 }), 0, 'GL + 위성 사진 = 기본 끔');
  assert.equal(X.typhoonGridOn({ basemap: 'gl', glSat: 0 }), 1, 'GL 벡터만 = 기본 켬');
  satOn = false; assert.equal(X.typhoonGridOn({ basemap: 'gl', glSat: 1 }), 1, 'Mapbox 주소 없음(벡터만 그림) = 기본 켬');
  satOn = true;
  const T = { basemap: 'gl', glSat: 1 };
  assert.equal(X.typhoonGridToggle(T), 1); assert.equal(T.gridShowSat, 1); assert.equal(T.gridShow, undefined, '눈 단추는 지금 배경 칸만');
  T.glSat = 0; assert.equal(X.typhoonGridOn(T), 1); assert.equal(X.typhoonGridToggle(T), 0); assert.equal(T.gridShow, 0); assert.equal(T.gridShowSat, 1);
});

test('메뉴: [위성 사진 | 벡터만] — 공용 세그먼트(.mode), 이모지·새 큰 버튼 없음, 까닭 한 줄·출처 글자는 glbUi가', () => {
  const box = /<div class="bmMbx bmGl" id="bmGlBox"[\s\S]*?<p class="bmMbxHint">[^\n]*<\/p>\s*<\/div>/.exec(html)[0];
  assert.ok(box.includes('<div class="mode bmGlSat" id="bmGlSat" role="group" aria-label="가벼운 지도 바탕"><button type="button" data-glsat="1">위성 사진</button><button type="button" data-glsat="0">벡터만</button></div>'));
  assert.ok(box.includes('id="bmGlSatNote"'));
  assert.ok(!/[\u{1F300}-\u{1FAFF}☀-➿]/u.test(box), '이모지 없음');
  assert.ok(!/bmApply[^>]*>위성/.test(box), '큰 버튼 아님');
  assert.match(read('css/toss-modal.css'), /\.basemapPop \.bmGlSat button \{[^}]*height: 28px/);
  const ui = pick('glbUi');
  assert.match(ui, /#bmGlSat button/); assert.match(ui, /Mapbox 주소가 없어 벡터만 그려요 — 아래 칸에 Mapbox 스타일 URL을 넣고 적용하면 위성 사진이 깔려요/); assert.match(ui, /glbAttrNow\(\)/);
  assert.match(ui, /classList\.toggle\('miss'/, '골랐지만 지금은 벡터면 위성 칸을 흐리게');
  assert.match(ui, /const mb = \$\('#bmMbxBox'\); if \(mb && glbMode\(\) === 'gl'\)/, '주소 칸은 가벼운 지도일 때만 건드린다(Mapbox 실시간 타일은 syncOpts가 늘 보인다)');
  assert.match(read('css/toss-modal.css'), /\.basemapPop \.bmGlSat button\.miss \{ opacity: \.55; \}/);
  // 주소 칸의 [적용] — 가벼운 지도에서 누르면 배경은 그대로(위성 사진만 새 주소로), Mapbox 실시간 타일이면 새 주소로 처음부터(WebGL — glbUrlApplied)
  const wb = pick('wireBasemap');
  assert.match(wb, /if \(S\.typhoon && S\.typhoon\.basemap === 'gl'\) \{\n\s*glbUrlApplied\(\); syncOpts\(\);[\s\S]*?return;\n\s*\}[\s\S]*?if \(S\.typhoon\) S\.typhoon\.basemap = 'mapbox';\n\s*glbUrlApplied\(\); renderTyphoon\(\); syncOpts\(\);/);
  assert.doesNotMatch(wb, /updateMapboxTiles|_tileData|typhoonTiles/, '옛 SVG 타일 길 없음');
  assert.match(pick('glbUrlApplied'), /if \(_glb\.state === 'fail'\) glbRetry\(\);/, '실패 중이었으면 처음부터');
  assert.match(pick('glbWire'), /glbSetSat\(\+b\.dataset\.glsat\)/);
  const set = pick('glbSetSat');
  assert.match(set, /pushUndo\(\); T\.glSat = v;/, '되돌리기·저장에 따라간다');
  assert.match(set, /typGridEye/, '격자 눈 단추도 지금 배경 칸으로');
});

test('투영: glbView 카메라로 그린 MapLibre 웹 메르카토르 = 앱 typhoonXY (무작위 3000점, 오차 1e-6 px 미만)', () => {
  const X = ctxWith(['glbView', 'glbBand']);
  const pctx = vm.createContext({ MAP: { proj: null }, Math });
  vm.runInContext(pick('projLL'), pctx);   // 앱의 projLL 그대로
  const projAt = (proj, lon, lat) => { pctx.MAP.proj = proj; return pctx.projLL(lon, lat); };
  // MapLibre 웹 메르카토르(앱 코드와 따로 쓴 식) — 세계 너비 = 512·2^zoom px, 화면 가운데 = center
  const mlPx = (v, cw, ch, lng, lat) => {
    const ws = 512 * Math.pow(2, v.zoom);
    const X_ = (l) => (l + 180) / 360 * ws, Y_ = (a) => (1 - Math.log(Math.tan(Math.PI / 4 + a * Math.PI / 360)) / Math.PI) / 2 * ws;
    return [X_(lng) - X_(v.lng) + cw / 2, Y_(lat) - Y_(v.lat) + ch / 2];
  };
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const projs = [{ cx0: 2.2223878893370497, cy0: 0.6813549253753549, scale: 9730.769123924629 }, { cx0: 2.21, cy0: 0.66, scale: 22000 }];
  let worst = 0;
  for (let i = 0; i < 3000; i++) {
    const proj = projs[i % 2];
    const pf = (lon, lat) => projAt(proj, lon, lat);
    const cam = { x: (rnd() - 0.5) * 6000, y: (rnd() - 0.5) * 4000, s: 0.02 + rnd() * 3 };
    const k = 0.3 + rnd() * 2.5, ox = (rnd() - 0.5) * 3000, oy = (rnd() - 0.5) * 2000, cw = 200 + Math.round(rnd() * 3800), ch = 200 + Math.round(rnd() * 2000);
    const v = X.glbView(cam, proj, k, ox, oy, cw, ch);
    for (let j = 0; j < 4; j++) {
      const lon = 60 + rnd() * 135, lat = -60 + rnd() * 140;
      const [lx, ly] = pf(lon, lat), ax = (cam.x + lx * cam.s - ox) * k, ay = (cam.y + ly * cam.s - oy) * k;   // typhoonXY → 그림 px
      const [gx, gy] = mlPx(v, cw, ch, lon, lat);
      worst = Math.max(worst, Math.hypot(gx - ax, gy - ay) / Math.max(1, Math.hypot(ax, ay) / 1e4));
    }
  }
  assert.ok(worst < 1e-6, '최대 오차 ' + worst);
  // 위도 띠: ±85.051129°가 띠 끝
  const proj = projs[0], cam = { x: 780, y: 475, s: 0.112 };
  const [b0, b1] = X.glbBand(cam, proj);
  const yOf = (lat) => cam.y + (-(Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) - proj.cy0) * proj.scale) * cam.s;
  assert.ok(Math.abs(b0 - yOf(X.GLB_MERC_LAT)) < 1e-3 && Math.abs(b1 - yOf(-X.GLB_MERC_LAT)) < 1e-3, JSON.stringify([b0, b1, yOf(85.051129)]));
  // 지금 기본 화면(터치 1069px 아트보드)의 zoom ≈ 2.9 — MapLibre 범위(-2~18) 안
  const z = X.glbView(cam, proj, 1069 / 1920, 0, 0, 1069, 601).zoom;
  assert.ok(Math.abs(z - 2.8966) < 1e-3, 'zoom ' + z);
});

test('추출 복제본: 그 영역 GL 그림을 #bgMapT 맨 아래에(지도 로컬 좌표) · 못 받으면 파란 지도 조각을 되살리고 알림', async () => {
  // 가짜 DOM — 복제본에 필요한 만큼만
  const mk = (tag, attrs) => {
    const n = { tagName: tag, attrs: Object.assign({}, attrs), style: {}, children: [],
      getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }, setAttribute(k, v) { this.attrs[k] = String(v); },
      insertBefore(c, ref) { const i = this.children.indexOf(ref); if (i < 0) this.children.push(c); else this.children.splice(i, 0, c); }, get firstChild() { return this.children[0] || null; } };
    return n;
  };
  const build = () => {
    const bg = mk('g', { id: 'bgMapT', 'data-glb': '1', transform: 'translate(100 50) scale(0.5)' });
    const sat = mk('image', { id: 'typhoonSat' }); bg.children.push(sat);
    const ocean = mk('rect', { id: 'typhoonOcean', 'data-glbhid': '1' }); ocean.style.display = 'none';
    const land = mk('path', { id: 'typhoonLand', 'data-glbhid': '1' }); land.style.display = 'none';
    const clone = { attrs: {}, getAttribute: () => null,
      querySelector: (s) => ({ '#bgMapT': bg, '#typhoonOcean': ocean })[s] || null,
      querySelectorAll: (s) => (s === '[data-glbhid]' ? [ocean, land] : []) };
    return { clone, bg, ocean, land, sat };
  };
  const calls = [], warns = [];
  const extra = {
    S: { map: { x: 0, y: 0, s: 1 }, typhoon: { basemap: 'gl' } }, isTyphoon: () => true, MAP: { proj: { cx0: 2.22, cy0: 0.68, scale: 9730 } }, performance: { now: () => Date.now() + 1e6 },
    status: (m, hold, tone) => warns.push(m + '|' + tone),
    document: { createElementNS: (ns, tag) => mk(tag, {}) },
  };
  // glbQueue·glbSnap은 바꿔 끼운다(실제 지도 없이 — 받은 인자를 적고 정해 둔 그림을 돌려준다)
  let snapUrl = 'data:image/png;base64,AAAA', seq = null;
  const ctx = vm.createContext(Object.assign({ console, Math, Number, String, JSON, Promise }, extra, { __calls: calls, __url: () => (seq && seq.length ? seq.shift() : snapUrl) }));
  ctx.$ = () => null; ctx.navigator = { onLine: true };
  vm.runInContext(CONSTS.map(pick).join('\n') + '\n' + ['_glb', 'glbMode', 'glbIsMbx', 'glbName', 'glbBand', 'glbCamOf', 'glbCloneFallback', 'glbDropExp', 'glbSnapBox', 'glbInlineClone'].map(pick).join('\n') +
    '\nfunction glbQueue(fn) { return fn(); }\nasync function glbSnap(cam, vb, pw, ph, fast) { __calls.push({ cam, vb, pw, ph, fast }); return __url(); }\nglobalThis.__f = glbInlineClone;', ctx);
  // 성공: 1920×1080 프레임을 2158×1214로 — 지도 로컬 = (뷰박스 − translate) / scale
  let t = build();
  assert.equal(await ctx.__f(t.clone, 2158, 1214, null, false), true);
  const im = t.bg.children[0];
  assert.equal(im.getAttribute('data-glbimg'), '1');
  assert.equal(im.getAttribute('href'), snapUrl);
  assert.deepEqual(['x', 'y', 'width', 'height'].map((k) => +im.getAttribute(k)), [-200, -100, 3840, 2160]);
  assert.equal(im.getAttribute('preserveAspectRatio'), 'none');
  assert.equal(t.bg.children[1], t.sat, 'GL 그림이 맨 아래(첫 자식)');
  assert.equal(t.ocean.style.display, '', '바다 바탕은 보인다(띠 밖·가장자리)');
  assert.equal(t.land.style.display, 'none', '파란 육지는 숨긴 채');
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0])), { cam: { x: 100, y: 50, s: 0.5 }, vb: { x: 0, y: 0, w: 1920, h: 1080 }, pw: 2158, ph: 1214, fast: false });
  // 틸트 블리드(5760×3240 뷰박스, 미리보기) — 한 변 4096으로 줄이고 JPEG
  t = build(); calls.length = 0;
  await ctx.__f(t.clone, 5760, 3240, '-1920 -1080 5760 3240', true);
  assert.equal(calls[0].pw, 4096); assert.equal(calls[0].ph, 2304); assert.equal(calls[0].fast, true);
  // 끌기 중 CSS 변환(style)이 있으면 그걸 쓴다
  t = build(); calls.length = 0; t.bg.style.transform = 'translate(12.5px, -3px) scale(1.25)';
  await ctx.__f(t.clone, 1920, 1080, null, false);
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0].cam)), { x: 12.5, y: -3, s: 1.25 });
  // 처음 한 번 실패(타일 하나 잠깐) → 추출용 지도를 새로 만들어 한 번 더 → 넣음(영상 한 프레임만 파란 지도로 튀지 않게)
  t = build(); seq = [null, 'data:image/png;base64,BBBB']; calls.length = 0; warns.length = 0;
  assert.equal(await ctx.__f(t.clone, 1920, 1080, null, false), true);
  assert.equal(calls.length, 2); assert.equal(t.bg.children[0].getAttribute('href'), 'data:image/png;base64,BBBB'); assert.equal(warns.length, 0);
  // 실패: 한 번 더(추출용 지도 새로) 해도 GL 그림 없음 → 숨겼던 파란 지도 조각을 되살리고 한 번 알림
  t = build(); snapUrl = null; warns.length = 0; calls.length = 0;
  assert.equal(await ctx.__f(t.clone, 1920, 1080, null, false), false);
  assert.equal(calls.length, 2, '한 번 더 시도');
  assert.equal(t.bg.children.length, 1, '그림 안 넣음');
  assert.equal(t.land.style.display, '', '파란 육지 되살림'); assert.equal(t.ocean.style.display, '');
  assert.equal(warns.length, 1); assert.match(warns[0], /파란 지도로 그렸어요\|warn$/);
  // 대상 아님(data-glb 없음) → 손대지 않음
  t = build(); delete t.bg.attrs['data-glb']; calls.length = 0;
  assert.equal(await ctx.__f(t.clone, 1920, 1080, null, false), undefined);
  assert.equal(calls.length, 0); assert.equal(t.bg.children.length, 1);
});

test('다른 3모드(파란·밝은/어두운 위성) 길 그대로 + Mapbox 실시간 타일 = 같은 WebGL 길(정적): 판정·격자 규칙·추출 진입은 GL 표시가 있을 때만', () => {
  const rt = pick('_renderTyphoon');
  assert.ok(rt.includes("const isSat = !!((bmMode === 'satellite' || bmMode === 'satdark') && SAT && SAT.img);"), '위성 판정 그대로');
  assert.ok(!/isMbx|mapboxTileTemplate|scheduleMapboxTiles/.test(rt), '옛 SVG Mapbox 타일 판정·갱신 없음(10-12 — WebGL)');
  assert.ok(rt.includes("const isGl = !!(on && T && glbShowing());"), 'GL(가벼운 지도·Mapbox 실시간 타일)은 준비됐을 때만');
  assert.ok(rt.includes('glbMarkHidden(isGl, [ocean, land, krBase, relief]);'));
  assert.ok(rt.includes('if (isSat || isGl) {'));
  assert.ok(rt.includes("bmb.classList.toggle('sat', isSat || isGl);"));
  assert.ok(rt.includes('glbSync();               // 가벼운 지도 캔버스'));
  // 이 엔진의 배경 = 가벼운 지도·Mapbox 실시간 타일 둘(glbMode). 화면에 보이는 건 지도를 만든 종류와 지금 종류가 같을 때만
  assert.match(pick('glbMode'), /return b === 'gl' \|\| b === 'mapbox' \? b : '';/);
  assert.match(pick('glbActive'), /return !!glbMode\(\);/);
  assert.match(pick('glbShowing'), /_glb\.mode === glbMode\(\)/);
  // 격자: 위성 둘은 gridShowSat(기본 끔) — 4c3ea7a 규칙 그대로, 가벼운 지도는 위성 사진을 깔 때만 그 칸(아래 '격자 기본값' 시험이 4모드 결과가 옛 함수와 같음을 본다)
  assert.equal(pick('typhoonGridIsSat'), "function typhoonGridIsSat(T) { const bm = (T && T.basemap) || 'blue'; return bm === 'satellite' || bm === 'satdark' || (bm === 'gl' && glbSatOn(T)); }");
  // 추출: 복제본에 GL 표시가 있을 때만 넣는다(다른 모드는 기다림·await 없이 예전과 같은 순서)
  const s2i = pick('svgToImage');
  assert.ok(s2i.includes("if (clone.querySelector('#bgMapT[data-glb]')) await glbInlineClone(clone, W, H, viewBox, fontsUsedOnly);"));
  assert.ok(s2i.includes('if (glbPending()) await glbSettle();'));
  assert.ok(!s2i.includes('inlineMapboxTiles'), '옛 SVG Mapbox 타일 넣기 없음');
  const sb = pick('svgBlob');
  assert.ok(/if \(clone\.querySelector\('#bgMapT\[data-glb\]'\)\) \{[\s\S]*?glbInlineClone\(clone,[\s\S]*?camBleedViewBox\(\)/.test(sb), 'svgBlob — 기울이면 블리드까지');
  assert.ok(sb.indexOf('mutate(clone);') < sb.indexOf('glbInlineClone'), '레이어를 고른 뒤(빠진 레이어는 안 그림)');
  assert.ok(pick('previewPng').includes("if (clone.querySelector('#bgMapT[data-glb]')) await glbInlineClone(clone, w, h, null, true);"));
  // 끌기·휠(평면) 같은 프레임 동기화
  assert.ok(/RI\.style\.transform = tr;[^\n]*\n\s*glbSync\(\);/.test(pick('lightPanZoom')));
  // 저장: basemap은 태풍 스타일 키·프로젝트·개인 배치에 그대로(새 값 'gl'도 같은 칸) — 옛 작업은 바뀌는 것 없음
  assert.ok(/const TYPHOON_STYLE_KEYS = \[[^\]]*'basemap'/.test(html));
  assert.ok(read('js/project-io.js').includes('basemap: T.basemap'));
  assert.ok(read('js/preset-slots.js').includes('basemap: T.basemap'));
  // 메뉴 배선: 옛 모드 줄 그대로, WebGL 배경 둘(가벼운 지도·Mapbox 실시간 타일)은 팝오버를 열어 둔 채 상태 줄
  const wb = pick('wireBasemap');
  assert.ok(wb.includes("else { pop.style.display = 'none'; status({ satellite: '밝은 위성지도', satdark: '어두운 위성지도' }[b.dataset.bm] || '파란 지도', true); }"));
  assert.ok(wb.includes("if (b.dataset.bm === 'mapbox' || b.dataset.bm === 'gl') { glbPicked(); syncOpts(); }"));
  // 영상 렌더 중: 스타일(위성 ↔ 벡터)은 바꾸고 카메라만 멈춘다 — 불러오는 중 위성 실패가 벡터로 넘어가야 준비가 끝난다(프레임마다 glbSettle 13초 없음)
  { const gs = pick('_glbSync'); const a = gs.indexOf('glbRestyle(m, sat)'), b = gs.indexOf('if (_exportingFrames && _glb.view) return;'), c = gs.indexOf('m.jumpTo(');
    assert.ok(a > 0 && b > a && c > b, '스타일 바꾸기 → 렌더 중 멈춤(한 번도 자리 안 잡았으면 한 번은) → 카메라'); }
  assert.match(pick('glbSatFail'), /if \(m === _glb\.live && m\.__sat\) glbRestyle\(m, glbSatNow\(\)\);/);
  assert.match(pick('glbPrefetchUrls'), /if \(glbPending\(\)\) await glbSettle\(\);\n\s*if \(_glb\.state === 'fail'\) return \[\];/);
  // 한 번도 안 썼고 이 모드가 아니면 glbSync는 곧바로 끝(다른 배경의 끌기·렌더엔 DOM 손대기 없음)
  assert.match(pick('glbSync'), /if \(!_glb\.live && !glbActive\(\)\) return;/);
});

test('glbCamOf: 속성 transform·끌기 중 CSS 변환 둘 다 읽는다', () => {
  const X = ctxWith(['glbCamOf']);
  const n = (attr, css) => ({ style: { transform: css || '' }, getAttribute: () => attr });
  assert.deepEqual(JSON.parse(JSON.stringify(X.glbCamOf(n('translate(780 475) scale(0.112)')))), { x: 780, y: 475, s: 0.112 });
  assert.deepEqual(JSON.parse(JSON.stringify(X.glbCamOf(n('translate(1 2) scale(3)', 'translate(-12.5px, 40px) scale(1.5)')))), { x: -12.5, y: 40, s: 1.5 });
  assert.deepEqual(JSON.parse(JSON.stringify(X.glbCamOf(n('translate(-1e-7 2e+3) scale(4)')))), { x: -1e-7, y: 2000, s: 4 });
  assert.equal(X.glbCamOf(n('')), null);
});

// ---------- 'Mapbox 실시간 타일'도 WebGL(10-12) — 가짜 토큰(pk.TEST)만 ----------
const CARTO_URL = 'https://api.mapbox.com/styles/v1/user1/ckstyle01/tiles/256/{z}/{x}/{y}@2x?access_token=pk.TEST';   // Studio Share → Third party → CARTO(Fulcrum도 같은 꼴)
test('Mapbox 실시간 타일 주소 해석(glbMbxSrc): Studio Share → Third party 주소(CARTO·WMTS·ArcGIS Online)·스타일·공유 .html·mapbox:// = Static Tiles 512 @2x, v4 래스터 = 256, 다른 서버 {z}/{x}/{y} 틀(https) = 256 — 토큰 없음·비밀 토큰·http·Studio 화면 주소는 null', () => {
  const X = ctxWith(['glbSatSrc', 'glbMbxSrc']);
  const P = (u, b) => JSON.parse(JSON.stringify(X.glbMbxSrc(u, b)));
  const style = { kind: 'style', tileSize: 512, tiles: [SAT512], attr: X.GLB_ATTR_MBXS };
  for (const u of [
    CARTO_URL,
    STYLE_URL,                                                                                                  // WMTS
    'https://api.mapbox.com/styles/v1/user1/ckstyle01/tiles/256/{level}/{col}/{row}@2x?access_token=pk.TEST',   // ArcGIS Online
    'https://api.mapbox.com/styles/v1/user1/ckstyle01.html?title=view&access_token=pk.TEST#3/36/127',            // 공유 링크
    '  mapbox://styles/user1/ckstyle01?access_token=pk.TEST ',
  ]) assert.deepEqual(P(u), style, u);
  assert.equal(P(STYLE_URL, '9').tiles[0], SAT512 + '&_cb=9', "'적용'(재publish) 표시");
  assert.deepEqual(P('https://api.mapbox.com/v4/mapbox.satellite/{z}/{x}/{y}.png?access_token=pk.TEST'),
    { kind: 'v4', tileSize: 256, tiles: ['https://api.mapbox.com/v4/mapbox.satellite/{z}/{x}/{y}@2x.jpg90?access_token=pk.TEST'], attr: X.GLB_ATTR_MBXS });
  assert.deepEqual(P('https://tiles.example.com/{z}/{x}/{y}.png'), { kind: 'xyz', tileSize: 256, maxzoom: X.GLB_XYZ_MAXZ, tiles: ['https://tiles.example.com/{z}/{x}/{y}.png'], attr: X.GLB_ATTR_XYZ });
  assert.deepEqual(P('https://{s}.tiles.example.com/{z}/{x}/{y}{r}.png?key=abc', '5').tiles, ['https://a.tiles.example.com/{z}/{x}/{y}@2x.png?key=abc&_cb=5'], '서브도메인·레티나 칸, 다시 받기 표시');
  for (const u of ['', '  ', null, 'https://api.mapbox.com/styles/v1/user1/ckstyle01/wmts', 'https://api.mapbox.com/styles/v1/user1/ckstyle01/tiles/256/{z}/{x}/{y}@2x',
    STYLE_URL.replace('pk.TEST', 'sk.SECRET'), 'http://tiles.example.com/{z}/{x}/{y}.png', 'https://studio.mapbox.com/styles/user1/ckstyle01/edit/',
    'mapbox://mapbox.satellite', 'https://tiles.example.com/tiles.json', 'hello']) assert.equal(X.glbMbxSrc(u), null, String(u));
  // 가벼운 지도 위성 사진(glbSatSrc)도 비밀 토큰은 안 받는다(앱 쪽에 두면 안 되는 토큰), 다른 서버 틀은 원래대로 못 씀
  assert.equal(X.glbSatSrc(STYLE_URL.replace('pk.TEST', 'sk.SECRET')), null);
  assert.equal(X.glbSatSrc('https://tiles.example.com/{z}/{x}/{y}.png'), null);
  assert.match(X.GLB_ATTR_MBXS, /© Mapbox © OpenStreetMap/); assert.match(X.GLB_ATTR_MBXS, /Maxar/);
});

test('주소 칸 아래 까닭 한 줄(glbUrlWhy): 무엇이 틀렸는지 — 비밀 토큰·Studio 화면 주소·토큰 없음·mapbox:// 타일셋·Mapbox 다른 주소·주소 아님·http·모르는 주소, 쓸 수 있거나 비면 빈칸, 가벼운 지도 위성 사진은 다른 서버 틀을 못 씀', () => {
  const X = ctxWith(['glbSatSrc', 'glbMbxSrc', 'glbUrlWhy']);
  const W = (u, ok = true) => X.glbUrlWhy(u, ok);
  for (const u of ['', '  ', null, STYLE_URL, CARTO_URL, 'https://tiles.example.com/{z}/{x}/{y}.png']) assert.equal(W(u), '', String(u));
  assert.match(W(STYLE_URL.replace('pk.TEST', 'sk.SECRET')), /비밀 토큰\(sk\.\)이 든 주소예요 — 공개 토큰\(pk\.\)/);
  assert.match(W('https://studio.mapbox.com/styles/user1/ckstyle01/edit/#3/36/127'), /Studio 화면 주소예요 — 스타일의 Share → Third party에서 Integration URL/);
  assert.match(W('https://api.mapbox.com/styles/v1/user1/ckstyle01/wmts'), /토큰\(access_token\)이 빠졌어요 — Integration URL을 끝까지/);
  assert.match(W('mapbox://styles/user1/ckstyle01'), /토큰\(access_token\)이 빠졌어요/);
  assert.match(W('mapbox://mapbox.satellite?access_token=pk.TEST'), /mapbox:\/\/ 타일셋 주소는 못 써요/);
  assert.match(W('https://api.mapbox.com/tokens/v2?access_token=pk.TEST'), /Mapbox 주소지만 스타일/);
  assert.match(W('pk.TEST'), /주소 모양이 아니에요/);
  assert.match(W('http://tiles.example.com/{z}/{x}/{y}.png'), /http 주소는 못 써요/);
  assert.match(W('https://example.com/map.html'), /알아보지 못한 주소예요 — Mapbox 스타일 주소/);
  assert.match(W('https://tiles.example.com/{z}/{x}/{y}.png', false), /Mapbox 주소가 아니에요 — 가벼운 지도의 위성 사진은/);
  assert.equal(W(STYLE_URL, false), '');
  assert.ok(!/[\u{1F300}-\u{1FAFF}☀-➿]/u.test(pick('glbUrlWhy')), '이모지 없음');
});

test('Mapbox 실시간 타일 = 이 엔진(glbMode·glbSatNow·glbStyle): 넣어 둔 주소만(데스크톱 기본 토큰 안 씀)·[벡터만] 고른 값과 무관·한 장도 못 받은 주소는 그리지 않음(벡터로 안 바꿈)·출처 표기·격자 규칙은 옛 그대로', () => {
  let url = CARTO_URL, typ = true;
  const ctx = vm.createContext({ console, Math, Number, String, JSON, Promise, S: { typhoon: { basemap: 'mapbox' }, res: '1920x1080' }, isTyphoon: () => typ, mapboxUrlRaw: () => url,
    window: { wcgDesktop: { mapboxToken: () => 'pk.TESTDEFAULT.fake' } } });
  vm.runInContext("let _mbxCacheBust = '';\n" + CONSTS.map(pick).join('\n') + '\n' + ['_glb', 'glbMode', 'glbIsMbx', 'glbActive', 'glbSatBuiltinUrl', 'glbSatSrc', 'glbMbxSrc', 'glbMbxSrcNow', 'glbSatSrcNow',
    'glbSatPref', 'glbSatOn', 'glbSatNow', 'glbSatMissed', 'glbKeyOf', 'glbAttrOf', 'glbStyle'].map(pick).join('\n') +
    '\nglobalThis.__x = { _glb, glbMode, glbActive, glbSatNow, glbSatMissed, glbSatOn, glbStyle };', ctx);
  const X = ctx.__x, T = ctx.S.typhoon;
  assert.equal(X.glbMode(), 'mapbox'); assert.equal(X.glbActive(), true);
  const st = JSON.parse(JSON.stringify(X.glbStyle(T, X.glbSatNow())));
  assert.deepEqual(st.layers.map((l) => l.id + ':' + l.type), ['bg:background', 'sat:raster'], '그림 타일만(벡터·육지·경계 없음)');
  assert.deepEqual(st.sources.sat.tiles, [SAT512]); assert.equal(st.sources.sat.tileSize, 512); assert.equal(st.sources.sat.maxzoom, 22);
  assert.match(st.sources.sat.attribution, /© Mapbox © OpenStreetMap \(위성 사진이 들어 있으면 © Maxar\)/);
  assert.equal(st.layers[1].paint['raster-fade-duration'], 0);
  T.glSat = 0; assert.equal(X.glbSatNow().tiles[0], SAT512, '가벼운 지도의 [벡터만] 고른 값과 무관');
  url = ''; assert.equal(X.glbSatNow(), null, '주소 없음 = 기본 토큰(가벼운 지도 위성 사진용)을 쓰지 않는다 → 파란 지도');
  url = 'https://api.mapbox.com/styles/v1/user1/ckstyle01/wmts'; assert.equal(X.glbSatNow(), null, '못 알아보는 주소');
  url = 'https://tiles.example.com/{z}/{x}/{y}.png';
  const xs = JSON.parse(JSON.stringify(X.glbStyle(T, X.glbSatNow())));
  assert.deepEqual(Object.keys(xs.sources), ['sat']); assert.equal(xs.sources.sat.tileSize, 256); assert.equal(xs.sources.sat.maxzoom, 19); assert.match(xs.sources.sat.attribution, /지도 제공자/);
  url = CARTO_URL; X._glb.satBad = SAT512;
  assert.equal(X.glbSatNow(), null, '한 장도 못 받은 주소 = 그리지 않음(파란 지도 — 벡터로 안 바꿈)');
  assert.equal(X.glbSatMissed(), false, "가벼운 지도의 '위성 사진을 못 받아 벡터만' 안내 없음");
  X._glb.satBad = '';
  for (const bm of ['blue', 'satellite', 'satdark', 'weird', undefined]) { T.basemap = bm; assert.equal(X.glbMode(), '', String(bm)); assert.equal(X.glbActive(), false); }
  T.basemap = 'gl'; assert.equal(X.glbMode(), 'gl');
  T.basemap = 'mapbox'; typ = false; assert.equal(X.glbMode(), '', '태풍 지도가 아니면 아님'); typ = true;
  assert.equal(X.glbSatOn({ basemap: 'mapbox', glSat: 1 }), false, '격자 기본값은 옛 Mapbox 모드 그대로(켬 — typhoonGridIsSat)');
});

test('Mapbox 실시간 타일 시작·실패(glbStart·glbSatFail·glbFail): 주소 없음·못 알아봄 = 엔진·타일 안 받고 곧바로 파란 지도 + 까닭, 타일을 한 장도 못 받으면(401·403·그 밖·오프라인) 벡터로 바꾸지 않고 파란 지도', async () => {
  let url = '', libCalls = 0;
  const st = [], restyled = [], nav = { onLine: true }, S0 = { typhoon: { basemap: 'mapbox' }, res: '1920x1080' };
  const X = ctxWith(['GLB_WHY', '_glb', 'glbMode', 'glbIsMbx', 'glbActive', 'glbName', 'glbSatSrc', 'glbMbxSrc', 'glbMbxSrcNow', 'glbSatPref', 'glbSatSrcNow', 'glbSatBuiltinUrl', 'glbSatNow', 'glbSatMissed',
    'glbUrlWhy', 'glbWhyText', 'glbFail', 'glbCacheOn', 'glbSatFail', 'glbStart'], {
    S: S0, isTyphoon: () => true, mapboxUrlRaw: () => url, _mbxCacheBust: '',
    performance: { now: () => 1000 }, navigator: nav, window: { addEventListener() {} }, ResizeObserver: class { observe() {} }, fit: {},
    $: () => null, glbUi: () => {}, renderTyphoon: () => {}, tiltInvalidate: () => {}, camActive3d: () => false, applyTilt: () => {},
    status: (m, h, k) => st.push(k + '|' + m), glbLoadLib: async () => { libCalls++; return null; }, glbSync: () => {}, glbRestyle: (m, s) => restyled.push(s),
    clearTimeout, setTimeout,
  });
  await X.glbStart();
  assert.deepEqual([X._glb.state, X._glb.why, X._glb.mode, libCalls], ['fail', 'nourl', 'mapbox', 0], '주소 없음 — 엔진도 안 읽는다');
  assert.match(st.pop(), /^warn\|Mapbox 실시간 타일 — 주소가 없어 파란 지도로 그려요\(지도 배경 메뉴 아래 칸에 넣고 \[적용\] · 어디서 복사하는지 안내가 있어요\)$/);
  X._glb.state = 'off'; url = 'https://api.mapbox.com/styles/v1/user1/ckstyle01/wmts';
  await X.glbStart();
  assert.deepEqual([X._glb.state, X._glb.why, libCalls], ['fail', 'badurl', 0]);
  assert.match(st.pop(), /^warn\|Mapbox 지도를 못 불러와 파란 지도로 그려요 — 넣어 둔 Mapbox 주소를 알아보지 못했어요: 토큰\(access_token\)이 빠졌어요/);
  X._glb.state = 'off'; url = CARTO_URL;
  await X.glbStart();
  assert.deepEqual([X._glb.why, libCalls], ['lib', 1], '쓸 수 있는 주소면 엔진을 읽는다(여기선 가짜로 실패)');
  // 화면 지도가 위성 타일을 한 장도 못 받음 → 벡터로 안 바꾸고 파란 지도 + 까닭
  for (const [errSt, onLine, why, re] of [[401, true, 'mbxauth', /Mapbox가 타일을 막았어요\(401·403\) — 토큰이나 URL 제한을 확인해 주세요/], [403, true, 'mbxauth', /URL 제한/],
    [500, true, 'mbxtiles', /타일을 못 받았어요/], [0, false, 'offline', /인터넷 연결이 없어요/]]) {
    X._glb.state = 'loading'; X._glb.satBad = ''; nav.onLine = onLine;
    X.glbSatFail({ __errSt: errSt, __key: SAT512, __sat: true });
    assert.deepEqual([X._glb.state, X._glb.why, X._glb.satBad], ['fail', why, SAT512], String(errSt));
    assert.match(st.pop(), re);
  }
  assert.equal(restyled.length, 0, '벡터 스타일로 바꾸지 않는다');
  // 가벼운 지도는 예전 그대로(벡터로)
  nav.onLine = true; X._glb.state = 'ready'; X._glb.satBad = ''; S0.typhoon.basemap = 'gl';
  const st0 = st.length; X.glbSatFail({ __errSt: 401, __key: 'k', __sat: true });
  assert.equal(X._glb.state, 'ready'); assert.equal(X._glb.satBad, 'k'); assert.equal(st.length, st0 + 1); assert.match(st.at(-1), /위성 사진을 못 불러와 벡터 지도로/);
  // 다시 연결되면 다시 시도 — 주소 문제(nourl·badurl)·엔진·WebGL은 연결과 무관
  assert.match(pick('glbStart'), /!\['lib', 'webgl', 'nourl', 'badurl'\]\.includes\(_glb\.why\)\) glbRetry\(\);/);
});

test('Mapbox 실시간 타일 배선(정적): 배경 종류가 바뀌면 지도를 새로 만든다·[적용]은 처음부터·추출 숨은 지도도 벡터로 안 바꿈·다시 시도 단추는 주소 문제엔 없음·기본 토큰은 가벼운 지도만', () => {
  const gs = pick('_glbSync');
  assert.match(gs, /if \(act && _glb\.mode && _glb\.mode !== glbMode\(\) && _glb\.state !== 'off'\) glbReset\(\);/, '가벼운 지도 ↔ Mapbox 실시간 타일(메뉴·되돌리기·작업 열기)');
  assert.ok(gs.indexOf('glbReset()') < gs.indexOf("_glb.state === 'off' && S.res"), '새로 만든 뒤 곧바로 시작(glbStart)');
  assert.match(gs, /if \(!sat && glbIsMbx\(\)\) \{/, '쓸 주소가 없어지면 벡터 대신 파란 지도');
  assert.match(pick('glbStart'), /_glb\.mode = glbMode\(\);/);
  assert.match(pick('glbStart'), /if \(_glb\.mode === 'mapbox' && !glbMbxSrcNow\(\)\) \{ glbFail\(mapboxUrlRaw\(\)\.trim\(\) \? 'badurl' : 'nourl'\); return; \}/);
  assert.match(pick('glbRetry'), /glbReset\(\);\n\s*glbSync\(true\);/);
  assert.match(pick('glbUrlApplied'), /if \(glbIsMbx\(\)\) \{ glbRetry\(\); glbUi\(\); return; \}/);
  const sn = pick('glbSnap');
  assert.match(sn, /if \(glbIsMbx\(\) && !glbSatNow\(\)\) return null;/, '주소 없음·못 받은 주소 = 그 그림은 파란 지도');
  assert.match(sn, /glbSatFail\(m\);\n\s*if \(glbIsMbx\(\)\) \{ done = false; break; \}/);
  assert.match(pick('glbPrefetchUrls'), /if \(!sat && glbIsMbx\(\)\) return \[\];/);
  assert.match(pick('glbUi'), /const retry = _glb\.state === 'fail' && !vf && _glb\.why !== 'nourl' && _glb\.why !== 'badurl';/);
  assert.match(pick('glbTokenArrived'), /if \(glbMode\(\) !== 'gl' \|\| /);
  assert.match(pick('glbPicked'), /nm = mbx \? 'Mapbox 실시간 타일' : '가벼운 지도 \(WebGL · 시험\)'/);
});

test('메뉴: 내 Mapbox 지도 주소 칸 — 상태 줄·다시 시도·까닭 한 줄·[?] 주소 안내(Studio → Share → Third party → CARTO/WMTS → Integration URL, 영문 이름 병기)·Studio 열기·pk./sk.·URL 제한 주의, 이모지 없음', () => {
  const box = /<div class="bmMbx" id="bmMbxBox"[\s\S]*?\n {6}<\/div>/.exec(html)[0];
  for (const id of ['bmMbxState', 'bmMbxRetry', 'bmMbxUrl', 'bmMbxWhy', 'bmMbxApply', 'bmMbxHelpBtn', 'bmMbxHelp', 'bmMbxStudio']) assert.ok(box.includes(`id="${id}"`), id);
  assert.ok(box.indexOf('id="bmMbxUrl"') < box.indexOf('id="bmMbxWhy"') && box.indexOf('id="bmMbxWhy"') < box.indexOf('id="bmMbxApply"'), '까닭 한 줄은 주소 칸 바로 아래');
  assert.match(box, /<button id="bmMbxHelpBtn" class="bmHelpBtn" type="button" aria-expanded="false" aria-controls="bmMbxHelp"><svg [^>]*aria-hidden="true">[\s\S]*?<\/svg>내 Mapbox 지도 주소는 어디서\?<\/button>/, '[?] = SVG 아이콘');
  const steps = [...box.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => m[1].replace(/<[^>]+>/g, ''));
  assert.equal(steps.length, 6, steps.join(' / '));
  assert.match(steps[0], /Mapbox Studio\(studio\.mapbox\.com\)에 로그인/);
  assert.match(steps[1], /Styles/);
  assert.match(steps[2], /Share\(공유\)/); assert.match(steps[2], /Production/);
  assert.match(steps[3], /Develop\(개발\)/); assert.match(steps[3], /Third party\(타사\)/); assert.match(steps[3], /CARTO/); assert.match(steps[3], /WMTS/);
  assert.match(steps[4], /Integration URL/); assert.match(steps[4], /access_token=pk\./);
  assert.match(steps[5], /붙여 넣고 적용/);
  assert.match(box, /공개 토큰\(<b>pk\.<\/b>\)이 든 주소만 넣고 비밀 토큰\(sk\.\)은 넣지 마세요/);
  assert.match(box, /<b>URL 제한<\/b>\(URL restrictions\)을 걸면 이 앱에서는 막힐 수 있어요\(403\)/);
  assert.ok(!/[\u{1F300}-\u{1FAFF}☀-➿]/u.test(box), '이모지 없음');
  assert.ok(!/id="typhoonTiles"/.test(html), '옛 SVG 타일 그룹 없음');
  // 배선: [?] 펼치기·접기(사용자가 고른 대로), 주소가 없으면 펼쳐 둠, 고치는 동안 까닭 한 줄, Studio는 기본 브라우저로
  const w = pick('glbWire');
  assert.match(w, /_glb\.help = !!\(hp && hp\.hidden\); glbUrlNote\(\);/);
  assert.match(w, /window\.open\(GLB_STUDIO, '_blank', 'noopener'\)/);
  assert.match(w, /urlIn\.addEventListener\('input', glbUrlNote\)/);
  assert.match(pick('GLB_STUDIO'), /'https:\/\/studio\.mapbox\.com\/'/);
  const n = pick('glbUrlNote');
  assert.match(n, /const open = _glb\.help != null \? _glb\.help : !mapboxUrlRaw\(\)\.trim\(\);/);
  assert.match(n, /glbUrlWhy\(urlIn \? urlIn\.value : mapboxUrlRaw\(\), mode === 'mapbox'\)/);
  const css = read('css/toss-modal.css');
  for (const sel of ['.basemapPop #bmMbxBox {', '.basemapPop .bmMbxWhy {', '.basemapPop .bmHelpBtn {', '.basemapPop .bmMbxHelp {', '.basemapPop .bmLink {']) assert.ok(css.includes(sel), sel);
  // 안내를 펼치면 길다 — 팝오버는 창에 남은 높이까지, 넘치면 안에서 스크롤(앱 스크롤바)
  assert.ok(css.includes('#basemapPop { overflow-y: auto; overscroll-behavior: contain; }') && css.includes('#basemapPop::-webkit-scrollbar-thumb {'));
  const wb = pick('wireBasemap');
  assert.match(wb, /const fitPop = \(\) => \{[\s\S]*?pop\.style\.maxHeight = Math\.max\(200, Math\.floor\(\(window\.innerHeight - r\.top - 12\) \/ k\)\) \+ 'px';/);
  assert.match(wb, /glbUi\(\);[^\n]*\n\s*fitPop\(\);\n\s*\};/, '열 때·바뀔 때(syncOpts) 맞춤');
});

test('옛 작업(basemap mapbox)은 그대로 열린다 — 저장 값을 바꾸지 않고 같은 배경(이제 WebGL)으로', () => {
  const ctx = vm.createContext({ console, Math, JSON, Object, S: {}, window: {} });
  vm.runInContext(['TYPHOON_DEFAULTS', 'typhoonStyleDefaults', 'initTyphoonData', 'TYPHOON_STYLE_KEYS', 'TYPHOON_PER_WORK_KEYS', 'applyTyphoonStyle'].map(pick).join('\n') + '\nglobalThis.__x = { initTyphoonData, applyTyphoonStyle };', ctx);
  ctx.S.typhoon = { issues: [{ points: [] }], sel: 0, basemap: 'mapbox', lineWidth: 5 };
  ctx.__x.initTyphoonData(); assert.equal(ctx.S.typhoon.basemap, 'mapbox');
  ctx.window.WCG_DEFAULTS = { typhoonStyle: { basemap: 'mapbox' } };
  ctx.S.typhoon = { basemap: 'blue' }; ctx.__x.applyTyphoonStyle(); assert.equal(ctx.S.typhoon.basemap, 'mapbox', '구운 기본 배치의 mapbox도 그대로');
  // 그 배경 = 이 엔진(glbMode) — 실제로 여는 건 부팅 점검(gl-mapbox.boot-eval.js 'old')
  assert.match(pick('glbMode'), /b === 'gl' \|\| b === 'mapbox'/);
});

test('실제 앱: 가벼운 지도 고르기·준비·정렬(화면 끌기·휠·재생 프레임)·추출(평면·틸트·AE 영역)·저장·대체(오프라인·타일 실패·노말 VF)·다른 3모드',
  { skip: process.env.WCG_BOOT_CHECK !== '1' && 'WCG_BOOT_CHECK=1 일 때만(일렉트론·인터넷 필요)' }, () => {
    let raw;
    try {
      raw = execFileSync(process.execPath, [path.join(root, 'desktop', 'test', 'boot-check.cjs'), root, '--wait=7000', '--size=1600x900', '--keepalive', '--eval=' + path.join(__dirname, 'gl-basemap.boot-eval.js')], { encoding: 'utf8', timeout: 600000, maxBuffer: 1 << 26 });
    } catch (e) { raw = e.stdout; }
    const j = JSON.parse(raw);
    assert.equal(j.ok, true, JSON.stringify(j.errors));
    const o = j.evalResult;
    assert.ok(o && !o.error, o && o.error);
    // 다른 3모드: GL 흔적 없음
    for (const [bm, r] of Object.entries(o.old)) assert.deepEqual(r, { glMap: 'none', marks: 0, img: 0 }, bm);
    // 대체(인터넷 없이도 도는 부분)
    assert.equal(o.offline.state, 'fail'); assert.equal(o.offline.why, 'offline');
    assert.ok(o.offline.blue && o.offline.glHidden && o.offline.retryBtn, JSON.stringify(o.offline));
    assert.match(o.offline.ui, /인터넷/); assert.match(o.offline.status, /파란 지도/);
    assert.equal(o.offline.proto, true, '데스크톱 디스크 캐시 길이라 오프라인이어도 한 번 해 본 뒤(받은 게 없어) 파란 지도');
    if (!o.net) { console.log('# 인터넷 없음 — GL 그리기 검사 건너뜀: ' + JSON.stringify(o.netWhy)); return; }
    assert.equal(o.pick.popOpen, true, '고르면 팝오버를 열어 둔 채 상태 줄');
    assert.equal(o.ready.state, 'ready');
    assert.ok(o.ready.ms < 25000, 'ready ' + o.ready.ms);
    assert.ok(o.ready.hidden.every((h) => /:none:1$/.test(h)), '파란 바다·육지·남한 바탕·지형 숨김 + 표시 ' + o.ready.hidden);
    assert.equal(o.ready.dataGlb, '1');
    // 위성 사진(기본)인데 출처 없음(점검은 기본 토큰을 안 준다) → 벡터만 + 까닭 한 줄 + 주소 칸(가벼운 지도 칸 안) + 흐린 위성 칸 + 알림
    assert.equal(o.ready.noSrc.tok, '', '자동 점검엔 실제 토큰 없음'); assert.equal(o.ready.noSrc.sat, false); assert.equal(o.ready.noSrc.basemap, 'gl');
    assert.match(o.ready.noSrc.note, /Mapbox 주소가 없어 벡터만 그려요 — 아래 칸에/); assert.equal(o.ready.noSrc.mbxBox, '', '주소 칸이 보임'); assert.equal(o.ready.noSrc.miss, true);
    assert.match(o.ready.noSrc.status, /Mapbox 주소가 없어 벡터만/);
    for (const k of ['live', 'drag', 'zoom', 'anim', 'resize']) assert.ok(o.align[k] < 0.5, `${k} 정렬 ${o.align[k]}px — ${JSON.stringify(o.align)}`);
    assert.equal(o.align.sameFrame, true, '끌기 프레임 안에서 바로 맞춤(다음 프레임 기다림 없음)');
    assert.ok(o.pix.live < 1 && o.pix.export < 1, '실제 GPU로 그린 시험 선 = 앱 좌표(1px 안쪽) ' + JSON.stringify(o.pix));
    // 추출
    assert.equal(o.exp.flat.inl, true, '평면 추출 = GL 그림'); assert.ok(o.exp.flat.seaTopBottom < 6, '바다가 한 색(GL) — 파란 지도 그라디언트면 30 넘음 ' + o.exp.flat.seaTopBottom);
    assert.ok(o.exp.flat.seaDiff < 8, 'GL 바다색 ' + JSON.stringify(o.exp.flat));
    assert.equal(o.exp.tiltPreview, true, '틸트 미리보기 그림도 GL'); assert.equal(o.exp.tiltHidden, 'hidden', '기울이면 평면 캔버스 숨김');
    assert.equal(o.exp.tiltFrame, true); assert.equal(o.exp.box, true, 'AE 블리드 영역(box)');
    // 실패 흉내 → 그 그림만 파란 지도 + 알림
    assert.equal(o.exp.failInl, false); assert.match(o.exp.failStatus, /파란 지도/); assert.ok(o.exp.failSeaTopBottom > 20, '파란 지도 바다 그라디언트 ' + o.exp.failSeaTopBottom);
    // 저장·불러오기
    assert.equal(o.save.state, 'gl'); assert.equal(o.save.work, true); assert.equal(o.save.reload, 'gl'); assert.equal(o.save.reloadReady, true);
    assert.equal(o.save.old, 'satdark'); assert.equal(o.save.oldGl, 'none');
    // 노말 VF → 파란 지도
    assert.ok(o.vf.blue && o.vf.glHidden, JSON.stringify(o.vf)); assert.match(o.vf.ui, /노말 VF/);
    // 다시 고르기(엔진·캐시 따뜻함)·파란 지도로 돌아가기
    assert.equal(o.warm.state, 'ready');
    assert.deepEqual(o.back, { glMap: 'none', marks: 0, ocean: '' });
  });

test('실제 앱: 위성 사진(가짜 Mapbox 주소 pk.TEST·가짜 기본 토큰 + 합성 그림 타일) — 준비·GPU 픽셀 정렬·추출·벡터만/되돌리기·렌더 전 미리 받기 뒤 추가 요청 0·전부/일부 실패·렌더 중 실패·모두 실패·오프라인 캐시·기본 토큰·주소 적용·저장·다른 3모드',
  { skip: process.env.WCG_BOOT_CHECK !== '1' && 'WCG_BOOT_CHECK=1 일 때만(일렉트론 필요 — 벡터만 부분은 인터넷)' }, () => {
    let raw;
    try {
      // 기본 토큰은 가짜(자동 점검은 desktop/private/mapbox.token을 읽지 않는다 — 그 값 대신 이것) — 그 주소 요청은 합성 그림 타일로(실제 Mapbox 요청 없음)
      raw = execFileSync(process.execPath, [path.join(root, 'desktop', 'test', 'boot-check.cjs'), root, '--wait=7000', '--size=1600x900', '--keepalive', '--eval=' + path.join(__dirname, 'gl-satellite.boot-eval.js')],
        { encoding: 'utf8', timeout: 600000, maxBuffer: 1 << 26, env: { ...process.env, WCG_TEST_MAPBOX_TOKEN: 'pk.TESTDEFAULT.fake' } });
    } catch (e) { raw = e.stdout; }
    const j = JSON.parse(raw);
    assert.equal(j.ok, true, JSON.stringify(j.errors));
    const o = j.evalResult;
    assert.ok(o && !o.error, o && o.error);
    assert.equal(o.tok, true, '메인 → preload(invoke) → 앱으로 기본 토큰이 온다');
    assert.equal(o.ready.proto, true, '데스크톱 디스크 캐시 길(wcgtile://) — 합성 타일을 우리 받기에서 준다');
    // 준비: 위성 그림 타일만(벡터 타일·TileJSON 안 받음), 파란 지도 숨김, 상태 줄·고르기·출처·격자(위성 = 끔)
    assert.equal(o.ready.state, 'ready'); assert.equal(o.ready.sat, true); assert.ok(o.ready.okSat > 0 && o.ready.errSat === 0, JSON.stringify(o.ready));
    assert.equal(o.ready.ofm, 0, 'OpenFreeMap 요청 없음'); assert.ok(o.ready.ms < 15000, 'ready ' + o.ready.ms);
    assert.deepEqual(o.ready.hidden, ['none', 'none', 'none', 'none']); assert.equal(o.ready.glVis, 'visible');
    assert.match(o.ready.ui, /위성 사진/); assert.deepEqual(o.ready.seg, ['1']); assert.equal(o.ready.note, 'none');
    assert.match(o.ready.attr, /Mapbox.*Maxar/); assert.equal(o.ready.bmAttr, o.ready.attr);
    assert.equal(o.ready.grid, 0, '격자 기본 끔'); assert.equal(o.ready.eyeOff, true);
    // 실제 GPU 픽셀 정렬(합성 그림의 빨간 선 — 화면·추출 1px 안쪽)
    assert.ok(o.pix.live < 1 && o.pix.export < 1 && o.pix.snapOk, JSON.stringify(o.pix));
    // 추출 그림에 위성(합성 초록), 캔버스 오염 없음, 틸트 미리보기·프레임
    assert.equal(o.exp.inl, true); assert.ok(o.exp.green < 8, '추출 그림 = 위성 그림 ' + JSON.stringify(o.exp)); assert.equal(o.exp.dataUrl, 'data:image/jpeg;base64');
    assert.equal(o.exp.tiltPreview, true); assert.equal(o.exp.tiltFrame, true);
    // 벡터만·되돌리기
    assert.equal(o.vec.glSat, 0); assert.equal(o.vec.sat, false); assert.deepEqual(o.vec.seg, ['0']); assert.equal(o.vec.grid, 1, '벡터만 = 격자 기본 켬'); assert.equal(o.vec.eyeOff, false);
    assert.match(o.vec.attr, /OpenFreeMap/);
    if (o.vec.okOmt > 0) { assert.equal(o.vec.inl, true); assert.ok(o.vec.sea < 8, '벡터 바다색 ' + o.vec.sea); } else console.log('# 인터넷 없음 — 벡터만 그림 검사 건너뜀');
    assert.deepEqual(o.undo, { glSat: 1, sat: true, grid: 0 });
    // 렌더 전 미리 받기(카메라 키 2개) 뒤 프레임 렌더 중 미리 받은 것 밖 요청 0 — MapLibre 래스터 반올림 배율·512 타일과 같다
    assert.deepEqual(o.keys[1], [925, 454, 1.25]);
    assert.ok(o.pre.n > 0 && o.pre.n === o.pre.uniq, JSON.stringify(o.pre));
    assert.ok(o.frames.calls > 0, '프레임은 숨은 지도가 타일을 우리 받기로(디스크 캐시) 읽는다');
    assert.equal(o.frames.extra, 0, '미리 받은 것 밖 요청 ' + JSON.stringify(o.frames));
    assert.equal(o.frames.inl, 7); assert.equal(o.frames.fail, 0);
    // 전부 실패(401) → 벡터만 + 까닭(토큰·URL 제한), 다시 '위성 사진' → 다시 받음
    assert.equal(o.allFail.satBad, true); assert.equal(o.allFail.sat, false); assert.match(o.allFail.note, /토큰이나 URL 제한/);
    if (o.allFail.state === 'ready') { assert.match(o.allFail.status, /위성 사진을 못 받아 벡터만/); assert.equal(o.allFail.inl, true); assert.ok(o.allFail.sea < 8); }
    assert.deepEqual(o.reSat, { sat: true, ok: o.reSat.ok, satBad: '', state: 'ready' }); assert.ok(o.reSat.ok > 0);
    // 렌더 중 + 불러오는 중 위성 전부 실패 → 몇 초 안에 끝(벡터로 준비 — 인터넷 없으면 파란 지도), 다음 프레임은 기다림 없음
    assert.ok(o.expLoad.ms < 9000, 'glbSettle ' + JSON.stringify(o.expLoad)); assert.ok(o.expLoad.state === 'ready' || o.expLoad.state === 'fail', JSON.stringify(o.expLoad));
    assert.equal(o.expLoad.satBad, true); assert.equal(o.expLoad.pending, false); assert.ok(o.expLoad.again < 100, 'again ' + o.expLoad.again);
    if (o.expLoad.state === 'ready') assert.equal(o.expLoad.sat, false, '벡터로 준비');
    // 위성도 벡터도 못 받음 → 파란 지도 + 경고 하나(둘 다 못 받음 — OpenFreeMap 탓으로만 말하지 않음)
    assert.equal(o.both.state, 'fail'); assert.equal(o.both.why, 'net');
    assert.equal(o.both.warns.length, 1, JSON.stringify(o.both.warns)); assert.match(o.both.warns[0], /위성 사진과 벡터 지도를 모두 못 받았어요. 인터넷/); assert.match(o.both.ui, /모두 못 받았어요/);
    // 일부 실패 → 화면 준비(받은 데까지), 추출도 다시 해 본 뒤 받은 데까지(파란 지도로 안 튐) + 알림
    assert.equal(o.part.state, 'ready'); assert.equal(o.part.sat, true); assert.ok(o.part.ok > 0 && o.part.err > 0);
    assert.equal(o.part.inl, true); assert.match(o.part.status, /몇 칸을 못 받아/);
    // 오프라인이어도 받아 둔 타일이 있으면(디스크 캐시 길) 위성 사진으로 준비
    assert.deepEqual(o.offCache, { state: 'ready', why: '', sat: true, ok: o.offCache.ok }); assert.ok(o.offCache.ok > 0);
    // 넣어 둔 주소 없음 → 데스크톱 기본 토큰으로 기본 스타일 위성 사진(안내 줄·주소 칸 없음, 격자 끔)
    assert.equal(o.def.sat, true); assert.ok(o.def.ok > 0 && o.def.defCalls > 0, JSON.stringify(o.def)); assert.equal(o.def.ownCalls, 0);
    assert.equal(o.def.note, 'none'); assert.equal(o.def.mbxBox, 'none'); assert.equal(o.def.grid, 0); assert.match(o.def.attr, /Mapbox.*Maxar/);
    // 넣어 둔 주소로 못 받음 → 가벼운 지도 칸 안에 주소 칸 → [적용] → 배경 그대로(gl), 위성 사진 다시
    assert.equal(o.apply.before.sat, false); assert.equal(o.apply.before.mbxBox, ''); assert.equal(o.apply.before.miss, true); assert.match(o.apply.before.note, /토큰이나 URL 제한/);
    assert.equal(o.apply.after.basemap, 'gl'); assert.equal(o.apply.after.sat, true); assert.ok(o.apply.after.ok > 0); assert.equal(o.apply.after.mbxBox, 'none'); assert.equal(o.apply.after.miss, false);
    assert.equal(o.apply.after.gridEyeOff, true);
    // 저장·불러오기·옛 작업(glSat 없음 = 위성 사진)
    assert.deepEqual(o.save, { glSat: 0, reload: 0, sat: false, old: 1, oldSat: true });
    // 다른 3모드: GL 흔적 없음, 격자 칸 그대로
    for (const [bm, r] of Object.entries(o.old)) assert.deepEqual(r, { glMap: 'none', marks: 0, img: 0, gridSat: bm === 'satellite' || bm === 'satdark' }, bm);
  });

test('실제 앱: Mapbox 실시간 타일 = WebGL(가짜 주소 pk.TEST + 합성 그림 타일) — 주소 없음·못 알아봄 안내, 준비(그림 타일만), 정렬·GPU 픽셀, 추출·틸트·AE, 렌더 전 미리 받기 뒤 추가 요청 0, 가벼운 지도 ↔ Mapbox·되돌리기, 401 → 파란 지도·다시 시도, 일부 실패, WebGL 못 씀, 노말 VF, 저장·옛 작업, 다른 3모드',
  { skip: process.env.WCG_BOOT_CHECK !== '1' && 'WCG_BOOT_CHECK=1 일 때만(일렉트론 필요 — 인터넷 없이 됨)' }, () => {
    let raw;
    try {
      raw = execFileSync(process.execPath, [path.join(root, 'desktop', 'test', 'boot-check.cjs'), root, '--wait=7000', '--size=1600x900', '--keepalive', '--eval=' + path.join(__dirname, 'gl-mapbox.boot-eval.js')],
        { encoding: 'utf8', timeout: 600000, maxBuffer: 1 << 26, env: { ...process.env, WCG_TEST_MAPBOX_TOKEN: 'pk.TESTDEFAULT.fake' } });
    } catch (e) { raw = e.stdout; }
    const j = JSON.parse(raw);
    assert.equal(j.ok, true, JSON.stringify(j.errors));
    const o = j.evalResult;
    assert.ok(o && !o.error, o && o.error);
    // 주소 없음 → 엔진·타일 안 받고 파란 지도 + 안내(다시 시도 없음), 주소 칸·안내 펼침, [?] 접고 펴기, Studio [열기]
    const n = o.noUrl;
    assert.equal(o.libBefore, false);
    assert.deepEqual([n.state, n.why, n.mode, n.blue, n.glHidden, n.calls, n.lib, n.dataGlb], ['fail', 'nourl', 'mapbox', true, true, 0, false, null], JSON.stringify(n));
    assert.match(n.warn, /Mapbox 실시간 타일 — 주소가 없어 파란 지도로 그려요/);
    assert.equal(n.box, ''); assert.equal(n.glBox, 'none'); assert.equal(n.stShown, ''); assert.match(n.stText, /Mapbox 주소가 없어 파란 지도로 그려요/); assert.equal(n.retry, 'none'); assert.equal(n.whyLine, '');
    assert.equal(n.help, true, '주소가 없으면 안내를 펼쳐 둔다'); assert.equal(n.helpExp, 'true'); assert.equal(n.helpToggled, false); assert.equal(n.helpBack, true);
    assert.deepEqual(n.opened, ['https://studio.mapbox.com/']); assert.equal(n.popFits, true, '안내를 펼쳐도 팝오버가 창 안(넘치면 안에서 스크롤)');
    // 못 알아보는 주소 — 고치는 동안 까닭 한 줄, [적용] → 파란 지도 + 까닭(요청 0)
    const b = o.bad;
    assert.match(b.typed.noTok, /토큰\(access_token\)이 빠졌어요/); assert.match(b.typed.sk, /비밀 토큰\(sk\.\)/); assert.match(b.typed.studio, /Studio 화면 주소예요/);
    assert.equal(b.typed.ok, ''); assert.equal(b.typed.empty, '');
    assert.deepEqual([b.state, b.why, b.blue, b.calls, b.retry], ['fail', 'badurl', true, 0, 'none'], JSON.stringify(b));
    assert.match(b.warn, /Mapbox 지도를 못 불러와 파란 지도로 그려요 — 넣어 둔 Mapbox 주소를 알아보지 못했어요: 토큰\(access_token\)이 빠졌어요/);
    assert.match(b.whyLine, /토큰\(access_token\)이 빠졌어요/); assert.match(b.stText, /알아보지 못했어요/);
    // 쓸 수 있는 주소 [적용] → 불러오는 동안 파란 지도, WebGL 준비 — 그림 타일만(Static Tiles 512, 재publish 표시), 파란 지도 숨김, 출처, 격자 규칙 옛 그대로
    assert.equal(o.applyLoading.blue, true);
    const r = o.ready;
    assert.deepEqual([r.state, r.mode, r.basemap, r.proto, r.sat], ['ready', 'mapbox', 'mapbox', true, true], JSON.stringify(r));
    assert.ok(r.okSat > 0 && r.errSat === 0 && r.mbx > 0, JSON.stringify(r)); assert.equal(r.ofm, 0, 'OpenFreeMap 요청 없음'); assert.deepEqual(r.ts, ['512']); assert.equal(r.cb, true);
    assert.ok(r.ms < 15000, 'ready ' + r.ms);
    assert.ok(r.hidden.every((h) => /^none:1$/.test(h)), r.hidden.join()); assert.equal(r.dataGlb, '1'); assert.equal(r.glVis, 'visible');
    assert.match(r.attr, /© Mapbox © OpenStreetMap/); assert.equal(r.attrShown, '');
    assert.equal(r.gridSat, false, '격자 기본값은 옛 Mapbox 모드 그대로(켬)'); assert.equal(r.btnSat, true);
    assert.match(r.stText, /^WebGL로 그리는 중 · 처음 표시/); assert.equal(r.whyLine, ''); assert.equal(r.retry, 'none'); assert.equal(r.why, '');
    // 정렬(화면·끌기·휠·재생 프레임 — 같은 프레임)·GPU 픽셀(합성 그림의 빨간 선 — 화면·추출 1px 안쪽)
    for (const k of ['live', 'drag', 'zoom', 'anim']) assert.ok(o.align[k] < 0.5, `${k} 정렬 ${o.align[k]}px — ${JSON.stringify(o.align)}`);
    assert.ok(o.pix.live < 1 && o.pix.export < 1 && o.pix.snapOk, JSON.stringify(o.pix));
    // 추출 — 그림에 Mapbox 그림(합성 보라)·캔버스 오염 없음, 틸트 미리보기·프레임, AE 블리드 영역
    assert.equal(o.exp.inl, true); assert.ok(o.exp.purple < 10, '추출 그림 = Mapbox 그림 ' + JSON.stringify(o.exp)); assert.equal(o.exp.dataUrl, 'data:image/jpeg;base64');
    assert.equal(o.exp.tiltPreview, true); assert.equal(o.exp.tiltHidden, 'hidden'); assert.equal(o.exp.tiltFrame, true); assert.equal(o.exp.box, true);
    // 렌더 전 미리 받기 뒤 프레임 렌더 중 미리 받은 것 밖 요청 0
    assert.ok(o.pre.n > 0 && o.pre.n === o.pre.uniq && o.pre.mbx === o.pre.n, JSON.stringify(o.pre));
    assert.ok(o.frames.calls > 0, '프레임은 숨은 지도가 타일을 우리 받기로(디스크 캐시) 읽는다');
    assert.equal(o.frames.extra, 0, '미리 받은 것 밖 요청 ' + JSON.stringify(o.frames)); assert.equal(o.frames.inl, 7); assert.equal(o.frames.fail, 0);
    // 가벼운 지도로 바꾸기 → 새 지도(불러오는 동안 파란 지도) → 위성 사진으로 준비, 되돌리기 → Mapbox 실시간 타일로 다시
    assert.equal(o.toGl.loadingBlue, true); assert.deepEqual([o.toGl.state, o.toGl.mode, o.toGl.sat], ['ready', 'gl', true]); assert.match(o.toGl.attr, /위성 사진 © Maxar/);
    assert.equal(o.toGl.glBox, ''); assert.equal(o.toGl.box, 'none'); assert.equal(o.toGl.stShown, 'none');
    assert.equal(o.undo.basemap, 'mapbox'); assert.equal(o.undo.loadingBlue, true); assert.deepEqual([o.undo.state, o.undo.mode, o.undo.dataGlb], ['ready', 'mapbox', '1']); assert.match(o.undo.attr, /위성 사진이 들어 있으면/);
    // 401 → 벡터로 안 바꾸고 파란 지도 + 까닭 + 다시 시도(벡터 타일 요청 없음, 추출도 파란 지도), 다시 시도 → 준비
    const f = o.fail;
    assert.deepEqual([f.state, f.why, f.blue, f.glHidden, f.ofm, f.dataGlb, f.inl], ['fail', 'mbxauth', true, true, 0, null, 0], JSON.stringify(f));
    assert.match(f.warn, /Mapbox 지도를 못 불러와 파란 지도로 그려요 — Mapbox가 타일을 막았어요\(401·403\) — 토큰이나 URL 제한을 확인해 주세요/); assert.equal(f.nWarn, 1, '경고 하나');
    assert.equal(f.retry, '', '다시 시도 단추'); assert.match(f.stText, /토큰이나 URL 제한/);
    assert.equal(o.retry.state, 'ready'); assert.ok(o.retry.ok > 0);
    // 일부 실패 → 받은 데까지(화면·추출)
    assert.equal(o.part.state, 'ready'); assert.ok(o.part.ok > 0 && o.part.err > 0, JSON.stringify(o.part)); assert.equal(o.part.inl, true);
    // WebGL 못 씀 → 파란 지도 + 까닭
    assert.deepEqual([o.webgl.state, o.webgl.why, o.webgl.blue], ['fail', 'webgl', true]); assert.match(o.webgl.warn, /WebGL을 쓸 수 없어요/);
    // 노말 VF → 파란 지도
    assert.ok(o.vf.blue && o.vf.glHidden, JSON.stringify(o.vf)); assert.match(o.vf.stText, /노말 VF/);
    // 저장 — 작업엔 basemap만(주소·토큰 없음), 옛 작업(basemap mapbox) 열기 = 같은 배경(WebGL)
    assert.deepEqual(o.save, { basemap: 'mapbox', noUrl: true, work: true, reload: 'mapbox', state: 'ready', mode: 'mapbox', shown: true });
    // 다른 3모드: GL 흔적 없음, 격자 칸 그대로
    for (const [bm, x] of Object.entries(o.old)) assert.deepEqual(x, { glMap: 'none', marks: 0, img: 0, gridSat: bm === 'satellite' || bm === 'satdark' }, bm);
  });
