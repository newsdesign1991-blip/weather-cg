'use strict';
// WNS 헬퍼(R:\[F]_Util\WNS\_src\helper.py)의 HTTP 서버를 Node로 옮긴 내장판 — 데스크톱(Electron) 메인 프로세스 안에서 돈다.
// 웹판은 기존 파이썬 헬퍼를 계속 쓰므로 응답 형식·상태코드·에러 문구·ffmpeg 인자를 파이썬과 똑같이 맞춘다.
// 파이썬 흉내 부품: pyfmt(int/repr/str), pyjson(json.loads·utf-8 디코드 오류 문구), pyurl(urllib·parse_qs·프록시).
// 보안 규칙(출처 검사·본문 상한·점 sid 거부·aePath 는 로컬 AfterFX.exe 만)도 helper.py 와 같다.
// API:
//   GET  /ping                         -> {"ok":true,"ff":bool,"ver":N,"embedded":true}
//   GET  /api/kma?u=<url>              -> 기상청/공공데이터 프록시(텍스트)
//   POST /api/frame?sid=&index=&ext=   -> 프레임 저장 (index=0 이면 세션 리셋 + 오래된 세션 폴더 정리), 본문 256MB까지
//   POST /api/finalize {sid,mode,tail} -> ffmpeg 인코딩 → 파일 바이트 응답, 본문 16MB까지
//   POST /api/ae {sid,aePath,...}      -> jsx 만들고 AfterFX -r 로 실행 → {"ok":true,"ae":..,"fontsOk":bool}, 본문 16MB까지
// 출처(Origin): 없음=허용('*'), GitHub Pages·app://weathercg·localhost/127.0.0.1/[::1]=허용(반사+Vary), 'null'=GET만, 그 밖 403(CORS 헤더 없음).
// 외부 npm 패키지 없이 Node 내장 모듈만 쓴다.
const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { pipeline } = require('stream/promises');
const P = require('./pyfmt');
const PJ = require('./pyjson');
const PU = require('./pyurl');
const T = require('./find-tools');

const HELPER_VER = 20261007;   // helper.py 의 HELPER_VER 과 맞춘다
const FPS = '30000/1001';      // 29.97 방송 표준
const PY_UA = 'Python-urllib/3.13';   // data.go.kr WAF가 다른 UA를 403으로 막음 → 파이썬 기본 UA 그대로

const CORS = [
  ['Access-Control-Allow-Origin', '*'],
  ['Access-Control-Allow-Methods', 'GET, POST, OPTIONS'],
  ['Access-Control-Allow-Headers', 'Content-Type'],
  ['Access-Control-Max-Age', '86400'],
];
// 허용 출처 — GitHub Pages 배포판, 데스크톱 앱, 로컬 개발 서버(localhost·127.0.0.1·[::1], 포트 무관)
const ALLOWED_ORIGINS = ['https://newsdesign1991-blip.github.io', 'app://weathercg'];
const LOCAL_ORIGIN = /^(?:https?:\/\/localhost|http:\/\/127\.0\.0\.1|http:\/\/\[::1\])(?::[0-9]{1,5})?$/;
// 본문 상한(Content-Length 기준) — 넘으면 본문을 읽지 않고 413
const BODY_MAX = new Map([['/api/frame', 256 * 1024 * 1024], ['/api/finalize', 16 * 1024 * 1024], ['/api/ae', 16 * 1024 * 1024]]);
const REASONS = { 413: 'Content Too Large' };   // 파이썬 3.13 http.server 문구와 같게

// 요청 출처 → 응답 CORS 헤더(없음='*', 허용=그 출처 반사+Vary), 거부면 null. 'null'(file://)은 GET만
function corsFor(origin, method) {
  if (origin === null || origin === undefined) return CORS;
  if (origin === 'null' && method !== 'GET') return null;
  if (origin === 'null' || ALLOWED_ORIGINS.includes(origin) || LOCAL_ORIGIN.test(origin)) {
    return [['Access-Control-Allow-Origin', origin], ['Vary', 'Origin']].concat(CORS.slice(1));
  }
  return null;
}

// 같은 이름 헤더가 여럿이면 첫 값(파이썬 headers.get 처럼, Node 의 ', ' 합치기 대신)
function firstHeader(req, name) {
  const rh = req.rawHeaders;
  for (let i = 0; i < rh.length; i += 2) if (rh[i].toLowerCase() === name) return rh[i + 1];
  return null;
}

// ── 파이썬 동작 흉내 도우미 ──

// json.dumps(obj, ensure_ascii=False) — 구분자 ", " / ": " 까지 같게
function pyDumps(v) {
  if (v === null || v === undefined) return 'null';
  if (v === true) return 'true';
  if (v === false) return 'false';
  if (typeof v === 'bigint') return v.toString();
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : (Number.isNaN(v) ? 'NaN' : (v > 0 ? 'Infinity' : '-Infinity'));
  if (typeof v === 'string') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(pyDumps).join(', ') + ']';
  return '{' + Object.keys(v).filter((k) => v[k] !== undefined).map((k) => JSON.stringify(k) + ': ' + pyDumps(v[k])).join(', ') + '}';
}

