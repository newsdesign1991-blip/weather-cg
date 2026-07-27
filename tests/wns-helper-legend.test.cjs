const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const helperPath = path.join(root, 'tools', 'wns-helper', 'helper.py');
const helper = fs.readFileSync(helperPath, 'utf8');

test('WNS helper declares editable legend precomp support', () => {
  assert.match(helper, /legendComp/);
  assert.match(helper, /ADBE Vector Shape - Rect/);
  assert.match(helper, /ADBE Vector Graphic - Fill/);
  assert.match(helper, /sourceRectAtTime/);
});

test('WNS helper generates a shape and text layer for every legend item', () => {
  assert.match(helper, /for ji, item in enumerate\(lg\.get\("items", \[\]\)\)/);
  assert.match(helper, /nm \+ "_네모"/);
  assert.match(helper, /nm \+ "_글자"/);
  assert.match(helper, /tl\.property\("Anchor Point"\)\.setValue\(\[r\.left,r\.top\+r\.height\/2\]\)/);
  assert.match(helper, /float\(lg\.get\("x", 0\)\).*float\(lg\.get\("y", 0\)\)/s);
});

test('WNS helper uses the same SUITE CG font family as the web output', () => {
  assert.match(helper, /def suite_ps\(w\):/);
  assert.match(helper, /return "SUITE-" \+ best\[1\]/);
  assert.match(helper, /ensure_suite_fonts/);
});
