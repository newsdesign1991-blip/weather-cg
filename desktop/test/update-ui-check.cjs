// 업데이트 진행 창(WeatherCG-Update.exe) 혼자 띄워 보기 — 가짜 앱·가짜 설치 파일로 흐름을 흉내 내고 캡처를 모은다(사람·AI가 손으로 — node --test 에는 안 넣음).
// MODULES.md 10장 '앱 업데이트 — 진행 창'. 진짜 설치판·사용자 앱·%APPDATA%·%TEMP%\wcg-update 는 건드리지 않는다(모두 --work 안에서).
//
//   node desktop/test/update-ui-check.cjs --work=<임시 폴더> [--exe=<구운 창 exe>] [--only=ok,rollback,…]
//
// 가짜 앱 '날씨 CG 가짜시험.exe'(WinForms — 판 정보만 1.0.1/1.0.2)와 가짜 설치 파일 'WeatherCG-Setup-<판>.exe'(설정 파일대로 옛 exe 를 지우고 새 exe·파일 몇십 개를
// 천천히 놓고 정한 종료 코드로 끝남)를 csc 로 구워 장면마다 따로 폴더에서 돌린다. 창은 --shots 로 단계마다 자기 그림(투명 바탕)·실제 화면 자리를 PNG 로 남긴다.
// 장면: ok(업데이트 끝까지) · rollback(되돌리기 끝까지) · fail-exit(설치 종료 코드 2 → 빨강 → [예전 판 그대로 켜기], 막대가 시간만으로 55% 넘지 않음) · sha(확인값 다름 → [닫기])
//       · admin-no('모든 사용자' + 종료 코드 2 = 관리자 확인 [아니요] 흉내 → 관리자 안내) · admin-wait(이름만 consent.exe 인 프로그램으로 관리자 확인 창 흉내 →
//         '[예]를 눌러 주세요'·막대 멈춤 → 닫히면 끝까지) · timeout(설치가 아직 돎 → [닫기]만)
//       · failafter(옛 exe 를 지운 뒤 실패 → '[다시 시도]로 다시 설치') · no-window(새 앱 창이 안 뜸 → '다시 켜기') · admin(모든 사용자 설치 안내 — 강제) · stuck(앱이 안 닫힘 → 멈춤)
// 결과: JSON { ok, scenes: { 이름: { ok, exit, log[], shots[], … } } }. 띄운 것은 PID 로만 끈다.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn, spawnSync, execFileSync } = require('child_process');
const { buildUpdateUi, findCsc } = require('../../tools/build-update-ui.cjs');

const args = process.argv.slice(2);
const opt = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const APP_NAME = '날씨 CG 가짜시험.exe';

