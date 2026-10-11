// 렌더 결과 '폴더 열기' — 웹앱 쪽(js/cg-setup.js outReveal*·prepareOutput, js/export-dialog.js exRevealBtn): 저장 위치 기억·버튼 보이기 조건·
// 늦은 답 버리기·못 열면 거두기를 앱 코드 그대로(vm) 돌려 본다. 메인 쪽 경로 기록·허용 검사는 desktop/test/reveal.test.cjs,
// 실제 앱(진짜 폴더·파일 핸들로 렌더 → 버튼 → reveal IPC)은 WCG_BOOT_CHECK=1 일 때 desktop/test/reveal-flow-check.cjs.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const appSource = require('../tools/app-source.cjs');   // js/·css/로 나뉜 앱을 '한 파일' 텍스트로 합쳐 읽는다(MODULES.md)

const root = path.join(__dirname, '..');
const html = appSource(path.join(root, 'index.html')).replace(/\r\n/g, '\n');
const fnSrc = (name) => { const m = new RegExp(`\\n(?:async )?function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}`).exec(html); assert.ok(m, `function ${name} 없음`); return m[0]; };
const between = (a, b) => { const i = html.indexOf(a); assert.notEqual(i, -1, a + ' 없음'); const j = html.indexOf(b, i); assert.notEqual(j, -1, b + ' 없음'); return html.slice(i, j); };
const REVEAL_SRC = between("// ── 렌더 결과 '폴더 열기'(데스크톱, 2026-10-12) ──", 'async function outRevealClick()') + fnSrc('outRevealClick');
const J = (x) => JSON.parse(JSON.stringify(x));   // vm 안 객체(다른 realm) 비교용
const tick = (n = 3) => new Promise((r) => { let k = n; const f = () => (--k <= 0 ? r() : setImmediate(f)); setImmediate(f); });

// 가짜 데스크톱(preload) — savedPath는 단서를 기록하고 정해 둔 답을, revealPath는 정해 둔 결과를
function makeCtx(o = {}) {
  const log = { asks: [], reveals: [], status: [], downloads: [] };
  const btn = { hidden: true, title: '' };
  const desk = o.desk === null ? undefined : Object.assign({
    isDesktop: true,
    savedPath: async (h) => { log.asks.push(h); return typeof ctx.answer === 'function' ? ctx.answer(h) : ctx.answer; },
    revealPath: async (p) => { log.reveals.push(p); if (ctx.revealThrows) throw new Error('x'); return ctx.revealRes; },
  }, o.desk || {});
  const ctx = {
    console, Promise, Object, Array, String, Error, Blob: class { constructor(a, t) { this.a = a; this.t = t; } },
    answer: '', revealRes: { ok: true }, revealThrows: false,
    window: { wcgDesktop: desk, showSaveFilePicker: o.picker },
    $: (s) => (s === '#tlOpenDir' ? btn : null),
    status: (m, hold, tone) => log.status.push([m, tone || '']),
    getOutDir: async () => ctx.outDir || null,
    uniqueName: async (dir, base, ext) => base + '.' + ext,
    download: (blob, name) => log.downloads.push(name),
    setTimeout: (f, ms) => (ms === 3000 && ctx.fastTimeout ? setImmediate(f) : setTimeout(f, ms)),
  };
  vm.createContext(ctx);
  vm.runInContext(REVEAL_SRC + '\n' + fnSrc('prepareOutput') + '\n;this.__get = () => ({ last: _outLast, seq: _outSeq });', ctx);
  return { ctx, log, btn };
}
// 쓰기만 기록하는 가짜 폴더·저장창 핸들
const dirHandle = (name) => ({ name, getFileHandle: async () => ({ createWritable: async () => ({ write: async () => {}, close: async () => {} }) }) });
const fileHandle = (name) => ({ name, createWritable: async () => ({ write: async () => {}, close: async () => {} }) });

