// 브러쉬 결과 동일성 점검 — 바꾸기 전 앱(--old)과 바꾼 앱(--new)에 같은 획을 넣고 런 이미지·추출 래스터를 픽셀로 비교한다.
//  A) 같은 저장 획(색 여러 개·지우개 섞임) → 두 앱이 처음부터 구운 결과 비교
//  B) 바꾼 앱에서 실제 입력(CDP)으로 칠하기(같은 색 잇기·다른 색·지우개·크게/부드럽게) → 증분 결과 vs 새로고침(처음부터 굽기) 결과
//     + 되돌리기 2번(조각 복원) / 다시 실행 1번 → 각각 새로고침 결과와 비교
//  C) B의 최종 저장 획을 옛 앱에 넣어 구운 결과 vs 바꾼 앱 결과
// 사용: node equiv.cjs --old=<옛 앱 폴더> [--new=<앱 폴더>] [--style=sgg] [--strokes=60] [--out=<결과 폴더>]
const { spawn, execFileSync } = require('child_process');
const { rmTestProfile } = require('../test-profile.cjs');
const fs = require('fs');
const net = require('net');
const path = require('path');

const args = process.argv.slice(2);
const opt = (k, d) => { const a = args.find((x) => x === `--${k}` || x.startsWith(`--${k}=`)); if (!a) return d; return a.includes('=') ? a.slice(k.length + 3) : true; };
const HERE = __dirname;
const DESK = path.resolve(HERE, '..', '..');
const ELECTRON = path.join(DESK, 'node_modules', 'electron', 'dist', 'electron.exe');
const OLD = opt('old') ? path.resolve(opt('old')) : null;
const NEW = path.resolve(opt('new', path.resolve(DESK, '..')));
const STYLE = opt('style', 'sgg'), NSTROKES = +opt('strokes', 60), RES = opt('res', '1920x1080');
const OUT = path.resolve(opt('out', path.join(require('os').tmpdir(), 'wcg-brushperf'))); fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T0 = Date.now(); const log = (...a) => console.error('[equiv ' + ((Date.now() - T0) / 1000).toFixed(0) + 's]', ...a);
const freePort = () => new Promise((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const HELP = fs.readFileSync(path.join(HERE, 'helpers.js'), 'utf8') + '\n' + fs.readFileSync(path.join(HERE, 'equiv-page.js'), 'utf8');

const KILLS = []; process.on('exit', () => { for (const k of KILLS) k(); });
async function launch(appDir) {
  const port = await freePort();
  const proc = spawn(ELECTRON, [path.join(HERE, 'perf-main.js'), `--remote-debugging-port=${port}`], {
    cwd: DESK, env: { ...process.env, WCG_MAIN: path.join(DESK, 'main.js'), WCG_APP_DIR: appDir, WCG_TEST: '1', WCG_TEST_SIZE: '1920x1080' }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: false,
  });
  let mainLog = ''; proc.stdout.on('data', (d) => { mainLog += d; }); proc.stderr.on('data', (d) => { mainLog += d; });
  const kill = () => { try { execFileSync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore' }); } catch (e) {} rmTestProfile(proc.pid); };   // + 임시 사용자 폴더 정리
  KILLS.push(kill);
  let page = null;
  for (let i = 0; i < 80 && !page; i++) { await sleep(400); try { const l = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); page = l.find((p) => p.type === 'page' && p.url.startsWith('app://weathercg')); } catch (e) {} }
  if (!page) { kill(); throw new Error('no page ' + mainLog.slice(-500)); }
  const ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener('open', r));
  let id = 0; const pending = new Map(); const errors = []; const listeners = [];
  ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; } if (m.method === 'Runtime.exceptionThrown') { const d = m.params.exceptionDetails; errors.push(((d.exception && d.exception.description) || d.text).slice(0, 300)); } for (const l of listeners) l(m); });
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async (expr) => { const r = await Promise.race([send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }), sleep(180000).then(() => { throw new Error('evaluate timeout: ' + expr.slice(0, 80)); })]); if (r.result.exceptionDetails) throw new Error((r.result.exceptionDetails.exception && r.result.exceptionDetails.exception.description) || r.result.exceptionDetails.text); return r.result.result.value; };
  const waitLoad = () => new Promise((r) => { const f = (m) => { if (m.method === 'Page.loadEventFired') { listeners.splice(listeners.indexOf(f), 1); r(); } }; listeners.push(f); });
  await send('Runtime.enable'); await send('Page.enable');
  const reload = async (extra = 7000) => { const w = waitLoad(); await send('Page.reload', { ignoreCache: false }); let done = false; await Promise.race([w.then(() => { done = true; }), sleep(40000).then(() => { if (!done) log('load event timeout'); })]); await sleep(extra); await evaluate(HELP); await evaluate('__h.closePopups()'); await evaluate('__eq.settle(600)'); };
  const mouse = (type, x, y, o = {}) => send('Input.dispatchMouseEvent', { type, x, y, button: o.button || (o.buttons ? 'left' : 'none'), buttons: o.buttons || 0, clickCount: o.clickCount || 0, modifiers: o.modifiers || 0 });
  const click = async (x, y, modifiers = 0) => { await mouse('mouseMoved', x, y, { modifiers }); await sleep(30); await mouse('mousePressed', x, y, { button: 'left', buttons: 1, clickCount: 1, modifiers }); await sleep(60); await mouse('mouseReleased', x, y, { button: 'left', buttons: 0, clickCount: 1, modifiers }); };
  const stroke = async (pts, modifiers = 0) => {
    await mouse('mouseMoved', pts[0].x, pts[0].y, { modifiers }); await sleep(40);
    await mouse('mousePressed', pts[0].x, pts[0].y, { button: 'left', buttons: 1, clickCount: 1, modifiers });
    for (const p of pts.slice(1)) { await mouse('mouseMoved', p.x, p.y, { button: 'left', buttons: 1, modifiers }); await sleep(8); }
    await mouse('mouseReleased', pts[pts.length - 1].x, pts[pts.length - 1].y, { button: 'left', buttons: 0, clickCount: 1, modifiers });
  };
  return { send, evaluate, reload, mouse, click, stroke, errors, close: () => { ws.close(); kill(); } };
}
// 앱을 띄우고 그 지도 종류로 맞춘 뒤 저장 획을 넣고(없으면 그대로) 새로고침
async function prepare(app, strokesWork) {
  await app.reload(8000);
  await app.evaluate(`__h.setupCG(${JSON.stringify(RES)}, ${JSON.stringify(STYLE)})`);
  if (strokesWork) {
    await app.evaluate(`(() => { const w = __h.work(); w.brushByStyle = w.brushByStyle || {}; w.brushByStyle[w.style] = ${JSON.stringify(strokesWork)}; localStorage.setItem('wcg_work', JSON.stringify(w)); localStorage.removeItem('wcg_pending_start'); sessionStorage.setItem('wcg_open', '1'); return true; })()`);
    await app.reload(9000);
  }
}
const regionsOf = async (app) => (STYLE === 'seoul' ? (await app.evaluate('__h.sidoList()')).slice(0, 2) : ['경기', '강원']);
// 캡처: 페이지에 저장(__eq.store) 후 조각(이미지·래스터 하나씩)으로 꺼내 node 에 보관 — 큰 응답 한 번에 안 받는다
const J = JSON.stringify;
const snap = async (app, name) => {
  const meta = await app.evaluate(`__eq.store(${J(name)})`);
  const keys = await app.evaluate(`__eq.keys(${J(name)})`);
  const pieces = {};
  for (const k of keys) pieces[k] = await app.evaluate(`__eq.get(${J(name)}, ${J(k)})`);
  return { meta, pieces };
};
const push = async (app, name, cap) => {
  await app.evaluate(`(() => { __eq.caps[${J(name)}] = { imgs: [], ae: {}, frame: null, strokes: ${J(cap.meta.strokes)} }; return true; })()`);
  for (const [k, v] of Object.entries(cap.pieces)) {
    const m = k.startsWith('img:') ? { img: cap.meta.meta[+k.slice(4)], strokes: cap.meta.strokes } : { strokes: cap.meta.strokes };
    await app.evaluate(`__eq.put(${J(name)}, ${J(k)}, ${J(v)}, ${J(m)})`);
  }
};
const cmpCaps = async (app, a, b) => { await push(app, '__a', a); await push(app, '__b', b); return app.evaluate(`__eq.cmpCaps('__a', '__b')`); };
const summary = (r) => {
  const all = [...r.imgs.filter((x) => !x.missing), ...(r.frame ? [r.frame] : []), ...Object.values(r.ae)];
  const worst = (k) => Math.max(0, ...all.map((x) => x[k] || 0));
  return { strokes: r.strokes, imgCount: r.imgCount, metaDiffs: r.meta.length, missing: r.imgs.filter((x) => x.missing).length,
    identicalImgs: r.imgs.filter((x) => x.same || x.diffPx === 0).length, maxAbs: worst('maxAbs'), maxOver2: worst('over2'), maxOver8: worst('over8'), maxOver32: worst('over32'),
    frame: r.frame && { diffPx: r.frame.diffPx || 0, maxAbs: r.frame.maxAbs || 0, over8: r.frame.over8 || 0 } };
};

