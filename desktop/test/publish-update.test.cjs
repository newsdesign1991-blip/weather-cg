// 앱 업데이트 올리기(tools/publish-update.cjs) 시험 — 임시 폴더만(실제 R:\[F]_Util\WNS\Ver 에는 쓰지 않는다).
// 복사·latest.json(앱 검사 통과)·바뀐 점(인자·파일)·낮거나 같은 판 거절(--force)·빌드 정보와 다르면 거절·이름 꼴·갈래 섞기 거절·
// 옛 판 정리(새 판 포함 최근 3개)·--dry-run·폴더 없으면 만들지 않음, 끝으로 올린 것을 앱 쪽(desktop/updater.js)이 그대로 받아 실행 직전까지 가는지.
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

test('옛 판 정리 — 새 판 포함 최근 3개(판 번호 순, 같은 갈래만), 다른 파일은 그대로, --dry-run 은 아무것도 안 씀', () => {
  const src = tmp('src3'), share = tmp('share3');
  try {
    fs.writeFileSync(path.join(share, 'readme.txt'), 'x');
    fs.writeFileSync(path.join(share, 'WeatherCG-Setup-0.1.0-installtest.exe'), 'other variant');
    for (const v of ['1.0.1', '1.0.2', '1.0.10', '1.0.3']) {
      const r = pub(`--setup=${fakeSetup(src, v).file}`, `--dir=${share}`, '--force');   // 1.0.3 은 1.0.10 보다 낮아 --force
      assert.equal(r.code, 0, r.err);
    }
    // 1.0.3 을 올린 뒤: 남는 것 = 1.0.3(지금) + 1.0.10·1.0.2(그다음 새 판 둘)
    assert.deepEqual(fs.readdirSync(share).sort(), ['WeatherCG-Setup-0.1.0-installtest.exe', 'WeatherCG-Setup-1.0.10.exe', 'WeatherCG-Setup-1.0.2.exe', 'WeatherCG-Setup-1.0.3.exe', 'latest.json', 'readme.txt'].sort());
    const before = fs.readdirSync(share).sort().join();
    const d = pub(`--setup=${fakeSetup(src, '1.0.11').file}`, `--dir=${share}`, '--dry-run');
    assert.equal(d.code, 0, d.err);
    assert.equal(fs.readdirSync(share).sort().join(), before, '--dry-run 은 그대로');
    assert.equal(latestOf(share).version, '1.0.3');
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
    assert.deepEqual(r, { ok: true, version: '1.0.1' });
    assert.equal(spawned.length, 1);
    assert.deepEqual(spawned[0].args, ['/S', '--updated', '--force-run']);
    assert.equal(sha(fs.readFileSync(spawned[0].file)), sha(s.body));
    timers.find((t) => t.ms === 400).fn();
    assert.equal(quits.length, 1);
  } finally { for (const d of [src, share, tr]) fs.rmSync(d, { recursive: true, force: true }); }
});
