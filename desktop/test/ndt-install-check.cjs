#!/usr/bin/env node
'use strict';
// NDT 자리 설치 끝에서 끝 점검(10-26 — NDT 런처 통합. 사람이·AI가 손으로 돌림, node --test 에는 안 넣음). MODULES.md 10장 'NDT 자리'.
//
//   node desktop/test/ndt-install-check.cjs --a=<WeatherCG-Setup-<판A>-installtest.exe> --b=<WeatherCG-Setup-<판B>-installtest.exe> --work=<임시 폴더>
//   (A·B 굽기: node tools/build-installer.cjs --installtest --version=1.0.7 --work=… / … --version=1.0.8 --work=…)
//
// 설치 시험판 '날씨 CG 설치시험'만 쓴다(사용자 설치판 '날씨 CG'·그 자료·실행 중인 앱은 건드리지 않는다). 시작 전에 시험판 설치 기록·NDT 시험 자리가 있으면 멈춘다.
//  1) 새 설치: A /S(자리 인자 없음) → %LOCALAPPDATA%\NDT\apps\weather-cg-installtest. exe 판, 등록(Software\<GUID> InstallLocation,
//     제거 목록 DisplayName·DisplayVersion·DisplayIcon·UninstallString·InstallLocation), 바로 가기 둘의 대상이 그 자리인지, 예전 기본 자리가 안 생겼는지
//  2) 실행: 보통 실행(점검 모드 아님) → 자료 NDT\data(Local Storage)·기록 NDT\logs(crashes)가 생기고 예전 자료 자리(%APPDATA%\날씨 CG 설치시험)는 안 생기는지. 표시 파일을 자료에 둠
//  3) 업데이트(같은 자리): B /S --updated → 같은 자리·판 B·등록 판 B·표시 파일 그대로
//  4) 제거: 'Uninstall 날씨 CG 설치시험.exe' /S → 설치 폴더·등록·바로 가기 없음, 자료(표시 파일) 남음
//  5) 다시 설치: A /S → 같은 NDT 자리, 실행하면 남은 자료를 그대로 씀(표시 파일·Local Storage) → 제거
//  6) 예전(사용자 지정) 자리 업데이트: A /S /D=<work>\예전 자리\날씨 앱(공백·한글) → B /S --updated(자리 인자 없음) → 그 자리 그대로·NDT 앱 자리 안 생김,
//     실행하면 예전 자료 자리(%APPDATA%) 그대로 씀 → 제거
//  7) 정리: 이 점검이 만든 것만(NDT 시험 자료·캐시·기록, %APPDATA%\날씨 CG 설치시험·%LOCALAPPDATA%\WeatherCG-installtest — 점검 전에 없던 때만)
// 띄운 앱은 그 PID 트리로만 끈다. 결과: JSON { ok, steps, problems }.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync, spawn } = require('child_process');
const B = require('../../tools/build-installer.cjs');
const SU = require('../../tools/build-setup-ui.cjs');

const args = process.argv.slice(2);
const opt = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const A = path.resolve(opt('a', '')), BB = path.resolve(opt('b', '')), WORK = path.resolve(opt('work', path.join(os.tmpdir(), 'wcg-ndt-check')));
const NAME = B.INSTALLTEST.productName, EXE = NAME + '.exe', GUID = SU.appGuid(B.INSTALLTEST.appId);
const LAD = process.env.LOCALAPPDATA, RAD = process.env.APPDATA;
const NDT = { app: path.join(LAD, 'NDT', 'apps', 'weather-cg-installtest'), data: path.join(LAD, 'NDT', 'data', 'weather-cg-installtest'),
  cache: path.join(LAD, 'NDT', 'cache', 'weather-cg-installtest'), logs: path.join(LAD, 'NDT', 'logs', 'weather-cg-installtest') };
const OLD_DEFAULT = path.join(LAD, 'Programs', B.INSTALLTEST.name), OLD_DATA = path.join(RAD, NAME), OLD_CACHE = path.join(LAD, 'WeatherCG-installtest');
const CUSTOM = path.join(WORK, '예전 자리', '날씨 앱');
const verOf = (f) => (/-(\d+\.\d+\.\d+)-installtest\.exe$/.exec(f) || [])[1];
const vA = verOf(A), vB = verOf(BB);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const exists = (p) => { try { return fs.existsSync(p); } catch (e) { return false; } };
const steps = {}, problems = [];
const want = (c, m) => { if (!c) problems.push(m); };

