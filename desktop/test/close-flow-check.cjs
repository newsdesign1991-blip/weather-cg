// 창 닫기 전 묻기 — 실제 앱 점검기. 숨김 창(점검 모드)으로 앱을 띄우고, 메인 프로세스(Node 검사기 --inspect)에서
// 진짜로 win.close()를 불러 main.js(close 막기·묻기) → preload → 웹앱(closeAsk) → 답 → 닫힘을 끝까지 본다.
// 사용: node close-flow-check.cjs [앱폴더]   출력: JSON {ok, results{clean, dirty, frozen, reload, crashed}, errors[]}. 하나라도 어긋나면 종료코드 1.
//  - clean : 아무것도 안 바꾸고 닫기 → 묻지 않고 곧바로 꺼진다
//  - dirty : 칠한 뒤 닫기 → 팝업(창은 그대로) · 또 닫기 → 팝업 하나 · 5초 넘게 둬도 안 꺼짐 · [취소] → 그대로 · 다시 닫기 → [저장 안 함] → 꺼진다
//  - frozen: 웹앱이 멈춘 채 닫기 → 시간 제한(5초) 뒤 그냥 꺼진다
//  - reload: 칠한 뒤 새로고침 → 닫기 → 그래도 팝업(변경 이어받음·새 페이지 콜백) + 최소화 흉내 창을 되살림 → [저장 안 함] → 꺼진다
//  - crashed: 웹앱 렌더러가 죽은 채 닫기 → 시간 제한 없이 곧바로 꺼진다
// 메인 검사기는 닫기 직전에 끊는다 — Node는 붙어 있는 검사기가 떨어질 때까지 끝나지 않는다.
// tests 와 같은 임시 사용자 폴더(%TEMP%\wcg-test-<pid>)를 쓰고 끝나면 지운다. 사용자가 켜 둔 앱은 건드리지 않는다(단일 인스턴스 해제 모드).
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const net = require('net');
const path = require('path');
const { rmTestProfile } = require('./test-profile.cjs');

const DESK = path.resolve(__dirname, '..');
const ELECTRON = path.join(DESK, 'node_modules', 'electron', 'dist', 'electron.exe');
const appDir = path.resolve(process.argv.slice(2).find((x) => !x.startsWith('--')) || path.resolve(DESK, '..'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = () => new Promise((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });

// CDP(웹소켓) 한 줄 — 렌더러(--remote-debugging-port)·메인(--inspect) 공용
async function cdp(url) {
  const ws = new WebSocket(url);
  await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
  let id = 0; const pending = new Map();
  ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); try { ws.send(JSON.stringify({ id: i, method, params })); } catch (e) { r({ error: e }); } });
  const evalJs = async (expression, awaitPromise = true) => {
    const r = await Promise.race([send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true }), sleep(30000).then(() => ({ timeout: true }))]);
    if (r.timeout) throw new Error('평가 시간 초과: ' + expression.slice(0, 80));
    if (r.result && r.result.exceptionDetails) throw new Error((r.result.exceptionDetails.exception && r.result.exceptionDetails.exception.description) || r.result.exceptionDetails.text);
    return r.result && r.result.result ? r.result.result.value : undefined;
  };
  return { ws, send, evalJs, close: () => { try { ws.close(); } catch (e) {} } };
}

