// 렌더 취소(사용자 10-12: MP4·MXF 렌더를 중간에 멈추고 싶다) — 가리개의 [렌더 취소]·Esc → exportCancelReq() → 렌더 루프가 멈춘다.
// 가짜 환경(캔버스·인코더·헬퍼·워커)에서 실제 앱 함수를 돌린다: 취소 신호(js/modals-notices.js), 세 렌더 루프와 렌더 전 미리 받기(js/export-video.js),
// 저장 대상 버리기(js/cg-setup.js prepareOutput). 실제 앱(숨김 Electron)으로 짧은 MP4·MXF를 렌더하다 누르는 점검은 WCG_BOOT_CHECK=1 일 때만.
// 헬퍼 쪽(/api/cancel)은 desktop/test/server-cancel.test.cjs.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const appSource = require('../tools/app-source.cjs');

const root = path.join(__dirname, '..');
const html = appSource(path.join(root, 'index.html'));
const fn = (name) => { const m = new RegExp(`(?:async )?function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}`).exec(html); assert.ok(m, name); return m[0]; };
const between = (a, b) => { const i = html.indexOf(a); assert.ok(i >= 0, a); const j = html.indexOf(b, i); assert.ok(j > i, b); return html.slice(i, j); };
// 취소 신호 묶음(js/modals-notices.js) — exportEscOwner(창·글자 칸 판정) 앞까지. 판정은 시험이 바꿔 끼운다(__owner)
const CANCEL_SRC = between('let _exportCancel = false', '// Esc를 먼저 받을 것이 있나');
const tick = () => new Promise((r) => setTimeout(r, 0));