function ps(cmd) {
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '[Console]::OutputEncoding=[Text.Encoding]::UTF8;' + cmd], { encoding: 'utf8', windowsHide: true, timeout: 60000 });
  return String(r.stdout || '').trim();
}
const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
function exeVersion(f) { return exists(f) ? ps(`[System.Diagnostics.FileVersionInfo]::GetVersionInfo(${q(f)}).ProductVersion`) : null; }
function reg() {
  const j = ps(`$o=@{};foreach($h in 'HKCU','HKLM'){$k=Get-ItemProperty -LiteralPath ($h+':\\Software\\${GUID}') -ErrorAction SilentlyContinue;if($k){$o[$h+'_loc']=$k.InstallLocation}};`
    + `$u=Get-ChildItem 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall' -ErrorAction SilentlyContinue | % { Get-ItemProperty $_.PSPath } | ? { $_.DisplayName -eq ${q(NAME)} } | select -First 1;`
    + `if($u){$o.un=@{name=$u.DisplayName;version=$u.DisplayVersion;icon=$u.DisplayIcon;uninstall=$u.UninstallString;quiet=$u.QuietUninstallString;loc=$u.InstallLocation;publisher=$u.Publisher}};$o|ConvertTo-Json -Compress -Depth 4`);
  try { return JSON.parse(j || '{}'); } catch (e) { return { raw: j }; }
}
function shortcuts() {
  const j = ps(`$s=New-Object -ComObject WScript.Shell;$o=@{};foreach($p in @([Environment]::GetFolderPath('Desktop'),[Environment]::GetFolderPath('Programs'))){$f=Join-Path $p ${q(NAME + '.lnk')};if(Test-Path -LiteralPath $f){$o[$f]=$s.CreateShortcut($f).TargetPath}};$o|ConvertTo-Json -Compress`);
  try { return JSON.parse(j || '{}'); } catch (e) { return {}; }
}
const under = (p, dir) => !!p && path.resolve(String(p).replace(/^"|"(?=\s|$).*$/g, '').replace(/,\d+$/, '')).toLowerCase().startsWith(path.resolve(dir).toLowerCase() + path.sep);
function run(exe, argv, ms) {
  const t0 = Date.now();
  const r = spawnSync(exe, argv, { windowsHide: true, timeout: ms || 600000, windowsVerbatimArguments: true });
  return { code: r.status, ms: Date.now() - t0, err: r.error ? r.error.message : undefined };
}
async function waitGone(p, ms) { const t = Date.now() + ms; while (exists(p) && Date.now() < t) await sleep(500); return !exists(p); }
// 보통 실행(점검 모드 아님 — 실제 자료 자리를 쓴다) → 자료가 생길 때까지 → PID 트리로 끔
async function launchAndClose(dir, dataDir) {
  const exe = path.join(dir, EXE);
  const env = { ...process.env }; delete env.WCG_TEST; delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(exe, [], { env, detached: false, stdio: 'ignore', windowsHide: false });
  let spawnErr = null; child.on('error', (e) => { spawnErr = e.message; });
  const t = Date.now() + 40000;
  let ls = false;
  while (Date.now() < t) { ls = exists(path.join(dataDir, 'Local Storage')); if (ls) break; await sleep(500); }
  await sleep(2500);
  const out = { pid: child.pid, localStorage: ls, spawnErr };
  spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true });
  await sleep(1500);
  return out;
}
const snapshot = (dir) => ({ exeVersion: exeVersion(path.join(dir, EXE)), reg: reg(), lnk: shortcuts() });
const copySetup = (f) => { const d = path.join(WORK, 'setup'); fs.mkdirSync(d, { recursive: true }); const to = path.join(d, path.basename(f)); fs.copyFileSync(f, to); return to; };

