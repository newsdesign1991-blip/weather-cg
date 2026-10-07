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

test('non-VF panel sync does not seed a 100 percent live VF scale', () => {
  const block = html.match(/function clampVfScale\([^]*?function vfScaleTransform\(/)?.[0]
    ?.replace(/function vfScaleTransform\($/, '') || '';
  const context = {
    S: { res: '1920x1080', style: 'sgg', vfScale: 100, vfScales: {} },
    layoutGroup: (style) => style === 'warnsea' ? 'warnsea' : 'common',
    isTyphoon: () => false,
  };
  vm.runInNewContext(`${block}\nthis.panelScale = vfScaleForPanel;`, context);

  assert.equal(context.panelScale(), 100);
  assert.deepEqual(context.S.vfScales, {});

  context.S.style = 'warnsea';
  assert.equal(context.panelScale(), 100);
  assert.deepEqual(context.S.vfScales, {});
});

test('preset application seeds VF scale only after entering VF', () => {
  const block = html.match(/function clampVfScale\([^]*?function vfScaleTransform\(/)?.[0]
    ?.replace(/function vfScaleTransform\($/, '') || '';
  const context = {
    S: { res: '1920x1080', style: 'sgg', vfScale: 100, vfScales: {} },
    layoutGroup: (style) => style === 'warnsea' ? 'warnsea' : 'common',
    isTyphoon: () => false,
  };
  vm.runInNewContext(`${block}\nthis.applyScale = applyPresetVfScale;`, context);

  context.applyScale({ vfScale: 86 });
  assert.deepEqual(context.S.vfScales, {});

  context.S.res = '1920x1080-vf';
  context.applyScale({ vfScale: 86 });
  assert.equal(context.S.vfScales.common, 86);

  context.S.style = 'warnsea';
  context.applyScale({ vfScale: 83 });
  assert.equal(context.S.vfScales.warnsea, 83);

  context.S.style = 'sgg';
  context.applyScale({ vfScale: 86 }, 92);
  assert.equal(context.S.vfScales.common, 92);
});

test('typhoon VF scale is stored apart from common and warnsea groups', () => {
  const block = html.match(/function clampVfScale\([^]*?function vfScaleTransform\(/)?.[0]
    ?.replace(/function vfScaleTransform\($/, '') || '';
  let typhoon = false;
  const context = {
    S: { res: '1920x1080-vf', style: 'sgg', vfScale: 100, vfScales: { common: 86, warnsea: 83 } },
    layoutGroup: (style) => style === 'warnsea' ? 'warnsea' : 'common',
    isTyphoon: () => typhoon,
  };
  vm.runInNewContext(`${block}\nthis.applyScale = applyPresetVfScale;\nthis.scaleValue = vfScaleValue;`, context);

  typhoon = true;
  context.applyScale({ vfScale: 90 });
  assert.equal(context.S.vfScales.typhoon, 90);
  assert.equal(context.S.vfScales.common, 86);
  assert.equal(context.S.vfScales.warnsea, 83);

  typhoon = false;
  assert.equal(context.scaleValue(), 86);
  typhoon = true;
  assert.equal(context.scaleValue(), 90);
});

test('baking normalizes VF scale and AE uses scale-aware coordinates', () => {
  assert.match(html, /function normalizeBakedVfScales\(/);
  assert.match(html, /function vfScaledPoint\(/);
  assert.match(html, /function vfScaledSize\(/);
  assert.match(html, /vfEnter:[\s\S]*dx:\s*vfEnterDist\(\)\s*\*\s*vfScaleValue\(\)\s*\/\s*100/);
});

test('CG uses local SUITE weights while editor UI uses Pretendard', () => {
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
  assert.match(bodyRule, /font-family:\s*var\(--ui-font\)/);
  assert.match(html, /--ui-font:\s*'Pretendard Variable', Pretendard, 'Segoe UI', 'Malgun Gothic'/);
  // Pretendard는 앱에 내장(CDN 안 씀) — 파일과 @font-face가 있어야 한다
  assert.match(html, /@font-face\s*\{[^}]*font-family:\s*'Pretendard Variable'[^}]*FontNew\/PretendardVariable\.woff2/);
  assert.doesNotMatch(html, /cdn\.jsdelivr\.net\/gh\/orioncactus\/pretendard/);
  assert.ok(fs.statSync('FontNew/PretendardVariable.woff2').size > 1e6);
  // UI 쪽에 Wanted Sans 직접 지정이 남지 않게(비교 이름표 CG 글꼴 선택지 CMP_FONTS는 예외)
  assert.doesNotMatch(html.replace(/const CMP_FONTS = [^\n]*/, ''), /font(-family)?:[^;}\n]*'Wanted Sans Variable'/);
  assert.match(html, /'font-family':\s*'"SUITE CG"/);
  assert.doesNotMatch(bodyRule, /font-family:\s*'SUITE CG'/);
});

// 배포 기본값이 바뀌어도 저장된 작업·배치를 지우지 않는다(강제 초기화는 작업 손실·옛 배치 부활 원인이라 제거됨).
test('deployment default change only records its signature and keeps saved work', () => {
  const block = html.match(/const DEPLOY_DEFAULTS_KEY[\s\S]*?function preferUpdatedDeploymentDefaults\(\) \{[\s\S]*?\n\}/)?.[0] || '';
  const SIG = 'wcg_deployment_defaults_signature';
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
  assert.equal(context.runSync(), false);
  assert.equal(values.get('wcg_work'), 'old work');
  assert.equal(values.get('wcg_presets'), 'old presets');
  const firstSig = values.get(SIG);
  assert.equal(typeof firstSig, 'string');
  assert.ok(firstSig.length > 0, 'signature must be recorded');

  values.set('wcg_work', 'new work');
  values.set('wcg_presets', 'new presets');
  assert.equal(context.runSync(), false);
  assert.equal(values.get(SIG), firstSig);

  context.window.WCG_DEFAULTS.screen.vfScale = 83;
  assert.equal(context.runSync(), false);
  assert.equal(values.get('wcg_work'), 'new work');
  assert.equal(values.get('wcg_presets'), 'new presets');
  assert.notEqual(values.get(SIG), firstSig, 'signature must follow the new defaults');

  // 배포 기본값이 비어 있으면 서명도 쓰지 않음
  values.delete(SIG);
  context.window.WCG_DEFAULTS = {};
  assert.equal(context.runSync(), false);
  assert.equal(values.has(SIG), false);
  assert.match(html, /\npreferUpdatedDeploymentDefaults\(\);[\s\S]{0,800}?\nconst freshOpen/);   // 부팅 때 작업을 열기 전에 한 번
});

test('legacy passive 100 percent VF scales are removed from autosaved work once', () => {
  const block = html.match(/const VF_SCALE_MIGRATION_KEY[\s\S]*?function migrateLegacyVfScaleState\(\) \{[\s\S]*?\n\}/)?.[0] || '';
  const values = new Map([[
    'wcg_work',
    JSON.stringify({
      map: { x: 1, y: 2, s: 1 },
      vfScale: 100,
      vfScales: { common: 100, warnsea: 83 },
      texts: [{ id: 'keep-me' }],
    }),
  ]]);
  const context = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    },
  };
  vm.runInNewContext(`const WORK_KEY = 'wcg_work';\n${block}\nthis.runMigration = migrateLegacyVfScaleState;`, context);

  assert.equal(context.runMigration(), true);
  const migrated = JSON.parse(values.get('wcg_work'));
  assert.equal('common' in migrated.vfScales, false);
  assert.equal(migrated.vfScales.warnsea, 83);
  assert.equal(migrated.texts[0].id, 'keep-me');
  assert.equal(context.runMigration(), false);
});

test('legacy autosave already on VF resumes with its deployment default scale', () => {
  const block = html.match(/const VF_SCALE_MIGRATION_KEY[\s\S]*?function migrateLegacyVfScaleState\(\) \{[\s\S]*?\n\}/)?.[0] || '';
  const values = new Map([[
    'wcg_work',
    JSON.stringify({
      res: '1920x1080-vf',
      style: 'warnsea',
      cgLight: 0,
      map: { x: 1, y: 2, s: 1 },
      vfScale: 100,
      vfScales: { warnsea: 100 },
    }),
  ]]);
  const context = {
    window: {
      WCG_DEFAULTS: {
        '1920x1080-vf|common|D': { vfScale: 86 },
        '1920x1080-vf|warnsea|D': { vfScale: 83 },
      },
    },
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    },
  };
  vm.runInNewContext(`const WORK_KEY = 'wcg_work';\n${block}\nthis.runMigration = migrateLegacyVfScaleState;`, context);

  assert.equal(context.runMigration(), true);
  const migrated = JSON.parse(values.get('wcg_work'));
  assert.deepEqual(migrated.vfScales, {});
  assert.equal(migrated.vfScale, 83);
});

test('output and map cards require an explicit apply action', () => {
  assert.match(html, /id="resApply"[^>]*disabled/);
  assert.match(html, /id="styleApply"[^>]*disabled/);
  assert.match(html, /let pendingRes = null,\s*pendingStyle = null/);
  const buildRes = html.match(/function buildResBtns\(\) \{[\s\S]*?\n\}/)?.[0] || '';
  const buildStyle = html.match(/function buildStyleBtns\(\) \{[\s\S]*?\n\}/)?.[0] || '';
  const resClick = buildRes.match(/b\.onclick = \(\) => \{[\s\S]*?\n\s*\};/)?.[0] || '';
  const styleClick = buildStyle.match(/b\.onclick = \(\) => \{[\s\S]*?\n\s*\};/)?.[0] || '';
  assert.match(resClick, /pendingRes = k/);
  assert.doesNotMatch(resClick, /S\.res\s*=\s*k/);
  assert.match(styleClick, /pendingStyle = k/);
  assert.doesNotMatch(styleClick, /setStyle\(k\)/);
  assert.match(html, /function applyPendingRes\(\)/);
  assert.match(html, /function applyPendingStyle\(\)/);
  assert.match(html, /applyPendingRes[\s\S]*markStartStep\('res'\)[\s\S]*_closeMenu/);
  assert.match(html, /applyPendingStyle[\s\S]*markStartStep\('style'\)[\s\S]*_closeMenu/);
});

test('enabled apply buttons keep a high-contrast blue hover state', () => {
  assert.match(
    html,
    /\.applyChoice:not\(:disabled\):hover\s*\{[^}]*background:\s*var\(--accent-grad,\s*var\(--primary\)\)[^}]*color:\s*var\(--on-primary\)/,
  );
});
