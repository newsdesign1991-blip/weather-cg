// 편집 화면(실제 창) 비교 — 옛 앱·바꾼 앱에 같은 저장 획을 넣고 #cg 영역 스크린샷을 픽셀로 비교한다.
// (추출은 equiv.cjs 가 본다. 여기선 바꾼 앱에 늘 붙어 있는 라이브 캔버스(foreignObject)가 화면 그림을 바꾸지 않는지 본다.)
// 사용: node shotcmp.cjs --old=<옛 앱> --work=<equiv_<style>_work.json> [--style=sgg] [--out=<폴더>]
const { spawn, execFileSync } = require('child_process');
const { rmTestProfile } = require('../test-profile.cjs');
const fs = require('fs'); const net = require('net'); const path = require('path');
const args = process.argv.slice(2);
const opt = (k, d) => { const a = args.find((x) => x === `--${k}` || x.startsWith(`--${k}=`)); if (!a) return d; return a.includes('=') ? a.slice(k.length + 3) : true; };
const HERE = __dirname, DESK = path.resolve(HERE, '..', '..');
const ELECTRON = path.join(DESK, 'node_modules', 'electron', 'dist', 'electron.exe');
const OLD = path.resolve(opt('old')), NEW = path.resolve(opt('new', path.resolve(DESK, '..')));
const STYLE = opt('style', 'sgg'), RES = opt('res', '1920x1080');
const OUT = path.resolve(opt('out', path.join(require('os').tmpdir(), 'wcg-brushperf'))); fs.mkdirSync(OUT, { recursive: true });
const WORK = JSON.parse(fs.readFileSync(path.resolve(opt('work')), 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = () => new Promise((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const HELP = fs.readFileSync(path.join(HERE, 'helpers.js'), 'utf8') + '\n' + fs.readFileSync(path.join(HERE, 'equiv-page.js'), 'utf8');
const KILLS = []; process.on('exit', () => { for (const k of KILLS) k(); });
async function launch(appDir) {
  const port = await freePort();
  const proc = spawn(ELECTRON, [path.join(HERE, 'perf-main.js'), `--remote-debugging-port=${port}`], { cwd: DESK, env: { ...process.env, WCG_MAIN: path.join(DESK, 'main.js'), WCG_APP_DIR: appDir, WCG_TEST: '1', WCG_TEST_SIZE: '1920x1080' }, stdio: 'ignore', windowsHide: false });
  const kill = () => { try { execFileSync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore' }); } catch (e) {} rmTestProfile(proc.pid); };   // + 임시 사용자 폴더 정리
  KILLS.push(kill);
  let page = null;
  for (let i = 0; i < 80 && !page; i++) { await sleep(400); try { const l = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); page = l.find((p) => p.type === 'page' && p.url.startsWith('app://weathercg')); } catch (e) {} }
  const ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener('open', r));
  let id = 0; const pending = new Map(); const listeners = [];
  ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; } for (const l of listeners) l(m); });
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.text + ' ' + (r.result.exceptionDetails.exception && r.result.exceptionDetails.exception.description)); return r.result.result.value; };
  const waitLoad = () => new Promise((r) => { const f = (m) => { if (m.method === 'Page.loadEventFired') { listeners.splice(listeners.indexOf(f), 1); r(); } }; listeners.push(f); });
  await send('Runtime.enable'); await send('Page.enable');
  const reload = async (extra) => { const w = waitLoad(); await send('Page.reload', {}); await w; await sleep(extra); await evaluate(HELP); await evaluate('__h.closePopups()'); await evaluate('__eq.settle(800)'); };
  return { send, evaluate, reload, close: () => { ws.close(); kill(); } };
}
async function shot(appDir, strokes) {
  const app = await launch(appDir);
  await app.reload(8000);
  await app.evaluate(`__h.setupCG(${JSON.stringify(RES)}, ${JSON.stringify(STYLE)})`);
  await app.evaluate(`(() => { const w = __h.work(); w.brushByStyle = w.brushByStyle || {}; w.brushByStyle[w.style] = ${JSON.stringify(strokes)}; localStorage.setItem('wcg_work', JSON.stringify(w)); localStorage.removeItem('wcg_pending_start'); sessionStorage.setItem('wcg_open', '1'); return true; })()`);
  await app.reload(9000);
  await app.evaluate(`(() => { document.querySelector('#mBrush').click(); return true; })()`);   // 브러쉬 모드(라이브 캔버스가 붙은 상태)
  await sleep(1500);
  await app.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5 });   // 커서를 지도 밖으로
  await sleep(800);
  const rect = await app.evaluate(`(() => { const r = document.querySelector('#cg').getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height, scale: 1 }; })()`);
  const s = await app.send('Page.captureScreenshot', { format: 'png', clip: rect });
  const live = await app.evaluate(`[...document.querySelectorAll('.brushLayer.brushLive')].map((e) => e.tagName + ':' + (e.style.display || 'shown'))`);
  app.close();
  return { png: 'data:image/png;base64,' + s.result.data, rect, live };
}
(async () => {
  const strokes = WORK.workFinal || WORK.gen;
  const a = await shot(OLD, strokes), b = await shot(NEW, strokes);
  fs.writeFileSync(path.join(OUT, `shot_${STYLE}_old.png`), Buffer.from(a.png.split(',')[1], 'base64'));
  fs.writeFileSync(path.join(OUT, `shot_${STYLE}_new.png`), Buffer.from(b.png.split(',')[1], 'base64'));
  const app = await launch(NEW); await app.reload(6000);
  const cmp = await app.evaluate(`__eq.cmp(${JSON.stringify(a.png)}, ${JSON.stringify(b.png)})`);
  app.close();
  const res = { style: STYLE, strokes: strokes.length, rect: [a.rect, b.rect], live: [a.live, b.live], screenOldVsNew: cmp };
  fs.writeFileSync(path.join(OUT, `shot_${STYLE}.json`), JSON.stringify(res, null, 1));
  console.log(JSON.stringify(res));
  process.exit(0);
})().catch((e) => { console.error('shot error', e); process.exit(2); });
