'use strict';
// 내장 헬퍼의 GEOlayers 길(desktop/wns/server.js GET /api/geo-caps · /api/ae mode:'geolayers' → desktop/wns/geo-jsx.js) — node --test test/geo-jsx.test.cjs
// AfterFX 는 실행하지 않는다(aeDryRun). AE 선택·폰트는 가짜(사용자 PC를 건드리지 않는다). GEOlayers 설치 폴더는 임시 폴더의 가짜 manifest.
// 앱 쪽 명세·투영·AE 흉내 끝까지 시험은 tests/ae-geo.test.cjs.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

const W = require('../wns/server.js');
const GJ = require('../wns/geo-jsx.js');
const { buildAeJsx } = require('../wns/ae-jsx.js');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'wns-geo-'));
const FRAMES = path.join(TMP, 'frames');
const AFX = 'C:\\Program Files\\Adobe\\Adobe After Effects 2026\\Support Files\\AfterFX.exe';
test.after(() => fs.rmSync(TMP, { recursive: true, force: true }));
// 가짜 GEOlayers 3 설치 폴더(manifest만 — 설치판 1.17.0과 같은 꼴: 판 + 지원 AE 범위)
const EXT = path.join(TMP, 'ext', 'GEOlayers 3');
fs.mkdirSync(path.join(EXT, 'CSXS'), { recursive: true });
fs.writeFileSync(path.join(EXT, 'CSXS', 'manifest.xml'), '<?xml version="1.0"?><ExtensionManifest ExtensionBundleId="x" ExtensionBundleVersion="1.17.0" Version="7.0"><HostList>\n            <Host Name="AEFT" Version="[13.6,26.9]" />\n</HostList></ExtensionManifest>');

// 작은 GEOlayers 스펙(앱 aeGeoSpec 모양) — 리깅은 지금 형식 그대로, 카메라는 항등 키
function geoSpec(sid, over) {
  const fc = (geom) => ({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: geom }] });
  return Object.assign({
    sid, comp: { name: 'WeatherCG_1010', w: 1920, h: 1080, fps: 29.97, dur: 6 }, shadow: { x: 0, y: 8, blur: 10, op: 45, col: '#000814' },
    layers: [{ name: '태풍 리깅', typhoonRig: { bg: 'f_00000.png', points: [{ x: 300, y: 500, idx: 0, r15: 0, r25: 0, r70: 0, past: true, ws: 30 }, { x: 600, y: 420, idx: 1, r15: 40, r25: 20, r70: 70, past: false, ws: 33 }],
      nowIdx: 1, iconColFile: 'f_00001.png', iconGrayFile: 'f_00002.png', iconH: 270, iconRenderH: 225, iconScreenH: 50, bands: { r15: { fill: '#8EA8DD', fillOp: 0.22, stroke: '#B7CCF2', strokeW: 2, dash: 1 } },
      reveal: { start: 0, path: 2, labelLen: 1 }, labels: [], prog: { start: 0, end: 2, curve: 'ioc' },
      camera: { anchor: [860, 377], sBaked: 0.307, keys: [{ t: 0, x: 860, y: 377, s: 0.307, rz: 0 }], ease: [34, 85], pivot: [960, 540] } } }],
    mode: 'geolayers',
    geo: { v: 1, bind: { origin: [228000.5, 104000.25], sigma0: 2999.5 }, view: { work: { latitude: 33.7, longitude: 129.25, zoom: 5.2, bearing: 0, pitch: 0 }, keys: [], frames: null, tilt: false },
      overlays: { kr: { file: 'f_00003.png', blend: 'screen' } },
      typhoon: { kind: 'single', geojson: { r15: fc({ type: 'MultiPolygon', coordinates: [[[[129, 33], [130, 33], [130, 34], [129, 33]]]] }), past: fc({ type: 'LineString', coordinates: [[129, 30], [129.5, 31]] }), '../bad': fc({ type: 'Point', coordinates: [0, 0] }) } },
      draw: [{ key: 'r15', name: 'GEO_강풍', kind: 'fill', col: '#8EA8DD', op: 0.22, stroke: '#B7CCF2', w: 2, dash: 1 }, { key: 'past', name: 'GEO_경로', kind: 'line', col: '#96A0AD', w: 2.75, dash: 0 }, { key: 'nope', kind: 'line' }], finalize: 1 },
  }, over || {});
}