// 가짜 환경 + 실제 함수. hook(i) = i번째(1부터) 프레임을 그릴 때 부른다 — 거기서 취소를 누른다(렌더 중 클릭 흉내)
function makeCtx(o = {}) {
  const log = { status: [], drawn: [], writes: 0, discards: 0, animOff: 0, fxOff: 0, fetches: [], zips: 0, encs: [], workers: [], posted: [], btnDisabled: [] };
  const el = () => ({ disabled: false, textContent: '' });
  const els = { '#tlInfo': el(), '#tlBake': el(), '#tlExportPng': el(), '#wnsMxf': el(), '#wnsMov': el() };
  const maskBtn = { disabled: false, textContent: '렌더 취소' };
  const canvas = {
    width: 0, height: 0,
    getContext: () => ({ getImageData: () => ({ data: { buffer: new ArrayBuffer(4) } }), putImageData() {} }),
    toBlob: (cb) => cb(new Blob(['png'])),
  };
  const out = { name: 'o.out', write: async () => { log.writes++; }, discard: async () => { log.discards++; } };
  class VideoEncoder {
    constructor(h) { this.h = h; this.state = 'unconfigured'; this.encodeQueueSize = 0; this.encoded = 0; this.closed = 0; log.encs.push(this); }
    configure() { this.state = 'configured'; }
    encode() { this.encoded++; this.h.output({ byteLength: 4, copyTo: (b) => b.set([0, 0, 0, 1]), type: 'key' }, { decoderConfig: { description: new Uint8Array([1, 2, 3]) } }); }
    async flush() {}
    close() { this.state = 'closed'; this.closed++; }
  }
  const ctx = {
    console, Math, JSON, Promise, Error, Array, Object, String, Number, Uint8Array, Uint32Array, Uint8ClampedArray, ArrayBuffer, Blob, DataView,
    setTimeout, clearTimeout, AbortController: o.noAbort ? undefined : AbortController, performance: { now: () => 0 },
    S: { res: '1920x1080' }, RES: { '1920x1080': { size: [16, 9] } }, WNS_HELPER: 'http://h',
    anim: () => ({ dur: o.dur || 1, fps: o.fps || 10 }), hasAnim: () => true, dateTag: () => '1012',
    animStop() {}, flashDone() {}, fxArrive() {}, tlRefreshPreview() {}, wnsHelperOffNotice() {},
    fxBusy: (fx, on) => { if (!on) log.fxOff++; },
    $: (s) => els[s] || null,
    document: { createElement: () => canvas, querySelector: (s) => (s === '#exportMask .emCancel' ? maskBtn : null) },
    status: (m) => log.status.push(m),
    exportProgress() {}, showExportMask() {},
    prefetchRenderTiles: o.prefetch || (async () => {}),
    drawExportFrame: async () => { await tick(); },
    renderAnimFrame: (t) => { log.drawn.push(t); if (o.hook) o.hook(log.drawn.length, ctx); },
    prepareOutput: async () => out,
    blobBytes: async () => new Uint8Array(1),
    zipStore: () => { log.zips++; return new Uint8Array(1); },
    VideoEncoder, VideoFrame: class { close() {} },
    navigator: { hardwareConcurrency: o.cores || 3 },
    URL: { createObjectURL: () => 'blob:w', revokeObjectURL() {} },
    fetch: o.fetch || (async (u, opt) => { log.fetches.push({ u: String(u), opt }); return { ok: true, json: async () => ({}), arrayBuffer: async () => new ArrayBuffer(1) }; }),
    __log: log, __owner: { v: false },
  };
  if (o.pool) {   // 가짜 워커 풀 — o.pool(m, w) 가 응답을 정한다(안 부르면 그 워커는 끝내 바쁘다)
    ctx.OffscreenCanvas = class {}; ctx.OffscreenCanvas.prototype.convertToBlob = () => {};
    ctx.Worker = class { constructor() { this.terminated = false; log.workers.push(this); } postMessage(m) { log.posted.push(m.index); o.pool(m, this); } terminate() { this.terminated = true; } };
  }
  vm.createContext(ctx);
  vm.runInContext(`let _exportingFrames = false;
    function animOff() { _exportingFrames = false; __log.animOff++; }
    function exportEscOwner() { return __owner.v; }
    ${CANCEL_SRC}
    ${fn('renderCancelled')}
    ${fn('buildMp4')}
    ${fn('bakeMp4')}
    ${fn('exportPngSeq')}
    ${fn('wnsRender')}
    globalThis.exporting = () => _exportingFrames; globalThis.setExporting = (v) => { _exportingFrames = v; };`, ctx);
  return { ctx, log, els, maskBtn, out };
}
const cancelAt = (k) => (i, ctx) => { if (i === k) assert.equal(ctx.exportCancelReq(), true, '렌더 중 누르기는 받는다'); };
const CANCEL_MSG = /렌더를 취소했어요/;

// ---------- 취소 신호 ----------
test('취소 신호 — 렌더 중에만·한 번만 받고, 버튼은 "취소하는 중…"(안 눌림), 요청 신호(AbortSignal)도 끊는다. 시작 때 새로', () => {
  const { ctx, maskBtn } = makeCtx();
  assert.equal(ctx.exportCancelReq(), false, '렌더 중이 아니면 안 받는다');
  assert.equal(ctx.exportCancelled(), false);
  ctx.exportCancelReset(); ctx.setExporting(true);
  const sig = ctx.exportCancelSignal();
  assert.equal(sig.aborted, false);
  assert.doesNotThrow(() => ctx.exportCancelCheck());
  assert.equal(ctx.exportCancelReq(), true);
  assert.equal(ctx.exportCancelReq(), false, '두 번 눌러도 한 번');
  assert.equal(ctx.exportCancelled(), true);
  assert.equal(sig.aborted, true, '헬퍼 요청을 곧바로 끊는다');
  assert.deepEqual({ d: maskBtn.disabled, t: maskBtn.textContent }, { d: true, t: '취소하는 중…' });
  assert.throws(() => ctx.exportCancelCheck(), (e) => e.cancelled === true && /렌더를 취소했어요/.test(e.message));
  ctx.exportCancelReset();   // 다음 렌더 — 신호는 새로, 버튼은 가리개를 띄울 때(showExportMask → exportCancelSync) 원래대로
  assert.equal(ctx.exportCancelled(), false);
  assert.notEqual(ctx.exportCancelSignal(), sig);
  assert.equal(ctx.exportCancelSignal().aborted, false);
  ctx.exportCancelSync();
  assert.deepEqual({ d: maskBtn.disabled, t: maskBtn.textContent }, { d: false, t: '렌더 취소' });
  // AbortController 없는 환경 — 신호 없이도 취소는 된다
  const b = makeCtx({ noAbort: true });
  b.ctx.exportCancelReset(); b.ctx.setExporting(true);
  assert.equal(b.ctx.exportCancelSignal(), undefined);
  assert.equal(b.ctx.exportCancelReq(), true);
});

