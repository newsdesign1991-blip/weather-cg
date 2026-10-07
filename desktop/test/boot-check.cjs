// 앱 부팅 점검기 — 지정 폴더의 웹앱을 데스크톱 셸(Electron)로 '숨김 창'에 띄워 부팅·콘솔 오류를 모은다.
// 사용: node boot-check.cjs [앱폴더] [--wait=8000] [--eval=<JS 식 또는 .js 파일>] [--shot=<png>]
//  - 앱폴더 기본값: 이 파일 기준 ../..(WeatherCG). git 작업트리 경로를 주면 그 코드를 띄운다.
//  - --eval: 부팅 후 페이지에서 실행할 식(await 가능). 결과(JSON 직렬화)를 evalResult로 출력. DOM 클릭/키 이벤트로 기능 점검에 쓴다.
//  - 출력: JSON {ok, errors[], ignored[], smoke{}, evalResult}. 오류가 있으면 종료코드 1.
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const net = require('net');
const path = require('path');

const DESK = path.resolve(__dirname, '..');
const ELECTRON = path.join(DESK, 'node_modules', 'electron', 'dist', 'electron.exe');
const args = process.argv.slice(2);
const opt = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const appDir = path.resolve(args.find((x) => !x.startsWith('--')) || path.resolve(DESK, '..'));
const WAIT = +opt('wait', 8000);
const EVAL = opt('eval', '');
const SHOT = opt('shot', '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// 이 환경에서 원래 나는 무해한 오류(헬퍼 꺼짐, 외부 네트워크) — 따로 모아 보여만 준다
const BENIGN = /127\.0\.0\.1:372[01]|ERR_CONNECTION_REFUSED|ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED|apihub\.kma\.go\.kr|api\.mapbox\.com|jsdelivr|favicon/i;

const freePort = () => new Promise((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });

(async () => {
  if (!fs.existsSync(ELECTRON)) { console.log(JSON.stringify({ ok: false, errors: ['electron 없음: ' + ELECTRON] })); process.exit(2); }
  if (!fs.existsSync(path.join(appDir, 'index.html'))) { console.log(JSON.stringify({ ok: false, errors: ['index.html 없음: ' + appDir] })); process.exit(2); }
  const port = await freePort();
  const proc = spawn(ELECTRON, ['.', `--remote-debugging-port=${port}`], {
    cwd: DESK, env: { ...process.env, WCG_APP_DIR: appDir, WCG_TEST: '1' }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  let mainLog = '';
  proc.stdout.on('data', (d) => { mainLog += d; });
  proc.stderr.on('data', (d) => { mainLog += d; });
  const kill = () => { try { execFileSync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore' }); } catch (e) {} };
  let page = null;
  for (let i = 0; i < 60 && !page; i++) {
    await sleep(400);
    try { const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); page = list.find((p) => p.type === 'page' && p.url.startsWith('app://weathercg')); } catch (e) {}
  }
  if (!page) { kill(); console.log(JSON.stringify({ ok: false, errors: ['페이지를 못 찾음'], mainLog: mainLog.slice(-1500) })); process.exit(1); }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0; const pending = new Map(); const errors = []; const ignored = [];
  const push = (msg) => (BENIGN.test(msg) ? ignored : errors).push(msg.slice(0, 600));
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') { const d = m.params.exceptionDetails; push('EXC ' + ((d.exception && d.exception.description) || d.text) + (d.url ? ` @${d.url}:${d.lineNumber + 1}` : '')); }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') push('CONSOLE ' + m.params.args.map((a) => (a.value !== undefined ? a.value : a.description)).join(' '));
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') push('LOG ' + m.params.entry.text + ' ' + (m.params.entry.url || ''));
  });
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
  await send('Page.reload', { ignoreCache: true });   // 처음부터 다시 — 부팅 오류를 놓치지 않게
  await sleep(WAIT);
  const smoke = await send('Runtime.evaluate', { returnByValue: true, expression: `({ title: document.title, panel: !!document.querySelector('#panel'), secs: document.querySelectorAll('#panel > .sec').length, stage: !!document.querySelector('#stage'), svg: !!document.querySelector('#cg'), bodyLen: document.body.innerText.length })` });
  let evalResult;
  if (EVAL) {
    // 파일이면 async 함수 '본문'(return 으로 결과), 인라인이면 '식'
    const isFile = fs.existsSync(EVAL);
    const code = isFile ? fs.readFileSync(EVAL, 'utf8') : EVAL;
    const r = await send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression: isFile ? `(async () => { ${code}\n})()` : `(async () => (${code}))()` });
    evalResult = r.result.exceptionDetails ? { error: (r.result.exceptionDetails.exception && r.result.exceptionDetails.exception.description) || r.result.exceptionDetails.text } : r.result.result.value;
    await sleep(500);
  }
  if (SHOT) { const s = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(SHOT, Buffer.from(s.result.data, 'base64')); }
  ws.close(); kill();
  const out = { ok: errors.length === 0, appDir, errors, ignored, smoke: smoke.result.result.value, evalResult };
  console.log(JSON.stringify(out, null, 2));
  process.exit(out.ok ? 0 : 1);
})().catch((e) => { console.log(JSON.stringify({ ok: false, errors: ['점검기 오류: ' + e.message] })); process.exit(2); });
