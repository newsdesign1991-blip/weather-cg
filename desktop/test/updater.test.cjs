// 앱 업데이트(메인 프로세스) — desktop/updater.js 단위 시험(Electron 없이). MODULES.md 10장 '앱 업데이트'.
// 판 비교·설치 파일 이름 꼴·latest.json 검사·공유 폴더 없음/느림(시간 제한·매달린 읽기 쌓지 않기)·복사 중 크기/sha256 확인·취소·
// 실행 직전 다시 확인(바뀐 파일은 실행 안 함)·실행 인자(/S --updated --force-run)·'나중에' 기억·확인 하나만·저절로 확인 켜짐 조건,
// 업데이트 내역(history)·이전 판으로 되돌리기(10-12 — 내역 검사·파일이 남은 낮은 판만·같은 길로 설치·'나중에'가 막지 않음)·점검 모드는 공유 폴더 안 읽음. 배선은 글자로.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { EventEmitter } = require('events');
const U = require('../updater.js');

const root = path.resolve(__dirname, '..', '..');
const mainJs = fs.readFileSync(path.join(root, 'desktop', 'main.js'), 'utf8').replace(/\r\n/g, '\n');
const preload = fs.readFileSync(path.join(root, 'desktop', 'preload.js'), 'utf8').replace(/\r\n/g, '\n');
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const tmpDir = (tag) => fs.mkdtempSync(path.join(os.tmpdir(), `wcg-upd-${tag}-`));
// 업데이트 폴더 하나 만들기 — 설치 파일(무작위 바이트) + latest.json
function makeShare(o = {}) {
  const dir = o.dir || tmpDir('share');
  const version = o.version || '1.0.1', variant = o.variant || '';
  const body = o.body || crypto.randomBytes(o.bytes || 300000);
  const file = U.setupName(version, variant);
  fs.writeFileSync(path.join(dir, file), body);
  const latest = { version, file, sha256: sha(body), size: body.length, date: '2026-10-12T09:00:00.000Z', notes: ['기상청 받기 빨라짐', '업데이트 알림'], ...(o.latest || {}) };
  fs.writeFileSync(path.join(dir, 'latest.json'), JSON.stringify(latest));
  return { dir, file, body, latest };
}
const fakeSpawn = (log, o = {}) => (file, args, opts) => {
  log.push({ file, args, opts });
  const c = new EventEmitter();
  c.pid = 4242; c.unref = () => { log.unrefed = true; };
  setImmediate(() => (o.fail ? c.emit('error', Object.assign(new Error('nope'), { code: 'EACCES' })) : c.emit('spawn')));
  return c;
};

test('판 비교 — x.y.z 숫자 비교(1.0.10 > 1.0.9), 꼴이 아니면 null', () => {
  assert.deepEqual(U.parseVer('1.0.1'), [1, 0, 1]);
  assert.deepEqual(U.parseVer(' 2.10.3 '), [2, 10, 3]);
  for (const bad of ['1.0', 'v1.0.1', '1.0.1-beta', '', null, undefined, '1..1', '1.0.1.2', '01.a.1']) assert.equal(U.parseVer(bad), null, String(bad));
  assert.equal(U.cmpVer('1.0.10', '1.0.9'), 1);
  assert.equal(U.cmpVer('1.0.9', '1.0.10'), -1);
  assert.equal(U.cmpVer('2.0.0', '1.99.99'), 1);
  assert.equal(U.cmpVer('1.0.0', '1.0.0'), 0);
  assert.equal(U.cmpVer('1.0.0', 'x'), null);
});

test('설치 파일 이름 꼴 — 정식·설치 시험판, 판·갈래가 맞아야, 경로·다른 이름·조각은 아님', () => {
  assert.equal(U.setupName('1.0.1', ''), 'WeatherCG-Setup-1.0.1.exe');
  assert.equal(U.setupName('1.0.1', 'installtest'), 'WeatherCG-Setup-1.0.1-installtest.exe');
  assert.deepEqual(U.parseSetupName('WeatherCG-Setup-1.2.3.exe'), { version: '1.2.3', variant: '' });
  assert.deepEqual(U.parseSetupName('WeatherCG-Setup-1.2.3-installtest.exe'), { version: '1.2.3', variant: 'installtest' });
  for (const bad of ['..\\WeatherCG-Setup-1.0.1.exe', 'sub/WeatherCG-Setup-1.0.1.exe', 'weathercg-setup-1.0.1.exe', 'WeatherCG-Setup-1.0.1.exe.partial',
    'WeatherCG-Setup-1.0.exe', 'WeatherCG-Setup-1.0.1-beta.exe', 'Other-1.0.1.exe', 'WeatherCG-Setup-1.0.1.EXE', ' WeatherCG-Setup-1.0.1.exe']) assert.equal(U.parseSetupName(bad), null, bad);
  assert.equal(U.setupNameOk('WeatherCG-Setup-1.0.1.exe', '1.0.1', ''), true);
  assert.equal(U.setupNameOk('WeatherCG-Setup-1.0.1.exe', '1.0.2', ''), false, '판이 다름');
  assert.equal(U.setupNameOk('WeatherCG-Setup-1.0.1-installtest.exe', '1.0.1', ''), false, '정식 앱은 시험판 파일을 안 받음');
  assert.equal(U.setupNameOk('WeatherCG-Setup-1.0.1.exe', '1.0.1', 'installtest'), false, '시험판은 정식 파일을 안 받음');
  assert.equal(U.variantOf('weathercg-installtest'), 'installtest');
  assert.equal(U.variantOf('weathercg-desktop'), '');
  assert.equal(U.variantOf(undefined), '');
});

