// 날씨 CG 데스크톱(개발판) — Electron 껍데기.
// - 상위 폴더(WeatherCG)의 최신 index.html을 그대로 띄운다(복사 없음 → 코드 고치고 창에서 Ctrl+R이면 바로 반영).
// - 출처는 app://weathercg 로 고정한다. 출처가 바뀌면 localStorage(자동저장·API 키·배치)가 사라지므로 절대 바꾸지 말 것.
//   (http 고정 포트 방식은 포트 충돌·서비스워커 캐시·폴더 노출 문제가 있어 버림)
// - 기능 확장팩(기상청 불러오기·MXF/MOV·AE 보내기)은 앱 안에 내장(wns/server.js, 127.0.0.1:3721).
//   웹판용 Python 헬퍼(3720)와 포트가 달라 같이 켜져 있어도 충돌하지 않는다. 내장 시작에 실패하면 Python 헬퍼로 대체.
const { app, BrowserWindow, Menu, shell, protocol, ipcMain, dialog, session } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const { spawn, execFile } = require('child_process');

// WCG_APP_DIR: 다른 폴더(작업트리 등)의 웹앱을 띄울 때. WCG_TEST=1: 자동 점검용(창 안 보임·헬퍼 안 켬·단일 인스턴스 해제·임시 사용자 폴더)
const APP_DIR = process.env.WCG_APP_DIR ? path.resolve(process.env.WCG_APP_DIR) : path.resolve(__dirname, '..');
const TEST_MODE = process.env.WCG_TEST === '1';
// 점검 모드에서만: 창 크기 지정(WCG_TEST_SIZE=1100x800) — 좁은 창 화면 점검용
const TEST_SIZE = TEST_MODE ? /^(\d{3,4})x(\d{3,4})$/.exec(process.env.WCG_TEST_SIZE || '') : null;
if (TEST_MODE) app.setPath('userData', path.join(require('os').tmpdir(), 'wcg-test-' + process.pid));
const APP_HOST = 'weathercg';
const APP_ORIGIN = `app://${APP_HOST}`;
const EMBED_PORT = 3721;   // 내장 헬퍼
const EXT_PORT = 3720;     // 웹판 Python 헬퍼(대체용)
const HELPER_VER = 20261007;
const LAD = process.env.LOCALAPPDATA || app.getPath('temp');
const exists = (p) => { try { return !!p && fs.existsSync(p); } catch (e) { return false; } };
// 도구 위치 — desktop\helper 에 넣어 두면 그걸 우선(나중에 설치판에 번들), 없으면 기존 위치
const FFMPEG = [path.join(__dirname, 'helper', 'ffmpeg.exe'), path.join(LAD, 'WNS_Helper', 'ffmpeg.exe'), 'R:\\[F]_Util\\WNS\\ffmpeg.exe'].find(exists) || 'ffmpeg';
// SUITE 폰트 폴더 후보(helper.py 와 같은 목록) — 있는지는 AE 보낼 때 비동기로 본다(네트워크 경로로 시작이 멈추지 않게)
const FONT_DIRS = require('./wns/find-tools').defaultFontsCandidates(__dirname);
const FRAMES_DIR = path.join(LAD, 'WeatherCG', 'frames');
// Python 헬퍼(대체용) 원본/실행 위치 — WNS_START.bat과 같은 방식
const EXT_SRC_DIRS = [path.join(__dirname, 'helper'), 'R:\\[F]_Util\\WNS'];
const EXT_RUN_DIR = path.join(LAD, 'WNS_Helper');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.otf': 'font/otf', '.ttf': 'font/ttf', '.woff': 'font/woff', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8',
};

// '이미지로 추출'의 폴더 고르기(showDirectoryPicker)에서 크로미움이 막는 '민감한 폴더'(홈·바탕화면·다운로드 '자체', AppData, 시스템 폴더,
// 드라이브 루트 등)를 골랐을 때 — 사용자 폴더(홈 아래, AppData 빼고)와 시스템 드라이브가 아닌 드라이브(R:\ 네트워크 등)는 허락하고,
// 나머지(Windows·Program Files·ProgramData·AppData·C:\ 루트)는 폴더 창을 다시 띄운다('tryAgain'). 웹판(크롬)은 막힌 채 — 앱이 ZIP 받기를 안내한다.
function fsPickAllowed(p) {
  if (!p) return false;
  const norm = (x) => path.resolve(String(x)).replace(/[\\/]+$/, '').toLowerCase();
  const P = norm(p);
  const under = (base) => { if (!base) return false; const b = norm(base); return P === b || P.startsWith(b + path.sep); };
  const env = process.env;
  if ([env.SystemRoot || 'C:\\Windows', env.ProgramFiles, env['ProgramFiles(x86)'], env.ProgramData, env.APPDATA, env.LOCALAPPDATA].some(under)) return false;
  if (under(require('os').homedir())) return true;
  return path.parse(P + path.sep).root.toLowerCase() !== ((env.SystemDrive || 'C:') + path.sep).toLowerCase();
}

