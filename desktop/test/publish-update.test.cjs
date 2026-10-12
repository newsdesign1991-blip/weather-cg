// 앱 업데이트 올리기(tools/publish-update.cjs) 시험 — 임시 폴더만(실제 R:\[F]_Util\WNS\Ver 에는 쓰지 않는다).
// 복사·latest.json(앱 검사 통과)·바뀐 점(인자·파일)·낮거나 같은 판 거절(--force)·빌드 정보와 다르면 거절·이름 꼴·갈래 섞기 거절·
// 설치 파일 정리(이번 판 + 낮은 판 최근 4개 = 기본 5, 판을 내리면 더 새 판은 거둬들임)·업데이트 내역(history — 쌓기·1차 latest.json 이어받기·크기 한도)·
// --dry-run·폴더 없으면 만들지 않음, 끝으로 올린 것을 앱 쪽(desktop/updater.js)이 그대로 받아 실행 직전까지 가는지(새 판·이전 판으로 되돌리기).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { EventEmitter } = require('events');
const U = require('../updater.js');

const TOOL = path.resolve(__dirname, '..', '..', 'tools', 'publish-update.cjs');
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const tmp = (tag) => fs.mkdtempSync(path.join(os.tmpdir(), `wcg-pub-${tag}-`));
// 구운 설치 파일 흉내(+ 빌드 정보)
function fakeSetup(dir, version, o = {}) {
  const body = o.body || crypto.randomBytes(o.bytes || 200000);
  const file = path.join(dir, o.name || U.setupName(version, o.variant || ''));
  fs.writeFileSync(file, body);
  if (o.build !== false) fs.writeFileSync(file.replace(/\.exe$/, '.build.json'), JSON.stringify({ version, commit: 'abc1234', setupBytes: body.length, setupSha256: o.buildSha || sha(body) }));
  return { file, body };
}
const pub = (...a) => {
  const r = spawnSync(process.execPath, [TOOL, ...a], { encoding: 'utf8', timeout: 60000 });
  return { code: r.status, out: r.stdout, err: r.stderr, json: (() => { try { return JSON.parse(r.stdout.slice(r.stdout.indexOf('\n{') + 1)); } catch (e) { return null; } })() };
};
const latestOf = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'latest.json'), 'utf8'));

test('올리기 — 설치 파일 복사(이름 그대로·sha 같음), latest.json = 앱 검사 통과, 바뀐 점(--note 여러 번 + 파일), 임시 파일 안 남김', () => {
  const src = tmp('src'), share = tmp('share');
  try {
    const s = fakeSetup(src, '1.0.1');
    const nf = path.join(src, 'notes.txt');
    fs.writeFileSync(nf, '\uFEFF# 주석은 뺌\n- 기상청 받기 빨라짐\n\n· 업데이트 알림이 떠요\n');
    const r = pub(`--setup=${s.file}`, `--dir=${share}`, '--note=특보 불러오기 20초 멈춤 해결', '--note=설정 메뉴에 업데이트 확인', `--notes-file=${nf}`);
    assert.equal(r.code, 0, r.err + r.out);
    const j = latestOf(share);
    assert.equal(j.version, '1.0.1'); assert.equal(j.file, 'WeatherCG-Setup-1.0.1.exe');
    assert.equal(j.sha256, sha(s.body)); assert.equal(j.size, s.body.length);
    assert.equal(j.commit, 'abc1234');
    assert.ok(!Number.isNaN(Date.parse(j.date)));
    assert.deepEqual(j.notes, ['특보 불러오기 20초 멈춤 해결', '설정 메뉴에 업데이트 확인', '기상청 받기 빨라짐', '업데이트 알림이 떠요']);
    assert.equal(U.validateLatest(j, '').ok, true);
    assert.equal(sha(fs.readFileSync(path.join(share, j.file))), sha(s.body));
    assert.deepEqual(fs.readdirSync(share).sort(), ['WeatherCG-Setup-1.0.1.exe', 'latest.json'], '임시 이름(.…uploading·.latest.json.tmp) 안 남김');
  } finally { fs.rmSync(src, { recursive: true, force: true }); fs.rmSync(share, { recursive: true, force: true }); }
});

