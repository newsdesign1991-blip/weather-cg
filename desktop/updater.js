// 앱 업데이트(메인 프로세스 전용, 2026-10-12) — 공유 폴더에 올린 새 설치 파일을 알아채고, 사용자가 [지금 설치]를 누르면 조용히 덮어 설치한다.
// 올리는 쪽은 tools/publish-update.cjs(설치 파일 + latest.json). 웹앱 팝업·설정 메뉴는 js/app-update.js, 배선은 main.js·preload.js. MODULES.md 10장 '앱 업데이트'.
//
// 흐름:
//  1) 확인(check): 업데이트 폴더(기본 R:\[F]_Util\WNS\Ver, R: 가 없으면 같은 공유 \\10.10.105.25\cg\[F]_Util\WNS\Ver)의
//     latest.json { version, file, sha256, size, date, notes[] }을 읽는다. 폴더 하나에 시간 제한(6초) — 공유 폴더가 없거나(재택·VPN 끔) 느리면 조용히 넘긴다.
//     지금 판(app.getVersion())보다 새 판이면 웹앱에 알린다(notify). 켠 뒤 15초 뒤 한 번, 그다음 3시간마다. 설정 메뉴 '업데이트 확인'은 곧바로(manual).
//     '나중에'를 고른 판은 이번 실행 동안 저절로는 다시 안 알린다(메모리에만 — 다음 실행에선 다시). 더 새 판이 올라오면 그 판은 알린다.
//  2) 설치(install): latest.json 을 다시 읽어 고른 판이 그대로인지 보고, 설치 파일을 %TEMP%\wcg-update 로 복사하며 크기·sha256 을 확인한다
//     (다르면 지우고 멈춤). 맞으면 실행 직전에 한 번 더 확인하고 설치 파일을 조용히 실행한다(INSTALL_ARGS — electron-builder 24 NSIS 템플릿이 아는 인자:
//     /S 조용히, --updated 업데이트(실행 중인 앱을 기다렸다 끄고 바로 가기를 지키고 새 판에 --updated 를 넘김), --force-run 끝나면 앱 다시 켜기 —
//     installSection.nsh doStartApp → StdUtils.ExecShellAsUser 로 '관리자 아닌 사용자'로 켬). 그리고 앱을 끈다(quitForInstall).
//     설치 위치는 설치 프로그램이 레지스트리(이전 설치 InstallLocation)에서 읽어 같은 자리에 덮어 깐다. '모든 사용자'(Program Files) 설치면
//     조용한 설치도 관리자 확인 창이 한 번 뜬다(거기서 '아니요'면 설치·다시 켜기 둘 다 안 됨 — 옛 판 그대로, 바탕화면 아이콘으로 다시 켠다).
// 지키는 것: 업데이트 폴더 밖 파일, 이름 꼴이 다른 파일(WeatherCG-Setup-<판>[-installtest].exe — 판은 latest.json version 과 같고, 정식/시험판 구분도 이 앱과 같아야),
//   크기·sha256 이 다른 파일, 바로 가기(심볼릭 링크)는 실행하지 않는다. 개발판(설치판 아님)은 설치하지 않는다(WCG_UPDATE_DRYRUN=1 이면 실행 직전까지만 — 시험).
// 매달린 공유 폴더 읽기는 libuv 스레드를 붙잡으므로(시간 제한으로 기다림만 끊긴다) 같은 폴더에 아직 안 끝난 읽기가 있으면 새로 읽지 않는다(앱 파일 읽기가 막히지 않게).
// Electron 없이 시험할 수 있게 fs·spawn·타이머·알림을 넘겨받는다(desktop/test/updater.test.cjs).
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_DIRS = ['R:\\[F]_Util\\WNS\\Ver', '\\\\10.10.105.25\\cg\\[F]_Util\\WNS\\Ver'];
const LATEST_NAME = 'latest.json';
const FIRST_DELAY_MS = 15000;              // 켠 뒤 첫 확인(부팅·첫 화면을 방해하지 않게)
const EVERY_MS = 3 * 60 * 60 * 1000;       // 그다음 3시간마다
const DIR_TIMEOUT_MS = 6000;               // 폴더 하나 확인 + latest.json 읽기
const COPY_STALL_MS = 30000;               // 복사 중 30초 동안 한 바이트도 안 오면 멈춤
const MAX_JSON_BYTES = 64 * 1024;
const MAX_SETUP_BYTES = 1024 * 1024 * 1024;
const INSTALL_ARGS = ['/S', '--updated', '--force-run'];
const TEMP_SUB = 'wcg-update';
const VARIANTS = ['', 'installtest'];      // '' = 정식, 'installtest' = 이름만 다른 설치 시험판(tools/build-installer.cjs --installtest)