test('Esc — 렌더 중이고 위에 다른 창·글자 칸이 없을 때만 취소(받으면 아래로 안 보냄), 다른 키·렌더 아님·한글 조합 중은 그대로', () => {
  const { ctx } = makeCtx();
  const key = (k, extra) => { const e = Object.assign({ key: k, stopped: false, prevented: false, stopPropagation() { this.stopped = true; }, preventDefault() { this.prevented = true; } }, extra); ctx.exportCancelKey(e); return e; };
  ctx.exportCancelReset();
  let e = key('Escape');
  assert.equal(e.stopped || e.prevented || ctx.exportCancelled(), false, '렌더 중이 아니면 아무것도 안 함');
  ctx.setExporting(true);
  e = key('Enter'); assert.equal(e.stopped || ctx.exportCancelled(), false);
  e = key('Escape', { isComposing: true }); assert.equal(e.stopped || ctx.exportCancelled(), false);
  ctx.__owner.v = true;   // 토스 모달·드롭다운 등이 떠 있다
  e = key('Escape'); assert.equal(e.stopped || e.prevented || ctx.exportCancelled(), false, '그 창의 Esc(닫기)가 먼저');
  ctx.__owner.v = false;
  e = key('Escape');
  assert.equal(e.stopped && e.prevented, true, '타임라인·펜툴 Esc로 안 내려간다');
  assert.equal(ctx.exportCancelled(), true);
});

