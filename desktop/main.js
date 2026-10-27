// 날씨 CG 데스크톱(개발판·설치판) — Electron 껍데기.
// - 상위 폴더(WeatherCG)의 최신 index.html을 그대로 띄운다(복사 없음 → 코드 고치고 창에서 Ctrl+R이면 바로 반영).
//   설치판(tools/build-installer.cjs)은 같은 구조를 app.asar 에 담아 이 파일을 desktop/main.js 로 띄운다 — 상위 폴더 = asar 안 웹앱.
// - 출처는 app://weathercg 로 고정한다. 출처가 바뀌면 localStorage(자동저장·API 키·배치)가 사라지므로 절대 바꾸지 말 것.
//   (http 고정 포트 방식은 포트 충돌·서비스워커 캐시·폴더 노출 문제가 있어 버림)
// - 기능 확장팩(기상청 불러오기·MXF/MOV·AE 보내기)은 앱 안에 내장(wns/server.js, 127.0.0.1:3721).
//   웹판용 Python 헬퍼(3720)와 포트가 달라 같이 켜져 있어도 충돌하지 않는다. 내장 시작에 실패하면 Python 헬퍼로 대체.
const { app, BrowserWindow, Menu, shell, protocol, ipcMain, dialog, session, screen } = require('electron');
const { initialWindowBounds } = require('./window-layout');
const { readDataPortalKey, readMapboxToken, mapboxTokenOk, privateKeyCallerOk } = require('./private-config');
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
// 판 갈래 — 앱 package.json 의 name(설치판 = resources\app.asar\package.json, 개발판 = desktop\package.json). 'installtest' = 이름만 다른 설치 시험판
// (tools/build-installer.cjs --installtest — 사용자 설치판이 깔리고 켜진 PC 에서 설치·업데이트를 시험). 업데이트는 같은 갈래의 설치 파일만 받는다(desktop/updater.js).
const APP_VARIANT = (() => { try { return require('./updater').variantOf(JSON.parse(fs.readFileSync(path.join(app.getAppPath(), 'package.json'), 'utf8')).name); } catch (e) { return ''; } })();
// 설치 시험판은 업데이트 뒤 설치 프로그램이 점검 모드가 아닌 보통 실행으로 다시 켠다 — 사용자 앱과 부딪히지 않게 헬퍼는 빈 포트(대체 Python 헬퍼 없음),
// 영상 프레임·타일 캐시는 따로 폴더(%LOCALAPPDATA%\WeatherCG-installtest). 사용자 데이터는 제품 이름이 달라 이미 따로(%APPDATA%\날씨 CG 설치시험).
const INSTALL_TEST = app.isPackaged && APP_VARIANT === 'installtest';
const EMBED_PORT = INSTALL_TEST ? 0 : 3721;   // 내장 헬퍼(0 = 빈 포트 — 웹앱은 preload 가 알려 준 주소를 쓴다)
const EXT_PORT = 3720;     // 웹판 Python 헬퍼(대체용)
const HELPER_VER = 20261009;
const LAD = process.env.LOCALAPPDATA || app.getPath('temp');
// 자료·캐시·기록 자리(10-26 — NDT 런처 통합, desktop/app-paths.js): %LOCALAPPDATA%\NDT\apps\weather-cg 에 깔린 설치판만 NDT 자리
// (자료 NDT\data·캐시 NDT\cache·기록 NDT\logs), 그 밖(예전 자리 설치·개발판)은 지금까지 그대로 — 아무것도 옮기지 않는다. 점검 모드는 위 임시 사용자 폴더.
const LAYOUT = TEST_MODE ? { kind: 'test', cache: null } : require('./app-paths').resolveLayout({
  // 예전 자료 자리는 이름으로만 셈(app.getPath('userData')는 그 폴더를 만들어 버린다 — NDT 설치에 빈 %APPDATA%\<이름>이 생겼음, 10-26 시험)
  packaged: app.isPackaged, exePath: process.execPath, lad: process.env.LOCALAPPDATA || '', legacyUserData: path.join(app.getPath('appData'), app.getName()),
  variant: INSTALL_TEST ? 'installtest' : '',
  hasEntries: (d) => { try { return fs.readdirSync(d).length > 0; } catch (e) { return false; } },
});
if (LAYOUT.kind === 'ndt') {
  // 작업·배치·설정(localStorage 등) — 단일 실행 잠금보다 먼저. 크로미움 자체 캐시(Cache·Code Cache·GPUCache 등)는 이 프로필 안에 함께 생긴다
  // (localStorage 와 같은 세션 폴더라 따로 못 뺌 — disk-cache-dir 스위치는 Electron 44 에서 안 먹었다, 10-26 시험). 우리 캐시(지도 타일·영상 프레임·업데이트 사본)만 NDT\cache.
  app.setPath('userData', LAYOUT.userData);
  app.setPath('crashDumps', path.join(LAYOUT.logs, 'crashes'));
  app.setPath('logs', LAYOUT.logs);
}
const LAD_APP = LAYOUT.cache || path.join(LAD, INSTALL_TEST ? 'WeatherCG-installtest' : 'WeatherCG');   // 영상 프레임·타일 캐시 자리
const exists = (p) => { try { return !!p && fs.existsSync(p); } catch (e) { return false; } };
// 설치판(tools/build-installer.cjs — electron-builder, asar)에서는 이 파일이 resources\app.asar\desktop 안에 있다.
// 앱 파일 읽기(fs·app:// 서빙·preload·비공개 키)는 asar 안 그대로 되지만, 다른 프로그램이 쓰는 파일(ffmpeg 실행·AE용 SUITE 폰트 복사)은
// asar 밖의 진짜 파일이어야 한다 — 빌드가 desktop\helper\** 를 resources\app.asar.unpacked\desktop\helper 로 풀어 둔다.
// 개발판은 경로에 app.asar 가 없어 __dirname 그대로.
const DESK_REAL = __dirname.replace(/([\\/])app\.asar(?=[\\/]|$)/i, '$1app.asar.unpacked');
// 도구 위치 — desktop\helper 에 넣어 두면 그걸 우선(설치판은 여기에 ffmpeg.exe·fonts\SUITE-*.otf 를 담는다), 없으면 기존 위치
const FFMPEG = [path.join(DESK_REAL, 'helper', 'ffmpeg.exe'), path.join(LAD, 'WNS_Helper', 'ffmpeg.exe'), 'R:\\[F]_Util\\WNS\\ffmpeg.exe'].find(exists) || 'ffmpeg';
// SUITE 폰트 폴더 후보(helper.py 와 같은 목록) — 있는지는 AE 보낼 때 비동기로 본다(네트워크 경로로 시작이 멈추지 않게)
const FONT_DIRS = require('./wns/find-tools').defaultFontsCandidates(DESK_REAL);
const FRAMES_DIR = path.join(LAD_APP, 'frames');
// Python 헬퍼(대체용) 원본/실행 위치 — WNS_START.bat과 같은 방식
const EXT_SRC_DIRS = [path.join(DESK_REAL, 'helper'), 'R:\\[F]_Util\\WNS'];
// 설치판의 앱 ID — 설치 프로그램이 만든 바로 가기와 같은 값이어야 작업 표시줄에 고정한 아이콘과 실행 중인 창이 한 칸으로 묶인다.
// tools/build-installer.cjs 의 APP_ID 와 같게(desktop/test/installer.test.cjs 가 비교). 개발판(electron .)은 건드리지 않는다.
const APP_ID = 'kr.co.sbs.weathercg';
if (app.isPackaged) app.setAppUserModelId(APP_ID);
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
    const port = await wns.listen(EMBED_PORT, '127.0.0.1');
    helperUrl = `http://127.0.0.1:${port || EMBED_PORT}`; helperKind = 'embedded';
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
const TITLEBAR_H = 48;
const TITLEBAR_DARK = { color: '#0f0f0f', symbolColor: '#f1f1f1' };
function createWindow() {
  const bounds = initialWindowBounds(screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea);
  win = new BrowserWindow({
    ...bounds,
    ...(TEST_SIZE ? { width: +TEST_SIZE[1], height: +TEST_SIZE[2], minWidth: 400, minHeight: 300 } : {}),
    fullscreen: false,
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
  win.once('ready-to-show', () => { if (TEST_MODE) { if (process.env.WCG_TEST_SHOW === '1') win.showInactive(); return; } win.show(); });   // 넓은 일반 창으로 시작. 점검 모드는 화면에 안 띄움(WCG_TEST_SHOW=1 = 보이게 — 숨김 창은 화면 찍기·rAF 가 멈춰 움직임 점검용)
  win.on('page-title-updated', (e) => e.preventDefault());   // 작업표시줄·Alt+Tab 창 이름은 늘 '날씨 CG' (웹 <title>로 안 바뀌게)
  win.on('closed', () => { if (wnuri && !wnuri.isDestroyed()) wnuri.destroy(); });   // 날씨누리 창이 남아 앱이 안 꺼지는 일 없게
  wireCloseGuard(win);   // 닫기 전 '저장하지 않은 변경' 묻기(아래)
  // 앱 업데이트 — 웹앱이 뜰 때마다(첫 화면·새로고침) 아직 안 고른 새 판 알림을 다시 건넨다(그 사이 보낸 알림은 페이지가 바뀌며 사라질 수 있다)
  win.webContents.on('did-finish-load', () => { const p = updater && updater.pending(); if (p && win && !win.isDestroyed()) win.webContents.send('wcg:update', p); });
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

// ---------- 공공데이터포털(생활기상·미세먼지) 받기 ----------
// 웹앱(js/data-maps.js dataSendOnce)이 wcgDesktop.dataFetch(주소, { timeoutMs }) → 'wcg:data-fetch'로 부른다. 받는 일은 desktop/data-fetch.js:
// apis.data.go.kr 만, 연결을 모아 다시 쓰고(keep-alive — 포털이 새 연결 첫 요청의 약 1/3을 30초 넘게 붙잡는다, 2026-10-10 실측),
// 새 연결이 늦으면 다른 연결로 하나 더, 첫 응답 시간 제한. 다시 보내기·기다릴 시간은 웹앱이 정한다.
// 프록시를 써야 하는 PC(헬퍼와 같은 기준 — 환경변수·인터넷 설정)면 'proxy'로 돌려보내 웹앱이 헬퍼(/api/kma) 길로 받는다.
// 부르는 쪽은 메인 창의 주 프레임(app://weathercg 웹앱)만. 자동 점검(WCG_TEST)에서는 WCG_TEST_DATA_FETCH=1 일 때만 실제로 받는다(아니면 'off' → 헬퍼 길 = 가짜 fetch).
const { createDataFetcher, DATA_HOST } = require('./data-fetch');
let dataFetcher = null;
function dataFetcherGet() {
  if (dataFetcher) return dataFetcher;
  const PU = require('./wns/pyurl');
  let secureContext;
  try { const ca = PU.caList(); if (ca) secureContext = require('tls').createSecureContext({ ca }); } catch (err) { secureContext = undefined; }   // 파이썬처럼 시스템 인증서도(사내 인증서)
  dataFetcher = createDataFetcher({
    agentOptions: secureContext ? { secureContext } : {},
    proxyFor: async () => { const cfg = await PU.systemProxyConfig(); return !!(cfg.proxies && cfg.proxies.https) && !PU.proxyBypass(DATA_HOST, cfg); },
  });
  return dataFetcher;
}
ipcMain.handle('wcg:data-fetch', (e, u, o) => {
  if (!privateKeyCallerOk(e, win)) return { ok: false, err: 'denied', detail: 'sender' };
  if (TEST_MODE && process.env.WCG_TEST_DATA_FETCH !== '1') return { ok: false, err: 'off' };
  return dataFetcherGet().fetch(String(u || ''), { timeoutMs: +(o && o.timeoutMs) || 0 });
});

// ---------- 지도 타일 디스크 캐시 ----------
// 웹앱(js/map-render.js tileFetch — Mapbox 실시간 타일·가벼운 지도 벡터 타일)이 wcgDesktop.tileGet(주소) → 'wcg:tile-get'으로 부른다.
// 한 번 받은 타일은 이 PC(%LOCALAPPDATA%\WeatherCG\tile-cache)에 두고 다음엔 디스크에서(desktop/tile-cache.js — 지도 타일 서버만, 30일, 2GB 넘으면 오래된 것부터).
// 받는 건 앱 기본 세션의 크로미움 네트워크 — 웹앱이 직접 받을 때와 같은 시스템 프록시·프록시 로그인을 쓴다(사내망에서 따로 세션은 프록시 인증에 막힐 수 있다).
// 점검 모드는 임시 사용자 폴더 안에(끝나면 지워짐). 메인이 못 받으면 웹앱이 그냥 fetch로 받는다(js/map-render.js tileFetch).
const { createTileCache } = require('./tile-cache');
let tileCache = null;
function tileCacheGet() {
  if (tileCache) return tileCache;
  const base = TEST_MODE ? app.getPath('userData') : LAD_APP;   // 캐시 자리(위 LAYOUT — NDT 면 NDT\cache, 설치 시험판은 따로)
  tileCache = createTileCache({ dir: path.join(base, 'tile-cache'), fetch: (u, init) => session.defaultSession.fetch(u, init) });
  return tileCache;
}
ipcMain.handle('wcg:tile-get', (e, u) => {
  if (!jtwcCallerOk(e)) return { ok: false, err: 'denied', detail: 'sender' };
  return tileCacheGet().get(String(u || ''));
});

// ---------- 렌더 결과 '폴더 열기'(2026-10-12) ----------
// 영상·이미지를 저장하면 웹앱이 완료 안내 옆에 [폴더 열기]를 띄운다(js/cg-setup.js outReveal*·js/export-dialog.js). 웹앱은 저장한 파일의 실제 경로를 모르므로
// (저장 폴더·저장창은 File System Access 핸들 — 이름만 준다) 메인이 경로를 기록해 두었다가 이름으로 찾아 준다(desktop/reveal.js):
//  · File System Access 권한 확인('fileSystem' — 고른 폴더·저장창 파일의 경로가 같이 온다. 하위 파일은 폴더 권한을 같이 써서 폴더 경로만)
//  · 내려받기 완료(데스크톱 내려받기는 저장창이 뜬다 — 이미지 ZIP 받기 등)
// 여는 것은 이번 실행에 저장한 곳(저장창 파일·고른 폴더 아래·내려받은 파일)이면서 지금 실제로 있는 것만, shell.showItemInFolder로만(실행 파일 열기 없음).
// 부르는 쪽은 메인 창 주 프레임만. 점검 모드(WCG_TEST)는 탐색기를 열지 않고 기록만('[reveal-test]' 줄 — desktop/test/reveal-flow-check.cjs).
const { createRevealRegistry } = require('./reveal');
const reveals = createRevealRegistry();
function watchSavedPaths(ses) {
  // 권한 확인 처리기를 두면 'fileSystem' 상태는 이 답이 정한다 → 늘 허용. 처리기가 없을 때도 Electron은 요청을 묻는 창 없이 모두 허용했다
  // (앱을 다시 켠 뒤 저장 폴더를 다시 허락받는 단계가 있었을 뿐 — 이제는 그 단계 없이 곧바로). 크로미움이 막는 폴더(AppData 등) 규칙은 따로라 그대로.
  // 다른 권한은 처리기가 없을 때(Electron 기본)와 같은 답: 'deprecated-sync-clipboard-read'만 거절(electron_permission_manager.cc CheckPermissionWithDetails).
  ses.setPermissionCheckHandler((_wc, permission, origin, d) => {
    if (permission === 'fileSystem') {
      if (d && d.fileAccessType === 'writable' && String(origin || '').replace(/\/+$/, '') === APP_ORIGIN) reveals.noteGrant(String(d.filePath || ''), !!d.isDirectory);
      return true;
    }
    return permission !== 'deprecated-sync-clipboard-read';
  });
  // 내려받기 — 저장 경로를 바꾸지 않는다(그대로 저장창). 끝나면 실제 경로를 기록
  ses.on('will-download', (_e, item, wc) => {
    if (!win || win.isDestroyed() || !wc || wc.id !== win.webContents.id) return;
    let done = null;
    try { done = reveals.noteDownloadStart(item.getFilename()); } catch (err) { return; }
    item.once('done', (_ev, state) => { let p = ''; try { p = item.getSavePath(); } catch (err) { /* 없음 */ } done(state, p); });
  });
}
// 방금 저장한 파일 경로 — { name, dir?, sub?, download?, waitMs? } → 경로 또는 ''
ipcMain.handle('wcg:saved-path', (e, h) => {
  if (!privateKeyCallerOk(e, win)) return '';
  return reveals.find(h);
});
// 탐색기에서 그 폴더를 열고 파일을 골라 둔다 → { ok: true, path } 또는 { ok: false, err: 'denied'|'gone'|'not-allowed' }
ipcMain.handle('wcg:reveal-path', (e, p) => {
  if (!privateKeyCallerOk(e, win)) return { ok: false, err: 'denied' };
  const fp = typeof p === 'string' ? p : '';
  // 허용 목록(글자 비교)을 먼저 — 허용 밖이면 디스크·네트워크를 건드리지 않고 같은 답(있는지 여부가 안 드러남)
  if (!fp || !path.isAbsolute(fp) || !reveals.allowed(fp)) return { ok: false, err: 'not-allowed' };
  if (!reveals.present(fp)) return { ok: false, err: 'gone' };
  if (TEST_MODE) { console.log('[reveal-test] ' + JSON.stringify(fp)); return { ok: true, path: fp, test: true }; }
  shell.showItemInFolder(fp);
  return { ok: true, path: fp };
});

// ---------- 작업창 화면 찍기(2026-10-27 — 불러와 칠할 때 NameDrop 물결, js/map-drop.js) ----------
// 웹앱이 칠하기 직전 작업창 자리(창 안 CSS 픽셀 사각형)를 찍어 덮개로 깔고, 칠한 뒤 고리가 지나간 안쪽을 뚫어 새 지도를 보인다(Graph CG electron/fx.js 와 같은 길).
// 돌려주는 것: { w, h, data(BGRA 바이트, 실제 픽셀) } 또는 null. 너무 크면(4MP 넘음) 줄여서 — 덮개는 1초 남짓만 보인다
ipcMain.handle('wcg:capture', async (e, r) => {
  if (!jtwcCallerOk(e) || win.isMinimized()) return null;
  const n = (v) => Math.max(0, Math.round(+v || 0));
  const rect = { x: n(r && r.x), y: n(r && r.y), width: n(r && r.width), height: n(r && r.height) };
  if (rect.width < 8 || rect.height < 8) return null;
  try {
    let img = await win.webContents.capturePage(rect);
    if (img.isEmpty()) return null;
    let s = img.getSize(), b = img.toBitmap(), k = Math.sqrt(b.length / 4 / Math.max(1, s.width * s.height));
    const px = s.width * k * s.height * k, MAX = 4e6;
    if (px > MAX) { const f = Math.sqrt(MAX / px); img = img.resize({ width: Math.round(s.width * k * f), quality: 'good' }); s = img.getSize(); b = img.toBitmap(); k = Math.sqrt(b.length / 4 / Math.max(1, s.width * s.height)); }
    return { w: Math.round(s.width * k), h: Math.round(s.height * k), data: b };
  } catch (err) { return null; }
});

// ---------- 닫기 전 묻기(저장하지 않은 변경·렌더 중) ----------
// 메인 창 닫기(X·Alt+F4·작업표시줄 닫기·앱 종료)는 막고 웹앱에 묻는다. 무엇을 물을지·팝업은 웹앱(js/project-io.js closeAsk),
// 순서와 안전장치(웹앱이 5초 안에 답이 없으면 그냥 닫기, 팝업 하나)는 desktop/close-guard.js.
const { createCloseGuard } = require('./close-guard');
let closeGuard = null;
function wireCloseGuard(w) {
  const guard = createCloseGuard({
    ask: (id) => {
      if (w.isDestroyed() || w.webContents.isCrashed()) return false;   // 웹앱(렌더러)이 죽었다 — 물을 곳이 없으니 곧바로 닫는다
      w.webContents.send('wcg:close-ask', id);
    },
    close: () => { if (!w.isDestroyed()) w.close(); },        // 다시 close 를 거친다(이번엔 통과) — 웹앱 beforeunload 자동 저장이 돈다
    destroy: () => { if (!w.isDestroyed()) w.destroy(); },    // 웹앱이 답하지 않음(멈춤) — 기다리지 않고 닫는다
    // 팝업이 떴다 — 최소화한 창(작업표시줄에서 닫기)은 되살리고 앞으로. 숨긴 창(점검 모드)은 띄우지 않는다
    reveal: () => { if (w.isDestroyed()) return; if (w.isMinimized()) w.restore(); else if (!w.isVisible()) return; w.focus(); },
  });
  closeGuard = guard;
  w.on('close', (e) => { if (guard.onClose()) e.preventDefault(); });
  w.on('session-end', () => guard.release());   // 윈도 종료·다시 시작·로그오프 — 막지 않는다(작업은 1.5초마다 자동 저장돼 있다)
}
// 웹앱 답 — 메인 창(웹앱)만
ipcMain.on('wcg:close-reply', (e, d) => {
  if (!closeGuard || !win || win.isDestroyed() || !e.sender || e.sender.id !== win.webContents.id) return;
  closeGuard.onReply(d && d.id, d && d.act);
});

// ---------- 앱 업데이트(2026-10-12) ----------
// 공유 폴더(기본 R:\[F]_Util\WNS\Ver — tools/publish-update.cjs 가 올림)의 latest.json 을 읽어 새 판이면 웹앱에 알리고('새 업데이트가 있습니다' — js/app-update.js),
// [지금 설치]면 설치 파일을 %TEMP%\wcg-update 로 복사·확인한 뒤 조용히 실행하고 앱을 끈다(설치 프로그램이 같은 자리에 덮어 깔고 새 판을 다시 켠다).
// 순서·검사는 desktop/updater.js. 저절로 확인은 설치판만 — 시험 폴더(WCG_UPDATE_DIR)를 주면 개발판·점검 모드에서도. 부르는 쪽은 메인 창 주 프레임만.
// 저장 안 한 작업 묻기는 웹앱이 [지금 설치] 전에 한다(닫기 전 묻기와 같은 팝업). 여기서 끌 때는 닫기 전 묻기를 다시 거치지 않는다(closeGuard.release).
// 이전 판으로 되돌리기(설정 메뉴 — 10-12)도 같은 'wcg:update-install' 에 { rollback: true } — 내역에 있는 낮은 판을 같은 길로 덮어 깐다.
// 업데이트 진행 창(10-13): 받기·확인이 끝나면 설치판에 든 desktop\helper\WeatherCG-Update.exe(asar 밖 — tools/build-update-ui.cjs)를 임시 폴더로 복사해 띄우고,
// 그 창이 떴다는 알림을 본 뒤 앱을 끈다. 창이 앱이 다 닫히길 기다려 설치(/S --updated)·새 판 실행까지 단계로 보여 준다. 없거나 못 띄우면 예전처럼 조용한 설치.
// 개발판은 desktop\helper(Git 제외)에 node tools/build-update-ui.cjs 로 구워 둘 수 있다(개발판은 설치하지 않으니 시험 DRYRUN 까지만).
const { createUpdater } = require('./updater');
const UPDATE_UI_EXE = path.join(DESK_REAL, 'helper', 'WeatherCG-Update.exe');
let updater = null;
function startUpdater() {
  if (updater) return;
  updater = createUpdater({
    current: app.getVersion(), variant: APP_VARIANT, packaged: app.isPackaged, testMode: TEST_MODE, env: process.env,
    // NDT 자리면 받은 설치 파일 사본·진행 창은 NDT\cache, 진행 창 기록은 NDT\logs(위 LAYOUT) — 예전 자리는 지금처럼 임시 폴더
    tempRoot: LAYOUT.kind === 'ndt' ? LAYOUT.cache : app.getPath('temp'), logDir: LAYOUT.kind === 'ndt' ? LAYOUT.logs : undefined,
    log: (m) => console.log('[update] ' + m),
    notify: (info) => { if (win && !win.isDestroyed()) win.webContents.send('wcg:update', info); },
    uiExe: [UPDATE_UI_EXE], appExe: process.execPath, pid: process.pid, product: app.getName(),
    releaseClose: () => { try { if (closeGuard) closeGuard.release(); } catch (e) { /* 창 없음 */ } },
    quitForInstall: () => { try { if (closeGuard) closeGuard.release(); } catch (e) { /* 창 없음 */ } app.quit(); },
  });
  updater.start();
}
ipcMain.handle('wcg:update-check', async (e) => {
  if (!privateKeyCallerOk(e, win)) return { state: 'denied' };
  startUpdater();
  return updater.check(true);
});
ipcMain.handle('wcg:update-later', (e, v) => {
  if (!privateKeyCallerOk(e, win) || !updater) return { ok: false };
  return updater.later(String(v || ''));
});
ipcMain.handle('wcg:update-install', async (e, v, o) => {
  if (!privateKeyCallerOk(e, win)) return { ok: false, err: 'denied' };
  startUpdater();
  const wc = e.sender;
  const send = (d) => { try { if (!wc.isDestroyed()) wc.send('wcg:update-progress', d); } catch (err) { /* 창 닫힘 */ } };
  return updater.install(String(v || ''), (got, total) => send({ got, total }),
    { rollback: !!(o && o.rollback === true), onPhase: (phase) => send({ phase: String(phase) }) });
});
ipcMain.handle('wcg:update-cancel', (e) => (privateKeyCallerOk(e, win) && updater ? updater.cancel() : false));

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
// app = 앱 버전(desktop/package.json version — 설치판은 빌드 때 그 값), packaged = 설치판인가. 설정 메뉴 맨 아래 줄에 보인다(js/export-video.js)
ipcMain.on('wcg:helper', (e) => { e.returnValue = { url: helperUrl, kind: helperKind, ver: HELPER_VER, app: app.getVersion(), packaged: app.isPackaged }; });
// 별도 입력 없는 공공데이터포털 기본 키. 일반 자동 점검에서는 실제 키를 전달하지 않는다.
ipcMain.on('wcg:data-key', (e) => {
  e.returnValue = privateKeyCallerOk(e, win) && (!TEST_MODE || process.env.WCG_TEST_DATA_KEY === '1') ? readDataPortalKey(__dirname) : '';
});
// Mapbox 기본 토큰(가벼운 지도 위성 사진 — 개인 주소가 없을 때, desktop/private/mapbox.token). preload가 invoke로 묻는다(sendSync는 받는 곳 없는 옛 메인이면 창이 멈춘다).
// 자동 점검에서는 실제 토큰을 주지 않는다 — WCG_TEST_MAPBOX_TOKEN(가짜 pk. 값)이 있으면 그 값(tests/gl-satellite.boot-eval.js — 요청은 합성 타일로)
ipcMain.handle('wcg:mapbox-token', (e) => {
  if (!privateKeyCallerOk(e, win)) return '';
  return TEST_MODE ? mapboxTokenOk(process.env.WCG_TEST_MAPBOX_TOKEN) : readMapboxToken(__dirname);
});
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
    watchSavedPaths(session.defaultSession);   // 렌더 결과 '폴더 열기' — 저장한 경로 기록(위)
    // 점검 모드: 도구 경로를 한 줄로 알린다(설치판 점검기 tools/check-installed.cjs 가 asar 밖 ffmpeg·폰트 자리를 본다 — 경로만, 키 없음)
    if (TEST_MODE) console.log('[wcg-paths] ' + JSON.stringify({ packaged: app.isPackaged, version: app.getVersion(), variant: APP_VARIANT, appDir: APP_DIR, ffmpeg: FFMPEG, fonts: FONT_DIRS[0], updateUi: exists(UPDATE_UI_EXE) ? UPDATE_UI_EXE : null }));
    if (TEST_MODE) { createWindow(); startUpdater(); return; }   // 점검 모드: 헬퍼 없이 화면만(업데이트는 시험 폴더 WCG_UPDATE_DIR 이 있을 때만)
    if (!(await startEmbeddedHelper()) && !INSTALL_TEST) {   // 내장 실패 → 웹판과 같은 Python 헬퍼를 켜서 쓴다(설치 시험판은 안 켬 — 사용자 헬퍼·폴더를 건드리지 않게)
      helperUrl = `http://127.0.0.1:${EXT_PORT}`; helperKind = 'external';
      ensureExternalHelper().then((st) => console.log('[WNS helper]', st));
    }
    console.log('[WNS helper]', helperKind, helperUrl, 'ffmpeg=', FFMPEG);
    createWindow();
    startUpdater();
  });
  app.on('window-all-closed', () => { app.quit(); });
  app.on('will-quit', () => {
    try { updater && updater.stop(); } catch (e) {}
    try { wns && wns.close(); } catch (e) {}
    try { dataFetcher && dataFetcher.close(); } catch (e) {}
    stopOwnExternalHelper();
  });
}

// 처리 안 된 예외로 앱이 조용히 죽지 않게 — 알리고 계속
process.on('uncaughtException', (e) => {
  console.error(e);
  try { dialog.showErrorBox('날씨 CG — 오류', String(e && e.stack || e)); } catch (_) {}
});
