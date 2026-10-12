#!/usr/bin/env node
'use strict';
// 설치판 점검기 — 설치한 폴더(또는 빌드의 win-unpacked)의 '날씨 CG.exe'를 숨김 점검 모드로 띄워 실제로 뜨는지 본다. MODULES.md 10장 '설치판 만들기'.
//
//   node tools/check-installed.cjs <설치 폴더> [--wait=9000] [--shot=<png>] [--json=<결과 파일>]
//
// 보는 것(값이 아니라 있다/없다·길이만 — 키·토큰 값은 출력하지 않는다):
//  · 담긴 것: resources\app.asar 목록에 넣으면 안 되는 것(tools/build-installer.cjs FORBIDDEN)이 없고, 비공개 키 2개가 있고,
//    ffmpeg.exe·SUITE 폰트가 asar 밖(app.asar.unpacked\desktop\helper)에 있고, 그 ffmpeg 가 실행되는지.
//  · 노드 모드(ELECTRON_RUN_AS_NODE — 설치된 exe 그대로): asar 안 desktop/private-config.js 로 두 키를 읽을 수 있는지, 내장 헬퍼(desktop/wns/server.js)를
//    빈 포트에 띄워 /ping 이 ffmpeg 를 찾는지(ff:true).
//  · 앱(점검 모드 WCG_TEST=1 — 창 숨김·헬퍼 안 켬·단일 인스턴스 해제·임시 사용자 폴더 %TEMP%\wcg-test-<pid>, WCG_TEST_DATA_KEY=1):
//    main 이 알린 경로([wcg-paths] — 설치판인가·판·ffmpeg 가 asar 밖인가), 부팅 오류 0, 화면(#cg·#panel), app:// 요청이 모두 200(js·css 개수),
//    vendor/maplibre-gl 읽기, desktop/ 는 막힘(403), 데스크톱 다리(wcgDesktop — isDesktop·appVersion·packaged·dataPortalKey 있음).
// 띄운 프로세스는 PID 로만 끈다(이름으로 끄지 않음 — 사용자가 켜 둔 개발판·설치판을 건드리지 않게). 임시 사용자 폴더는 지운다.
// 주의: 점검 모드라도 설치판 exe 는 실제 사용자 데이터 이름('날씨 CG')을 쓰지 않는다(main.js 가 임시 폴더로 바꿈) — 켜 둔 앱과 부딪히지 않는다.
const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');
const { spawn, spawnSync, execFileSync } = require('child_process');

// asar 목록(의존성 없이 머리만 읽는다) — [{ path: 'desktop/main.js', unpacked: false, size }]
function asarList(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const head = Buffer.alloc(16);
    fs.readSync(fd, head, 0, 16, 0);
    const hdrSize = head.readUInt32LE(4), strLen = head.readUInt32LE(12);
    const buf = Buffer.alloc(strLen);
    fs.readSync(fd, buf, 0, strLen, 16);
    if (hdrSize < strLen) throw new Error('asar 머리 크기 이상');
    const root = JSON.parse(buf.toString('utf8'));
    const out = [];
    const walk = (node, pre) => {
      for (const [name, v] of Object.entries(node.files || {})) {
        const p = pre ? pre + '/' + name : name;
        if (v.files) walk(v, p); else out.push({ path: p, unpacked: !!v.unpacked, size: +v.size || 0 });
      }
    };
    walk(root, '');
    return out;
  } finally { fs.closeSync(fd); }
}