test('GET /api/geo-caps — GEOlayers 3 manifest 판·지원 AE 범위(경로·사용자 이름은 응답에 없음), 없으면 installed:false', async () => {
  const ext = EXT;
  const srv = W.createWnsServer({ framesDir: FRAMES, aeDryRun: true, fontsInstall: false, geoDirs: [path.join(TMP, 'nope'), ext] });
  const port = await srv.listen(0);
  try {
    const r = await fetch('http://127.0.0.1:' + port + '/api/geo-caps');
    assert.equal(r.status, 200);
    const txt = await r.text();
    assert.equal(txt, '{"ok": true, "geolayers": {"installed": true, "version": "1.17.0", "ae": [13.6, 26.9]}}');
    assert.ok(!txt.includes(TMP.replace(/\\/g, '\\\\')) && !txt.includes(os.userInfo().username), '경로·사용자 이름 없음');
    srv.config.geoDirs = [path.join(TMP, 'nope')];
    assert.deepEqual(await (await fetch('http://127.0.0.1:' + port + '/api/geo-caps')).json(), { ok: true, geolayers: { installed: false, version: null, ae: null } });
    assert.deepEqual(W.geoCaps([]), { installed: false, version: null, ae: null });
    // Host 줄이 없거나 범위가 거꾸로면 ae = null(판은 그대로)
    const ext2 = path.join(TMP, 'ext2', 'GEOlayers 3');
    fs.mkdirSync(path.join(ext2, 'CSXS'), { recursive: true });
    fs.writeFileSync(path.join(ext2, 'CSXS', 'manifest.xml'), '<ExtensionManifest ExtensionBundleVersion="1.18.0"><Host Name="AEFT" Version="[27.9,13.6]" /></ExtensionManifest>');
    assert.deepEqual(W.geoCaps([ext2]), { installed: true, version: '1.18.0', ae: null });
    fs.writeFileSync(path.join(ext2, 'CSXS', 'manifest.xml'), '<ExtensionManifest ExtensionBundleVersion="1.18.0"></ExtensionManifest>');
    assert.deepEqual(W.geoCaps([ext2]), { installed: true, version: '1.18.0', ae: null });
    assert.ok(W.geoDirs().every((d) => d.endsWith(path.join('Adobe', 'CEP', 'extensions', 'GEOlayers 3'))));
  } finally { await srv.close(); }
});

test('/api/ae — mode:geolayers면 GeoJSON 파일(정해진 이름만)과 GEOlayers jsx, mode가 없으면 지금 jsx 그대로(바이트 동일)', async () => {
  const srv = W.createWnsServer({ framesDir: FRAMES, aeDryRun: true, fontsInstall: false, findRunningAfterFx: async () => AFX, listAfterFx: () => [], geoDirs: [EXT] });
  const port = await srv.listen(0), b = 'http://127.0.0.1:' + port;
  try {
    const sid = 'aegeo' + Date.now();
    await fetch(b + '/api/frame?sid=' + sid + '&index=0&ext=png', { method: 'POST', body: 'png' });
    const spec = geoSpec(sid);
    let r = await fetch(b + '/api/ae', { method: 'POST', body: JSON.stringify(spec) });
    let j = await r.json();
    assert.equal(r.status, 200, JSON.stringify(j));
    assert.equal(j.ae, 'dry-run');
    const d = path.join(FRAMES, sid);
    assert.deepEqual(fs.readdirSync(d).filter((f) => f.endsWith('.geojson')).sort(), ['geo_past.geojson', 'geo_r15.geojson', 'typhoon.geojson']);
    assert.equal(JSON.parse(fs.readFileSync(path.join(d, 'typhoon.geojson'), 'utf8')).features.length, 2);
    const jsx = fs.readFileSync(j.jsx, 'utf8');
    assert.equal(jsx, GJ.buildGeoJsx(JSON.parse(JSON.stringify(spec)), d, { ae: [13.6, 26.9], ver: '1.17.0' }).replace(/\n/g, '\r\n'));
    assert.match(jsx, /typeof geolayers3==="undefined"/);
    assert.match(jsx, /gav<13\.6\|\|gav>26\.9/, '설치판이 지원하는 AE 범위로 패널 없음 까닭을 가른다');
    assert.match(jsx, /"f":"geo_r15\.geojson"/); assert.match(jsx, /"f":"geo_past\.geojson"/);
    assert.doesNotMatch(jsx, /geo_nope|\.\.\/bad/);
    // mode 없는 같은 스펙 = 지금 jsx 그대로
    const plain = Object.assign({}, spec); delete plain.mode; delete plain.geo;
    r = await fetch(b + '/api/ae', { method: 'POST', body: JSON.stringify(plain) });
    j = await r.json();
    assert.equal(fs.readFileSync(j.jsx, 'utf8'), buildAeJsx(JSON.parse(JSON.stringify(plain)), d).replace(/\n/g, '\r\n'));
    // geo가 객체가 아니면 GEOlayers 길이 아니다(옛 jsx)
    r = await fetch(b + '/api/ae', { method: 'POST', body: JSON.stringify(Object.assign({}, plain, { mode: 'geolayers', geo: 'x' })) });
    j = await r.json();
    assert.equal(fs.readFileSync(j.jsx, 'utf8'), buildAeJsx(JSON.parse(JSON.stringify(plain)), d).replace(/\n/g, '\r\n'));
  } finally { await srv.close(); }
});