// type(v).__name__ — JSON 정수값은 int(웹앱 JSON.stringify 기준)
function pyTypeName(v) {
  if (typeof v === 'number') return Number.isInteger(v) && Math.abs(v) < 1e21 ? 'int' : 'float';
  return P.typeName(v);
}
function pyErr(type, msg) { const e = new Error(msg); e.pyType = type; return e; }

// str(e) — pyfmt 오류는 'ValueError: ...' 꼴이라 앞머리를 뗀다
function errMsg(e) {
  if (!e) return String(e);
  let m = typeof e.message === 'string' ? e.message : String(e);
  if (e.pyType && m.startsWith(e.pyType + ': ')) m = m.slice(e.pyType.length + 2);
  return m;
}

// "%05d" % n (n: BigInt)
function fmt05(n) {
  const b = BigInt(n);
  const neg = b < 0n;
  const s = (neg ? -b : b).toString();
  return neg ? '-' + s.padStart(4, '0') : s.padStart(5, '0');
}

// 파이썬 문자열 비교(코드포인트 순)
function cmpCodepoint(a, b) {
  const A = Array.from(a), B = Array.from(b);
  const n = Math.min(A.length, B.length);
  for (let i = 0; i < n; i++) {
    const x = A[i].codePointAt(0), y = B[i].codePointAt(0);
    if (x !== y) return x < y ? -1 : 1;
  }
  return A.length - B.length;
}

// os.path.splitext(name)[1] (앞쪽 점은 확장자로 안 봄)
function pySplitextExt(name) {
  const sep = Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\'));
  const dot = name.lastIndexOf('.');
  if (dot > sep) {
    for (let i = sep + 1; i < dot; i++) if (name[i] !== '.') return name.slice(dot);
  }
  return '';
}

// urllib.parse.parse_qs (빈 값은 버림)
const pyParseQs = (qs) => PU.parseQs(qs);

// safe() — str.isalnum() 은 한글 등 유니코드 문자/숫자도 참. 80자(코드포인트) 제한, 비면 's'
function safe(s) {
  const kept = [];
  for (const ch of P.pyStr(s)) {
    if (/^[\p{L}\p{N}]$/u.test(ch) || ch === '-' || ch === '_' || ch === '.') kept.push(ch);
  }
  return kept.slice(0, 80).join('') || 's';
}
// 보안: '.', '..' 같은 sid 는 FRAMES 자신이나 상위 폴더를 가리킨다 → 거부(helper.py bad_sid 와 같음)
const badSid = (sid) => /^\.+$/.test(sid);
function checkSid(sid) {
  if (badSid(sid)) { const e = new Error('잘못된 sid'); e.httpStatus = 400; throw e; }
  return sid;
}

// json.loads(body.decode('utf-8')) 후 dict 인지 확인(.get 호출 흉내)
function pyLoadsObj(buf) {
  const obj = PJ.pyJsonLoadsBytes(buf);
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) throw pyErr('AttributeError', "'" + pyTypeName(obj) + "' object has no attribute 'get'");
  return obj;
}

// 보안: 앱이 넘긴 aePath 는 로컬의 AfterFX.exe 파일만 인정(UNC 는 존재 확인도 안 함, 문자열 아니면 무시) — helper.py is_afterfx_exe
function isAfterFxExe(p) {
  if (typeof p !== 'string' || /^[\\/]{2}/.test(p)) return false;
  if (ntBasename(p).toLowerCase() !== 'afterfx.exe') return false;
  try { return fs.statSync(p).isFile(); } catch (e) { return false; }
}

const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch (e) { return false; } };

// shutil.rmtree(d, ignore_errors=True) — 실패한 항목은 건너뛰고 나머지는 계속 지운다. 링크(정션)·파일 자체는 지우지 않음(파이썬처럼)
async function rmTree(d) {
  try { const st = await fsp.lstat(d); if (st.isSymbolicLink() || !st.isDirectory()) return; } catch (e) { return; }
  let ents;
  try { ents = await fsp.readdir(d, { withFileTypes: true }); } catch (e) {
    try { await fsp.rmdir(d); } catch (_) { /* 무시 */ }
    return;
  }
  for (const ent of ents) {
    const p = path.join(d, ent.name);
    if (ent.isDirectory() && !ent.isSymbolicLink()) await rmTree(p);
    else { try { await fsp.unlink(p); } catch (e) { try { await fsp.rmdir(p); } catch (_) { /* 무시 */ } } }
  }
  try { await fsp.rmdir(d); } catch (e) { /* 무시 */ }
}

// 오래된 세션 폴더 정리 — 'ae…'(AE 보내기 이미지)는 14일, 그 밖(wns·mov 등 렌더 세션)은 1일 지난 것. keep 은 건드리지 않음(helper.py prune_frames)
const PRUNE_AE_DAYS = 14, PRUNE_OTHER_DAYS = 1;
async function pruneFrames(dir, keep = null, now = Date.now()) {
  let names;
  try { names = await fsp.readdir(dir); } catch (e) { return; }
  for (const nm of names) {
    if (nm === keep) continue;
    let st;
    try { st = await fsp.lstat(path.join(dir, nm)); } catch (e) { continue; }
    if (st.isSymbolicLink() || !st.isDirectory()) continue;
    if (now - st.mtimeMs > (nm.startsWith('ae') ? PRUNE_AE_DAYS : PRUNE_OTHER_DAYS) * 86400000) await rmTree(path.join(dir, nm));
  }
}