test('거절 — 이미 올라간 판보다 낮거나 같으면(--force 로만), 빌드 정보와 다름, 이름 꼴, 갈래 섞기, 폴더 없음(만들지 않음)', () => {
  const src = tmp('src2'), share = tmp('share2');
  try {
    assert.equal(pub(`--setup=${fakeSetup(src, '1.0.2').file}`, `--dir=${share}`, '--note=a').code, 0);
    const same = pub(`--setup=${fakeSetup(src, '1.0.2', { bytes: 1000 }).file}`, `--dir=${share}`);
    assert.equal(same.code, 1); assert.match(same.err, /새 판이 아닙니다/);
    const low = pub(`--setup=${fakeSetup(src, '1.0.1').file}`, `--dir=${share}`);
    assert.equal(low.code, 1); assert.match(low.err, /새 판이 아닙니다\(1\.0\.1\)/);
    assert.equal(latestOf(share).version, '1.0.2', '거절하면 latest.json 그대로');
    const forced = pub(`--setup=${path.join(src, 'WeatherCG-Setup-1.0.1.exe')}`, `--dir=${share}`, '--force');
    assert.equal(forced.code, 0, forced.err);
    assert.equal(latestOf(share).version, '1.0.1', '--force 로 되돌리기');
    const mism = pub(`--setup=${fakeSetup(src, '1.0.3', { buildSha: 'f'.repeat(64) }).file}`, `--dir=${share}`);
    assert.equal(mism.code, 1); assert.match(mism.err, /빌드 정보/);
    const odd = path.join(src, 'setup.exe'); fs.writeFileSync(odd, 'x');
    assert.match(pub(`--setup=${odd}`, `--dir=${share}`).err, /이름이 'WeatherCG-Setup-<판>\.exe' 꼴이 아닙니다/);
    const it = pub(`--setup=${fakeSetup(src, '2.0.0', { variant: 'installtest' }).file}`, `--dir=${share}`);
    assert.equal(it.code, 1); assert.match(it.err, /섞지 않습니다/);
    const nodir = path.join(share, 'no-such');
    const nd = pub(`--setup=${path.join(src, 'WeatherCG-Setup-1.0.2.exe')}`, `--dir=${nodir}`);
    assert.equal(nd.code, 1); assert.ok(!fs.existsSync(nodir), '폴더를 만들지 않는다');
  } finally { fs.rmSync(src, { recursive: true, force: true }); fs.rmSync(share, { recursive: true, force: true }); }
});

test('설치 파일 정리·내역 — 이번 판 + 낮은 판 최근 4개(기본 5), 내역은 판마다 쌓고(파일이 지워져도), 판을 내리면(--force) 더 새 판은 파일·내역 모두 거둬들임, 다른 파일은 그대로, --dry-run 은 아무것도 안 씀', () => {
  const src = tmp('src3'), share = tmp('share3');
  const files = () => fs.readdirSync(share).filter((n) => /^WeatherCG-Setup-\d/.test(n) && !/installtest/.test(n)).sort();
  try {
    fs.writeFileSync(path.join(share, 'readme.txt'), 'x');
    fs.writeFileSync(path.join(share, 'WeatherCG-Setup-0.1.0-installtest.exe'), 'other variant');
    const made = {};
    for (const v of ['1.0.1', '1.0.2', '1.0.3', '1.0.4', '1.0.5', '1.0.10']) {
      made[v] = fakeSetup(src, v);
      const r = pub('--setup=' + made[v].file, '--dir=' + share, '--note=' + v + ' 바뀐 점');
      assert.equal(r.code, 0, r.err);
    }
    assert.deepEqual(files(), ['WeatherCG-Setup-1.0.10.exe', 'WeatherCG-Setup-1.0.2.exe', 'WeatherCG-Setup-1.0.3.exe', 'WeatherCG-Setup-1.0.4.exe', 'WeatherCG-Setup-1.0.5.exe'], '1.0.10 + 낮은 판 4개(1.0.1 정리)');
    const j = latestOf(share);
    assert.deepEqual(j.history.map((h) => h.version), ['1.0.10', '1.0.5', '1.0.4', '1.0.3', '1.0.2', '1.0.1'], '내역은 파일이 지워진 판도 남김');
    assert.deepEqual(j.history[0], { version: '1.0.10', file: 'WeatherCG-Setup-1.0.10.exe', sha256: sha(made['1.0.10'].body), size: made['1.0.10'].body.length, date: j.date, notes: ['1.0.10 바뀐 점'], commit: 'abc1234' });
    assert.deepEqual(j.history[5].notes, ['1.0.1 바뀐 점']);
    assert.ok(fs.existsSync(path.join(share, 'readme.txt')) && fs.existsSync(path.join(share, 'WeatherCG-Setup-0.1.0-installtest.exe')), '다른 파일·다른 갈래는 그대로');
    // 판 내리기 — 1.0.3 을 다시(같은 파일) --force: 1.0.4·1.0.5·1.0.10 은 거둬들인 판(파일·내역 모두 뺌)
    const low = pub('--setup=' + made['1.0.3'].file, '--dir=' + share, '--force');
    assert.equal(low.code, 0, low.err);
    assert.match(low.out, /거둬들인 판\(이번 판보다 새 판\): 1\.0\.10, 1\.0\.5, 1\.0\.4/);
    assert.deepEqual(files(), ['WeatherCG-Setup-1.0.2.exe', 'WeatherCG-Setup-1.0.3.exe']);
    assert.deepEqual(latestOf(share).history.map((h) => h.version), ['1.0.3', '1.0.2', '1.0.1']);
    // --keep=2 — 이번 판 + 낮은 판 하나
    made['1.0.6'] = fakeSetup(src, '1.0.6');
    assert.equal(pub('--setup=' + made['1.0.6'].file, '--dir=' + share, '--keep=2').code, 0);
    assert.deepEqual(files(), ['WeatherCG-Setup-1.0.3.exe', 'WeatherCG-Setup-1.0.6.exe']);
    assert.deepEqual(latestOf(share).history.map((h) => h.version), ['1.0.6', '1.0.3', '1.0.2', '1.0.1']);
    const before = fs.readdirSync(share).sort().join(), beforeJson = fs.readFileSync(path.join(share, 'latest.json'), 'utf8');
    const d = pub('--setup=' + fakeSetup(src, '1.0.11').file, '--dir=' + share, '--dry-run');
    assert.equal(d.code, 0, d.err);
    assert.equal(fs.readdirSync(share).sort().join(), before, '--dry-run 은 그대로');
    assert.equal(fs.readFileSync(path.join(share, 'latest.json'), 'utf8'), beforeJson);
  } finally { fs.rmSync(src, { recursive: true, force: true }); fs.rmSync(share, { recursive: true, force: true }); }
});

