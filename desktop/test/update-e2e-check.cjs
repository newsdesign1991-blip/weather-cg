// 앱 업데이트 끝에서 끝 점검(사람이·AI가 손으로 돌림 — 설치 시험판 두 개가 필요해 node --test 에는 안 넣음). MODULES.md 10장 '앱 업데이트'.
//
//   node desktop/test/update-e2e-check.cjs --a=<WeatherCG-Setup-<옛 판>-installtest.exe> --b=<WeatherCG-Setup-<새 판>-installtest.exe> --work=<임시 폴더> [--shot=<폴더>]
//   (A·B 굽기: node tools/build-installer.cjs --installtest --version=1.0.1  /  … --installtest --version=1.0.2 — 둘 다 --work 를 따로. 판은 파일 이름에서 읽는다 — 아래 1.0.0·1.0.1 은 예)
//   업데이트 진행 창(10-13)을 보려면 A·B 둘 다 진행 창이 든 커밋으로 굽는다(창은 '떠나는 판'의 설치 폴더에서 나온다).
//
// 하는 일(설치 시험판 '날씨 CG 설치시험'만 — 사용자 설치판 '날씨 CG'·그 데이터·실행 중인 앱은 건드리지 않는다):
//  1) A 를 <work>\install 에 조용히 설치(이 사용자만 — 관리자 확인 없음)
//  2) A 그다음 B 를 <work>\upd(시험 업데이트 폴더)에 tools/publish-update.cjs 로 올림 → latest.json 내역(history) = 1.0.1·1.0.0, 설치 파일 둘 다 남음
//  3) A 를 점검 모드(WCG_TEST=1 — 숨김 창·임시 사용자 폴더) + WCG_UPDATE_DIR=<work>\upd + CDP 로 띄워
//     '새 업데이트가 있습니다' 팝업·렌치 깜빡임 → 설정(렌치) 메뉴 '앱 업데이트'(새 판·바뀐 점·내역, 연 뒤에도 깜빡임 유지) → 팝업 [지금 설치] → 받기 진행 → '설치를 시작했어요'
//  4) A 가 업데이트 진행 창(WeatherCG-Update.exe — 임시 폴더 사본)을 띄우고 스스로 꺼지고, 그 창이 단계(닫기·확인·설치 /S --updated·새 판 실행)를 끝까지 가서
//     같은 자리에 B 를 깔고 직접 켜는지 — 켜진 프로세스의 부모 = 진행 창, exe·asar 판 1.0.1, 명령줄 --updated, 레지스트리 판·설치 위치(같은 자리), 앱이 하나만 켜짐(두 번 안 켜짐),
//     창 기록(%TEMP%\wcg-update\update-ui.log)·창 캡처(--shot 이면 <shot>\ui-A\ — 창이 단계마다 자기 그림과 실제 화면 자리를 남김). 다시 켜진 B 는 창이 끝난 뒤 PID 로 끈다
//     (보통 실행으로 켜진다 — 설치 시험판은 헬퍼 빈 포트·따로 폴더)
//  5) 이전 판으로 되돌리기: B 를 점검 모드 + CDP 로 다시 띄워 메뉴 '앱 업데이트'(최신이에요·되돌릴 판 1.0.0) → [이 판으로 설치] → 확인 팝업 → [되돌리기] →
//     받기 → '되돌리기를 시작했어요' → B 가 꺼지고 진행 창이 같은 자리에 A(1.0.0 — 낮은 판도 덮어 깖)를 깔고 다시 켜는지(exe·asar·레지스트리 1.0.0, 창 기록·캡처 ui-B)
//  6) 되돌린 A 를 점검 모드 + 시험(WCG_UPDATE_DRYRUN) 으로 다시 띄워 '나중에'를 골라도 메뉴 [업데이트하기](1.0.1)로 실행 직전까지 가는지(다시 최신으로 — 막히지 않음)
//  7) 조용히 제거 → 설치 폴더까지 없어지는지
//  8) 정리: 이 점검이 만든 것만(%APPDATA%\날씨 CG 설치시험·%LOCALAPPDATA%\WeatherCG-installtest — 점검 전에 없던 때만, %TEMP%\wcg-update 에 점검 중 새로 생긴 시험 사본·진행 창 사본·글꼴·기록, 띄운 앱의 임시 사용자 폴더)
// 결과: JSON { ok, steps… }. 사용자 '날씨 CG.exe' 프로세스 목록이 점검 앞뒤로 같은지도 본다.
// 설치는 A·B 의 사본(<work>\setup)으로 한다 — 막 설치에 쓴 파일을 곧바로 올리면 잠겨 있어 올리기가 EBUSY 로 멈추던 것(10-13 검증). 올리기도 잠김이면 잠깐 뒤 다시.
//
// '모든 사용자' 설치(관리자 확인) 길 — 사람이 옆에서 관리자 확인 창의 [예]를 눌러 줄 때만(10-13 검증 뒤 추가, AI 혼자 돌리지 않는다):
//   node desktop/test/update-e2e-check.cjs --a=… --b=… --work=… --per-machine [--decline-first] [--shot=…]
//   A 를 /allusers 로 깔고(HKLM 등록 — 사용자 설치판과 이름·appId 가 달라 겹치지 않음) 같은 업데이트·되돌리기·제거를 한다. 관리자 확인 창은
//   A 설치·업데이트·되돌리기·제거 때 한 번씩(넷) 뜬다 — 그때마다 [예]. --decline-first 면 첫 업데이트의 관리자 확인에서 [아니요]를 누르라고 하고,
//   진행 창의 문제 화면(종료 코드·관리자 안내·[예전 판 그대로 켜기])을 기록한 뒤 점검기가 [다시 시도]를 눌러 준다 → 다시 뜬 관리자 확인에서 [예].
//   진행 창 기록의 '관리자 확인 창을 봄'으로 관리자 확인 창이 떴는지를, 사람이 '앞에 떴는지'를 본다(점검기는 화면 앞뒤를 모름 — 결과 JSON 의 humanNotes 에 적어 둘 것).
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
const PM = args.includes('--per-machine');           // '모든 사용자' 설치(관리자 확인 — 사람이 [예])
const DECLINE = PM && args.includes('--decline-first');
const HIVE = PM ? 'HKLM' : 'HKCU';
const human = (m) => { if (PM) process.stderr.write(`\n[사람] ${m}\n`); };
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
// exe 판(파일 버전 정보) — 설치 프로그램이 막 놓은 파일은 잠깐 못 읽을 때가 있어(10-12 되돌리기 실측에서 한 번 null) 몇 번 다시
function exeVersion(file) {
  for (let i = 0; i < 6; i++) {
    const v = ps(`[System.Diagnostics.FileVersionInfo]::GetVersionInfo('${file.replace(/'/g, "''")}').ProductVersion | ConvertTo-Json`);
    if (v) return v;
    spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Start-Sleep -Milliseconds 700'], { windowsHide: true });
  }
  return null;
}
// 설치 등록 — 제어판 항목(Uninstall\<키>) + 설치 프로그램이 다음 설치 자리로 읽는 Software\<키> InstallLocation(electron-builder multiUser.nsh)
//  이 사용자 설치 = HKCU, '모든 사용자'(--per-machine) = HKLM(64비트 보기 — 64비트 PowerShell)
const regEntryIn = (hive) => arr(ps(`@(Get-ChildItem ${hive}:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall | ForEach-Object { $p = Get-ItemProperty $_.PSPath; if ("$($p.DisplayName)" -like '${NAME}*') { $k = $_.PSChildName; $loc = (Get-ItemProperty -LiteralPath "${hive}:\\Software\\$k" -ErrorAction SilentlyContinue).InstallLocation; [pscustomobject]@{ DisplayName = $p.DisplayName; DisplayVersion = $p.DisplayVersion; UninstallString = $p.UninstallString; InstallLocation = $loc } } }) | ConvertTo-Json -Compress`));
const regEntry = () => regEntryIn(HIVE);
const regAny = () => [...regEntryIn('HKCU'), ...regEntryIn('HKLM')];
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
// 진행 창(pid)의 단추를 이름으로 누르기(UI 자동화 — desktop/test/update-ui-check.cjs 와 같은 방법) → 'ok' | 'no-window' | 'no-button'
function clickUiButton(pid, name) {
  const enc = Buffer.from(`[Console]::OutputEncoding = [Text.Encoding]::UTF8; Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
$A = [System.Windows.Automation.AutomationElement]
$w = $null; for ($i = 0; $i -lt 20 -and -not $w; $i++) { $w = $A::RootElement.FindFirst([System.Windows.Automation.TreeScope]::Children, (New-Object System.Windows.Automation.PropertyCondition($A::ProcessIdProperty, ${pid}))); if (-not $w) { Start-Sleep -Milliseconds 200 } }
if (-not $w) { 'no-window'; exit }
$c = New-Object System.Windows.Automation.AndCondition((New-Object System.Windows.Automation.PropertyCondition($A::ControlTypeProperty, [System.Windows.Automation.ControlType]::Button)), (New-Object System.Windows.Automation.PropertyCondition($A::NameProperty, '${name}')))
$b = $w.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $c)
if (-not $b) { 'no-button'; exit }
$b.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke(); 'ok'`, 'utf16le').toString('base64');
  return String(spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', enc], { encoding: 'utf8', windowsHide: true, timeout: 60000 }).stdout || '').trim();
}

// 화면 읽기 식(CDP Runtime.evaluate) — 맨 위 토스 팝업, 설정 메뉴 '앱 업데이트' 묶음
const POP = `(() => { const ov = document.querySelector('#tossOv:not(.popClosing)'); if (!ov) return null; return { title: ov.querySelector('.tossTitle').textContent, body: ov.querySelector('.tossBody').innerText, buttons: [...ov.querySelectorAll('.tossFoot button')].map((b) => b.textContent.trim()), bar: (ov.querySelector('.updBar i') || { style: {} }).style.width || '' }; })()`;
const MENU = `(() => { const box = document.querySelector('#updBox'), drop = document.querySelector('#menuDrop'); const t = (s) => (box.querySelector(s) || {}).textContent || '';
  return { open: drop.classList.contains('on') && getComputedStyle(document.querySelector('#cfgUpdGroup')).display !== 'none', pill: t('.updPill'), cur: t('.updNowVer'), newVer: t('.updNewHead b'),
    newNotes: [...box.querySelectorAll('.updNewBox li')].map((x) => x.textContent), install: !!box.querySelector('[data-upd-act="install"]:not([disabled])'),
    hist: [...box.querySelectorAll('.updHistHead b')].map((x) => x.textContent), rollback: [...box.querySelectorAll('[data-upd-act="rollback"]:not([disabled])')].map((b) => b.dataset.ver),
    badge: document.querySelector('#helperBtn').classList.contains('updNew') }; })()`;
const CLOSE_BOOT_POPS = `(() => { const t = document.querySelector('#tourWrap.on'); if (t) document.querySelector('#tourClose').click(); const x = document.querySelector('#tossOv:not(.popClosing) .tossX'); if (x) x.click(); if (typeof cgSetupIsOpen === 'function' && cgSetupIsOpen()) closeCgSetup(); })()`;

const OUT = { ok: false, steps: {}, errors: [] };
const SHOT_DIR = opt('shot', '');
const UI_EXE_NAME = 'WeatherCG-Update.exe';   // 진행 창(desktop/updater.js UI_EXE)   // 전체 시간 초과 때도 지금까지를 내보낸다
const launched = [];   // 이 점검이 점검 모드로 띄운 PID(임시 사용자 폴더 정리용)
async function main() {
  const A = path.resolve(opt('a', '')), B = path.resolve(opt('b', '')), work = path.resolve(opt('work', path.join(os.tmpdir(), 'wcg-upd-e2e')));
  const SHOT = opt('shot', '');
  const out = OUT;
  const fail = (m) => { out.errors.push(m); };
  for (const f of [A, B]) if (!/-installtest\.exe$/i.test(f) || !fs.existsSync(f)) { fail('설치 시험판 파일이 아님: ' + f); return out; }
  const verOf = (f) => (/WeatherCG-Setup-(\d+\.\d+\.\d+)-installtest\.exe$/i.exec(f) || [])[1];
  const vA = verOf(A), vB = verOf(B);
  if (!vA || !vB || require('../updater.js').cmpVer(vB, vA) !== 1) { fail(`판을 파일 이름에서 못 읽었거나 B(${vB})가 A(${vA})보다 새 판이 아님`); return out; }
  out.versions = { a: vA, b: vB };
  const inst = path.join(work, 'install'), upd = path.join(work, 'upd');
  const appDataDir = path.join(process.env.APPDATA, NAME), ladDir = path.join(process.env.LOCALAPPDATA, 'WeatherCG-installtest');
  const tempCopy = path.join(os.tmpdir(), 'wcg-update');
  const uiLog = path.join(tempCopy, 'update-ui.log');
  const preTemp = new Set(fs.existsSync(tempCopy) ? fs.readdirSync(tempCopy) : []);   // 점검 전부터 있던 것(지우지 않음)
  const pre = { appData: fs.existsSync(appDataDir), lad: fs.existsSync(ladDir), reg: regAny(), user: procs(USER_EXE).map((p) => p.ProcessId).sort() };
  out.steps.before = pre;
  out.mode = PM ? (DECLINE ? 'per-machine + decline-first' : 'per-machine') : 'per-user';
  if (pre.reg.length) { fail('설치 시험판이 이미 깔려 있음 — 먼저 지울 것: ' + JSON.stringify(pre.reg)); return out; }
  if (procs(EXE).length) { fail('설치 시험판이 이미 켜져 있음'); return out; }
  fs.rmSync(work, { recursive: true, force: true }); fs.mkdirSync(upd, { recursive: true });
  if (SHOT) fs.mkdirSync(SHOT, { recursive: true });
  // 설치에 쓸 사본(올리기는 원본으로 — 막 설치에 쓴 파일이 잠깐 잠겨 올리기가 EBUSY 로 멈추던 것)
  const setupDir = path.join(work, 'setup');
  fs.mkdirSync(setupDir, { recursive: true });
  const aSetup = path.join(setupDir, path.basename(A));
  fs.copyFileSync(A, aSetup);
  const aExe = path.join(inst, EXE), asarPath = path.join(inst, 'resources', 'app.asar');
  // 이 점검이 깐 exe(설치 폴더 안)로 지금 돌고 있는 그 PID 만 끈다 — 꺼진 뒤 다른 프로그램이 같은 PID 를 받았을 수 있어 매번 다시 확인
  const killOurs = (pid) => { if (procs(EXE).some((p) => p.ProcessId === pid && String(p.ExecutablePath || '').toLowerCase().startsWith(inst.toLowerCase()))) killPid(pid); };
  const installed = () => ({ exeVersion: exeVersion(aExe), asarVersion: JSON.parse(asarRead(asarPath, 'package.json')).version, reg: regEntry() });
  const regAt = (reg, v) => arr(reg).some((r) => r.DisplayVersion === v && path.resolve(String(r.InstallLocation || '')).toLowerCase() === inst.toLowerCase()
    && String(r.UninstallString || '').toLowerCase().includes(inst.toLowerCase()));
  let live = null;   // 지금 점검 모드로 띄운 앱
  const mainLogs = [];

  // 설치된 앱을 점검 모드 + CDP 로 띄운다 → { pid, evalJs, send, exited(), close(), log() }
  async function launch(tag, extraEnv) {
    const port = await freePort();
    const env = { ...process.env, WCG_TEST: '1', WCG_UPDATE_DIR: upd, WCG_UPDATE_FIRST_MS: '1500', ...(SHOT ? { WCG_UPDATE_UI_SHOTS: path.join(SHOT, 'ui-' + tag) } : {}), ...extraEnv };
    for (const k of ['WCG_APP_DIR', 'ELECTRON_RUN_AS_NODE']) delete env[k];
    if (!SHOT) delete env.WCG_UPDATE_UI_SHOTS;
    if (!extraEnv || !extraEnv.WCG_UPDATE_DRYRUN) delete env.WCG_UPDATE_DRYRUN;
    const p = spawn(aExe, [`--remote-debugging-port=${port}`], { cwd: inst, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    launched.push(p.pid);
    const L = { pid: p.pid, exited: false, code: null, log: '', tag };
    p.stdout.on('data', (d) => { L.log += d; }); p.stderr.on('data', (d) => { L.log += d; });
    p.on('exit', (c) => { L.exited = true; L.code = c; });
    let page = null;
    for (let i = 0; i < 75 && !page; i++) { await sleep(400); try { page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((x) => x.type === 'page' && x.url.startsWith('app://weathercg')); } catch (e) { /* 아직 */ } }
    if (!page) { L.err = '화면을 못 찾음'; return L; }
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
    let id = 0; const pending = new Map();
    ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
    // 앱이 스스로 꺼지면(설치 시작) 소켓이 닫힌다 — 그 뒤 보낸 것은 곧바로 closed 로(답 없는 약속만 남으면 node 가 말없이 끝난다 — 10-12 첫 실행)
    let wsClosed = false;
    ws.addEventListener('close', () => { wsClosed = true; for (const [, r] of pending) r({ closed: true }); pending.clear(); });
    L.send = (method, params = {}) => new Promise((r) => { if (wsClosed || ws.readyState !== 1) { r({ closed: true }); return; } const i = ++id; pending.set(i, r); try { ws.send(JSON.stringify({ id: i, method, params })); } catch (e) { pending.delete(i); r({ closed: true }); } });
    L.evalJs = async (expr) => { const r = await L.send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression: expr }); return r.closed ? { closed: true } : r.result.exceptionDetails ? { error: r.result.exceptionDetails.text } : r.result.result.value; };
    L.close = () => { try { ws.close(); } catch (e) { /* 이미 닫힘 */ } };
    L.shot = async (name) => { if (!SHOT) return; const s = await Promise.race([L.send('Page.captureScreenshot', { format: 'png' }), sleep(8000).then(() => null)]); if (s && s.result) fs.writeFileSync(path.join(SHOT, name), Buffer.from(s.result.data, 'base64')); };
    live = L;
    return L;
  }
  // 받기 진행 막대 폭을 따라가며 결과까지 — 받기·확인이 끝나면 설치 프로그램을 띄우고 앱이 0.4초 뒤 스스로 꺼진다(그 뒤엔 화면을 못 읽음)
  async function followInstall(L, clickExpr, okTitle) {
    await L.evalJs(`(() => { window.__updW = []; const mo = new MutationObserver(() => { const w = document.querySelector('#tossOv .updBar i'); if (w && w.style.width) window.__updW.push(w.style.width); }); mo.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['style'] }); ${clickExpr}; })()`);
    const t0 = Date.now();
    let last = null, started = null;
    for (let i = 0; i < 600 && !L.exited; i++) {   // 최대 2분
      await sleep(200);
      const p = await L.evalJs(`(() => { const p = ${POP}; return p ? { ...p, widths: window.__updW } : null; })()`);
      if (p && p.closed) break;
      if (p && p.title) last = p;
      if (p && p.title === okTitle) { started = p; if (/직전까지/.test(okTitle)) break; }
      if (p && /하지 못했어요|되돌리지 못했어요/.test(p.title || '')) break;
    }
    if (!/직전까지/.test(okTitle)) for (let i = 0; i < 150 && !L.exited; i++) await sleep(200);
    return { started, last, exited: L.exited, ms: Date.now() - t0 };
  }
  // 진행 창(또는 설치 프로그램)이 같은 자리에서 다시 켠 앱(보통 실행) 기다리기 — 진행 창이 '끝'(또는 '문제')을 적을 때까지 둔 뒤 끈다
  //  (창은 새 앱 창이 실제로 보일 때까지 기다리므로 그 전에 끄면 창이 '못 켰어요'가 된다)
  const uiLines = () => (fs.existsSync(uiLog) ? fs.readFileSync(uiLog, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => l.slice(24)) : []);
  const uiProcs = () => procs(UI_EXE_NAME).filter((p) => String(p.ExecutablePath || '').toLowerCase().startsWith(tempCopy.toLowerCase()));
  async function waitRelaunch(skipPids, setupName, uiPid, tag, fromLine = 0) {
    let b = null; const t = Date.now();
    for (let i = 0; i < (PM ? 600 : 300) && !b; i++) {   // 최대 약 2분 30초(설치 + 다시 켜기) — '모든 사용자'는 사람이 [예]를 누를 때까지 5분
      await sleep(500);
      const m = mainProcs(EXE).filter((p) => !skipPids.includes(p.ProcessId) && String(p.ExecutablePath || '').toLowerCase() === aExe.toLowerCase());
      if (m.length) b = m[0];
    }
    if (!b) return { found: false, reg: regEntry(), installer: procs(setupName), ui: uiLines() };
    const foundMs = Date.now() - t;
    let lines = [];
    for (let i = 0; i < 240; i++) { lines = uiLines(); if (lines.slice(fromLine).some((l) => /^(끝 —|문제 —)/.test(l))) break; await sleep(500); }   // 최대 2분
    for (let i = 0; i < 40 && uiProcs().some((p) => p.ProcessId === uiPid); i++) await sleep(250);   // 창이 스스로 닫힐 때까지(끝 뒤 약 2초)
    await sleep(1500);   // 두 번 켜졌다면 둘째가 보이게
    const mains = mainProcs(EXE).filter((p) => !skipPids.includes(p.ProcessId) && String(p.ExecutablePath || '').toLowerCase() === aExe.toLowerCase());
    const r = { found: true, waitedMs: foundMs, pid: b.ProcessId, parent: b.ParentProcessId, commandLine: b.CommandLine, exe: b.ExecutablePath, ...installed(),
      installerLeft: procs(setupName).length, stillRunning: mainProcs(EXE).some((p) => p.ProcessId === b.ProcessId), instances: mains.length,
      uiPid, uiLeft: uiProcs().length, ui: lines };
    if (fs.existsSync(uiLog)) { try { fs.copyFileSync(uiLog, path.join(SHOT || work, `update-ui-${tag}.log`)); } catch (e) { /* 기록만 */ } }
    for (const p of mains) killOurs(p.ProcessId);
    await sleep(1500);
    return r;
  }
  const uiPidOf = (log) => { const m = /업데이트 진행 창을 띄움\(pid (\d+), (\d+)ms/.exec(log); return m ? { pid: +m[1], readyMs: +m[2] } : null; };
  // 부팅 팝업(공지·둘러보기·장면 설정)을 닫고 조용해질 때까지(되돌리기 확인 팝업이 부팅 공지에 밀려나지 않게)
  async function settle(L, wantPopup) {
    let quietSince = 0, popup = null;
    for (let i = 0; i < 120; i++) {
      const p = await L.evalJs(POP);
      if (wantPopup && p && p.title === wantPopup) { popup = p; break; }
      const tour = await L.evalJs(`!!document.querySelector('#tourWrap.on') || (typeof cgSetupIsOpen === 'function' && cgSetupIsOpen())`);
      if (!p && !tour) { if (!quietSince) quietSince = Date.now(); if (!wantPopup && Date.now() - quietSince > 4500) break; }
      else { quietSince = 0; await L.evalJs(CLOSE_BOOT_POPS); }
      await sleep(400);
    }
    return popup;
  }
  const openMenu = async (L, until) => {
    await L.evalJs(`(() => { if (!document.querySelector('#menuDrop').classList.contains('on')) document.querySelector('#helperBtn').click(); })()`);
    let m = null;
    for (let i = 0; i < 50; i++) { m = await L.evalJs(MENU); if (m && m.open && until(m)) break; await sleep(300); }
    return m;
  };

  try {
    // 1) A 설치(사본으로) — '모든 사용자'면 /allusers(관리자 확인 창 — 사람이 [예])
    const t1 = Date.now();
    human(`A(${vA}) '모든 사용자' 설치 — 관리자 확인 창이 뜨면 [예]를 눌러 주세요(1/4)`);
    const r1 = spawnSync(aSetup, ['/S', ...(PM ? ['/allusers'] : []), `/D=${inst}`], { windowsHide: true, timeout: 300000 });
    out.steps.installA = { exit: r1.status, ms: Date.now() - t1, exe: fs.existsSync(aExe) };
    if (!out.steps.installA.exe) { fail('A 설치 안 됨' + (PM ? '(관리자 확인에서 [아니요]?)' : '')); return out; }
    Object.assign(out.steps.installA, installed());
    // 2) A 그다음 B 올리기(시험 폴더) — 내역 = 1.0.1·1.0.0, 설치 파일 둘 다. 원본을 올리고, 잠김(EBUSY 등)이면 3초 뒤 다시(최대 4번)
    const publish = (setup, note) => {
      let r = null, tries = 0;
      for (; tries < 4; tries++) {
        r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'publish-update.cjs'), `--setup=${setup}`, `--dir=${upd}`, ...note.map((n) => '--note=' + n)], { encoding: 'utf8', timeout: 300000 });
        if (r.status === 0 || !/\b(EBUSY|EPERM|EACCES)\b/.test(String(r.stderr))) break;
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 3000);
      }
      r.tries = tries + 1;
      return r;
    };
    const r2a = publish(A, ['끝에서 끝 점검 — 처음 올린 판(되돌리기 대상)']);
    const r2 = publish(B, ['업데이트 끝에서 끝 점검 — 판만 올린 설치 시험판', '설치 뒤 저절로 다시 켜져야 함']);
    const latest = fs.existsSync(path.join(upd, 'latest.json')) ? JSON.parse(fs.readFileSync(path.join(upd, 'latest.json'), 'utf8')) : null;
    out.steps.publish = { exitA: r2a.status, exitB: r2.status, tries: [r2a.tries, r2.tries], version: latest && latest.version, history: latest && arr(latest.history).map((h) => h.version), files: fs.readdirSync(upd).sort(),
      err: (r2a.status ? String(r2a.stderr).slice(0, 800) : '') + (r2.status ? String(r2.stderr).slice(0, 800) : '') };
    if (r2a.status !== 0 || r2.status !== 0) { fail('올리기 실패'); return out; }

    // 3) A 를 점검 모드 + 시험 업데이트 폴더로 — 팝업·깜빡임·메뉴 → [지금 설치]
    const La = await launch('A');
    if (La.err) { fail('A 화면을 못 찾음'); out.mainLog = La.log.slice(-1500); return out; }
    const popup = await settle(La, '새 업데이트가 있습니다');
    out.steps.popup = popup;
    out.steps.desk = await La.evalJs(`({ appVersion: window.wcgDesktop.appVersion, packaged: window.wcgDesktop.packaged, groupVisible: !document.querySelector('#cfgUpdGroup').hidden, badge: document.querySelector('#helperBtn').classList.contains('updNew'), anim: getComputedStyle(document.querySelector('#helperBtn')).animationName })`);
    if (!popup) { fail('업데이트 팝업이 안 뜸'); out.mainLog = La.log.slice(-2000); return out; }
    await La.shot('A-popup.png');
    out.steps.menuA = await openMenu(La, (m) => /새 판/.test(m.pill));
    await La.shot('A-menu.png');
    await La.evalJs(`(() => { if (typeof _closeMenu === 'function' && _closeMenu) _closeMenu(); })()`);
    const tClick = Date.now();
    human(DECLINE ? '업데이트 — 이번 관리자 확인 창에서는 [아니요]를 눌러 주세요(거절 시험). 점검기가 진행 창의 [다시 시도]를 누르면 그다음 창에서 [예]'
      : '업데이트 — 관리자 확인 창이 뜨면 [예]를 눌러 주세요(2/4). 앞에 떴는지(작업 표시줄에서 깜빡이기만 했는지)도 봐 주세요');
    out.steps.installClick = await followInstall(La, `document.querySelector('#tossOv [data-install]').click()`, '설치를 시작했어요');
    La.close();
    mainLogs.push(...La.log.split(/\r?\n/).filter((l) => /\[update\]|\[wcg-paths\]/.test(l)));
    out.steps.uiA = uiPidOf(La.log);
    if (!out.steps.uiA) { fail('업데이트 진행 창을 띄우지 않음: ' + JSON.stringify(out.steps.installClick.last) + ' ' + mainLogs.filter((l) => /진행 창|설치 프로그램/.test(l)).join(' / ')); return out; }
    // 4-0) 거절 시험(--decline-first): 진행 창 문제 화면(종료 코드·관리자 안내·단추)을 기록 → 점검기가 [다시 시도] → 사람이 [예]
    let fromLine = 0;
    if (DECLINE) {
      let lines = [];
      for (let i = 0; i < 600; i++) { lines = uiLines(); if (lines.some((l) => /^문제 —/.test(l))) break; await sleep(500); }   // 최대 5분
      out.steps.decline = { exitLine: lines.find((l) => /^설치 프로그램 끝 —/.test(l)) || null, fail: lines.find((l) => /^문제 —/.test(l)) || null,
        screen: lines.find((l) => /^문제 화면 —/.test(l)) || null, adminSeen: lines.some((l) => /^관리자 확인 창이 뜸/.test(l)), appVersionNow: exeVersion(aExe) };
      if (!out.steps.decline.fail) { fail('거절 시험: 진행 창이 문제 화면을 안 보임'); return out; }
      await sleep(1500);   // 문제 화면 캡처(--shot)가 남게
      fromLine = uiLines().length;
      human('진행 창의 [다시 시도]를 누릅니다 — 다시 뜨는 관리자 확인 창에서 [예]를 눌러 주세요(2/4)');
      out.steps.decline.retryClick = clickUiButton(out.steps.uiA.pid, '다시 시도');
    }
    // 4) 진행 창이 단계를 끝까지 가고 B 가 같은 자리에서 켜지는지
    out.steps.relaunchB = await waitRelaunch([La.pid], `WeatherCG-Setup-${vB}-installtest.exe`, out.steps.uiA.pid, 'A', fromLine);
    out.steps.relaunchB.msFromClick = Date.now() - tClick;
    if (!out.steps.relaunchB.found) { fail('B 가 다시 켜지지 않음'); return out; }

    // 5) 이전 판으로 되돌리기 — B 를 점검 모드로 띄워 메뉴 [이 판으로 설치](1.0.0) → 확인 팝업 → [되돌리기]
    const Lb = await launch('B');
    if (Lb.err) { fail('B 화면을 못 찾음'); out.mainLog = Lb.log.slice(-1500); return out; }
    await settle(Lb, null);
    out.steps.menuB = await openMenu(Lb, (m) => m.rollback.length > 0);
    await Lb.shot('B-menu.png');
    await Lb.evalJs(`document.querySelector('#updBox [data-upd-act="rollback"][data-ver="${vA}"]').click()`);
    let ask = null;
    for (let i = 0; i < 25 && !ask; i++) { await sleep(200); const p = await Lb.evalJs(POP); if (p && /되돌릴까요/.test(p.title)) ask = p; }
    out.steps.rollbackAsk = ask;
    if (!ask) { fail('되돌리기 확인 팝업이 안 뜸'); return out; }
    await Lb.shot('B-rollback-ask.png');
    human('되돌리기 — 관리자 확인 창이 뜨면 [예]를 눌러 주세요(3/4)');
    const tRb = Date.now();
    out.steps.rollbackClick = await followInstall(Lb, `document.querySelector('#tossOv [data-go]').click()`, '되돌리기를 시작했어요');
    Lb.close();
    mainLogs.push(...Lb.log.split(/\r?\n/).filter((l) => /\[update\]/.test(l)));
    out.steps.uiB = uiPidOf(Lb.log);
    if (!out.steps.uiB || !Lb.log.includes(`이전 판 ${vA} 으로 되돌리기`)) { fail('되돌리기 진행 창을 띄우지 않음: ' + JSON.stringify(out.steps.rollbackClick.last)); return out; }
    // A 가 같은 자리에서 다시 켜지는지 — 낮은 판도 덮어 깖
    out.steps.relaunchA = await waitRelaunch([La.pid, Lb.pid], `WeatherCG-Setup-${vA}-installtest.exe`, out.steps.uiB.pid, 'B');
    out.steps.relaunchA.msFromClick = Date.now() - tRb;
    if (!out.steps.relaunchA.found) { fail('되돌린 A 가 다시 켜지지 않음'); return out; }

    // 6) 되돌린 A — '나중에'를 골라도 메뉴 [업데이트하기]로 다시 최신(시험 — 실행 직전까지)
    const Lc = await launch('A2', { WCG_UPDATE_DRYRUN: '1' });
    if (Lc.err) { fail('되돌린 A 화면을 못 찾음'); out.mainLog = { exited: Lc.exited, code: Lc.code, log: Lc.log.slice(-3000), procs: procs(EXE) }; return out; }
    const popup2 = await settle(Lc, '새 업데이트가 있습니다');
    out.steps.again = { popup: popup2 && popup2.title, appVersion: await Lc.evalJs('window.wcgDesktop.appVersion') };
    await Lc.evalJs(`(() => { const b = document.querySelector('#tossOv [data-later]'); if (b) b.click(); })()`);
    await sleep(600);
    out.steps.again.menu = await openMenu(Lc, (m) => /새 판/.test(m.pill));
    out.steps.again.install = await followInstall(Lc, `document.querySelector('#updBox [data-upd-act="install"]').click()`, '설치 직전까지 확인했어요');
    Lc.close();
    mainLogs.push(...Lc.log.split(/\r?\n/).filter((l) => /\[update\]/.test(l)));
    killOurs(Lc.pid);
    await sleep(1500);

    // 7) 조용히 제거 → 폴더까지
    const un = path.join(inst, `Uninstall ${NAME}.exe`);
    const t5 = Date.now();
    human('제거 — 관리자 확인 창이 뜨면 [예]를 눌러 주세요(4/4)');
    spawnSync(un, ['/S', ...(PM ? ['/allusers'] : [])], { windowsHide: true, timeout: PM ? 300000 : 120000 });
    for (let i = 0; i < 240 && fs.existsSync(aExe); i++) await sleep(500);
    for (let i = 0; i < 20 && fs.existsSync(inst); i++) await sleep(500);
    out.steps.uninstall = { ms: Date.now() - t5, exeGone: !fs.existsSync(aExe), dirGone: !fs.existsSync(inst), left: fs.existsSync(inst) ? fs.readdirSync(inst).slice(0, 10) : [], reg: regEntry() };
  } finally {
    out.steps.mainLog = mainLogs;
    if (live && !live.exited) killOurs(live.pid);
    // 설치 프로그램이 아직 돌면(중간에 멈춘 경우) 끝날 때까지 — 그 사이 정리하면 설치가 끊기거나 사본을 못 지운다
    for (let i = 0; i < 360 && installerProcs(tempCopy).length; i++) await sleep(500);
    out.steps.installerLeft = installerProcs(tempCopy).length;
    for (const p of mainProcs(EXE)) if (String(p.ExecutablePath || '').toLowerCase().startsWith(inst.toLowerCase())) killPid(p.ProcessId);   // 이 점검이 깐 것만
    // 중간에 멈춰 아직 깔려 있으면 지운다(이 점검이 깐 설치 시험판만)
    const unLeft = path.join(inst, `Uninstall ${NAME}.exe`);
    if (fs.existsSync(unLeft)) {
      human('정리 — 남은 설치 시험판을 지웁니다. 관리자 확인 창이 뜨면 [예]를 눌러 주세요');
      spawnSync(unLeft, ['/S', ...(PM ? ['/allusers'] : [])], { windowsHide: true, timeout: PM ? 300000 : 120000 });
      for (let i = 0; i < 240 && fs.existsSync(path.join(inst, EXE)); i++) await sleep(500);
      out.steps.cleanupUninstall = !fs.existsSync(path.join(inst, EXE));
    }
    // 8) 정리 — 이 점검이 만든 것만
    try { const { rmTestProfile } = require('./test-profile.cjs'); for (const pid of launched) rmTestProfile(pid); } catch (e) { /* 없음 */ }
    if (!pre.appData) fs.rmSync(appDataDir, { recursive: true, force: true });
    if (!pre.lad) fs.rmSync(ladDir, { recursive: true, force: true });
    for (let i = 0; i < 40 && uiProcs().length; i++) await sleep(250);   // 진행 창이 남아 있으면(문제 화면) 사본을 못 지운다 — 잠깐 기다림
    out.steps.uiLeftAtEnd = uiProcs().map((p) => p.ProcessId);
    for (const p of uiProcs()) killPid(p.ProcessId);   // 이 점검이 띄운 진행 창(임시 폴더 사본)만
    for (const v of [vA, vB]) for (const f of [`WeatherCG-Setup-${v}-installtest.exe`, `WeatherCG-Setup-${v}-installtest.exe.partial`]) fs.rmSync(path.join(tempCopy, f), { force: true });
    if (fs.existsSync(tempCopy)) for (const n of fs.readdirSync(tempCopy)) {
      if (preTemp.has(n) || !/^(WeatherCG-Update.*\.exe|ui-.*\.ready(\.tmp)?|ui-fonts|update-ui\.log)$/.test(n)) continue;
      try { fs.rmSync(path.join(tempCopy, n), { recursive: true, force: true }); } catch (e) { /* 잠김 */ }
    }
    try { if (fs.existsSync(tempCopy) && !fs.readdirSync(tempCopy).length) fs.rmdirSync(tempCopy); } catch (e) { /* 다른 파일 있음 */ }
    fs.rmSync(upd, { recursive: true, force: true });
    try { fs.rmSync(setupDir, { recursive: true, force: true }); } catch (e) { /* 잠김 — 임시 폴더 */ }
    out.steps.after = { appData: fs.existsSync(appDataDir), lad: fs.existsSync(ladDir), reg: regAny(), user: procs(USER_EXE).map((p) => p.ProcessId).sort(), testProcs: procs(EXE).length,
      desktopLnk: fs.existsSync(path.join(os.homedir(), 'Desktop', NAME + '.lnk')) || fs.existsSync(path.join(process.env.PUBLIC || 'C:\\Users\\Public', 'Desktop', NAME + '.lnk')),
      startLnk: fs.existsSync(path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', NAME + '.lnk'))
        || fs.existsSync(path.join(process.env.ProgramData || 'C:\\ProgramData', 'Microsoft', 'Windows', 'Start Menu', 'Programs', NAME + '.lnk')),
      updaterCopy: fs.existsSync(path.join(process.env.LOCALAPPDATA, 'weathercg-installtest-updater')) };
  }
  const s = out.steps;
  const want = (c, m) => { if (!c) fail(m); };
  const reV = (v) => new RegExp('^' + v.replace(/\./g, '\\.') + '(\\.0)?$');
  want(s.installA && s.installA.asarVersion === vA, 'A 판이 ' + vA + ' 이 아님');
  want(s.publish && s.publish.version === vB && JSON.stringify(s.publish.history) === JSON.stringify([vB, vA])
    && s.publish.files.includes(`WeatherCG-Setup-${vA}-installtest.exe`) && s.publish.files.includes(`WeatherCG-Setup-${vB}-installtest.exe`), '올린 내역·파일');
  want(s.desk && s.desk.appVersion === vA && s.desk.packaged === true && s.desk.groupVisible, 'A 다리·설정 메뉴 묶음');
  want(s.desk && s.desk.badge && s.desk.anim === 'updBreath', '새 판인데 렌치가 안 깜빡임');
  want(s.popup && s.popup.body.includes('새 판 ' + vB) && /판만 올린 설치 시험판/.test(s.popup.body), '팝업 내용');
  want(s.menuA && s.menuA.pill === `새 판 ${vB} 있어요` && s.menuA.cur === vA && s.menuA.install && JSON.stringify(s.menuA.hist) === JSON.stringify([vB, vA])
    && !s.menuA.rollback.length && s.menuA.badge, 'A 메뉴(새 판·내역·되돌릴 판 없음·연 뒤에도 깜빡임 유지)');
  want(s.installClick && s.installClick.exited, 'A 가 안 꺼짐');
  want(s.installClick && s.installClick.last && s.installClick.last.widths && s.installClick.last.widths.length > 0, '받기 진행 막대가 안 움직임');
  want(s.relaunchB && reV(vB).test(String(s.relaunchB.exeVersion)) && s.relaunchB.asarVersion === vB, '다시 켜진 앱 판이 ' + vB + ' 이 아님');
  want(s.relaunchB && /--updated/.test(s.relaunchB.commandLine || ''), '업데이트로 켠 것(--updated)이 아님');
  want(s.relaunchB && regAt(s.relaunchB.reg, vB), '같은 자리에 ' + vB + ' 로 등록 안 됨');
  // 진행 창 — 떴다는 알림·새 앱을 켠 것이 창·한 번만 켜짐·기록이 끝까지·창이 스스로 닫힘·캡처
  const uiOk = (r, ui, tag) => {
    want(ui && ui.readyMs < 15000, tag + ' 진행 창이 뜬 알림');
    want(r && ui && r.parent === ui.pid, tag + ' 새 앱을 켠 것이 진행 창이 아님(부모 ' + (r && r.parent) + ')');
    want(r && r.instances === 1, tag + ' 앱이 한 번만 켜져야 함(' + (r && r.instances) + ')');
    const L = (r && r.ui) || [];
    for (const re of [/^창이 뜸/, /^앱 닫힘/, /^설치 파일 확인 — 크기·sha256 맞음/, /^설치 프로그램 실행\(\/S --updated\)/, /^설치 프로그램 끝 — 종료 코드 0/, /^새 앱 창이 보임/, /^끝 —/])
      want(L.some((l) => re.test(l)), tag + ' 진행 창 기록에 없음: ' + re);
    want(r && !r.uiLeft, tag + ' 진행 창이 끝난 뒤 안 닫힘');
    // '모든 사용자' — 창이 그렇게 알아봤는지(등록 HKLM), 관리자 확인 창이 떴는지(기록 — 사람이 아주 빨리 누르면 못 볼 수 있어 기록만)
    if (PM) {
      want(L.some((l) => /^시작 — .*모든 사용자 설치\(관리자 확인\)/.test(l)), tag + " 진행 창이 '모든 사용자' 설치로 알아보지 못함");
      if (r) r.adminSeen = L.some((l) => /^관리자 확인 창이 뜸/.test(l));
    }
    if (SHOT_DIR) {
      const d = path.join(SHOT_DIR, 'ui-' + tag), n = fs.existsSync(d) ? fs.readdirSync(d) : [];
      want(['step0', 'step2', 'install-progress', 'step3', 'done'].every((t) => n.some((x) => x.includes(t) && x.endsWith('-screen.png'))), tag + ' 진행 창 캡처: ' + n.join(','));
    }
  };
  uiOk(s.relaunchB, s.uiA, 'A');
  want(s.menuB && s.menuB.pill === '최신이에요' && s.menuB.cur === vB && JSON.stringify(s.menuB.rollback) === JSON.stringify([vA]), 'B 메뉴(최신·되돌릴 판 ' + vA + ')');
  want(s.rollbackAsk && s.rollbackAsk.title.startsWith(vA) && /되돌릴까요\?$/.test(s.rollbackAsk.title) && JSON.stringify(s.rollbackAsk.buttons) === '["취소","되돌리기"]', '되돌리기 확인 팝업');
  want(s.rollbackClick && s.rollbackClick.started && s.rollbackClick.exited, '되돌리기 시작·B 꺼짐');
  want(s.relaunchA && reV(vA).test(String(s.relaunchA.exeVersion)) && s.relaunchA.asarVersion === vA, '되돌린 앱 판이 ' + vA + ' 이 아님');
  want(s.relaunchA && /--updated/.test(s.relaunchA.commandLine || ''), '되돌리기로 켠 것(--updated)이 아님');
  want(s.relaunchA && regAt(s.relaunchA.reg, vA) && arr(s.relaunchA.reg).length === 1, '같은 자리에 ' + vA + ' 으로(하나만) 등록 안 됨');
  uiOk(s.relaunchA, s.uiB, 'B');
  want(s.again && s.again.appVersion === vA && s.again.menu && s.again.menu.install && s.again.install && s.again.install.started, '되돌린 판에서 다시 최신으로(나중에 고른 뒤 메뉴 [업데이트하기])');
  if (DECLINE) {
    const d = s.decline || {};
    want(/관리자 확인 창에서 \[아니요\]를 누르셨다면/.test(d.screen || ''), '거절 시험: 문제 화면에 관리자 확인 안내가 없음 — ' + d.screen);
    want(reV(vA).test(String(d.appVersionNow)), '거절 시험: [아니요] 뒤 옛 판이 그대로가 아님(' + d.appVersionNow + ')');
    want(d.retryClick === 'ok', '거절 시험: [다시 시도]를 못 누름(' + d.retryClick + ')');
  }
  want(s.uninstall && s.uninstall.exeGone && s.uninstall.dirGone, '제거 뒤 설치 폴더가 남음');
  want(s.after && JSON.stringify(s.after.user) === JSON.stringify(s.before.user), '사용자 앱 프로세스가 바뀜');
  want(s.after && !s.after.reg.length && !s.after.testProcs && !s.after.desktopLnk && !s.after.startLnk, '설치 시험판 흔적이 남음');
  out.ok = !out.errors.length;
  return out;
}

if (require.main === module) {
  const guard = setTimeout(() => { OUT.errors.push('점검 전체 시간 초과(25분)'); console.log(JSON.stringify(OUT, null, 2)); process.exit(1); }, 25 * 60 * 1000);   // 기다림이 남아 있게도 한다
  main().then((o) => { clearTimeout(guard); console.log(JSON.stringify(o, null, 2)); process.exit(o.ok ? 0 : 1); }, (e) => { console.log(JSON.stringify({ ok: false, errors: ['점검기 오류: ' + (e && e.stack || e)], steps: OUT.steps })); process.exit(2); });
}