test('latest.json 검사 — 좋은 것, 판·이름·sha256·크기 하나라도 어긋나면 거절, 바뀐 점 정리', () => {
  const good = { version: '1.0.1', file: 'WeatherCG-Setup-1.0.1.exe', sha256: 'A'.repeat(64), size: 123, date: '2026-10-12T00:00:00Z', notes: ['가', '  나  ', '', 3, 'x\u0007y'] };
  const v = U.validateLatest(good, '');
  assert.equal(v.ok, true);
  const head = { version: '1.0.1', file: 'WeatherCG-Setup-1.0.1.exe', sha256: 'a'.repeat(64), size: 123, date: '2026-10-12T00:00:00Z', notes: ['가', '나', 'x y'] };
  assert.deepEqual(v.info, { ...head, history: [head] }, '내역이 없으면(1차 latest.json) 맨 위 판 하나');
  const bad = (patch, why, variant = '') => { const r = U.validateLatest({ ...good, ...patch }, variant); assert.equal(r.ok, false, JSON.stringify(patch)); assert.equal(r.why, why, JSON.stringify(patch)); };
  bad({ version: '1.0' }, 'version');
  bad({ version: 101 }, 'version');
  bad({ file: 'WeatherCG-Setup-1.0.2.exe' }, 'file');           // 판이 다른 파일
  bad({ file: '..\\WeatherCG-Setup-1.0.1.exe' }, 'file');       // 폴더 밖
  bad({ file: 'C:\\x\\WeatherCG-Setup-1.0.1.exe' }, 'file');
  bad({ file: 'evil.exe' }, 'file');
  bad({}, 'file', 'installtest');                                // 갈래가 다름
  bad({ sha256: 'z'.repeat(64) }, 'sha256');
  bad({ sha256: 'a'.repeat(63) }, 'sha256');
  bad({ size: 0 }, 'size'); bad({ size: -1 }, 'size'); bad({ size: 1.5 }, 'size'); bad({ size: '123' }, 'size'); bad({ size: U.MAX_SETUP_BYTES + 1 }, 'size');
  for (const j of [null, [], 'x', 3]) assert.equal(U.validateLatest(j, '').ok, false);
  assert.equal(U.validateLatest({ ...good, notes: undefined }, '').info.notes.length, 0);
  assert.equal(U.cleanNotes(Array.from({ length: 50 }, (_, i) => 'n' + i)).length, 30);
  assert.equal(U.cleanNotes(['가'.repeat(400)])[0].length, 300);
  assert.deepEqual(U.cleanNotes('한 줄\n\n두 줄'), ['한 줄', '두 줄']);
});

