// AE로 보내기 'GEOlayers 지도로'(js/ae-geo.js + desktop/wns/geo-jsx.js) 시험 — 실제 AE·GEOlayers는 띄우지 않는다.
//  1) 투영 왕복: 앱 화면 출력 px ↔ 위경도 ↔ GEOlayers 보기에서 같은 점이 같은 컴프 px.
//     GEOlayers 식은 설치판(1.17.0) 표현식 파일에서 옮겨 이 파일에 따로 쓴다(앱 코드를 그대로 베끼지 않게):
//     expressions/mapPivotScale.jsx(배율 100·2^Zoom/2^18·512 %), mapPivotAnchorPoint.jsx·distance_circle.jsx(세계 px 2^18 메르카토르),
//     mapPivotOrientation.jsx(방향 Z = Bearing).
//  2) zoom 정의(512 타일 — 가벼운 지도 glbView와 같은 값)·반경 원/사다리꼴 다각형 = 앱 typhoonBandInto·보기 키/프레임 = 앱 camAt
//  3) 실제 sendToAE(vm, tests/tl-plan-ctx.cjs aeCtx)가 만드는 GEOlayers 길 스펙(리깅 카메라 항등·겹 PNG·남한 강조·GeoJSON·토큰 없음)
//  4) 그 스펙 → geo-jsx → AE 흉내(desktop/test/ae-model.cjs opt.geo) + 가짜 GEOlayers(앵커 = 세계 px, 위 표현식 식):
//     프레임마다 태풍 지점(리깅 TP 널) = 앱 화면 자리, AE에서 보기 키를 고쳐도 지도를 따라감, 앵커를 못 찾아도(컨트롤 식) 같음, 알림 갈래
//  5) 보내는 방식 팝업 카드·흐림 까닭·aeSendClick 갈래·버튼 배선
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { aeCtx, fnSrc, constSrc, html, MAP_PROJ } = require('./tl-plan-ctx.cjs');
const GJ = require('../desktop/wns/geo-jsx.js');
const { buildAeJsx } = require('../desktop/wns/ae-jsx.js');
const { mkModel } = require('../desktop/test/ae-model.cjs');

const FPS = 29.97;
const GEO_CONSTS = ['GEO_MAP_SIZE', 'GEO_TILE', 'GEO_MAX_FRAMES', 'GEO_CIRCLE_N', 'AE_MODE_KEY', 'geoMerc', 'geoLatOf', 'geoRound', 'geoUV2LL', 'geoFC', 'geoLine', 'geoViewOut', 'GEO_BASE_IDS'];
const GEO_FNS = ['geoWorldXY', 'geoViewOf', 'geoAppXY', 'geoCompXY', 'geoRingCCW', 'geoCircleRing', 'geoBandPolys', 'geoViewPlan', 'geoTyphoonSingle', 'geoTyphoonCompare',
  'aeGeoSpec', 'aeGeoCamSpec', 'aeGeoCaps', 'aeGeoWhyNot', 'aeModeCards', 'aeSendClick'];
const geoSrc = () => GEO_CONSTS.map(constSrc).join('\n') + '\n' + GEO_FNS.map(fnSrc).join('\n');

// ── GEOlayers 식(설치판 표현식에서 옮김 — 시험의 '정답') ──
const GM = 262144;
const LonToPixelX = (lon) => ((lon + 180) / 360) * GM;
const LatToPixelY = (lat) => { lat = Math.min(85.05112878, Math.max(-85.05112878, lat)); const s = Math.sin((lat * Math.PI) / 180); return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * GM; };
const pivotK = (z) => (Math.pow(2, Math.max(0, Math.min(23, z))) / GM) * 512;   // mapPivotScale(%)/100 = 맵 컴프 px / 세계 px
function geoComp(lon, lat, v, W, H) {   // 맵 컴프가 담는 컴프(W×H)에 1:1·가운데일 때 그 경위도의 컴프 px
  const k = pivotK(v.zoom), dx = (LonToPixelX(lon) - LonToPixelX(v.longitude)) * k, dy = (LatToPixelY(lat) - LatToPixelY(v.latitude)) * k;
  const b = ((v.bearing || 0) * Math.PI) / 180;
  return [W / 2 + dx * Math.cos(b) - dy * Math.sin(b), H / 2 + dx * Math.sin(b) + dy * Math.cos(b)];
}

// ── 앱 쪽 순수 함수 컨텍스트(실제 소스) ──
function mathCtx(S) {
  const ctx = { S: S || { map: { x: 0, y: 0, s: 1 } }, Math, Object, Array, Number, isFinite, MAP: { proj: MAP_PROJ }, typhoonProg: null, camKeys: () => [],
    _te: (tag, attr) => ({ tag, attr, kids: [], appendChild(c) { this.kids.push(c); } }) };
  vm.createContext(ctx);
  vm.runInContext(['TYPHOON_R_EARTH', 'typhoonKmToUnit', 'lerp', 'EASE_BEZIER', 'easeCam', 'clamp01'].map(constSrc).join('\n') + '\n'
    + ['cubicBezier', 'projLL', 'typhoonXY', 'typhoonScreenPts', 'typhoonBandInto', 'camAt', 'glbView'].map(fnSrc).join('\n') + '\n' + geoSrc(), ctx);
  return ctx;
}
// 시드 고정 난수(재현 가능)
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const hyp = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

test('투영 왕복: 앱 화면 출력 px = GEOlayers 보기(설치판 표현식 식)의 컴프 px — 무작위 3000점·회전·터치 배율', () => {
  const C = mathCtx(), r = rng(7);
  let n = 0;
  for (let i = 0; n < 3000; i++) {
    const k = i % 3 === 0 ? 2158 / 1920 : 1, W = 1920 * k, H = 1080 * k;
    const cam = { x: -2500 + r() * 6000, y: -2500 + r() * 6000, s: 0.08 + r() * 3, rz: i % 2 ? -180 + r() * 360 : 0 };
    const lon = 100 + r() * 60, lat = r() * 50;
    const gv = C.geoViewOf(cam, MAP_PROJ, k);
    if (Math.abs(gv.latitude) > 85 || gv.zoom < 0) continue;   // GEOlayers가 위도 ±85.05°·zoom 0 아래를 자르는 보기(화면 가운데가 지도 밖) — 비교에서 뺀다
    n++;
    const app = C.geoAppXY(lon, lat, cam, MAP_PROJ, k, W, H);
    // 앱 실제 projLL로도 한 번 더(geoAppXY가 projLL과 같은 식인지)
    const [lx, ly] = C.projLL(lon, lat), sx = (cam.x + lx * cam.s) * k - W / 2, sy = (cam.y + ly * cam.s) * k - H / 2, rr = (cam.rz * Math.PI) / 180;
    const app2 = [W / 2 + sx * Math.cos(rr) - sy * Math.sin(rr), H / 2 + sx * Math.sin(rr) + sy * Math.cos(rr)];
    const geo = geoComp(lon, lat, gv, W, H);
    assert.ok(hyp(app, geo) < 1e-6 * Math.max(1, Math.hypot(app[0] - W / 2, app[1] - H / 2) / 100), `점 ${i}: 앱 ${app} ≠ GEOlayers ${geo}`);
    assert.ok(hyp(app, app2) < 1e-6, '앱 projLL과 같은 식');
    // 앱 쪽 GEOlayers 모형(geoCompXY)도 같은 값
    assert.ok(hyp(C.geoCompXY(lon, lat, gv, W, H), geo) < 1e-6 * Math.max(1, Math.hypot(geo[0] - W / 2, geo[1] - H / 2) / 100));
  }
});

test('zoom 정의 — 512 타일 기준(가벼운 지도 glbView·MapLibre와 같은 값), 1920px 폭 = 경도 1350/2^z 도, Bearing = rz', () => {
  const C = mathCtx(), r = rng(11);
  for (let i = 0; i < 200; i++) {
    const k = i % 2 ? 2158 / 1920 : 1, cam = { x: r() * 2000, y: r() * 1500, s: 0.1 + r() * 2, rz: 0 };
    const gv = C.geoViewOf(cam, MAP_PROJ, k), gl = C.glbView(cam, MAP_PROJ, k, 0, 0, 1920 * k, 1080 * k);
    assert.ok(Math.abs(gv.zoom - gl.zoom) < 1e-9 && Math.abs(gv.longitude - gl.lng) < 1e-9 && Math.abs(gv.latitude - gl.lat) < 1e-9, 'glbView와 같은 보기');
    if (k === 1) {   // 화면 왼쪽 끝·오른쪽 끝의 경도 차 = 1920 / (512·2^z) · 360 = 1350 / 2^z
      const lonAt = (x) => (((x - cam.x) / cam.s / MAP_PROJ.scale + MAP_PROJ.cx0) * 180) / Math.PI;
      assert.ok(Math.abs((lonAt(1920) - lonAt(0)) - 1350 / Math.pow(2, gv.zoom)) < 1e-9);
    }
  }
  assert.equal(C.geoViewOf({ x: 0, y: 0, s: 1, rz: 37.5 }, MAP_PROJ, 1).bearing, 37.5);
  assert.equal(C.geoViewOf({ x: 0, y: 0, s: 1, rz: 37.5 }, MAP_PROJ, 1).pitch, 0);
});