(async () => {
  if (!vA || !vB || !exists(A) || !exists(BB)) { console.error('--a·--b = 설치 시험판 두 개(…-<판>-installtest.exe)'); process.exit(2); }
  const pre = { reg: reg(), ndt: Object.values(NDT).filter(exists), oldDefault: exists(OLD_DEFAULT) };
  if (pre.reg.HKCU_loc || pre.reg.HKLM_loc || pre.reg.un || pre.ndt.length || pre.oldDefault) { console.log(JSON.stringify({ ok: false, error: '시험판 설치 기록이나 NDT 시험 자리가 이미 있어요 — 먼저 정리', pre }, null, 2)); process.exit(1); }
  const had = { oldData: exists(OLD_DATA), oldCache: exists(OLD_CACHE) };
  fs.mkdirSync(WORK, { recursive: true });
  const a = copySetup(A), b = copySetup(BB);
  const uninstaller = (dir) => path.join(dir, `Uninstall ${NAME}.exe`);
  try {
    // 1) 새 설치
    let r = run(a, ['/S']);
    let s = snapshot(NDT.app);
    steps.fresh = { run: r, ...s, oldDefaultMade: exists(OLD_DEFAULT) };
    want(r.code === 0, '새 설치 종료 코드 ' + r.code);
    want(s.exeVersion === vA, '새 설치 exe 판 ' + s.exeVersion);
    want(s.reg.HKCU_loc && path.resolve(s.reg.HKCU_loc).toLowerCase() === NDT.app.toLowerCase(), '새 설치 등록 자리 ' + s.reg.HKCU_loc);
    want(s.reg.un && s.reg.un.version === vA && under(s.reg.un.icon, NDT.app) && under(s.reg.un.uninstall, NDT.app), '제거 목록 ' + JSON.stringify(s.reg.un));
    want(Object.keys(s.lnk).length === 2 && Object.values(s.lnk).every((t) => under(t, NDT.app)), '바로 가기 ' + JSON.stringify(s.lnk));
    want(!steps.fresh.oldDefaultMade, '예전 기본 자리가 생김');
    // 2) 실행 → NDT 자료
    const l1 = await launchAndClose(NDT.app, NDT.data);
    steps.run1 = { ...l1, data: exists(NDT.data), logs: exists(NDT.logs), crashes: exists(path.join(NDT.logs, 'crashes')), cache: exists(NDT.cache), oldDataMade: !had.oldData && exists(OLD_DATA), oldCacheMade: !had.oldCache && exists(OLD_CACHE) };
    want(l1.localStorage, 'NDT 자료(Local Storage)가 안 생김');
    want(!steps.run1.oldDataMade, '예전 자료 자리(%APPDATA%)가 생김');
    want(!steps.run1.oldCacheMade, '예전 캐시 자리가 생김');
    const marker = path.join(NDT.data, 'ndt-check-marker.txt');
    fs.writeFileSync(marker, 'keep ' + Date.now());
    // 3) 업데이트(같은 자리)
    r = run(b, ['/S', '--updated']);
    s = snapshot(NDT.app);
    steps.update = { run: r, ...s, marker: exists(marker), oldDefaultMade: exists(OLD_DEFAULT) };
    want(r.code === 0 && s.exeVersion === vB && s.reg.un && s.reg.un.version === vB, '업데이트 ' + JSON.stringify({ code: r.code, v: s.exeVersion, un: s.reg.un && s.reg.un.version }));
    want(s.reg.HKCU_loc && path.resolve(s.reg.HKCU_loc).toLowerCase() === NDT.app.toLowerCase(), '업데이트 뒤 자리 ' + s.reg.HKCU_loc);
    want(steps.update.marker, '업데이트 뒤 자료 표시 파일이 없어짐');
    // 4) 제거
    r = run(uninstaller(NDT.app), ['/S']);
    const gone = await waitGone(NDT.app, 60000);
    s = { reg: reg(), lnk: shortcuts() };
    steps.uninstall = { run: r, appGone: gone, ...s, data: exists(NDT.data), marker: exists(marker) };
    want(gone && !s.reg.HKCU_loc && !s.reg.un && !Object.keys(s.lnk).length, '제거 ' + JSON.stringify({ gone, reg: s.reg, lnk: s.lnk }));
    want(steps.uninstall.marker, '제거가 자료를 지움');
    // 5) 다시 설치 → 남은 자료 그대로
    r = run(a, ['/S']);
    s = snapshot(NDT.app);
    const l2 = await launchAndClose(NDT.app, NDT.data);
    steps.reinstall = { run: r, exeVersion: s.exeVersion, loc: s.reg.HKCU_loc, launch: l2, marker: exists(marker), oldDataMade: !had.oldData && exists(OLD_DATA) };
    want(r.code === 0 && s.exeVersion === vA && path.resolve(s.reg.HKCU_loc || '.').toLowerCase() === NDT.app.toLowerCase(), '다시 설치 ' + JSON.stringify(steps.reinstall));
    want(steps.reinstall.marker && l2.localStorage && !steps.reinstall.oldDataMade, '다시 설치 뒤 자료');
    r = run(uninstaller(NDT.app), ['/S']); await waitGone(NDT.app, 60000);
    // 6) 예전(사용자 지정) 자리 — 공백·한글
    fs.mkdirSync(path.dirname(CUSTOM), { recursive: true });
    r = run(a, ['/S', '/D=' + CUSTOM]);
    const s1 = snapshot(CUSTOM);
    const r2 = run(b, ['/S', '--updated']);
    const s2 = snapshot(CUSTOM);
    const l3 = await launchAndClose(CUSTOM, OLD_DATA);
    steps.custom = { install: { run: r, exeVersion: s1.exeVersion, loc: s1.reg.HKCU_loc }, update: { run: r2, exeVersion: s2.exeVersion, loc: s2.reg.HKCU_loc, un: s2.reg.un, lnk: s2.lnk },
      ndtAppMade: exists(NDT.app), launch: l3, ndtDataTouched: exists(path.join(NDT.data, 'Local Storage')) };
    want(r.code === 0 && s1.exeVersion === vA && path.resolve(s1.reg.HKCU_loc || '.').toLowerCase() === CUSTOM.toLowerCase(), '지정 자리 설치 ' + JSON.stringify(steps.custom.install));
    want(r2.code === 0 && s2.exeVersion === vB && path.resolve(s2.reg.HKCU_loc || '.').toLowerCase() === CUSTOM.toLowerCase(), '지정 자리 업데이트 ' + JSON.stringify(steps.custom.update));
    want(s2.reg.un && under(s2.reg.un.uninstall, CUSTOM) && Object.values(s2.lnk).every((t) => under(t, CUSTOM)), '지정 자리 등록·바로 가기');
    want(!steps.custom.ndtAppMade, '지정 자리 업데이트가 NDT 앱 자리를 만듦');
    want(l3.localStorage, '지정 자리 실행이 예전 자료 자리(%APPDATA%)를 안 씀');
    r = run(uninstaller(CUSTOM), ['/S']);
    steps.custom.uninstall = { run: r, gone: await waitGone(CUSTOM, 60000), reg: reg() };
  } catch (e) {
    problems.push('예외: ' + (e && e.stack || e));
  } finally {
    // 7) 정리 — 남은 시험판 설치는 제거기로, 자료는 점검이 만든 것만
    for (const d of [NDT.app, CUSTOM]) if (exists(uninstaller(d))) { run(uninstaller(d), ['/S']); await waitGone(d, 60000); }
    for (const d of [NDT.data, NDT.cache, NDT.logs]) fs.rmSync(d, { recursive: true, force: true });
    for (const d of [path.join(LAD, 'NDT', 'apps', 'weather-cg-installtest')]) { try { fs.rmdirSync(d); } catch (e) { /* 없음 */ } }
    if (!had.oldData) fs.rmSync(OLD_DATA, { recursive: true, force: true });
    if (!had.oldCache) fs.rmSync(OLD_CACHE, { recursive: true, force: true });
    steps.cleanup = { reg: reg(), left: [...Object.values(NDT), CUSTOM].filter(exists) };
  }
  const ok = problems.length === 0;
  console.log(JSON.stringify({ ok, a: vA, b: vB, guid: GUID, problems, steps }, null, 2));
  process.exit(ok ? 0 : 1);
})();