// app:// 를 일반 웹 출처처럼(보안 출처·fetch·CORS·스트림) 쓰게 등록 — ready 전에 해야 한다
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true, codeCache: true } }]);

let win = null;
let wns = null;           // 내장 헬퍼 서버
let helperUrl = null;     // 웹앱에 알려줄 헬퍼 주소
let helperKind = null;    // 'embedded' | 'external'
let extProc = null;       // 이 앱이 켠 Python 헬퍼(대체용)만 기억

// ---------- app:// 파일 서빙 ----------
const BLOCKED = /^(\.git|\.worktrees|desktop|node_modules)(\/|$)/i;   // 앱이 쓰지 않는 내부 폴더는 막는다
function serveApp(req) {
  let rel;
  try {
    const u = new URL(req.url);
    if (u.host !== APP_HOST) return new Response('not found', { status: 404 });
    rel = decodeURIComponent(u.pathname).replace(/^\/+/, '');
  } catch (e) { return new Response('bad request', { status: 400 }); }
  if (!rel) rel = 'index.html';
  if (BLOCKED.test(rel.replace(/\\/g, '/'))) return new Response('forbidden', { status: 403 });
  const fp = path.normalize(path.join(APP_DIR, rel));
  const inside = path.relative(APP_DIR, fp);
  if (!inside || inside.startsWith('..') || path.isAbsolute(inside)) return new Response('forbidden', { status: 403 });
  let st;
  try { st = fs.statSync(fp); } catch (e) { return new Response('not found', { status: 404 }); }
  if (!st.isFile()) return new Response('not found', { status: 404 });
  return new Response(Readable.toWeb(fs.createReadStream(fp)), {
    status: 200,
    headers: {
      'content-type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream',
      'content-length': String(st.size),
      'cache-control': 'no-store',   // 개발판: 항상 디스크의 최신 파일
    },
  });
}

// ---------- 내장 헬퍼 ----------
async function startEmbeddedHelper() {
  try {
    const { createWnsServer } = require('./wns/server');
    wns = createWnsServer({
      ffmpegPath: FFMPEG, framesDir: FRAMES_DIR, fontsDirs: FONT_DIRS, helperVer: HELPER_VER,
      aeDryRun: false, log: (...a) => console.log('[wns]', ...a),
    });
    await wns.listen(EMBED_PORT, '127.0.0.1');
    helperUrl = `http://127.0.0.1:${EMBED_PORT}`; helperKind = 'embedded';
    return true;
  } catch (e) {
    console.log('[wns] 내장 헬퍼 시작 실패 → Python 헬퍼로 대체:', e && e.message);
    try { wns && wns.close(); } catch (_) {}
    wns = null;
    return false;
  }
}

