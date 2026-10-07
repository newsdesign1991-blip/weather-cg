// 묶음 D(추출·영상·타임라인 애니) 수정 계약 — 라인 모드 애니 구간·라벨 키, 추출 제거 목록, 분리 추출 장수.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
// 최상위 function 하나의 소스(다음 줄이 '}'로 끝나는 곳까지)
const fnSrc = (name) => {
  const m = html.match(new RegExp(`\\nfunction ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}`));
  assert.ok(m, name + ' 함수를 못 찾음');
  return m[0];
};

function typhoonCtx(trackMode, cmp, nowIdx, rangeOn) {
  const ctx = {
    S: { typhoon: { trackMode, rangeOn: !!rangeOn } },
    isTyphoonCompare: () => !!cmp,
    typhoonNowIdx: () => nowIdx,
    typhoonIdxInRange: (pts, i) => i >= 1 && i <= 7,
    Math,
  };
  vm.createContext(ctx);
  vm.runInContext(['typhoonRangeWindow', 'typhoonLineMode', 'typhoonAnimWindow'].map(fnSrc).join('\n'), ctx);
  return ctx;
}

test('라인 모드 애니 구간은 현재 위치(nowIdx)에서 끝나고, 일반·비교 지도는 끝까지', () => {
  const pts = new Array(9).fill(0);
  assert.deepEqual({ ...typhoonCtx('line', false, 4).typhoonAnimWindow(pts) }, { lo: 0, hi: 4 });
  assert.deepEqual({ ...typhoonCtx('full', false, 4).typhoonAnimWindow(pts) }, { lo: 0, hi: 8 });
  assert.deepEqual({ ...typhoonCtx('line', true, 4).typhoonAnimWindow(pts) }, { lo: 0, hi: 8 });
  // 범위가 현재 이후만이면 lo보다 작아지지 않는다
  const c = typhoonCtx('line', false, 0, true);
  assert.deepEqual({ ...c.typhoonAnimWindow(pts) }, { lo: 1, hi: 1 });
});

test('라인 모드 선두(head)도 현재 위치를 넘지 않는다 — 구간이 한 점뿐(span=1)이어도 예상 쪽으로 안 뻗음', () => {
  const f = fnSrc('drawTyphoonTrack');
  assert.match(f, /if \(lineMode\) sp = sp\.filter\(\(p\) => p\.idx <= nowIdx\)/);
  assert.doesNotMatch(f, /nowIdx \+ 1/);
});