(async () => {
  const report = { style: STYLE, res: RES, strokes: NSTROKES, old: OLD, new: NEW };
  // ---- 저장 획 만들기(바꾼 앱의 도우미로 생성 — 저장 형식 그대로) ----
  const app = await launch(NEW);
  log('launched new'); await prepare(app, null); log('prepared');
  const regs = await regionsOf(app); log('regions', regs);
  const gen = await app.evaluate(`__h.genStrokes(${JSON.stringify(regs)}, ${NSTROKES}, { runLen: 7, eraseEvery: 9, cols: ['#E5231E', '#2E6FB0', '#F2C230', '#3DAA5C'] }).strokes`);
  // 섬(인셋) 공간 획도 몇 개 섞는다 — 인셋 그룹 로컬 좌표, 그 섬 시도만 영역
  const insetStrokes = await app.evaluate(`(() => {
    const out = []; let s = 99; const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    for (const g of document.querySelectorAll('[id^="insetT-"]')) {
      const key = g.id.slice(7), z = g.querySelector('path.zone'); if (!z || getComputedStyle(g.parentNode).display === 'none') continue;
      const b = z.getBBox(), keys = [key + '::' + __h.sidoOf(z.dataset.id)], r = Math.max(1, Math.min(b.width, b.height) * 0.25);
      for (const [col, erase] of [['#E5231E', 0], ['#E5231E', 0], ['#2E6FB0', 0], ['#2E6FB0', 1]]) {
        const dabs = []; let x = b.x + b.width * (0.3 + 0.4 * rnd()), y = b.y + b.height * (0.3 + 0.4 * rnd());
        for (let i = 0; i < 12; i++) { dabs.push([x, y]); x += (rnd() - 0.5) * r * 0.6; y += (rnd() - 0.5) * r * 0.6; }
        out.push({ space: key, keys, col, r, op: 55, soft: 70, erase: !!erase, dabs });
      }
    }
    return out;
  })()`);
  for (let i = 0; i < insetStrokes.length; i++) gen.splice(Math.min(gen.length, 5 + i * 7), 0, insetStrokes[i]);   // 본토 획 사이사이에
  report.regions = regs; report.genStrokes = gen.length; report.insetStrokes = insetStrokes.length; log('gen', gen.length, 'inset', insetStrokes.length);
  // ---- A) 바꾼 앱: 저장 획 → 처음부터 굽기 ----
  await app.evaluate(`(() => { const w = __h.work(); w.brushByStyle = w.brushByStyle || {}; w.brushByStyle[w.style] = ${JSON.stringify(gen)}; localStorage.setItem('wcg_work', JSON.stringify(w)); localStorage.removeItem('wcg_pending_start'); sessionStorage.setItem('wcg_open', '1'); return true; })()`);
  await app.reload(9000); log('reloaded with strokes');
  const newA = await snap(app, 'c');
  log('A new captured', newA.meta.n, 'imgs');
  // ---- B) 실제 입력으로 칠하기 ----
  await app.evaluate(`(() => { if (!document.querySelector('#mBrush').classList.contains('on')) document.querySelector('#mBrush').click(); return true; })()`);
  const pA = await app.evaluate(`__h.pointIn(${JSON.stringify(regs[0])}, 1)`), pB = await app.evaluate(`__h.pointIn(${JSON.stringify(regs[1])}, 2)`);
  await app.click(pA.x, pA.y, 8); await sleep(300); await app.click(pB.x, pB.y, 8); await sleep(300);
  await app.mouse('mouseMoved', pA.x, pA.y, {}); await sleep(200);
  const path1 = await app.evaluate(`__h.strokePath(${JSON.stringify(regs[0])}, 40, 7)`);
  const path2 = await app.evaluate(`__h.strokePath(${JSON.stringify(regs[0])}, 30, 3)`);
  const path3 = await app.evaluate(`__h.strokePath(${JSON.stringify(regs[1])}, 35, 5)`);
  const path4 = await app.evaluate(`__h.strokePath(${JSON.stringify(regs[0])}, 25, 9)`);
  const lastCol = gen.filter((s) => !s.erase && (s.space || 'main') === 'main').pop().col;
  const steps = [
    ['같은 색 잇기', lastCol, path1, 0],
    ['다른 색(덮기)', '#7B3FA0', path2, 0],
    ['같은 색 한 번 더', '#7B3FA0', path3, 0],
    ['지우개(Ctrl)', '#7B3FA0', path4, 2],
    ['지우개 뒤 새 색', '#E5231E', path1.slice().reverse(), 0],
  ];
  for (const [name, col, pts, mod] of steps) { await app.evaluate(`__eq.setColor(${JSON.stringify(col)})`); await app.stroke(pts, mod); await app.evaluate('__eq.settle(500)'); log('stroke', name); }
  await app.evaluate(`__h.setRange('#brSoft', 100) && __h.setRange('#brSize', 150)`);
  await app.evaluate(`__eq.setColor('#2E6FB0')`); await app.stroke(path3.slice().reverse(), 0); await app.evaluate('__eq.settle(500)');
  await app.evaluate(`__h.setRange('#brSoft', 70) && __h.setRange('#brSize', 55)`);
  await sleep(800);   // 저장(손 뗀 뒤 0.4초)
  const incB1 = await snap(app, 'c');
  const work1 = await app.evaluate('__h.work().brushByStyle[__h.work().style]');
  await app.reload(9000);
  const fullB1 = await snap(app, 'c');
  report.B1_incremental_vs_rebuild = summary(await cmpCaps(app, incB1, fullB1));
  log('B1', JSON.stringify(report.B1_incremental_vs_rebuild));
  // 되돌리기 2번 · 다시 실행 1번 (새로고침 뒤라 조각이 처음부터 굽기 때 남긴 것 — 최근 40획)
  await app.evaluate(`(() => { if (!document.querySelector('#mBrush').classList.contains('on')) document.querySelector('#mBrush').click(); return true; })()`);
  await app.click(pA.x, pA.y, 8); await sleep(300); await app.click(pB.x, pB.y, 8); await sleep(300); await app.mouse('mouseMoved', pA.x, pA.y, {}); await sleep(200);
  await app.evaluate(`__eq.setColor('#3DAA5C')`); await app.stroke(path2, 0); await app.evaluate('__eq.settle(500)');
  await app.evaluate(`__eq.setColor('#F2C230')`); await app.stroke(path4, 0); await app.evaluate('__eq.settle(500)');
  await app.evaluate(`(async () => { document.querySelector('#undo').click(); await __eq.settle(400); document.querySelector('#undo').click(); await __eq.settle(600); return true; })()`);
  await sleep(1800);   // 자동저장(1.5초)
  const undoB2 = await snap(app, 'c');
  await app.reload(9000);
  const undoB2full = await snap(app, 'c');
  report.B2_undo_vs_rebuild = summary(await cmpCaps(app, undoB2, undoB2full));
  report.B2_undoLeftStrokes = undoB2.meta.strokes;
  log('B2', JSON.stringify(report.B2_undo_vs_rebuild));
  // 되돌리기 → 다시 실행 (이번엔 같은 세션에서 칠한 획 2개를 되돌렸다가 1개 다시)
  await app.evaluate(`(() => { if (!document.querySelector('#mBrush').classList.contains('on')) document.querySelector('#mBrush').click(); return true; })()`);
  await app.click(pA.x, pA.y, 8); await sleep(300); await app.click(pB.x, pB.y, 8); await sleep(300); await app.mouse('mouseMoved', pA.x, pA.y, {}); await sleep(200);
  await app.evaluate(`__eq.setColor('#E5231E')`); await app.stroke(path4, 0); await app.evaluate('__eq.settle(500)');
  await app.evaluate(`__eq.setColor('#2E6FB0')`); await app.stroke(path1, 2); await app.evaluate('__eq.settle(500)');
  await app.evaluate(`(async () => { document.querySelector('#undo').click(); await __eq.settle(400); document.querySelector('#undo').click(); await __eq.settle(400); document.querySelector('#redo').click(); await __eq.settle(600); return true; })()`);
  await sleep(1800);
  const redoB3 = await snap(app, 'c');
  const workFinal = await app.evaluate('__h.work().brushByStyle[__h.work().style]');
  await app.reload(9000);
  const redoB3full = await snap(app, 'c');
  report.B3_undo_redo_vs_rebuild = summary(await cmpCaps(app, redoB3, redoB3full));
  report.finalStrokes = workFinal.length;
  log('B3', JSON.stringify(report.B3_undo_redo_vs_rebuild));
  report.newErrors = app.errors.slice();
  app.close();
  fs.writeFileSync(path.join(OUT, `equiv_${STYLE}_work.json`), JSON.stringify({ gen, work1, workFinal }));
  // ---- 옛 앱: A(같은 저장 획) · C(B에서 칠한 최종 획) ----
  if (OLD) {
    const old = await launch(OLD);
    await prepare(old, gen);
    const oldA = await snap(old, 'c');
    report.A_old_vs_new_rebuild = summary(await cmpCaps(old, oldA, newA));
    report.A_detail = (await cmpCaps(old, oldA, newA));
    
    log('A', JSON.stringify(report.A_old_vs_new_rebuild));
    await prepare(old, workFinal);
    const oldC = await snap(old, 'c');
    report.C_old_vs_new_interactive = summary(await cmpCaps(old, oldC, redoB3full));
    log('C', JSON.stringify(report.C_old_vs_new_interactive));
    // 화면 그림(실제 앱 창) 비교용 스크린샷: 옛 앱
    report.oldErrors = old.errors.slice();
    old.close();
  }
  const file = path.join(OUT, `equiv_${STYLE}.json`);
  fs.writeFileSync(file, JSON.stringify(report, null, 1));
  log('saved', file);
  console.log(JSON.stringify({ ...report, A_detail: undefined }, null, 1));
  process.exit(0);
})().catch((e) => { console.error('equiv error', e); process.exit(2); });