test('latest.json 읽기 — 폴더 없음 = unreachable, 파일 없음 = none, 깨짐·너무 큼·남의 것 = bad, BOM 괜찮음', async () => {
  const none = await U.readLatest(path.join(os.tmpdir(), 'wcg-no-such-dir-' + process.pid), { variant: '' });
  assert.equal(none.err, 'unreachable');
  const d = tmpDir('read');
  try {
    assert.equal((await U.readLatest(d, {})).err, 'none');
    fs.writeFileSync(path.join(d, 'latest.json'), '{ 깨짐');
    assert.deepEqual(await U.readLatest(d, {}), { ok: false, err: 'bad', why: 'json' });
    fs.writeFileSync(path.join(d, 'latest.json'), ' '.repeat(U.MAX_JSON_BYTES + 1));
    assert.equal((await U.readLatest(d, {})).why, 'json-size');
    fs.writeFileSync(path.join(d, 'latest.json'), JSON.stringify({ version: '1.0.1', file: 'WeatherCG-Setup-1.0.1-installtest.exe', sha256: 'a'.repeat(64), size: 1 }));
    assert.equal((await U.readLatest(d, { variant: '' })).why, 'file', '정식 앱이 시험판 latest.json 을 읽으면 bad');
    const s = makeShare({ dir: d });
    fs.writeFileSync(path.join(d, 'latest.json'), '\uFEFF' + JSON.stringify(s.latest));
    const r = await U.readLatest(d, { variant: '' });
    assert.equal(r.ok, true); assert.equal(r.dir, d); assert.equal(r.info.sha256, s.latest.sha256);
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});

test('느린 공유 폴더 — 시간 제한 안에 timeout 으로 돌아오고, 매달린 읽기가 있는 폴더는 다시 읽지 않는다(스레드를 쌓지 않음)', async () => {
  let release; const hang = new Promise((r) => { release = r; });
  let calls = 0;
  const fsp = { stat: async () => { calls++; await hang; throw Object.assign(new Error('x'), { code: 'ENOENT' }); } };
  const stuck = new Set();
  const t0 = Date.now();
  const r1 = await U.readLatest('\\\\slow\\share\\Ver', { fsp, timeoutMs: 120, stuck });
  assert.equal(r1.err, 'timeout');
  assert.ok(Date.now() - t0 < 1000, '시간 제한 안에 돌아옴');
  const r2 = await U.readLatest('\\\\SLOW\\share\\Ver', { fsp, timeoutMs: 120, stuck });
  assert.deepEqual(r2, { ok: false, err: 'timeout', why: 'still-waiting' }, '같은 폴더(대소문자 무시)는 쌓지 않는다');
  assert.equal(calls, 1);
  release(); await new Promise((r) => setTimeout(r, 20));
  assert.equal(stuck.size, 0, '매달린 읽기가 끝나면 다시 읽을 수 있다');
  // 후보 여럿: 첫 폴더가 느리고 둘째가 없으면 timeout(느림), 첫 폴더가 없고 둘째에 있으면 둘째 답
  const s = makeShare();
  try {
    const any1 = await U.readLatestAny([path.join(os.tmpdir(), 'wcg-none-' + process.pid), s.dir], { variant: '' });
    assert.equal(any1.ok, true); assert.equal(any1.dir, s.dir);
    let rel2; const hang2 = new Promise((r) => { rel2 = r; });
    const fsp2 = { stat: async (p) => { if (/slow2/.test(p)) { await hang2; } throw Object.assign(new Error('x'), { code: 'ENOENT' }); } };
    const any2 = await U.readLatestAny(['\\\\slow2\\Ver', 'R:\\nothing'], { fsp: fsp2, timeoutMs: 80, stuck: new Set() });
    assert.equal(any2.err, 'timeout');
    rel2();
    // 닿은 폴더가 '아직 안 올림'이면 다음 후보로 안 넘어간다
    const empty = tmpDir('empty');
    assert.equal((await U.readLatestAny([empty, s.dir], {})).err, 'none');
    fs.rmSync(empty, { recursive: true, force: true });
  } finally { fs.rmSync(s.dir, { recursive: true, force: true }); }
});

test('복사·확인 — 맞으면 이름 바꿔 둠(진행 알림), sha256·크기가 다르면 지우고 멈춤, 취소', async () => {
  const s = makeShare({ bytes: 3 * 1024 * 1024 + 17 });
  const t = tmpDir('copy');
  try {
    const prog = [];
    const dest = path.join(t, s.file);
    const ok = await U.copyVerified(path.join(s.dir, s.file), dest, { size: s.latest.size, sha256: s.latest.sha256, onProgress: (g, n) => prog.push([g, n]) });
    assert.deepEqual(ok, { ok: true, file: dest });
    assert.equal(sha(fs.readFileSync(dest)), s.latest.sha256);
    assert.ok(prog.length >= 1 && prog[prog.length - 1][0] === s.latest.size, '마지막 진행 = 전체');
    assert.ok(!fs.existsSync(dest + '.partial'));
    const bad = await U.copyVerified(path.join(s.dir, s.file), path.join(t, 'b.exe'), { size: s.latest.size, sha256: 'b'.repeat(64) });
    assert.equal(bad.err, 'sha');
    assert.ok(!fs.existsSync(path.join(t, 'b.exe')) && !fs.existsSync(path.join(t, 'b.exe.partial')), 'sha 가 다르면 아무것도 안 남김');
    const big = await U.copyVerified(path.join(s.dir, s.file), path.join(t, 'c.exe'), { size: s.latest.size - 10, sha256: s.latest.sha256 });
    assert.equal(big.err, 'size');
    assert.ok(!fs.existsSync(path.join(t, 'c.exe.partial')));
    const small = await U.copyVerified(path.join(s.dir, s.file), path.join(t, 'd.exe'), { size: s.latest.size + 10, sha256: s.latest.sha256 });
    assert.equal(small.err, 'size');
    const ac = new AbortController();
    const can = await U.copyVerified(path.join(s.dir, s.file), path.join(t, 'e.exe'), { size: s.latest.size, sha256: s.latest.sha256, signal: ac.signal, onProgress: () => ac.abort() });
    assert.equal(can.err, 'cancelled');
    assert.ok(!fs.existsSync(path.join(t, 'e.exe')) && !fs.existsSync(path.join(t, 'e.exe.partial')));
    const miss = await U.copyVerified(path.join(s.dir, 'nope.exe'), path.join(t, 'f.exe'), { size: 1, sha256: 'a'.repeat(64) });
    assert.equal(miss.err, 'copy');
  } finally { fs.rmSync(s.dir, { recursive: true, force: true }); fs.rmSync(t, { recursive: true, force: true }); }
});

test('받기 준비 — 폴더 밖·없는 파일·크기 다름은 복사 전에 멈춤, 임시 폴더의 지난 설치 파일만 정리', async () => {
  const s = makeShare();
  const tr = tmpDir('temp');
  try {
    assert.equal((await U.prepareInstall({ dir: s.dir, info: { ...s.latest, file: '..\\' + s.file }, tempRoot: tr })).err, 'path');
    assert.equal((await U.prepareInstall({ dir: s.dir, info: { ...s.latest, file: 'WeatherCG-Setup-9.9.9.exe', version: '9.9.9' }, tempRoot: tr })).err, 'missing');
    assert.equal((await U.prepareInstall({ dir: s.dir, info: { ...s.latest, size: s.latest.size + 1 }, tempRoot: tr })).err, 'size');
    const td = path.join(tr, U.TEMP_SUB);
    fs.mkdirSync(td, { recursive: true });
    fs.writeFileSync(path.join(td, 'WeatherCG-Setup-0.9.0.exe'), 'old');
    fs.writeFileSync(path.join(td, 'WeatherCG-Setup-0.9.1.exe.partial'), 'old');
    fs.writeFileSync(path.join(td, 'keep-me.txt'), 'x');
    const r = await U.prepareInstall({ dir: s.dir, info: s.latest, tempRoot: tr });
    assert.equal(r.ok, true);
    assert.deepEqual(fs.readdirSync(td).sort(), [s.file, 'keep-me.txt'].sort(), '우리 이름 꼴만 지운다');
  } finally { fs.rmSync(s.dir, { recursive: true, force: true }); fs.rmSync(tr, { recursive: true, force: true }); }
});

test('실행 — 임시 폴더의 확인한 파일만, 실행 직전 sha256 이 바뀌었으면 실행 안 함, 인자 = /S --updated --force-run(떨어뜨려 실행)', async () => {
  assert.deepEqual(U.INSTALL_ARGS, ['/S', '--updated', '--force-run']);
  const s = makeShare();
  const tr = tmpDir('run');
  try {
    const r = await U.prepareInstall({ dir: s.dir, info: s.latest, tempRoot: tr });
    const log = [];
    assert.equal((await U.runInstaller(path.join(s.dir, s.file), { tempRoot: tr, info: s.latest, variant: '', spawn: fakeSpawn(log) })).err, 'path', '업데이트 폴더에서 바로 실행 안 함');
    assert.equal((await U.runInstaller(r.file, { tempRoot: tr, info: { ...s.latest, version: '1.0.2' }, variant: '', spawn: fakeSpawn(log) })).err, 'path', '이름의 판이 다름');
    assert.equal((await U.runInstaller(r.file, { tempRoot: tr, info: s.latest, variant: 'installtest', spawn: fakeSpawn(log) })).err, 'path', '갈래가 다름');
    assert.equal(log.length, 0);
    const ok = await U.runInstaller(r.file, { tempRoot: tr, info: s.latest, variant: '', spawn: fakeSpawn(log) });
    assert.deepEqual(ok, { ok: true, pid: 4242 });
    assert.equal(log.length, 1);
    assert.equal(log[0].file, r.file);
    assert.deepEqual(log[0].args, ['/S', '--updated', '--force-run']);
    assert.equal(log[0].opts.detached, true); assert.equal(log[0].opts.stdio, 'ignore');
    assert.equal(log.unrefed, true);
    fs.appendFileSync(r.file, 'x');   // 받은 뒤 누가 바꿈
    assert.equal((await U.runInstaller(r.file, { tempRoot: tr, info: s.latest, variant: '', spawn: fakeSpawn(log) })).err, 'size');
    fs.writeFileSync(r.file, Buffer.alloc(s.latest.size, 7));
    assert.equal((await U.runInstaller(r.file, { tempRoot: tr, info: s.latest, variant: '', spawn: fakeSpawn(log) })).err, 'sha');
    assert.equal(log.length, 1, '바뀐 파일은 실행하지 않는다');
    fs.writeFileSync(r.file, s.body);
    assert.deepEqual(await U.runInstaller(r.file, { tempRoot: tr, info: s.latest, variant: '', spawn: fakeSpawn(log, { fail: true }) }), { ok: false, err: 'spawn', code: 'EACCES' });
  } finally { fs.rmSync(s.dir, { recursive: true, force: true }); fs.rmSync(tr, { recursive: true, force: true }); }
});

// 가짜 타이머 — 등록한 것을 손으로 돌린다
function fakeTimers() {
  const list = [];
  return { list, setTimer: (fn, ms) => { const t = { fn, ms, done: false }; list.push(t); return t; }, clearTimer: (t) => { if (t) t.done = true; },
    async run(i) { const t = list[i]; t.done = true; t.fn(); await new Promise((r) => setTimeout(r, 30)); } };
}

test('저절로 확인 켜짐 — 설치판만(점검 모드 아님), 시험 폴더(WCG_UPDATE_DIR)면 개발판·점검 모드도', () => {
  const mk = (o) => U.createUpdater({ current: '1.0.0', notify() {}, quitForInstall() {}, tempRoot: os.tmpdir(), setTimer: () => 1, clearTimer() {}, ...o });
  assert.equal(mk({ packaged: true, testMode: false, env: {} }).auto, true);
  assert.equal(mk({ packaged: false, testMode: false, env: {} }).auto, false);
  assert.equal(mk({ packaged: true, testMode: true, env: {} }).auto, false);
  const t = mk({ packaged: false, testMode: true, env: { WCG_UPDATE_DIR: 'C:\\t\\upd' } });
  assert.equal(t.auto, true);
  assert.deepEqual(t.dirs, [path.resolve('C:\\t\\upd')]);
  assert.deepEqual(mk({ packaged: true, env: {} }).dirs, U.DEFAULT_DIRS);
  assert.deepEqual(U.DEFAULT_DIRS, ['R:\\[F]_Util\\WNS\\Ver', '\\\\10.10.105.25\\cg\\[F]_Util\\WNS\\Ver']);
});

test('확인 — 15초 뒤 첫 확인·그다음 3시간마다, 새 판이면 알림, \'나중에\' 고른 판은 저절로는 다시 안 알림(직접 확인은 보임), 더 새 판은 알림', async () => {
  const s = makeShare({ version: '1.0.1' });
  const tm = fakeTimers();
  const notes = [];
  try {
    const up = U.createUpdater({ current: '1.0.0', packaged: true, testMode: false, env: {}, dirs: [s.dir], tempRoot: os.tmpdir(), notify: (i) => notes.push(i), quitForInstall() {}, ...tm });
    assert.equal(up.start(), true);
    assert.equal(tm.list.length, 1); assert.equal(tm.list[0].ms, 15000);
    await tm.run(0);
    assert.equal(notes.length, 1);
    assert.deepEqual({ ...notes[0], folder: undefined }, { state: 'available', current: '1.0.0', folder: undefined, packaged: true, canInstall: true, version: '1.0.1', file: s.file, size: s.latest.size, date: s.latest.date, notes: s.latest.notes,
      history: [{ version: '1.0.1', date: s.latest.date, size: s.latest.size, notes: s.latest.notes, rollback: false }] });
    assert.equal(tm.list[1].ms, 3 * 3600 * 1000, '다음은 3시간 뒤');
    assert.equal(up.pending().version, '1.0.1', '웹앱이 다시 뜨면 건넬 알림');
    up.later('1.0.1');
    assert.equal(up.pending(), null, '나중에 고르면 다시 안 건넴');
    await tm.run(1);
    assert.equal(notes.length, 1, '나중에 고른 판은 저절로 안 띄움');
    assert.equal((await up.check(true)).state, 'available', '직접 확인은 보여 준다');
    assert.equal(notes.length, 1, '직접 확인은 알림 대신 답으로');
    makeShare({ dir: s.dir, version: '1.0.2' });
    await tm.run(2);
    assert.equal(notes.length, 2); assert.equal(notes[1].version, '1.0.2', '더 새 판은 알림');
    assert.equal(up.pending().version, '1.0.2');
    makeShare({ dir: s.dir, version: '1.0.0' });
    assert.equal((await up.check(true)).state, 'latest');
    assert.equal(up.pending(), null, '판을 내렸으면(되돌리기) 더는 안 건넴');
    makeShare({ dir: s.dir, version: '0.9.0' });
    assert.equal((await up.check(true)).state, 'latest', '옛 판은 알리지 않음');
    fs.rmSync(path.join(s.dir, 'latest.json'));
    assert.equal((await up.check(true)).state, 'none');
    up.stop();
    assert.equal(tm.list[tm.list.length - 1].done, true, '끄면 타이머도');
  } finally { fs.rmSync(s.dir, { recursive: true, force: true }); }
  const gone = U.createUpdater({ current: '1.0.0', packaged: true, env: {}, dirs: [path.join(os.tmpdir(), 'wcg-gone-' + process.pid)], tempRoot: os.tmpdir(), notify() { throw new Error('알림 안 됨'); }, quitForInstall() {} });
  assert.equal((await gone.check(false)).state, 'unreachable', '공유 폴더 없음 = 조용히(알림 없음)');
});

test('확인 하나만 — 겹쳐 눌러도 읽기는 한 번', async () => {
  const s = makeShare();
  let stats = 0;
  const fsp = { ...fs.promises, stat: (p) => { stats++; return fs.promises.stat(p); } };
  try {
    const up = U.createUpdater({ current: '1.0.0', packaged: true, env: {}, dirs: [s.dir], fsp, tempRoot: os.tmpdir(), notify() {}, quitForInstall() {} });
    const [a, b] = await Promise.all([up.check(true), up.check(true)]);
    assert.equal(a, b);
    assert.equal(stats, 2, '폴더 + latest.json 한 번씩');
  } finally { fs.rmSync(s.dir, { recursive: true, force: true }); }
});

test('설치 — 개발판 거절, 판이 바뀌었으면 멈춤, sha256 다르면 실행 안 함, 맞으면 실행 → 앱 끄기, 두 번 못 누름, 받는 중 취소, 시험(DRYRUN)', async () => {
  const s = makeShare({ bytes: 2 * 1024 * 1024 });
  const tr = tmpDir('inst');
  const mk = (o = {}) => {
    const log = [], quits = [], tm = fakeTimers();
    const up = U.createUpdater({ current: '1.0.0', packaged: true, env: {}, dirs: [s.dir], tempRoot: tr, notify() {}, quitForInstall: () => quits.push(1), spawn: fakeSpawn(log), ...tm, ...o });
    return { up, log, quits, tm };
  };
  try {
    assert.deepEqual(await mk({ packaged: false }).up.install('1.0.1'), { ok: false, err: 'dev' });
    const dry = mk({ packaged: false, env: { WCG_UPDATE_DRYRUN: '1' } });
    assert.deepEqual(await dry.up.install('1.0.1'), { ok: true, dry: true, version: '1.0.1' });
    assert.equal(dry.log.length, 0, '시험은 실행 안 함');
    assert.ok(fs.existsSync(path.join(tr, U.TEMP_SUB, s.file)), '임시 폴더에 확인한 사본');
    assert.equal((await mk().up.install('1.0.2')).err, 'changed', '고른 판과 지금 latest.json 판이 다름');
    // sha256 이 다른 설치 파일(올린 뒤 바뀜)
    const good = fs.readFileSync(path.join(s.dir, s.file));
    fs.writeFileSync(path.join(s.dir, s.file), Buffer.alloc(good.length, 1));
    const bad = mk();
    assert.equal((await bad.up.install('1.0.1')).err, 'sha');
    assert.equal(bad.log.length, 0); assert.equal(bad.quits.length, 0);
    assert.ok(!fs.existsSync(path.join(tr, U.TEMP_SUB, s.file + '.partial')));
    fs.writeFileSync(path.join(s.dir, s.file), good);
    // 받는 중 취소
    const can = mk();
    const p = can.up.install('1.0.1', () => can.up.cancel());
    assert.equal((await p).err, 'cancelled');
    assert.equal(can.log.length, 0);
    // 맞음 → 실행 → 0.4초 뒤 앱 끄기
    const ok = mk();
    const prog = [];
    const [r1, r2] = await Promise.all([ok.up.install('1.0.1', (g, n) => prog.push([g, n])), ok.up.install('1.0.1')]);
    assert.deepEqual(r1, { ok: true, version: '1.0.1', ui: false }, '진행 창 없음(uiExe 안 줌) = 조용한 설치');
    assert.deepEqual(r2, { ok: false, err: 'busy' }, '겹쳐 누르면 busy');
    assert.equal(ok.log.length, 1);
    assert.deepEqual(ok.log[0].args, U.INSTALL_ARGS);
    assert.equal(path.dirname(ok.log[0].file), path.join(tr, U.TEMP_SUB));
    assert.equal(prog[prog.length - 1][0], good.length);
    const q = ok.tm.list.find((t) => t.ms === U.FALLBACK_QUIT_MS);
    assert.ok(q, '앱 끄기 예약'); q.fn();
    assert.equal(ok.quits.length, 1);
    assert.deepEqual(await ok.up.install('1.0.1'), { ok: false, err: 'busy' }, '실행한 뒤엔 다시 못 함');
    assert.equal((await mk({ current: '1.0.1' }).up.install('1.0.1')).err, 'not-newer');
  } finally { fs.rmSync(s.dir, { recursive: true, force: true }); fs.rmSync(tr, { recursive: true, force: true }); }
});

test('배선 — main.js IPC 넷 다 메인 창 주 프레임만, 끌 때 닫기 전 묻기 건너뜀, preload 다리, 설치 시험판 분리', () => {
  assert.match(mainJs, /ipcMain\.handle\('wcg:update-install', async \(e, v, o\) => \{[\s\S]*?\{ rollback: !!\(o && o\.rollback === true\), onPhase: \(phase\) => send\(\{ phase: String\(phase\) \}\) \}\);/,
    '되돌리기 = 같은 통로에 { rollback: true }, 진행 창을 띄우는 중이면 웹앱에 알림');
  assert.match(preload, /updateInstall: \(v, o\) => ipcRenderer\.invoke\('wcg:update-install', String\(v \|\| ''\), \{ rollback: !!\(o && o\.rollback\) \}\),/);
  for (const ch of ['wcg:update-check', 'wcg:update-later', 'wcg:update-install', 'wcg:update-cancel']) {
    const i = mainJs.indexOf(`ipcMain.handle('${ch}'`);
    assert.notEqual(i, -1, ch);
    assert.match(mainJs.slice(i, i + 200), /privateKeyCallerOk\(e, win\)/, ch + ' 은 메인 창 주 프레임만');
  }
  assert.match(mainJs, /quitForInstall: \(\) => \{ try \{ if \(closeGuard\) closeGuard\.release\(\); \} catch \(e\) \{ \/\* 창 없음 \*\/ \} app\.quit\(\); \}/);
  assert.match(mainJs, /notify: \(info\) => \{ if \(win && !win\.isDestroyed\(\)\) win\.webContents\.send\('wcg:update', info\); \}/);
  assert.match(mainJs, /current: app\.getVersion\(\), variant: APP_VARIANT, packaged: app\.isPackaged, testMode: TEST_MODE/);
  assert.match(mainJs, /tempRoot: LAYOUT\.kind === 'ndt' \? LAYOUT\.cache : app\.getPath\('temp'\)/);   // 예전 자리는 임시 폴더, NDT 자리는 NDT\cache(10-26 — app-paths.test)
  assert.match(mainJs, /if \(TEST_MODE\) \{ createWindow\(\); startUpdater\(\); return; \}/);
  assert.match(mainJs, /createWindow\(\);\n\s*startUpdater\(\);\n\s*\}\);/);
  assert.match(mainJs, /try \{ updater && updater\.stop\(\); \} catch/);
  assert.match(mainJs, /win\.webContents\.on\('did-finish-load', \(\) => \{ const p = updater && updater\.pending\(\); if \(p && win && !win\.isDestroyed\(\)\) win\.webContents\.send\('wcg:update', p\); \}\);/, '화면이 다시 뜨면 다시 건넴');
  // 설치 시험판: 빈 포트 헬퍼·대체 헬퍼 없음·따로 폴더
  assert.match(mainJs, /const INSTALL_TEST = app\.isPackaged && APP_VARIANT === 'installtest';/);
  assert.match(mainJs, /const EMBED_PORT = INSTALL_TEST \? 0 : 3721;/);
  assert.match(mainJs, /const LAD_APP = LAYOUT\.cache \|\| path\.join\(LAD, INSTALL_TEST \? 'WeatherCG-installtest' : 'WeatherCG'\);/);
  assert.match(mainJs, /variant: INSTALL_TEST \? 'installtest' : '',/, '설치 시험판은 자기 자리(app-paths.js — WeatherCG-installtest·NDT weather-cg-installtest)');
  assert.match(mainJs, /const FRAMES_DIR = path\.join\(LAD_APP, 'frames'\);/);
  assert.match(mainJs, /if \(!\(await startEmbeddedHelper\(\)\) && !INSTALL_TEST\) \{/);
  assert.match(mainJs, /helperUrl = `http:\/\/127\.0\.0\.1:\$\{port \|\| EMBED_PORT\}`/);
  for (const k of ['updateCheck', 'updateLater', 'updateInstall', 'updateCancel', 'onUpdate', 'onUpdateProgress']) assert.match(preload, new RegExp(`\\b${k}: `), k);
  assert.match(preload, /ipcRenderer\.on\('wcg:update', \(_e, d\) => \{ updateLast = d;/);
  assert.match(preload, /if \(updateCb && updateLast\)/, '부팅 전에 온 알림은 걸 때 건넨다');
});

// ── 업데이트 내역·이전 판으로 되돌리기(10-12) ──
// 업데이트 폴더 하나에 여러 판(설치 파일 + latest.json 의 history) — missing 에 든 판은 내역에만(설치 파일 정리됨)
function makeHistShare(versions, o = {}) {
  const dir = o.dir || tmpDir('hist');
  const ents = versions.map((version, i) => {
    const body = crypto.randomBytes((o.bytes || 200000) + i);
    const file = U.setupName(version, o.variant || '');
    if (!o.missing || !o.missing.includes(version)) fs.writeFileSync(path.join(dir, file), body);
    return { version, file, sha256: sha(body), size: body.length, date: `2026-10-${String(10 + i).padStart(2, '0')}T09:00:00.000Z`, notes: [`${version} 바뀐 점`], body };
  });
  const strip = ({ body, ...e }) => e;
  const head = ents[ents.length - 1];
  fs.writeFileSync(path.join(dir, 'latest.json'), JSON.stringify({ ...strip(head), history: ents.slice().reverse().map(strip), ...(o.latest || {}) }));
  return { dir, ents, head };
}

test('내역 검사 — 새 판 먼저·맨 위 판 포함, 틀린 항목·다른 갈래·맨 위보다 새 판(거둬들임)은 빼고 같은 판은 맨 위 것, 최대 30판, latest.json 256KB 까지', () => {
  const e = (version, extra = {}) => ({ version, file: U.setupName(version, ''), sha256: 'b'.repeat(64), size: 10, date: '2026-10-01T00:00:00Z', notes: [version], ...extra });
  const top = e('1.0.3', { sha256: 'c'.repeat(64) });
  const v = U.validateLatest({ ...top, history: [e('1.0.1'), e('1.0.10'), e('1.0.3'), e('1.0.2'), e('1.0.0', { sha256: 'x' }), e('0.9.0', { file: 'evil.exe' }),
    { ...e('0.8.0'), file: U.setupName('0.8.0', 'installtest') }, 'x', null, e('1.0.2', { notes: ['둘째'] })] }, '');
  assert.equal(v.ok, true);
  assert.deepEqual(v.info.history.map((h) => h.version), ['1.0.3', '1.0.2', '1.0.1'], '1.0.10 은 맨 위(1.0.3)보다 새 판 = 거둬들인 판, 틀린 항목은 조용히 뺀다');
  assert.equal(v.info.history[0].sha256, 'c'.repeat(64), '같은 판은 맨 위 것');
  assert.deepEqual(v.info.history[1].notes, ['1.0.2'], '같은 판이 둘이면 앞의 것');
  const many = U.validateLatest({ ...e('2.0.0'), history: Array.from({ length: 50 }, (_, i) => e(`1.0.${i}`)) }, '');
  assert.equal(many.info.history.length, U.HISTORY_MAX);
  assert.equal(many.info.history[0].version, '2.0.0');
  assert.equal(U.validateLatest({ ...top, history: 'x' }, '').info.history.length, 1, '내역이 배열이 아니면 맨 위 판만');
  assert.equal(U.MAX_JSON_BYTES, 256 * 1024);
  assert.equal(U.KEEP_SETUPS, 5);
});

test('확인 — 내역(판·날짜·크기·바뀐 점)과 되돌릴 수 있는 판(지금 판보다 낮고 설치 파일이 크기까지 맞게 남은 판)만 rollback', async () => {
  const s = makeHistShare(['1.0.0', '1.0.1', '1.0.2', '1.0.3'], { missing: ['1.0.0'] });
  try {
    fs.writeFileSync(path.join(s.dir, s.ents[1].file), Buffer.alloc(5));   // 1.0.1 = 크기가 다름(망가진 파일) — 되돌리기 목록에서 뺀다
    const up = U.createUpdater({ current: '1.0.2', packaged: true, env: {}, dirs: [s.dir], tempRoot: os.tmpdir(), notify() {}, quitForInstall() {} });
    const r = await up.check(true);
    assert.equal(r.state, 'available'); assert.equal(r.version, '1.0.3');
    assert.deepEqual(r.history.map((h) => [h.version, h.rollback]), [['1.0.3', false], ['1.0.2', false], ['1.0.1', false], ['1.0.0', false]], '1.0.0 = 파일 없음, 1.0.1 = 크기 다름');
    assert.deepEqual(r.history[0], { version: '1.0.3', date: s.head.date, size: s.head.size, notes: ['1.0.3 바뀐 점'], rollback: false });
    fs.writeFileSync(path.join(s.dir, s.ents[1].file), s.ents[1].body);
    const up2 = U.createUpdater({ current: '1.0.3', packaged: true, env: {}, dirs: [s.dir], tempRoot: os.tmpdir(), notify() {}, quitForInstall() {} });
    const r2 = await up2.check(true);
    assert.equal(r2.state, 'latest');
    assert.deepEqual(r2.history.filter((h) => h.rollback).map((h) => h.version), ['1.0.2', '1.0.1'], '지금 판보다 낮고 파일이 남은 판, 새 판 먼저');
    // 바로 가기(심볼릭 링크)는 되돌리기 목록에 안 넣는다(만들 권한이 없으면 건너뜀)
    const link = path.join(s.dir, 'WeatherCG-Setup-0.9.0.exe');
    let linked = false;
    try { fs.symlinkSync(path.join(s.dir, s.ents[2].file), link); linked = true; } catch (e) { /* 권한 없음 */ }
    if (linked) assert.deepEqual(await U.rollbackable(s.dir, [{ version: '0.9.0', file: 'WeatherCG-Setup-0.9.0.exe', size: s.ents[2].size }], '1.0.3', {}), []);
    // 느린 폴더 — lstat 이 시간 안에 안 오면 거기서 멈춘다(매달리지 않음)
    const slow = { lstat: () => new Promise(() => {}) };
    const t0 = Date.now();
    assert.deepEqual(await U.rollbackable(s.dir, s.ents.slice(0, 3), '1.0.3', { fsp: slow, timeoutMs: 80 }), []);
    assert.ok(Date.now() - t0 < 1000);
  } finally { fs.rmSync(s.dir, { recursive: true, force: true }); }
});

test('되돌리기 — 내역의 낮은 판을 같은 길로(복사·sha256·실행 직전 다시 확인·/S --updated --force-run·앱 끄기), 빠진 판·높은 판·없는 파일·sha 다름은 실행 안 함', async () => {
  const s = makeHistShare(['1.0.0', '1.0.1'], { bytes: 600000 });
  const tr = tmpDir('rb');
  const mk = (o = {}) => {
    const log = [], quits = [], tm = fakeTimers();
    const up = U.createUpdater({ current: '1.0.1', packaged: true, env: {}, dirs: [s.dir], tempRoot: tr, notify() {}, quitForInstall: () => quits.push(1), spawn: fakeSpawn(log), ...tm, ...o });
    return { up, log, quits, tm };
  };
  try {
    assert.equal((await mk().up.install('1.0.0')).err, 'changed', '보통 설치(되돌리기 아님)로 낮은 판은 안 됨');
    assert.deepEqual(await mk().up.install('0.9.0', null, { rollback: true }), { ok: false, err: 'gone', version: '0.9.0' }, '내역에 없는 판');
    assert.deepEqual(await mk().up.install('1.0.1', null, { rollback: true }), { ok: false, err: 'not-older', version: '1.0.1' }, '지금 판은 되돌리기가 아님');
    assert.deepEqual(await mk({ packaged: false }).up.install('1.0.0', null, { rollback: true }), { ok: false, err: 'dev' });
    const dry = mk({ packaged: false, env: { WCG_UPDATE_DRYRUN: '1' } });
    assert.deepEqual(await dry.up.install('1.0.0', null, { rollback: true }), { ok: true, dry: true, version: '1.0.0', rollback: true });
    assert.equal(dry.log.length, 0);
    // sha 다름(올린 뒤 바뀐 옛 판 파일)
    const good = fs.readFileSync(path.join(s.dir, s.ents[0].file));
    fs.writeFileSync(path.join(s.dir, s.ents[0].file), Buffer.alloc(good.length, 3));
    const bad = mk();
    assert.equal((await bad.up.install('1.0.0', null, { rollback: true })).err, 'sha');
    assert.equal(bad.log.length, 0);
    // 설치 파일이 정리됨
    fs.rmSync(path.join(s.dir, s.ents[0].file));
    assert.equal((await mk().up.install('1.0.0', null, { rollback: true })).err, 'missing');
    fs.writeFileSync(path.join(s.dir, s.ents[0].file), good);
    // 맞음 → 실행 → 0.4초 뒤 앱 끄기
    const ok = mk();
    const prog = [];
    const r = await ok.up.install('1.0.0', (g, n) => prog.push([g, n]), { rollback: true });
    assert.deepEqual(r, { ok: true, version: '1.0.0', ui: false, rollback: true });
    assert.equal(ok.log.length, 1);
    assert.deepEqual(ok.log[0].args, U.INSTALL_ARGS);
    assert.equal(path.basename(ok.log[0].file), 'WeatherCG-Setup-1.0.0.exe');
    assert.equal(sha(fs.readFileSync(ok.log[0].file)), s.ents[0].sha256);
    assert.equal(prog[prog.length - 1][0], good.length);
    ok.tm.list.find((t) => t.ms === U.FALLBACK_QUIT_MS).fn();
    assert.equal(ok.quits.length, 1);
    assert.deepEqual(await ok.up.install('1.0.0', null, { rollback: true }), { ok: false, err: 'busy' });
  } finally { fs.rmSync(s.dir, { recursive: true, force: true }); fs.rmSync(tr, { recursive: true, force: true }); }
});

test('나중에는 저절로 알림만 막는다 — 같은 판을 메뉴에서 설치(되돌린 판에서 다시 최신으로)할 수 있다', async () => {
  const s = makeHistShare(['1.0.0', '1.0.1']);
  const tr = tmpDir('later');
  try {
    const log = [], notes = [], tm = fakeTimers();
    const up = U.createUpdater({ current: '1.0.0', packaged: true, env: {}, dirs: [s.dir], tempRoot: tr, notify: (i) => notes.push(i), quitForInstall() {}, spawn: fakeSpawn(log), ...tm });
    up.start(); await tm.run(0);
    assert.equal(notes.length, 1);
    up.later('1.0.1');
    assert.equal(up.pending(), null);
    const r = await up.check(true);
    assert.equal(r.state, 'available', '메뉴 확인은 나중에 고른 판도 새 판으로');
    assert.deepEqual(await up.install('1.0.1'), { ok: true, version: '1.0.1', ui: false }, '나중에 고른 판도 설치된다');
    assert.equal(log.length, 1);
  } finally { fs.rmSync(s.dir, { recursive: true, force: true }); fs.rmSync(tr, { recursive: true, force: true }); }
});

test('점검 모드(WCG_TEST)에 시험 폴더가 없으면 공유 폴더를 읽지 않는다 — 확인 = unreachable(test-mode), 시험 폴더가 있으면 읽음', async () => {
  let stats = 0;
  const fsp = { ...fs.promises, stat: (p) => { stats++; return fs.promises.stat(p); } };
  const up = U.createUpdater({ current: '1.0.0', packaged: false, testMode: true, env: {}, fsp, tempRoot: os.tmpdir(), notify() {}, quitForInstall() {} });
  assert.equal(up.auto, false);
  const r = await up.check(true);
  assert.equal(r.state, 'unreachable'); assert.equal(r.why, 'test-mode');
  assert.equal(r.packaged, false); assert.equal(r.canInstall, false, '개발판 = 설치 못 함');
  assert.equal(stats, 0, '공유 폴더(R:)에 손대지 않음');
  const s = makeShare();
  try {
    const t = U.createUpdater({ current: '1.0.0', packaged: false, testMode: true, env: { WCG_UPDATE_DIR: s.dir, WCG_UPDATE_DRYRUN: '1' }, tempRoot: os.tmpdir(), notify() {}, quitForInstall() {} });
    const r2 = await t.check(true);
    assert.equal(r2.state, 'available');
    assert.equal(r2.canInstall, true, '시험(DRYRUN)은 실행 직전까지 되므로 버튼을 켠다');
  } finally { fs.rmSync(s.dir, { recursive: true, force: true }); }
});
