// 앱 업데이트 끝에서 끝 점검(사람이·AI가 손으로 돌림 — 설치 시험판 두 개가 필요해 node --test 에는 안 넣음). MODULES.md 10장 '앱 업데이트'.
//
//   node desktop/test/update-e2e-check.cjs --a=<WeatherCG-Setup-1.0.0-installtest.exe> --b=<WeatherCG-Setup-1.0.1-installtest.exe> --work=<임시 폴더> [--shot=<png>]
//   (A·B 굽기: node tools/build-installer.cjs --installtest  /  node tools/build-installer.cjs --installtest --version=1.0.1 — 둘 다 --work 를 따로)
//
// 하는 일(설치 시험판 '날씨 CG 설치시험'만 — 사용자 설치판 '날씨 CG'·그 데이터·실행 중인 앱은 건드리지 않는다):
//  1) A 를 <work>\install 에 조용히 설치(이 사용자만 — 관리자 확인 없음)
//  2) B 를 <work>\upd(시험 업데이트 폴더)에 tools/publish-update.cjs 로 올림
//  3) A 를 점검 모드(WCG_TEST=1 — 숨김 창·임시 사용자 폴더) + WCG_UPDATE_DIR=<work>\upd + CDP 로 띄워
//     '새 업데이트가 있습니다' 팝업 → [지금 설치] → 받기 진행 → '설치를 시작했어요'
//  4) A 가 스스로 꺼지고, 설치 프로그램(/S --updated --force-run)이 같은 자리에 B 를 깔고 다시 켜는지 — 켜진 프로세스의 exe·asar 판 1.0.1,
//     명령줄 --updated, 레지스트리 판·설치 위치(같은 자리)
//  5) 다시 켜진 B 는 PID 로 끄고(보통 실행으로 켜진다 — 설치 시험판은 헬퍼 빈 포트·따로 폴더라 사용자 앱과 안 부딪힘), 조용히 제거 → 설치 폴더까지 없어지는지
//  6) 정리: 이 점검이 만든 것만(%APPDATA%\날씨 CG 설치시험·%LOCALAPPDATA%\WeatherCG-installtest — 점검 전에 없던 때만, %TEMP%\wcg-update 의 시험 사본, A 의 임시 사용자 폴더)
// 결과: JSON { ok, steps… }. 사용자 '날씨 CG.exe' 프로세스 목록이 점검 앞뒤로 같은지도 본다.
'use strict';
const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');
const { spawn, spawnSync, execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const NAME = '날씨 CG 설치시험';                      // tools/build-installer.cjs INSTALLTEST.productName
const EXE = NAME + '.exe';
const USER_EXE = '날씨 CG.exe';
const freePort = () => new Promise((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });

// PowerShell 한 줄 → JSON(한글 그대로 — 출력 UTF-8)
function ps(cmd) {
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `[Console]::OutputEncoding = [Text.Encoding]::UTF8; ${cmd}`], { encoding: 'utf8', windowsHide: true, timeout: 60000 });
  const t = String(r.stdout || '').trim();
  if (!t) return null;
  try { return JSON.parse(t); } catch (e) { return t; }
}
const arr = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);
const procs = (exe) => arr(ps(`@(Get-CimInstance Win32_Process -Filter "Name='${exe}'" | Select-Object ProcessId,ParentProcessId,ExecutablePath,CommandLine) | ConvertTo-Json -Compress`));
const mainProcs = (exe) => procs(exe).filter((p) => !/--type=/.test(p.CommandLine || ''));
const exeVersion = (file) => ps(`(Get-Item -LiteralPath '${file.replace(/'/g, "''")}').VersionInfo.ProductVersion | ConvertTo-Json`);
// 이 사용자 설치 등록 — 제어판 항목(Uninstall\<키>) + 설치 프로그램이 다음 설치 자리로 읽는 Software\<키> InstallLocation(electron-builder multiUser.nsh)
const regEntry = () => arr(ps(`@(Get-ChildItem HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall | ForEach-Object { $p = Get-ItemProperty $_.PSPath; if ("$($p.DisplayName)" -like '${NAME}*') { $k = $_.PSChildName; $loc = (Get-ItemProperty -LiteralPath "HKCU:\\Software\\$k" -ErrorAction SilentlyContinue).InstallLocation; [pscustomobject]@{ DisplayName = $p.DisplayName; DisplayVersion = $p.DisplayVersion; UninstallString = $p.UninstallString; InstallLocation = $loc } } }) | ConvertTo-Json -Compress`));
// 설치 프로그램(임시 사본에서 도는 것) — 끝날 때까지 기다린다(돌고 있는 파일은 지울 수 없고, 정리가 설치를 끊지 않게)
const installerProcs = (dir) => arr(ps(`@(Get-CimInstance Win32_Process -Filter "Name like 'WeatherCG-Setup-%'" | Select-Object ProcessId,ExecutablePath,CommandLine) | ConvertTo-Json -Compress`)).filter((p) => String(p.ExecutablePath || '').toLowerCase().startsWith(dir.toLowerCase()));
// asar 안 파일 하나 읽기(머리 + 오프셋 — 의존성 없이)
function asarRead(file, rel) {
  const fd = fs.openSync(file, 'r');
  try {
    const head = Buffer.alloc(16); fs.readSync(fd, head, 0, 16, 0);
    const hdrSize = head.readUInt32LE(4), strLen = head.readUInt32LE(12);
    const buf = Buffer.alloc(strLen); fs.readSync(fd, buf, 0, strLen, 16);
    let node = JSON.parse(buf.toString('utf8'));
    for (const part of rel.split('/')) node = node.files[part];
    const out = Buffer.alloc(node.size); fs.readSync(fd, out, 0, node.size, 8 + hdrSize + Number(node.offset));
    return out.toString('utf8');
  } finally { fs.closeSync(fd); }
}
const killPid = (pid) => { try { execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' }); } catch (e) { /* 이미 꺼짐 */ } };

const OUT = { ok: false, steps: {}, errors: [] };   // 전체 시간 초과 때도 지금까지를 내보낸다
async function main() {
  const A = path.resolve(opt('a', '')), B = path.resolve(opt('b', '')), work = path.resolve(opt('work', path.join(os.tmpdir(), 'wcg-upd-e2e')));
  const SHOT = opt('shot', '');
  const out = OUT;
  const fail = (m) => { out.errors.push(m); };
  for (const f of [A, B]) if (!/-installtest\.exe$/i.test(f) || !fs.existsSync(f)) { fail('설치 시험판 파일이 아님: ' + f); return out; }
  const inst = path.join(work, 'install'), upd = path.join(work, 'upd');
  const appDataDir = path.join(process.env.APPDATA, NAME), ladDir = path.join(process.env.LOCALAPPDATA, 'WeatherCG-installtest');
  const tempCopy = path.join(os.tmpdir(), 'wcg-update');
  const pre = { appData: fs.existsSync(appDataDir), lad: fs.existsSync(ladDir), reg: regEntry(), user: procs(USER_EXE).map((p) => p.ProcessId).sort() };
  out.steps.before = pre;
  if (pre.reg.length) { fail('설치 시험판이 이미 깔려 있음 — 먼저 지울 것: ' + JSON.stringify(pre.reg)); return out; }
  if (procs(EXE).length) { fail('설치 시험판이 이미 켜져 있음'); return out; }
  fs.rmSync(work, { recursive: true, force: true }); fs.mkdirSync(upd, { recursive: true });
  let aPid = 0, bPid = 0, aExited = false;
  // 이 점검이 깐 exe(설치 폴더 안)로 지금 돌고 있는 그 PID 만 끈다 — 꺼진 뒤 다른 프로그램이 같은 PID 를 받았을 수 있어 매번 다시 확인
  const killOurs = (pid) => { if (procs(EXE).some((p) => p.ProcessId === pid && String(p.ExecutablePath || '').toLowerCase().startsWith(inst.toLowerCase()))) killPid(pid); };
  try {
    // 1) A 설치
    const t1 = Date.now();
    const r1 = spawnSync(A, ['/S', `/D=${inst}`], { windowsHide: true, timeout: 300000 });
    const aExe = path.join(inst, EXE);
    out.steps.installA = { exit: r1.status, ms: Date.now() - t1, exe: fs.existsSync(aExe), version: fs.existsSync(aExe) ? exeVersion(aExe) : null,
      asarVersion: fs.existsSync(aExe) ? JSON.parse(asarRead(path.join(inst, 'resources', 'app.asar'), 'package.json')).version : null, reg: regEntry() };
    if (!out.steps.installA.exe) { fail('A 설치 안 됨'); return out; }
    // 2) B 올리기(시험 폴더)
    const r2 = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'publish-update.cjs'), `--setup=${B}`, `--dir=${upd}`, '--note=업데이트 끝에서 끝 점검 — 판만 올린 설치 시험판', '--note=설치 뒤 저절로 다시 켜져야 함'], { encoding: 'utf8', timeout: 300000 });
    out.steps.publishB = { exit: r2.status, latest: fs.existsSync(path.join(upd, 'latest.json')) ? JSON.parse(fs.readFileSync(path.join(upd, 'latest.json'), 'utf8')) : null, err: r2.status ? String(r2.stderr).slice(-500) : '' };
    if (r2.status !== 0) { fail('올리기 실패'); return out; }
    // 3) A 를 점검 모드 + 시험 업데이트 폴더로
    const port = await freePort();
    const env = { ...process.env, WCG_TEST: '1', WCG_UPDATE_DIR: upd, WCG_UPDATE_FIRST_MS: '1500' };
    for (const k of ['WCG_APP_DIR', 'ELECTRON_RUN_AS_NODE', 'WCG_UPDATE_DRYRUN']) delete env[k];
    const pa = spawn(aExe, [`--remote-debugging-port=${port}`], { cwd: inst, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    aPid = pa.pid;
    let mainLog = '';
    pa.stdout.on('data', (d) => { mainLog += d; }); pa.stderr.on('data', (d) => { mainLog += d; });
    pa.on('exit', (c) => { aExited = true; out.steps.aExitCode = c; });
    let page = null;
    for (let i = 0; i < 75 && !page; i++) { await sleep(400); try { page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((p) => p.type === 'page' && p.url.startsWith('app://weathercg')); } catch (e) { /* 아직 */ } }
    if (!page) { fail('A 화면을 못 찾음'); out.mainLog = mainLog.slice(-1500); return out; }
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
    let id = 0; const pending = new Map();
    ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
    // 앱이 스스로 꺼지면(설치 시작) 소켓이 닫힌다 — 그 뒤 보낸 것은 곧바로 closed 로(답 없는 약속만 남으면 node 가 말없이 끝난다 — 10-12 첫 실행)
    let wsClosed = false;
    ws.addEventListener('close', () => { wsClosed = true; for (const [, r] of pending) r({ closed: true }); pending.clear(); });
    const send = (method, params = {}) => new Promise((r) => { if (wsClosed || ws.readyState !== 1) { r({ closed: true }); return; } const i = ++id; pending.set(i, r); try { ws.send(JSON.stringify({ id: i, method, params })); } catch (e) { pending.delete(i); r({ closed: true }); } });
    const evalJs = async (expr) => { const r = await send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression: expr }); return r.closed ? { closed: true } : r.result.exceptionDetails ? { error: r.result.exceptionDetails.text } : r.result.result.value; };
    const POP = `(() => { const ov = document.querySelector('#tossOv:not(.popClosing)'); if (!ov) return null; return { title: ov.querySelector('.tossTitle').textContent, body: ov.querySelector('.tossBody').innerText, buttons: [...ov.querySelectorAll('.tossFoot button')].map((b) => b.textContent.trim()), bar: (ov.querySelector('.updBar i') || { style: {} }).style.width || '' }; })()`;
    // 부팅 팝업(공지·둘러보기)을 닫으며 업데이트 팝업을 기다린다
    let popup = null;
    for (let i = 0; i < 120 && !popup; i++) {
      const p = await evalJs(POP);
      if (p && p.title === '새 업데이트가 있습니다') popup = p;
      else {
        await evalJs(`(() => { const t = document.querySelector('#tourWrap.on'); if (t) document.querySelector('#tourClose').click(); const x = document.querySelector('#tossOv:not(.popClosing) .tossX'); if (x) x.click(); })()`);
        await sleep(400);
      }
    }
    out.steps.popup = popup;
    out.steps.desk = await evalJs(`({ appVersion: window.wcgDesktop.appVersion, packaged: window.wcgDesktop.packaged, updCheckVisible: !document.querySelector('#updCheck').hidden })`);
    if (!popup) { fail('업데이트 팝업이 안 뜸'); out.mainLog = mainLog.slice(-2000); return out; }
    if (SHOT) { const s = await Promise.race([send('Page.captureScreenshot', { format: 'png' }), sleep(8000).then(() => null)]); if (s && s.result) fs.writeFileSync(SHOT, Buffer.from(s.result.data, 'base64')); }
    // [지금 설치] — 진행 막대 폭을 따라간다. 받기·확인이 끝나면 설치 프로그램을 띄우고 앱이 0.4초 뒤 스스로 꺼진다(그 뒤엔 화면을 못 읽음)
    await evalJs(`(() => { window.__updW = []; const mo = new MutationObserver(() => { const w = document.querySelector('#tossOv .updBar i'); if (w && w.style.width) window.__updW.push(w.style.width); }); mo.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['style'] }); document.querySelector('#tossOv [data-install]').click(); })()`);
    const tClick = Date.now();
    let last = null, started = null;
    for (let i = 0; i < 600 && !aExited; i++) {   // 최대 2분
      await sleep(200);
      const p = await evalJs(`(() => { const p = ${POP}; return p ? { ...p, widths: window.__updW } : null; })()`);
      if (p && p.closed) break;
      if (p && p.title) last = p;
      if (p && p.title === '설치를 시작했어요') started = p;
      if (p && /업데이트하지 못했어요/.test(p.title || '')) break;
    }
    // 4) A 가 꺼지고 B 가 다시 켜지는지
    for (let i = 0; i < 150 && !aExited; i++) await sleep(200);
    out.steps.aQuit = { exited: aExited, ms: Date.now() - tClick };
    try { ws.close(); } catch (e) { /* 이미 닫힘 */ }
    await sleep(300);
    out.steps.mainLog = mainLog.split(/\r?\n/).filter((l) => /\[update\]|\[wcg-paths\]/.test(l));
    out.steps.installClick = { started, last };
    if (!/설치 프로그램 실행\(\/S --updated --force-run\)/.test(mainLog)) { fail('설치 프로그램을 실행하지 않음: ' + JSON.stringify(last)); return out; }
    let b = null; const tWait = Date.now();
    for (let i = 0; i < 300 && !b; i++) {   // 최대 약 2분 30초(설치 + 다시 켜기)
      await sleep(500);
      const m = mainProcs(EXE).filter((p) => p.ProcessId !== aPid && String(p.ExecutablePath || '').toLowerCase() === aExe.toLowerCase());
      if (m.length) b = m[0];
    }
    if (!b) { fail('B 가 다시 켜지지 않음'); out.steps.relaunch = { reg: regEntry(), installer: procs('WeatherCG-Setup-1.0.1-installtest.exe') }; return out; }
    bPid = b.ProcessId;
    await sleep(2500);   // 설치 프로그램이 끝나고 파일이 다 놓이게
    out.steps.relaunch = { ms: Date.now() - tClick, waitedMs: Date.now() - tWait, pid: b.ProcessId, commandLine: b.CommandLine, exe: b.ExecutablePath,
      exeVersion: exeVersion(aExe), asarVersion: JSON.parse(asarRead(path.join(inst, 'resources', 'app.asar'), 'package.json')).version, reg: regEntry(),
      installerLeft: procs('WeatherCG-Setup-1.0.1-installtest.exe').length, stillRunning: mainProcs(EXE).some((p) => p.ProcessId === bPid) };
    killOurs(bPid); bPid = 0;
    await sleep(1500);
    // 5) 조용히 제거 → 폴더까지
    const un = path.join(inst, `Uninstall ${NAME}.exe`);
    const t5 = Date.now();
    spawnSync(un, ['/S'], { windowsHide: true, timeout: 120000 });
    for (let i = 0; i < 240 && fs.existsSync(aExe); i++) await sleep(500);
    for (let i = 0; i < 20 && fs.existsSync(inst); i++) await sleep(500);
    out.steps.uninstall = { ms: Date.now() - t5, exeGone: !fs.existsSync(aExe), dirGone: !fs.existsSync(inst), left: fs.existsSync(inst) ? fs.readdirSync(inst).slice(0, 10) : [], reg: regEntry() };
  } finally {
    if (aPid && !aExited) killOurs(aPid);
    // 설치 프로그램이 아직 돌면(중간에 멈춘 경우) 끝날 때까지 — 그 사이 정리하면 설치가 끊기거나 사본을 못 지운다
    for (let i = 0; i < 360 && installerProcs(tempCopy).length; i++) await sleep(500);
    out.steps.installerLeft = installerProcs(tempCopy).length;
    if (bPid) killOurs(bPid);
    for (const p of mainProcs(EXE)) if (String(p.ExecutablePath || '').toLowerCase().startsWith(inst.toLowerCase())) killPid(p.ProcessId);   // 이 점검이 깐 것만
    // 중간에 멈춰 아직 깔려 있으면 지운다(이 점검이 깐 설치 시험판만)
    const unLeft = path.join(inst, `Uninstall ${NAME}.exe`);
    if (fs.existsSync(unLeft)) {
      spawnSync(unLeft, ['/S'], { windowsHide: true, timeout: 120000 });
      for (let i = 0; i < 240 && fs.existsSync(path.join(inst, EXE)); i++) await sleep(500);
      out.steps.cleanupUninstall = !fs.existsSync(path.join(inst, EXE));
    }
    // 6) 정리 — 이 점검이 만든 것만
    try { require('./test-profile.cjs').rmTestProfile(aPid); } catch (e) { /* 없음 */ }
    if (!pre.appData) fs.rmSync(appDataDir, { recursive: true, force: true });
    if (!pre.lad) fs.rmSync(ladDir, { recursive: true, force: true });
    for (const f of ['WeatherCG-Setup-1.0.1-installtest.exe', 'WeatherCG-Setup-1.0.1-installtest.exe.partial']) fs.rmSync(path.join(tempCopy, f), { force: true });
    try { if (fs.existsSync(tempCopy) && !fs.readdirSync(tempCopy).length) fs.rmdirSync(tempCopy); } catch (e) { /* 다른 파일 있음 */ }
    fs.rmSync(upd, { recursive: true, force: true });
    out.steps.after = { appData: fs.existsSync(appDataDir), lad: fs.existsSync(ladDir), reg: regEntry(), user: procs(USER_EXE).map((p) => p.ProcessId).sort(), testProcs: procs(EXE).length,
      desktopLnk: fs.existsSync(path.join(os.homedir(), 'Desktop', NAME + '.lnk')), startLnk: fs.existsSync(path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', NAME + '.lnk')),
      updaterCopy: fs.existsSync(path.join(process.env.LOCALAPPDATA, 'weathercg-installtest-updater')) };
  }
  const s = out.steps;
  const want = (c, m) => { if (!c) fail(m); };
  want(s.installA && s.installA.asarVersion === '1.0.0', 'A 판이 1.0.0 이 아님');
  want(s.desk && s.desk.appVersion === '1.0.0' && s.desk.packaged === true && s.desk.updCheckVisible, 'A 다리·설정 메뉴 버튼');
  want(s.popup && /새 판 1\.0\.1/.test(s.popup.body) && /판만 올린 설치 시험판/.test(s.popup.body), '팝업 내용');
  want(s.aQuit && s.aQuit.exited, 'A 가 안 꺼짐');
  want(s.relaunch && /^1\.0\.1(\.0)?$/.test(String(s.relaunch.exeVersion)) && s.relaunch.asarVersion === '1.0.1', '다시 켜진 앱 판이 1.0.1 이 아님');
  want(s.relaunch && /--updated/.test(s.relaunch.commandLine || ''), '설치 프로그램이 켠 것(--updated)이 아님');
  want(s.relaunch && arr(s.relaunch.reg).some((r) => r.DisplayVersion === '1.0.1' && path.resolve(String(r.InstallLocation || '')).toLowerCase() === inst.toLowerCase()
    && String(r.UninstallString || '').toLowerCase().includes(inst.toLowerCase())), '같은 자리에 1.0.1 로 등록 안 됨');
  want(s.installClick && s.installClick.last && s.installClick.last.widths && s.installClick.last.widths.length > 0, '받기 진행 막대가 안 움직임');
  want(s.uninstall && s.uninstall.exeGone && s.uninstall.dirGone, '제거 뒤 설치 폴더가 남음');
  want(s.after && JSON.stringify(s.after.user) === JSON.stringify(s.before.user), '사용자 앱 프로세스가 바뀜');
  want(s.after && !s.after.reg.length && !s.after.testProcs && !s.after.desktopLnk && !s.after.startLnk, '설치 시험판 흔적이 남음');
  out.ok = !out.errors.length;
  return out;
}

if (require.main === module) {
  const guard = setTimeout(() => { OUT.errors.push('점검 전체 시간 초과(15분)'); console.log(JSON.stringify(OUT, null, 2)); process.exit(1); }, 15 * 60 * 1000);   // 기다림이 남아 있게도 한다
  main().then((o) => { clearTimeout(guard); console.log(JSON.stringify(o, null, 2)); process.exit(o.ok ? 0 : 1); }, (e) => { console.log(JSON.stringify({ ok: false, errors: ['점검기 오류: ' + (e && e.stack || e)] })); process.exit(2); });
}
