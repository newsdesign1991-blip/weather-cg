// 업데이트 진행 창(10-13) — 앱 쪽(desktop/updater.js: 인자 만들기·창 프로그램 찾기·띄우기·없거나 실패하면 조용한 설치) 단위 시험과
// 창 프로그램(desktop/update-ui/UpdateApp.cs·UpdateWindow.xaml)·빌드(tools/build-update-ui.cjs·build-installer.cjs)·배선(main.js·js/app-update.js) 글자 검사,
// 이 PC 에 .NET Framework 4 컴파일러가 있으면 실제로 굽고 창 없이 스스로 점검(--check)까지. 화면 흐름은 desktop/test/update-ui-check.cjs(가짜 앱·설치 파일 — 손으로).
// MODULES.md 10장 '앱 업데이트 — 진행 창'.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { EventEmitter } = require('events');
const U = require('../updater.js');
const BU = require('../../tools/build-update-ui.cjs');

const root = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n');
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const tmpDir = (tag) => fs.mkdtempSync(path.join(os.tmpdir(), `wcg-updui-${tag}-`));
const argOf = (args, k) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : null; };

// 가짜 진행 창 — mode: 'ready'(--ready 파일을 씀) | 'exit'(곧바로 끝남) | 'hang'(아무것도 안 함, kill 하면 끝남) | 'stuck'(kill 해도 안 끝남) | 'throw'(spawn 이 던짐) | 'error'
function uiSpawn(log, mode = 'ready', o = {}) {
  return (file, args, opts) => {
    log.push({ file, args, opts });
    if (mode === 'throw') throw Object.assign(new Error('blocked'), { code: 'EPERM' });
    const c = new EventEmitter();
    c.pid = 5151; c.unref = () => { log.unrefed = true; };
    c.kill = () => { log.killed = true; if (mode !== 'stuck') setImmediate(() => c.emit('exit', 1)); return true; };
    setImmediate(() => {
      if (mode === 'error') { c.emit('error', Object.assign(new Error('nope'), { code: 'ENOENT' })); return; }
      c.emit('spawn');
      if (mode === 'ready') setTimeout(() => fs.writeFileSync(argOf(args, 'ready'), '5151'), o.readyAfter || 30);
      if (mode === 'exit') setTimeout(() => c.emit('exit', 2), 20);
    });
    return c;
  };
}
const fakeUiExe = (dir) => { const f = path.join(dir, 'helper', U.UI_EXE); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, Buffer.alloc(4096, 9)); return f; };

test('진행 창 인자 — 창 프로그램(Opts)과 같은 이름, 되돌리기·시험 캡처는 있을 때만', () => {
  const base = { pid: 77, app: 'C:\\P\\날씨 CG.exe', product: '날씨 CG', from: '1.0.1', to: '1.0.2', setup: 'C:\\T\\wcg-update\\WeatherCG-Setup-1.0.2.exe',
    sha256: 'a'.repeat(64), size: 1234, ready: 'C:\\T\\r.ready', log: 'C:\\T\\update-ui.log', fontsDir: 'C:\\T\\ui-fonts' };
  assert.deepEqual(U.uiArgs(base), ['--pid=77', '--app=C:\\P\\날씨 CG.exe', '--product=날씨 CG', '--from=1.0.1', '--to=1.0.2',
    '--setup=C:\\T\\wcg-update\\WeatherCG-Setup-1.0.2.exe', `--sha256=${'a'.repeat(64)}`, '--size=1234', '--ready=C:\\T\\r.ready', '--log=C:\\T\\update-ui.log', '--fonts-dir=C:\\T\\ui-fonts']);
  const rb = U.uiArgs({ ...base, from: '1.0.2', to: '1.0.1', rollback: true, shots: 'C:\\S' });
  assert.equal(rb[5], '--rollback');
  assert.equal(rb[rb.length - 1], '--shots=C:\\S');
  // 창 프로그램이 읽는 이름과 같은지(글자)
  const cs = read('desktop/update-ui/UpdateApp.cs');
  for (const a of U.uiArgs({ ...base, rollback: true, shots: 'x' })) {
    const k = a.replace(/^--/, '').replace(/=.*$/, '');
    assert.match(cs, new RegExp(`"${k}"`), '창이 모르는 인자: ' + k);
  }
});

