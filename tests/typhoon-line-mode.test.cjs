const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

test('태풍 라인 모드 UI와 저장 가능한 스타일 값을 제공한다', () => {
  assert.match(html, /id="typTrackMode"/);
  assert.match(html, /data-tm="line"/);
  assert.match(html, /id="typLineWidth"/);
  assert.match(html, /id="typLineColor"/);
  assert.match(html, /trackMode: 'full', lineColor: '#E5231E', lineWidth: 9\.5/);
  assert.match(html, /iconMode: 'image', iconScale: 1\.75/);
  assert.match(html, /'trackMode', 'lineColor', 'lineWidth'/);
});

test('라인 모드는 현재 위치 이후 지점을 제외하고 현재에서 멈춘다', () => {
  assert.match(html, /T\.trackMode === 'line'/);
  assert.match(html, /p\.idx <= nowIdx/);
  assert.match(html, /Math\.min\(win\.hi, typhoonNowIdx\(pts\)\)/);
});

test('라인 모드는 선두 아이콘 하나와 조절 가능한 굵기의 선만 그린다', () => {
  assert.match(html, /stroke: T\.lineColor \|\| iconCol/);
  assert.match(html, /stroke-width': Math\.max\(1, \+T\.lineWidth \|\| 9\.5\)/);
  assert.match(html, /const tip = sp\[sp\.length - 1\]/);
  assert.match(html, /if \(lineMode\) \{ drawTyphoonPlaces\(L, LB\); return; \}/);
});

test('일반 모드 경로선에도 같은 굵기 설정을 적용한다', () => {
  assert.match(html, /const trackW = Math\.max\(1, \+T\.lineWidth \|\| 9\.5\)/);
  assert.match(html, /'stroke-width': trackW/);
  assert.match(html, /일반·라인 모드 모두/);
});
