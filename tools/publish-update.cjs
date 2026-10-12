#!/usr/bin/env node
'use strict';
// 앱 업데이트 올리기 — 구운 설치 파일을 업데이트 폴더에 복사하고 latest.json 을 쓴다. 받는 쪽(앱)은 desktop/updater.js. MODULES.md 10장 '앱 업데이트'.
//
//   node tools/publish-update.cjs [--setup=<설치 파일>] [--dir=<업데이트 폴더>] [--note="바뀐 점"]… [--notes-file=<글 파일>]
//                                 [--keep=5] [--force] [--dry-run]
//   --setup      기본: desktop\dist\WeatherCG-Setup-<desktop/package.json 판>.exe(tools/build-installer.cjs 가 굽는 곳)
//   --dir        기본: R:\[F]_Util\WNS\Ver, R: 가 없으면 같은 공유 \\10.10.105.25\cg\[F]_Util\WNS\Ver (폴더는 미리 있어야 — 만들지 않는다)
//   --note       바뀐 점 한 줄(여러 번 줄 수 있음). --notes-file = 한 줄에 하나(빈 줄·'#' 줄은 뺌, 앞의 '- '·'· '는 지움, UTF-8)
//   --keep       설치 파일을 새 판 포함 몇 개 남길지(기본 5 — 올리는 판 + 그보다 낮은 판 중 새 것부터, 같은 갈래만. 앱의 '이전 판으로 되돌리기'가 이 파일들을 쓴다)
//   --force      이미 올라간 판보다 낮거나 같아도 올린다(판 내리기·같은 판 다시 올리기). 판을 내리면 그보다 새 판은 거둬들인 것 —
//                내역(history)에서 빼고 설치 파일도 지운다(그 판을 쓰던 앱은 메뉴에서 이 판으로 되돌릴 수 있다)
//   --dry-run    무엇을 할지만 보여 준다(아무것도 안 씀)
//
// latest.json = { version, file, sha256, size, date, notes[], commit?, history[] } — history = 올라간 판들(이번 판 포함, 새 판 먼저, 최근 30판:
//   판·파일·sha256·크기·날짜·바뀐 점·커밋). 앱 설정 메뉴의 '업데이트 내역'과 '이전 판으로 되돌리기'(파일이 남아 있는 낮은 판)가 이것을 읽는다.
//   1차 latest.json(history 없음)을 이어받으면 그 판 하나로 내역을 시작한다.
//
// 순서(받는 PC 가 반쯤 쓴 파일을 읽지 않게):
//  1) 설치 파일 이름 꼴(WeatherCG-Setup-<판>[-installtest].exe)·크기·sha256 확인 — 옆의 .build.json(빌드 정보)이 있으면 그 값과도 같아야
//  2) 업데이트 폴더의 latest.json(있으면)보다 새 판인지(--force 없으면 낮거나 같으면 거절)
//  3) 설치 파일을 임시 이름(.WeatherCG-Setup-….exe.uploading-<pid>)으로 복사 → 복사본을 다시 읽어 크기·sha256 확인 → 진짜 이름으로 바꾸기
//  4) latest.json 을 임시 이름(.latest.json.tmp-<pid>)으로 쓰고 바꾸기(읽는 중이라 막히면 잠깐 뒤 다시)
//  5) 옛 판 설치 파일 정리(--keep), 하루 넘은 남은 임시 파일 정리
// 앱은 latest.json 만 보고 판·이름·크기·sha256 이 맞는 파일만 받으므로, 3)이 끝나기 전엔 누구도 새 파일을 받지 않는다.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const U = require('../desktop/updater.js');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const opts = (k) => args.filter((x) => x.startsWith(`--${k}=`)).map((x) => x.slice(k.length + 3));
const flag = (k) => args.includes(`--${k}`);
const log = (...a) => console.log('[publish]', ...a);
class Stop extends Error {}
const die = (m) => { throw new Stop(m); };
const mb = (n) => (Math.round(n / 1048576 * 10) / 10) + 'MB';

