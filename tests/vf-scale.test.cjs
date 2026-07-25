const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

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

test('VF panel clip scales with sea and background content', () => {
  const applyClip = html.match(/function applyVfClip\(\) \{[\s\S]*?\n\}/)?.[0] || '';
  assert.match(applyClip, /const scaleLayer = document\.getElementById\('L_vfScale'\)/);
  assert.match(applyClip, /scaleLayer\.setAttribute\('clip-path', 'url\(#vfClip\)'\)/);
  assert.match(applyClip, /wrap\.removeAttribute\('clip-path'\)/);
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

test('CG uses local SUITE weights while editor UI keeps Wanted Sans', () => {
  const weights = [
    ['300', 'Light'], ['400', 'Regular'], ['500', 'Medium'],
    ['600', 'SemiBold'], ['700', 'Bold'], ['800', 'ExtraBold'], ['900', 'Heavy'],
  ];
  for (const [weight, file] of weights) {
    assert.match(
      html,
      new RegExp(`@font-face\\s*\\{[^}]*font-family:\\s*['"]SUITE CG['"][^}]*font-weight:\\s*${weight}[^}]*FontNew/SUITE-${file}\\.otf`, 's'),
    );
  }
  const bodyRule = html.match(/^\s*body\s*\{[^}]*\}/m)?.[0] || '';
  assert.match(bodyRule, /font-family:\s*'Wanted Sans Variable'/);
  assert.match(html, /'font-family':\s*'"SUITE CG"/);
  assert.doesNotMatch(bodyRule, /font-family:\s*'SUITE CG'/);
});

test('a changed deployment default clears saved work and personal presets once', () => {
  const block = html.match(/const DEPLOY_DEFAULTS_KEY[\s\S]*?function preferUpdatedDeploymentDefaults\(\) \{[\s\S]*?\n\}/)?.[0] || '';
  const values = new Map([['wcg_work', 'old work'], ['wcg_presets', 'old presets']]);
  const context = {
    window: { WCG_DEFAULTS: { screen: { vfScale: 86 } } },
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    },
  };
  vm.runInNewContext(`const WORK_KEY = 'wcg_work';\n${block}\nthis.runSync = preferUpdatedDeploymentDefaults;`, context);
  assert.equal(context.runSync(), true);
  assert.equal(values.has('wcg_work'), false);
  assert.equal(values.has('wcg_presets'), false);
  values.set('wcg_work', 'new work');
  values.set('wcg_presets', 'new presets');
  assert.equal(context.runSync(), false);
  assert.equal(values.get('wcg_work'), 'new work');
  assert.equal(values.get('wcg_presets'), 'new presets');
  context.window.WCG_DEFAULTS.screen.vfScale = 83;
  assert.equal(context.runSync(), true);
  assert.equal(values.has('wcg_work'), false);
  assert.equal(values.has('wcg_presets'), false);
  assert.match(html, /preferUpdatedDeploymentDefaults\(\);\s*\nconst freshOpen/);
});