test('저장 폴더에 바로 쓰기 — 쓰고 나서 (파일 이름 + 폴더 이름)으로 경로를 묻고, 답이 오면 버튼을 띄운다', async () => {
  const { ctx, log, btn } = makeCtx();
  ctx.outDir = dirHandle('Upload'); ctx.answer = 'R:\\Upload\\1012.mp4';
  const out = await ctx.prepareOutput('1012', 'mp4', 'video/mp4', 'MP4 영상');
  assert.equal(out.name, '1012.mp4');
  assert.equal(btn.hidden, true, '쓰기 전엔 안 보임');
  assert.equal(log.asks.length, 0);
  await out.write(new Uint8Array(3));
  assert.deepEqual(J(log.asks), [{ name: '1012.mp4', dir: 'Upload' }]);
  assert.equal(btn.hidden, false, 'write가 끝날 때 이미 보임(렌더 끝 안내와 함께)');
  assert.equal(btn.title, '탐색기에서 열기 — R:\\Upload\\1012.mp4');
  assert.equal(ctx.__get().last.path, 'R:\\Upload\\1012.mp4');
});

test('저장창 — (고른 파일 이름)으로 묻는다 · 취소하면 지난 버튼은 그대로', async () => {
  const { ctx, log, btn } = makeCtx({ picker: async () => fileHandle('내 영상.mp4') });
  ctx.answer = 'C:\\Users\\me\\Videos\\내 영상.mp4';
  const out = await ctx.prepareOutput('1012', 'mp4', 'video/mp4', 'MP4 영상');
  await out.write(new Uint8Array(1));
  assert.deepEqual(J(log.asks), [{ name: '내 영상.mp4' }]);
  assert.equal(btn.hidden, false);
  // 다음 렌더에서 저장창을 취소 → null, 지난 버튼은 남는다(저장할 곳을 정하지 않았으니)
  ctx.window.showSaveFilePicker = async () => { const e = new Error('abort'); e.name = 'AbortError'; throw e; };
  assert.equal(await ctx.prepareOutput('1012', 'mp4', 'video/mp4', 'MP4 영상'), null);
  assert.equal(btn.hidden, false);
});

test('다음 렌더가 저장할 곳을 정하면 곧바로 숨김 — 그 렌더가 실패하면(안 씀) 버튼 없음', async () => {
  const { ctx, btn } = makeCtx();
  ctx.outDir = dirHandle('Upload'); ctx.answer = 'R:\\Upload\\1012.mp4';
  await (await ctx.prepareOutput('1012', 'mp4', 'video/mp4', 'MP4')).write(new Uint8Array(1));
  assert.equal(btn.hidden, false);
  const next = await ctx.prepareOutput('1012', 'mxf', 'application/octet-stream', 'MXF');
  assert.ok(next);
  assert.equal(btn.hidden, true, '저장할 곳을 정한 순간 숨김');
  assert.equal(ctx.__get().last, null);
});

test('경로를 모르면 버튼 없음 — 메인이 빈 답·오류·3초 넘게 답 없음(렌더 끝을 붙잡지 않는다)', async () => {
  for (const answer of ['', null, 5, () => { throw new Error('No handler registered'); }]) {
    const { ctx, btn } = makeCtx();
    ctx.outDir = dirHandle('Upload'); ctx.answer = answer;
    const out = await ctx.prepareOutput('1012', 'mp4', 'video/mp4', 'MP4');
    await out.write(new Uint8Array(1));   // 던지지 않는다
    assert.equal(btn.hidden, true, String(answer));
  }
  const { ctx, btn } = makeCtx();
  ctx.outDir = dirHandle('Upload'); ctx.answer = () => new Promise(() => {}); ctx.fastTimeout = true;
  const out = await ctx.prepareOutput('1012', 'mp4', 'video/mp4', 'MP4');
  await out.write(new Uint8Array(1));
  assert.equal(btn.hidden, true);
  assert.match(REVEAL_SRC, /setTimeout\(\(\) => r\(''\), 3000\)/);
});

test('웹판·옛 데스크톱(preload에 savedPath·revealPath 없음)은 묻지도 띄우지도 않는다', async () => {
  for (const desk of [null, { savedPath: undefined }, { revealPath: undefined }]) {
    const { ctx, log, btn } = makeCtx({ desk });
    ctx.outDir = dirHandle('Upload'); ctx.answer = 'R:\\Upload\\1012.mp4';
    assert.equal(ctx.outRevealOk(), false);
    await (await ctx.prepareOutput('1012', 'mp4', 'video/mp4', 'MP4')).write(new Uint8Array(1));
    assert.equal(btn.hidden, true);
    assert.equal(log.asks.length, 0);
  }
});