// ---------- 판·이름 ----------
const VER_RE = /^(\d{1,5})\.(\d{1,5})\.(\d{1,5})$/;
function parseVer(v) { const m = VER_RE.exec(String(v == null ? '' : v).trim()); return m ? [+m[1], +m[2], +m[3]] : null; }
// a 가 b 보다 새 판이면 1, 같으면 0, 옛 판이면 -1, 판 꼴이 아니면 null
function cmpVer(a, b) {
  const x = parseVer(a), y = parseVer(b);
  if (!x || !y) return null;
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i] ? 1 : -1;
  return 0;
}
// 앱 package.json 의 name → 판 갈래(설치 시험판은 'weathercg-installtest' — tools/build-installer.cjs INSTALLTEST.name)
function variantOf(pkgName) { return /-installtest$/.test(String(pkgName || '')) ? 'installtest' : ''; }
// 설치 파일 이름 — tools/build-installer.cjs 의 ARTIFACT('WeatherCG-Setup-${version}.exe')·INSTALLTEST.artifact('…-installtest.exe')와 같게
function setupName(version, variant) { return `WeatherCG-Setup-${version}${variant ? '-' + variant : ''}.exe`; }
const SETUP_RE = /^WeatherCG-Setup-(\d{1,5}\.\d{1,5}\.\d{1,5})(?:-(installtest))?\.exe$/;
// 이름 꼴 해석 — { version, variant } 또는 null(경로 구분자·다른 이름은 null)
function parseSetupName(name) { const m = SETUP_RE.exec(String(name || '')); return m ? { version: m[1], variant: m[2] || '' } : null; }
function setupNameOk(name, version, variant) { const p = parseSetupName(name); return !!p && p.version === version && p.variant === (variant || ''); }

// ---------- latest.json ----------
// 바뀐 점 — 글자 줄 목록(문자열 하나면 줄로 나눔). 제어 문자는 빈칸, 빈 줄 빼고, 최대 30줄·줄마다 300자
function cleanNotes(n) {
  const arr = Array.isArray(n) ? n : typeof n === 'string' ? n.split(/\r?\n/) : [];
  return arr.filter((x) => typeof x === 'string')
    .map((x) => x.replace(/[\u0000-\u001f\u007f]/g, ' ').trim()).filter(Boolean).slice(0, 30)
    .map((x) => (x.length > 300 ? x.slice(0, 299) + '…' : x));
}
// 받은 latest.json 검사 → { ok: true, info } 또는 { ok: false, why }. variant = 이 앱의 판 갈래('' | 'installtest')
function validateLatest(j, variant) {
  if (!j || typeof j !== 'object' || Array.isArray(j)) return { ok: false, why: 'json' };
  const version = typeof j.version === 'string' ? j.version.trim() : '';
  if (!parseVer(version)) return { ok: false, why: 'version' };
  const file = typeof j.file === 'string' ? j.file : '';
  if (!setupNameOk(file, version, variant)) return { ok: false, why: 'file' };
  const sha256 = typeof j.sha256 === 'string' ? j.sha256.trim().toLowerCase() : '';
  if (!/^[0-9a-f]{64}$/.test(sha256)) return { ok: false, why: 'sha256' };
  const size = j.size;
  if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_SETUP_BYTES) return { ok: false, why: 'size' };
  const date = typeof j.date === 'string' ? j.date.trim().slice(0, 40) : '';
  return { ok: true, info: { version, file, sha256, size, date, notes: cleanNotes(j.notes) } };
}