test('내역 — 1차 latest.json(history 없음)을 이어받아 시작, 틀린 항목은 빼고 커밋은 이어받음, 최근 30판까지, 바뀐 점이 아주 길면 앱 한도(256KB) 안으로 옛 내역부터 뺌', () => {
  const src = tmp('src5'), share = tmp('share5');
  try {
    const a = fakeSetup(src, '1.0.0');
    fs.copyFileSync(a.file, path.join(share, 'WeatherCG-Setup-1.0.0.exe'));
    fs.writeFileSync(path.join(share, 'latest.json'), JSON.stringify({ version: '1.0.0', file: 'WeatherCG-Setup-1.0.0.exe', sha256: sha(a.body), size: a.body.length, date: '2026-10-12T00:00:00Z', notes: ['첫 정식판'], commit: 'def5678' }));
    const r = pub('--setup=' + fakeSetup(src, '1.0.1').file, '--dir=' + share, '--note=둘째');
    assert.equal(r.code, 0, r.err);
    const j = latestOf(share);
    assert.deepEqual(j.history.map((h) => [h.version, h.commit, h.notes[0]]), [['1.0.1', 'abc1234', '둘째'], ['1.0.0', 'def5678', '첫 정식판']]);
    assert.equal(U.validateLatest(j, '').info.history.length, 2, '앱 검사 통과');
    // 쌓기 한도 — 30판
    const hist = Array.from({ length: 40 }, (_, i) => ({ version: '0.' + i + '.0', file: U.setupName('0.' + i + '.0', ''), sha256: 'a'.repeat(64), size: 10, date: '2026-01-01T00:00:00Z', notes: ['x'] }));
    fs.writeFileSync(path.join(share, 'latest.json'), JSON.stringify({ ...j, history: [...j.history, ...hist, { version: 'bad' }] }));
    assert.equal(pub('--setup=' + fakeSetup(src, '1.0.2').file, '--dir=' + share).code, 0);
    const j2 = latestOf(share);
    assert.equal(j2.history.length, U.HISTORY_MAX);
    assert.deepEqual(j2.history.slice(0, 3).map((h) => h.version), ['1.0.2', '1.0.1', '1.0.0']);
    // 바뀐 점이 아주 김 — 내역을 줄여 한도 안으로
    const longNotes = Array.from({ length: 30 }, () => '가'.repeat(299)).join('\n');
    const huge = Array.from({ length: 29 }, (_, i) => ({ version: '0.' + i + '.1', file: U.setupName('0.' + i + '.1', ''), sha256: 'a'.repeat(64), size: 10, date: '2026-01-01T00:00:00Z', notes: longNotes.split('\n') }));
    fs.writeFileSync(path.join(share, 'latest.json'), JSON.stringify({ ...j2, history: [j2.history[0], ...huge] }));
    const nf = path.join(src, 'long.txt'); fs.writeFileSync(nf, longNotes);
    assert.equal(pub('--setup=' + fakeSetup(src, '1.0.3').file, '--dir=' + share, '--notes-file=' + nf).code, 0);
    const raw = fs.readFileSync(path.join(share, 'latest.json'));
    assert.ok(raw.length <= U.MAX_JSON_BYTES, raw.length + ' 바이트');
    assert.ok(latestOf(share).history.length < 30 && latestOf(share).history[0].version === '1.0.3');
  } finally { fs.rmSync(src, { recursive: true, force: true }); fs.rmSync(share, { recursive: true, force: true }); }
});