test('Esc 판정·가리개 배선 — [렌더 취소] 버튼(토스 ghost)·Esc 리스너는 가리개가 떠 있는 동안만, 판정은 위에 뜬 창 목록', () => {
  const mask = fn('showExportMask');
  assert.match(mask, /<button type="button" class="tossBtn ghost emCancel" title="렌더 취소 \(Esc\)">렌더 취소<\/button>/);
  assert.match(mask, /\.emCancel'\)\.onclick = \(\) => exportCancelReq\(\)/);
  const on = mask.indexOf("window.addEventListener('keydown', exportCancelKey, true)"), off = mask.indexOf("window.removeEventListener('keydown', exportCancelKey, true)");
  assert.ok(on > 0 && off > on, '띄울 때 붙이고 걷을 때 뗀다(창 캡처 단계)');
  assert.match(mask, /exportCancelSync\(\);/);
  const own = fn('exportEscOwner');
  for (const k of ['_ddNow', '_dpNow', 'cgSetupIsOpen()', 'exportIsOpen()', 'wrnColPopIsOpen()', '#tossOv:not(.popClosing)', '#confirmOverlay.on:not(.popClosing)',
    '#slotOverlay.on:not(.popClosing)', '#tourWrap.on', '#typLoadOv.on', '#menuDrop.on', '#camKeyPop', '.imgPop.on:not(.popClosing)', 'isContentEditable', 'TEXTAREA|SELECT']) assert.ok(own.includes(k), k);
  // 닫기 전 묻기 — 취소를 누른 뒤(멈추는 중)는 렌더 중이 아니다
  assert.match(fn('closeBusyWhat'), /if \(_exportingFrames && !exportCancelled\(\)\) return 'render';/);
  // 세 루프 모두 렌더를 켜기 전에 신호를 새로, finally에서 내린다(다음 렌더에 남지 않게)
  for (const f of ['bakeMp4', 'exportPngSeq', 'wnsRender']) {
    const s = fn(f);
    const r = s.indexOf('exportCancelReset();'), x = s.indexOf('_exportingFrames = true');
    assert.ok(r > 0 && r < x, f + ': 켜기 전에 새로');
    assert.ok(s.lastIndexOf('exportCancelReset();') > s.lastIndexOf('finally'), f + ': finally에서 내린다');
    assert.match(s, /if \(exportCancelled\(\)\)/, f + ': 실패와 가른다');
  }
});

// ---------- MP4 ----------
test('MP4 — 3프레임째 누르면 더 안 그리고(그 프레임은 인코딩 안 함), 인코더 닫고, 파일 안 쓰고 버림, 실패 알림 아닌 취소 문구', async () => {
  const { ctx, log, els } = makeCtx({ dur: 1, fps: 10, hook: cancelAt(3) });
  await ctx.bakeMp4();
  assert.equal(log.drawn.length, 3, '누른 뒤 다음 프레임은 안 그린다');
  const enc = log.encs[0];
  assert.equal(enc.encoded, 2, '누른 프레임은 인코딩하지 않는다');
  assert.equal(enc.state, 'closed'); assert.equal(enc.closed, 1);
  assert.equal(log.writes, 0, '파일을 쓰지 않는다');
  assert.equal(log.discards, 1, '저장 대상(저장 창이 만든 빈 파일)을 버린다');
  assert.ok(log.status.some((m) => CANCEL_MSG.test(m)) && !log.status.some((m) => /실패/.test(m)), log.status.join(' | '));
  assert.equal(els['#tlInfo'].textContent, '렌더를 취소했어요');
  assert.equal(ctx.exporting(), false, '_exportingFrames 꺼짐(animOff)');
  assert.equal(log.animOff, 1); assert.equal(log.fxOff, 1);
  assert.equal(els['#tlBake'].disabled, false, '버튼 원래대로');
  assert.equal(ctx.exportCancelled(), false, '끝나면 취소 표시를 내린다');
  // 대조 — 안 누르면 끝까지 그리고 한 번 쓴다
  const b = makeCtx({ dur: 1, fps: 10 });
  await b.ctx.bakeMp4();
  assert.equal(b.log.drawn.length, 10); assert.equal(b.log.writes, 1); assert.equal(b.log.discards, 0);
  assert.ok(!b.log.status.some((m) => CANCEL_MSG.test(m)));
});

test('MP4 — 렌더 전 미리 받기 중에 누르면 프레임을 하나도 안 그린다 / 실패는 그대로 실패 알림(버리지 않음)', async () => {
  const a = makeCtx({ prefetch: async () => { a.ctx.exportCancelReq(); a.ctx.exportCancelCheck(); } });
  await a.ctx.bakeMp4();
  assert.equal(a.log.drawn.length, 0); assert.equal(a.log.writes, 0); assert.equal(a.log.discards, 1);
  assert.equal(a.log.encs[0].state, 'closed');
  const f = makeCtx({ hook: (i) => { if (i === 2) throw new Error('그리기 오류'); } });
  await f.ctx.bakeMp4();
  assert.ok(f.log.status.some((m) => /MP4 저장 실패: 그리기 오류/.test(m)));
  assert.ok(!f.log.status.some((m) => CANCEL_MSG.test(m)));
  assert.equal(f.log.discards, 0);
  assert.equal(f.log.encs[0].state, 'closed', '실패해도 인코더를 닫는다');
});

// ---------- PNG 시퀀스 ----------
test('PNG 시퀀스 — 누르면 더 안 그리고 zip을 묶지도 쓰지도 않는다', async () => {
  const { ctx, log, els } = makeCtx({ dur: 1, fps: 10, hook: cancelAt(4) });
  await ctx.exportPngSeq();
  assert.equal(log.drawn.length, 4);
  assert.equal(log.zips, 0); assert.equal(log.writes, 0); assert.equal(log.discards, 1);
  assert.ok(log.status.some((m) => CANCEL_MSG.test(m)) && !log.status.some((m) => /실패/.test(m)));
  assert.equal(els['#tlInfo'].textContent, '렌더를 취소했어요');
  assert.equal(ctx.exporting(), false); assert.equal(els['#tlExportPng'].disabled, false);
});

// ---------- MXF / MOV (헬퍼) ----------
const urls = (log, part) => log.fetches.filter((f) => f.u.includes(part));
test('MXF(메인 스레드) — 누르면 그 뒤 프레임은 안 보내고 /api/finalize 는 안 부르며 /api/cancel?sid= 로 세션을 지운다', async () => {
  const { ctx, log } = makeCtx({ dur: 1, hook: cancelAt(5) });   // 워커 없음 → 프레임마다 메인에서 보냄
  await ctx.wnsRender('mxf');
  assert.equal(log.drawn.length, 5);
  const frames = urls(log, '/api/frame').map((f) => +new URL(f.u).searchParams.get('index'));
  assert.deepEqual(frames, [0, 1, 2, 3], '누른 프레임(4)부터는 안 보낸다');
  assert.equal(urls(log, '/api/finalize').length, 0, '인코딩을 부르지 않는다');
  const c = urls(log, '/api/cancel');
  assert.equal(c.length, 1);
  const sid = new URL(urls(log, '/api/frame')[0].u).searchParams.get('sid');
  assert.equal(new URL(c[0].u).searchParams.get('sid'), sid, '그 세션을 지우게');
  assert.equal(c[0].opt.method, 'POST');
  assert.ok(urls(log, '/api/frame').every((f) => f.opt.signal && f.opt.signal.aborted), '프레임 요청에 취소 신호');
  assert.equal(log.writes, 0); assert.equal(log.discards, 1);
  assert.ok(log.status.some((m) => CANCEL_MSG.test(m)) && !log.status.some((m) => /MXF 실패/.test(m)));
  assert.equal(ctx.exporting(), false);
});

test('MXF(워커 풀) — 빈 워커를 기다리던 중에 눌러도 곧바로 멈추고 워커를 모두 끝낸 뒤 /api/cancel, finalize 없음', async () => {
  // 워커가 끝내 답하지 않는다(헬퍼가 느림) → 프레임 1·2를 맡긴 뒤 3을 맡길 워커를 기다리는 중 — 그때 누른다
  const { ctx, log } = makeCtx({ dur: 1, cores: 3, pool: () => {} });
  const p = ctx.wnsRender('mxf');
  for (let i = 0; i < 50 && log.posted.length < 2; i++) await tick();
  assert.deepEqual(log.posted, [1, 2]);
  await tick(); await tick();
  assert.equal(ctx.exportCancelReq(), true);
  const t0 = Date.now();
  await p;
  assert.ok(Date.now() - t0 < 500, '기다리던 루프를 곧바로 깨운다');
  assert.deepEqual(log.posted, [1, 2], '더 맡기지 않는다');
  assert.equal(log.workers.length, 2); assert.ok(log.workers.every((w) => w.terminated), '워커 종료');
  assert.equal(urls(log, '/api/finalize').length, 0);
  assert.equal(urls(log, '/api/cancel').length, 1);
  assert.equal(log.writes, 0); assert.equal(log.discards, 1);
  assert.equal(ctx.exporting(), false);
  // 다 맡긴 뒤(남은 인코딩 기다림 중 — 4·5는 답이 안 옴) 눌러도 finalize 없음
  const b = makeCtx({ dur: 0.2, cores: 3, pool: (m, w) => { if (m.index <= 3) setTimeout(() => w.onmessage({ data: { index: m.index, ok: true } }), 0); } });
  const pb = b.ctx.wnsRender('mov');
  for (let i = 0; i < 200 && b.log.posted.length < 5; i++) await tick();
  assert.deepEqual(b.log.posted, [1, 2, 3, 4, 5], '1..5 다 맡김');
  for (let i = 0; i < 5; i++) await tick();
  b.ctx.exportCancelReq();
  await pb;
  assert.equal(urls(b.log, '/api/finalize').length, 0); assert.equal(urls(b.log, '/api/cancel').length, 1);
  assert.ok(b.log.workers.every((w) => w.terminated));
  assert.equal(b.log.writes, 0);
});

test('MXF — 헬퍼가 인코딩하는 중(/api/finalize 기다림)에 누르면 기다림을 끊고 파일을 쓰지 않는다', async () => {
  let fin = null;
  const log0 = [];
  const fetch = (u, opt) => {
    const s = String(u); log0.push({ u: s, opt });
    if (s.includes('/api/finalize')) return new Promise((res, rej) => { fin = opt; opt.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))); });
    return Promise.resolve({ ok: true, json: async () => ({}), arrayBuffer: async () => new ArrayBuffer(1) });
  };
  const { ctx, log } = makeCtx({ dur: 0.1, fetch });
  const p = ctx.wnsRender('mxf');
  for (let i = 0; i < 100 && !fin; i++) await tick();
  assert.ok(fin, '인코딩 요청까지 갔다');
  ctx.exportCancelReq();
  await p;
  assert.equal(fin.signal.aborted, true);
  assert.equal(log0.filter((f) => f.u.includes('/api/cancel')).length, 1, '헬퍼 ffmpeg 를 멈추게');
  assert.equal(log.writes, 0); assert.equal(log.discards, 1);
  assert.ok(log.status.some((m) => CANCEL_MSG.test(m)));
});