// ---------- Python 헬퍼(대체용) ----------
function pingPort(port) {
  return new Promise((resolve) => {
    const q = http.get({ host: '127.0.0.1', port, path: '/ping', timeout: 800 }, (res) => { res.resume(); resolve(res.statusCode === 200); });
    q.on('error', () => resolve(false));
    q.on('timeout', () => { q.destroy(); resolve(false); });
  });
}
function needsCopy(src, dst) {
  try { const a = fs.statSync(src), b = fs.statSync(dst); return a.size !== b.size || a.mtimeMs > b.mtimeMs + 1000; } catch (e) { return true; }
}
async function ensureExternalHelper() {
  if (await pingPort(EXT_PORT)) return 'running';
  const srcDir = EXT_SRC_DIRS.find((d) => exists(path.join(d, 'WNS_Helper.exe')));
  if (!srcDir) return 'missing';
  await fs.promises.mkdir(EXT_RUN_DIR, { recursive: true });
  for (const f of ['WNS_Helper.exe', 'ffmpeg.exe']) {
    const s = path.join(srcDir, f), d = path.join(EXT_RUN_DIR, f);
    if (exists(s) && needsCopy(s, d)) { try { await fs.promises.copyFile(s, d); } catch (e) { /* 잠겼으면 기존 사본 */ } }
  }
  const exe = path.join(EXT_RUN_DIR, 'WNS_Helper.exe');
  if (!exists(exe)) return 'missing';
  extProc = spawn(exe, [], { cwd: EXT_RUN_DIR, windowsHide: true, stdio: 'ignore' });
  extProc.on('exit', () => { extProc = null; });
  for (let i = 0; i < 40; i++) { await new Promise((r) => setTimeout(r, 250)); if (await pingPort(EXT_PORT)) return 'started'; }
  return 'timeout';
}
function stopOwnExternalHelper() {
  if (!extProc || !extProc.pid) return;
  try { execFile('taskkill', ['/PID', String(extProc.pid), '/T', '/F'], { windowsHide: true }); } catch (e) {}   // onefile=부트로더+본체 → 트리째
  extProc = null;
}

// ---------- 창 ----------
// 창 제목표시줄 = 웹앱 맨 위 제목줄(#titlebar). 윈도 기본 제목줄은 숨기고 최소화·최대화·닫기 버튼만
// 오른쪽 끝에 겹쳐 그린다(titleBarOverlay). 높이는 css/titlebar.css 의 --tbH(36px)와 반드시 같게.
// 색은 웹앱이 테마(밝기)에 맞춰 wcgDesktop.setTitleBar 로 다시 맞춘다 — 아래 값은 어두운 테마 기본.
const TITLEBAR_H = 36;
const TITLEBAR_DARK = { color: '#0f0f0f', symbolColor: '#f1f1f1' };
function createWindow() {
  win = new BrowserWindow({
    width: TEST_SIZE ? +TEST_SIZE[1] : 1600, height: TEST_SIZE ? +TEST_SIZE[2] : 1000,
    minWidth: TEST_SIZE ? 400 : 1100, minHeight: TEST_SIZE ? 300 : 700,
    backgroundColor: '#0f0f0f', title: '날씨 CG', icon: path.join(APP_DIR, 'icon.ico'),
    titleBarStyle: 'hidden', titleBarOverlay: { ...TITLEBAR_DARK, height: TITLEBAR_H },
    autoHideMenuBar: true, show: false, paintWhenInitiallyHidden: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
      spellcheck: false,
      backgroundThrottling: false,   // 영상 추출 중 창이 가려져도 느려지지 않게
    },
  });
  win.once('ready-to-show', () => { if (TEST_MODE) return; win.maximize(); win.show(); });   // 점검 모드는 화면에 안 띄움
  win.on('page-title-updated', (e) => e.preventDefault());   // 작업표시줄·Alt+Tab 창 이름은 늘 '날씨 CG' (웹 <title>로 안 바뀌게)
  win.on('closed', () => { if (wnuri && !wnuri.isDestroyed()) wnuri.destroy(); });   // 날씨누리 창이 남아 앱이 안 꺼지는 일 없게
  // 외부 링크(기상청·JTWC 등)는 기본 브라우저로
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) { shell.openExternal(url); return { action: 'deny' }; }
    return { action: url.startsWith(APP_ORIGIN) ? 'allow' : 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(APP_ORIGIN)) { e.preventDefault(); if (/^https?:/i.test(url)) shell.openExternal(url); }
  });
  // 보기 단축키를 페이지 키 입력 단계에서 직접 처리 — 제목줄을 숨기면(titleBarStyle:'hidden') 메뉴바가 없는 창이 되므로
  // 메뉴 단축키에만 기대지 않는다. preventDefault 하면 메뉴 단축키는 안 불려서 두 번 실행되지 않는다(Electron 문서).
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    const act = viewActionFor(input);
    if (!act) return;
    e.preventDefault();
    if (!input.isAutoRepeat) act();   // 꾹 누르고 있어도 한 번만
  });
  win.loadURL(`${APP_ORIGIN}/index.html`);
}