test('반경 원 다각형 — 다시 투영하면 앱 원(typhoonKmToUnit·S.map.s)과 꼭짓점이 겹친다, 닫힘·반시계', () => {
  const C = mathCtx({ map: { x: 860, y: 377, s: 0.307 } }), r = rng(3);
  for (let i = 0; i < 300; i++) {
    const lon = 110 + r() * 40, lat = 5 + r() * 40, km = 30 + r() * 500;
    const ring = C.geoCircleRing(lon, lat, km);
    assert.equal(ring.length, 129);
    assert.deepEqual(ring[0], ring[128]);
    let a = 0; for (let j = 0; j + 1 < ring.length; j++) a += ring[j][0] * ring[j + 1][1] - ring[j + 1][0] * ring[j][1];
    assert.ok(a > 0, '반시계');
    const c = C.typhoonXY(lon, lat), R = C.typhoonKmToUnit(km, lat) * C.S.map.s;
    for (const [lo, la] of ring) { const p = C.typhoonXY(lo, la); assert.ok(Math.abs(hyp(p, c) - R) < 0.002 + R * 1e-6, `반지름 ${hyp(p, c)} ≠ ${R}`); }
  }
});

test('반경 띠 다각형 = 앱 typhoonBandInto(원 + 사다리꼴) — 꼭짓점 0.01px 안', () => {
  const S = { map: { x: 1160, y: 545, s: 1.02 }, typhoon: { r15Buf: 0 } };
  const C = mathCtx(S);
  const pts = [[130.4, 18.7, 160], [129.6, 20.4, 180], [128.9, 22.3, 0], [128.4, 24.6, 230], [128.3, 27.4, 250]].map(([lon, lat, r70]) => ({ lon, lat, r70 }));
  const sp = C.typhoonScreenPts(pts);
  const parent = C._te('g', {});
  C.typhoonBandInto(parent, sp, 'r70', { fill: '#F00', fillOp: 0.2, strokeW: 0 });
  const fg = parent.kids[0];
  const traps = fg.kids.filter((n) => n.tag === 'path').map((n) => n.attr.d.replace(/[MZ]/g, '').split('L').map((q) => q.trim().split(/\s+/).map(Number)));
  const circles = fg.kids.filter((n) => n.tag === 'circle');
  const polys = C.geoBandPolys(pts.map((p) => ({ lon: p.lon, lat: p.lat, r: p.r70 })));
  assert.equal(polys.length, traps.length + circles.length);
  for (let i = 0; i < traps.length; i++) {
    const g = polys[i][0].slice(0, 4).map(([lo, la]) => C.typhoonXY(lo, la));
    for (const q of traps[i]) assert.ok(g.some((p) => hyp(p, q) < 0.01), `사다리꼴 ${i} 꼭짓점 ${q}`);
  }
  for (let i = 0; i < circles.length; i++) {
    const ring = polys[traps.length + i][0], cc = [+circles[i].attr.cx, +circles[i].attr.cy], R = +circles[i].attr.r;
    for (const [lo, la] of ring) assert.ok(Math.abs(hyp(C.typhoonXY(lo, la), cc) - R) < 0.01);
  }
});

test('보기 키·프레임 = 앱 camAt(키 사이 같은 e로 위치·배율 보간) — 시각·자릿수·기울기 표시', () => {
  const keys = [{ t: 0.5, x: 860, y: 377, s: 0.307, rz: 0 }, { t: 2.5, x: 300, y: -400, s: 0.9, rz: 30 }, { t: 4, x: 200, y: -500, s: 1.1, rz: 30, rx: 20 }];
  const S = { map: { x: 860, y: 377, s: 0.307 }, anim: { cam: { keys } } };
  const C = mathCtx(S); C.camKeys = () => keys;
  const plan = C.geoViewPlan(MAP_PROJ, 1, FPS);
  assert.equal(plan.keys.length, 3);
  assert.equal(plan.tilt, true);
  const rows = plan.frames.rows;
  assert.equal(rows[0][0], 0.5); assert.equal(rows[rows.length - 1][0], 4);
  // 줄 = 맨 앞·맨 끝 키 시각 + 그 사이 AE 프레임 격자(n/fps) — AE가 값을 읽는 시각에 바로 키가 있게
  const n0 = Math.ceil(0.5 * FPS), n1 = Math.floor(4 * FPS);
  assert.equal(rows.length, n1 - n0 + 1 + 2);
  for (const row of rows.slice(1, -1)) { const n = row[0] * FPS; assert.ok(Math.abs(n - Math.round(n)) < 1e-4, '프레임 격자 ' + row[0]); }
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i][0] > rows[i - 1][0]);
  // 줄이 GEO_MAX_FRAMES를 넘으면 간격 = 프레임의 정수배(여전히 격자 위), 끝 키 포함
  C.camKeys = () => [{ t: 0, x: 860, y: 377, s: 0.3, rz: 0 }, { t: 200.3, x: 300, y: -400, s: 0.9, rz: 0 }];
  const long = C.geoViewPlan(MAP_PROJ, 1, 30).frames.rows;
  assert.ok(long.length <= vm.runInContext('GEO_MAX_FRAMES', C), long.length);
  assert.equal(long[long.length - 1][0], 200.3);
  const st = Math.round((long[2][0] - long[1][0]) * 30);
  assert.ok(st >= 2 && long.slice(1, -1).every((r) => Math.abs(r[0] * 30 - Math.round(r[0] * 30)) < 1e-4));
  C.camKeys = () => keys;
  for (const row of rows) {
    const v = C.geoViewOf(C.camAt(row[0]), MAP_PROJ, 1);
    assert.ok(Math.abs(row[1] - v.latitude) < 1e-7 && Math.abs(row[2] - v.longitude) < 1e-7 && Math.abs(row[3] - v.zoom) < 1e-6 && Math.abs(row[4] - v.bearing) < 1e-4);
  }
  // 키 하나 = 그 키의 보기 하나(재생 때 화면이 그 키에 서 있다), 키 없음 = 작업 뷰
  C.camKeys = () => [keys[1]];
  const one = C.geoViewPlan(MAP_PROJ, 1, FPS);
  assert.equal(one.frames, null);
  assert.ok(Math.abs(one.work.zoom - C.geoViewOf(keys[1], MAP_PROJ, 1).zoom) < 1e-6);
  C.camKeys = () => [];
  assert.ok(Math.abs(C.geoViewPlan(MAP_PROJ, 1, FPS).work.longitude - C.geoViewOf(S.map, MAP_PROJ, 1).longitude) < 1e-7);
});

// ── 실제 sendToAE(vm) — GEOlayers 길 ──
const REAL14 = [[133.0, 15.0, 0, 0, 0], [132.6, 15.6, 0, 0, 0], [132.1, 16.3, 0, 0, 0], [131.6, 17.0, 0, 0, 0], [131.0, 17.8, 0, 0, 0], [130.4, 18.7, 0, 160, 0], [129.6, 20.4, 1, 180, 60],
  [128.9, 22.3, 1, 200, 70], [128.4, 24.6, 1, 230, 0], [128.3, 27.4, 1, 250, 90], [128.9, 30.6, 1, 260, 80], [130.4, 34.5, 1, 240, 70], [132.8, 38.6, 1, 200, 0], [136.0, 42.0, 1, 150, 0]];