test('내려받기 — write는 기다리지 않고, 저장창에서 저장한 뒤 답이 오면 그때 띄운다 · 그새 다음 렌더면 버림', async () => {
  const { ctx, log, btn } = makeCtx({ picker: undefined });
  let release; ctx.answer = () => new Promise((r) => { release = r; });
  const out = await ctx.prepareOutput('1012', 'zip', 'application/zip', 'PNG 시퀀스(zip)');
  assert.equal(out.name, '1012.zip (다운로드 폴더)');
  await out.write(new Uint8Array(1));
  assert.deepEqual(log.downloads, ['1012.zip']);
  assert.equal(log.asks.length, 1);
  assert.equal(log.asks[0].name, '1012.zip'); assert.equal(log.asks[0].download, true); assert.equal(log.asks[0].waitMs, 15 * 60 * 1000);
  assert.equal(btn.hidden, true, '아직 저장 전');
  release('C:\\Users\\me\\Downloads\\1012.zip'); await tick();
  assert.equal(btn.hidden, false);
  // 늦은 답 — 다음 렌더가 이미 시작했으면 끼지 않는다
  const out2 = await ctx.prepareOutput('1013', 'zip', 'application/zip', 'z');
  await out2.write(new Uint8Array(1));
  const late = release;
  await ctx.prepareOutput('1014', 'zip', 'application/zip', 'z');   // 다음 렌더
  late('C:\\Users\\me\\Downloads\\1013.zip'); await tick();
  assert.equal(btn.hidden, true);
  assert.equal(ctx.__get().last, null);
});

test('누르기 — 열리면 상태 줄(초록), 없어졌으면(옮김·지움) 까닭(주황) + 버튼 거둠, 오류도 거둠', async () => {
  const { ctx, log, btn } = makeCtx();
  ctx.outDir = dirHandle('Upload'); ctx.answer = 'R:\\Upload\\1012.mp4';
  await (await ctx.prepareOutput('1012', 'mp4', 'video/mp4', 'MP4')).write(new Uint8Array(1));
  ctx.revealRes = { ok: true, path: 'R:\\Upload\\1012.mp4' };
  await ctx.outRevealClick();
  assert.deepEqual(log.reveals, ['R:\\Upload\\1012.mp4']);
  assert.equal(log.status.at(-1)[1], 'ok');
  assert.equal(btn.hidden, false, '열렸으면 그대로');
  ctx.revealRes = { ok: false, err: 'gone' };
  await ctx.outRevealClick();
  assert.match(log.status.at(-1)[0], /그 자리에 없어요/); assert.equal(log.status.at(-1)[1], 'warn');
  assert.equal(btn.hidden, true);
  // 오류(옛 메인 등)
  const b = makeCtx(); b.ctx.outDir = dirHandle('Upload'); b.ctx.answer = 'R:\\Upload\\1.mp4'; b.ctx.revealThrows = true;
  await (await b.ctx.prepareOutput('1', 'mp4', 'video/mp4', 'MP4')).write(new Uint8Array(1));
  await b.ctx.outRevealClick();
  assert.equal(b.btn.hidden, true); assert.equal(b.log.status.at(-1)[0], '폴더를 열지 못했어요');
  // 기억한 게 없으면 아무 일 없음
  const c = makeCtx(); await c.ctx.outRevealClick(); assert.equal(c.log.reveals.length, 0);
});