// ---------- 날씨누리 창(통보문 읽어 오기) ----------
// 웹앱의 '단기예보 열기'(js/bulletin-load.js bulOpenPage)가 부르면 앱 안 창으로 날씨누리 단기예보를 띄우고, 화면이 다 뜰 때마다
// 통보문 본문(div.cmp-view-content)의 글자를 읽어 웹앱에 보낸다('wcg:wnuri') — 웹앱이 '예상 강수량' 날짜 묶음으로 나눠 고르게 한다.
// 헬퍼로 페이지를 못 받을 때(헬퍼 문제·날씨누리가 본문을 스크립트로 그리게 바뀜 등)의 대체 길.
// 창은 weather.go.kr·kma.go.kr(https) 안에서만 움직이고(그 밖 링크는 기본 브라우저), node·preload 없이 샌드박스·따로 세션(권한 요청·내려받기 막음).
// 창의 글은 바깥 페이지가 준 것이라 웹앱은 글자로만 쓴다.
const WNURI_HOME = 'https://www.weather.go.kr/w/forecast/overall/short-term.do';
const WNURI_HOST = /^(?:[a-z0-9-]+\.)*(?:weather|kma)\.go\.kr$/i;
const wnuriOk = (u) => { try { const x = new URL(u); return x.protocol === 'https:' && WNURI_HOST.test(x.hostname); } catch (e) { return false; } };
const WNURI_READ = `(() => { const c = document.querySelector('.cmp-view-content'); const a = document.querySelector('.cmp-view-announce span');
  return { text: c ? String(c.innerText || '') : '', announce: a ? String(a.textContent || '').trim() : '', url: location.href }; })()`;
let wnuri = null;        // 날씨누리 창(하나만)
let wnuriFirst = false;  // 창을 연(또는 다시 앞으로 부른) 뒤 첫 읽기 — 웹앱이 '못 찾음'을 이때만 알린다
const toApp = (d) => { if (win && !win.isDestroyed()) win.webContents.send('wcg:wnuri', d); };
async function readWnuri() {
  if (!wnuri || wnuri.isDestroyed()) return;
  let d;
  try { d = await wnuri.webContents.executeJavaScript(WNURI_READ, true); } catch (e) { d = { err: String((e && e.message) || e) }; }
  if (!d || typeof d !== 'object') d = { text: '' };
  const first = wnuriFirst; wnuriFirst = false;
  toApp({ text: String(d.text || '').slice(0, 200000), announce: String(d.announce || '').slice(0, 200), url: String(d.url || ''), err: d.err || '', first });
}
function openWnuri(url) {
  if (!wnuriOk(url)) url = WNURI_HOME;
  wnuriFirst = true;
  // 이미 떠 있으면 앞으로 불러 새로고침한 뒤 읽는다(다 뜨면 did-finish-load) — 창을 열어 둔 채 발표(05·11·17시)가 바뀌면
  // 그냥 다시 읽기로는 지난 통보문을 읽는다. 창 안에서 고른 지역 화면은 새로고침해도 그대로다.
  if (wnuri && !wnuri.isDestroyed()) { if (wnuri.isMinimized()) wnuri.restore(); wnuri.show(); wnuri.focus(); wnuri.webContents.reload(); return; }
  wnuri = new BrowserWindow({
    width: 1180, height: 900, minWidth: 600, minHeight: 400, show: !TEST_MODE, autoHideMenuBar: true,
    title: '날씨누리 — 단기예보 (통보문 읽기)', icon: path.join(APP_DIR, 'icon.ico'), backgroundColor: '#ffffff',
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, partition: 'wnuri', spellcheck: false },
  });
  // 앱 메뉴(보기)를 떼어 낸다 — 붙어 있으면 이 창에서 누른 Ctrl+R·F12가 메인 창(웹앱)을 새로고침·개발자 도구로 연다
  wnuri.setMenu(null);
  const wc = wnuri.webContents;
  wc.on('before-input-event', (e, input) => {   // 새로고침(F5·Ctrl+R)은 이 창만 — 다 뜨면 다시 읽는다
    if (input.type !== 'keyDown') return;
    const k = String(input.key || '').toLowerCase();
    if (input.key === 'F5' || ((input.control || input.meta) && (k === 'r' || input.code === 'KeyR'))) { e.preventDefault(); if (!input.isAutoRepeat) wc.reload(); }
  });
  const ses = wc.session;
  if (!ses.__wcgWnuri) {   // 세션('wnuri', 메모리에만)은 창을 다시 열어도 같다 — 한 번만 건다
    ses.__wcgWnuri = true;
    ses.setPermissionRequestHandler((_w, _p, cb) => cb(false));   // 위치·알림 등 권한 요청은 모두 거절
    ses.on('will-download', (e) => e.preventDefault());            // PDF 등 내려받기는 막는다(창은 읽기 전용)
  }
  wc.setWindowOpenHandler(({ url: u }) => {
    if (wnuriOk(u)) wc.loadURL(u);                               // 날씨누리 안 새 창 링크는 이 창에서
    else if (/^https?:/i.test(u)) shell.openExternal(u);
    return { action: 'deny' };
  });
  // 주소·주 프레임은 이벤트 객체(details)에서 먼저 읽는다(뒤 인자는 Electron에서 옛 방식으로 표시됨)
  wc.on('will-navigate', (e, u0) => { const u = (e && e.url) || u0; if (!wnuriOk(u)) { e.preventDefault(); if (/^https?:/i.test(u)) shell.openExternal(u); } });
  wc.on('will-redirect', (e, u0, _inPlace, isMain0) => {   // 서버 리다이렉트로 밖에 나가는 것도
    const u = (e && e.url) || u0, isMain = e && typeof e.isMainFrame === 'boolean' ? e.isMainFrame : isMain0;
    if (isMain && !wnuriOk(u)) e.preventDefault();
  });
  wc.on('did-finish-load', () => { readWnuri(); });
  wc.on('did-navigate-in-page', () => { setTimeout(readWnuri, 300); });
  wc.on('did-fail-load', (_e, code, desc, u, isMain) => { if (isMain && code !== -3) toApp({ err: `${desc || '불러오기 실패'} (${code})`, first: wnuriFirst, url: String(u || '') }); });   // -3 = 다른 주소로 넘어가며 취소됨
  wnuri.on('page-title-updated', (e) => e.preventDefault());
  wnuri.on('closed', () => { wnuri = null; toApp({ closed: true }); });
  wnuri.loadURL(url);
}
// 웹앱(메인 창)만 부를 수 있다. 주소는 날씨누리·기상청(https)만 — 아니면 단기예보 첫 화면
ipcMain.handle('wcg:wnuri-open', (e, url) => {
  if (!win || win.isDestroyed() || !e.sender || e.sender.id !== win.webContents.id) return false;
  openWnuri(String(url || ''));
  return true;
});