function tyS(o) {
  o = o || {};
  const pts = REAL14.map(([lon, lat, fc, r70, r25], i) => ({ lon, lat, fcst: !!fc, r70, r15: r70 ? r70 * 0.7 : 0, r25, ws: 25 + i, ex: i === 13, label: i + '일' }));
  return { style: o.style || 'typhoon', res: o.res || '1920x1080', map: { x: 1160, y: 545, s: 1.02 }, labels: [], texts: [], legend: { on: 0 },
    typhoon: { iconCol: '#E5231E', issues: [{ points: pts }], labels: [{ id: 'b1', idx: 7, txt: '7일', x: 1300, y: 260, size: 40 }], nowIdx: 5, trackMode: 'full', iconMode: 'image', places: [],
      compare: o.compare || [], bands: { r70: { strokeW: 2 }, r15: { strokeW: 2 }, r25: { strokeW: 0 } }, r15Buf: 20 },
    anim: { dur: 6, fps: FPS, reveal: 'dissolve', tracks: [{ id: 'k1', kind: 'typhoon', key: 'typhoon', start: 1, len: 3.5, ps: 1, pe: 3, lab: { b1: { s: 2.0, e: 3.0 } } }],
      cam: { keys: o.cam || [{ t: 0.5, x: 1160, y: 545, s: 1.02, rz: 0 }, { t: 3.5, x: 700, y: 900, s: 1.6, rz: 12 }] } } };
}
function geoCtx(S, opt) {
  const r = aeCtx(S, Object.assign({ real: true }, opt || {}));
  const { ctx } = r;
  Object.assign(ctx, { bandName: (k) => k, aeGeoOverlayBlob: async () => 'geo-overlay', aeGeoKrBlob: async () => (opt && opt.noKr ? null : 'geo-kr') });
  vm.runInContext(['easeCam'].map(constSrc).join('\n') + '\n' + ['cubicBezier', 'camAt'].map(fnSrc).join('\n') + '\n' + geoSrc(), ctx);
  r.sendGeo = async () => { const n = r.caps.ae.length; await ctx.sendToAE({ aeMode: 'geolayers' }); return r.caps.ae[n] || null; };
  return r;
}

test('sendToAE GEOlayers 길: mode·geo 명세, 리깅 카메라 = 항등 위치·배율 키(앱 키 시각·회전), 바탕 = 지도 겹 PNG, 남한 강조 PNG, GeoJSON, 토큰 없음', async () => {
  const S = tyS();
  const { caps, sendGeo, send } = geoCtx(S);
  const spec = await sendGeo();
  assert.ok(spec, '스펙 없음 ' + caps.status.join(' / '));
  assert.equal(spec.mode, 'geolayers');
  const g = spec.geo, rig = spec.layers.find((l) => l.typhoonRig).typhoonRig;
  assert.equal(g.v, 1);
  // 리깅 카메라: 위치·배율은 모두 작업 뷰(항등) — 위치 = 앵커, 배율 = sBaked, 시각 = 앱 카메라 키, 회전 = 앱 키 rz(헬퍼가 ROT 널로 라벨 박스를 돌린다)
  assert.deepEqual(rig.camera.keys.map((k) => k.t), [0.5, 3.5]);
  for (const k of rig.camera.keys) { assert.equal(k.x, rig.camera.anchor[0]); assert.equal(k.y, rig.camera.anchor[1]); assert.equal(k.s, rig.camera.sBaked); }
  assert.deepEqual(rig.camera.keys.map((k) => k.rz), [0, 12]);
  assert.deepEqual(rig.camera.pivot, [960, 540]);
  assert.deepEqual(rig.camera.anchor, [1160, 545]);
  // 업로드: 바탕 = 지도 겹(바다·위성 없이), 남한 강조 따로
  const fi = (f) => +f.slice(2, 7);
  assert.equal(caps.frames[fi(rig.bg)], 'geo-overlay');
  assert.equal(caps.frames[fi(g.overlays.kr.file)], 'geo-kr');
  assert.equal(g.overlays.kr.blend, 'screen');
  // 보기: 작업 뷰·키 2개·프레임마다(0.5~3.5초)
  assert.equal(g.view.keys.length, 2);
  assert.equal(g.view.frames.rows[0][0], 0.5);
  assert.equal(g.view.frames.rows[g.view.frames.rows.length - 1][0], 3.5);
  // 묶기 상수: 투영 원점의 세계 px, 작업 뷰 출력 px/라디안
  assert.ok(Math.abs(g.bind.sigma0 - MAP_PROJ.scale * 1.02) < 1e-6);
  const lon0 = (MAP_PROJ.cx0 * 180) / Math.PI, lat0 = ((2 * Math.atan(Math.exp(MAP_PROJ.cy0)) - Math.PI / 2) * 180) / Math.PI;
  assert.ok(Math.abs(g.bind.origin[0] - LonToPixelX(lon0)) < 1e-5 && Math.abs(g.bind.origin[1] - LatToPixelY(lat0)) < 1e-5);
  // 태풍 GeoJSON — 반경 3종(현재 이후만, r15 여유 20km), 지난·예상 선, 지점 14
  const fc = g.typhoon.geojson;
  assert.deepEqual(Object.keys(fc).sort(), ['fcst', 'past', 'points', 'r15', 'r25', 'r70']);
  assert.equal(fc.points.features.length, 14);
  assert.equal(fc.past.features[0].geometry.coordinates.length, 6);    // 0..5(현재)
  assert.equal(fc.fcst.features[0].geometry.coordinates.length, 9);    // 5..13
  const nR70 = REAL14.filter((p, i) => i >= 5 && p[3] > 0).length;
  assert.equal(fc.r70.features[0].geometry.coordinates.length, nR70 + (nR70 - 1));   // 원 + 사다리꼴
  const r15ring = fc.r15.features[0].geometry.coordinates[nR70 - 1][0];   // 첫 원(현재 지점) — 반지름 = (160·0.7 + 20)km
  const C = mathCtx({ map: S.map }), c0 = C.typhoonXY(130.4, 18.7), R0 = C.typhoonKmToUnit(160 * 0.7 + 20, 18.7) * 1.02;
  assert.ok(Math.abs(hyp(C.typhoonXY(r15ring[3][0], r15ring[3][1]), c0) - R0) < 0.01);
  assert.deepEqual(g.draw.map((d) => d.key), ['r70', 'r15', 'r25', 'past', 'fcst']);
  assert.equal(g.draw.find((d) => d.key === 'fcst').dash, 1);
  // 토큰·개인 주소 없음
  const txt = JSON.stringify(spec);
  assert.ok(!/pk\.[A-Za-z0-9]|access_token|api\.mapbox|apiKey/i.test(txt), '토큰·지도 주소가 스펙에 없다');
  // 지금 방식(인자 없음)은 mode·geo 없음, 카메라 = 앱 키 그대로
  const old = await send();
  assert.equal(old.mode, undefined); assert.equal(old.geo, undefined);
  const orig = old.layers.find((l) => l.typhoonRig).typhoonRig;
  assert.notEqual(orig.camera.keys[1].x, orig.camera.anchor[0]);
  assert.equal(caps.frames[fi(orig.bg)], 'svg');
});

test('sendToAE GEOlayers 길: 비교 지도도(예보선마다 선 GeoJSON), 노말 VF·일반 지도는 막고 안내', async () => {
  const S = tyS({ style: 'typhoonCompare', compare: [{ id: 'c1', name: 'JMA', color: '#FFC53D', show: 1, points: REAL14.slice(4, 12).map(([lon, lat]) => ({ lon, lat })) }, { id: 'c2', name: 'off', color: '#31C48D', show: 0, points: [] }] });
  const { sendGeo } = geoCtx(S);
  const spec = await sendGeo();
  assert.equal(spec.mode, 'geolayers');
  assert.equal(spec.geo.typhoon.kind, 'compare');
  assert.deepEqual(Object.keys(spec.geo.typhoon.geojson), ['c0']);
  assert.equal(spec.geo.draw[0].col, '#FFC53D');
  const crig = spec.layers.find((l) => l.compareRig).compareRig;
  assert.deepEqual(crig.camera.keys.map((k) => [k.x, k.y, k.s, k.rz]), [[1160, 545, 1.02, 0], [1160, 545, 1.02, 12]]);
  for (const res of ['1920x1080-vf']) {
    const r = geoCtx(tyS({ res }));
    assert.equal(await r.sendGeo(), null);
    assert.match(r.caps.status.join(' '), /태풍 지도\(노말 VF 제외\)에서만/);
  }
  const r2 = geoCtx(Object.assign(tyS(), { style: 'sgg' }));
  assert.equal(await r2.sendGeo(), null);
});