test('이미지로 렌더 — 바닥 요약의 [폴더 열기]: 경로를 알 때·굽는 중이 아닐 때만, 누르다 못 열면 거둔다', async () => {
  const made = [];
  const ctx = {
    _exReveal: '', _exBusy: false, synced: 0, opened: [], openOk: true,
    OUT_OPEN_ICON: '<svg></svg>',
    document: { createElement: (t) => { const e = { tag: t, type: '', className: '', title: '', innerHTML: '', onclick: null }; made.push(e); return e; } },
    outRevealOpen: async (p) => { ctx.opened.push(p); return ctx.openOk; },
    syncExport: () => { ctx.synced++; },
  };
  vm.createContext(ctx);
  vm.runInContext('var _exReveal = this._exReveal, _exBusy = this._exBusy;\n' + fnSrc('exRevealBtn') + '\nthis.set = (p, b) => { _exReveal = p; _exBusy = b; }; this.get = () => _exReveal;', ctx);
  const sum = () => ({ kids: [], append(...a) { this.kids.push(...a); } });
  let s = sum(); ctx.exRevealBtn(s); assert.equal(s.kids.length, 0, '경로 모름');
  ctx.set('D:\\CG\\20261012_날씨CG메이커\\전체 화면.png', true);
  s = sum(); ctx.exRevealBtn(s); assert.equal(s.kids.length, 0, '굽는 중');
  ctx.set('D:\\CG\\20261012_날씨CG메이커\\전체 화면.png', false);
  s = sum(); ctx.exRevealBtn(s);
  assert.equal(s.kids.length, 1);
  const b = s.kids[0];
  assert.equal(b.tag, 'button'); assert.equal(b.className, 'exSumOpen'); assert.equal(b.type, 'button');
  assert.equal(b.title, '탐색기에서 열기 — D:\\CG\\20261012_날씨CG메이커\\전체 화면.png');
  assert.match(b.innerHTML, /<span>폴더 열기<\/span>$/);
  await b.onclick();
  assert.deepEqual(ctx.opened, ['D:\\CG\\20261012_날씨CG메이커\\전체 화면.png']);
  assert.equal(ctx.get(), 'D:\\CG\\20261012_날씨CG메이커\\전체 화면.png', '열렸으면 그대로');
  assert.equal(ctx.synced, 0);
  ctx.openOk = false;
  await b.onclick();
  assert.equal(ctx.get(), '', '못 열면 거둠');
  assert.equal(ctx.synced, 1);
});

test('이미지로 렌더 배선 — 렌더를 시작하면 비우고, 첫 장(plan[0]) 경로를 (고른 폴더 이름 + 날짜 폴더)로 묻는다 · ZIP은 내려받기로(실패면 안 물음)', () => {
  const src = fnSrc('renderExport');
  assert.match(src, /_exStop = false; _exDone = null;\n\s+_exReveal = ''; const rvSeq = \+\+_exRevealSeq;/);
  assert.match(src, /if \(n > 0 && target\.hint && !\(target\.zip && err\)\) \{\n\s+const h = target\.hint\(plan\[0\]\.file\);/);
  assert.match(src, /outRevealFind\(h\)\.then\(\(p\) => \{ if \(p && rvSeq === _exRevealSeq\) \{ _exReveal = p; if \(exportIsOpen\(\) && !_exBusy\) syncExport\(\); \} return p; \}\);\n\s+if \(!h\.download\) await got;/);
  assert.ok(src.indexOf('outRevealFind(h)') < src.lastIndexOf('syncExport();'), '요약을 그리기 전에 묻는다(폴더에 바로 쓴 것은 요약과 함께 뜬다)');
  assert.match(fnSrc('exDirTarget'), /hint: \(file\) => \(\{ name: file, dir: rootName, sub: \[folder\] \}\),/);
  assert.match(fnSrc('exZipTarget'), /hint: \(\) => \(\{ name: `\$\{folder\}\.zip`, download: true \}\),/);
  assert.match(fnSrc('exSummaryDone'), /exRevealBtn\(sum\);\n\}$/);
  assert.match(fnSrc('syncExport'), /exRevealBtn\(sum\);\n\}$/, '고르기 상태(다시 연 팝업)에도 다음 렌더 전까지');
});

test('마크업·모양 — #tlInfo 바로 뒤 숨긴 버튼(글자 + SVG, 이모지 없음), [hidden]을 .tlBtn이 덮지 않게, wire()가 누름을 건다', () => {
  const i = html.indexOf('<span class="tlTime" id="tlInfo"></span>');
  const m = /<button id="tlOpenDir" class="tlBtn tlDirBtn tlOpenDir" hidden>(<svg [^]*?<\/svg>)<span>폴더 열기<\/span><\/button>/.exec(html.slice(i, i + 2000));
  assert.ok(m, '#tlInfo 뒤 #tlOpenDir');
  assert.doesNotMatch(m[0], /\p{Extended_Pictographic}/u);
  const css = fs.readFileSync(path.join(root, 'css', 'export-dialog.css'), 'utf8');
  assert.match(css, /\.tlOpenDir\[hidden\] \{ display: none; \}/);
  assert.match(css, /\.exSumOpen \{/);
  assert.match(html, /if \(\$\('#tlOpenDir'\)\) \$\('#tlOpenDir'\)\.onclick = outRevealClick;/);
  assert.match(REVEAL_SRC, /const OUT_OPEN_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true">/);
});