// ---------- 미해군(JTWC) 자료 받기 ----------
// 웹앱의 '미해군(JTWC)에서 불러오기'(js/typhoon-jtwc.js)가 활동 중인 태풍 목록(RSS)과 고른 태풍의 통보문(.tcw)을 받아 달라고 부른다.
// 허용 주소(metoc.navy.mil/jtwc 의 rss/jtwc.rss·products/xxNNYY.tcw)·시간 제한·크기 상한·브라우저 UA는 desktop/jtwc.js.
// 요청은 따로 세션(메모리에만 — 쿠키가 앱 세션에 안 섞임)의 크로미움 네트워크(net.fetch — 시스템 프록시를 따른다)로 보낸다.
// 그 세션에는 문지기(jtwcGuardSession — webRequest)를 걸어 넘겨주기(리디렉트)로 허용 밖 주소에 가는 요청도 끊는다
// (net.fetch는 넘겨주기 뒤에도 Response.url이 비어 있어 받은 뒤 검사로는 못 막는다 — desktop/jtwc.js).
// 부르는 쪽은 메인 창의 주 프레임(app:// 웹앱)만 — 다른 창·하위 프레임·다른 주소로 바뀐 페이지는 거절.
const { jtwcFetch, jtwcGuardSession } = require('./jtwc');
let jtwcSes = null;
function jtwcSession() {
  if (!jtwcSes) { jtwcSes = session.fromPartition('jtwc'); jtwcGuardSession(jtwcSes); }
  return jtwcSes;
}
function jtwcCallerOk(e) {
  if (!win || win.isDestroyed() || !e.sender || e.sender.id !== win.webContents.id) return false;
  try { const f = e.senderFrame; return !!f && !f.parent && String(f.url || '').startsWith(`${APP_ORIGIN}/`); } catch (err) { return false; }   // 프레임이 이미 사라졌으면 거절
}
ipcMain.handle('wcg:jtwc-fetch', (e, p) => {
  if (!jtwcCallerOk(e)) return { ok: false, err: 'denied', detail: 'sender' };
  const ses = jtwcSession();
  return jtwcFetch(String(p || ''), { fetch: (u, init) => ses.fetch(u, init) });
});