// ntpath.join(a, *p) — 정규화하지 않는다(레지스트리 값 문자열을 파이썬과 같게)
function ntSplitRoot(p) {   // → [drive, root, rest]
  const unc = /^[\\/]{2}[^\\/]+[\\/][^\\/]*/.exec(p);
  const drive = unc ? unc[0] : (/^[A-Za-z]:/.test(p) ? p.slice(0, 2) : '');
  const rest = p.slice(drive.length);
  return /^[\\/]/.test(rest) ? [drive, rest[0], rest.slice(1)] : [drive, '', rest];
}
function ntJoin(a, ...parts) {
  let [rd, rr, rp] = ntSplitRoot(a);
  for (const p of parts) {
    const [pd, pr, pp] = ntSplitRoot(p);
    if (pr) { if (pd || !rd) rd = pd; rr = pr; rp = pp; continue; }
    if (pd && pd !== rd) {
      if (pd.toLowerCase() !== rd.toLowerCase()) { rd = pd; rr = pr; rp = pp; continue; }
      rd = pd;
    }
    if (rp && !/[\\/]$/.test(rp)) rp += '\\';
    rp += pp;
  }
  if (rp && !rr && rd && !/[:\\/]$/.test(rd)) return rd + '\\' + rp;
  return rd + rr + rp;
}

// ── 방송용 MXF(XDCAM HD422 50Mbps) — helper.py 원본 그대로 (코덱 바꾸면 스튜디오 블랙 위험) ──
const SCALE_TV = 'scale=1920:1080:flags=lanczos+accurate_rnd+full_chroma_int'
  + ':in_range=full:out_range=tv:out_color_matrix=bt709';
const TFF = 'setfield=tff';
const SILENT_IN = ['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=mono'];
const SILENT_MAP = ['-map', '0:v', '-map', '1:a', '-map', '1:a'];
const SILENT_ENC = ['-c:a', 'pcm_s24le', '-ar', '48000', '-shortest'];

function xdcam() {
  return ['-c:v', 'mpeg2video', '-profile:v', '0', '-level:v', '2', '-pix_fmt', 'yuv422p',
    '-b:v', '50M', '-minrate', '50M', '-maxrate', '50M',
    '-bufsize', '17825792', '-rc_init_occupancy', '17825792',
    '-g', '15', '-bf', '2', '-flags', '+ildct+ilme',
    '-intra_vlc', '1', '-non_linear_quant', '1', '-intra_dc_precision', '2',
    '-qmin', '1', '-lmin', '1', '-qmax', '28',
    '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-color_range', 'tv',
    '-aspect', '16:9'];
}

const tailSec = (tail) => { const t = P.int(tail); return (t < 0n ? 0n : t).toString(); };   // "%d" % max(0, int(tail))

function mxfArgs(pattern, tail, out, ffmpeg = 'ffmpeg') {
  const vf = SCALE_TV + ',tpad=stop_mode=clone:stop_duration=' + tailSec(tail) + ',format=yuv422p,' + TFF;
  return [ffmpeg, '-y', '-threads', '0', '-framerate', FPS, '-i', pattern]
    .concat(SILENT_IN, SILENT_MAP, ['-vf', vf], xdcam(), SILENT_ENC, ['-f', 'mxf', out]);
}

function movArgs(pattern, tail, out, ffmpeg = 'ffmpeg') {
  const vf = 'scale=1920:1080:flags=lanczos,tpad=stop_mode=clone:stop_duration=' + tailSec(tail) + ',format=argb';
  return [ffmpeg, '-y', '-threads', '0', '-framerate', FPS, '-i', pattern,
    '-vf', vf, '-c:v', 'qtrle', '-pix_fmt', 'argb', '-an', out];
}

// ── 자식 프로세스 ──