test('진행 창 찾기 — 처음으로 있는 보통 파일, 없음·폴더·빈 파일·바로 가기는 아님', () => {
  const d = tmpDir('find');
  try {
    const exe = fakeUiExe(d);
    fs.mkdirSync(path.join(d, 'dir.exe'));
    fs.writeFileSync(path.join(d, 'empty.exe'), '');
    assert.equal(U.findUiExe([path.join(d, 'no.exe'), path.join(d, 'dir.exe'), path.join(d, 'empty.exe'), exe]), exe);
    assert.equal(U.findUiExe(exe), exe, '하나만 줘도');
    assert.equal(U.findUiExe([path.join(d, 'no.exe')]), null);
    assert.equal(U.findUiExe([]), null);
    assert.equal(U.findUiExe([exe], { lstatSync: () => ({ isFile: () => true, isSymbolicLink: () => true, size: 9 }) }), null, '바로 가기(심볼릭 링크)는 안 씀');
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});

test('진행 창 띄우기 — 임시 폴더로 복사해 떨어뜨려 실행(작업 폴더도 임시), 떴다는 파일을 보면 ok', async () => {
  const d = tmpDir('start');
  try {
    const exe = fakeUiExe(d), tr = path.join(d, 'temp');
    const log = [];
    const r = await U.startUi({ exe, tempRoot: tr, spawn: uiSpawn(log), args: { pid: 9, app: 'A.exe', product: '날씨 CG', from: '1.0.1', to: '1.0.2', setup: 'S.exe', sha256: 'b'.repeat(64), size: 5 } });
    assert.equal(r.ok, true); assert.equal(r.pid, 5151);
    const tdir = path.join(tr, U.TEMP_SUB);
    assert.equal(log[0].file, path.join(tdir, U.UI_EXE), '설치 폴더 밖(임시 폴더) 사본을 실행');
    assert.deepEqual(fs.readFileSync(log[0].file), fs.readFileSync(exe));
    assert.equal(log[0].opts.detached, true); assert.equal(log[0].opts.stdio, 'ignore'); assert.equal(log[0].opts.cwd, tdir);
    assert.equal(path.dirname(argOf(log[0].args, 'ready')), tdir);
    assert.equal(argOf(log[0].args, 'log'), path.join(tdir, U.UI_LOG));
    assert.equal(argOf(log[0].args, 'fonts-dir'), path.join(tdir, U.UI_FONTS));
    assert.equal(log.unrefed, true);
    assert.ok(!fs.existsSync(argOf(log[0].args, 'ready')), '알림 파일은 지운다');
    // 앞 창이 아직 떠 있어 사본 자리가 잠김(여기선 같은 이름 폴더로 흉내) → 다른 이름으로
    fs.rmSync(path.join(tdir, U.UI_EXE), { force: true }); fs.mkdirSync(path.join(tdir, U.UI_EXE));
    const log2 = [];
    const r2 = await U.startUi({ exe, tempRoot: tr, spawn: uiSpawn(log2), args: {} });
    assert.equal(r2.ok, true);
    assert.match(path.basename(log2[0].file), /^WeatherCG-Update-\d+-\d+\.exe$/);
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});

test('진행 창 띄우기 실패 — 실행이 던짐·오류·곧바로 끝남·시간 안에 안 뜸(그 창을 PID 로 끔)·끄지도 못함', async () => {
  const d = tmpDir('startfail');
  try {
    const exe = fakeUiExe(d), tr = path.join(d, 'temp');
    const go = async (mode) => { const log = []; const r = await U.startUi({ exe, tempRoot: tr, spawn: uiSpawn(log, mode), readyMs: 300, sleep: (ms) => new Promise((x) => setTimeout(x, Math.min(ms, 20))), args: {} }); return { r, log }; };
    assert.deepEqual((await go('throw')).r, { ok: false, err: 'spawn', code: 'EPERM' });
    assert.deepEqual((await go('error')).r, { ok: false, err: 'spawn', code: 'ENOENT' });
    assert.deepEqual((await go('exit')).r, { ok: false, err: 'ui-exit', code: 2 });
    const h = await go('hang');
    assert.deepEqual(h.r, { ok: false, err: 'ui-timeout' }); assert.equal(h.log.killed, true, '안 뜬 창은 끈다(뒤늦게 혼자 설치하지 않게)');
    const s = await go('stuck');
    assert.deepEqual(s.r, { ok: false, err: 'ui-stuck' });
    assert.deepEqual(await U.startUi({ exe: path.join(d, 'no.exe'), tempRoot: tr, spawn: uiSpawn([]), args: {} }).then((x) => x.err), 'copy');
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});

// 업데이트 폴더 하나(설치 파일 + latest.json — 판 두 개: 지금 1.0.1 → 새 1.0.2, 되돌릴 1.0.0)
function share() {
  const dir = tmpDir('share');
  const ents = ['1.0.0', '1.0.1', '1.0.2'].map((version, i) => {
    const body = crypto.randomBytes(150000 + i);
    const file = U.setupName(version, '');
    fs.writeFileSync(path.join(dir, file), body);
    return { version, file, sha256: sha(body), size: body.length, date: '2026-10-13T00:00:00.000Z', notes: [version] };
  });
  fs.writeFileSync(path.join(dir, 'latest.json'), JSON.stringify({ ...ents[2], history: ents.slice().reverse() }));
  return { dir, ents };
}
function fakeTimers() {
  const list = [];
  return { list, setTimer: (fn, ms) => { const t = { fn, ms }; list.push(t); return t; }, clearTimer() {} };
}
const installSpawn = (log) => (file, args, opts) => {
  log.push({ file, args, opts });
  const c = new EventEmitter(); c.pid = 4242; c.unref = () => {};
  setImmediate(() => c.emit('spawn'));
  return c;
};

test('설치 — 진행 창이 뜨면 그 창이 맡는다(조용한 설치는 안 돌림, 닫기 전 묻기 풀고 0.6초 뒤 앱 끄기), 되돌리기도 같은 길', async () => {
  const s = share(), d = tmpDir('inst');
  try {
    const exe = fakeUiExe(d);
    const mk = (extra = {}) => {
      const ui = [], inst = [], quits = [], rel = [], phases = [], tm = fakeTimers();
      const up = U.createUpdater({ current: '1.0.1', packaged: true, env: {}, dirs: [s.dir], tempRoot: path.join(d, 'temp'), notify() {}, quitForInstall: () => quits.push(1),
        releaseClose: () => rel.push(1), uiExe: [path.join(d, 'none.exe'), exe], appExe: 'C:\\Apps\\날씨 CG\\날씨 CG.exe', pid: 321, product: '날씨 CG',
        uiSpawn: uiSpawn(ui), spawn: installSpawn(inst), ...tm, ...extra });
      return { up, ui, inst, quits, rel, phases, tm };
    };
    const a = mk();
    const r = await a.up.install('1.0.2', null, { onPhase: (p) => a.phases.push(p) });
    assert.deepEqual(r, { ok: true, version: '1.0.2', ui: true });
    assert.deepEqual(a.phases, ['handoff']);
    assert.equal(a.inst.length, 0, '조용한 설치는 안 돌림 — 설치는 진행 창이');
    assert.equal(a.ui.length, 1);
    const args = a.ui[0].args;
    assert.equal(argOf(args, 'pid'), '321'); assert.equal(argOf(args, 'app'), 'C:\\Apps\\날씨 CG\\날씨 CG.exe'); assert.equal(argOf(args, 'product'), '날씨 CG');
    assert.equal(argOf(args, 'from'), '1.0.1'); assert.equal(argOf(args, 'to'), '1.0.2'); assert.ok(!args.includes('--rollback'));
    assert.equal(argOf(args, 'setup'), path.join(d, 'temp', U.TEMP_SUB, 'WeatherCG-Setup-1.0.2.exe'), '임시 폴더의 확인한 사본');
    assert.equal(argOf(args, 'sha256'), s.ents[2].sha256); assert.equal(argOf(args, 'size'), String(s.ents[2].size));
    assert.equal(argOf(args, 'shots'), null, '시험 캡처는 WCG_UPDATE_UI_SHOTS 일 때만');
    assert.equal(a.rel.length, 1, '넘긴 순간 닫기 전 묻기를 푼다');
    const q = a.tm.list.find((t) => t.ms === U.UI_QUIT_MS);
    assert.ok(q, '0.6초 뒤 앱 끄기'); q.fn(); assert.equal(a.quits.length, 1);
    assert.deepEqual(await a.up.install('1.0.2'), { ok: false, err: 'busy' });
    // 되돌리기 + 시험 캡처
    const b = mk({ current: '1.0.2', env: { WCG_UPDATE_UI_SHOTS: 'C:\\shots' } });
    assert.deepEqual(await b.up.install('1.0.0', null, { rollback: true }), { ok: true, version: '1.0.0', ui: true, rollback: true });
    assert.ok(b.ui[0].args.includes('--rollback'));
    assert.equal(argOf(b.ui[0].args, 'from'), '1.0.2'); assert.equal(argOf(b.ui[0].args, 'to'), '1.0.0'); assert.equal(argOf(b.ui[0].args, 'shots'), 'C:\\shots');
    // 시험(DRYRUN)은 진행 창도 안 띄움
    const c = mk({ env: { WCG_UPDATE_DRYRUN: '1' } });
    assert.deepEqual(await c.up.install('1.0.2'), { ok: true, dry: true, version: '1.0.2' });
    assert.equal(c.ui.length + c.inst.length, 0);
  } finally { fs.rmSync(s.dir, { recursive: true, force: true }); fs.rmSync(d, { recursive: true, force: true }); }
});

test('취소 — 받는 동안은 멈추고, 진행 창에 넘기기 시작한 뒤(handoff)에는 취소가 안 된다(웹앱이 [취소]를 감추는 때와 같음)', async () => {
  const s = share(), d = tmpDir('cancel');
  try {
    const exe = fakeUiExe(d);
    const mk = () => {
      const ui = [], inst = [], tm = fakeTimers();
      const up = U.createUpdater({ current: '1.0.1', packaged: true, env: {}, dirs: [s.dir], tempRoot: path.join(d, 'temp'), notify() {}, quitForInstall() {},
        uiExe: [exe], uiSpawn: uiSpawn(ui), spawn: installSpawn(inst), ...tm });
      return { up, ui, inst };
    };
    // 받는 중 취소 → cancelled, 진행 창·설치 없음
    const a = mk();
    let asked = false;
    const ra = await a.up.install('1.0.2', (got) => { if (!asked && got > 0) { asked = true; assert.equal(a.up.cancel(), true); } });
    assert.deepEqual(ra, { ok: false, err: 'cancelled' });
    assert.equal(a.ui.length + a.inst.length, 0);
    // 넘기는 중 취소 → false(아무 일 없음), 업데이트는 진행 창이 이어 맡음
    const b = mk();
    let late = null;
    const rb = await b.up.install('1.0.2', null, { onPhase: () => { late = b.up.cancel(); } });
    assert.equal(late, false, '넘기는 중에는 취소할 수 없음');
    assert.deepEqual(rb, { ok: true, version: '1.0.2', ui: true });
    // 받기가 끝나는 바로 그때 누른 취소(받은 뒤·넘기기 전)도 멈춘다 — 글자
    assert.match(read('desktop/updater.js'), /if \(ctl\.signal\.aborted\) \{ log\('설치 파일은 받았지만 넘기기 전에 취소됨'\); return \{ ok: false, err: 'cancelled' \}; \}/);
  } finally { fs.rmSync(s.dir, { recursive: true, force: true }); fs.rmSync(d, { recursive: true, force: true }); }
});

test('설치 — 진행 창이 없거나 못 띄우면 예전처럼 조용한 설치(/S --updated --force-run, 1.5초 뒤 앱 끄기), 못 끈 창이면 설치하지 않음', async () => {
  const s = share(), d = tmpDir('fallback');
  try {
    const exe = fakeUiExe(d);
    const mk = (uiMode, uiExe = [exe]) => {
      const ui = [], inst = [], quits = [], rel = [], tm = fakeTimers();
      const up = U.createUpdater({ current: '1.0.1', packaged: true, env: {}, dirs: [s.dir], tempRoot: path.join(d, 'temp'), notify() {}, quitForInstall: () => quits.push(1),
        releaseClose: () => rel.push(1), uiExe, uiSpawn: uiSpawn(ui, uiMode), uiReadyMs: 200, uiSleep: (ms) => new Promise((x) => setTimeout(x, Math.min(ms, 20))),
        spawn: installSpawn(inst), ...tm });
      return { up, ui, inst, quits, rel, tm };
    };
    for (const [mode, uiExe] of [['ready', [path.join(d, 'none.exe')]], ['exit', [exe]], ['throw', [exe]], ['hang', [exe]]]) {
      const m = mk(mode, uiExe);
      assert.deepEqual(await m.up.install('1.0.2'), { ok: true, version: '1.0.2', ui: false }, mode);
      assert.equal(m.inst.length, 1, mode + ' → 조용한 설치');
      assert.deepEqual(m.inst[0].args, U.INSTALL_ARGS);
      assert.equal(m.inst[0].opts.cwd, path.join(d, 'temp', U.TEMP_SUB), '작업 폴더 = 임시 폴더(설치 폴더를 잡지 않게)');
      assert.equal(m.rel.length, 1);
      assert.ok(m.tm.list.find((t) => t.ms === U.FALLBACK_QUIT_MS), mode + ' → 1.5초 뒤 앱 끄기');
    }
    const st = mk('stuck');
    assert.deepEqual(await st.up.install('1.0.2'), { ok: false, err: 'ui-stuck' });
    assert.equal(st.inst.length, 0, '못 끈 창이 뒤늦게 설치할 수 있어 두 번 돌리지 않는다');
    assert.equal(st.quits.length + st.tm.list.length, 0, '앱도 안 끈다');
    // uiExe 를 안 주면(옛 배선) 그대로 조용한 설치
    const none = mk('ready', null);
    assert.equal((await none.up.install('1.0.2')).ui, false);
  } finally { fs.rmSync(s.dir, { recursive: true, force: true }); fs.rmSync(d, { recursive: true, force: true }); }
});

test('임시 폴더 정리 — 진행 창 사본·알림 파일·글꼴도(기록 update-ui.log·다른 파일은 남김)', () => {
  const d = tmpDir('clean');
  try {
    const keep = ['update-ui.log', 'other.exe', 'WeatherCG-Update-x.exe', 'ui-a.ready', 'notes.txt'];
    const gone = ['WeatherCG-Update.exe', 'WeatherCG-Update-123-456789.exe', 'ui-12-345.ready', 'ui-12-345.ready.tmp', 'WeatherCG-Setup-1.0.2.exe', 'WeatherCG-Setup-1.0.2.exe.partial'];
    for (const f of [...keep, ...gone]) fs.writeFileSync(path.join(d, f), 'x');
    fs.mkdirSync(path.join(d, U.UI_FONTS)); fs.writeFileSync(path.join(d, U.UI_FONTS, 'a.ttf'), 'x');
    assert.equal(U.cleanTemp(d), gone.length + 1);
    assert.deepEqual(fs.readdirSync(d).sort(), keep.slice().sort());
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});

test('창 프로그램 글자 — 단계·설치 인자(/S --updated, --force-run 없음)·도는 중 못 닫음·앱 환경 변수 안 넘김·관리자 안내·실패 단추·글꼴', () => {
  const cs = read('desktop/update-ui/UpdateApp.cs'), xaml = read('desktop/update-ui/UpdateWindow.xaml');
  for (const s of ['" 닫기"', '" 확인"', '" 설치"', '"마무리 · "', '"새 버전"', '"이전 버전"']) assert.ok(cs.includes(s), s);
  assert.match(cs, /new ProcessStartInfo\(_o\.Setup, "\/S --updated"\)/);
  assert.doesNotMatch(cs.replace(/\/\/.*$/gm, ''), /--force-run/, '새 판은 창이 켠다(설치 프로그램이 또 켜지 않게)');
  assert.match(cs, /if \(_running\) \{ e\.Cancel = true; return; \}/, '도는 중에는 닫기 막음');
  assert.match(cs, /k\.StartsWith\("WCG_", StringComparison\.OrdinalIgnoreCase\) \|\| k\.StartsWith\("ELECTRON_", StringComparison\.OrdinalIgnoreCase\)/);
  assert.match(cs, /관리자 확인 창이 뜨면 \[예\]를 눌러 주세요\./);
  assert.match(cs, /FileShare\.Read/, '확인한 설치 파일을 설치 끝까지 바꾸지 못하게 열어 둠');
  assert.match(cs, /Win\.ContentRendered \+= OnShown;/, '첫 그림이 그려진 뒤 앱에 알림');
  assert.match(cs, /"예전 판 그대로 켜기"/);
  assert.match(cs, /public const string FontName = "Wanted Sans NP";/);
  // 10-13 검증 뒤 고침 — 관리자 확인 창이 앞으로(설치 파일을 띄우기 전에), 시간 몫은 절반까지·관리자 확인 기다림은 안 셈,
  // 종료 코드가 0 이 아닐 때도 '모든 사용자'면 관리자 안내, 설치 프로그램이 아직 돌면 [예전 판 그대로 켜기] 안 보임, 옛 판이 없으면 다시 설치 안내
  const inst = cs.slice(cs.indexOf('async Task StepInstall()'), cs.indexOf('bool SetupRunning()'));
  assert.ok(inst.indexOf('Native.AllowSetForegroundWindow(Native.ASFW_ANY);') > 0 && inst.indexOf('Native.AllowSetForegroundWindow(Native.ASFW_ANY);') < inst.indexOf('p = Process.Start(psi);'), '설치 파일을 띄우기 전에 앞으로 올 권한');
  assert.match(cs, /const double TimeShare = 0\.5;/);
  assert.match(inst, /\* TimeShare, act \* 0\.96\)/);
  assert.match(inst, /bool admin = _perMachine && await Task\.Run\(\(\) => ConsentUp\(\)\);/);
  assert.match(inst, /bool adminUp = admin && work\.IsRunning, adminDown = !admin && !work\.IsRunning;\n\s*if \(adminUp\) work\.Stop\(\);\n\s*if \(adminDown\) work\.Start\(\);/, '관리자 확인을 기다리는 시간은 막대에 안 셈');
  assert.match(inst, /double t = work\.Elapsed\.TotalSeconds;/);
  assert.match(inst, /"관리자 확인 창에서 \[예\]를 눌러 주세요…"/);
  assert.match(inst, /throw new StepFail\(2, "설치 프로그램이 오류로 끝났어요\(종료 코드 " \+ code \+ "\)\.", true, 1, InstallHint\(\), null\);/);
  assert.match(cs, /return "관리자 확인 창에서 \[아니요\]를 누르셨다면 \[다시 시도\]를 누르고 \[예\]를 눌러 주세요\. "/);
  assert.match(cs, /bool setupBusy = f\.Step == 2 && SetupRunning\(\);\n\s*_oldBtn\.Visibility = !setupBusy && OldIntact\(\)/);
  assert.match(cs, /"\[다시 시도\]로 다시 설치해 보세요\. 그래도 안 되면 담당자에게 알려 주세요\."/);
  assert.match(cs, /_perMachine = o\.ForcePerMachine \|\| PerMachineInstall\(o\.InstallDir\);/, "'모든 사용자'는 등록(HKLM/HKCU)으로, 못 읽으면 Program Files");
  for (const n of ['Steps', 'Bar', 'Track', 'Percent', 'Status', 'ErrorPanel', 'ErrorText', 'RetryBtn', 'OldBtn', 'CloseBtn', 'CloseX', 'Head', 'TitleText', 'VersionText', 'Card', 'Note']) {
    assert.match(xaml, new RegExp(`x:Name="${n}"`), n);
    assert.match(cs, new RegExp(`FindName\\("${n}"\\)`), n);
  }
  assert.doesNotMatch(xaml.replace(/<!--[\s\S]*?-->/g, ''), /x:Class|Click="|MouseLeftButtonDown="/, 'XamlReader 로 읽으므로 이벤트·클래스 없음');
  assert.match(xaml, /Topmost="True"/);
  assert.match(xaml, /#3182F6/, '날씨 CG 파랑 강조');
  assert.match(read('desktop/update-ui/app.manifest'), /level="asInvoker"/);
  for (const f of BU.FONT_FILES) assert.ok(fs.statSync(path.join(root, 'desktop', 'update-ui', 'fonts', f)).size > 1000000, f);
  assert.ok(fs.existsSync(path.join(root, 'desktop', 'update-ui', 'fonts', 'WantedSans-LICENSE.txt')), 'OFL 사용권 글');
  // UI 글자에 이모지 없음
  assert.doesNotMatch(cs + xaml, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
});

test('빌드 — csc 인자(WPF 참조·XAML·글꼴 3 넣기·매니페스트·아이콘), 설치판 필수·담기, 배선(main.js·웹앱)', () => {
  const a = BU.cscArgs({ dir: 'C:\\W\\Framework64\\v4.0.30319', src: 'D:\\r\\desktop\\update-ui', out: 'D:\\o\\x.exe', icon: 'D:\\r\\icon.ico' });
  assert.ok(a.includes('/target:winexe') && a.includes('/out:D:\\o\\x.exe') && a.includes('/win32icon:D:\\r\\icon.ico'));
  assert.ok(a.includes('/win32manifest:' + path.join('D:\\r\\desktop\\update-ui', 'app.manifest')));
  assert.ok(a.includes('/reference:' + path.join('C:\\W\\Framework64\\v4.0.30319', 'WPF', 'PresentationFramework.dll')));
  assert.ok(a.includes('/reference:' + path.join('C:\\W\\Framework64\\v4.0.30319', 'System.Xaml.dll')));
  assert.ok(a.includes(`/resource:${path.join('D:\\r\\desktop\\update-ui', 'UpdateWindow.xaml')},WeatherCGUpdate.UpdateWindow.xaml`));
  assert.equal(a.filter((x) => /,WeatherCGUpdate\.fonts\.WantedSansNP-.+\.ttf$/.test(x)).length, 3);
  assert.equal(BU.UI_EXE, U.UI_EXE);
  const B = require('../../tools/build-installer.cjs');
  assert.ok(B.REQUIRED.includes('desktop/helper/WeatherCG-Update.exe'));
  for (const p of ['desktop/update-ui/UpdateApp.cs', 'desktop/update-ui/UpdateWindow.xaml', 'desktop/update-ui/fonts/WantedSansNP-Bold.ttf', 'desktop/update-ui/app.manifest']) assert.equal(B.appFileFilter(p), false, '원본은 앱에 안 담음: ' + p);
  const bld = read('tools/build-installer.cjs');
  assert.match(bld, /buildUpdateUi\(\{ src: path\.join\(srcDir, 'desktop', 'update-ui'\), out: path\.join\(appDir, 'desktop', 'helper', UI_EXE\)/, '커밋에서 꺼낸 원본으로 굽는다');
  const main = read('desktop/main.js');
  assert.match(main, /const UPDATE_UI_EXE = path\.join\(DESK_REAL, 'helper', 'WeatherCG-Update\.exe'\);/, 'asar 밖 자리');
  assert.match(main, /uiExe: \[UPDATE_UI_EXE\], appExe: process\.execPath, pid: process\.pid, product: app\.getName\(\),/);
  assert.match(main, /releaseClose: \(\) => \{ try \{ if \(closeGuard\) closeGuard\.release\(\); \}/);
  const web = read('js/app-update.js');
  assert.match(web, /if \(p\.phase === 'handoff'\) \{\n\s*handoff = true;\n\s*bar\.style\.width = '100%'; txt\.textContent = '업데이트 진행 창을 여는 중…';\n\s*m\.foot\.innerHTML = '';/, '넘기는 중엔 [취소]를 감춤');
  assert.match(web, /canClose: \(\) => finished \|\| !handoff,/, '넘기는 중엔 X·Esc·바깥 누르기로 안 닫힘');
  assert.match(web, /txt\.textContent = r\.ui \? '진행 창에서 설치 단계를 보여 드려요\. 앱은 곧 닫혀요\.'/);
  assert.match(web, /'곧 앱이 닫히고 새 판이 켜져요\.'/, '진행 창이 없을 때 한 줄');
  assert.match(web, /case 'ui-stuck':/);
});

test('실제로 굽기 — .NET Framework 4 csc 로 컴파일, 창 없이 스스로 점검(XAML·Wanted Sans NP 글꼴 3)', { skip: (process.platform !== 'win32' || !BU.findCsc()) && 'csc 없음' }, () => {
  const d = tmpDir('build');
  try {
    const r = BU.buildUpdateUi({ out: path.join(d, U.UI_EXE), strict: true });
    assert.equal(r.ok, true, r.log);
    assert.ok(r.bytes > 8000000 && r.bytes < 20000000, '글꼴 셋을 담은 크기 ' + r.bytes);
    assert.deepEqual({ ok: r.check.ok, xaml: r.check.xaml, fonts: r.check.fonts, family: r.check.family }, { ok: true, xaml: true, fonts: 3, family: 'Wanted Sans NP' });
    assert.equal(fs.readdirSync(d).join(','), U.UI_EXE, '만들다 남은 파일 없음');
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});
