// 타임라인 오류 점검기(AE식 타임라인용) — 보이는 Electron 창 + CDP 실제 입력으로 조사 때 찾은 오류 B1~B20을 다시 재현하고
// 항목마다 '고침' 판정(fixed: true/false)과 관찰값을 남긴다. 앱 코드는 바꾸지 않는다(작업은 파일 끌어다 놓기로 연다).
// 사용: node tlbugs.cjs [--app=<앱 폴더>] [--out=<결과 json>] [--only=B1,B3,...] [--size=1920x1080]
const { spawn, execFileSync } = require('child_process');
const { rmTestProfile } = require('../test-profile.cjs');
const fs = require('fs');
const net = require('net');
const path = require('path');

const args = process.argv.slice(2);
const opt = (k, d) => { const a = args.find((x) => x === `--${k}` || x.startsWith(`--${k}=`)); if (!a) return d; return a.includes('=') ? a.slice(k.length + 3) : true; };
const APP = path.resolve(opt('app', path.resolve(__dirname, '..', '..', '..')));
const DESK = path.resolve(__dirname, '..', '..');
const ELECTRON = path.join(DESK, 'node_modules', 'electron', 'dist', 'electron.exe');
const BP = path.join(__dirname, '..', 'brushperf');
const SIZE = opt('size', '1920x1080'), ONLY = opt('only', '');
const OUTF = path.resolve(opt('out', path.join(require('os').tmpdir(), 'wcg-tlbugs.json')));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = () => new Promise((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const log = (...a) => console.error('[tlbugs]', ...a);
async function waitUntil(t) { while (true) { const d = t - performance.now(); if (d <= 0) return; if (d > 3) await sleep(d - 2); else await new Promise((r) => setImmediate(r)); } }

(async () => {
  const port = await freePort();
  const proc = spawn(ELECTRON, [path.join(BP, 'perf-main.js'), `--remote-debugging-port=${port}`], {
    cwd: DESK, env: { ...process.env, WCG_MAIN: path.join(DESK, 'main.js'), WCG_APP_DIR: APP, WCG_TEST: '1', WCG_TEST_SIZE: SIZE }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: false,
  });
  let mainLog = '';
  proc.stdout.on('data', (d) => { mainLog += d; }); proc.stderr.on('data', (d) => { mainLog += d; });
  const kill = () => { try { execFileSync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore' }); } catch (e) {} rmTestProfile(proc.pid); };
  process.on('exit', kill);
  let page = null;
  for (let i = 0; i < 80 && !page; i++) {
    await sleep(400);
    try { const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); page = list.find((p) => p.type === 'page' && p.url.startsWith('app://weathercg')); } catch (e) {}
  }
  if (!page) { log('no page', mainLog.slice(-800)); kill(); process.exit(1); }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0; const pending = new Map(); const errors = []; const listeners = [];
  let cur = '';
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') { const d = m.params.exceptionDetails; errors.push({ cur, msg: 'EXC ' + ((d.exception && d.exception.description) || d.text).slice(0, 500) }); }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push({ cur, msg: 'CONSOLE ' + m.params.args.map((a) => (a.value !== undefined ? a.value : a.description)).join(' ').slice(0, 400) });
    for (const l of listeners) l(m);
  });
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.error) throw new Error(JSON.stringify(r.error));
    if (r.result.exceptionDetails) throw new Error((r.result.exceptionDetails.exception && r.result.exceptionDetails.exception.description) || r.result.exceptionDetails.text);
    return r.result.result.value;
  };
  const waitLoad = () => new Promise((r) => { const f = (m) => { if (m.method === 'Page.loadEventFired') { listeners.splice(listeners.indexOf(f), 1); r(); } }; listeners.push(f); });
  await send('Runtime.enable'); await send('Page.enable');
  { const w = waitLoad(); await send('Page.reload', { ignoreCache: false }); await w; await sleep(8000); }
  await evaluate(fs.readFileSync(path.join(BP, 'helpers.js'), 'utf8'));
  await evaluate(fs.readFileSync(path.join(__dirname, 'tl-helpers.js'), 'utf8'));
  await evaluate('__tl.closePopups()');

  // ---- 입력 ----
  const MOD = { alt: 1, ctrl: 2, meta: 4, shift: 8 };
  const mouse = (type, x, y, o = {}) => send('Input.dispatchMouseEvent', { type, x, y, button: o.button || (o.buttons ? 'left' : 'none'), buttons: o.buttons || 0, clickCount: o.clickCount || 0, modifiers: o.modifiers || 0, deltaX: o.deltaX || 0, deltaY: o.deltaY || 0 });
  const click = async (p, modifiers = 0) => { await mouse('mouseMoved', p.x, p.y, { modifiers }); await sleep(30); await mouse('mousePressed', p.x, p.y, { button: 'left', buttons: 1, clickCount: 1, modifiers }); await sleep(50); await mouse('mouseReleased', p.x, p.y, { button: 'left', buttons: 0, clickCount: 1, modifiers }); await sleep(60); };
  const drag = async (a, b, ms, o = {}) => {
    const button = o.button || 'left', buttons = button === 'middle' ? 4 : button === 'right' ? 2 : 1, modifiers = o.modifiers || 0, hz = o.hz || 125;
    await mouse('mouseMoved', a.x, a.y, { modifiers }); await sleep(40);
    await mouse('mousePressed', a.x, a.y, { button, buttons, clickCount: 1, modifiers });
    const n = Math.max(2, Math.round(ms / (1000 / hz))); const dt = 1000 / hz; let t = performance.now();
    for (let i = 1; i <= n; i++) { t += dt; await waitUntil(t); const k = i / n; mouse('mouseMoved', Math.round(a.x + (b.x - a.x) * k), Math.round(a.y + (b.y - a.y) * k), { button, buttons, modifiers }); if (o.during) await o.during(i, n); }
    await sleep(30);
    await mouse('mouseReleased', b.x, b.y, { button, buttons: 0, clickCount: 1, modifiers });
    await sleep(120);
  };
  const keyPress = async (code, key, modifiers = 0, vk = 0, text) => {
    await send('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', code, key, modifiers, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, text });
    await sleep(20);
    await send('Input.dispatchKeyEvent', { type: 'keyUp', code, key, modifiers, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
    await sleep(80);
  };
  const R = (sel, i = 0) => evaluate(`__tl.rect(${JSON.stringify(sel)}, ${i})`);
  const E = (body) => evaluate(`(() => { ${body} })()`);
  const st = () => evaluate('__tl.state()');
  // 공통 준비: 타임라인 닫고 → 작업 열기 → 타임라인 열기 → 자동 구성
  const prep = async (workExpr, auto = true) => {
    await E(`if (document.querySelector('#timeline').classList.contains('on')) document.querySelector('#tlClose').click(); return 1;`);
    await evaluate(`(async () => __tl.openWork(${workExpr}))()`);
    await sleep(400);
    await click(await R('#tlToggle')); await sleep(500);
    if (auto) { await click(await R('#tlAuto')); await sleep(500); await E(`const x = document.querySelector('#tossOv [data-act="all"]'); if (x) x.click(); return 1;`); await sleep(300); }
  };
  // 눈금자 위 t초 자리(화면 좌표)
  const tAt = async (t) => { const r = await R('#tlRuler'); const v = await E(`return { pps: tlState.pps, sx: tlState.scrollX };`); return { x: Math.round(r.l + 12 + t * v.pps - v.sx), y: r.y }; };
  // 레인 행 id의 막대(몸통 가운데 / 가장자리) 화면 좌표
  const barAt = (rowId, part = 'mid') => E(`const e = tlState.els.get(${JSON.stringify(rowId)}); if (!e || !e.clip) return null; e.ln.scrollIntoView({ block: 'nearest' }); const r = e.clip.getBoundingClientRect();
    return { x: Math.round(${JSON.stringify(part)} === 'l' ? r.left + 1 : ${JSON.stringify(part)} === 'r' ? r.right - 1 : r.left + Math.min(r.width / 2, 40)), y: Math.round(r.top + r.height / 2), l: r.left, w: r.width };`);
  const firstRow = (kind) => E(`const r = tlState.rows.find((x) => !x.prop && x.L.kind === ${JSON.stringify(kind)} && x.L.track); return r ? r.id : null;`);

  const out = {};
  const check = async (name, fn) => {
    if (ONLY && !ONLY.split(',').includes(name)) return;
    cur = name; log('check', name);
    try { out[name] = await fn(); } catch (e) { out[name] = { fixed: false, harnessError: String(e && e.stack || e).slice(0, 600) }; }
    log(name, JSON.stringify(out[name]).slice(0, 700));
    await evaluate(`(() => { try { animStop(); } catch (e) {} return 1; })()`);
    await sleep(200);
  };

  // B1 세로 스크롤 → 이름 열·레인 같은 행, CTI는 모든 행 관통, 가로 넘침 없음
  await check('B1', async () => {
    await prep('__tl.normalWork({})');
    const sc = await R('#tlScroll');
    await mouse('mouseMoved', sc.x, sc.y); await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: sc.x, y: sc.y, deltaX: 0, deltaY: 260, button: 'none', buttons: 0 });
    await sleep(500);
    const r = await E(`const sc = document.querySelector('#tlScroll'), sr = sc.getBoundingClientRect();
      const rows = [...tlState.els.values()].map((e) => ({ n: e.nm.getBoundingClientRect().top, l: e.ln.getBoundingClientRect().top })).filter((x) => x.l >= sr.top && x.l < sr.bottom);
      const head = document.querySelector('#tlHead').getBoundingClientRect();
      return { scrollTop: sc.scrollTop, aligned: rows.every((x) => Math.abs(x.n - x.l) < 0.5), visRows: rows.length, headTop: Math.round(head.top), headBottom: Math.round(head.bottom), scTop: Math.round(sr.top), scBottom: Math.round(sr.bottom),
        hOverflow: sc.scrollWidth - sc.clientWidth, gridOverflow: document.querySelector('#tlGrid').scrollWidth - document.querySelector('#tlGrid').clientWidth };`);
    r.fixed = r.scrollTop > 0 && r.aligned && r.headTop <= r.scTop && r.headBottom >= r.scBottom - 1 && r.hOverflow <= 0;
    return r;
  });
  // B2 창 크기 바뀜 → 막대·CTI가 같은 새 배율
  await check('B2', async () => {
    await prep('__tl.normalWork({})');
    await click(await tAt(2.0));
    await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: 0, mobile: false });
    await sleep(900);
    const r = await E(`const g = document.querySelector('#tlGrid').getBoundingClientRect(); const id = [...tlState.els.keys()].find((k) => { const e = tlState.els.get(k); return e.row.L.track && !e.row.prop; });
      const e = tlState.els.get(id), sp = tlSpanNow(e.row.L), cl = e.clip.getBoundingClientRect(), hd = document.querySelector('#tlHead').getBoundingClientRect();
      return { pps: tlState.pps, viewW: tlState.viewW, gridW: Math.round(g.width), barLeft: +(cl.left - g.left).toFixed(1), barExpect: +(12 + sp[0] * tlState.pps - tlState.scrollX).toFixed(1), headX: +(hd.left - g.left).toFixed(1), headExpect: +(12 + tlHeadT * tlState.pps - tlState.scrollX).toFixed(1) };`);
    await send('Emulation.clearDeviceMetricsOverride'); await sleep(800);
    r.fixed = Math.abs(r.barLeft - r.barExpect) < 1.5 && Math.abs(r.headX - r.headExpect) < 1.5 && Math.abs(r.viewW - r.gridW) < 2;
    return r;
  });
  // B3 막대 끈 뒤 Ctrl+Z → 막대도 제자리
  await check('B3', async () => {
    await prep('__tl.normalWork({})');
    const id = await firstRow('fill');
    const s0 = await E(`return tlSpanNow(tlState.els.get(${JSON.stringify(id)}).row.L)[0];`);
    const b = await barAt(id);
    await drag(b, { x: b.x + 160, y: b.y }, 500);
    const s1 = await E(`return tlSpanNow(tlState.els.get(${JSON.stringify(id)}).row.L)[0];`);
    await keyPress('KeyZ', 'z', MOD.ctrl, 90);
    await sleep(400);
    const r = await E(`const e = tlState.els.get(${JSON.stringify(id)}), sp = tlSpanNow(e.row.L), g = document.querySelector('#tlGrid').getBoundingClientRect(), cl = e.clip.getBoundingClientRect();
      return { start: sp[0], barLeft: +(cl.left - g.left).toFixed(1), expect: +(12 + sp[0] * tlState.pps - tlState.scrollX).toFixed(1), animT, head: tlHeadT };`);
    r.s0 = s0; r.afterDrag = s1;
    r.fixed = Math.abs(r.start - s0) < 1e-4 && Math.abs(r.barLeft - r.expect) < 1.5 && s1 > s0 + 0.2;
    return r;
  });
  // B4 태풍+카메라: 미리보기 중 Alt+가운데 끌기 → 라벨은 그대로, 그 시각에 키가 생김(닫아도 작업 뷰·라벨 원래대로)
  await check('B4', async () => {
    await prep('__tl.typhoonWork({ cam: "flat" })');
    const l0 = await E(`return JSON.stringify(labelList().map((b) => [b.id, b.x, b.y]));`);
    const m0 = await E(`return JSON.stringify(stateForSave().map);`);
    await click(await tAt(2.0)); await sleep(300);
    const k0 = await E(`return camKeys().length;`);
    const cg = await R('#cg');
    await drag({ x: cg.x, y: cg.y }, { x: cg.x + 120, y: cg.y + 40 }, 400, { button: 'middle', modifiers: MOD.alt });
    await sleep(400);
    const mid = await E(`return { labels: JSON.stringify(labelList().map((b) => [b.id, b.x, b.y])), keys: camKeys().map((k) => [k.t, k.x, k.y]), head: tlHeadT };`);
    await click(await R('#tlClose')); await sleep(400);
    const after = await E(`return { labels: JSON.stringify(labelList().map((b) => [b.id, b.x, b.y])), map: JSON.stringify(S.map) };`);
    const r = { keysBefore: k0, keysAfter: mid.keys, labelsKept: mid.labels === l0 && after.labels === l0, mapRestored: after.map === m0, head: mid.head };
    r.fixed = r.labelsKept && r.mapRestored && mid.keys.length === k0 + 1 && mid.keys.some((k) => Math.abs(k[0] - 2.002) < 0.02);
    return r;
  });
  // B5 카메라 미리보기 중 자동 저장 = 작업 뷰
  await check('B5', async () => {
    await prep('__tl.normalWork({ cam: "flat" })');
    const m0 = await E(`return JSON.stringify(stateForSave().map);`);
    await click(await tAt(3.0)); await sleep(2300);
    const r = await E(`const w = JSON.parse(localStorage.getItem('wcg_work') || '{}'); return { saved: JSON.stringify(w.map), live: JSON.stringify(S.map), undoTop: undoStack.length ? JSON.stringify(undoStack[undoStack.length - 1].map) : null };`);
    r.work = m0; r.fixed = r.saved === m0 && r.live !== m0;
    return r;
  });
  // B6 CTI에서 재생
  await check('B6', async () => {
    await prep('__tl.normalWork({})');
    await click(await tAt(2.5)); await sleep(200);
    await E(`animOff(); return 1;`);
    await click(await R('#tlPlay')); await sleep(150);
    const b = await st();
    await click(await R('#tlPlay'));
    return { animTJustAfterPlay: b.animT, head: b.tlHeadT, fixed: b.animT != null && b.animT >= 2.45 };
  });
  // B7 닫았다 열면 CTI 프레임
  await check('B7', async () => {
    await prep('__tl.normalWork({})');
    await click(await tAt(0.6)); await sleep(400);
    const f0 = await E(`return [...document.querySelectorAll('#gMain .zone')].filter((z) => z.getAttribute('fill') === S.base).length;`);
    await click(await R('#tlClose')); await sleep(300); await click(await R('#tlToggle')); await sleep(500);
    const f1 = await E(`return { base: [...document.querySelectorAll('#gMain .zone')].filter((z) => z.getAttribute('fill') === S.base).length, animT, head: tlHeadT };`);
    return { baseZonesAtCTI: f0, afterReopen: f1, fixed: f1.animT != null && Math.abs(f1.head - f1.animT) < 1e-6 && f1.base === f0 };
  });
  // B8 막대 끌기 중 CTI 그대로
  await check('B8', async () => {
    await prep('__tl.normalWork({})');
    await click(await tAt(1.0)); await sleep(200);
    const h0 = (await st()).tlHeadT;
    const id = await firstRow('label');
    const b = await barAt(id);
    await drag(b, { x: b.x + 80, y: b.y }, 300);
    const h1 = (await st()).tlHeadT;
    return { headBefore: h0, headAfter: h1, fixed: Math.abs(h0 - h1) < 1e-6 };
  });
  // B9 재생 중 막대 끌기 = 재생 멈춤(재생헤드가 두 시각을 오가지 않음)
  await check('B9', async () => {
    await prep('__tl.normalWork({})');
    await E(`tlSetT(0); return 1;`);
    await click(await R('#tlPlay')); await sleep(250);
    const id = await firstRow('label');
    const b = await barAt(id);
    const samples = [];
    await drag(b, { x: b.x + 60, y: b.y }, 1000, { during: async (i) => { if (i % 10 === 0) samples.push(await evaluate('tlHeadT')); } });
    const s = await st();
    const moving = samples.some((x, i) => i && Math.abs(x - samples[i - 1]) > 1e-6);
    return { samples: samples.map((x) => +(+x).toFixed(3)), playingAfter: s.playing, fixed: !s.playing && !moving };
  });
  // B10 클릭만으론 되돌리기 기록 없음
  await check('B10', async () => {
    await prep('__tl.normalWork({ cam: "flat" })');
    const u0 = await evaluate('undoStack.length');
    const id = await firstRow('fill');
    await click(await barAt(id)); await sleep(150);
    const u1 = await evaluate('undoStack.length');
    const k = await E(`const e = document.querySelector('.tlLane.prop .tlKey'); e.scrollIntoView({ block: 'nearest' }); const r = e.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };`);
    await click(k); await sleep(150);
    const u2 = await evaluate('undoStack.length');
    const b = await barAt(id);
    await drag(b, { x: b.x + 50, y: b.y }, 300);
    const u3 = await evaluate('undoStack.length');
    return { u0, afterBarClick: u1, afterKeyClick: u2, afterDrag: u3, fixed: u1 === u0 && u2 === u0 && u3 === u0 + 1 };
  });
  // B11 길이를 막대보다 짧게 → 빗금 + 넘친 막대 그대로 + 안내, CTI는 길이 안
  await check('B11', async () => {
    await prep('__tl.normalWork({})');
    await click(await tAt(4.5)); await sleep(150);
    await E(`const d = document.querySelector('#tlDur'); d.value = '2'; d.dispatchEvent(new Event('change')); return 1;`);
    await sleep(400);
    const r = await E(`const n = anim().tracks.filter((t) => t.start + t.len > anim().dur).length; const bz = document.querySelector('#tlBeyond');
      return { dur: anim().dur, head: tlHeadT, over: n, warn: document.querySelector('#tlFootWarn').textContent, beyond: bz ? parseFloat(bz.style.left) : null, hOverflow: document.querySelector('#tlScroll').scrollWidth - document.querySelector('#tlScroll').clientWidth };`);
    r.fixed = r.head <= 2 + 1e-6 && r.over > 0 && /길이 밖/.test(r.warn) && r.beyond > 0 && r.hOverflow <= 0;
    await E(`const d = document.querySelector('#tlDur'); d.value = '6'; d.dispatchEvent(new Event('change')); return 1;`);
    return r;
  });
  // B12 자동 구성 뒤 더한 라벨 = '타이밍 없음' 행, 끌면 트랙 생김
  await check('B12', async () => {
    await prep('__tl.normalWork({})');
    const r0 = await E(`const nl = newLabel({ txt: '99', x: 1000, y: 700, fill: '#FA2E1E' }); S.labels.push(nl); renderAll(); window.__nl = nl.id; return nl.id;`);
    await sleep(400);
    const row = 'label:' + r0;
    const has = await E(`const e = tlState.els.get(${JSON.stringify(row)}); return e ? { none: e.clip.classList.contains('none') } : null;`);
    const b = await barAt(row);
    await drag({ x: b.x + 200, y: b.y }, { x: b.x + 260, y: b.y }, 300);
    const tr = await E(`const t = anim().tracks.find((x) => x.kind === 'label' && x.key === ${JSON.stringify(r0)}); return t ? { start: t.start, len: t.len } : null;`);
    return { rowNone: has, track: tr, fixed: !!(has && has.none && tr && tr.len > 0.5) };
  });
  // B13 자동 구성 다시 = 손본 타이밍 있으면 확인창, '새 항목만 추가'는 손본 값 유지
  await check('B13', async () => {
    await prep('__tl.normalWork({})');
    await E(`const t = anim().tracks[0]; t.start = 3.3; t.len = 1.7; buildTimeline(); return 1;`);
    await click(await R('#tlAuto')); await sleep(500);
    const modal = await E(`return !!document.querySelector('#tossOv [data-act="add"]');`);
    await E(`const b = document.querySelector('#tossOv [data-act="add"]'); if (b) b.click(); return 1;`); await sleep(500);
    const t0 = await E(`const t = anim().tracks[0]; return { start: t.start, len: t.len };`);
    return { modal, keptAfterAddOnly: t0, fixed: modal && Math.abs(t0.start - 3.3) < 1e-6 && Math.abs(t0.len - 1.7) < 1e-6 };
  });
  // B14 지도 종류 바꾸면 행이 바로 바뀜
  await check('B14', async () => {
    await prep('__tl.normalWork({})');
    const a = await E(`return tlState.rows.filter((r) => r.L.kind === 'fill' && !r.L.gone).length;`);
    await E(`setStyle('sido'); markStyleBtns(); return 1;`); await sleep(700);
    const b = await E(`return { live: tlState.rows.filter((r) => r.L.kind === 'fill' && !r.L.gone).length, gone: tlState.rows.filter((r) => r.L.gone).length };`);
    await E(`setStyle('typhoon'); markStyleBtns(); return 1;`); await sleep(900);
    const c = await E(`return { typ: tlState.rows.some((r) => r.L.kind === 'typhoon'), fill: tlState.rows.filter((r) => r.L.kind === 'fill' && !r.L.gone).length };`);
    return { before: a, afterSido: b, afterTyphoon: c, fixed: a > 0 && b.gone > 0 && c.typ && c.fill === 0 };
  });
  // B15 해상도 바꾸면 시작 시각 알림 줄
  await check('B15', async () => {
    await prep('__tl.normalWork({})');
    const r = await E(`const b = document.querySelector('#resBtns [data-res="1920x1080-vf"]'); b._apply(); return { note: document.querySelector('#tlNote').textContent, btn: !!document.querySelector('#tlNote button') };`);
    await sleep(300);
    const s0 = await E(`return Math.min(...anim().tracks.map((t) => t.start));`);
    await E(`document.querySelector('#tlNote button').click(); return 1;`); await sleep(300);
    const s1 = await E(`return Math.min(...anim().tracks.map((t) => t.start));`);
    await E(`document.querySelector('#resBtns [data-res="1920x1080"]')._apply(); return 1;`); await sleep(300);
    return { note: r.note, firstStartBefore: s0, firstStartAfterShift: s1, fixed: r.btn && /기본 시작/.test(r.note) && s1 > s0 + 0.2 };
  });
  // B16 태풍 라벨 숨겼다 켜면 손본 키 그대로
  await check('B16', async () => {
    await prep('__tl.typhoonWork({})');
    const r = await E(`const tr = anim().tracks.find((t) => t.kind === 'typhoon'); const id = Object.keys(tr.lab)[0];
      tr.lab[id] = { s: 4.4, e: 5.3 }; const before = JSON.stringify(tr.lab[id]);
      const b = labelList().find((x) => x.id === id); b.off = 1; buildTimeline(); b.off = 0; buildTimeline();
      return { id, before, after: JSON.stringify(tr.lab[id]) };`);
    r.fixed = r.before === r.after; return r;
  });
  // B17 Shift 스냅 — 경로 끝을 CTI(5.0초) 근처로 끌면 딱 붙는다
  await check('B17', async () => {
    await prep('__tl.typhoonWork({})');
    await E(`tlSetT(5.0); return 1;`); await sleep(200);
    const b = await barAt('typ:path', 'r');
    const target = await tAt(5.0);
    await drag(b, { x: target.x + 4, y: b.y }, 500, { modifiers: MOD.shift });
    const pe = await E(`return anim().tracks[0].pe;`);
    return { pe, head: await evaluate('tlHeadT'), fixed: Math.abs(pe - (await evaluate('tlHeadT'))) < 1e-4 };
  });
  // B18 타임라인 포커스면 ←/→ = 1프레임(지도 안 움직임, 되돌리기 기록 없음)
  await check('B18', async () => {
    await prep('__tl.normalWork({})');
    await click(await tAt(1.0)); await sleep(200);
    const a = await E(`return { x: S.map.x, head: tlHeadT, undo: undoStack.length, focus: tlState.focus };`);
    await keyPress('ArrowRight', 'ArrowRight', 0, 39); await sleep(300);
    await keyPress('PageDown', 'PageDown', 0, 34); await sleep(300);
    const b = await E(`return { x: S.map.x, head: tlHeadT, undo: undoStack.length };`);
    const f1 = 1 / 29.97;
    return { before: a, after: b, fixed: a.focus && b.x === a.x && b.undo === a.undo && Math.abs(b.head - a.head - 2 * f1) < 0.002 };
  });
  // B19 비교 지도엔 효과 없는 '태풍 경로' 행이 없다
  await check('B19', async () => {
    await prep('__tl.compareWork({})');
    const r = await E(`return { typRow: tlState.rows.some((r) => r.L.kind === 'typhoon'), cmpRows: tlState.rows.filter((r) => r.L.kind === 'typcmp').length };`);
    r.fixed = !r.typRow && r.cmpRows === 3; return r;
  });
  // B20 무대가 타임라인 높이만큼 줄어 지도가 안 가려짐
  await check('B20', async () => {
    await prep('__tl.normalWork({})');
    const r = await E(`const cg = document.querySelector('#cg').getBoundingClientRect(), tl = document.querySelector('#timeline').getBoundingClientRect(), gear = document.querySelector('#apiGear').getBoundingClientRect();
      return { cgBottom: Math.round(cg.bottom), tlTop: Math.round(tl.top), gearBottom: Math.round(gear.bottom), hidden: Math.max(0, Math.round(cg.bottom - tl.top)) };`);
    r.fixed = r.hidden === 0 && r.gearBottom <= r.tlTop; return r;
  });
  // 덤: 블라인드→번짐 전환·재생 끝·처음으로·초기화 후 잔재·오류 없음
  await check('misc', async () => {
    await prep('__tl.normalWork({ cam: "tilt" })');
    await E(`const s = document.querySelector('#tlReveal'); s.value = 'blinds'; s.dispatchEvent(new Event('change')); return 1;`);
    await click(await tAt(1.3)); await sleep(300);
    await E(`const s = document.querySelector('#tlReveal'); s.value = 'dissolve'; s.dispatchEvent(new Event('change')); return 1;`);
    await E(`tlSetT(4.5); return 1;`);
    await click(await R('#tlPlay')); await sleep(2200);
    const endSt = await st();
    await click(await R('#tlStop')); await sleep(300);
    const afterStop = await E(`return { animT, head: tlHeadT, map3d: JSON.stringify(S.map3d), tilt: fit.classList.contains('mapTilt') };`);
    await click(await R('#tlReset')); await sleep(300);
    const b = await st();
    const left = await E(`return { base: !!document.getElementById('L_mapBase'), clips: document.querySelectorAll('[id^=bclip]').length, fast: document.querySelectorAll('[data-animfast]').length, map3d: JSON.stringify(S.map3d), tiltClass: fit.classList.contains('mapTilt') };`);
    return { atEnd: endSt, afterStop, afterReset: b, left, fixed: !endSt.playing && !left.base && !left.clips && !left.fast && !left.tiltClass };
  });

  const res = { errors, out, summary: Object.fromEntries(Object.entries(out).map(([k, v]) => [k, !!v.fixed])), display: (/\[perf\] display (.*)/.exec(mainLog) || [])[1] };
  fs.writeFileSync(OUTF, JSON.stringify(res, null, 1));
  log('saved', OUTF, 'errors', errors.length, JSON.stringify(res.summary));
  ws.close(); kill();
  process.exit(0);
})().catch((e) => { console.error('tlbugs error', e); process.exit(2); });