test('MXF — 옛 헬퍼(/api/cancel 404·연결 실패)여도 취소는 조용히 끝난다', async () => {
  const fetch = async (u) => {
    if (String(u).includes('/api/cancel')) throw new TypeError('Failed to fetch');
    return { ok: true, json: async () => ({}), arrayBuffer: async () => new ArrayBuffer(1) };
  };
  const { ctx, log } = makeCtx({ dur: 1, hook: cancelAt(2), fetch });
  await ctx.wnsRender('mxf');
  await tick();
  assert.ok(log.status.some((m) => CANCEL_MSG.test(m)) && !log.status.some((m) => /실패/.test(m)));
  assert.equal(ctx.exporting(), false);
});

// ---------- 렌더 전 미리 받기 ----------
function prefetchCtx(fetchTileData, noAbort) {
  const ctx = {
    S: { res: '1920x1080', typhoon: { basemap: 'mapbox' } }, Math, Promise, Array, Error, setTimeout, AbortController: noAbort ? undefined : AbortController,
    isTyphoon: () => true, camKeys: () => [{ t: 0 }], mapboxTileTemplate: () => 'x', glbActive: () => false, camAt: () => ({}),
    mapboxPrefetchUrls: () => Array.from({ length: 100 }, (_, i) => 'u' + i), _tileData: {},
    progress: [], exportProgress(d, t, l) { ctx.progress.push(d); }, statusMsgs: [], status(m) { ctx.statusMsgs.push(m); },
    fetchTileData: (u) => fetchTileData(u, ctx),
  };
  vm.createContext(ctx);
  vm.runInContext(`let _exportingFrames = true; function exportEscOwner() { return false; } function exportCancelSync() {}
    ${CANCEL_SRC.replace(/function exportCancelSync\(\) \{[\s\S]*?\n\}/, '')}
    ${fn('prefetchRenderTiles')}`, ctx);
  ctx.exportCancelReset();
  return ctx;
}
test('렌더 전 미리 받기 — 누르면 새 타일은 더 안 받고, 받던 느린 타일도 안 기다리고 곧바로 멈춘다(실패 알림·진행 표시 없음)', async () => {
  const got = [];
  // 15번째부터는 끝내 안 오는(느린·시간 제한 기다리는) 타일 — 20번째를 받기 시작할 때 누른다
  const ctx = prefetchCtx(async (u, c) => { got.push(u); if (got.length === 20) c.exportCancelReq(); if (got.length >= 15) return new Promise(() => {}); await tick(); return null; });
  const t0 = Date.now();
  await assert.rejects(ctx.prefetchRenderTiles(30, 30), (e) => e.cancelled === true);
  assert.ok(Date.now() - t0 < 1000, '곧바로');
  const p0 = ctx.progress.length;
  for (let i = 0; i < 20; i++) await tick();
  assert.equal(got.length, 20, '누른 뒤엔 새 타일을 안 받는다');
  assert.equal(ctx.progress.length, p0, '뒤에서 끝나는 타일은 진행 표시를 안 건드린다');
  assert.equal(ctx.statusMsgs.length, 0, '못 받은 타일 알림 없음');
  // 신호(AbortController)가 없는 환경 — 받던 것을 마저 받고 멈춘다
  const got2 = [];
  const c2 = prefetchCtx(async (u, c) => { got2.push(u); if (got2.length === 20) c.exportCancelReq(); await tick(); return 1; }, true);
  await assert.rejects(c2.prefetchRenderTiles(30, 30), (e) => e.cancelled === true);
  assert.equal(got2.length, 20);
  // 안 누르면 다 받는다
  const c3 = prefetchCtx(async () => { await tick(); return 1; });
  await c3.prefetchRenderTiles(30, 30);
  assert.equal(c3.progress.at(-1), 100);
});