const FAKE_APP = (ver) => `
using System; using System.IO; using System.Reflection; using System.Threading; using System.Windows.Forms;
[assembly: AssemblyVersion("${ver}.0")] [assembly: AssemblyFileVersion("${ver}.0")] [assembly: AssemblyInformationalVersion("${ver}")]
[assembly: AssemblyProduct("날씨 CG 가짜시험")]
static class P {
  [STAThread] static void Main(string[] a) {
    int exitAfter = 0; foreach (string s in a) if (s.StartsWith("--exit-after=")) int.TryParse(s.Substring(13), out exitAfter);
    string cfg = Application.ExecutablePath + ".json";
    if (File.Exists(cfg) && File.ReadAllText(cfg).Contains("noWindow")) { Thread.Sleep(90000); return; }
    var f = new Form { Text = "가짜 날씨 CG ${ver}", Width = 460, Height = 150, StartPosition = FormStartPosition.Manual, Left = 30, Top = 30 };
    f.Controls.Add(new Label { Text = "업데이트 시험용 가짜 앱 ${ver}  [" + string.Join(" ", a) + "]", Dock = DockStyle.Fill });
    if (exitAfter > 0) { var t = new System.Windows.Forms.Timer { Interval = exitAfter }; t.Tick += delegate { f.Close(); }; t.Start(); }
    Application.Run(f);
  }
}`;
const FAKE_SETUP = `
using System; using System.Collections.Generic; using System.IO; using System.Threading; using System.Windows.Forms;
static class S {
  static int Main(string[] a) {
    string me = Application.ExecutablePath;
    File.WriteAllText(me + ".args.txt", string.Join(" ", a));
    var c = new Dictionary<string, string>();
    foreach (string l in File.ReadAllLines(me + ".cfg")) { int i = l.IndexOf('='); if (i > 0) c[l.Substring(0, i)] = l.Substring(i + 1); }
    int sleep = int.Parse(c["sleep"]), code = int.Parse(c["exit"]), files = int.Parse(c["files"]);
    string dir = c["install"], exe = Path.Combine(dir, c["exe"]);
    // 관리자 확인 흉내 — 문 파일이 있는 동안은 아무것도 안 함(진짜는 바깥 설치 파일이 [예]를 기다림)
    if (c.ContainsKey("gate") && c["gate"].Length > 0) while (File.Exists(c["gate"])) Thread.Sleep(100);
    if (code != 0) { if (c.ContainsKey("failafter") && c["failafter"] == "1" && File.Exists(exe)) File.Delete(exe); Thread.Sleep(sleep); return code; }
    Thread.Sleep(sleep / 5);
    if (File.Exists(exe)) File.Delete(exe);
    string res = Path.Combine(dir, "res");
    if (Directory.Exists(res)) Directory.Delete(res, true);
    Thread.Sleep(sleep / 10);
    Directory.CreateDirectory(res);
    for (int i = 0; i < files; i++) { File.WriteAllBytes(Path.Combine(res, "f" + i + ".bin"), new byte[4096 + i]); Thread.Sleep(sleep * 6 / 10 / Math.Max(1, files)); }
    File.Copy(c["payload"], exe, true);
    if (c.ContainsKey("nowindow") && c["nowindow"] == "1") File.WriteAllText(exe + ".json", "{\\"noWindow\\":true}");
    Thread.Sleep(sleep / 10);
    return 0;
  }
}`;