test('geo-jsx: 보기 하나·프레임마다 갈래, 셰이프 스타일(GEOlayers 기본 스타일 모양), 키 시각 마커, 기울기 기록, 못 읽는 값은 건너뜀', () => {
  const s1 = geoSpec('a');
  const one = GJ.buildGeoJsx(s1, 'C:/t');
  assert.match(one, /geolayers3\.setViewAtTime\(GP2\.C,gv,false,0\)/);
  assert.doesNotMatch(one, /var GR=/);
  assert.doesNotThrow(() => new vm.Script(one));
  const s2 = geoSpec('b');
  s2.geo.view.frames = { fps: 29.97, rows: [[0, 33, 129, 5, 0], [0.0334, 33.1, 129.1, 5.01, 0], ['x', 1, 2, 3, 4], [0.02, 1, 1, 1, 1], [0.0667, 33.2, 129.2, 5.02, 1]] };
  s2.geo.view.keys = [{ t: 0 }, { t: 0.0667 }];
  s2.geo.view.tilt = true;
  const many = GJ.buildGeoJsx(s2, 'C:/t');
  assert.match(many, /var GR=\[\[0,33,129,5,0\],\[0\.0334,33\.1,129\.1,5\.01,0\],\[0\.0667,33\.2,129\.2,5\.02,1\]\]/, '형식이 틀리거나 시각이 거꾸로인 줄은 뺀다');
  assert.match(many, /setValuesAtTimes\(T,A\)/);
  assert.match(many, /var GK=\[0,0\.0667\]/);
  assert.match(many, /markerProperty\.setValueAtTime/);
  assert.ok(many.includes(GJ.MSG.tilt.split('').map((c) => (c.charCodeAt(0) > 0x7e ? '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0') : c)).join('').slice(0, 30)));
  const st = GJ.styleOf({ kind: 'fill', name: 'x', col: '#8EA8DD', op: 0.22, stroke: '#B7CCF2', w: 2, dash: 1 });
  assert.deepEqual(st.fill, { addFill: true, fillColor: { r: 142, g: 168, b: 221, a: 1 }, randomizeColors: false, opacity: 22 });
  assert.equal(st.stroke.strokeWidth, 2); assert.equal(st.stroke.dashVal, 0.6); assert.equal(st.stroke.strokeCap, 2);
  const ln = GJ.styleOf({ kind: 'line', col: 'bad', w: 0 });
  assert.equal(ln.fill.addFill, false); assert.deepEqual(ln.stroke.strokeColor, { r: 255, g: 255, b: 255, a: 1 }); assert.equal(ln.stroke.strokeWidth, 2);
  // 채움 불투명도 0 = 채움 끄기(설치판 'fillOpacity || 100'이 0을 100으로 바꾸므로), 0.4% 같은 반올림 0도
  for (const op of [0, 0.004]) { const z = GJ.styleOf({ kind: 'fill', col: '#112233', op, w: 2 }); assert.equal(z.fill.addFill, false); assert.equal(z.stroke.addStroke, true); }
  assert.equal(GJ.styleOf({ kind: 'fill', col: '#112233', op: 0.01 }).fill.opacity, 1);
  // 채움도 선도 없는 셰이프는 그리지 않고, 선이 있으면 굵기를 화면 px로 고정(autoStrokeWidth)
  const s5 = geoSpec('e'); s5.geo.draw[0] = Object.assign({}, s5.geo.draw[0], { op: 0, w: 0 });
  const j5 = GJ.buildGeoJsx(s5, 'C:/t');
  assert.doesNotMatch(j5, /"f":"geo_r15\.geojson"/);
  assert.match(j5, /var GD=\[\{"f":"geo_past\.geojson".*"dash":false,"aw":true\}\],/);
  assert.match(j5, /autoStrokeWidth:!!d\.aw/);
  // 묶기 상수가 없으면 CAM을 묶지 않고 기록만
  const s3 = geoSpec('c'); s3.geo.bind = null;
  assert.doesNotMatch(GJ.buildGeoJsx(s3, 'C:/t'), /var EXH=/);
  // finalize: 0이면 타일 받기를 안 부른다
  const s4 = geoSpec('d'); s4.geo.finalize = 0;
  assert.match(GJ.buildGeoJsx(s4, 'C:/t'), /GFIN=false/);
  // CAM 표현식(앞부분) = ES3 — 옛 ExtendScript 표현식 엔진에서도
  const h = GJ.camExprHead([1, 2], 3);
  assert.doesNotMatch(h + GJ.CAM_POS + GJ.CAM_SCL + GJ.CAM_ROT, /\b(let|const)\s|=>/);
  assert.throws(() => GJ.buildGeoJsx({ mode: 'x' }, 'C:/t'), /GEOlayers 스펙이 아님/);
});