// ── 가짜 GEOlayers(AE 흉내 위) — 앵커 레이어 = 설치판 anchor*·mapPivot* 표현식과 같은 식 ──
function mkGeo(M, o) {
  o = o || {};
  const P = M.proj, temps = [];
  const fxSet = (L, v) => { const fx = L.property('ADBE Effect Parade'); for (const k of Object.keys(v)) fx.property(k).property(1).setValue(v[k]); };
  const addTemplate = (name, w, h, view, anchorName, mcIn, dur) => {
    const mc = mcIn || P.items.addComp(name, w, h, 1, dur || 30, FPS);
    const C = P.items.addComp(name + ' (담는 컴프)', w, h, 1, dur || 30, FPS);
    const L = C.layers.add(mc); L.name = mc.name;
    const fx = L.property('ADBE Effect Parade');
    for (const [nm, mt] of [['Latitude', 'ADBE Angle Control'], ['Longitude', 'ADBE Angle Control'], ['Zoom', 'ADBE Slider Control'], ['Bearing', 'ADBE Angle Control'], ['Pitch', 'ADBE Angle Control']]) { const e = fx.addProperty(mt); e.name = nm; }
    fxSet(L, view || { Latitude: 36, Longitude: 127.5, Zoom: 5, Bearing: 0, Pitch: 0 });
    const A = C.layers.addNull(); A.name = anchorName || name + ' Anchor'; A.setParentWithJump(L);
    const ctl = (nm) => `thisComp.layer(${JSON.stringify(mc.name)}).effect("${nm}")(1)`;
    A.tf.anchor.expression = `var la=+${ctl('Latitude')},lo=+${ctl('Longitude')},M=262144;la=Math.max(-85.05112878,Math.min(85.05112878,la));var s=Math.sin(la*Math.PI/180);[(lo+180)/360*M,(0.5-Math.log((1+s)/(1-s))/(4*Math.PI))*M]`;
    A.tf.position.expression = `[${w / 2},${h / 2}]`;
    A.tf.scale.expression = `var z=Math.max(0,Math.min(23,+${ctl('Zoom')}));var k=100*Math.pow(2,z)/262144*512;[k,k]`;
    A.tf.rotation.expression = `+${ctl('Bearing')}`;
    const t = { mc, C, L, A }; temps.push(t); return t;
  };
  const pairOf = (c) => temps.find((t) => t.C === c || t.mc === c || t.mc.name === c);
  const api = {
    calls: [],
    getMapcomps: () => temps.map((t) => t.mc),
    getMapcompAnchor: (c) => { const t = pairOf(c); return o.noAnchorApi || !t ? undefined : t.A; },
    // o.dupShared = 담는 컴프만 새로 만들고 맵 컴프는 원본을 같이 씀(쓸 수 없는 복제 — 지우고 멈춰야 한다)
    duplicate: (c, opt) => {
      api.calls.push(['duplicate', opt, c && c.name]);
      const t = pairOf(c); if (!t || o.noDup) return undefined;
      const v = {}; for (const k of ['Latitude', 'Longitude', 'Zoom', 'Bearing', 'Pitch']) v[k] = t.L.property('ADBE Effect Parade').property(k).property(1).value;
      const n = addTemplate((opt && (opt.newContainingCompName || opt.newName)) + ' 맵', t.mc.width, t.mc.height, v, o.anchorName, o.dupShared ? t.mc : null, t.mc.duration);
      n.C.name = (opt && opt.newContainingCompName) || n.C.name;
      return n.C;
    },
    removeMapcompControlKeys: (c) => { api.calls.push(['removeKeys']); const t = pairOf(c); for (const k of ['Latitude', 'Longitude', 'Zoom', 'Bearing', 'Pitch']) t.L.property('ADBE Effect Parade').property(k).property(1).keys = []; },
    // o.zoomMax = 이미지 범위(설치판 clipZoom처럼 Zoom을 자르고 적용한 보기를 돌려준다)
    setViewAtTime: (c, v, force, tm) => {
      api.calls.push(['setViewAtTime', v, force, tm]); const t = pairOf(c);
      const z = o.zoomMax != null ? Math.min(o.zoomMax, v.zoom) : v.zoom;
      fxSet(t.L, { Latitude: v.latitude, Longitude: v.longitude, Zoom: z, Bearing: v.bearing, Pitch: v.pitch });
      return { latitude: v.latitude, longitude: v.longitude, zoom: z, bearing: v.bearing, pitch: v.pitch };
    },
    draw: (c, file, cb, opt) => { api.calls.push(['draw', file.path, opt]); const t = temps.find((x) => x.C === c); const sl = t.C.layers.addShape(); sl.name = 'drawn'; cb(null, {}); },
    finalize: (comps, cb, opt) => { api.calls.push(['finalize', comps.map((x) => x.name), opt]); cb(null, comps); },
  };
  return { api, addTemplate, temps, o };
}
test('끝까지: 스펙 → geo-jsx → AE 흉내 + 가짜 GEOlayers — 프레임마다 태풍 지점(TP 널) = 앱 화면 자리(0.5px 안)', async () => {
  const S = tyS();
  const r = geoCtx(S);
  const spec = await r.sendGeo();
  const jsx = GJ.buildGeoJsx(JSON.parse(JSON.stringify(spec)), 'C:\\WCG\\frames\\geo');
  const M = mkModel({ geo: true });
  const G = mkGeo(M);
  G.addTemplate('Map 1', 1920, 1080);
  M.g.geolayers3 = G.api;   // 가짜 GEOlayers API를 jsx 전역에
  M.run(jsx);
  assert.deepEqual(M.errors, [], 'AE 흉내 오류 없음');
  const main = M.comps.find((c) => c.name === spec.comp.name);
  assert.ok(main, '우리 컴프');
  // 맨 아래 = 복제한 담는 컴프(GEO_MAP), 원본 템플릿은 그대로
  assert.equal(main.list[main.list.length - 1].name, 'GEO_MAP');
  const C2 = main.list[main.list.length - 1].source;
  assert.notEqual(C2, G.temps[0].C);
  assert.match(C2.comment, /^WeatherCG-GEO/);
  assert.equal(G.temps[0].L.property('ADBE Effect Parade').property('Zoom').property(1).keys.length, 0, '원본 맵 컴프에는 키를 안 넣는다');
  // 보기 키 = 프레임마다(위도·경도·Zoom·Bearing)
  const L2 = C2.list.find((l) => l.source && l.source.list && l.name.endsWith('맵'));
  const nK = spec.geo.view.frames.rows.length;
  for (const k of ['Latitude', 'Longitude', 'Zoom', 'Bearing']) assert.equal(L2.property('ADBE Effect Parade').property(k).property(1).keys.length, nK, k);
  // 남한 강조: 지도 겹과 같은 부모(CAM)·스크린
  const kr = main.list.find((l) => l.name === '남한 강조');
  assert.ok(kr && kr.blendingMode === 'SCREEN' && kr.parent && kr.parent.name === 'CAM');
  assert.equal(kr.source.name, spec.geo.overlays.kr.file);
  // 겹 순서 = 앱(bgMapT: 남한 강조 → 시도선·지명): 지도 겹 바로 아래, GEOlayers 지도(GEO_MAP)보다 위
  const ix = (nm) => main.list.findIndex((l) => l.name === nm);
  assert.equal(ix('남한 강조'), ix('지도') + 1, '남한 강조는 지도 겹 바로 아래');
  assert.ok(ix('남한 강조') < ix('GEO_MAP'));
  // 마커 = 앱 카메라 키
  assert.deepEqual(main.markerProperty.keys.map((k) => k.t), [0.5, 3.5]);
  // draw(편집용 셰이프, 꺼 둠) → finalize → 알림
  const draws = G.api.calls.filter((c) => c[0] === 'draw');
  assert.deepEqual(draws.map((c) => c[1].split('/').pop()), spec.geo.draw.map((d) => 'geo_' + d.key + '.geojson'));
  assert.ok(C2.list.filter((l) => l.name.startsWith('GEO_')).every((l) => l.enabled === false));
  assert.equal(G.api.calls.filter((c) => c[0] === 'finalize').length, 1);
  assert.match(M.alerts[M.alerts.length - 1], /GEOlayers 지도로 보냈어요/);
  assert.ok(M.files['C:/WCG/frames/geo/geo_log.txt'].includes('OK'));
  // 핵심: 프레임마다 TP 널의 화면 자리 = 앱 화면(같은 시각 camAt)의 그 경위도 자리
  const C = mathCtx({ map: S.map }); C.camKeys = () => S.anim.cam.keys;
  const pts = S.typhoon.issues[0].points;
  let worst = 0;
  for (let f = 0; f <= Math.ceil(4.2 * FPS); f += 3) {
    const t = f / FPS, cam = C.camAt(t);
    for (let i = 0; i < pts.length; i++) {
      const tp = main.list.find((l) => l.name === 'TP' + i);
      const ae = M.apply(M.worldAt(tp, t), [0, 0]), app = C.geoAppXY(pts[i].lon, pts[i].lat, cam, MAP_PROJ, 1, 1920, 1080);
      worst = Math.max(worst, hyp(ae, app));
    }
  }
  assert.ok(worst < 0.5, '최대 차 ' + worst + 'px'); if (process.env.GEO_DEBUG) console.log('worst', worst);
  // AE에서 보기를 고쳐도(Zoom +0.7, 경도 +2°) 태풍이 지도를 따라간다 — 정답 = GEOlayers 식(geoComp)
  for (const k of ['Zoom', 'Longitude']) for (const key of L2.property('ADBE Effect Parade').property(k).property(1).keys) key.v += (k === 'Zoom' ? 0.7 : 2);
  let worst2 = 0;
  for (const t of [0, 1.3, 2.2, 4]) {
    const fxv = (k) => L2.property('ADBE Effect Parade').property(k).property(1).valueAtTime(t);
    const v = { latitude: fxv('Latitude'), longitude: fxv('Longitude'), zoom: fxv('Zoom'), bearing: fxv('Bearing') };
    for (let i = 0; i < pts.length; i++) {
      const tp = main.list.find((l) => l.name === 'TP' + i);
      worst2 = Math.max(worst2, hyp(M.apply(M.worldAt(tp, t), [0, 0]), geoComp(pts[i].lon, pts[i].lat, v, 1920, 1080)));
    }
  }
  assert.ok(worst2 < 0.5, '보기를 고친 뒤 최대 차 ' + worst2 + 'px'); if (process.env.GEO_DEBUG) console.log('worst2', worst2);
});

