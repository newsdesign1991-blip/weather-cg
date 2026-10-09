const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const appSource = require('../tools/app-source.cjs');   // js/·css/로 나뉜 앱을 '한 파일' 텍스트로 합쳐 읽는다(MODULES.md)
const path = require('node:path');
const vm = require('node:vm');

const html = appSource(path.join(__dirname, '..', 'index.html'));

test('라인 모드도 일반 모드처럼 — 애니 구간은 예상 끝까지(현재에서 멈추지 않음), 진행 폭 최소 1', () => {
  const src = ['typhoonRangeWindow', 'typhoonAnimWindow', 'typhoonAnimSpan'].map((n) => html.match(new RegExp(`function ${n}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}|function ${n}\\([^)]*\\) \\{[^\\n]*\\}`))[0]).join('\n');
  assert.match(src, /function typhoonAnimWindow\(pts\) \{ return typhoonRangeWindow\(pts\); \}/);
  assert.match(src, /function typhoonAnimSpan\(lo, hi\) \{ return Math\.max\(1, hi - lo\); \}/);
  assert.doesNotMatch(html, /typhoonForecastLinePts/, '예상 점선을 진행과 상관없이 미리 그리던 함수는 없앴다');
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

test('라인 모드: 지난 길(현재까지) 실선 → 현재부터 점선이 같은 진행(sp)으로 이어서 자란다', () => {
  const fn = html.match(/function drawTyphoonTrack\(L, pts\) \{[\s\S]*?\n\}/)[0];
  assert.match(fn, /T\.trackMode === 'line'/);
  assert.doesNotMatch(fn, /if \(lineMode\) sp = sp\.filter/, '선두·실선을 현재까지로 자르지 않는다');
  assert.match(fn, /const pastLine = sp\.filter\(\(p\) => p\.idx <= nowIdx\), futLine = sp\.filter\(\(p\) => p\.idx >= nowIdx\);/);
  assert.match(fn, /'data-typ-line-forecast': '1', d: 'M' \+ futLine\.map[^\n]*'stroke-dasharray'/);
  assert.match(html, /lineMode && ch.hasAttribute\('data-typ-line-forecast'\)/);
});

test('라인 모드는 선두 아이콘 하나와 조절 가능한 굵기의 실선·점선을 그린다', () => {
  assert.match(html, /lineCol = T\.lineColor \|\| iconCol, lw = Math\.max\(1, \+T\.lineWidth \|\| 5\)/);
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