// ---------- 저장 대상 버리기 ----------
test('prepareOutput — discard(): 저장 창이 만든 빈 파일만 지우고(내용 있으면 그대로), 저장 폴더·다운로드는 아무것도 안 만든다', async () => {
  const calls = [];
  const mk = (size, hasRemove = true) => {
    const h = { name: 'a.mp4', getFile: async () => ({ size }), createWritable: async () => { calls.push('write'); return { write: async () => {}, close: async () => {} }; } };
    if (hasRemove) h.remove = async () => { calls.push('remove:' + size); };
    return h;
  };
  const ctx = { Blob, window: {}, getOutDir: async () => null, uniqueName: async (d, b, e) => b + '.' + e, download: () => calls.push('download') };
  vm.createContext(ctx);
  vm.runInContext(fn('prepareOutput'), ctx);
  for (const [size, rm] of [[0, true], [5, true], [0, false]]) {
    ctx.window.showSaveFilePicker = async () => mk(size, rm);
    const out = await ctx.prepareOutput('1012', 'mp4', 'video/mp4', 'MP4');
    await out.discard();
  }
  assert.deepEqual(calls, ['remove:0'], '빈 파일만 지운다 · 지우기 없는 판은 조용히');
  ctx.window.showSaveFilePicker = async () => { const h = mk(0); h.remove = async () => { throw new Error('막힘'); }; return h; };
  await assert.doesNotReject((await ctx.prepareOutput('1012', 'mp4', 'video/mp4')).discard());
  // 저장 폴더 — write 전엔 파일을 만들지 않는다
  const dirCalls = [];
  ctx.getOutDir = async () => ({ getFileHandle: async (n, o) => { dirCalls.push([n, !!(o && o.create)]); return { createWritable: async () => ({ write: async () => {}, close: async () => {} }) }; } });
  const d = await ctx.prepareOutput('1012', 'mxf', 'application/octet-stream');
  await d.discard();
  assert.deepEqual(dirCalls, []);
  // 다운로드 — discard 는 아무것도 안 한다
  ctx.getOutDir = async () => null; ctx.window.showSaveFilePicker = undefined;
  calls.length = 0;
  await (await ctx.prepareOutput('1012', 'zip', 'application/zip')).discard();
  assert.deepEqual(calls, []);
});

