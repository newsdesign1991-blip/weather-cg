const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const appSource = require('../tools/app-source.cjs');   // js/·css/로 나뉜 앱을 '한 파일' 텍스트로 합쳐 읽는다(MODULES.md)
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const html = appSource(path.join(root, 'index.html'));

// index.html에서 이름으로 함수/상수 정의 하나를 잘라낸다(괄호 균형으로 끝 찾기).
function pick(name) {
  const heads = [`async function ${name}(`, `function ${name}(`, `const ${name} = `, `let ${name} = `];
  let s = -1;
  for (const h of heads) { s = html.indexOf(h); if (s >= 0) break; }
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

function sandbox(names, extra) {
  const ctx = Object.assign({ window: {}, console }, extra || {});
  vm.createContext(ctx);
  vm.runInContext(names.map(pick).join('\n') + '\n' + names.map((n) => `globalThis.${n} = ${n};`).join('\n'), ctx);
  return ctx;
}

test('C4: JTWC 예보 시각은 헤더 SSYY의 연도로 읽어 베스트트랙과 겹치지 않고 시간순이다', () => {
  const ctx = sandbox(['fmtKST', 'parseJtwcTcw']);
  const txt = [
    'WTPN31 PGTW 040900',
    '1226080406 12W PODUL 001',
    'T000 253N 1419E 115',
    'T012 262N 1405E 120',
    '1226080318 240N1440E 100',
    '1226080400 246N1430E 110',
    '1226080406 253N1419E 115',
  ].join('\n');
  const wl = ctx.parseJtwcTcw(txt);
  const tm = wl[0].points.map((p) => p.tmef);
  assert.ok(tm.every((t) => t.startsWith('2026')), tm.join(','));
  assert.equal(new Set(tm).size, tm.length);
  assert.deepEqual([...tm], ['202608031800', '202608040000', '202608040600', '202608041800']);
  assert.equal(wl[0].points[2].fcst, false);
  assert.equal(wl[0].points[3].fcst, true);
});

test('C69: 지명 사전 — 광주=광주광역시, 인천은 육지, 시도+동명은 그 시도 지명', () => {
  const ctx = { window: {}, console };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'place-data.js'), 'utf8'), ctx);
  vm.runInContext(pick('geocodePlace') + '\nglobalThis.geocodePlace = geocodePlace;', ctx);
  const g = (q) => ctx.geocodePlace(q);
  assert.deepEqual([...g('광주')], [126.852, 35.16]);
  assert.deepEqual([...g('광주광역시')], [126.852, 35.16]);
  assert.deepEqual([...g('광주시')], [127.289, 37.401]);
  assert.deepEqual([...g('경기 광주')], [127.289, 37.401]);
  assert.ok(g('인천')[0] > 126.5 && g('인천광역시')[0] > 126.5);
  assert.ok(g('경북')[0] < 129.3);
  assert.deepEqual([...g('경남 고성')], [128.322, 34.973]);
  assert.deepEqual([...g('경상남도 고성군')], [128.322, 34.973]);
  assert.ok(g('고성')[1] > 38);
  assert.ok(g('경남 고성').approx == null);
});

test('C33: 비교 라벨 원본 idx → 날짜범위로 걸러진 표시 idx', () => {
  const ctx = sandbox(['typhoonDateKST', 'compareVisiblePoints', 'compareVisibleIdxMap']);
  const pts = ['202608100000', '202608110000', '202608120000', '202608130000'].map((tmef) => ({ tmef }));
  const c = { points: pts, rangeOn: 1, rangeFrom: '2026-08-12', rangeTo: '2026-08-13' };
  const m = ctx.compareVisibleIdxMap(c);
  assert.equal(m[0], undefined); assert.equal(m[1], undefined);
  assert.equal(m[2], 0); assert.equal(m[3], 1);
  assert.equal(ctx.compareVisibleIdxMap({ points: pts })[3], 3);
});

test('C5/C84: TD 붙이기·원복 후 라벨·현재지점이 같은 실제 점을 가리키고 비교 스냅샷도 갱신', () => {
  let rebuilt = 0;
  const ctx = sandbox(['_remapEdgePoints'], { S: {}, isTyphoonCompare: () => true, buildCompareSection: () => { rebuilt++; } });
  const a = { tmef: '1', lon: 1, lat: 1 }, b = { tmef: '2', lon: 2, lat: 2 }, g = { tmef: '0', lon: 0, lat: 0, _edgeTD: true };
  const it = { points: [a, b] };
  ctx.S.typhoon = { labels: [{ idx: 1 }, { idx: null }], nowIdx: 0, compare: [{ points: JSON.parse(JSON.stringify([a, b])), labels: [{ idx: 1 }] }] };
  const old = it.points; it.points = [g, a, b];
  ctx._remapEdgePoints(it, old);
  const T = ctx.S.typhoon;
  assert.equal(T.labels[0].idx, 2); assert.equal(T.labels[1].idx, null); assert.equal(T.nowIdx, 1);
  assert.equal(T.compare[0].points.length, 3); assert.equal(T.compare[0].labels[0].idx, 2); assert.equal(rebuilt, 1);
  // 원복: 빠진 edge 점 라벨은 삭제
  T.labels.push({ idx: 0 });
  const old2 = it.points; it.points = [a, b];
  ctx._remapEdgePoints(it, old2);
  assert.deepEqual(T.labels.map((l) => l.idx), [1, null]);
  assert.equal(T.nowIdx, 0);
});