// p 가 ms 안에 안 끝나면 code 'ETIMEOUT' 으로 거절(뒤에 끝나는 p 는 버림)
function withTimeout(p, ms) {
  let t = null;
  return Promise.race([
    Promise.resolve(p).finally(() => clearTimeout(t)),
    new Promise((_, rej) => { t = setTimeout(() => rej(Object.assign(new Error('timeout'), { code: 'ETIMEOUT' })), ms); }),
  ]);
}

// 폴더 하나에서 latest.json 읽기 → { ok: true, info, dir } | { ok: false, err: 'unreachable'|'timeout'|'none'|'bad', why?, code? }
//  unreachable = 폴더에 못 닿음(없는 드라이브·사내망 밖·권한), timeout = 시간 안에 답 없음(느린 공유), none = 폴더는 있는데 latest.json 없음(아직 안 올림),
//  bad = latest.json 이 깨졌거나 이 앱 것이 아님. o: { fsp, timeoutMs, variant, stuck(Set — 아직 안 끝난 읽기가 있는 폴더) }
async function readLatest(dir, o = {}) {
  const fsp = o.fsp || fs.promises;
  const stuck = o.stuck || null;
  const key = String(dir).toLowerCase();
  if (stuck && stuck.has(key)) return { ok: false, err: 'timeout', why: 'still-waiting' };   // 지난번 읽기가 아직 매달려 있다 — 쌓지 않는다
  const file = path.join(dir, LATEST_NAME);
  const job = (async () => {
    let st;
    try { st = await fsp.stat(dir); } catch (e) { return { ok: false, err: 'unreachable', code: e && e.code }; }
    if (!st.isDirectory()) return { ok: false, err: 'unreachable', code: 'ENOTDIR' };
    let fst;
    try { fst = await fsp.stat(file); } catch (e) { return { ok: false, err: e && e.code === 'ENOENT' ? 'none' : 'unreachable', code: e && e.code }; }
    if (!fst.isFile() || fst.size > MAX_JSON_BYTES) return { ok: false, err: 'bad', why: 'json-size' };
    let txt;
    try { txt = await fsp.readFile(file, 'utf8'); } catch (e) { return { ok: false, err: e && e.code === 'ENOENT' ? 'none' : 'unreachable', code: e && e.code }; }
    let j;
    try { j = JSON.parse(String(txt).replace(/^\uFEFF/, '')); } catch (e) { return { ok: false, err: 'bad', why: 'json' }; }
    const v = validateLatest(j, o.variant || '');
    return v.ok ? { ok: true, info: v.info, dir } : { ok: false, err: 'bad', why: v.why };
  })();
  if (stuck) { stuck.add(key); job.finally(() => stuck.delete(key)).catch(() => {}); }
  try { return await withTimeout(job, o.timeoutMs || DIR_TIMEOUT_MS); } catch (e) { return { ok: false, err: e && e.code === 'ETIMEOUT' ? 'timeout' : 'unreachable', code: e && e.code }; }
}
// 폴더 후보를 차례로 — 닿은 폴더가 답을 정한다(none·bad 도 그 폴더의 답). 다 못 닿으면 마지막 까닭(시간 초과가 있었으면 timeout)
async function readLatestAny(dirs, o = {}) {
  let last = { ok: false, err: 'unreachable' }, slow = false;
  for (const d of dirs) {
    const r = await readLatest(d, o);
    if (r.ok || r.err === 'none' || r.err === 'bad') return r;
    if (r.err === 'timeout') slow = true;
    last = r;
  }
  return slow ? { ...last, err: 'timeout' } : last;
}