// 바뀐 점 — --note(여러 번) + --notes-file
function readNotes(noteArgs, notesFile) {
  const out = [];
  for (const n of noteArgs) for (const l of String(n).split(/\r?\n/)) out.push(l);
  if (notesFile) {
    const t = fs.readFileSync(notesFile, 'utf8').replace(/^\uFEFF/, '');
    for (const l of t.split(/\r?\n/)) if (!/^\s*#/.test(l)) out.push(l);
  }
  return U.cleanNotes(out.map((l) => String(l).replace(/^\s*(?:[-*·•]\s+)/, '')));
}
function sha256File(file) {
  const h = crypto.createHash('sha256');
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(1 << 20);
    let n, size = 0;
    while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) { h.update(buf.subarray(0, n)); size += n; }
    return { size, sha256: h.digest('hex') };
  } finally { fs.closeSync(fd); }
}
// 복사(진행 표시) — 끝나면 fsync
function copyWithProgress(src, dst, total, quiet) {
  const ifd = fs.openSync(src, 'r'), ofd = fs.openSync(dst, 'wx');
  try {
    const buf = Buffer.alloc(4 << 20);
    let n, got = 0, lastPct = -1;
    while ((n = fs.readSync(ifd, buf, 0, buf.length, null)) > 0) {
      let off = 0;
      while (off < n) off += fs.writeSync(ofd, buf, off, n - off);
      got += n;
      const pct = Math.floor(got / total * 100);
      if (!quiet && pct >= lastPct + 10) { lastPct = pct; log(`복사 ${pct}% (${mb(got)} / ${mb(total)})`); }
    }
    fs.fsyncSync(ofd);
    return got;
  } finally { fs.closeSync(ifd); fs.closeSync(ofd); }
}
// 이름 바꾸기 — 받는 PC 가 그 파일을 열고 있으면 잠깐 막힐 수 있어 몇 번 다시
function renameRetry(a, b, tries = 20) {
  for (let i = 0; ; i++) {
    try { fs.renameSync(a, b); return; } catch (e) {
      if (i >= tries || !/^(EPERM|EBUSY|EACCES)$/.test(e.code)) throw e;
      const t = Date.now() + 250; while (Date.now() < t) { /* 잠깐 기다림 */ }
    }
  }
}
// 업데이트 폴더 고르기 — --dir, 아니면 기본 후보 중 있는 것
function pickDir(dirArg) {
  if (dirArg) {
    const d = path.resolve(dirArg);
    if (!fs.existsSync(d) || !fs.statSync(d).isDirectory()) die('업데이트 폴더가 없습니다(만들지 않음): ' + d);
    return d;
  }
  for (const d of U.DEFAULT_DIRS) { try { if (fs.statSync(d).isDirectory()) return d; } catch (e) { /* 다음 후보 */ } }
  die('업데이트 폴더에 닿지 못했습니다: ' + U.DEFAULT_DIRS.join(' · ') + ' — 사내망(R:)을 확인하거나 --dir=<폴더>');
}
// 폴더 안 설치 파일 목록(같은 갈래만) — [{ name, version }] 새 판 먼저
function setupsIn(dir, variant) {
  return fs.readdirSync(dir).map((name) => ({ name, p: U.parseSetupName(name) }))
    .filter((x) => x.p && x.p.variant === variant).map((x) => ({ name: x.name, version: x.p.version }))
    .sort((a, b) => -U.cmpVer(a.version, b.version));
}
// 지금 latest.json 의 내역 — 앱과 같은 검사(U.validateEntry)를 통과한 항목만(맨 위 판 포함, 커밋도 이어받음, 같은 판은 처음 것).
// 1차 latest.json(history 없음)이면 그 판 하나, 깨졌거나 없으면 빈 내역
function historyOf(cur, variant) {
  if (!cur || typeof cur !== 'object' || Array.isArray(cur)) return [];
  const out = [], seen = new Set();
  for (const e of [cur, ...(Array.isArray(cur.history) ? cur.history : [])]) {
    const v = U.validateEntry(e, variant);
    if (!v.ok || seen.has(v.info.version)) continue;
    seen.add(v.info.version);
    const h = { ...v.info };
    if (typeof e.commit === 'string' && /^[0-9a-f]{7,64}$/i.test(e.commit)) h.commit = e.commit;
    out.push(h);
  }
  return out;
}