// 앱 하나 띄우기 — 렌더러·메인 검사기 연결까지
async function launch() {
  const [rport, iport] = [await freePort(), await freePort()];
  const proc = spawn(ELECTRON, ['.', `--remote-debugging-port=${rport}`, `--inspect=${iport}`], {
    cwd: DESK, env: { ...process.env, WCG_APP_DIR: appDir, WCG_TEST: '1', WCG_TEST_SIZE: '1600x900' }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  let exitedAt = 0; proc.on('exit', () => { exitedAt = Date.now(); });
  proc.stdout.on('data', () => {}); proc.stderr.on('data', () => {});
  const find = async (port, pick) => { for (let i = 0; i < 75; i++) { await sleep(400); try { const l = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); const p = l.find(pick); if (p) return p; } catch (e) {} } return null; };
  const page = await find(rport, (p) => p.type === 'page' && p.url.startsWith('app://weathercg'));
  const node = await find(iport, (p) => !!p.webSocketDebuggerUrl);
  if (!page || !node) { kill(proc); throw new Error('앱 연결 실패 ' + JSON.stringify({ page: !!page, node: !!node })); }
  const R = await cdp(page.webSocketDebuggerUrl), M = await cdp(node.webSocketDebuggerUrl);
  await M.send('Runtime.enable');
  return { proc, R, M, exited: () => exitedAt };
}
function kill(proc) {
  if (!proc) return;
  try { execFileSync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore' }); } catch (e) {}
  rmTestProfile(proc.pid);
}
// 메인에서 진짜 닫기(X·Alt+F4와 같은 BrowserWindow 'close')
const APP_WIN = "process.mainModule.require('electron').BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().startsWith('app://'))";
const mainClose = (M) => M.evalJs(`(() => { const w = ${APP_WIN}; if (!w) return 'no-window'; w.close(); return 'asked'; })()`, false);
const waitExit = async (app, ms) => { const t = Date.now(); while (Date.now() - t < ms) { if (app.exited()) return app.exited() - t; await sleep(100); } return -1; };

// 웹앱 준비: 부팅 팝업 닫기 → (시작 화면이면) 장면 설정으로 들어가기 → 필요하면 칠하기
const PREP = (paint) => `(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); const $ = (s) => document.querySelector(s);
  const closeBoot = async () => { for (let i = 0; i < 12; i++) { if ($('#tourWrap.on')) $('#tourClose').click(); const x = document.querySelector('#tossOv .tossX'); if (x) x.click(); await sleep(150); if (!$('#tourWrap.on') && !document.getElementById('tossOv')) break; } };
  await closeBoot();
  if ($('#startOverlay').classList.contains('on')) {
    if (!$('#cgSetupOv').classList.contains('on')) { $('#startSetup').click(); await sleep(400); }
    $('#resBtns [data-res="1920x1080"]').click(); $('#styleBtns [data-style="sido"]').click(); await sleep(80);
    $('#cgsDone').click(); await sleep(1500); await closeBoot();
  }
  if (${paint ? 'true' : 'false'}) {
    $('#mPaint').click(); await sleep(120);
    const z = [...document.querySelectorAll('#gMain > path.zone')].map((el) => ({ el, r: el.getBoundingClientRect() })).sort((a, b) => b.r.width * b.r.height - a.r.width * a.r.height)[0];
    const x = z.r.left + z.r.width / 2, y = z.r.top + z.r.height / 2;
    const pe = (type) => new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: type === 'pointerup' ? 0 : 1, pointerId: 1, isPrimary: true });
    z.el.dispatchEvent(pe('pointerdown')); window.dispatchEvent(pe('pointerup')); await sleep(300);
  }
  return { dirty: workDirty(), start: $('#startOverlay').classList.contains('on') };
})()`;
const POPS = "({ pops: document.querySelectorAll('#tossOv .tossCard.closeAsk').length, title: (document.querySelector('#tossOv .tossTitle') || {}).textContent || '', buttons: [...document.querySelectorAll('#tossOv .tossFoot button')].map((b) => b.textContent.trim()) })";
const click = (k) => `(() => { const b = document.querySelector('#tossOv .tossFoot [data-${k}]'); if (b) b.click(); return !!b; })()`;

(async () => {
  if (!fs.existsSync(ELECTRON)) { console.log(JSON.stringify({ ok: false, errors: ['electron 없음: ' + ELECTRON] })); process.exit(2); }
  const results = {}, errors = [];
  const run = async (name, fn) => {
    let app = null;
    try { app = await launch(); await sleep(7000); results[name] = await fn(app); }
    catch (e) { errors.push(name + ': ' + (e && e.message)); }
    finally { if (app) { app.R.close(); app.M.close(); if (!app.exited()) kill(app.proc); else rmTestProfile(app.proc.pid); } }
  };
  await run('clean', async (a) => {
    const prep = await a.R.evalJs(PREP(false));
    const asked = await a.M.evalJs("(() => { const { BrowserWindow } = process.mainModule.require('electron'); return BrowserWindow.getAllWindows().length; })()", false);
    await mainClose(a.M); a.M.close();   // 검사기를 끊어야 프로세스가 끝난다(Node는 붙은 검사기를 기다린다)
    return { prep, windows: asked, exitMs: await waitExit(a, 8000) };
  });
  await run('dirty', async (a) => {
    const prep = await a.R.evalJs(PREP(true));
    await mainClose(a.M); await sleep(800);
    const first = { ...(await a.R.evalJs(POPS)), alive: !a.exited() };
    await mainClose(a.M); await sleep(600);
    const again = { pops: (await a.R.evalJs(POPS)).pops, alive: !a.exited() };
    await sleep(5600);   // 시간 제한(5초)을 넘겨도 사용자가 고르는 중이면 안 꺼진다
    const afterTimeout = { pops: (await a.R.evalJs(POPS)).pops, alive: !a.exited() };
    await a.R.evalJs(click('cancel')); await sleep(800);
    const cancel = { pops: (await a.R.evalJs(POPS)).pops, alive: !a.exited(), dirty: await a.R.evalJs('workDirty()') };
    await mainClose(a.M); await sleep(800);
    const reopen = (await a.R.evalJs(POPS)).pops;
    a.M.close(); await a.R.evalJs(click('discard'));
    return { prep, first, again, afterTimeout, cancel, reopen, exitMs: await waitExit(a, 8000) };
  });
  await run('frozen', async (a) => {
    const prep = await a.R.evalJs(PREP(true));
    await a.R.evalJs('setTimeout(() => { const t = Date.now(); while (Date.now() - t < 20000) {} }, 50); 1', false);   // 웹앱을 20초 멈춘다
    await sleep(300);
    await mainClose(a.M); a.M.close();
    const ms = await waitExit(a, 15000);
    return { prep, exitMs: ms };
  });
  // 칠한 뒤 새로고침(Ctrl+R) → '변경 있음'을 이어받고, 새 페이지의 preload 콜백으로 물어 팝업이 뜬다(옛 페이지 콜백이 대신 'close'로 답하지 않는다).
  // 최소화한 창을 작업표시줄에서 닫은 경우 흉내 — 숨김 창을 실제로 띄우지 않게 창의 isMinimized·restore·focus 를 바꿔 끼워 팝업이 뜰 때 되살리는지만 본다.
  await run('reload', async (a) => {
    const prep = await a.R.evalJs(PREP(true));
    await a.M.evalJs(`(() => { ${APP_WIN}.webContents.reload(); return 1; })()`, false);
    await sleep(7000);
    const after = await a.R.evalJs(`(async () => { const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      for (let i = 0; i < 12 && document.getElementById('tossOv'); i++) { const x = document.querySelector('#tossOv .tossX'); if (x) x.click(); await sleep(150); }
      return { dirty: workDirty(), start: document.querySelector('#startOverlay').classList.contains('on') }; })()`);
    await a.M.evalJs(`(() => { const w = ${APP_WIN}; global.__wcgReveal = []; w.isMinimized = () => true; w.restore = () => { global.__wcgReveal.push('restore'); }; w.focus = () => { global.__wcgReveal.push('focus'); }; return 1; })()`, false);
    await mainClose(a.M); await sleep(800);
    const first = { ...(await a.R.evalJs(POPS)), alive: !a.exited(), reveal: await a.M.evalJs('global.__wcgReveal', false) };
    a.M.close(); await a.R.evalJs(click('discard'));
    return { prep, after, first, exitMs: await waitExit(a, 8000) };
  });
  // 웹앱 렌더러가 죽은 채(흰 창) 닫기 → 물을 곳이 없으니 시간 제한(5초)을 기다리지 않고 곧바로 꺼진다
  await run('crashed', async (a) => {
    const prep = await a.R.evalJs(PREP(true));
    a.R.close();
    await a.M.evalJs(`(() => { ${APP_WIN}.webContents.forcefullyCrashRenderer(); return 1; })()`, false);
    await sleep(1500);
    await mainClose(a.M); a.M.close();
    return { prep, exitMs: await waitExit(a, 8000) };
  });
  const c = results.clean, d = results.dirty, f = results.frozen, rl = results.reload, cr = results.crashed;
  const fail = [];
  if (!c || c.exitMs < 0 || c.exitMs > 3000) fail.push('clean: 변경 없으면 곧바로 꺼져야 함 ' + JSON.stringify(c));
  if (!d || !d.prep.dirty || d.first.pops !== 1 || !d.first.alive || d.first.title !== '저장하지 않은 변경이 있어요'
    || d.first.buttons.join('|') !== '저장 안 함|취소|저장' || d.again.pops !== 1 || !d.again.alive || !d.afterTimeout.alive || d.afterTimeout.pops !== 1
    || d.cancel.pops !== 0 || !d.cancel.alive || !d.cancel.dirty || d.reopen !== 1 || d.exitMs < 0 || d.exitMs > 3000) fail.push('dirty: ' + JSON.stringify(d));
  if (!f || f.exitMs < 4000 || f.exitMs > 9000) fail.push('frozen: 멈춘 웹앱은 약 5초 뒤 꺼져야 함 ' + JSON.stringify(f));
  if (!rl || !rl.prep.dirty || !rl.after.dirty || rl.after.start || rl.first.pops !== 1 || !rl.first.alive
    || !(rl.first.reveal || []).includes('restore') || !(rl.first.reveal || []).includes('focus') || rl.exitMs < 0 || rl.exitMs > 3000) fail.push('reload: 새로고침 뒤에도 물어야 함(창을 되살려) ' + JSON.stringify(rl));
  if (!cr || !cr.prep.dirty || cr.exitMs < 0 || cr.exitMs > 2500) fail.push('crashed: 죽은 웹앱은 곧바로 꺼져야 함 ' + JSON.stringify(cr));
  const out = { ok: !errors.length && !fail.length, appDir, results, errors: [...errors, ...fail] };
  console.log(JSON.stringify(out, null, 2));
  process.exit(out.ok ? 0 : 1);
})().catch((e) => { console.log(JSON.stringify({ ok: false, errors: ['점검기 오류: ' + e.message] })); process.exit(2); });