test('P1/P4: 라인 모드·선 색/굵기·아이콘 크기는 F5/지도 전환(applyTyphoonStyle)에도 유지', () => {
  const ctx = sandbox(['TYPHOON_DEFAULTS', 'typhoonStyleDefaults', 'TYPHOON_STYLE_KEYS', 'TYPHOON_PER_WORK_KEYS', 'applyTyphoonStyle'], { S: {} });
  ctx.S.typhoon = { trackMode: 'line', lineColor: '#00FF00', lineWidth: 6, iconScale: 1.2, landFill: '#000000' };
  ctx.applyTyphoonStyle();
  const T = ctx.S.typhoon;
  assert.equal(T.trackMode, 'line'); assert.equal(T.lineColor, '#00FF00'); assert.equal(T.lineWidth, 6); assert.equal(T.iconScale, 1.2);
  assert.equal(T.landFill, '#12325A');   // 색 계열은 여전히 기본값으로 통일
  ctx.S.typhoon = {};
  ctx.applyTyphoonStyle();
  assert.equal(ctx.S.typhoon.trackMode, 'full'); assert.equal(ctx.S.typhoon.lineWidth, 9.5);
});

test('P1: 라인 모드 전 저장본(배포값 0.7)은 새 아이콘 크기로 보강, 라인 모드 이후 저장본의 값은 보존', () => {
  const ctx = sandbox(['TYPHOON_DEFAULTS', 'typhoonStyleDefaults', 'initTyphoonData'], { S: {} });
  ctx.window.WCG_DEFAULTS = { typhoonStyle: { iconScale: 0.7 } };   // 지금 배포 기본값(lineWidth 없음)
  ctx.S.typhoon = { issues: [{ points: [] }], sel: 0, iconScale: 0.7 };
  ctx.initTyphoonData();
  assert.equal(ctx.S.typhoon.iconScale, 1.75);
  assert.equal(ctx.S.typhoon.lineWidth, 9.5);
  ctx.S.typhoon = { issues: [{ points: [] }], sel: 0, iconScale: 1.2, lineWidth: 6 };
  ctx.initTyphoonData();
  assert.equal(ctx.S.typhoon.iconScale, 1.2);
});

test('C79/C80/C81/C83/P5: 라인 모드 범례·아이콘·재생 범위, JMA 현재 라벨, 클립 1회 설정', () => {
  assert.match(html, /lineMode && byId\[id\] && byId\[id\]\.kind === 'band'/);
  assert.match(html, /tip\.head \? !td : false, ex\)/);
  assert.match(html, /if \(lineMode\) sp = sp\.filter\(\(p\) => p\.idx <= nowIdx\);/);
  assert.match(html, /function typhoonAnimSpan\(lo, hi\) \{ return typhoonLineMode\(\) \? Math\.max\(0, hi - lo\) : Math\.max\(1, hi - lo\); \}/);
  assert.equal((html.match(/const span = typhoonAnimSpan\(lo, hi\)/g) || []).length, 2);   // playTyphoon·renderAnimFrameBody 같은 구간 길이
  assert.match(html, /tmef: atm, label: atm \? fmtKST\(atm\) : ''/);
  assert.match(html, /scp\.getAttribute\('data-k'\) !== ck/);
});

test('C78: VF 크기 축소 공간에서 3D 투영 — 투영/역투영이 서로 역함수', () => {
  const ctx = sandbox(['camTiltOn', '_camProjectRaw', '_camUnprojectRaw', 'camProjectXY', 'camUnprojectXY', '_camVfScale'], {
    S: { res: '1920x1080-vf', vfScale: 86, vfScales: {}, map3d: { on: 1, rx: 40, ry: 0, rz: 30 } },
    _vfPanelRect: { x: 1100, y: 100, w: 700, h: 880 },
    vfScaleGroup: () => 'typhoon', clampVfScale: (v) => Math.max(10, Math.min(100, +v || 100)),
  });
  const p = ctx.camProjectXY(900, 600);
  const back = ctx.camUnprojectXY(p[0], p[1]);
  assert.ok(Math.abs(back[0] - 900) < 1e-6 && Math.abs(back[1] - 600) < 1e-6);
  // 화면 최종 위치 V(camProjectXY(p)) == 지도 워프 raw(V(p))
  const k = 0.86, ax = 1800, ay = 100, V = (x, y) => [ax + (x - ax) * k, ay + (y - ay) * k];
  const scr = V(p[0], p[1]), warp = ctx._camProjectRaw(...V(900, 600));
  assert.ok(Math.abs(scr[0] - warp[0]) < 1e-6 && Math.abs(scr[1] - warp[1]) < 1e-6);
  // 미리보기 지도 래스터도 VF 크기가 바뀌면 다시 굽는다(사인에 k 포함, 슬라이더·그립에서 applyTilt)
  assert.match(html, /\(_camVfScale\(\) \|\| \{\}\)\.k \|\| 1/);
  assert.equal((html.match(/camTiltOn\(\)\) \{ renderTyphoon\(\); applyTilt\(\); \}/g) || []).length, 2);
});