function csc(src, out, refs) {
  const c = findCsc();
  if (!c) throw new Error('csc 없음');
  const cs = out + '.cs';
  fs.writeFileSync(cs, src);
  const r = spawnSync(c.csc, ['/nologo', '/target:winexe', '/codepage:65001', `/out:${out}`, ...refs.map((x) => `/reference:${path.join(c.dir, x)}`), cs], { encoding: 'utf8', windowsHide: true });
  if (r.status !== 0) throw new Error('csc 실패 ' + out + '\n' + r.stdout + r.stderr);
}
const sha256 = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const killPid = (pid) => { try { execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' }); } catch (e) { /* 이미 꺼짐 */ } };
// PowerShell(UTF-16 base64 명령 — 한글 그대로) → 출력
function ps(cmd) {
  const enc = Buffer.from(`[Console]::OutputEncoding = [Text.Encoding]::UTF8; ${cmd}`, 'utf16le').toString('base64');
  return String(spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', enc], { encoding: 'utf8', windowsHide: true, timeout: 60000 }).stdout || '').trim();
}
// 이 exe 경로로 도는 프로세스 번호들
const procsAt = (exe) => {
  const t = ps(`@(Get-CimInstance Win32_Process -Filter "Name='${path.basename(exe).replace(/'/g, "''")}'" | Where-Object { $_.ExecutablePath -eq '${exe.replace(/'/g, "''")}' } | Select-Object -ExpandProperty ProcessId) -join ','`);
  return t ? t.split(',').map(Number).filter(Boolean) : [];
};
// 창 프로세스(pid)의 단추를 이름으로 누르기(UI 자동화) → 'ok' | 'no-window' | 'no-button'
function clickButton(pid, name) {
  return ps(`Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
$A = [System.Windows.Automation.AutomationElement]
$w = $null; for ($i = 0; $i -lt 20 -and -not $w; $i++) { $w = $A::RootElement.FindFirst([System.Windows.Automation.TreeScope]::Children, (New-Object System.Windows.Automation.PropertyCondition($A::ProcessIdProperty, ${pid}))); if (-not $w) { Start-Sleep -Milliseconds 200 } }
if (-not $w) { 'no-window'; exit }
$c = New-Object System.Windows.Automation.AndCondition((New-Object System.Windows.Automation.PropertyCondition($A::ControlTypeProperty, [System.Windows.Automation.ControlType]::Button)), (New-Object System.Windows.Automation.PropertyCondition($A::NameProperty, '${name}')))
$b = $w.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $c)
if (-not $b) { 'no-button'; exit }
$b.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke(); 'ok'`);
}

async function main() {
  const work = path.resolve(opt('work', path.join(os.tmpdir(), 'wcg-update-ui-check')));
  const only = opt('only', '').split(',').filter(Boolean);
  fs.mkdirSync(work, { recursive: true });
  const out = { ok: false, work, scenes: {}, errors: [] };
  // 창 exe
  let exe = opt('exe', '');
  if (!exe) {
    const b = buildUpdateUi({ out: path.join(work, 'bin', 'WeatherCG-Update.exe') });
    if (!b.ok) { out.errors.push('창 굽기 실패: ' + b.log); return out; }
    exe = b.out; out.build = { bytes: b.bytes, sha256: b.sha256, check: b.check };
  }
  exe = path.resolve(exe);
  // 가짜들
  const fk = path.join(work, 'fakes');
  fs.mkdirSync(fk, { recursive: true });
  const app101 = path.join(fk, 'app-1.0.1.exe'), app102 = path.join(fk, 'app-1.0.2.exe'), setupBin = path.join(fk, 'setup.exe');
  csc(FAKE_APP('1.0.1'), app101, ['System.Windows.Forms.dll', 'System.Drawing.dll']);
  csc(FAKE_APP('1.0.2'), app102, ['System.Windows.Forms.dll', 'System.Drawing.dll']);
  csc(FAKE_SETUP, setupBin, ['System.Windows.Forms.dll']);
  // 관리자 확인 창 흉내(이름만 consent.exe — 창 없이 잠만 잠, 장면이 PID 로 끔)
  const consentBin = path.join(fk, 'consent', 'consent.exe');
  fs.mkdirSync(path.dirname(consentBin), { recursive: true });
  csc('static class C { static void Main() { System.Threading.Thread.Sleep(120000); } }', consentBin, []);
  const fontsDir = path.join(work, 'fonts');

  // 장면 하나 — o = { from, to, rollback, sleep, exit, nowindow, badSha, stuckApp, extra[], click: { after: 'fail-stepN', name }, expectExit }
  async function scene(name, o) {
    const dir = path.join(work, name);
    fs.rmSync(dir, { recursive: true, force: true });
    const inst = path.join(dir, 'install'), sdir = path.join(dir, 'tmp'), shots = path.join(dir, 'shots');
    fs.mkdirSync(path.join(inst, 'res'), { recursive: true }); fs.mkdirSync(sdir, { recursive: true });
    const appExe = path.join(inst, APP_NAME);
    fs.copyFileSync(o.from === '1.0.2' ? app102 : app101, appExe);
    for (let i = 0; i < 40; i++) fs.writeFileSync(path.join(inst, 'res', `old${i}.bin`), Buffer.alloc(2048));
    const setup = path.join(sdir, `WeatherCG-Setup-${o.to}.exe`);
    fs.copyFileSync(setupBin, setup);
    fs.writeFileSync(setup + '.cfg', [`install=${inst}`, `exe=${APP_NAME}`, `payload=${o.to === '1.0.2' ? app102 : app101}`, `sleep=${o.sleep || 6000}`, `exit=${o.exit || 0}`,
      `files=${o.files || 60}`, `nowindow=${o.nowindow ? 1 : 0}`, `failafter=${o.failafter ? 1 : 0}`, `gate=${o.adminWaitMs ? path.join(dir, 'admin.gate') : ''}`].join('\n'));
    if (o.adminWaitMs) fs.writeFileSync(path.join(dir, 'admin.gate'), '');
    // 지금 도는 옛 앱(창이 그 pid 가 끝나길 기다림)
    const old = spawn(appExe, [`--exit-after=${o.stuckApp ? 600000 : 2200}`], { cwd: inst, stdio: 'ignore' });
    await sleep(900);
    const log = path.join(dir, 'update-ui.log'), ready = path.join(dir, 'ui.ready');
    const a = [`--pid=${old.pid}`, `--app=${appExe}`, '--product=날씨 CG', `--from=${o.from}`, `--to=${o.to}`, ...(o.rollback ? ['--rollback'] : []),
      `--setup=${setup}`, `--sha256=${o.badSha ? 'a'.repeat(64) : sha256(setup)}`, `--size=${fs.statSync(setup).size}`, `--ready=${ready}`, `--log=${log}`,
      `--fonts-dir=${fontsDir}`, `--shots=${shots}`, ...(o.extra || [])];
    const t0 = Date.now();
    const w = spawn(exe, a, { cwd: sdir, stdio: 'ignore' });
    const res = { exit: null, readyMs: null };
    w.on('exit', (c) => { res.exit = c; });
    for (let i = 0; i < 200 && res.readyMs == null && res.exit == null; i++) { await sleep(100); if (fs.existsSync(ready)) res.readyMs = Date.now() - t0; }
    // 관리자 확인 창 흉내 — 이름만 consent.exe 인 잠자는 프로그램(이 장면 폴더)을 띄워 두고, 가짜 설치는 문 파일이 지워질 때까지 기다린다 → 정한 시간 뒤 둘 다 치움
    if (o.adminWaitMs) {
      const consent = spawn(consentBin, [], { cwd: dir, stdio: 'ignore' });
      const tw = Date.now();
      while (Date.now() - tw < o.adminWaitMs && res.exit == null) await sleep(200);
      killPid(consent.pid);
      fs.rmSync(path.join(dir, 'admin.gate'), { force: true });
      res.adminWaitedMs = Date.now() - tw;
    }
    // 문제 화면이 뜨면(캡처가 생기면) 단추 누르기
    const deadline = Date.now() + (o.timeoutMs || 90000);
    let clicked = null;
    while (res.exit == null && Date.now() < deadline) {
      await sleep(300);
      if (o.click && !clicked && fs.existsSync(shots) && fs.readdirSync(shots).some((f) => f.includes(o.click.after) && f.endsWith('-screen.png'))) {
        await sleep(400);
        clicked = clickButton(w.pid, o.click.name);
        res.clicked = { name: o.click.name, result: clicked, atMs: Date.now() - t0 };
      }
      if (o.killAfterFail && fs.existsSync(shots) && fs.readdirSync(shots).some((f) => /fail-step\d-screen\.png$/.test(f))) { await sleep(500); killPid(w.pid); res.killed = true; break; }
    }
    if (res.exit == null && !res.killed) { killPid(w.pid); res.killed = 'timeout'; }
    await sleep(600);
    res.ms = Date.now() - t0;
    res.log = fs.existsSync(log) ? fs.readFileSync(log, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => l.slice(24)) : [];
    res.shots = fs.existsSync(shots) ? fs.readdirSync(shots).sort() : [];
    res.setupArgs = fs.existsSync(setup + '.args.txt') ? fs.readFileSync(setup + '.args.txt', 'utf8') : null;
    res.appVersionNow = fs.existsSync(appExe) ? ps(`[System.Diagnostics.FileVersionInfo]::GetVersionInfo('${appExe.replace(/'/g, "''")}').ProductVersion`) : null;
    res.running = procsAt(appExe);
    for (const pid of res.running) killPid(pid);   // 창이 켠 가짜 앱(이 장면 폴더의 exe)만
    res.setupLeft = procsAt(setup);
    for (const pid of res.setupLeft) killPid(pid);   // 아직 도는 가짜 설치 파일(시간 초과 장면 — 이 장면 폴더의 것만)
    // 문제 화면 줄(UpdateApp.cs Fail — '문제 화면 — 안내: … · 단추: … · 막대 N%')
    const fl = res.log.find((l) => l.startsWith('문제 화면 — '));
    if (fl) {
      const m = /^문제 화면 — 안내: (.*) · 단추: (.*?) · 막대 (\d+)%( · 설치 프로그램이 아직 돎)?$/.exec(fl);
      res.failScreen = m ? { hint: m[1], buttons: m[2] ? m[2].split(', ') : [], bar: +m[3], setupBusy: !!m[4] } : { raw: fl };
    }
    if (!old.exitCode && old.exitCode !== 0) killPid(old.pid);
    out.scenes[name] = res;
    return res;
  }
  const want = (name, cond, msg) => { if (!cond) out.errors.push(`${name}: ${msg}`); };
  const has = (r, re) => r.log.some((l) => re.test(l));
  const run = (n) => !only.length || only.includes(n);

  if (run('ok')) {
    const r = await scene('ok', { from: '1.0.1', to: '1.0.2', sleep: 7000 });
    want('ok', r.exit === 0, '종료 코드 ' + r.exit);
    want('ok', r.readyMs != null && r.readyMs < 8000, '창이 뜬 알림이 늦음/없음 ' + r.readyMs);
    want('ok', has(r, /앱 닫힘/) && has(r, /설치 파일 확인/) && has(r, /설치 프로그램 끝 — 종료 코드 0/) && has(r, /새 앱 창이 보임/) && has(r, /^끝 —/), '단계 기록이 끝까지 안 감');
    want('ok', r.setupArgs === '/S --updated', '설치 인자 ' + r.setupArgs);
    want('ok', r.appVersionNow === '1.0.2' && r.running.length === 1, `새 앱 판·한 번만 켜짐(${r.appVersionNow}, ${r.running.length}개)`);
    want('ok', ['step0', 'step1', 'step2', 'install-progress', 'step3', 'done'].every((t) => r.shots.some((f) => f.includes(t))), '캡처 ' + r.shots.join(','));
  }
  if (run('rollback')) {
    const r = await scene('rollback', { from: '1.0.2', to: '1.0.1', rollback: true, sleep: 4000 });
    want('rollback', r.exit === 0 && r.appVersionNow === '1.0.1' && r.running.length === 1, `되돌리기(${r.exit}, ${r.appVersionNow}, ${r.running.length})`);
  }
  if (run('fail-exit')) {
    const r = await scene('fail-exit', { from: '1.0.1', to: '1.0.2', sleep: 3000, exit: 2, click: { after: 'fail-step2', name: '예전 판 그대로 켜기' } });
    want('fail-exit', has(r, /종료 코드 2/) && has(r, /문제 — 단계 2/), '설치 실패를 못 알아챔');
    want('fail-exit', r.clicked && r.clicked.result === 'ok' && has(r, /예전 판 켜기/) && r.exit === 1, '[예전 판 그대로 켜기] → 창 닫힘(1): ' + JSON.stringify(r.clicked) + ' ' + r.exit);
    want('fail-exit', r.appVersionNow === '1.0.1' && r.running.length === 1, '옛 판이 다시 켜짐');
    const f = r.failScreen || {};
    want('fail-exit', /^\[예전 판 그대로 켜기\]로/.test(f.hint || '') && (f.buttons || []).includes('예전 판 그대로 켜기'), '문제 화면 안내·단추 ' + JSON.stringify(f));
    want('fail-exit', f.bar > 0 && f.bar <= 55, '아무것도 안 바꾼 설치인데 막대가 시간만으로 많이 참(' + f.bar + '%)');
  }
  // '모든 사용자' 설치에서 관리자 확인 [아니요] 흉내 — 바깥 설치 파일이 아무것도 안 바꾸고 종료 코드 2(NSIS Quit)
  if (run('admin-no')) {
    const r = await scene('admin-no', { from: '1.0.1', to: '1.0.2', sleep: 2500, exit: 2, extra: ['--per-machine'], killAfterFail: true });
    const f = r.failScreen || {};
    want('admin-no', has(r, /종료 코드 2/) && has(r, /문제 — 단계 2/), '설치 실패를 못 알아챔');
    want('admin-no', /^관리자 확인 창에서 \[아니요\]를 누르셨다면 \[다시 시도\]를 누르고 \[예\]를 눌러 주세요\./.test(f.hint || '') && /예전 판 그대로 켜기/.test(f.hint || ''),
      '종료 코드가 0 이 아니어도 관리자 확인 안내 ' + JSON.stringify(f));
    want('admin-no', JSON.stringify(f.buttons) === JSON.stringify(['닫기', '예전 판 그대로 켜기', '다시 시도']), '단추 ' + JSON.stringify(f.buttons));
  }
  // '모든 사용자' 설치의 관리자 확인 창을 기다리는 동안 — 상태 줄 '관리자 확인 창에서 [예]를 눌러 주세요…'(캡처 admin-wait), 막대는 시간으로 안 참, 닫힌 뒤 끝까지
  if (run('admin-wait')) {
    const r = await scene('admin-wait', { from: '1.0.1', to: '1.0.2', sleep: 4000, extra: ['--per-machine'], adminWaitMs: 8000 });
    const up = r.log.find((l) => /^관리자 확인 창이 뜸/.test(l)), down = r.log.find((l) => /^관리자 확인 창이 닫힘/.test(l));
    const pct = (l) => +((/막대 (\d+)%/.exec(l || '') || [])[1]);
    r.adminBar = { up: pct(up), down: pct(down) };
    want('admin-wait', up && down && r.adminBar.down === r.adminBar.up, '관리자 확인을 기다리는 동안 막대가 시간으로 참: ' + JSON.stringify(r.adminBar));
    want('admin-wait', r.shots.some((f) => /admin-wait-screen\.png$/.test(f)) && has(r, /관리자 확인 창을 봄/), '관리자 확인 캡처·기록');
    want('admin-wait', r.exit === 0 && r.appVersionNow === '1.0.2' && r.running.length === 1, `닫힌 뒤 끝까지(${r.exit}, ${r.appVersionNow}, ${r.running.length})`);
  }
  // 설치 시간 초과(설치 프로그램이 아직 돎) — [예전 판 그대로 켜기]·[다시 시도]를 안 보인다(돌고 있는 설치와 부딪히지 않게)
  if (run('timeout')) {
    const r = await scene('timeout', { from: '1.0.1', to: '1.0.2', sleep: 40000, extra: ['--install-timeout=4'], killAfterFail: true });
    const f = r.failScreen || {};
    want('timeout', has(r, /설치 시간 초과/) && has(r, /문제 — 단계 2/), '시간 초과를 못 알아챔');
    want('timeout', f.setupBusy === true && JSON.stringify(f.buttons) === JSON.stringify(['닫기']), '아직 도는 설치인데 단추 ' + JSON.stringify(f));
  }
  // 설치 프로그램이 옛 exe 를 지운 뒤 실패 — 옛 판이 없으니 [다시 시도]로 다시 설치하라는 안내
  if (run('failafter')) {
    const r = await scene('failafter', { from: '1.0.1', to: '1.0.2', sleep: 2000, exit: 3, failafter: true, killAfterFail: true });
    const f = r.failScreen || {};
    want('failafter', has(r, /종료 코드 3/) && has(r, /문제 — 단계 2/), '실패를 못 알아챔');
    want('failafter', f.hint === '[다시 시도]로 다시 설치해 보세요. 그래도 안 되면 담당자에게 알려 주세요.' && JSON.stringify(f.buttons) === JSON.stringify(['닫기', '다시 시도']),
      '옛 판이 없을 때 안내·단추 ' + JSON.stringify(f));
  }
  if (run('sha')) {
    const r = await scene('sha', { from: '1.0.1', to: '1.0.2', badSha: true, click: { after: 'fail-step1', name: '닫기' } });
    want('sha', has(r, /확인값이 다름/) && r.setupArgs == null && r.exit === 1 && r.appVersionNow === '1.0.1' && !r.running.length, '확인값 다름 → 설치 안 함·닫기');
  }
  if (run('no-window')) {
    const r = await scene('no-window', { from: '1.0.1', to: '1.0.2', sleep: 3000, nowindow: true, extra: ['--launch-timeout=5'], killAfterFail: true });
    want('no-window', has(r, /새 앱 창이 안 보임/) && has(r, /문제 — 단계 3/), '새 앱 창이 안 뜬 것을 못 알아챔');
  }
  if (run('admin')) {
    const r = await scene('admin', { from: '1.0.1', to: '1.0.2', sleep: 6000, extra: ['--per-machine'] });
    want('admin', r.exit === 0 && has(r, /모든 사용자 설치/), '관리자 안내 장면');
  }
  if (run('stuck')) {
    const r = await scene('stuck', { from: '1.0.1', to: '1.0.2', stuckApp: true, extra: ['--close-timeout=4'], killAfterFail: true });
    want('stuck', has(r, /문제 — 단계 0/) && r.setupArgs == null, '앱이 안 닫히면 설치하지 않고 멈춤');
  }
  out.ok = !out.errors.length;
  return out;
}

if (require.main === module) {
  main().then((o) => { console.log(JSON.stringify(o, null, 2)); process.exit(o.ok ? 0 : 1); }, (e) => { console.log(JSON.stringify({ ok: false, errors: [String(e && e.stack || e)] })); process.exit(2); });
}