const args = process.argv.slice(2);
const opt = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = () => new Promise((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
// 이 환경에서 원래 나는 무해한 오류(헬퍼 꺼짐 — 점검 모드는 헬퍼를 안 켠다, 외부 네트워크) — desktop/test/boot-check.cjs 와 같은 기준
const BENIGN = /127\.0\.0\.1:372[01]|ERR_CONNECTION_REFUSED|ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED|apihub\.kma\.go\.kr|api\.mapbox\.com|jsdelivr|favicon/i;

async function main() {
  const dir = path.resolve(args.find((x) => !x.startsWith('--')) || '');
  const { PRODUCT_NAME, PRIVATE_FILES, SUITE_FONTS, forbiddenIn } = require('./build-installer.cjs');
  const exe = path.join(dir, PRODUCT_NAME + '.exe');
  const res = path.join(dir, 'resources');
  const asarFile = path.join(res, 'app.asar');
  const unp = path.join(res, 'app.asar.unpacked', 'desktop', 'helper');
  const out = { ok: false, dir, errors: [], ignored: [] };
  const fail = (m) => out.errors.push(m);
  if (!fs.existsSync(exe) || !fs.existsSync(asarFile)) { fail('설치 폴더가 아님(exe·resources\\app.asar 없음): ' + dir); return out; }

  // 1) 담긴 것
  const list = asarList(asarFile);
  const inAsar = list.filter((x) => !x.unpacked).map((x) => x.path);
  out.files = { asar: inAsar.length, unpacked: list.filter((x) => x.unpacked).length, js: inAsar.filter((p) => /^js\/.+\.js$/.test(p)).length, css: inAsar.filter((p) => /^css\/.+\.css$/.test(p)).length };
  const bad = forbiddenIn(list.map((x) => x.path));
  if (bad.length) fail('넣으면 안 되는 파일: ' + bad.join(', '));
  out.files.forbidden = bad.length;
  out.privateKeys = PRIVATE_FILES.map((f) => { const e = list.find((x) => x.path === 'desktop/private/' + f); return { file: f, present: !!e && e.size > 0 }; });
  if (out.privateKeys.some((k) => !k.present)) fail('비공개 키가 빠짐');
  const ffExe = path.join(unp, 'ffmpeg.exe');
  const ffv = fs.existsSync(ffExe) ? spawnSync(ffExe, ['-hide_banner', '-version'], { encoding: 'utf8', windowsHide: true, timeout: 20000 }) : null;
  out.ffmpeg = { unpacked: fs.existsSync(ffExe), runs: !!ffv && ffv.status === 0, version: ffv ? String(ffv.stdout || '').split(/\r?\n/)[0] : '' };
  if (!out.ffmpeg.runs) fail('asar 밖 ffmpeg.exe 를 실행하지 못함');
  out.fonts = SUITE_FONTS.filter((f) => fs.existsSync(path.join(unp, 'fonts', f))).length;
  if (out.fonts !== SUITE_FONTS.length) fail('asar 밖 SUITE 폰트가 모자람: ' + out.fonts);

  // 2) 노드 모드 — 설치된 exe 로 asar 안 모듈을 그대로 불러 본다
  const probe = path.join(os.tmpdir(), `wcg-installed-probe-${process.pid}.cjs`);
  const framesTmp = path.join(os.tmpdir(), `wcg-installed-frames-${process.pid}`);
  fs.writeFileSync(probe, `
    const path = require('path');
    const desk = ${JSON.stringify(path.join(asarFile, 'desktop'))};
    const pc = require(path.join(desk, 'private-config.js'));
    const key = pc.readDataPortalKey(desk), tok = pc.readMapboxToken(desk);
    const { createWnsServer } = require(path.join(desk, 'wns', 'server.js'));
    const s = createWnsServer({ ffmpegPath: ${JSON.stringify(ffExe)}, framesDir: ${JSON.stringify(framesTmp)}, fontsInstall: false, aeDryRun: true });
    s.listen(0, '127.0.0.1').then(async (port) => {
      let ping = null;
      try { ping = await (await fetch('http://127.0.0.1:' + port + '/ping')).json(); } catch (e) { ping = { err: String(e.message) }; }
      await s.close();
      process.stdout.write(JSON.stringify({ dataKey: key.length > 0, mapboxToken: tok.length > 0, mapboxPublic: tok.startsWith('pk.'), ping }));
    }, (e) => { process.stdout.write(JSON.stringify({ err: String(e.message) })); });
  `);
  try {
    const r = spawnSync(exe, [probe], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8', windowsHide: true, timeout: 30000 });
    out.nodeMode = JSON.parse(String(r.stdout || '').trim() || '{}');
  } catch (e) { out.nodeMode = { err: String(e.message) }; }
  fs.rmSync(probe, { force: true }); fs.rmSync(framesTmp, { recursive: true, force: true });
  const nm = out.nodeMode || {};
  if (!nm.dataKey || !nm.mapboxToken || !nm.mapboxPublic) fail('asar 안 비공개 키를 읽지 못함');
  if (!nm.ping || nm.ping.ok !== true || nm.ping.ff !== true || nm.ping.embedded !== true) fail('내장 헬퍼 /ping 이상: ' + JSON.stringify(nm.ping || nm.err));

  // 3) 앱 — 점검 모드로 띄우고 CDP 로 본다
  const WAIT = +opt('wait', 9000), SHOT = opt('shot', '');
  const port = await freePort();
  const env = { ...process.env, WCG_TEST: '1', WCG_TEST_DATA_KEY: '1' };
  for (const k of ['WCG_APP_DIR', 'ELECTRON_RUN_AS_NODE', 'WCG_TEST_MAPBOX_TOKEN', 'WCG_TEST_SIZE']) delete env[k];   // 설치된 앱 그대로(다른 폴더 웹앱·노드 모드 아님)
  const proc = spawn(exe, [`--remote-debugging-port=${port}`], { cwd: dir, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  out.pid = proc.pid;
  let mainLog = '';
  proc.stdout.on('data', (d) => { mainLog += d; }); proc.stderr.on('data', (d) => { mainLog += d; });
  const kill = () => {
    try { execFileSync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore' }); } catch (e) { /* 이미 꺼짐 */ }
    try { require('../desktop/test/test-profile.cjs').rmTestProfile(proc.pid); } catch (e) { /* 저장소 밖에서 실행 */ }
  };
  try {
    let page = null;
    for (let i = 0; i < 75 && !page; i++) {
      await sleep(400);
      try { const l = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); page = l.find((p) => p.type === 'page' && p.url.startsWith('app://weathercg')); } catch (e) { /* 아직 */ }
    }
    if (!page) { fail('앱 페이지를 못 찾음'); out.mainLog = mainLog.slice(-1500); return out; }
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
    let id = 0; const pending = new Map(); const reqs = new Map();
    const push = (m) => (BENIGN.test(m) ? out.ignored : out.errors).push(m.slice(0, 600));
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
      if (m.method === 'Runtime.exceptionThrown') { const d = m.params.exceptionDetails; push('EXC ' + ((d.exception && d.exception.description) || d.text) + (d.url ? ` @${d.url}:${d.lineNumber + 1}` : '')); }
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') push('CONSOLE ' + m.params.args.map((a) => (a.value !== undefined ? a.value : a.description)).join(' '));
      if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') push('LOG ' + m.params.entry.text + ' ' + (m.params.entry.url || ''));
      if (m.method === 'Network.requestWillBeSent') reqs.set(m.params.requestId, { url: m.params.request.url, status: 0 });
      if (m.method === 'Network.responseReceived') { const q = reqs.get(m.params.requestId) || { url: m.params.response.url }; q.status = m.params.response.status; reqs.set(m.params.requestId, q); }
      if (m.method === 'Network.loadingFailed') { const q = reqs.get(m.params.requestId) || { url: '?' }; q.failed = m.params.errorText; reqs.set(m.params.requestId, q); }
    });
    const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
    await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable'); await send('Network.enable');
    await send('Page.reload', { ignoreCache: true });   // 처음부터 다시 — 모든 요청·부팅 오류를 보게
    await sleep(WAIT);
    const ev = await send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression: `(async () => {
      const d = window.wcgDesktop || {};
      const get = async (u) => { try { const r = await fetch(u, { cache: 'no-store' }); const b = await r.arrayBuffer(); return { status: r.status, bytes: b.byteLength }; } catch (e) { return { err: String(e.message) }; } };
      const row = document.querySelector('#helperRow .hrText');
      return {
        title: document.title, cg: !!document.querySelector('#cg'), panel: !!document.querySelector('#panel'), secs: document.querySelectorAll('#panel > .sec').length,
        bodyLen: document.body.innerText.length, modFail: window.__wcgModFail || null, webBlocked: !!window.__wcgWebBlocked,
        desk: { isDesktop: d.isDesktop === true, appVersion: d.appVersion || '', packaged: d.packaged === true, helperKind: d.helperKind || null,
                dataPortalKey: typeof d.dataPortalKey === 'string' && d.dataPortalKey.length > 0, mapboxTokenFn: typeof d.mapboxToken === 'function', electron: (d.versions || {}).electron || '' },
        helperRow: row ? row.textContent : null,
        maplibre: await get('vendor/maplibre-gl/maplibre-gl.js'),
        privateBlocked: (await get('desktop/private/mapbox.token')).status,
        mainBlocked: (await get('desktop/main.js')).status,
      };
    })()` });
    out.page = ev.result.exceptionDetails ? { error: ev.result.exceptionDetails.text } : ev.result.result.value;
    const all = [...reqs.values()].filter((q) => q.url.startsWith('app://weathercg/'));
    const notOk = all.filter((q) => q.status !== 200 && !/desktop\/(private|main)/.test(q.url));
    const okPaths = (re) => new Set(all.filter((q) => q.status === 200).map((q) => new URL(q.url).pathname).filter((p) => re.test(p))).size;
    out.requests = { app: all.length, js: okPaths(/^\/js\/[^/]+\.js$/), css: okPaths(/^\/css\/[^/]+\.css$/), notOk: notOk.map((q) => `${q.status || q.failed} ${q.url}`) };
    if (SHOT) {
      let s = null;
      for (let i = 0; i < 6 && !s; i++) s = await Promise.race([send('Page.captureScreenshot', { format: 'png' }), sleep(5000).then(() => null)]);
      if (s && s.result) { fs.writeFileSync(SHOT, Buffer.from(s.result.data, 'base64')); out.shot = SHOT; } else fail('스크린샷 실패');
    }
    ws.close();
    const pm = /\[wcg-paths\] (\{.*\})/.exec(mainLog);
    out.paths = pm ? JSON.parse(pm[1]) : null;
    const p = out.page || {};
    if (!out.paths) fail('main 경로 줄([wcg-paths])이 없음');
    else {
      if (out.paths.packaged !== true) fail('설치판으로 안 뜸(packaged=false)');
      if (!/app\.asar\.unpacked[\\/]desktop[\\/]helper[\\/]ffmpeg\.exe$/i.test(out.paths.ffmpeg || '')) fail('main 의 ffmpeg 경로가 asar 밖 사본이 아님: ' + out.paths.ffmpeg);
      if (!/app\.asar\.unpacked[\\/]desktop[\\/]helper[\\/]fonts$/i.test(out.paths.fonts || '')) fail('main 의 첫 폰트 자리가 asar 밖이 아님: ' + out.paths.fonts);
    }
    if (!p.cg || !p.panel) fail('앱 화면(#cg·#panel)이 없음');
    if (p.modFail) fail('모듈 로드 실패 가드: ' + JSON.stringify(p.modFail).slice(0, 300));
    if (p.webBlocked) fail('웹판 막기 화면이 뜸');
    if (!p.desk || !p.desk.isDesktop || !p.desk.packaged || !p.desk.dataPortalKey || !p.desk.mapboxTokenFn) fail('데스크톱 다리 이상: ' + JSON.stringify(p.desk));
    if (!p.maplibre || p.maplibre.status !== 200 || !(p.maplibre.bytes > 100000)) fail('vendor/maplibre-gl 을 못 읽음: ' + JSON.stringify(p.maplibre));
    if (p.privateBlocked !== 403 || p.mainBlocked !== 403) fail(`desktop/ 가 app:// 로 열림(${p.privateBlocked}·${p.mainBlocked})`);
    if (out.requests.notOk.length) fail('app:// 요청 실패: ' + out.requests.notOk.join(', '));
    if (out.requests.js !== out.files.js || out.requests.css !== out.files.css) fail(`js·css 를 다 못 읽음(js ${out.requests.js}/${out.files.js}, css ${out.requests.css}/${out.files.css})`);
  } finally { kill(); }
  out.ok = out.errors.length === 0;
  return out;
}

if (require.main === module) {
  main().then((out) => {
    const j = JSON.stringify(out, null, 2);
    const f = opt('json', ''); if (f) fs.writeFileSync(f, j);
    console.log(j);
    process.exit(out.ok ? 0 : 1);
  }, (e) => { console.log(JSON.stringify({ ok: false, errors: ['점검기 오류: ' + (e && e.stack || e)] })); process.exit(2); });
}
module.exports = { asarList };