function publish() {
  const dry = flag('dry-run'), force = flag('force');
  const keep = Math.max(1, Math.floor(+opt('keep', String(U.KEEP_SETUPS))) || U.KEEP_SETUPS);
  // 1) 설치 파일
  let setup = opt('setup', '');
  if (!setup) {
    const v = JSON.parse(fs.readFileSync(path.join(ROOT, 'desktop', 'package.json'), 'utf8')).version;
    setup = path.join(ROOT, 'desktop', 'dist', U.setupName(v, ''));
  }
  setup = path.resolve(setup);
  if (!fs.existsSync(setup) || !fs.statSync(setup).isFile()) die('설치 파일이 없습니다: ' + setup);
  const file = path.basename(setup);
  const parsed = U.parseSetupName(file);
  if (!parsed) die(`설치 파일 이름이 'WeatherCG-Setup-<판>.exe' 꼴이 아닙니다: ${file}`);
  const { version, variant } = parsed;
  log(`설치 파일 ${file} — 판 ${version}${variant ? ' (설치 시험판)' : ''} · 확인값 계산 중…`);
  const src = sha256File(setup);
  if (src.size > U.MAX_SETUP_BYTES) die('설치 파일이 너무 큽니다: ' + mb(src.size));
  const bj = setup.replace(/\.exe$/i, '.build.json');
  let build = null;
  if (fs.existsSync(bj)) {
    build = JSON.parse(fs.readFileSync(bj, 'utf8'));
    if (build.setupSha256 && build.setupSha256 !== src.sha256) die(`설치 파일이 빌드 정보(${path.basename(bj)})와 다릅니다 — 다시 굽거나 맞는 파일을 고르세요`);
    if (build.setupBytes && build.setupBytes !== src.size) die(`설치 파일 크기가 빌드 정보와 다릅니다(${src.size} ≠ ${build.setupBytes})`);
    if (build.version && build.version !== version) die(`빌드 정보의 판(${build.version})이 파일 이름의 판(${version})과 다릅니다`);
  }
  const notes = readNotes(opts('note'), opt('notes-file', ''));
  if (!notes.length) log('알림: 바뀐 점이 없습니다(--note·--notes-file) — 팝업에 바뀐 점 없이 뜹니다');

  // 2) 지금 올라간 판
  const dir = pickDir(opt('dir', ''));
  const latestPath = path.join(dir, U.LATEST_NAME);
  let cur = null;
  if (fs.existsSync(latestPath)) {
    try { cur = JSON.parse(fs.readFileSync(latestPath, 'utf8').replace(/^\uFEFF/, '')); } catch (e) { if (!force) die('지금 latest.json 이 깨져 있습니다 — 확인 뒤 --force'); }
    const cv = cur && typeof cur.version === 'string' ? cur.version : '';
    const c = U.cmpVer(version, cv);
    if (c === null && cv && !force) die(`지금 latest.json 의 판(${cv})을 모릅니다 — 확인 뒤 --force`);
    if (c !== null && c <= 0 && !force) die(`이미 올라간 판(${cv})보다 새 판이 아닙니다(${version}) — 되돌리기·다시 올리기면 --force`);
    if (cur && typeof cur.file === 'string') {
      const cp = U.parseSetupName(cur.file);
      if (cp && cp.variant !== variant && !force) die(`이 폴더는 ${cp.variant ? '설치 시험판' : '정식'} 업데이트 폴더입니다 — 섞지 않습니다(--force 로만)`);
    }
    log(`지금 올라간 판: ${cv || '(모름)'}`);
  } else log('지금 올라간 판: 없음(처음 올림)');

  const entry = { version, file, sha256: src.sha256, size: src.size, date: new Date().toISOString(), notes };
  if (build && build.commit) entry.commit = String(build.commit);
  // 내역 = 이번 판 + 지금 내역에서 이번 판보다 낮은 판들(새 판 먼저, 최근 HISTORY_MAX). 이번 판보다 새 판(--force 로 판을 내림)은 거둬들인 것 — 뺀다
  const prevHist = historyOf(cur, variant);
  const retracted = prevHist.filter((h) => U.cmpVer(h.version, version) === 1).map((h) => h.version);
  const history = [entry, ...prevHist.filter((h) => U.cmpVer(h.version, version) === -1)]
    .sort((a, b) => -U.cmpVer(a.version, b.version)).slice(0, U.HISTORY_MAX);
  const latest = { ...entry, history };
  // 앱이 읽는 크기 안으로(U.MAX_JSON_BYTES — 바뀐 점이 아주 길면 오래된 내역부터 뺀다)
  while (Buffer.byteLength(JSON.stringify(latest, null, 2)) > U.MAX_JSON_BYTES - 4096 && latest.history.length > 1) latest.history.pop();
  const v = U.validateLatest(latest, variant);
  if (!v.ok) die('latest.json 이 앱 검사를 통과하지 못함: ' + v.why);
  if (v.info.history.length !== latest.history.length) die('내역(history)이 앱 검사를 통과하지 못함');
  const finalPath = path.join(dir, file);
  // 설치 파일 정리 — 이번 판 + 그보다 낮은 판 중 새 것부터 keep-1 개(되돌리기용). 거둬들인 새 판 파일은 지운다
  const olds = setupsIn(dir, variant).filter((x) => x.name !== file);
  const lower = olds.filter((x) => U.cmpVer(x.version, version) === -1);
  const keepNames = new Set([file, ...lower.slice(0, keep - 1).map((x) => x.name)]);
  const drop = olds.filter((x) => !keepNames.has(x.name)).map((x) => x.name);
  log(`내역 ${latest.history.length}판: ${latest.history.map((h) => h.version).join(', ')}${retracted.length ? ` — 거둬들인 판(이번 판보다 새 판): ${retracted.join(', ')}` : ''}`);
  if (dry) {
    log(`(시험) ${dir} 에 ${file}(${mb(src.size)}) 복사 → latest.json 판 ${version}, 지울 옛 판: ${drop.join(', ') || '없음'}`);
    return { ok: true, dry: true, dir, latest, drop };
  }

  // 3) 설치 파일 — 임시 이름으로 복사 → 확인 → 이름 바꾸기
  let reuse = false;
  if (fs.existsSync(finalPath)) {
    const ex = sha256File(finalPath);
    if (ex.sha256 === src.sha256 && ex.size === src.size) { reuse = true; log('같은 설치 파일이 이미 있습니다 — 복사하지 않음'); }
    else if (!force) die(`업데이트 폴더에 같은 이름의 다른 파일이 있습니다: ${file} — 판을 올려 다시 굽거나 --force`);
  }
  if (!reuse) {
    const tmp = path.join(dir, `.${file}.uploading-${process.pid}`);
    try {
      copyWithProgress(setup, tmp, src.size);
      const got = sha256File(tmp);
      if (got.size !== src.size || got.sha256 !== src.sha256) die('복사한 파일의 크기·확인값이 원본과 다릅니다 — 올리지 않았습니다');
      if (fs.existsSync(finalPath)) fs.rmSync(finalPath, { force: true });   // --force 로 같은 이름 다른 파일 바꾸기
      renameRetry(tmp, finalPath);
    } finally { try { fs.rmSync(tmp, { force: true }); } catch (e) { /* 이미 옮김 */ } }
    log(`설치 파일 올림: ${finalPath}`);
  }
  // 4) latest.json — 임시 이름으로 쓰고 바꾸기
  const tmpJson = path.join(dir, `.${U.LATEST_NAME}.tmp-${process.pid}`);
  try {
    const fd = fs.openSync(tmpJson, 'w');
    try { fs.writeSync(fd, JSON.stringify(latest, null, 2) + '\n'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    const back = U.validateLatest(JSON.parse(fs.readFileSync(tmpJson, 'utf8')), variant);
    if (!back.ok) die('쓴 latest.json 을 다시 읽어 보니 이상합니다: ' + back.why);
    renameRetry(tmpJson, latestPath);
  } finally { try { fs.rmSync(tmpJson, { force: true }); } catch (e) { /* 이미 옮김 */ } }
  log(`latest.json 씀 — 판 ${version}, 바뀐 점 ${notes.length}줄, 내역 ${latest.history.length}판`);
  // 5) 정리 — 설치 파일(이번 판 + 낮은 판 최근 keep-1 개만 — 위 drop), 하루 넘은 남은 임시 파일(다른 사람이 올리는 중일 수 있어 최근 것은 그대로)
  const removed = [];
  for (const name of drop) { try { fs.rmSync(path.join(dir, name), { force: true }); removed.push(name); } catch (e) { log(`옛 판을 못 지움(쓰는 중?): ${name} — ${e.code}`); } }
  const dayAgo = Date.now() - 24 * 3600 * 1000;
  for (const name of fs.readdirSync(dir)) {
    if (!/^\.(WeatherCG-Setup-.+\.exe\.uploading|latest\.json\.tmp)-\d+$/.test(name)) continue;
    try { const st = fs.statSync(path.join(dir, name)); if (st.mtimeMs < dayAgo) { fs.rmSync(path.join(dir, name), { force: true }); removed.push(name); } } catch (e) { /* 그대로 */ }
  }
  if (removed.length) log('지움: ' + removed.join(', '));
  const rbLeft = setupsIn(dir, variant).filter((x) => U.cmpVer(x.version, version) === -1).map((x) => x.version);
  log(`끝 — 앱은 켠 뒤 약 15초 뒤·3시간마다(또는 설정(렌치) 메뉴 '앱 업데이트') 새 판 ${version} 을 알립니다. 되돌리기용으로 남은 옛 판: ${rbLeft.join(', ') || '없음'}`);
  return { ok: true, dir, latest, removed };
}

if (require.main === module) {
  try { const r = publish(); console.log(JSON.stringify(r, null, 2)); }
  catch (e) { console.error('[publish] 멈춤: ' + (e instanceof Stop ? e.message : (e && e.stack) || e)); process.exit(1); }
}
module.exports = { publish, readNotes, setupsIn, historyOf };