// ---------- 복사·확인 ----------
// src → dest 복사(먼저 dest + '.partial' 에 쓰고, 크기·sha256 이 맞을 때만 dest 로 이름 바꿈). 어긋나면 .partial 을 지운다.
// o: { size, sha256, onProgress(got, total), signal(AbortSignal), stallMs } → { ok: true, file } | { ok: false, err: 'size'|'sha'|'copy'|'write'|'timeout'|'cancelled', code? }
function copyVerified(src, dest, o) {
  return new Promise((resolve) => {
    const part = dest + '.partial';
    const hash = crypto.createHash('sha256');
    let got = 0, done = false, lastTick = 0, stallT = null, wsClosed = false;
    let rs = null, ws = null;
    const rmPart = (r) => fs.rm(part, { force: true }, () => resolve(r));
    const fail = (r) => {
      if (done) return; done = true;
      clearTimeout(stallT);
      if (o.signal) o.signal.removeEventListener('abort', onAbort);
      try { if (rs) rs.destroy(); } catch (e) { /* 이미 닫힘 */ }
      if (!ws || wsClosed) { rmPart(r); return; }
      ws.once('close', () => rmPart(r));   // 파일을 닫은 뒤에 지운다(윈도는 열린 파일을 못 지움)
      try { ws.destroy(); } catch (e) { rmPart(r); }
    };
    const arm = () => { clearTimeout(stallT); stallT = setTimeout(() => fail({ ok: false, err: 'timeout' }), o.stallMs || COPY_STALL_MS); };
    const onAbort = () => fail({ ok: false, err: 'cancelled' });
    if (o.signal) { if (o.signal.aborted) { onAbort(); return; } o.signal.addEventListener('abort', onAbort); }
    try { fs.rmSync(part, { force: true }); } catch (e) { /* 남은 조각 — 쓰기에서 다시 실패하면 그때 알림 */ }
    rs = fs.createReadStream(src, { highWaterMark: 1 << 20 });
    ws = fs.createWriteStream(part);
    ws.on('close', () => { wsClosed = true; });
    arm();
    rs.on('data', (b) => {
      if (done) return;
      got += b.length;
      if (got > o.size) { fail({ ok: false, err: 'size', got }); return; }
      hash.update(b);
      arm();
      const now = Date.now();
      if (o.onProgress && (now - lastTick >= 150 || got === o.size)) { lastTick = now; try { o.onProgress(got, o.size); } catch (e) { /* 알림 실패는 무시 */ } }
    });
    rs.on('error', (e) => fail({ ok: false, err: 'copy', code: e && e.code }));
    ws.on('error', (e) => fail({ ok: false, err: 'write', code: e && e.code }));
    ws.on('finish', () => {
      ws.once('close', () => {
        if (done) return;
        if (got !== o.size) { fail({ ok: false, err: 'size', got }); return; }
        if (hash.digest('hex') !== o.sha256) { fail({ ok: false, err: 'sha' }); return; }
        done = true; clearTimeout(stallT);
        if (o.signal) o.signal.removeEventListener('abort', onAbort);
        try { fs.rmSync(dest, { force: true }); fs.renameSync(part, dest); } catch (e) { rmPart({ ok: false, err: 'write', code: e && e.code }); return; }
        resolve({ ok: true, file: dest });
      });
    });
    rs.pipe(ws);
  });
}
// 파일 전체 sha256 + 크기 → { size, sha256 } (못 읽으면 던짐)
function hashFile(file) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    let n = 0;
    fs.createReadStream(file, { highWaterMark: 1 << 20 }).on('data', (b) => { n += b.length; h.update(b); }).on('error', reject).on('end', () => resolve({ size: n, sha256: h.digest('hex') }));
  });
}
// 임시 폴더의 지난 설치 파일·조각 지우기(이름 꼴이 맞는 것만 — 다른 파일은 안 건드림). 실행 중이라 못 지우면 다음에
function cleanTemp(tdir) {
  let names = [];
  try { names = fs.readdirSync(tdir); } catch (e) { return 0; }
  let n = 0;
  for (const name of names) {
    const base = name.endsWith('.partial') ? name.slice(0, -8) : name;
    if (!parseSetupName(base)) continue;
    try { fs.rmSync(path.join(tdir, name), { force: true }); n++; } catch (e) { /* 실행 중 */ }
  }
  return n;
}
// 업데이트 폴더의 설치 파일 → 임시 폴더로 복사·확인. o: { dir, info, tempRoot, onProgress, signal, fsp, timeoutMs }
async function prepareInstall(o) {
  const fsp = o.fsp || fs.promises;
  const { dir, info } = o;
  // latest.json 의 file 은 이미 이름 꼴 검사를 거쳤다(경로 구분자 없음) — 그래도 폴더 밖을 가리키지 않는지 한 번 더
  const src = path.join(dir, info.file);
  if (path.basename(info.file) !== info.file || path.resolve(path.dirname(src)).toLowerCase() !== path.resolve(dir).toLowerCase()) return { ok: false, err: 'path' };
  let st;
  try { st = await withTimeout(fsp.lstat(src), o.timeoutMs || DIR_TIMEOUT_MS); } catch (e) {
    return { ok: false, err: e && e.code === 'ENOENT' ? 'missing' : e && e.code === 'ETIMEOUT' ? 'timeout' : 'unreachable', code: e && e.code };
  }
  if (st.isSymbolicLink() || !st.isFile()) return { ok: false, err: 'path' };
  if (st.size !== info.size) return { ok: false, err: 'size', got: st.size };
  const tdir = path.join(o.tempRoot, TEMP_SUB);
  try { fs.mkdirSync(tdir, { recursive: true }); } catch (e) { return { ok: false, err: 'write', code: e && e.code }; }
  cleanTemp(tdir);
  return copyVerified(src, path.join(tdir, info.file), { size: info.size, sha256: info.sha256, onProgress: o.onProgress, signal: o.signal, stallMs: o.stallMs });
}
// 임시 폴더의 확인한 설치 파일을 조용히 실행. 실행 직전에 자리·이름·크기·sha256 을 다시 본다.
// o: { tempRoot, info, variant, spawn } → { ok: true } | { ok: false, err: 'path'|'sha'|'size'|'spawn', code? }
async function runInstaller(file, o) {
  const tdir = path.resolve(o.tempRoot, TEMP_SUB);
  if (path.resolve(path.dirname(file)).toLowerCase() !== tdir.toLowerCase()) return { ok: false, err: 'path' };
  if (!setupNameOk(path.basename(file), o.info.version, o.variant)) return { ok: false, err: 'path' };
  let h;
  try { h = await hashFile(file); } catch (e) { return { ok: false, err: 'copy', code: e && e.code }; }
  if (h.size !== o.info.size) return { ok: false, err: 'size', got: h.size };
  if (h.sha256 !== o.info.sha256) return { ok: false, err: 'sha' };
  const spawn = o.spawn || require('child_process').spawn;
  return new Promise((resolve) => {
    let child;
    try { child = spawn(file, INSTALL_ARGS.slice(), { detached: true, stdio: 'ignore', windowsHide: false }); } catch (e) { resolve({ ok: false, err: 'spawn', code: e && e.code }); return; }
    let settled = false;
    const end = (r) => { if (settled) return; settled = true; resolve(r); };
    child.once('error', (e) => end({ ok: false, err: 'spawn', code: e && e.code }));
    child.once('spawn', () => { try { child.unref(); } catch (e) { /* 이미 떨어짐 */ } end({ ok: true, pid: child.pid }); });
  });
}

