// 불러와 칠할 때 작업창 물결(js/map-drop.js — Graph CG NameDrop 셰이더, 10-27): 쓰는 곳 배선·누른 버튼 쪽에서 시작·바뀐 것 없으면 안 함·웹판은 칠만·메인 찍기 처리기
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8').replace(/\r\n/g, '\n');
const src = read('js/map-drop.js');

test('불러오기 끝(특보·생활기상·미세먼지 농도·예보)은 칠하기 직전에 찍고(누른 버튼과 함께), 칠한 직후 같은 작업 안에서 물결', () => {
  const dl = read('js/data-load.js');
  const shots = [...dl.matchAll(/const shot = await mapDropShot\('(#\w+)'\);[^\n]*\n\s+if \(stale\(\)\) return null;\n\s+if \(S\.style !== st\) \{ showDataResult\(st, \{ kind: 'moved' \}\)/g)].map((m) => m[1]);
  assert.deepEqual(shots, ['#lifeFetch', '#dustFetch', '#dfcFetch']);
  assert.equal((dl.match(/dataAfterPaint\(st\);\n\s+mapDropGo\(shot\);\n\s+ok = true;/g) || []).length, 3);
  const wl = read('js/warnings-load.js');
  assert.match(wl, /const shot = await mapDropShot\('#wrnFetch'\);[^\n]*\n\s+if \(stale\(\)\) return \(ok = null\);/);
  assert.match(wl, /ok = applyWrn\(t, keepSel, 'fetch', extra\);\n\s+mapDropGo\(shot\);/);
  const w = read('js/wiring.js');
  for (const re of [/#wrnApply'\)\.onclick = \(\) => mapDrop\(\(\) => applyWrn\(\$\('#wrnPaste'\)\.value, null, 'paste'\), '#wrnApply'\);/,
    /#fctApply'\)\.onclick = \(\) => mapDrop\(\(\) => applyFct\(\$\('#fctPaste'\)\.value\), '#fctApply'\);/,
    /#bulApply'\)\.onclick = \(\) => mapDrop\(\(\) => applyBulletin\(\$\('#bulPaste'\)\.value\), '#bulApply'\);/,
    /#bulPaintPick'\)\.onclick = \(\) => mapDrop\(bulPaintPick, '#bulPaintPick'\);/]) assert.match(w, re);
});

test('찍기 못 하면(웹판) 칠만, 바뀐 것 없거나 작업창 자리가 바뀌면 덮개 안 깖', async () => {
  const added = [];
  const ctx = { window: {}, document: { hidden: false, body: { appendChild: (e) => added.push(e) }, createElement: () => ({ style: {}, setAttribute() {}, remove() {} }) },
    $: () => null, fxReduced: () => false, animPlaying: false, _exportingFrames: false, _workRev: 1, console };
  vm.createContext(ctx);
  vm.runInContext(src + '\nthis.api = { mapDrop, mapDropGo, mapDropShot };', ctx);
  assert.equal(await ctx.api.mapDropShot('#x'), null, 'wcgDesktop.capture 없음 = null');
  assert.equal(await ctx.api.mapDrop(() => 42, '#x'), 42, 'fn 반환값 그대로');
  assert.equal(ctx.api.mapDropGo(null), false);
  assert.equal(ctx.api.mapDropGo({ rev: 1, key: '' }), false, '_workRev 그대로 = 칠한 것 없음');
  assert.equal(ctx.api.mapDropGo({ rev: 0, key: '0,0,10,10' }), false, '작업창 자리를 못 찾으면 안 함');
  assert.equal(added.length, 0);
});

test('물결은 누른 버튼 쪽 가장자리에서 — 사이드바 버튼이면 왼쪽(버튼 높이), 멀리서 닿으면 고리가 구석까지 가게 길어짐', () => {
  const ctx = { $: () => null, Math };
  vm.createContext(ctx);
  vm.runInContext(src + '\nthis.api = { mdOrigin, mdEndFor, MD_END };', ctx);
  const r = { x: 460, y: 250, w: 870, h: 490 };
  const btn = (x, y) => ({ getBoundingClientRect: () => ({ left: x - 10, right: x + 10, top: y - 5, bottom: y + 5, width: 20 }) });
  const L = ctx.api.mdOrigin(btn(240, 380), r);   // 왼쪽 사이드바, 작업창 위쪽 1/4쯤
  assert.equal(L.o[0], 0.04); assert.ok(L.o[1] > 0.7 && L.o[1] < 0.8, '왼쪽 약간 위'); assert.deepEqual(Array.from(L.n), [1, 0]);
  const R = ctx.api.mdOrigin(btn(1700, 500), r);   // 오른쪽에 붙인 사이드바
  assert.equal(R.o[0], 0.96); assert.deepEqual(Array.from(R.n), [-1, 0]);
  assert.deepEqual(Array.from(ctx.api.mdOrigin(null, r).o), [0.5, 0.96], '버튼·사이드바 없으면 원본 그대로 위 가운데');
  assert.equal(ctx.api.mdEndFor([0.5, 0.96], 16 / 9), ctx.api.MD_END, '위 가운데 = 원본 길이');
  assert.ok(ctx.api.mdEndFor([0.04, 0.04], 16 / 9) > ctx.api.MD_END, '구석에서 닿으면 더 길게');
  assert.match(src, /function mdBounce\(stage, og, r\)/);
  assert.match(src, /mdBounce\(stage, og, r\); return d\.play\(\);/, '튕김은 고리가 퍼지기 시작할 때');
});

test('메인 찍기 처리기는 메인 창 주 프레임만, 사각형은 정수·최소 크기, 너무 크면 줄임', () => {
  const m = read('desktop/main.js');
  const h = m.slice(m.indexOf("ipcMain.handle('wcg:capture'"), m.indexOf('\n});', m.indexOf("ipcMain.handle('wcg:capture'")));
  assert.match(h, /if \(!jtwcCallerOk\(e\) \|\| win\.isMinimized\(\)\) return null;/);
  assert.match(h, /capturePage\(rect\)/);
  assert.match(h, /MAX = 4e6/);
  assert.match(read('desktop/preload.js'), /capture: \(r\) => ipcRenderer\.invoke\('wcg:capture', \{ x: /);
});
