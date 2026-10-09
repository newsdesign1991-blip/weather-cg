const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const appSource = require('../tools/app-source.cjs');   // js/·css/로 나뉜 앱을 '한 파일' 텍스트로 합쳐 읽는다(MODULES.md)
const path = require('node:path');
const vm = require('node:vm');

const html = appSource(path.join(__dirname, '..', 'index.html'));

test('미래 점선은 현재 지점부터 시작하고 날짜 범위 밖과 과거 지점을 제외한다', () => {
  const src = html.match(/function typhoonForecastLinePts\(pts\) \{[\s\S]*?\n\}/)[0];
  const sandbox = { typhoonNowIdx: () => 2, typhoonIdxInRange: (_, i) => i < 4, typhoonXY: (x, y) => [x * 2, y * 3] };
  vm.createContext(sandbox); vm.runInContext(src, sandbox);
  const pts = Array.from({ length: 5 }, (_, i) => ({ lon: i, lat: i + 1 }));
  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.typhoonForecastLinePts(pts))), [{ x: 4, y: 9, idx: 2 }, { x: 6, y: 12, idx: 3 }]);
  assert.equal(sandbox.typhoonForecastLinePts([]).length, 0);
  assert.equal(sandbox.typhoonForecastLinePts(pts.slice(0, 3)).length, 1);
});

test('태풍 라인 모드 UI와 저장 가능한 스타일 값을 제공한다', () => {
  assert.match(html, /id="typTrackMode"/);
  assert.match(html, /data-tm="line"/);
  assert.match(html, /id="typLineWidth"/);
  assert.match(html, /id="typLineColor"/);
  assert.match(html, /trackMode: 'full', lineColor: '#E5231E', lineWidth: 5/);
  assert.match(html, /iconMode: 'image', iconScale: 1\.25/);
  assert.match(html, /'trackMode', 'lineColor', 'lineWidth'/);
});

test('라인 모드의 이동 아이콘과 실선은 현재 위치에서 멈추고 미래는 별도 점선으로 표시한다', () => {
  assert.match(html, /T\.trackMode === 'line'/);
  assert.match(html, /p\.idx <= nowIdx/);
  assert.match(html, /Math\.min\(win\.hi, typhoonNowIdx\(pts\)\)/);
  assert.match(html, /const forecast = typhoonForecastLinePts\(pts\)/);
  assert.match(html, /'data-typ-line-forecast': '1'[^\n]*'stroke-dasharray'/);
  assert.match(html, /lineMode && ch.hasAttribute\('data-typ-line-forecast'\)/);
});

test('라인 모드는 선두 아이콘 하나와 조절 가능한 굵기의 실선·점선을 그린다', () => {
  assert.match(html, /stroke: T\.lineColor \|\| iconCol/);
  assert.match(html, /stroke-width': Math\.max\(1, \+T\.lineWidth \|\| 5\)/);
  assert.match(html, /const tip = sp\[sp\.length - 1\]/);
  assert.match(html, /if \(lineMode\) \{ drawTyphoonPlaces\(L, LB\); return; \}/);
});

test('일반 모드 경로선에도 같은 굵기 설정을 적용한다', () => {
  assert.match(html, /const trackW = Math\.max\(1, \+T\.lineWidth \|\| 5\)/);
  assert.match(html, /const pastTrackW = Math\.max\(1\.5, trackW \* 0\.55\)/);
  assert.match(html, /'stroke-width': trackW/);
  assert.match(html, /일반·라인 모드 모두/);
});

test('일반 모드의 과거 아이콘은 현재와 예상 아이콘보다 훨씬 작다', () => {
  assert.match(html, /past \? baseR \* 0\.3 : baseR/);
});
