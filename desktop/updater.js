// 앱 업데이트(메인 프로세스 전용, 2026-10-12) — 공유 폴더에 올린 새 설치 파일을 알아채고, 사용자가 [지금 설치]를 누르면 조용히 덮어 설치한다.
// 올리는 쪽은 tools/publish-update.cjs(설치 파일 + latest.json). 웹앱 팝업·설정 메뉴는 js/app-update.js, 배선은 main.js·preload.js. MODULES.md 10장 '앱 업데이트'.
//
// 흐름:
//  1) 확인(check): 업데이트 폴더(기본 R:\[F]_Util\WNS\Ver, R: 가 없으면 같은 공유 \\10.10.105.25\cg\[F]_Util\WNS\Ver)의
//     latest.json { version, file, sha256, size, date, notes[] }을 읽는다. 폴더 하나에 시간 제한(6초) — 공유 폴더가 없거나(재택·VPN 끔) 느리면 조용히 넘긴다.
//     지금 판(app.getVersion())보다 새 판이면 웹앱에 알린다(notify). 켠 뒤 15초 뒤 한 번, 그다음 3시간마다. 설정(렌치) 메뉴 '앱 업데이트'(열 때·[다시 확인])는 곧바로(manual).
//     '나중에'를 고른 판은 이번 실행 동안 저절로는 다시 안 알린다(메모리에만 — 다음 실행에선 다시). 더 새 판이 올라오면 그 판은 알린다.
//  2) 설치(install): latest.json 을 다시 읽어 고른 판이 그대로인지 보고, 설치 파일을 %TEMP%\wcg-update 로 복사하며 크기·sha256 을 확인한다
//     (다르면 지우고 멈춤). 맞으면 실행 직전에 한 번 더 확인하고 설치 파일을 조용히 실행한다(INSTALL_ARGS — electron-builder 24 NSIS 템플릿이 아는 인자:
//     /S 조용히, --updated 업데이트(실행 중인 앱을 기다렸다 끄고 바로 가기를 지키고 새 판에 --updated 를 넘김), --force-run 끝나면 앱 다시 켜기 —
//     installSection.nsh doStartApp → StdUtils.ExecShellAsUser 로 '관리자 아닌 사용자'로 켬). 그리고 앱을 끈다(quitForInstall).
//     설치 위치는 설치 프로그램이 레지스트리(이전 설치 InstallLocation)에서 읽어 같은 자리에 덮어 깐다. '모든 사용자'(Program Files) 설치면
//     조용한 설치도 관리자 확인 창이 한 번 뜬다(거기서 '아니요'면 설치·다시 켜기 둘 다 안 됨 — 옛 판 그대로, 바탕화면 아이콘으로 다시 켠다).
//  3) 이전 판으로 되돌리기(install(판, 진행, { rollback: true }) — 10-12): latest.json 의 history(올라간 판들 — tools/publish-update.cjs 가 쌓음) 중
//     지금 판보다 낮은 판을 같은 길(복사·sha256 확인·실행 직전 다시 확인·조용히 덮어 설치·다시 켜기)로 깐다. electron-builder 24 NSIS 는 판을 비교하지 않아
//     낮은 판도 같은 자리에 덮어 깐다(옛 판 지우기 = 작업·설정은 남김). 확인(check)은 내역과, 그중 설치 파일이 폴더에 실제로 남아 있는 판(rollback)을 함께 돌려준다.
//  4) 업데이트 진행 창(10-13 — 사용자 '업데이트 중간에 아무것도 안 떠서 갑자기 꺼진 느낌'): 받기·확인이 끝나면 설치판에 든 작은 창 프로그램
//     (desktop\helper\WeatherCG-Update.exe — desktop/update-ui/, 빌드 tools/build-update-ui.cjs)을 %TEMP%\wcg-update 로 복사해 띄우고(startUi),
//     그 창이 떴다는 알림 파일(--ready)을 본 뒤에 앱을 끈다. 그다음은 창이 맡는다: 앱이 다 닫히길 기다림 → 설치 파일 크기·sha256 다시 확인 →
//     설치 파일 /S --updated 실행·끝날 때까지(막대·지난 시간) → 깔린 exe 판 확인 → 새 판을 직접 켜고 그 창이 보일 때까지(--force-run 은 안 씀 — 두 번 안 켜지게).
//     창 프로그램이 없거나(개발판·옛 설치판) 못 띄우면(실행 실패·15초 안에 안 뜸) 예전처럼 조용한 설치(/S --updated --force-run) — 그때는 앱이 1.5초 뒤 꺼진다
//     (웹앱이 '곧 앱이 닫히고 새 판이 켜져요'를 보일 틈). 시간 안에 안 뜬 창은 PID 로 끄고, 끄지도 못하면 설치를 두 번 돌리지 않게 멈춘다(ui-stuck).
// 지키는 것: 업데이트 폴더 밖 파일, 이름 꼴이 다른 파일(WeatherCG-Setup-<판>[-installtest].exe — 판은 latest.json(또는 그 내역 항목) version 과 같고, 정식/시험판 구분도 이 앱과 같아야),
//   크기·sha256 이 다른 파일, 바로 가기(심볼릭 링크)는 실행하지 않는다. 개발판(설치판 아님)은 설치하지 않는다(WCG_UPDATE_DRYRUN=1 이면 실행 직전까지만 — 시험).
// 점검 모드(WCG_TEST)는 시험 폴더(WCG_UPDATE_DIR)가 없으면 공유 폴더를 읽지 않는다(자동 점검이 사내망에 기대지 않게 — 확인 = unreachable 'test-mode').
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
const MAX_JSON_BYTES = 256 * 1024;         // latest.json — 내역(history)을 담으니 넉넉히(1차는 64KB)
const MAX_SETUP_BYTES = 1024 * 1024 * 1024;
const HISTORY_MAX = 30;                    // 내역은 최근 30판까지(올리기 도구도 이만큼만 쌓는다)
const KEEP_SETUPS = 5;                     // 올리기 도구가 남기는 설치 파일 수(지금 판 포함 — 되돌리기용, 1차는 3)
const INSTALL_ARGS = ['/S', '--updated', '--force-run'];   // 진행 창이 없을 때(조용한 설치) — 진행 창은 '/S --updated' 로 돌리고 새 판은 스스로 켠다
const TEMP_SUB = 'wcg-update';
const UI_EXE = 'WeatherCG-Update.exe';    // 진행 창 — tools/build-update-ui.cjs UI_EXE 와 같게
const UI_LOG = 'update-ui.log';           // 진행 창 기록(임시 폴더 — 마지막 한 번만 남김, 문제를 볼 때)
const UI_FONTS = 'ui-fonts';              // 진행 창이 글꼴을 푸는 곳(임시 폴더)
const UI_READY_MS = 15000;                // 진행 창이 떴다고 알릴 때까지(처음 실행·보안 검사로 느린 PC 넉넉히)
const UI_QUIT_MS = 600;                   // 진행 창이 뜬 뒤 앱 끄기(웹앱이 '설치를 시작했어요'를 그릴 틈 — 창은 이미 위에 떠 있다)
const FALLBACK_QUIT_MS = 1500;            // 조용한 설치(진행 창 없음)일 때 앱 끄기 — 웹앱 '곧 앱이 닫히고 새 판이 켜져요'를 읽을 틈
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
// 판 하나(latest.json 맨 위 또는 내역 항목) 검사 → { ok: true, info: { version, file, sha256, size, date, notes } } 또는 { ok: false, why }
function validateEntry(j, variant) {
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
// 받은 latest.json 검사 → { ok: true, info } 또는 { ok: false, why }. variant = 이 앱의 판 갈래('' | 'installtest')
// info.history = 올라간 판들(새 판 먼저, 맨 위 판 포함, 최대 HISTORY_MAX). 내역 항목은 하나하나 같은 검사 — 틀린 항목은 조용히 뺀다(맨 위 판은 그대로 받음).
// 맨 위 판보다 새 판(담당자가 --force 로 판을 내림)은 거둬들인 판이라 뺀다. 같은 판이 둘이면 맨 위 것이 이긴다.
function validateLatest(j, variant) {
  const v = validateEntry(j, variant);
  if (!v.ok) return v;
  const head = v.info;
  const seen = new Set([head.version]);
  const hist = [head];
  if (Array.isArray(j.history)) {
    for (const e of j.history.slice(0, 200)) {
      const h = validateEntry(e, variant);
      if (!h.ok || seen.has(h.info.version) || cmpVer(h.info.version, head.version) === 1) continue;
      seen.add(h.info.version); hist.push(h.info);
    }
  }
  hist.sort((a, b) => -cmpVer(a.version, b.version));
  return { ok: true, info: { ...head, history: hist.slice(0, HISTORY_MAX) } };
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
// 임시 폴더의 지난 설치 파일·조각·진행 창 사본·알림 파일·글꼴 지우기(이름 꼴이 맞는 것만 — 다른 파일은 안 건드림, 진행 창 기록은 남김). 실행 중이라 못 지우면 다음에
const UI_LEFT_RE = /^(WeatherCG-Update(-\d+-\d+)?\.exe|ui-\d+-\d+\.ready(\.tmp)?)$/;
function cleanTemp(tdir) {
  let names = [];
  try { names = fs.readdirSync(tdir); } catch (e) { return 0; }
  let n = 0;
  for (const name of names) {
    const base = name.endsWith('.partial') ? name.slice(0, -8) : name;
    if (name === UI_FONTS) { try { fs.rmSync(path.join(tdir, name), { recursive: true, force: true }); n++; } catch (e) { /* 진행 창이 아직 씀 */ } continue; }
    if (!parseSetupName(base) && !UI_LEFT_RE.test(name)) continue;
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
// 되돌릴 수 있는 판 — 내역 중 지금 판보다 낮고, 그 설치 파일이 업데이트 폴더에 실제로 남아 있는(보통 파일·바로 가기 아님·크기 같음) 판들(새 판 먼저).
// 올리기 도구는 설치 파일을 최근 몇 개만 남기므로 내역이 있어도 파일이 없을 수 있다. sha256 은 받을 때 본다(여기선 크기만 — 공유 폴더에서 전부 읽지 않게).
// 시간 제한에 걸리면 거기서 멈춘다(느린 공유 폴더에 매달리지 않게). o: { fsp, timeoutMs }
async function rollbackable(dir, history, current, o = {}) {
  const fsp = o.fsp || fs.promises;
  const out = [];
  for (const h of history || []) {
    if (cmpVer(h.version, current) !== -1 || path.basename(h.file) !== h.file) continue;
    let st;
    try { st = await withTimeout(fsp.lstat(path.join(dir, h.file)), o.timeoutMs || DIR_TIMEOUT_MS); } catch (e) {
      if (e && e.code === 'ETIMEOUT') break;
      continue;   // 없음 — 정리된 옛 판
    }
    if (st.isFile() && !st.isSymbolicLink() && st.size === h.size) out.push(h.version);
  }
  return out;
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
    // 작업 폴더 = 임시 폴더(앱의 작업 폴더 = 설치 폴더를 잡고 있지 않게 — 옛 판 지우기가 그 폴더를 비울 수 있게)
    try { child = spawn(file, INSTALL_ARGS.slice(), { detached: true, stdio: 'ignore', windowsHide: false, cwd: tdir }); } catch (e) { resolve({ ok: false, err: 'spawn', code: e && e.code }); return; }
    let settled = false;
    const end = (r) => { if (settled) return; settled = true; resolve(r); };
    child.once('error', (e) => end({ ok: false, err: 'spawn', code: e && e.code }));
    child.once('spawn', () => { try { child.unref(); } catch (e) { /* 이미 떨어짐 */ } end({ ok: true, pid: child.pid }); });
  });
}

// ---------- 업데이트 진행 창(10-13) ----------
// 진행 창 인자(순수 — desktop/update-ui/UpdateApp.cs Opts 와 같은 이름). o = { pid, app, product, from, to, rollback, setup, sha256, size, ready, log, fontsDir, shots? }
function uiArgs(o) {
  const a = [`--pid=${o.pid}`, `--app=${o.app}`, `--product=${o.product}`, `--from=${o.from}`, `--to=${o.to}`];
  if (o.rollback) a.push('--rollback');
  a.push(`--setup=${o.setup}`, `--sha256=${o.sha256}`, `--size=${o.size}`, `--ready=${o.ready}`, `--log=${o.log}`, `--fonts-dir=${o.fontsDir}`);
  if (o.shots) a.push(`--shots=${o.shots}`);   // 시험 캡처(WCG_UPDATE_UI_SHOTS)
  return a;
}
// 진행 창 exe 찾기 — 후보 중 처음으로 있는 보통 파일(바로 가기·폴더·빈 파일 아님), 없으면 null
function findUiExe(cands, o = {}) {
  const lstat = o.lstatSync || fs.lstatSync;
  for (const c of [].concat(cands || [])) {
    if (!c) continue;
    try { const st = lstat(c); if (st.isFile() && !st.isSymbolicLink() && st.size > 0) return c; } catch (e) { /* 없음 */ }
  }
  return null;
}
// src → dest 복사 후 크기가 같은지(다르면 지우고 던짐)
function copySame(src, dest) {
  fs.copyFileSync(src, dest);
  if (fs.statSync(dest).size !== fs.statSync(src).size) { try { fs.rmSync(dest, { force: true }); } catch (e) { /* 다음 정리 */ } throw Object.assign(new Error('size'), { code: 'ESIZE' }); }
}
// 진행 창 띄우기 — exe 를 임시 폴더로 복사(설치 폴더 밖 — 설치 프로그램이 그 폴더를 바꿀 수 있게) → 떨어뜨려 실행 → '창이 떴다' 알림 파일을 기다린다.
// o: { exe, tempRoot, args(uiArgs 의 ready·log·fontsDir 뺀 것), spawn?, readyMs?, sleep? } → { ok: true, pid, ms } | { ok: false, err: 'write'|'copy'|'spawn'|'ui-exit'|'ui-timeout'|'ui-stuck', code? }
//  시간 안에 안 뜬 창은 끈다(뒤늦게 떠서 혼자 설치를 시작하지 않게) — 끄지도 못했으면 ui-stuck(부르는 쪽은 조용한 설치로 넘어가지 않는다 — 설치가 두 번 돌 수 있음)
async function startUi(o) {
  const tdir = path.join(o.tempRoot, TEMP_SUB);
  try { fs.mkdirSync(tdir, { recursive: true }); } catch (e) { return { ok: false, err: 'write', code: e && e.code }; }
  let dest = path.join(tdir, UI_EXE);
  try { copySame(o.exe, dest); } catch (e) {
    dest = path.join(tdir, `WeatherCG-Update-${process.pid}-${Date.now()}.exe`);   // 지난 진행 창이 아직 떠 있어 잠김(문제 화면을 안 닫음)
    try { copySame(o.exe, dest); } catch (e2) { return { ok: false, err: 'copy', code: e2 && e2.code }; }
  }
  const ready = path.join(tdir, `ui-${process.pid}-${Date.now()}.ready`);
  const logFile = path.join(tdir, UI_LOG);
  try { fs.rmSync(ready, { force: true }); fs.rmSync(logFile, { force: true }); } catch (e) { /* 지난 창이 아직 씀 — 이어 씀 */ }
  const argv = uiArgs({ ...o.args, ready, log: logFile, fontsDir: path.join(tdir, UI_FONTS) });
  const spawn = o.spawn || require('child_process').spawn;
  const sleep = o.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  let child;
  try { child = spawn(dest, argv, { detached: true, stdio: 'ignore', windowsHide: false, cwd: tdir }); } catch (e) { return { ok: false, err: 'spawn', code: e && e.code }; }
  let exited = null, spawnErr = null;
  child.once('error', (e) => { spawnErr = e || new Error('spawn'); });
  child.once('exit', (c) => { exited = c == null ? -1 : c; });
  const t0 = Date.now(), limit = o.readyMs || UI_READY_MS;
  while (Date.now() - t0 < limit) {
    if (spawnErr) return { ok: false, err: 'spawn', code: spawnErr.code };
    if (fs.existsSync(ready)) {
      try { child.unref(); } catch (e) { /* 이미 떨어짐 */ }
      try { fs.rmSync(ready, { force: true }); } catch (e) { /* 다음 정리 */ }
      return { ok: true, pid: child.pid, ms: Date.now() - t0 };
    }
    if (exited !== null) return { ok: false, err: 'ui-exit', code: exited };
    await sleep(100);
  }
  try { child.kill(); } catch (e) { /* 이미 꺼짐 */ }   // 띄운 그 창만(PID)
  for (let i = 0; i < 30 && exited === null; i++) await sleep(100);
  try { child.unref(); } catch (e) { /* 이미 떨어짐 */ }
  return { ok: false, err: exited !== null ? 'ui-timeout' : 'ui-stuck' };
}

// ---------- 업데이트 관리자 ----------
// o: { current(지금 판), variant, packaged(설치판인가), testMode(WCG_TEST), env, dirs?, tempRoot, notify(info), quitForInstall(), log?,
//      releaseClose?(설치를 넘긴 순간 — 닫기 전 묻기 풀기: 설치 프로그램이 앱을 닫아도 다시 묻지 않게),
//      uiExe?(진행 창 exe 후보 — 경로·목록·함수), appExe?·pid?·product?(진행 창에 넘김 — 기본 process.execPath·process.pid·'날씨 CG'), uiReadyMs?,
//      spawn?, fsp?, setTimer?, clearTimer?, firstDelayMs?, everyMs?, timeoutMs? }
function createUpdater(o) {
  const env = o.env || process.env;
  const setT = o.setTimer || setTimeout, clrT = o.clearTimer || clearTimeout;
  const log = o.log || (() => {});
  const dirOverride = String(env.WCG_UPDATE_DIR || '').trim();
  const dirs = dirOverride ? [path.resolve(dirOverride)] : (o.dirs || DEFAULT_DIRS).slice();
  // 저절로 확인: 설치판(점검 모드 아님)만. 시험 폴더(WCG_UPDATE_DIR)를 주면 개발판·점검 모드에서도
  const auto = !!dirOverride || (!!o.packaged && !o.testMode);
  const offline = !dirOverride && !!o.testMode;   // 점검 모드 + 시험 폴더 없음 = 공유 폴더를 읽지 않음
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

  // 확인 → { state: 'available'|'latest'|'none'|'unreachable'|'bad', current, folder, packaged, canInstall, ...(available 이면 판 정보), history?, why? }
  //  history = 올라간 판들(새 판 먼저 — { version, date, size, notes, rollback }), rollback = 지금 판보다 낮고 설치 파일이 폴더에 남아 있어 되돌릴 수 있음.
  //  canInstall = 이 앱이 실제로 설치할 수 있나(설치판 — 시험 WCG_UPDATE_DRYRUN 이면 실행 직전까지)
  function check(manual) {
    if (!checking) {
      checking = (async () => {
        const base = { current, folder: dirs[0], packaged: !!o.packaged, canInstall: !!o.packaged || dry };
        if (offline) return { ...base, state: 'unreachable', why: 'test-mode' };
        const r = await read();
        if (!cleaned && o.tempRoot) { cleaned = true; try { cleanTemp(path.join(o.tempRoot, TEMP_SUB)); } catch (e) { /* 다음에 */ } }   // 지난 업데이트가 남긴 설치 파일 사본
        if (!r.ok) {
          const state = r.err === 'none' ? 'none' : r.err === 'bad' ? 'bad' : 'unreachable';
          log(`확인: ${state}${r.why ? ' (' + r.why + ')' : ''}${r.code ? ' ' + r.code : ''}`);
          return { ...base, state, why: r.why || r.err };
        }
        const hist = r.info.history || [r.info];
        const rb = new Set(await rollbackable(r.dir, hist, current, { fsp: o.fsp, timeoutMs: o.timeoutMs }));
        const history = hist.map((h) => ({ version: h.version, date: h.date, size: h.size, notes: h.notes.slice(), rollback: rb.has(h.version) }));
        const newer = cmpVer(r.info.version, current) === 1;
        log(`확인: ${newer ? '새 판 ' + r.info.version : '최신(' + r.info.version + ')'}${rb.size ? ' · 되돌릴 수 있는 판 ' + [...rb].join(', ') : ''}`);
        return newer ? { ...base, state: 'available', ...pub(r.info), history } : { ...base, state: 'latest', version: r.info.version, history };
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
  // 설치 — 고른 판(version)을 받아 확인·복사 → 진행 창(없으면 조용한 설치) → 앱 끄기. 돌려주는 것: { ok: true, ui, dry?, rollback? } | { ok: false, err, … }
  //  ui = true 면 진행 창이 떠서 설치·새 판 실행을 맡았다(앱은 0.6초 뒤 꺼짐), false 면 조용한 설치(앱은 1.5초 뒤 꺼짐).
  //  보통: 고른 판 = 지금 latest.json 맨 위 판이고 지금 판보다 새 판이어야. '나중에'(later)는 저절로 알림만 막는다 — 여기선 보지 않는다(메뉴에서 언제든).
  //  되돌리기(opts.rollback): 고른 판이 지금 내역(history)에 있고 지금 판보다 낮아야(내역에서 빠졌으면 gone). 설치 파일이 정리됐으면 missing.
  //  opts.onPhase('handoff') — 받기·확인이 끝나고 진행 창을 띄우는 중(웹앱 글자 — 이때부터 cancel() 은 false: 취소할 수 없다)
  async function install(version, onProgress, opts) {
    const rollback = !!(opts && opts.rollback);
    const onPhase = opts && typeof opts.onPhase === 'function' ? opts.onPhase : null;
    if (installing || launched) return { ok: false, err: 'busy' };
    if (!o.packaged && !dry) return { ok: false, err: 'dev' };
    installing = true;
    try {
      const r = await read();
      if (!r.ok) return { ok: false, err: r.err === 'none' ? 'changed' : r.err === 'timeout' ? 'unreachable' : r.err, why: r.why };
      const want = String(version || '');
      let info;
      if (rollback) {
        info = (r.info.history || []).find((h) => h.version === want);
        if (!info) return { ok: false, err: 'gone', version: want };
        if (cmpVer(want, current) !== -1) return { ok: false, err: 'not-older', version: want };
      } else {
        if (r.info.version !== want) return { ok: false, err: 'changed', version: r.info.version };
        if (cmpVer(r.info.version, current) !== 1) return { ok: false, err: 'not-newer', version: r.info.version };
        info = r.info;
      }
      const ctl = abortCtl = new AbortController();
      const c = await prepareInstall({ dir: r.dir, info, tempRoot: o.tempRoot, onProgress, signal: ctl.signal, fsp: o.fsp, timeoutMs: o.timeoutMs });
      abortCtl = null;   // 여기부터는 취소할 수 없다(진행 창·설치 프로그램에 넘김 — 웹앱은 handoff 를 받으면 [취소]를 감춘다)
      if (!c.ok) { log(`설치 파일 받기 실패: ${c.err}${c.code ? ' ' + c.code : ''}`); return c; }
      // 받기가 끝나는 바로 그때 누른 [취소] — 넘기기 전이면 멈춘다(받은 사본은 다음 확인 때 cleanTemp 가 지움)
      if (ctl.signal.aborted) { log('설치 파일은 받았지만 넘기기 전에 취소됨'); return { ok: false, err: 'cancelled' }; }
      const tag = rollback ? { rollback: true } : {};
      if (dry) { log('시험(WCG_UPDATE_DRYRUN) — 실행하지 않음: ' + c.file); return { ok: true, dry: true, version: info.version, ...tag }; }
      const quit = (ms) => {
        try { if (o.releaseClose) o.releaseClose(); } catch (e) { /* 창 없음 */ }
        setT(() => { try { o.quitForInstall(); } catch (e) { /* 이미 꺼지는 중 */ } }, ms);
      };
      // 진행 창 — 있으면 그 창이 다시 확인·설치·새 판 실행을 맡는다(앱이 꺼진 뒤에도 무엇을 하는지 보이게)
      const uiExe = o.uiExe ? findUiExe(typeof o.uiExe === 'function' ? o.uiExe() : o.uiExe) : null;
      if (uiExe) {
        if (onPhase) { try { onPhase('handoff'); } catch (e) { /* 창 닫힘 */ } }
        const u = await startUi({
          exe: uiExe, tempRoot: o.tempRoot, spawn: o.uiSpawn || o.spawn, readyMs: o.uiReadyMs, sleep: o.uiSleep,
          args: { pid: o.pid || process.pid, app: o.appExe || process.execPath, product: o.product || '날씨 CG', from: current, to: info.version, rollback,
            setup: c.file, sha256: info.sha256, size: info.size, shots: String(env.WCG_UPDATE_UI_SHOTS || '').trim() || '' },
        });
        if (u.ok) {
          launched = true;
          log(`업데이트 진행 창을 띄움(pid ${u.pid}, ${u.ms}ms — 설치 /S --updated·새 판 실행은 창이)${rollback ? ' — 이전 판 ' + info.version + ' 으로 되돌리기' : ''} — 앱을 끈다`);
          quit(UI_QUIT_MS);
          return { ok: true, version: info.version, ui: true, ...tag };
        }
        log(`진행 창을 못 띄움: ${u.err}${u.code != null ? ' ' + u.code : ''}${u.err === 'ui-stuck' ? ' — 설치하지 않음' : ' — 조용한 설치로'}`);
        if (u.err === 'ui-stuck') return { ok: false, err: 'ui-stuck' };   // 못 끈 창이 뒤늦게 설치할 수 있다 — 두 번 돌리지 않는다
      }
      const s = await runInstaller(c.file, { tempRoot: o.tempRoot, info, variant, spawn: o.spawn });
      if (!s.ok) { log(`설치 프로그램 실행 실패: ${s.err}${s.code ? ' ' + s.code : ''}`); return s; }
      launched = true;
      log(`설치 프로그램 실행(${INSTALL_ARGS.join(' ')})${rollback ? ' — 이전 판 ' + info.version + ' 으로 되돌리기' : ''} — 앱을 끈다`);
      quit(FALLBACK_QUIT_MS);   // 웹앱이 답을 받아 '곧 앱이 닫히고 새 판이 켜져요'를 보일 틈
      return { ok: true, version: info.version, ui: false, ...tag };
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
  DEFAULT_DIRS, LATEST_NAME, INSTALL_ARGS, TEMP_SUB, FIRST_DELAY_MS, EVERY_MS, DIR_TIMEOUT_MS, MAX_JSON_BYTES, MAX_SETUP_BYTES, HISTORY_MAX, KEEP_SETUPS,
  UI_EXE, UI_LOG, UI_FONTS, UI_READY_MS, UI_QUIT_MS, FALLBACK_QUIT_MS,
  parseVer, cmpVer, variantOf, setupName, parseSetupName, setupNameOk, cleanNotes, validateEntry, validateLatest, withTimeout,
  readLatest, readLatestAny, copyVerified, hashFile, cleanTemp, prepareInstall, rollbackable, runInstaller, uiArgs, findUiExe, startUi, createUpdater,
};