test('블라인드 베이스 지도는 카메라·팬/줌·3D 미리보기에서 L_map과 같이 움직이고 숨는다', () => {
  assert.match(html, /\.fit\.mapTilt #L_mapBase \{ visibility: hidden; \}/);
  assert.match(fnSrc('renderMapTransform'), /#L_mapBase \[data-blindmapt\]/);
  const lpz = fnSrc('lightPanZoom');
  assert.match(lpz, /mb\.setAttribute\('transform', t\)/);
  assert.match(lpz, /mb\.style\.transform = t/);
  assert.match(fnSrc('setFlatPanLOD'), /mb\.style\.transform = ''/);
});

test('재생·추출(renderAnimFrame)·애니 확인(playTyphoon)·라벨 기본키가 같은 구간 함수를 쓴다', () => {
  assert.match(fnSrc('renderAnimFrameBody'), /typhoonAnimWindow\(pts\)/);   // renderAnimFrame은 본문 뒤 틸트만 굽는다
  assert.match(fnSrc('playTyphoon'), /typhoonAnimWindow\(pts\)/);
  assert.match(fnSrc('ensureTyphoonKeys'), /typhoonAnimWindow\(pts\)/);
  assert.doesNotMatch(fnSrc('renderAnimFrameBody'), /typhoonRangeWindow\(pts\)/);
});

function keysCtx(trackMode) {
  const ctx = {
    S: { typhoon: { trackMode } },
    isTyphoonCompare: () => false,
    typhoonNowIdx: () => 4,
    labelList: () => [{ id: 'a', idx: 2 }, { id: 'b', idx: 4 }, { id: 'c', idx: 6 }],
    curTyphoonPoints: () => new Array(9).fill(0),
    easeInOutCInv: (x) => x,
    Math,
  };
  vm.createContext(ctx);
  vm.runInContext(['typhoonRangeWindow', 'typhoonLineMode', 'typhoonAnimWindow', 'typhoonLabels', 'syncTyphoonSpan', 'ensureTyphoonKeys'].map(fnSrc).join('\n'), ctx);
  return ctx;
}

test('라인 모드는 안 보이는 라벨 키를 새로 만들지 않고, 기존 키는 보존하되 트랙 길이에 넣지 않는다', () => {
  const c = keysCtx('line');
  const tr = { start: 1, len: 2, ps: 1, pe: 3, lab: { a: { s: 1.5, e: 9 } } };
  c.ensureTyphoonKeys(tr);
  assert.deepEqual(Object.keys(tr.lab), ['a']);          // 새 키(b, c) 없음 · 기존 키 a 보존
  assert.equal(tr.start, 1); assert.equal(tr.len, 2);    // 라벨 키(9초)로 늘지 않음
  const f = keysCtx('full');
  const tr2 = { start: 1, len: 2, ps: 1, pe: 3, lab: {} };
  f.ensureTyphoonKeys(tr2);
  assert.deepEqual(Object.keys(tr2.lab).sort(), ['a', 'b', 'c']);
});

test('라인 모드 타임라인은 라벨 행·스냅·라벨 길이를 쓰지 않는다', () => {
  assert.match(fnSrc('timelineSnapTimes'), /if \(!typhoonLineMode\(\)\) for \(const id in \(tr\.lab/);
  assert.match(fnSrc('buildTimeline'), /if \(!typhoonLineMode\(\)\) for \(const b of typhoonLabels\(\)\)/);
  assert.match(fnSrc('autoTracks'), /LABELs = typhoonLineMode\(\) \? 0 : 1\.2/);
});

test('참고 이미지(L_refImg)는 모든 추출 경로에서 빠진다', () => {
  assert.match(html, /const EXPORT_STRIP = \[[^\]]*'#L_refImg'/);
  assert.match(fnSrc('stripExportUi'), /EXPORT_STRIP/);
  for (const fn of ['svgToImage', 'svgBlob', 'previewPng']) assert.match(html.match(new RegExp(`async function ${fn}\\([\\s\\S]*?\\n\\}`))[0], /stripExportUi\(clone\)/);
});

test('노말 VF 영상 추출은 태풍 정적 캐시를 안 쓰고, 3D에서도 알파를 칠하지 않는다', () => {
  const f = html.match(/async function drawExportFrame\([\s\S]*?\n\}/)[0];
  assert.match(f, /isTyphoon\(\) && !camKeys\(\)\.length && S\.res !== '1920x1080-vf'/);
  assert.match(f, /if \(S\.res !== '1920x1080-vf'\) \{ cx\.fillStyle = CAM_VOID_COL/);
  assert.match(f, /drawExportTextOverlay\(cx, \['L_typhoon'\], W, H\)/);
});

test('트랙 없이 카메라 키만 있어도 재생·추출이 같은 판정을 쓴다', () => {
  for (const fn of ['bakeMp4', 'exportPngSeq', 'wnsRender']) assert.match(html.match(new RegExp(`async function ${fn}\\([\\s\\S]*?\\n\\}`))[0], /if \(!hasAnim\(\)\)/);
  assert.match(fnSrc('animPlay'), /if \(!hasAnim\(\)\)/);
});

test('분리 추출 장수 계산은 exportBlobs 규칙과 같다(산 표시 포함)', () => {
  const targets = html.match(/const EXPORT_TARGETS = \[[\s\S]*?\n\];/)[0];
  assert.match(targets, /key: 'mtn'/);
  const ctx = { S: { labels: [{ id: 1 }, { id: 2, off: 1 }, { id: 3 }], mtns: [{ id: 'm' }] }, typ: false };
  ctx.isTyphoon = () => ctx.typ;
  vm.createContext(ctx);
  vm.runInContext(targets.replace('const EXPORT_TARGETS', 'var EXPORT_TARGETS') + '\n' + fnSrc('exportCount'), ctx);
  assert.equal(ctx.exportCount('labels'), 2);
  assert.equal(ctx.exportCount('full'), 1);
  assert.equal(ctx.exportCount('typhoon'), 0);
  assert.equal(ctx.exportCount('mtn'), 1);
  ctx.typ = true;
  assert.equal(ctx.exportCount('mtn'), 0);
  assert.equal(ctx.exportCount('typhoon'), 1);
});