// 스펙 → geo-jsx → AE 흉내 + 가짜 GEOlayers(맵 컴프 1920×1080 하나) 한 번
async function geoRun(S, o) {
  o = o || {};
  const r = geoCtx(S);
  const spec = await r.sendGeo();
  if (o.edit) o.edit(spec);
  const M = mkModel({ geo: true });
  const G = mkGeo(M, o);
  G.addTemplate('Map 1', 1920, 1080, null, null, null, o.dur);
  if (o.setup) o.setup(M, G);
  M.g.geolayers3 = G.api;
  M.run(GJ.buildGeoJsx(JSON.parse(JSON.stringify(spec)), 'C:\\WCG\\frames\\gr', o.gopt));
  const main = M.comps.find((c) => c.name === spec.comp.name);
  return { r, spec, M, G, main };
}
// 라벨 박스 가운데(AE) — 라벨N 레이어의 위치 + (박스 가운데 [500,180] − 기준점) = 회전한 박스 가운데(박스 자체는 똑바로 — 앱도 같다)
const boxCenter = (M, l, t) => { const p = l.tf.position.valueAtTime(t), a = l.tf.anchor.valueAtTime(t); return [p[0] + 500 - a[0], p[1] + 180 - a[1]]; };
// 앱 라벨 박스 가운데 = camProjectXY(b.x, b.y)(기울기 0이면 뷰박스 가운데(960,540) 기준 rz 회전) × 출력 배율
function appBox(b, rz, W, H) {
  const r = (rz * Math.PI) / 180, X = b.x - 960, Y = b.y - 540;
  return [(960 + X * Math.cos(r) - Y * Math.sin(r)) * (W / 1920), (540 + X * Math.sin(r) + Y * Math.cos(r)) * (H / 1080)];
}
test('끝까지: 앱 카메라에 회전(rz)이 있으면 라벨 박스·지시선도 GEOlayers 보기를 따라 화면 가운데 기준으로 돈다(ROT 널) — 이동+회전 45°·회전만 30°·터치 12°', async () => {
  const cases = [
    { nm: '이동+회전 0→45°', res: '1920x1080', cam: [{ t: 0.5, x: 1160, y: 545, s: 1.02, rz: 0 }, { t: 3.5, x: 700, y: 900, s: 1.6, rz: 45 }] },
    { nm: '회전만 0→30°', res: '1920x1080', cam: [{ t: 0.5, x: 1160, y: 545, s: 1.02, rz: 0 }, { t: 3, x: 1160, y: 545, s: 1.02, rz: 30 }] },
    { nm: '터치 0→12°', res: '2158x1214' },
  ];
  for (const cs of cases) {
    const S = tyS({ res: cs.res, cam: cs.cam });
    const { M, main, spec } = await geoRun(S);
    assert.deepEqual(M.errors, [], cs.nm);
    const [W, H] = cs.res === '2158x1214' ? [2158, 1214] : [1920, 1080], k = (W / 1920 + H / 1080) / 2;
    const ROT = main.list.find((l) => l.name === 'ROT'), CAM = main.list.find((l) => l.name === 'CAM');
    assert.ok(ROT, cs.nm + ': ROT 널');
    assert.equal(CAM.parent, null, 'CAM은 ROT에서 뗀다(방향은 표현식이 GEOlayers에서)');
    assert.equal(ROT.tf.rotation.expression, GJ.ROT_EXPR);
    assert.ok(M.alerts[M.alerts.length - 1].includes('Bearing'), '알림에 라벨 회전');
    const C = mathCtx({ map: S.map }); C.camKeys = () => S.anim.cam.keys;
    const b = S.typhoon.labels[0], lab = main.list.find((l) => l.name === '라벨0'), led = main.list.find((l) => l.name === '지시선0');
    const shapeNode = M.nodes(led).find((n) => n.name === 'ADBE Vector Shape');
    const hw = spec.layers.find((l) => l.typhoonRig).typhoonRig.labels[0].bw / 2;
    let worst = 0, worstLead = 0, worstTp = 0;
    const pts = S.typhoon.issues[0].points;
    for (let f = 0; f <= Math.ceil(4.2 * FPS); f += 2) {
      const t = f / FPS, cam = C.camAt(t);
      const want = appBox(b, cam.rz, W, H), got = boxCenter(M, lab, t);
      worst = Math.max(worst, hyp(want, got));
      const path = shapeNode.valueAtTime(t).points, end = path[path.length - 1];   // 지시선 끝 = 박스 왼쪽·오른쪽 가장자리(같은 높이)
      worstLead = Math.max(worstLead, Math.abs(end[1] - want[1]), Math.abs(Math.abs(end[0] - want[0]) - hw));
      for (let i = 0; i < pts.length; i += 3) { const tp = main.list.find((l) => l.name === 'TP' + i); worstTp = Math.max(worstTp, hyp(M.apply(M.worldAt(tp, t), [0, 0]), C.geoAppXY(pts[i].lon, pts[i].lat, cam, MAP_PROJ, k, W, H))); }
    }
    if (process.env.GEO_DEBUG) console.log(cs.nm, 'label', worst, 'leader', worstLead, 'tp', worstTp);
    assert.ok(worst < 0.3, cs.nm + ' 라벨 박스 최대 차 ' + worst + 'px');
    assert.ok(worstLead < 0.3, cs.nm + ' 지시선 끝 최대 차 ' + worstLead + 'px');
    assert.ok(worstTp < 0.7, cs.nm + ' 태풍 지점 최대 차 ' + worstTp + 'px');
    // AE에서 Bearing을 고치면 라벨도 그만큼 돈다(태풍 지점처럼 GEOlayers 보기를 따라감)
    const L2 = main.list.find((l) => l.name === 'GEO_MAP').source.list.find((l) => l.name.endsWith('맵'));
    for (const key of L2.property('ADBE Effect Parade').property('Bearing').property(1).keys) key.v += 20;
    const t = 4, cam = C.camAt(t);
    assert.ok(hyp(appBox(b, cam.rz + 20, W, H), boxCenter(M, lab, t)) < 0.3, '보기 Bearing +20° → 라벨도 +20°');
  }
  // 회전이 없으면 ROT 널도 없다(지금처럼 라벨은 제자리)
  const S0 = tyS({ cam: [{ t: 0.5, x: 1160, y: 545, s: 1.02, rz: 0 }, { t: 3.5, x: 700, y: 900, s: 1.6, rz: 0 }] });
  const z = await geoRun(S0);
  assert.equal(z.main.list.find((l) => l.name === 'ROT'), undefined);
  assert.ok(!z.M.alerts[z.M.alerts.length - 1].includes('ROT'));
});
test('끝까지: 비교 지도도 회전이 있으면 라벨 박스가 GEOlayers 보기를 따라 돈다', async () => {
  const S = tyS({ style: 'typhoonCompare', cam: [{ t: 0.5, x: 1160, y: 545, s: 1.02, rz: 0 }, { t: 3.5, x: 900, y: 700, s: 1.3, rz: 30 }],
    compare: [{ id: 'c1', name: 'JMA', color: '#FFC53D', show: 1, points: REAL14.slice(4, 12).map(([lon, lat]) => ({ lon, lat })), labels: [] }] });
  const { M, main, spec } = await geoRun(S);
  assert.deepEqual(M.errors, []);
  const crig = spec.layers.find((l) => l.compareRig).compareRig;
  const ROT = main.list.find((l) => l.name === 'ROT'), CAM = main.list.find((l) => l.name === 'CAM');
  assert.ok(ROT && CAM.parent === null && ROT.tf.rotation.expression === GJ.ROT_EXPR);
  // 비교 라벨이 있으면 박스 가운데 = 앱 회전(없는 작업이면 회전 널 배선만 본다)
  const labs = main.list.filter((l) => /^라벨\d+_\d+$/.test(l.name));
  const C = mathCtx({ map: S.map }); C.camKeys = () => S.anim.cam.keys;
  for (const lab of labs) {
    const [ti, li] = lab.name.slice(2).split('_').map(Number), lb = crig.typhoons[ti].labels[li];
    for (const t of [0, 1.7, 2.6, 4]) assert.ok(hyp(appBox({ x: lb.bx, y: lb.by }, C.camAt(t).rz, 1920, 1080), boxCenter(M, lab, t)) < 0.3, lab.name + ' ' + t);
  }
});