// ---------- 업데이트 관리자 ----------
// o: { current(지금 판), variant, packaged(설치판인가), testMode(WCG_TEST), env, dirs?, tempRoot, notify(info), quitForInstall(), log?,
//      spawn?, fsp?, setTimer?, clearTimer?, firstDelayMs?, everyMs?, timeoutMs? }
function createUpdater(o) {
  const env = o.env || process.env;
  const setT = o.setTimer || setTimeout, clrT = o.clearTimer || clearTimeout;
  const log = o.log || (() => {});
  const dirOverride = String(env.WCG_UPDATE_DIR || '').trim();
  const dirs = dirOverride ? [path.resolve(dirOverride)] : (o.dirs || DEFAULT_DIRS).slice();
  // 저절로 확인: 설치판(점검 모드 아님)만. 시험 폴더(WCG_UPDATE_DIR)를 주면 개발판·점검 모드에서도
  const auto = !!dirOverride || (!!o.packaged && !o.testMode);
  const dry = env.WCG_UPDATE_DRYRUN === '1';
  const variant = VARIANTS.includes(o.variant) ? o.variant : '';
  const current = String(o.current || '');
  const ms = (v, d, max) => { const n = Math.floor(+v); return Number.isFinite(n) && n >= 0 && n <= max ? n : d; };
  const firstDelay = dirOverride ? ms(env.WCG_UPDATE_FIRST_MS, o.firstDelayMs != null ? o.firstDelayMs : FIRST_DELAY_MS, 600000) : (o.firstDelayMs != null ? o.firstDelayMs : FIRST_DELAY_MS);
  const every = o.everyMs || EVERY_MS;
  const stuck = new Set();
  let later = '';            // '나중에'를 고른 판(이번 실행만)
  let lastAvail = null;      // 마지막으로 찾은 새 판 — 웹앱이 다시 뜨면(새로고침) 다시 건넨다(pending)
  let checking = null;       // 진행 중 확인(하나만 — 겹쳐 누르면 같은 답)
  let installing = false, launched = false, abortCtl = null;
  let timer = null, stopped = false, cleaned = false;

  const pub = (info) => ({ version: info.version, current, file: info.file, size: info.size, date: info.date, notes: info.notes.slice() });
  const read = () => readLatestAny(dirs, { fsp: o.fsp, timeoutMs: o.timeoutMs, variant, stuck });

  // 확인 → { state: 'available'|'latest'|'none'|'unreachable'|'bad', current, folder, ...(available 이면 판 정보), why? }
  function check(manual) {
    if (!checking) {
      checking = (async () => {
        const r = await read();
        if (!cleaned && o.tempRoot) { cleaned = true; try { cleanTemp(path.join(o.tempRoot, TEMP_SUB)); } catch (e) { /* 다음에 */ } }   // 지난 업데이트가 남긴 설치 파일 사본
        const base = { current, folder: dirs[0] };
        if (!r.ok) {
          const state = r.err === 'none' ? 'none' : r.err === 'bad' ? 'bad' : 'unreachable';
          log(`확인: ${state}${r.why ? ' (' + r.why + ')' : ''}${r.code ? ' ' + r.code : ''}`);
          return { ...base, state, why: r.why || r.err };
        }
        const newer = cmpVer(r.info.version, current) === 1;
        log(`확인: ${newer ? '새 판 ' + r.info.version : '최신(' + r.info.version + ')'}`);
        return newer ? { ...base, state: 'available', ...pub(r.info) } : { ...base, state: 'latest', version: r.info.version };
      })().finally(() => { checking = null; });
    }
    return checking.then((res) => {
      if (res.state === 'available') lastAvail = res;
      else if (res.state === 'latest' || res.state === 'none') lastAvail = null;   // 내려간 판(되돌리기) — 더는 알리지 않음
      if (!manual && res.state === 'available' && res.version !== later && !launched) { try { o.notify(res); } catch (e) { /* 창 없음 */ } }
      return res;
    });
  }
  function laterFor(version) { if (parseVer(version)) later = String(version); return { ok: true, later }; }
  // 설치 — 고른 판(version)을 받아 확인·복사 → 실행 → 앱 끄기. 돌려주는 것: { ok: true, dry? } | { ok: false, err, … }
  async function install(version, onProgress) {
    if (installing || launched) return { ok: false, err: 'busy' };
    if (!o.packaged && !dry) return { ok: false, err: 'dev' };
    installing = true;
    try {
      const r = await read();
      if (!r.ok) return { ok: false, err: r.err === 'none' ? 'changed' : r.err === 'timeout' ? 'unreachable' : r.err, why: r.why };
      if (r.info.version !== String(version || '')) return { ok: false, err: 'changed', version: r.info.version };
      if (cmpVer(r.info.version, current) !== 1) return { ok: false, err: 'not-newer', version: r.info.version };
      abortCtl = new AbortController();
      const c = await prepareInstall({ dir: r.dir, info: r.info, tempRoot: o.tempRoot, onProgress, signal: abortCtl.signal, fsp: o.fsp, timeoutMs: o.timeoutMs });
      abortCtl = null;
      if (!c.ok) { log(`설치 파일 받기 실패: ${c.err}${c.code ? ' ' + c.code : ''}`); return c; }
      if (dry) { log('시험(WCG_UPDATE_DRYRUN) — 실행하지 않음: ' + c.file); return { ok: true, dry: true, version: r.info.version }; }
      const s = await runInstaller(c.file, { tempRoot: o.tempRoot, info: r.info, variant, spawn: o.spawn });
      if (!s.ok) { log(`설치 프로그램 실행 실패: ${s.err}${s.code ? ' ' + s.code : ''}`); return s; }
      launched = true;
      log(`설치 프로그램 실행(${INSTALL_ARGS.join(' ')}) — 앱을 끈다`);
      setT(() => { try { o.quitForInstall(); } catch (e) { /* 이미 꺼지는 중 */ } }, 400);   // 웹앱이 답을 받아 안내를 띄울 틈
      return { ok: true, version: r.info.version };
    } finally { installing = false; abortCtl = null; }
  }
  function cancel() { if (abortCtl) { abortCtl.abort(); return true; } return false; }
  function schedule(delay) {
    if (stopped) return;
    timer = setT(() => { timer = null; check(false).catch(() => {}).finally(() => schedule(every)); }, delay);
  }
  return {
    auto, dirs, variant, current,
    start() { if (auto && !timer && !stopped) schedule(firstDelay); return auto; },
    stop() { stopped = true; if (timer) { clrT(timer); timer = null; } cancel(); },
    check: (manual) => check(!!manual),
    later: laterFor,
    // 웹앱이 (다시) 뜰 때 건넬 알림 — 찾은 새 판이 있고 '나중에'를 안 골랐으면 그 판, 아니면 null(main.js did-finish-load)
    pending: () => (lastAvail && lastAvail.version !== later && !launched ? lastAvail : null),
    install, cancel,
    state: () => ({ later, installing, launched, checking: !!checking }),
  };
}

module.exports = {
  DEFAULT_DIRS, LATEST_NAME, INSTALL_ARGS, TEMP_SUB, FIRST_DELAY_MS, EVERY_MS, DIR_TIMEOUT_MS, MAX_JSON_BYTES, MAX_SETUP_BYTES,
  parseVer, cmpVer, variantOf, setupName, parseSetupName, setupNameOk, cleanNotes, validateLatest, withTimeout,
  readLatest, readLatestAny, copyVerified, hashFile, cleanTemp, prepareInstall, runInstaller, createUpdater,
};
