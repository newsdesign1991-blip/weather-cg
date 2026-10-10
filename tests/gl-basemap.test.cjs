// 태풍 지도 배경 '가벼운 지도 (WebGL · 시험)'(js/gl-basemap.js) — 메뉴·엔진 파일·자체 스타일·투영 정렬(MapLibre 웹 메르카토르와 1:1)·
// 추출 복제본 넣기/되돌리기·다른 4모드 길 그대로(정적). WCG_BOOT_CHECK=1이면 실제 앱(숨은 Electron + 실제 OpenFreeMap 타일)도:
//   WCG_BOOT_CHECK=1 node --test tests/gl-basemap.test.cjs
// 인터넷이 없으면 실제 앱 검사의 GL 부분은 건너뛴다(대체 파란 지도 검사는 그대로).
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
const CONSTS = ['GLB_LIB', 'GLB_TILES', 'GLB_ATTR', 'GLB_SEA', 'GLB_BORDER', 'GLB_SNAP_MAX', 'GLB_WAIT_MS', 'GLB_SNAP_MS', 'GLB_MERC_LAT'];
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
  assert.ok(!/api\.mapbox\.com|access_token|key=/.test(read('js/gl-basemap.js')), '비밀값·키 없음');
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
    S: { map: { x: 0, y: 0, s: 1 } }, MAP: { proj: { cx0: 2.22, cy0: 0.68, scale: 9730 } }, performance: { now: () => Date.now() + 1e6 },
    status: (m, hold, tone) => warns.push(m + '|' + tone),
    document: { createElementNS: (ns, tag) => mk(tag, {}) },
  };
  // glbQueue·glbSnap은 바꿔 끼운다(실제 지도 없이 — 받은 인자를 적고 정해 둔 그림을 돌려준다)
  let snapUrl = 'data:image/png;base64,AAAA', seq = null;
  const ctx = vm.createContext(Object.assign({ console, Math, Number, String, JSON, Promise }, extra, { __calls: calls, __url: () => (seq && seq.length ? seq.shift() : snapUrl) }));
  ctx.$ = () => null; ctx.navigator = { onLine: true };
  vm.runInContext(CONSTS.map(pick).join('\n') + '\n' + ['_glb', 'glbBand', 'glbCamOf', 'glbCloneFallback', 'glbDropExp', 'glbInlineClone'].map(pick).join('\n') +
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

test('다른 4모드 길 그대로(정적): 위성·Mapbox 판정·격자 규칙·추출 진입은 GL 표시가 있을 때만', () => {
  const rt = pick('_renderTyphoon');
  assert.ok(rt.includes("const isSat = !!((bmMode === 'satellite' || bmMode === 'satdark') && SAT && SAT.img);"), '위성 판정 그대로');
  assert.ok(rt.includes("const isMbx = !!(on && T && T.basemap === 'mapbox' && mapboxTileTemplate());"), 'Mapbox 판정 그대로');
  assert.ok(rt.includes("const isGl = !!(on && T && T.basemap === 'gl' && glbShowing());"), 'GL은 준비됐을 때만');
  assert.ok(rt.includes('glbMarkHidden(isGl, [ocean, land, krBase, relief]);'));
  assert.ok(rt.includes('if (isSat || isMbx || isGl) {'));
  assert.ok(rt.includes("bmb.classList.toggle('sat', isSat || isMbx || isGl);"));
  assert.ok(rt.includes('scheduleMapboxTiles();   // 타일 그룹 표시/갱신(모드 아니면 숨김 처리)\n  glbSync();'));
  // 격자: 가벼운 지도는 파란 지도처럼 gridShow(기본 켬). 위성 둘만 gridShowSat(기본 끔) — 4c3ea7a 규칙 그대로
  assert.equal(pick('typhoonGridIsSat'), "function typhoonGridIsSat(T) { const bm = (T && T.basemap) || 'blue'; return bm === 'satellite' || bm === 'satdark'; }");
  // 추출: 복제본에 GL 표시가 있을 때만 넣는다(다른 모드는 기다림·await 없이 예전과 같은 순서)
  const s2i = pick('svgToImage');
  assert.ok(s2i.includes("if (clone.querySelector('#bgMapT[data-glb]')) await glbInlineClone(clone, W, H, viewBox, fontsUsedOnly);"));
  assert.ok(s2i.includes('if (glbPending()) await glbSettle();'));
  assert.ok(s2i.indexOf('inlineMapboxTiles(clone);') < s2i.indexOf('glbInlineClone'), 'Mapbox 타일 넣기 다음');
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
  // 메뉴 배선: 옛 모드 줄 그대로, gl만 팝오버를 열어 둔 채 상태 줄
  const wb = pick('wireBasemap');
  assert.ok(wb.includes("else { pop.style.display = 'none'; status({ satellite: '밝은 위성지도', satdark: '어두운 위성지도' }[b.dataset.bm] || '파란 지도', true); }"));
  assert.ok(wb.includes("else if (b.dataset.bm === 'gl') { glbPicked(); syncOpts(); }"));
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

test('실제 앱: 가벼운 지도 고르기·준비·정렬(화면 끌기·휠·재생 프레임)·추출(평면·틸트·AE 영역)·저장·대체(오프라인·타일 실패·노말 VF)·다른 4모드',
  { skip: process.env.WCG_BOOT_CHECK !== '1' && 'WCG_BOOT_CHECK=1 일 때만(일렉트론·인터넷 필요)' }, () => {
    let raw;
    try {
      raw = execFileSync(process.execPath, [path.join(root, 'desktop', 'test', 'boot-check.cjs'), root, '--wait=7000', '--size=1600x900', '--keepalive', '--eval=' + path.join(__dirname, 'gl-basemap.boot-eval.js')], { encoding: 'utf8', timeout: 600000, maxBuffer: 1 << 26 });
    } catch (e) { raw = e.stdout; }
    const j = JSON.parse(raw);
    assert.equal(j.ok, true, JSON.stringify(j.errors));
    const o = j.evalResult;
    assert.ok(o && !o.error, o && o.error);
    // 다른 4모드: GL 흔적 없음
    for (const [bm, r] of Object.entries(o.old)) assert.deepEqual(r, { glMap: 'none', marks: 0, img: 0 }, bm);
    // 대체(인터넷 없이도 도는 부분)
    assert.equal(o.offline.state, 'fail'); assert.equal(o.offline.why, 'offline');
    assert.ok(o.offline.blue && o.offline.glHidden && o.offline.retryBtn, JSON.stringify(o.offline));
    assert.match(o.offline.ui, /인터넷/); assert.match(o.offline.status, /파란 지도/);
    if (!o.net) { console.log('# 인터넷 없음 — GL 그리기 검사 건너뜀: ' + JSON.stringify(o.netWhy)); return; }
    assert.equal(o.pick.popOpen, true, '고르면 팝오버를 열어 둔 채 상태 줄');
    assert.equal(o.ready.state, 'ready');
    assert.ok(o.ready.ms < 25000, 'ready ' + o.ready.ms);
    assert.ok(o.ready.hidden.every((h) => /:none:1$/.test(h)), '파란 바다·육지·남한 바탕·지형 숨김 + 표시 ' + o.ready.hidden);
    assert.equal(o.ready.dataGlb, '1');
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