// subprocess.run(capture_output) 흉내 — 실행 실패만 reject, 종료코드는 그대로 돌려준다
function runCapture(cmd, args, timeoutMs = 0) {
  return new Promise((resolve, reject) => {
    let cp;
    try { cp = spawn(cmd, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { reject(e); return; }
    const out = [], err = [];
    let timer = null;
    cp.stdout.on('data', (b) => out.push(b));
    cp.stderr.on('data', (b) => err.push(b));
    cp.on('error', (e) => { if (timer) clearTimeout(timer); reject(e); });
    cp.on('close', (code) => {
      if (timer) clearTimeout(timer);
      resolve({ code, stdout: Buffer.concat(out), stderr: Buffer.concat(err) });
    });
    if (timeoutMs > 0) timer = setTimeout(() => { try { cp.kill(); } catch (e) { /* 무시 */ } }, timeoutMs);
  });
}

// text=True 의 universal newlines(\r\n, \r → \n)
const pyText = (buf) => buf.toString('utf8').replace(/\r\n?/g, '\n');
// str.splitlines()
const pySplitlines = (s) => s.split(/\r\n|[\n\r\x0b\x0c\x1c\x1d\x1e\x85\u2028\u2029]/);

// ── After Effects 찾기 ──
const AFX_ROOTS = ['C:\\Program Files\\Adobe', 'C:\\Program Files (x86)\\Adobe'];

// ntpath.split — Node path.win32.dirname('a.exe') 는 '.' 이지만 파이썬은 '' 라서 직접 구현
function ntSplit(p) {
  const dm = /^(?:[A-Za-z]:|[\\/]{2}[^\\/]+[\\/][^\\/]+)/.exec(p);
  const drive = dm ? dm[0] : '';
  const rest = p.slice(drive.length);
  let i = rest.length;
  while (i && rest[i - 1] !== '\\' && rest[i - 1] !== '/') i--;
  let head = rest.slice(0, i);
  head = head.replace(/[\\/]+$/, '') || head;
  return [drive + head, rest.slice(i)];
}
const ntDirname = (p) => ntSplit(p)[0];
const ntBasename = (p) => ntSplit(p)[1];

function afxName(p) {
  const m = /After Effects ([^\\/]+)[\\/]Support/.exec(p || '');
  if (m) return 'After Effects ' + m[1];
  return ntBasename(ntDirname(ntDirname(p || ''))) || (p || '');
}

// 설치된 AfterFX.exe 전부 → [{path,name}] (경로 문자열 내림차순 = 최신 우선)
function listAfterFx(roots = AFX_ROOTS) {
  const found = new Set();
  for (const root of roots) {
    let names = [];
    try { names = fs.readdirSync(root); } catch (e) { continue; }
    for (const name of names) {
      if (name.startsWith('.')) continue;
      if (!name.toLowerCase().startsWith('adobe after effects ')) continue;   // 윈도 glob 은 대소문자 무시
      const p = root + '\\' + name + '\\Support Files\\AfterFX.exe';
      try { fs.lstatSync(p); found.add(p); } catch (e) { /* 없음 */ }
    }
  }
  return Array.from(found).sort((a, b) => cmpCodepoint(b, a)).map((p) => ({ path: p, name: afxName(p) }));
}

// 실행 중인 AfterFX.exe 경로(없으면 null) — wmic, 없으면 PowerShell
async function findRunningAfterFx() {
  try {
    const r = await runCapture('wmic', ['process', 'where', "name='AfterFX.exe'", 'get', 'ExecutablePath', '/value'], 20000);
    for (let line of pySplitlines(pyText(r.stdout))) {
      line = PU.pyStrip(line);
      if (line.toLowerCase().startsWith('executablepath=')) {
        const p = PU.pyStrip(line.slice(line.indexOf('=') + 1));
        if (p && fs.existsSync(p)) return p;
      }
    }
  } catch (e) { /* wmic 없음 */ }
  try {
    const r = await runCapture('powershell', ['-NoProfile', '-Command',
      'Get-Process AfterFX -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Path'], 20000);
    const p = PU.pyStrip(pyText(r.stdout));
    if (p && fs.existsSync(p)) return p;
  } catch (e) { /* 무시 */ }
  return null;
}

// ── SUITE 폰트 사용자 계정 설치(관리자 불필요) ──
const SUITE_FONTS = [
  ['SUITE-Light.otf', 'SUITE Light (OpenType)'],
  ['SUITE-Regular.otf', 'SUITE Regular (OpenType)'],
  ['SUITE-Medium.otf', 'SUITE Medium (OpenType)'],
  ['SUITE-SemiBold.otf', 'SUITE SemiBold (OpenType)'],
  ['SUITE-Bold.otf', 'SUITE Bold (OpenType)'],
  ['SUITE-ExtraBold.otf', 'SUITE ExtraBold (OpenType)'],
  ['SUITE-Heavy.otf', 'SUITE Heavy (OpenType)'],
];
const FONTS_REG_KEY = 'HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Fonts';
const DEFAULT_FONTS_DIRS = T.defaultFontsCandidates();   // helper.py suite_font_dirs 와 같은 순서

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// reg.exe 출력은 콘솔 코드페이지일 수 있음 → utf-8 실패 시 euc-kr(cp949)로
function decodeConsole(buf) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (e) { return new TextDecoder('euc-kr').decode(buf); }
}

// reg query 출력에서 값 찾기 — QueryValueEx 처럼 값 이름은 대소문자 무시
function parseRegQuery(text, name) {
  const re = new RegExp('^ {4}' + escRe(name) + ' {4}REG_\\w+(?: {4}(.*))?$', 'i');
  for (const line of String(text).split(/\r\n|\r|\n/)) {
    const m = re.exec(line);
    if (m) return m[1] === undefined ? '' : m[1];
  }
  return null;
}
async function regQueryValue(key, name) {
  const r = await runCapture('reg', ['query', key, '/v', name], 20000);
  if (r.code !== 0) return null;
  return parseRegQuery(decodeConsole(r.stdout), name);
}

async function regSetSz(key, name, value) {
  const r = await runCapture('reg', ['add', key, '/v', name, '/t', 'REG_SZ', '/d', value, '/f'], 20000);
  if (r.code !== 0) throw new Error('reg add 실패: ' + name);
}

// WM_FONTCHANGE 브로드캐스트 — 파이썬처럼 끝날 때까지 기다린다(그 뒤에 AE 실행)
function broadcastFontChange(timeoutMs = 15000) {
  const ps = 'Add-Type -Namespace WnsF -Name U -MemberDefinition \'[DllImport("user32.dll")] public static extern IntPtr SendMessageTimeout(IntPtr h, uint m, UIntPtr w, IntPtr l, uint f, uint t, IntPtr r);\'; '
    + '[void][WnsF.U]::SendMessageTimeout([IntPtr]0xffff, 0x1D, [UIntPtr]::Zero, [IntPtr]::Zero, 0, 1000, [IntPtr]::Zero)';
  return runCapture('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], timeoutMs).catch(() => null);
}

// 원본 찾기 — 앞 후보에 있으면 뒤(네트워크 경로)는 보지 않고, 비동기라 네트워크가 느려도 창이 멈추지 않는다
async function firstExisting(paths) {
  for (const p of paths) { try { await fsp.access(p); return p; } catch (e) { /* 다음 후보 */ } }
  return null;
}

// fontsDirs 에서 SUITE 7종(SUITE-*.otf 만 — WantedSans 가변폰트는 AE 폰트스캔을 멈추게 해서 절대 설치 안 함)을 찾아
// 사용자 폰트 폴더로 복사 + HKCU 등록. 7종 모두 처리되면 true(→ /api/ae 의 fontsOk).
// o.targetDir / o.register:false / o.broadcast(false|함수) / o.regQuery·o.regSet(가짜 레지스트리) / o.localAppData 는 테스트용
async function ensureSuiteFonts(fontsDirs = DEFAULT_FONTS_DIRS, o = {}) {
  try {
    const la = o.localAppData !== undefined ? o.localAppData : (process.env.LOCALAPPDATA || '');
    const fontsDir = o.targetDir || ntJoin(la, 'Microsoft', 'Windows', 'Fonts');
    const register = o.register !== false;
    const rq = o.regQuery || regQueryValue, rset = o.regSet || regSetSz;
    await fsp.mkdir(fontsDir, { recursive: true });
    let newly = false, installed = 0;
    for (const [filename, regName] of SUITE_FONTS) {
      const src = await firstExisting((fontsDirs || []).map((d) => ntJoin(d, filename)));
      if (!src) continue;
      const dst = ntJoin(fontsDir, filename);
      if (!fs.existsSync(dst)) {
        await fsp.copyFile(src, dst);   // shutil.copy2 → 시각도 복사
        try { const st = await fsp.stat(src); await fsp.utimes(dst, st.atime, st.mtime); } catch (e) { /* 무시 */ }
        newly = true;
      }
      if (register) {
        const cur = await rq(FONTS_REG_KEY, regName);
        if (cur !== dst) { await rset(FONTS_REG_KEY, regName, dst); newly = true; }
      }
      installed++;
    }
    if (newly && register && o.broadcast !== false) await (typeof o.broadcast === 'function' ? o.broadcast() : broadcastFontChange());
    return installed === SUITE_FONTS.length;
  } catch (e) {
    return false;
  }
}

// ── 기상청 프록시(pyurl 로 urllib 그대로) ──
const urlopen = (u, o = {}) => PU.urlopen(u, o);
const decodeKmaBody = (buf) => PU.decodeKmaBody(buf);
function kmaHostOk(u) { try { return PU.kmaUrlAllowed(u); } catch (e) { return false; } }

// ffmpeg 위치: 파일이 없고 이름만 왔으면(main.js 의 'ffmpeg') 파이썬 shutil.which 처럼 PATH 에서
function resolveFfmpeg(p) {
  if (!p) return null;
  try { if (fs.existsSync(p)) return p; } catch (e) { /* 무시 */ }
  if (!/[\\/]/.test(p)) return T.whichSync(p) || p;
  return p;
}

// BaseHTTPRequestHandler 의 기본 HTML 오류 응답(send_error)
const ERR_PAGE = (code, message, explain) => '<!DOCTYPE HTML>\n<html lang="en">\n    <head>\n        <meta charset="utf-8">\n'
  + '        <title>Error response</title>\n    </head>\n    <body>\n        <h1>Error response</h1>\n'
  + '        <p>Error code: ' + code + '</p>\n        <p>Message: ' + message + '.</p>\n'
  + '        <p>Error code explanation: ' + code + ' - ' + explain + '.</p>\n    </body>\n</html>\n';
const htmlEsc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');   // html.escape(quote=False)

// ── 서버 ──
function createWnsServer(opts = {}) {
  const cfg = {
    ffmpegPath: resolveFfmpeg(opts.ffmpegPath || null),
    framesDir: opts.framesDir || path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'WNS_Helper', 'frames'),
    fontsDirs: opts.fontsDirs || DEFAULT_FONTS_DIRS,
    helperVer: opts.helperVer || HELPER_VER,
    aeDryRun: !!opts.aeDryRun,
    fontsInstall: opts.fontsInstall !== false,
    log: typeof opts.log === 'function' ? opts.log : () => {},
    // 아래는 테스트용 주입(없으면 실제 함수)
    listAfterFx: opts.listAfterFx || listAfterFx,
    findRunningAfterFx: opts.findRunningAfterFx || findRunningAfterFx,
    buildAeJsx: opts.buildAeJsx || null,
    ensureSuiteFonts: opts.ensureSuiteFonts || ensureSuiteFonts,
    runFfmpeg: opts.runFfmpeg || ((args) => runCapture(args[0], args.slice(1))),   // windowsHide = CREATE_NO_WINDOW
    spawnAe: opts.spawnAe || null,
    kmaTimeout: opts.kmaTimeout || 20000,
    kmaProxyConfig: opts.kmaProxyConfig || undefined,
    kmaCa: opts.kmaCa || undefined,
    tmpDir: opts.tmpDir || null,
  };

  function send(res, code, obj, ctype = 'application/json; charset=utf-8', body = null) {
    if (res.headersSent || res.destroyed) return;
    if (obj !== undefined && obj !== null) body = Buffer.from(pyDumps(obj), 'utf8');
    for (const [k, v] of (res.wnsCors || CORS)) res.setHeader(k, v);
    if (body !== null && body !== undefined) {
      res.setHeader('Content-Type', ctype);
      res.setHeader('Content-Length', String(body.length));
    }
    res.writeHead(code, REASONS[code]);
    res.end(body !== null && body !== undefined ? body : undefined);
  }

  // 출처 검사 — 거부면 CORS 헤더 없이 403 을 보내고 false. 본문은 읽지 않고 연결을 끊는다(파이썬은 HTTP/1.0 이라 늘 끊음)
  function originOk(req, res) {
    const c = corsFor(firstHeader(req, 'origin'), req.method);
    if (!c) {
      res.wnsCors = [];
      res.setHeader('Connection', 'close');
      send(res, 403, { ok: false, error: '허용되지 않은 출처' });
      return false;
    }
    res.wnsCors = c;
    return true;
  }

  // send_error(code, message, explain) — 상태줄 사유 문구도 message, 연결은 닫는다
  function sendError(req, res, code, message, explain) {
    const body = Buffer.from(ERR_PAGE(code, htmlEsc(message), htmlEsc(explain)), 'utf8');
    res.setHeader('Connection', 'close');
    res.setHeader('Content-Type', 'text/html;charset=utf-8');
    res.setHeader('Content-Length', String(body.length));
    res.writeHead(code, message);
    res.end(req.method === 'HEAD' ? undefined : body);
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      req.on('data', (b) => chunks.push(b));
      req.on('end', () => resolve(Buffer.concat(chunks)));
      req.on('error', reject);
    });
  }

  const ffExists = () => !!cfg.ffmpegPath && fs.existsSync(cfg.ffmpegPath);

  async function doGet(req, res, p, query) {
    req.resume();
    if (p === '/ping') return send(res, 200, { ok: true, ff: ffExists(), ver: cfg.helperVer, embedded: true });
    // 기상청 API허브 프록시 (CORS 우회). apihub.kma.go.kr 등만 허용.
    if (p === '/api/kma') {
      const q = PU.parseQs(query);
      const u = (q.u || [''])[0];
      try {
        if (!PU.kmaUrlAllowed(u)) return send(res, 400, { ok: false, error: '허용되지 않은 주소' });
        const raw = await urlopen(u, { timeout: cfg.kmaTimeout, userAgent: PY_UA, proxyConfig: cfg.kmaProxyConfig, ca: cfg.kmaCa });
        const txt = decodeKmaBody(raw);
        return send(res, 200, null, 'text/plain; charset=utf-8', Buffer.from(txt, 'utf8'));
      } catch (e) {
        return send(res, 502, { ok: false, error: errMsg(e) });
      }
    }
    return send(res, 404, { ok: false });
  }

  async function doPost(req, res, p, query) {
    try {
      const lim = BODY_MAX.get(p);
      if (lim !== undefined && Number(req.headers['content-length'] || 0) > lim) {
        res.setHeader('Connection', 'close');   // 본문은 읽지 않고 끊는다
        return send(res, 413, { ok: false, error: '요청이 너무 큽니다' });
      }

      if (p === '/api/frame') {
        const q = PU.parseQs(query);
        const sid = safe((q.sid || ['s'])[0]);
        const idx = P.int((q.index || ['0'])[0]);
        let ext = (q.ext || ['png'])[0].toLowerCase();
        if (ext !== 'png' && ext !== 'jpg') ext = 'png';
        const d = path.join(cfg.framesDir, checkSid(sid));
        if (idx === 0n) {
          await pruneFrames(cfg.framesDir, sid);   // 새 세션 시작 — 오래된 세션 폴더 정리(지금 sid 는 제외)
          if (isDir(d)) await rmTree(d);
        }
        await fsp.mkdir(d, { recursive: true });
        await pipeline(req, fs.createWriteStream(path.join(d, 'f_' + fmt05(idx) + '.' + ext)));   // 큰 본문도 스트리밍 저장
        return send(res, 200, { ok: true });
      }

      if (p === '/api/finalize') {
        const obj = pyLoadsObj(await readBody(req));
        const sid = safe(P.or(obj.sid, 's'));
        if (!ffExists()) {
          if (!badSid(sid)) await rmTree(path.join(cfg.framesDir, sid));   // 인코딩을 못 해도 올라온 프레임은 지운다
          return send(res, 500, { ok: false, error: 'ffmpeg.exe 없음 (헬퍼 옆에 두세요)' });
        }
        const modeV = P.or(obj.mode, 'mxf');
        if (typeof modeV !== 'string') throw pyErr('AttributeError', "'" + pyTypeName(modeV) + "' object has no attribute 'lower'");
        const mode = modeV.toLowerCase();
        const tail = P.int(P.or(obj.tail, 0));
        const d = path.join(cfg.framesDir, checkSid(sid));
        const frames = isDir(d) ? (await fsp.readdir(d)).sort(cmpCodepoint) : [];
        if (!frames.length) return send(res, 400, { ok: false, error: '프레임 없음' });
        const fext = pySplitextExt(frames[0]).replace(/^\.+/, '') || 'png';   // 실제 프레임 확장자(png/jpg)
        const ext = mode === 'mov' ? 'mov' : 'mxf';
        // 임시 파일로 인코딩한 뒤 결과를 바이트로 응답(저장 위치는 앱이 고름)
        const out = path.join(cfg.tmpDir || os.tmpdir(), 'wns_' + sid + '.' + ext);
        const pattern = path.join(d, 'f_%05d.' + fext);
        const args = mode === 'mov' ? movArgs(pattern, tail, out, cfg.ffmpegPath) : mxfArgs(pattern, tail, out, cfg.ffmpegPath);
        const r = await cfg.runFfmpeg(args);
        await rmTree(d);
        if (r.code !== 0 || !fs.existsSync(out)) {
          const tailErr = Array.from(pyText(r.stderr)).slice(-700).join('');
          return send(res, 500, { ok: false, error: 'ffmpeg 실패\n' + tailErr });
        }
        const st = await fsp.stat(out);
        for (const [k, v] of (res.wnsCors || CORS)) res.setHeader(k, v);
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Length', String(st.size));
        res.writeHead(200);
        // 파이썬은 다 읽고 지운 뒤 보낸다 → 여기선 스트리밍하되, 끝나거나 끊겨도 반드시 임시 파일을 지운다
        const rs = fs.createReadStream(out);
        rs.once('close', () => { fsp.rm(out, { force: true }).catch(() => {}); });
        res.once('close', () => rs.destroy());
        rs.on('error', (e) => { cfg.log('[wns] 결과 전송 실패: ' + errMsg(e)); res.destroy(e); });
        rs.pipe(res);
        return;
      }

      if (p === '/api/ae') {
        const obj = pyLoadsObj(await readBody(req));
        const sid = safe(P.or(obj.sid, 'ae'));
        const d = path.join(cfg.framesDir, checkSid(sid));
        if (!isDir(d) || !(await fsp.readdir(d)).length) {
          return send(res, 400, { ok: false, error: '레이어 이미지가 없습니다 (먼저 전송하세요)' });
        }
        // AE 선택: (1) 앱이 고른 경로(aePath — 로컬 AfterFX.exe 만) → (2) 실행 중인 AE → (3) 설치 1개 → (4) 여러 개면 앱에 선택 요청
        let afx = null;
        const aePath = obj.aePath;
        if (isAfterFxExe(aePath)) {
          afx = aePath;
        } else {
          afx = await cfg.findRunningAfterFx();
          if (!afx) {
            const vers = await cfg.listAfterFx();
            if (!vers.length) return send(res, 500, { ok: false, error: 'After Effects를 못 찾았습니다 (설치 확인)' });
            if (vers.length === 1) afx = vers[0].path;
            else return send(res, 200, { ok: false, choose: true, versions: vers });
          }
        }
        // Wanted 가변폰트는 설치 안 함(AE 폰트스캔 멈춤 원인). SUITE만 — 결과는 fontsOk 로 앱에 알림
        const fontsOk = cfg.fontsInstall ? !!(await cfg.ensureSuiteFonts(cfg.fontsDirs)) : false;
        const build = cfg.buildAeJsx || require('./ae-jsx').buildAeJsx;
        const jsx = String(await build(obj, d));
        const jsxpath = path.join(d, '_import.jsx');
        await fsp.writeFile(jsxpath, jsx.replace(/\n/g, '\r\n'), 'utf8');   // 파이썬 텍스트 모드 쓰기(\n → \r\n)
        if (cfg.aeDryRun) return send(res, 200, { ok: true, ae: 'dry-run', jsx: jsxpath, afx, fontsOk });
        // AfterFX -r <script> : AE가 켜져 있으면 그 인스턴스에서, 아니면 새로 켜서 실행
        if (cfg.spawnAe) await cfg.spawnAe(afx, ['-r', jsxpath]);   // 테스트용 가짜 실행
        else await new Promise((resolve, reject) => {
          const cp = spawn(afx, ['-r', jsxpath], { detached: true, stdio: 'ignore' });
          cp.once('error', reject);
          cp.once('spawn', () => { cp.unref(); resolve(); });
        });
        return send(res, 200, { ok: true, ae: ntBasename(ntDirname(ntDirname(afx))), fontsOk });
      }

      req.resume();
      return send(res, 404, { ok: false });
    } catch (e) {
      cfg.log('[wns] ' + p + ' 오류: ' + errMsg(e));
      req.resume();
      return send(res, e.httpStatus || 500, { ok: false, error: errMsg(e) });
    }
  }

  async function handle(req, res) {
    // handle_one_request: 요청줄 65536 바이트 초과 → 414, 헤더 100줄 이상/한 줄 65536 초과 → 431
    const reqLineLen = req.method.length + 1 + req.url.length + 1 + ('HTTP/' + req.httpVersion).length + 2;
    if (reqLineLen > 65536) { req.resume(); return sendError(req, res, 414, 'URI Too Long', 'URI is too long'); }
    const rh = req.rawHeaders;
    for (let i = 0; i < rh.length; i += 2) {
      if (rh[i].length + 2 + rh[i + 1].length + 2 > 65536) { req.resume(); return sendError(req, res, 431, 'Line too long', 'got more than 65536 bytes when reading header line'); }
    }
    if (rh.length / 2 + 1 > 100) { req.resume(); return sendError(req, res, 431, 'Too many headers', 'got more than 100 headers'); }
    if (req.method === 'OPTIONS') { req.resume(); return originOk(req, res) ? send(res, 204) : undefined; }
    if (req.method !== 'GET' && req.method !== 'POST') {
      req.resume();
      return sendError(req, res, 501, 'Unsupported method (' + P.pyRepr(req.method) + ')', 'Server does not support this operation');
    }
    if (!originOk(req, res)) return undefined;   // 파이썬 do_GET/do_POST 첫 줄과 같은 순서(주소 해석 전)
    // urlparse(self.path) — http.server 는 앞의 // 를 / 하나로. 파싱 오류(예: Invalid IPv6 URL)면 응답 없이 연결을 끊는다
    let target = String(req.url || '');
    if (target.startsWith('//')) target = '/' + target.replace(/^\/+/, '');
    let pu;
    try { pu = PU.urlparse(target); } catch (e) {
      cfg.log('[wns] 요청 주소 해석 실패: ' + errMsg(e));
      req.socket.destroy();
      return undefined;
    }
    if (req.method === 'GET') return doGet(req, res, pu.path, pu.query);
    return doPost(req, res, pu.path, pu.query);
  }

  // 요청줄 64KB·헤더 100줄까지 받도록(파이썬 http.server 한도) 넉넉히
  const srv = http.createServer({ maxHeaderSize: 101 * 65537 }, (req, res) => {
    handle(req, res).catch((e) => {
      cfg.log('[wns] 처리 오류: ' + errMsg(e));
      try { send(res, 500, { ok: false, error: errMsg(e) }); } catch (_) { /* 무시 */ }
    });
  });
  // 파이썬(HTTP/1.0)은 100 Continue 를 보내지 않는다 → 자동 응답 끔(본문은 클라이언트가 기다렸다 보냄)
  srv.on('checkContinue', (req, res) => srv.emit('request', req, res));
  srv.requestTimeout = 0;   // 큰 업로드·긴 인코딩도 끊지 않음(파이썬 헬퍼도 제한 없음)

  let boundPort = null;
  let pruned = Promise.resolve();
  return {
    listen(port = 3720, host = '127.0.0.1') {
      return new Promise((resolve, reject) => {
        try { fs.mkdirSync(cfg.framesDir, { recursive: true }); } catch (e) { /* 저장 시 다시 만든다 */ }
        const onErr = (e) => { srv.removeListener('listening', onOk); reject(e); };
        const onOk = () => {
          srv.removeListener('error', onErr); boundPort = srv.address().port;
          pruned = pruneFrames(cfg.framesDir).catch(() => {});   // 시작 때 오래된 세션 폴더 정리(기다리지 않고 바로 응답)
          resolve(boundPort);
        };
        srv.once('error', onErr);
        srv.once('listening', onOk);
        srv.listen(port, host);
      });
    },
    close() {
      return new Promise((resolve) => {
        if (!srv.listening) { resolve(); return; }
        srv.close(() => resolve());
        if (typeof srv.closeAllConnections === 'function') srv.closeAllConnections();
      });
    },
    get port() { return boundPort; },
    get pruned() { return pruned; },   // 시작 정리가 끝나면 풀리는 약속(테스트용)
    server: srv,
    config: cfg,
  };
}

module.exports = {
  createWnsServer,
  mxfArgs, movArgs, safe, afxName, listAfterFx, findRunningAfterFx, ensureSuiteFonts,
  urlopen, decodeKmaBody, kmaHostOk, pyParseQs, pyDumps, rmTree, ntJoin, resolveFfmpeg, parseRegQuery,
  corsFor, isAfterFxExe, pruneFrames,
  HELPER_VER, FPS, CORS, SUITE_FONTS, PY_UA, ALLOWED_ORIGINS, BODY_MAX, DEFAULT_FONTS_DIRS,
};