test('끝까지: 앵커 레이어를 못 찾아도(컨트롤 식으로) 같은 자리, 담는 컴프 크기가 다르면 zoom 보정(터치 2158×1214 ← 1920×1080 맵 컴프)', async () => {
  for (const o of [{ anchorName: 'Something Else', noAnchorApi: true, res: '1920x1080' }, { res: '2158x1214' }]) {
    const S = tyS({ res: o.res });
    const r = geoCtx(S);
    const spec = await r.sendGeo();
    const M = mkModel({ geo: true });
    const G = mkGeo(M, o);
    G.addTemplate('Map 1', 1920, 1080, null, o.anchorName);
    M.g.geolayers3 = G.api;
    M.run(GJ.buildGeoJsx(JSON.parse(JSON.stringify(spec)), 'C:\\WCG\\frames\\g2'));
    assert.deepEqual(M.errors, []);
    const main = M.comps.find((c) => c.name === spec.comp.name);
    const [W, H] = o.res === '2158x1214' ? [2158, 1214] : [1920, 1080], k = (W / 1920 + H / 1080) / 2;
    const C = mathCtx({ map: S.map }); C.camKeys = () => S.anim.cam.keys;
    const pts = S.typhoon.issues[0].points;
    let worst = 0;
    for (const t of [0, 1, 2, 3, 3.5, 5]) {
      const cam = C.camAt(t);
      for (let i = 0; i < pts.length; i++) {
        const tp = main.list.find((l) => l.name === 'TP' + i);
        worst = Math.max(worst, hyp(M.apply(M.worldAt(tp, t), [0, 0]), C.geoAppXY(pts[i].lon, pts[i].lat, cam, MAP_PROJ, k, W, H)));
      }
    }
    assert.ok(worst < 0.7, o.res + ' 최대 차 ' + worst); if (process.env.GEO_DEBUG) console.log(o.res, worst);
    if (o.noAnchorApi) assert.ok(M.files['C:/WCG/frames/g2/geo_log.txt'].includes('짐작'), '앵커 이름 짐작을 기록');
  }
});

test('끝까지: GEOlayers 패널이 없으면·맵 컴프가 없거나 여럿이면 한국어 알림으로 멈춤(아무것도 안 만듦), 열어 둔 맵 컴프는 그것을 씀', async () => {
  const S = tyS();
  const r = geoCtx(S);
  const spec = await r.sendGeo();
  const jsx = GJ.buildGeoJsx(JSON.parse(JSON.stringify(spec)), 'C:\\WCG\\frames\\g3');
  const run = (n, setup, api) => {
    const M = mkModel({ geo: true });
    const G = mkGeo(M);
    for (let i = 0; i < n; i++) G.addTemplate('Map ' + (i + 1), 1920, 1080);
    if (setup) setup(M, G);
    if (api !== null) M.g.geolayers3 = G.api;   // null = GEOlayers 패널이 안 열림(전역 없음)
    const before = M.comps.length;
    M.run(jsx);
    return { M, G, made: M.comps.length - before };
  };
  let x = run(1, null, null);
  assert.match(x.M.alerts[0], /패널이 열려 있지 않아요/); assert.equal(x.made, 0);
  x = run(0);
  assert.match(x.M.alerts[0], /맵 컴프를 못 찾았어요[\s\S]*1920×1080/); assert.equal(x.made, 0);
  x = run(2);
  assert.match(x.M.alerts[0], /여러 개예요/); assert.equal(x.made, 0);
  x = run(2, (M, G) => { M.proj.activeItem = G.temps[1].C; });   // 두 번째를 열어 둠
  assert.equal(x.G.api.calls.find((c) => c[0] === 'duplicate')[1].newContainingCompName, 'WeatherCG_T_GEO');
  const main = x.M.comps.find((c) => c.name === spec.comp.name);
  assert.equal(main.list[main.list.length - 1].source.list.find((l) => l.name.endsWith('맵')).name, 'WeatherCG_T_GEO 맵');
  assert.ok(x.M.alerts[x.M.alerts.length - 1].includes('보냈어요'));
  assert.equal(x.G.api.calls.find((c) => c[0] === 'duplicate')[2], 'Map 2 (담는 컴프)', '열어 둔 두 번째 맵 컴프를 복제');
  // 지난번에 보낸 우리 컴프를 열어 두고 다시 보내면 — 그 안의 GEO_MAP(지난 복제본)을 본보기로, 이름은 겹치지 않게(_GEO_2)
  x.M.proj.activeItem = main; x.G.api.calls.length = 0;
  x.M.run(jsx);
  const dup2 = x.G.api.calls.find((c) => c[0] === 'duplicate');
  assert.equal(dup2[2], 'WeatherCG_T_GEO'); assert.equal(dup2[1].newContainingCompName, 'WeatherCG_T_GEO_2');
  // 복제를 못 하면(undefined·예외·맵 컴프를 같이 쓰는 복제) 멈춤 — 우리 컴프도 안 만들고, 원래 맵 컴프는 그대로(키·길이·레이어), 이번에 생긴 컴프만 지운다
  const fxKeys = (G) => ['Latitude', 'Longitude', 'Zoom', 'Bearing', 'Pitch'].reduce((n, k) => n + G.temps[0].L.property('ADBE Effect Parade').property(k).property(1).keys.length, 0);
  for (const [nm, setup, err] of [
    ['undefined', (M, G) => { G.api.duplicate = () => undefined; }, false],
    ['예외', (M, G) => { G.api.duplicate = () => { throw new Error('boom'); }; }, true],
    ['맵 컴프를 같이 쓰는 복제', (M, G) => { G.o.dupShared = true; }, false],
  ]) {
    x = run(1, setup);
    assert.equal(x.M.alerts.length, 1, nm);
    assert.match(x.M.alerts[0], /복제하지 못해 멈췄어요[\s\S]*Map 1 \(담는 컴프\)/, nm);
    if (err) assert.match(x.M.alerts[0], /boom/);
    assert.deepEqual(x.M.comps.map((c) => c.name), ['Map 1', 'Map 1 (담는 컴프)'], nm + ': 남는 컴프 = 원래 둘');
    assert.equal(fxKeys(x.G), 0, nm + ': 원래 맵 컴프에 키 없음');
    assert.equal(x.G.temps[0].C.duration, 30); assert.equal(x.G.temps[0].mc.duration, 30);
    assert.equal(x.G.temps[0].C.list.length, 2, nm + ': 원래 담는 컴프 레이어 그대로(맵·앵커)');
    if (nm === '맵 컴프를 같이 쓰는 복제') assert.deepEqual(x.M.removed, ['WeatherCG_T_GEO'], '이번에 생긴 담는 컴프만 지움');
  }
});