test('끝에서 끝(파일만) — 올린 것을 앱(desktop/updater.js)이 새 판으로 알아채고, 받아 확인한 뒤 /S --updated --force-run 으로 실행·앱 끄기', async () => {
  const src = tmp('src4'), share = tmp('share4'), tr = tmp('t4');
  try {
    const s = fakeSetup(src, '1.0.1', { bytes: 1500000 });
    assert.equal(pub(`--setup=${s.file}`, `--dir=${share}`, '--note=바뀐 점').code, 0);
    const spawned = [], quits = [], notes = [], timers = [];
    const up = U.createUpdater({
      current: '1.0.0', packaged: true, testMode: true, env: { WCG_UPDATE_DIR: share, WCG_UPDATE_FIRST_MS: '0' }, tempRoot: tr,
      notify: (i) => notes.push(i), quitForInstall: () => quits.push(1),
      setTimer: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimer() {},
      spawn: (file, args, opts) => { spawned.push({ file, args, opts }); const c = new EventEmitter(); c.pid = 1; c.unref = () => {}; setImmediate(() => c.emit('spawn')); return c; },
    });
    assert.equal(up.auto, true, '시험 폴더면 점검 모드도');
    up.start();
    assert.equal(timers[0].ms, 0, 'WCG_UPDATE_FIRST_MS');
    timers[0].fn(); await new Promise((r) => setTimeout(r, 80));
    assert.equal(notes.length, 1); assert.equal(notes[0].version, '1.0.1'); assert.deepEqual(notes[0].notes, ['바뀐 점']);
    const r = await up.install('1.0.1');
    assert.deepEqual(r, { ok: true, version: '1.0.1', ui: false }, '진행 창 없음(uiExe 안 줌) = 조용한 설치');
    assert.equal(spawned.length, 1);
    assert.deepEqual(spawned[0].args, ['/S', '--updated', '--force-run']);
    assert.equal(sha(fs.readFileSync(spawned[0].file)), sha(s.body));
    timers.find((t) => t.ms === U.FALLBACK_QUIT_MS).fn();
    assert.equal(quits.length, 1);
  } finally { for (const d of [src, share, tr]) fs.rmSync(d, { recursive: true, force: true }); }
});

test('끝에서 끝(파일만) — 1.0.0·1.0.1 을 차례로 올리면, 1.0.1 앱은 메뉴에서 1.0.0 을 되돌릴 수 있는 판으로 보고 같은 길로 실행', async () => {
  const src = tmp('src6'), share = tmp('share6'), tr = tmp('t6');
  try {
    const a = fakeSetup(src, '1.0.0', { bytes: 900000 }), b = fakeSetup(src, '1.0.1', { bytes: 900001 });
    assert.equal(pub('--setup=' + a.file, '--dir=' + share, '--note=첫 판').code, 0);
    assert.equal(pub('--setup=' + b.file, '--dir=' + share, '--note=둘째 판').code, 0);
    const spawned = [];
    const up = U.createUpdater({
      current: '1.0.1', packaged: true, env: { WCG_UPDATE_DIR: share }, tempRoot: tr, notify() {}, quitForInstall() {}, setTimer: () => 1, clearTimer() {},
      spawn: (file, args) => { spawned.push({ file, args }); const c = new EventEmitter(); c.pid = 1; c.unref = () => {}; setImmediate(() => c.emit('spawn')); return c; },
    });
    const r = await up.check(true);
    assert.equal(r.state, 'latest');
    assert.deepEqual(r.history.map((h) => [h.version, h.rollback, h.notes[0]]), [['1.0.1', false, '둘째 판'], ['1.0.0', true, '첫 판']]);
    assert.deepEqual(await up.install('1.0.0', null, { rollback: true }), { ok: true, version: '1.0.0', ui: false, rollback: true });
    assert.equal(sha(fs.readFileSync(spawned[0].file)), sha(a.body));
    assert.deepEqual(spawned[0].args, ['/S', '--updated', '--force-run']);
  } finally { for (const d of [src, share, tr]) fs.rmSync(d, { recursive: true, force: true }); }
});
