const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const appSource = require('../tools/app-source.cjs');   // js/·css/로 나뉜 앱을 '한 파일' 텍스트로 합쳐 읽는다(MODULES.md)

const html = appSource(path.join(__dirname, '..', 'index.html'));
const fn = (name) => html.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}`))?.[0] || '';

test('export clones strip brush selection highlight through one shared helper', () => {
  assert.match(fn('stripExportUi'), /\.brushSelHi/);
  for (const name of ['svgToImage', 'svgBlob', 'previewPng']) assert.match(fn(name), /stripExportUi\(clone\)/, name);
});

test('map style change clears inset brush highlights and redraws brush strokes', () => {
  assert.match(fn('buildZones'), /querySelectorAll\('\.zone, \.brushSelHi'\)/);
  assert.match(fn('setStyle'), /renderFills\(\);\s*\r?\n\s*renderBrush\(\);/);
});

test('brush runs become stacked images in paint order', () => {
  // 색 런마다 이미지 하나(칠한 순서대로 쌓기) — 런 계산은 brushApply(앞 런 파내기), 이미지 반영은 brushSyncImgs
  assert.match(fn('renderBrush'), /brushReconcile\(st, strokes\)/);
  assert.match(fn('brushApply'), /destination-out/);
  assert.match(fn('brushSyncImgs'), /'data-run'/);
  assert.match(fn('brushSyncImgs'), /parent\.insertBefore\(img, anchor\)/);
});

test('ramp swap recolors brush strokes and animation track keys', () => {
  const sr = fn('swapRamp');
  assert.match(sr, /brushStrokes\(\)/);
  assert.match(sr, /tr\.kind === 'fill' \|\| tr\.kind === 'brush'/);
  assert.match(sr, /renderBrush\(\)/);
});

test('Seoul paint overlay follows animation frames and blind base', () => {
  assert.match(fn('renderAnimFrameBody'), /#seoulPaintTop/);   // renderAnimFrame은 본문(renderAnimFrameBody) 뒤 틸트만 굽는다
  assert.match(fn('ensureBlind'), /data-role="seoulPaintTop"/);
  assert.match(html, /id="seoulPaintTop" data-role="seoulPaintTop"/);
  assert.match(fn('syncSeoulPaintTop'), /#L_brush/);
});

test('Seoul paint overlay follows layer-split zone fills in image/AE exports', () => {
  const sx = fn('syncSeoulExport');
  assert.match(sx, /#seoulPaintTop/);
  assert.match(sx, /p\.remove\(\)/);
  assert.match(sx, /#seoulRiver/);
  assert.match(fn('svgBlob'), /mutate\(clone\);\s*\r?\n\s*syncSeoulExport\(clone\);/);
});

test('missing map styles fall back instead of crashing', () => {
  assert.match(html, /const normStyle = \(\) => \{ if \(!MAP\.styles\[S\.style\]\) S\.style = 'sgg'; \};/);
  assert.match(fn('renderInsets'), /curStyle\(\)\.noInsets/);
  assert.match(fn('renderSea'), /curStyle\(\)\.sea/);
  assert.match(fn('applyState'), /normStyle\(\)/);
  assert.match(fn('loadProjectData'), /normStyle\(\)/);
  assert.match(html, /S = work;\s*\r?\n\s*normStyle\(\);/);
});

test('brush space ignores hidden inset boxes and undo refreshes resolution UI', () => {
  assert.match(fn('brushSpaceAt'), /curStyle\(\)\.noInsets\) return 'main'/);
  const as = fn('applyState');
  assert.match(as, /buildBgBtns\(\)/);
  assert.match(as, /resChanged[\s\S]*updateFrameGuideLabel\(\)/);
});

test('numeric map scale refreshes boundary stroke widths', () => {
  assert.match(fn('wireMapPos'), /renderMapTransform\(\); renderStrokeScale\(\);/);
  assert.match(fn('renderStrokeScale'), /S\.strokeW \/ \(sc \|\| 1\)/);
});