// 보기 동작 — 메뉴(단축키 표시)와 위의 키 입력 처리가 같은 함수를 쓴다.
const VIEW = {
  reload: () => win && win.webContents.reload(),
  hardReload: () => win && win.webContents.reloadIgnoringCache(),
  devtools: () => win && win.webContents.toggleDevTools(),
  fullscreen: () => win && win.setFullScreen(!win.isFullScreen()),
};
function viewActionFor(input) {
  // 한글 입력 상태에선 key 가 'ㄱ' 등이 되므로 물리 키(code)도 본다
  const ctrl = input.control || input.meta, k = String(input.key || '').toLowerCase(), c = input.code;
  if (ctrl && !input.alt && (k === 'r' || c === 'KeyR')) return input.shift ? VIEW.hardReload : VIEW.reload;
  if (input.key === 'F12' || (ctrl && input.shift && (k === 'i' || c === 'KeyI'))) return VIEW.devtools;
  if (input.key === 'F11') return VIEW.fullscreen;
  return null;
}

// 최소 메뉴 — 기본 Edit 메뉴(실행취소 등)는 Ctrl+Z를 가로채 앱의 되돌리기를 막으므로 넣지 않는다.
function buildMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([{
    label: '보기',
    submenu: [
      { label: '새로고침', accelerator: 'CmdOrCtrl+R', click: VIEW.reload },
      { label: '캐시 무시 새로고침', accelerator: 'CmdOrCtrl+Shift+R', click: VIEW.hardReload },
      { label: '개발자 도구', accelerator: 'F12', click: VIEW.devtools },
      { label: '개발자 도구', accelerator: 'CmdOrCtrl+Shift+I', visible: false, click: VIEW.devtools },
      { type: 'separator' },
      { label: '전체 화면', accelerator: 'F11', click: VIEW.fullscreen },
    ],
  }]));
}

// preload가 동기로 물어본다 — 페이지 스크립트가 시작하기 전에 헬퍼 주소가 정해져 있어야 함
ipcMain.on('wcg:helper', (e) => { e.returnValue = { url: helperUrl, kind: helperKind, ver: HELPER_VER }; });
// 밝기(테마)가 바뀌면 창 버튼(최소화·최대화·닫기) 바탕·기호 색도 제목줄에 맞춘다. 색은 #hex 만 받는다.
const HEX = /^#[0-9a-f]{3,8}$/i;
ipcMain.on('wcg:titlebar', (e, o) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (!w || !o || !HEX.test(o.color) || !HEX.test(o.symbolColor)) return;
  try { w.setTitleBarOverlay({ color: o.color, symbolColor: o.symbolColor, height: TITLEBAR_H }); } catch (err) { /* 오버레이 없는 창 */ }
});

// 렌더 성능 — GPU 블록리스트 때문에 가속이 꺼지는 PC에서도 GPU 래스터를 쓰게
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');

if (!TEST_MODE && !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(async () => {
    buildMenu();
    protocol.handle('app', serveApp);
    session.defaultSession.on('file-system-access-restricted', (_e, d, cb) => cb(fsPickAllowed(d && d.path) ? 'allow' : 'tryAgain'));   // 폴더 고르기 — 위 fsPickAllowed
    if (TEST_MODE) { createWindow(); return; }   // 점검 모드: 헬퍼 없이 화면만
    if (!(await startEmbeddedHelper())) {   // 내장 실패 → 웹판과 같은 Python 헬퍼를 켜서 쓴다
      helperUrl = `http://127.0.0.1:${EXT_PORT}`; helperKind = 'external';
      ensureExternalHelper().then((st) => console.log('[WNS helper]', st));
    }
    console.log('[WNS helper]', helperKind, helperUrl, 'ffmpeg=', FFMPEG);
    createWindow();
  });
  app.on('window-all-closed', () => { app.quit(); });
  app.on('will-quit', () => {
    try { wns && wns.close(); } catch (e) {}
    stopOwnExternalHelper();
  });
}

// 처리 안 된 예외로 앱이 조용히 죽지 않게 — 알리고 계속
process.on('uncaughtException', (e) => {
  console.error(e);
  try { dialog.showErrorBox('날씨 CG — 오류', String(e && e.stack || e)); } catch (_) {}
});