// ---------- 실제 앱(숨김 Electron) — WCG_BOOT_CHECK=1 일 때만 ----------
test('부팅 점검: 실제 앱에서 짧은 MP4·MXF 렌더를 몇 프레임 뒤 [렌더 취소]·Esc로 멈춘다', { skip: process.env.WCG_BOOT_CHECK !== '1' && 'WCG_BOOT_CHECK=1 일 때만(일렉트론 필요)' }, () => {
  let raw;
  try {
    raw = execFileSync(process.execPath, [path.join(root, 'desktop', 'test', 'boot-check.cjs'), root, '--wait=6000', '--keepalive', '--eval=' + path.join(__dirname, 'render-cancel.boot-eval.js')], { encoding: 'utf8', timeout: 300000 });
  } catch (e) { raw = e.stdout; }
  const j = JSON.parse(raw);
  assert.equal(j.ok, true, JSON.stringify(j.errors));
  const o = j.evalResult;
  assert.ok(o && !o.error, o && o.error);
  // 1) MP4 — 버튼 클릭
  const a = o.mp4Click;
  assert.ok(a.atClick >= 3, '몇 프레임 그린 뒤 누름');
  assert.ok(a.after <= 1, `누른 뒤 많아야 그리던 1프레임 — ${a.after}`);
  assert.ok(a.total < a.n, '끝까지 안 갔다');
  assert.deepEqual(a.btn, { text: '취소하는 중…', disabled: true });
  assert.equal(a.exporting, false); assert.equal(a.maskOn, false); assert.equal(a.maskDisplay, 'none');
  assert.match(a.status, /렌더를 취소했어요/); assert.equal(a.info, '렌더를 취소했어요');
  assert.equal(a.writes, 0); assert.equal(a.removed, 1, '저장 창이 만든 빈 파일을 지움');
  assert.equal(a.bakeDisabled, false); assert.equal(a.closeBusy, '', '닫기 전 묻기 — 렌더 중 아님');
  // 2) MP4 — Esc(위에 토스 모달이 있으면 그 창이 먼저 닫히고 렌더는 계속, 다시 Esc면 취소), 새 렌더면 버튼이 원래대로
  const b = o.mp4Esc;
  assert.deepEqual(b.btnAtStart, { text: '렌더 취소', disabled: false });
  assert.equal(b.modalClosed, true); assert.equal(b.stillRendering, true, '모달 Esc는 렌더를 안 멈춘다');
  assert.equal(b.prevented, true, '렌더 취소 Esc는 아래(타임라인 등)로 안 내려간다');
  assert.ok(b.after <= 1); assert.ok(b.total < b.n);
  assert.equal(b.exporting, false); assert.match(b.status, /렌더를 취소했어요/); assert.equal(b.writes, 0);
  // 3) MXF — 가짜 헬퍼(fetch 가로채기)·가짜 워커
  const c = o.mxf;
  assert.ok(c.posted + c.main >= 3 && c.total < c.n);
  assert.equal(c.finalize, 0); assert.deepEqual(c.cancel, [c.sid]);
  assert.ok(c.terminated, '워커 종료');
  assert.equal(c.exporting, false); assert.match(c.status, /렌더를 취소했어요/); assert.equal(c.info, '렌더를 취소했어요'); assert.equal(c.writes, 0);
  assert.ok(c.after <= 1);
  // 4) 취소 뒤 다시 렌더하면 끝까지 — 취소 표시가 남지 않는다
  assert.equal(o.again.writes, 1); assert.equal(o.again.total, o.again.n); assert.doesNotMatch(o.again.status, /취소/);
});