test('끝까지: 패널을 닫아 draw·finalize 답이 안 오면 정한 시간 뒤 알림·기록(app.scheduleTask), 답이 오면 그 예약은 취소', async () => {
  // 패널 닫힘 — geolayers3는 남아 있지만 콜백이 안 온다
  let x = await geoRun(tyS(), { setup: (M, G) => { M.useTasks(); G.api.draw = () => {}; G.api.finalize = () => {}; } });
  assert.deepEqual(x.M.errors, []);
  assert.equal(x.M.alerts.length, 0, '③까지는 알림 없음(비동기 기다림)');
  assert.equal(x.M.tasks.length, 1);
  assert.equal(x.M.tasks[0].ms, GJ.WAIT_DRAW_S * 1000);
  assert.ok(x.M.files['C:/WCG/frames/gr/geo_log.txt'].includes('OK'), '③까지 기록은 먼저');
  x.M.runTasks();
  assert.equal(x.M.alerts.length, 1);
  assert.match(x.M.alerts[0], new RegExp(GJ.WAIT_DRAW_S + '초 넘게 답이 없어요[\\s\\S]*Finalize[\\s\\S]*geo_log\\.txt'));
  assert.match(x.M.files['C:/WCG/frames/gr/geo_log.txt'], /답이 없어요/);
  assert.equal(Object.keys(x.M.g).filter((k) => /^wcgGeoWait/.test(k)).length, 0, '전역 함수는 한 번 쓰고 지움');
  // 셰이프가 없고 타일 받기만이면 더 오래 기다린다
  x = await geoRun(tyS(), { edit: (sp) => { sp.geo.draw = []; }, setup: (M, G) => { M.useTasks(); G.api.finalize = () => {}; } });
  assert.equal(x.M.tasks.length, 1); assert.equal(x.M.tasks[0].ms, GJ.WAIT_FIN_S * 1000);
  // 패널이 답하면(가짜 GEOlayers는 바로 콜백) 예약은 취소되고 마지막 알림 하나만
  x = await geoRun(tyS(), { setup: (M) => M.useTasks() });
  assert.equal(x.M.alerts.length, 1); assert.match(x.M.alerts[0], /GEOlayers 지도로 보냈어요/);
  assert.ok(x.M.tasks.every((t) => t.off), '예약 취소');
  x.M.runTasks(); assert.equal(x.M.alerts.length, 1);
});
test('끝까지: 패널이 없을 때 — 설치판이 지원하지 않는 AE 버전이면 그 까닭을, 지원 범위 안이면 패널 열기 안내 + 범위', async () => {
  const S = tyS();
  const r = geoCtx(S);
  const spec = await r.sendGeo();
  const run = (ver, gopt) => { const M = mkModel({ geo: true }); M.g.app.version = ver; M.run(GJ.buildGeoJsx(JSON.parse(JSON.stringify(spec)), 'C:\\WCG\\v', gopt)); return M; };
  let M = run('27.0x53', { ae: [13.6, 26.9], ver: '1.17.0' });
  assert.match(M.alerts[0], /이 AE에서는 뜨지 않아요[\s\S]*27판[\s\S]*GEOlayers 3\(1\.17\.0\)는 AE 13\.6~26\.9만 지원/);
  assert.equal(M.comps.length, 0);
  M = run('26.0x125', { ae: [13.6, 26.9], ver: '1.17.0' });
  assert.match(M.alerts[0], /패널이 열려 있지 않아요[\s\S]*설치판 1\.17\.0: AE 13\.6~26\.9/);
  M = run('12.0x1', { ae: [13.6, 26.9], ver: '1.17.0' });
  assert.match(M.alerts[0], /이 AE에서는 뜨지 않아요/);
  M = run(undefined, { ae: [13.6, 26.9], ver: '1.17.0' });   // 판을 못 읽으면 일반 안내
  assert.match(M.alerts[0], /패널이 열려 있지 않아요/);
  M = run('27.0x53');   // 범위를 모르면(옛 호출) 범위 없이 일반 안내 + 지원 여부 확인 한 줄
  assert.match(M.alerts[0], /패널이 열려 있지 않아요[\s\S]*이 AE 버전을 지원하는지도 확인해 주세요\.$/);
});
test('끝까지: 한 보기(키 없음) — GEOlayers가 Zoom을 이미지 범위로 자르면 기록, 맵 컴프가 짧으면 길이를 늘리고 안내', async () => {
  const S = tyS({ cam: [] });
  let x = await geoRun(S, { zoomMax: 3 });
  assert.deepEqual(x.M.errors, []);
  const last = x.M.alerts[x.M.alerts.length - 1];
  assert.match(last, /Zoom을 바꿔 넣었어요[\s\S]*-> 3\.000/);
  x = await geoRun(S, { dur: 2 });
  assert.match(x.M.alerts[x.M.alerts.length - 1], /맵 컴프 길이를 우리 컴프 길이에 맞춰 늘렸어요/);
  assert.doesNotMatch((await geoRun(S)).M.alerts.pop(), /길이를|Zoom을 바꿔/);
});

test('geo-jsx: 기존 jsx는 글자 그대로 가운데에(golden 불변), ASCII만, 확정 못 한 API는 typeof·try', async () => {
  const S = tyS();
  const r = geoCtx(S);
  const spec = await r.sendGeo();
  const base = Object.assign({}, spec); delete base.mode; delete base.geo;
  const jsx = GJ.buildGeoJsx(JSON.parse(JSON.stringify(spec)), 'C:\\WCG\\f');
  const plain = buildAeJsx(JSON.parse(JSON.stringify(base)), 'C:\\WCG\\f').split('\n');
  assert.ok(jsx.includes('\n' + plain.slice(1, -1).join('\n') + '\n'), '기존 jsx(첫 줄 뒤 ~ 마지막 줄 전)가 그대로 들어 있다');
  // 첫 줄(실행 취소 묶음 열기)은 한 번만 — 확인·찾기 뒤, 맵 컴프 복제 앞(복제도 묶음 안), 마지막 줄은 맨 끝 비동기 앞
  const J = jsx.split('\n');
  assert.equal(J.filter((s) => s === plain[0]).length, 1);
  const iHead = J.indexOf(plain[0]), iDup = J.findIndex((s) => s.includes('geolayers3.duplicate(')), iBody = J.indexOf(plain[1]), iFind = J.findIndex((s) => s.includes('geolayers3.getMapcomps()'));
  assert.ok(iFind < iHead && iHead < iDup && iDup < iBody, [iFind, iHead, iDup, iBody].join(','));
  assert.equal(J.filter((s) => s === plain[plain.length - 1]).length, 1);
  assert.ok(!/[^\x00-\x7e\n]/.test(jsx), 'jsx는 ASCII만(한국어는 \\uXXXX)');
  assert.doesNotThrow(() => new vm.Script(jsx));
  for (const s of ['typeof geolayers3==="undefined"', 'geolayers3.getMapcomps()', 'geolayers3.duplicate(', 'geolayers3.setViewAtTime(', 'setValuesAtTimes(', 'geolayers3.getMapcompAnchor(',
    'geolayers3.removeMapcompControlKeys(', 'typeof geolayers3.draw!=="function"', 'typeof geolayers3.finalize==="function"', 'File(dir+"/"+d.f)', 'BlendingMode.SCREEN', 'thisComp.layer(\\"GEO_MAP\\")',
    'app.scheduleTask(', 'app.cancelTask(', 'krl.moveAfter(bg0)']) assert.ok(jsx.includes(s), s);
  // 복제를 두 번 시도하지 않는다(맵 컴프 자체를 복제하면 원래 담는 컴프에 새 레이어가 생길 수 있다)
  assert.equal(jsx.split('geolayers3.duplicate(').length - 1, 1);
  assert.doesNotMatch(jsx, /GP2=GP;/, '원래 맵 컴프에 바로 얹는 길이 없다');
  // ES3만(옛 ExtendScript): let/const/화살표 없음 — 우리 덧붙임 부분만 본다
  const extra = jsx.replace(plain.slice(1, -1).join('\n'), '');
  assert.ok(!/\b(let|const)\s|=>/.test(extra), 'ES3 문법만');
  // 기존 경로: mode가 없거나 geo가 없으면 GEOlayers 길이 아니다
  assert.equal(GJ.isGeoSpec(base), false);
  assert.equal(GJ.isGeoSpec(Object.assign({}, spec, { geo: null })), false);
  // GeoJSON 파일 이름은 정해진 꼴만(경로 문자 막기)
  const files = GJ.geoFiles({ mode: 'geolayers', geo: { typhoon: { geojson: { '../x': spec.geo.typhoon.geojson.r70, r70: spec.geo.typhoon.geojson.r70 } } } });
  assert.deepEqual(files.map((f) => f.name), ['geo_r70.geojson', 'typhoon.geojson']);
});

