const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('index.html', 'utf8');

test('VF output has a nested persistent scale group and editor-only controls', () => {
  assert.match(html, /id="L_vfWrap"[\s\S]*id="L_vfScale"[\s\S]*id="L_bg"/);
  assert.match(html, /id="vfScaleBounds"/);
  assert.match(html, /id="vfScaleGrip"/);
});

test('VF scale contract clamps to 50..150 percent around the panel top-right', () => {
  assert.match(html, /function clampVfScale\([^)]*\)[\s\S]*Math\.max\(50,[\s\S]*Math\.min\(150/);
  assert.match(html, /function vfScaleTransform\([^)]*\)[\s\S]*r\.x \+ r\.w/);
  assert.match(html, /function startVfScaleResize\(/);
});

test('VF scale has a 50..150 sidebar control', () => {
  assert.match(html, /id="vfScale"[^>]*min="50"[^>]*max="150"[^>]*step="1"/);
  assert.match(html, /id="vfScaleV"/);
});

test('vfScale participates in preset save and light-dark peer sharing', () => {
  assert.match(html, /const PRESET_KEYS = \[[\s\S]*'vfScale'/);
  assert.match(html, /if \(S\.res !== '1920x1080-vf'\) delete p\.vfScale/);
  assert.match(html, /target\.vfScale\s*=\s*clampVfScale\(p\.vfScale\)/);
});

test('live VF scale keeps separate common and warnsea values across mode switches', () => {
  assert.match(html, /vfScales:\s*\{\}/);
  assert.match(html, /function vfScaleGroup\(/);
  assert.match(html, /function setVfScale\(/);
  assert.match(html, /S\.vfScales\[vfScaleGroup\(\)\]/);
});

test('baking normalizes VF scale and AE uses scale-aware coordinates', () => {
  assert.match(html, /function normalizeBakedVfScales\(/);
  assert.match(html, /function vfScaledPoint\(/);
  assert.match(html, /function vfScaledSize\(/);
  assert.match(html, /vfEnter:[\s\S]*dx:\s*vfEnterDist\(\)\s*\*\s*vfScaleValue\(\)\s*\/\s*100/);
});