// ── 보내는 방식 팝업 ──
function popCtx(S, extra) {
  const ctx = Object.assign({ S, Math, Object, Array, String, JSON, isTyphoon: () => S.style === 'typhoon' || S.style === 'typhoonCompare', calls: [], status: (m) => ctx.calls.push(['status', m]),
    $: () => ({ disabled: false }), sendToAE: (...a) => { ctx.calls.push(['send', a[0]]); }, aeAskMode: async () => ctx.mode, mode: 'geolayers' }, extra || {});
  vm.createContext(ctx);
  vm.runInContext(['AE_MODE_KEY'].map(constSrc).join('\n') + '\n' + ['aeGeoWhyNot', 'aeModeCards', 'aeSendClick'].map(fnSrc).join('\n'), ctx);
  return ctx;
}
test('보내는 방식 카드: 태풍 지도만 GEOlayers 칸이 켜지고, 다른 지도·노말 VF·GEOlayers 없음은 흐림 + 까닭 한 줄, 고른 것 기억', () => {
  const caps = { ok: true, geolayers: { installed: true, version: '1.17.0' } };
  let c = popCtx({ style: 'typhoon', res: '1920x1080' });
  let r = c.aeModeCards(caps, 'geolayers');
  assert.equal(r.pick, 'geolayers');
  assert.equal(r.cards[1].why, '');
  assert.match(r.cards[1].sub, /1\.17\.0/);
  assert.equal(c.aeModeCards(caps, null).pick, 'layers');
  // 안내: 설치판의 지원 AE 범위를 알면 덧붙인다(더 새 AE에서는 패널이 아예 안 뜬다), 모르면 패널 안내만
  assert.match(r.geoNote, /GEOlayers 3 패널을 열고/); assert.doesNotMatch(r.geoNote, /판에서만/);
  const n2 = c.aeModeCards({ ok: true, geolayers: { installed: true, version: '1.17.0', ae: [13.6, 26.9] } }, 'geolayers').geoNote;
  assert.match(n2, /GEOlayers 3 1\.17\.0는 AE 13\.6~26\.9판에서만 패널이 떠요/);
  c = popCtx({ style: 'sgg', res: '1920x1080' });
  r = c.aeModeCards(caps, 'geolayers');
  assert.equal(r.pick, 'layers'); assert.equal(r.cards[1].why, '태풍 지도에서만 써요'); assert.equal(r.cards[1].sub, '태풍 지도에서만 써요');
  assert.equal(popCtx({ style: 'typhoon', res: '1920x1080-vf' }).aeGeoWhyNot(caps), '노말 VF에서는 아직 못 써요');
  assert.equal(popCtx({ style: 'typhoon', res: '1920x1080' }).aeGeoWhyNot({ ok: true, geolayers: { installed: false } }), '이 PC에 GEOlayers 3가 없어요');
  assert.equal(popCtx({ style: 'typhoonCompare', res: '2158x1214' }).aeGeoWhyNot(caps), '');
  for (const cd of r.cards) assert.ok(!/\p{Extended_Pictographic}/u.test(cd.name + cd.sub), '카드 글자에 이모지 없음');
});
test('aeSendClick: 헬퍼가 모르거나 GEOlayers가 없으면 팝업 없이 지금처럼(부팅 점검 길), 있으면 묻고 고른 대로·취소면 안내만', async () => {
  const calls = (c) => JSON.parse(JSON.stringify(c.calls));   // vm 안 객체 — 내용만 비교
  let c = popCtx({ style: 'typhoon', res: '1920x1080' }, { aeGeoCaps: async () => null });
  await c.aeSendClick(); assert.deepEqual(calls(c), [['send', null]]);
  c = popCtx({ style: 'typhoon', res: '1920x1080' }, { aeGeoCaps: async () => ({ ok: true, geolayers: { installed: false } }) });
  await c.aeSendClick(); assert.deepEqual(calls(c), [['send', null]]);
  c = popCtx({ style: 'typhoon', res: '1920x1080' }, { aeGeoCaps: async () => ({ ok: true, geolayers: { installed: true } }) });
  await c.aeSendClick(); assert.deepEqual(calls(c), [['send', { aeMode: 'geolayers' }]]);
  c.calls.length = 0; c.mode = 'layers'; await c.aeSendClick(); assert.deepEqual(calls(c), [['send', null]]);
  c.calls.length = 0; c.mode = null; await c.aeSendClick(); assert.deepEqual(calls(c), [['status', 'AE 보내기 취소']]);
});
test('배선: 제목줄 AE 버튼 = aeSendClick, 팝업은 토스 모달·카드 재사용, ae-geo.js는 ae-export.js 바로 뒤', () => {
  assert.match(html, /\$\('#aeSend'\)\.onclick = aeSendClick;/);
  assert.doesNotMatch(html, /\$\('#aeSend'\)\.onclick = sendToAE;/);
  const ask = fnSrc('aeAskMode');
  assert.match(ask, /tossModal\(\{/);
  assert.match(ask, /cgsCard/); assert.match(ask, /choicePending/); assert.match(ask, /aria-disabled/);
  assert.match(ask, /localStorage\.setItem\(AE_MODE_KEY, pick\)/);
  // 태그 순서 = MODULES.md 3장 표 순서(split-structure 시험이 둘을 맞춘다)
  const md = fs.readFileSync(path.join(__dirname, '..', 'MODULES.md'), 'utf8');
  const order = [...md.matchAll(/^\|\s*\d+\s*\|\s*`(js\/[\w.-]+\.js)`/gm)].map((m) => m[1]);
  assert.equal(order[order.indexOf('js/ae-export.js') + 1], 'js/ae-geo.js');
  assert.equal(order[order.indexOf('js/ae-geo.js') + 1], 'js/export-dialog.js');
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'css', 'export-dialog.css'), 'utf8'), /\.aeModeCards \{ --acc: var\(--cgs-res\)/);
});

// ── 실제 앱(부팅 점검기 + fetch 가로채기 — AE는 안 띄움) — WCG_BOOT_CHECK=1 일 때만 ──
test('부팅 점검: 실제 앱의 보내는 방식 팝업 → GEOlayers 지도로 스펙·지도 겹 PNG(바다 빠짐), 일반 지도는 흐림', { skip: process.env.WCG_BOOT_CHECK !== '1' && 'WCG_BOOT_CHECK=1 일 때만(일렉트론 필요)' }, () => {
  const { execFileSync } = require('node:child_process');
  let raw;
  try {
    raw = execFileSync(process.execPath, [path.join(__dirname, '..', 'desktop', 'test', 'boot-check.cjs'), path.join(__dirname, '..'), '--wait=8000', '--keepalive', '--eval=' + path.join(__dirname, 'ae-geo.boot-eval.js')], { encoding: 'utf8', timeout: 300000, maxBuffer: 1 << 26 });
  } catch (e) { raw = e.stdout; }
  const j = JSON.parse(raw);
  assert.equal(j.ok, true, JSON.stringify(j.errors));
  const o = j.evalResult;
  assert.ok(o && !o.error, o && o.error);
  assert.equal(o.typhoon.pop, true); assert.equal(o.typhoon.title, 'After Effects로 보내기');
  assert.deepEqual(o.typhoon.cards.map((c) => [c.mode, c.dis, c.on]), [['layers', false, true], ['geolayers', false, false]]);
  assert.deepEqual(o.typhoon.afterPick, [false, true]);
  assert.match(o.typhoon.note, /GEOlayers 3 패널/);
  assert.match(o.typhoon.note, /AE 13\.6~26\.9판에서만/);
  assert.equal(o.spec.mode, 'geolayers'); assert.equal(o.spec.geoV, 1);
  assert.equal(o.spec.keys, 2); assert.ok(o.spec.rows > 70);
  assert.ok(['r70', 'r15', 'r25', 'past', 'fcst', 'points'].every((k) => o.spec.fc.includes(k)), o.spec.fc.join(','));
  assert.ok(o.spec.camKeys.every((k) => k.x === o.spec.anchor[0] && k.y === o.spec.anchor[1]), '리깅 카메라 위치·배율 = 항등');
  assert.deepEqual(o.spec.camKeys.map((k) => k.rz), [0, 15], '회전은 앱 키 그대로(헬퍼가 ROT로 라벨을 돌림)');
  assert.equal(o.spec.token, false);
  assert.equal(o.saved, 'geolayers');
  assert.equal(o.overlay.a, 0, '지도 겹 PNG 가장자리 = 투명(바다·육지는 GEOlayers가 그린다)');
  if (o.kr) assert.equal(o.kr.a, 0);
  assert.equal(o.sgg.pop, true);
  assert.deepEqual(o.sgg.cards.map((c) => [c.mode, c.dis]), [['layers', false], ['geolayers', true]]);
  assert.match(o.sgg.cards[1].txt, /태풍 지도에서만 써요/);
  assert.deepEqual(o.sgg.afterPick, [true, false], '흐린 칸은 눌러도 안 골라진다');
  assert.equal(o.sgg.closed, true); assert.equal(o.sgg.sent, 0);
});
