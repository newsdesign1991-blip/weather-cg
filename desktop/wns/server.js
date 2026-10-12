'use strict';
// WNS 헬퍼(R:\[F]_Util\WNS\_src\helper.py)의 HTTP 서버를 Node로 옮긴 내장판 — 데스크톱(Electron) 메인 프로세스 안에서 돈다.
// 웹판은 기존 파이썬 헬퍼를 계속 쓰므로 응답 형식·상태코드·에러 문구·ffmpeg 인자를 파이썬과 똑같이 맞춘다.
// 파이썬 흉내 부품: pyfmt(int/repr/str), pyjson(json.loads·utf-8 디코드 오류 문구), pyurl(urllib·parse_qs·프록시).
// 보안 규칙(출처 검사·본문 길이/상한·점으로 끝나는 sid·장치 이름 거부·aePath 는 설치 목록의 AfterFX.exe 만)도 helper.py 와 같다.
// API:
//   GET  /ping                         -> {"ok":true,"ff":bool,"ver":N,"embedded":true}
//   GET  /api/kma?u=<url>[&hedge=ms]   -> 기상청/공공데이터 프록시(텍스트). 내장판은 연결 재사용·늦으면 하나 더·5xx면 한 번 더(아래 '기상청 받기', 10-12) —
//                                         빠른 길로 받은 응답과 /ping(apihub 가 빠른 길을 타는 PC 일 때만 — 프록시 PC 는 아님)에 'X-WCG-Kma: hedge'
//                                         (앱이 자기 '하나 더'를 끄고 '다시 요청하는 중' 문구를 띄운다), /api/kma 에 'X-WCG-Kma-Sent: 보낸 수'.
//                                         hedge = 앱이 정하는 첫 '하나 더' 시각(태풍 급한 조회 0.9초 — 기본 1.5초보다 이를 때만, 파이썬 헬퍼는 무시)
//   POST /api/frame?sid=&index=&ext=   -> 프레임 저장 (index=0 이면 세션 리셋 + 오래된 세션 폴더 정리), 본문 256MB까지
//   POST /api/finalize {sid,mode,tail} -> ffmpeg 인코딩 → 파일 바이트 응답, 본문 16MB까지
//   POST /api/ae {sid,aePath,...}      -> jsx 만들고 AfterFX -r 로 실행 → {"ok":true,"ae":..,"fontsOk":bool}, 본문 16MB까지
//                                         mode:'geolayers' + geo 가 있으면 GEOlayers 길(geo-jsx.js — GeoJSON 파일도 보내기 폴더에), 없으면 지금 jsx 그대로
//   GET  /api/geo-caps                 -> {"ok":true,"geolayers":{"installed":bool,"version":"1.17.0"|null,"ae":[13.6,26.9]|null}} (내장판만 — 파이썬 헬퍼엔 없어 404 = 앱은 지금 방식만)
//   POST /api/cancel?sid=              -> {"ok":true} 렌더 취소(앱의 [렌더 취소]·Esc, 10-12): 그 세션 프레임 폴더를 지우고, 뒤에 늦게 온 프레임·인코딩은 409,
//                                         돌던 ffmpeg 는 멈춘다. 'ae…' 세션(AE 보내기 원본)은 400. 본문은 읽지 않음(내장판만 — 파이썬 헬퍼엔 없어 404, 앱은 무시)
// 출처(Origin): 없음=허용('*'), GitHub Pages·app://weathercg·localhost/127.0.0.1/[::1]=허용(반사+Vary), 'null'=GET만, 그 밖 403(CORS 헤더 없음).
// 본문 길이: Transfer-Encoding 이 있거나 Content-Length 가 숫자 하나가 아니면 모든 요청 400(본문 안 읽음), 상한 있는 POST 는 길이 없으면 411 · 넘으면 413.
// 외부 npm 패키지 없이 Node 내장 모듈만 쓴다.
const http = require('http');
const https = require('https');
const tls = require('tls');
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
const { createDataFetcher } = require('../data-fetch');   // 공공데이터포털 받기와 같은 받기(연결 재사용·하나 더) — /api/kma 빠른 길

const HELPER_VER = 20261009;   // helper.py 의 HELPER_VER 과 맞춘다
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
// 본문 상한(Content-Length 기준) — 넘으면 본문을 읽지 않고 413, Content-Length 가 없으면 411
const BODY_MAX = new Map([['/api/frame', 256 * 1024 * 1024], ['/api/finalize', 16 * 1024 * 1024], ['/api/ae', 16 * 1024 * 1024]]);
const REASONS = { 413: 'Content Too Large' };   // 파이썬 3.13 http.server 문구와 같게
// 잘못된 본문 길이 머리글(400) — Content-Length 형식 오류·중복·2^64 초과·Transfer-Encoding 은 파서(llhttp)가 먼저 막아 clientError 로 온다
const BAD_LENGTH = { ok: false, error: '잘못된 본문 길이' };
const LENGTH_ERRORS = new Set(['HPE_INVALID_CONTENT_LENGTH', 'HPE_UNEXPECTED_CONTENT_LENGTH', 'HPE_INVALID_TRANSFER_ENCODING']);

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
// 윈도 장치 이름(CON·NUL·COM1… — 확장자가 붙어도 장치). Node 는 \\?\ 경로로 그 이름 폴더를 만들어 탐색기로 못 지운다
const DEVICE_SID = /^(?:CON|PRN|AUX|NUL|COM[0-9¹²³]|LPT[0-9¹²³])(?:\..*)?$/is;
// 보안: 점으로 끝나는 sid('.', '..', 'a.' — FRAMES 자신·상위 폴더, 또는 파이썬에선 끝 점이 떼여 다른 폴더)와 장치 이름 → 거부(helper.py bad_sid 와 같음)
const badSid = (sid) => sid.endsWith('.') || DEVICE_SID.test(sid);
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

// 경로 비교용 — / 와 \ 를 같게, ASCII 대소문자만 무시(helper.py _path_key 와 같은 규칙)
const pathKey = (p) => p.replace(/\//g, '\\').replace(/[A-Z]/g, (c) => c.toLowerCase());
// 보안: 앱이 넘긴 aePath 는 설치 목록(listAfterFx)의 경로와 같을 때만 그 목록 경로를 쓴다. 아니면 null —
// UNC·네트워크 드라이브·상대경로·다른 실행파일은 파일 확인도 하지 않는다(helper.py listed_afterfx)
function listedAfterFx(p, vers) {
  if (typeof p !== 'string' || !p) return null;
  const k = pathKey(p);
  const hit = vers.find((v) => pathKey(v.path) === k);
  return hit ? hit.path : null;
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

// 오래된 세션 폴더 정리 — 'ae…'(AE 보내기 이미지 = 저장한 AE 프로젝트가 참조하는 원본)는 90일, 그 밖(wns·mov 등 렌더 세션)은 1일 지난 것. keep 은 건드리지 않음(helper.py prune_frames)
const PRUNE_AE_DAYS = 90, PRUNE_OTHER_DAYS = 1;
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

// subprocess.run(capture_output) 흉내 — 실행 실패만 reject, 종료코드는 그대로 돌려준다.
// signal(AbortSignal)이 끊기면 프로세스를 멈춘다(렌더 취소 — 종료코드는 null 로 돌아온다)
function runCapture(cmd, args, timeoutMs = 0, signal = null) {
  return new Promise((resolve, reject) => {
    let cp;
    try { cp = spawn(cmd, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { reject(e); return; }
    const out = [], err = [];
    let timer = null;
    const stop = () => { try { cp.kill(); } catch (e) { /* 무시 */ } };
    const done = () => { if (timer) clearTimeout(timer); if (signal) signal.removeEventListener('abort', stop); };
    cp.stdout.on('data', (b) => out.push(b));
    cp.stderr.on('data', (b) => err.push(b));
    cp.on('error', (e) => { done(); reject(e); });
    cp.on('close', (code) => {
      done();
      resolve({ code, stdout: Buffer.concat(out), stderr: Buffer.concat(err) });
    });
    if (timeoutMs > 0) timer = setTimeout(stop, timeoutMs);
    if (signal) { if (signal.aborted) stop(); else signal.addEventListener('abort', stop, { once: true }); }
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

// 원본 폰트 폴더 확인 시간 한도 — 닿지 않는 네트워크 경로(재택·VPN 끔)의 첫 확인은 40초 넘게 걸려 /api/ae 가 멈춘다(helper.py FONT_PROBE_SEC)
const FONT_PROBE_MS = 3000;
const probes = new Map();   // 폴더 → 확인 중인 약속. 끝나기 전엔 새로 확인하지 않고 그것을 기다린다(멈춘 확인이 스레드풀을 채우지 않게)
// 폴더가 있는지 — ms 안에 답이 없으면 없는 것으로 본다(helper.py _dir_alive)
function dirAlive(d, ms = FONT_PROBE_MS, stat = fsp.stat) {
  let pr = probes.get(d);
  if (!pr) {
    pr = Promise.resolve().then(() => stat(d)).then((st) => st.isDirectory(), () => false);
    probes.set(d, pr);
    pr.then(() => { if (probes.get(d) === pr) probes.delete(d); });
  }
  let timer = null;
  const late = new Promise((resolve) => { timer = setTimeout(resolve, ms, false); });
  return Promise.race([pr, late]).finally(() => clearTimeout(timer));
}
const fileExists = (p) => fsp.access(p).then(() => true, () => false);   // os.path.exists

// fontsDirs 에서 SUITE 7종(SUITE-*.otf 만 — WantedSans 가변폰트는 AE 폰트스캔을 멈추게 해서 절대 설치 안 함)을 찾아
// 사용자 폰트 폴더로 복사 + HKCU 등록. 7종 모두 처리되면 true(→ /api/ae 의 fontsOk).
// o.targetDir / o.register:false / o.broadcast(false|함수) / o.regQuery·o.regSet(가짜 레지스트리) / o.localAppData /
// o.probeMs·o.stat·o.exists(원본 확인 시간 한도·가짜 확인) 는 테스트용
async function ensureSuiteFonts(fontsDirs = DEFAULT_FONTS_DIRS, o = {}) {
  try {
    const la = o.localAppData !== undefined ? o.localAppData : (process.env.LOCALAPPDATA || '');
    const fontsDir = o.targetDir || ntJoin(la, 'Microsoft', 'Windows', 'Fonts');
    const register = o.register !== false;
    const rq = o.regQuery || regQueryValue, rset = o.regSet || regSetSz;
    const probeMs = o.probeMs !== undefined ? o.probeMs : FONT_PROBE_MS;
    const exists = o.exists || fileExists;
    await fsp.mkdir(fontsDir, { recursive: true });
    let newly = false, installed = 0;
    const alive = new Map();   // 이번 호출에서 확인한 원본 폴더(폴더마다 한 번만)
    for (const [filename, regName] of SUITE_FONTS) {
      const dst = ntJoin(fontsDir, filename);
      if (!fs.existsSync(dst)) {
        // 빠진 폰트만 원본을 찾는다(이미 설치된 PC 는 네트워크 원본을 보지 않음). 앞 후보에 있으면 뒤는 보지 않는다
        let src = null;
        for (const d of fontsDirs || []) {
          if (!alive.has(d)) alive.set(d, await dirAlive(d, probeMs, o.stat));
          const p = ntJoin(d, filename);
          if (alive.get(d) && await exists(p)) { src = p; break; }
        }
        if (!src) continue;
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

// ── 기상청 받기 빠른 길(2026-10-12 — '특보 없을 때 기상청 응답이 너무 늦어요' 신고) ──
// 기상청 apihub 는 가끔 요청 하나를 응답 없이 붙잡았다가 30초 뒤 504 를 준다. 특보가 있든 없든 같다(10-12 실측 40분 240건: 특보 없음 응답 4/81,
// 특보 있음 7/81, 하루 목록 5/78 — 새 연결 12/151, 다시 쓴 연결 4/89. TLS 는 0.1초 안에 끝나고 요청을 보낸 뒤 멈춘다. 몰려 오는 때가 있다).
// 옛 헬퍼(요청마다 새 연결·20초)는 그때 20초 뒤 'The read operation timed out'(64번 중 5번). 붙잡힌 그 순간에도 다른 연결로 보낸 같은 요청은 대개 0.2초에 온다.
// 그래서 공공데이터포털 받기(desktop/data-fetch.js createDataFetcher)를 옵션만 바꿔 쓴다:
//   연결 재사용(apihub 는 5초 놀면 닫는다 — 연달아 묻는 태풍 불러오기에 득), 첫 응답이 1.5·3·6초 안에 없으면 다른 연결로 하나씩 더
//   (다시 쓴 연결도 붙잡히므로 그때도), 5xx·연결 오류·본문 끊김이면 남은 시간 안에 한 번 더(하나 더 몫 안에서 — 요청 하나에 최대 4번),
//   처음 보낸 때부터 cfg.kmaTimeout(20초)이 전체 한도 — 머리·본문·넘겨주기 모두(붙잡힌 요청은 30초 뒤 504 라 기다려도 안 온다 — 20초는 옛 헬퍼와 같은 약속, 앱 문구도 '20초').
//   넘겨주기(302 등)는 다음 주소도 빠른 길이면 남은 시간으로 따라가고(통보문 kma.go.kr → weather.go.kr), 아니면 옛 길로 처음부터(남은 시간만).
//   연결 모음(32)이 꽉 차면 하나 더는 줄만 서니 보내지 않는다.
// 오류 글은 웹앱 판정(js/warnings.js wrnHttpFail·js/bulletin-load.js·js/data-maps.js)이 읽는 urllib 문구 그대로('HTTP Error 504: …', '… timed out').
// 빠른 길에 안 태우는 것 = 옛 길(파이썬 urllib 흉내 urlopen, 한 번·20초 — 바이트까지 helper.py 와 같다):
//   프록시를 써야 하는 PC(그 길 그대로 — 헬퍼와 같은 기준 systemProxyConfig·proxyBypass), http://, 포트·사용자 정보·점 경로·특수 글자가 든 주소.
// 하나 더 보낼 때(ms). 정상 첫 응답은 0.1~0.8초(10-12 실측 p50 0.13~0.23초·p90 0.3~0.8초, 드물게 1.3·3.8초 — 1.5초 전에 더 보내는 일은 드묾).
// 붙잡힘은 나쁜 때 요청의 5~8%(같은 주소를 같은 순간 둘 보내 둘 다 붙잡힌 적도 2번) — 셋이 다 붙잡히면 6초에 하나 더.
const KMA_HEDGE_AT = [1500, 3000, 6000];
const KMA_HEDGE_MIN = 300;           // 앱이 넘기는 첫 하나 더 시각(&hedge=)의 하한 — 정상 응답(p50 0.13~0.23초)을 겹쳐 보내지 않게
const KMA_RETRIES = 1;               // 5xx·연결 오류·본문 끊김이면 한 번 더(남은 시간이 1초 넘을 때만, 하나 더 몫 안에서 — 한 번에 최대 4번)
// 연결 모음 상한. 앱은 동시에 6건까지(js/typhoon-api.js KMA_INFLIGHT_MAX), 요청마다 최대 4번(처음 + 하나 더 3번) = 24 — 넉넉히.
// 꽉 차면 하나 더는 줄만 서서 소용이 없으니 보내지 않는다(desktop/data-fetch.js poolFull, 10-12 검증)
const KMA_MAX_SOCKETS = 32;
const KMA_MIN_LEG_MS = 500;          // 넘겨주기 다음 단계·옛 길로 넘길 때 남은 시간이 이보다 적으면 보내지 않고 시간 초과
const KMA_MAX_BYTES = 32 << 20;      // 하루 특보 목록·통보문 페이지도 1MB 안팎
const KMA_REDIRECTS = 5;
const KMA_REDIRECT_CODES = new Set([301, 302, 303, 307, 308]);
const KMA_EXPOSE = 'X-WCG-Kma, X-WCG-Kma-Sent';
const KMA_MARK_URL = 'https://apihub.kma.go.kr/';   // /ping 표시를 정할 때 프록시 판정에 쓰는 주소(특보·태풍 = apihub)
// 빠른 길 주소: https + 소문자 호스트 + 경로부터는 그대로 보내도 Node 와 urllib 이 같은 바이트를 보내는 글자만. 아니면 null(→ 옛 길)
function kmaFastUrl(u) {
  if (typeof u !== 'string' || u.length > 8192) return null;
  const m = /^https:\/\/([a-z0-9-]+(?:\.[a-z0-9-]+)+)(\/[A-Za-z0-9\-._~!$&()*+,;=:/?%]*)$/.exec(u);
  if (!m) return null;
  const pathOnly = m[2].split('?')[0];
  if (/(^|\/)(\.|%2e){1,2}(\/|$)/i.test(pathOnly)) return null;   // 점 경로는 WHATWG URL 이 줄여 보낸다
  if (/%(?![0-9A-Fa-f]{2})/.test(m[2])) return null;
  return u;
}
// 이 헬퍼가 빠른 길(하나 더 보내기)을 한다는 표시 — 앱(js/typhoon-api.js kmaRequest)은 이걸 보면 자기 '하나 더'를 끄고(요청이 겹겹이 늘지 않게),
// 특보 불러오기(js/warnings-load.js)는 늦을 때 '다시 요청하는 중' 문구를 띄운다. 다른 출처(app://)에서 읽을 수 있게 Expose 도.
// 표시는 빠른 길을 실제로 탈 때만 붙인다(fast) — 프록시 PC·옛 길로 간 응답에 붙이면 앱이 자기 '한 번 더'를 꺼서 아무도 다시 안 보낸다(10-12 검증).
function kmaHeads(res, fast) {
  if (fast) res.setHeader('X-WCG-Kma', 'hedge');
  res.setHeader('Access-Control-Expose-Headers', KMA_EXPOSE);
}
// 빠른 길 실패 → urllib 과 같은 오류 글
function kmaFailText(x) {
  if (x.err === 'status') return 'HTTP Error ' + x.status + ': ' + String(x.reason || '').trim();
  if (x.err === 'timeout') return x.stage === 'head' && !x.connected ? '<urlopen error timed out>' : 'The read operation timed out';
  if (x.err === 'too-big') return '응답이 너무 큽니다';
  if (x.stage === 'body') return 'IncompleteRead(본문이 중간에 끊김)';
  return '<urlopen error ' + PU.osErrText({ code: x.code, message: x.detail || '' }) + '>';
}

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

// GEOlayers 3(AE 확장, CEP) 설치 확인 — 확장 폴더의 CSXS/manifest.xml 판만 읽는다(경로·사용자 이름은 응답에 안 싣는다).
// 모든 사용자용(Program Files (x86)·Program Files) → 이 사용자용(APPDATA) 차례. AE에 패널이 열려 있는지는 여기서 알 수 없다(jsx가 확인).
function geoDirs() {
  const out = [];
  for (const b of [process.env['ProgramFiles(x86)'], process.env.ProgramFiles]) if (b) out.push(path.join(b, 'Common Files', 'Adobe', 'CEP', 'extensions', 'GEOlayers 3'));
  if (process.env.APPDATA) out.push(path.join(process.env.APPDATA, 'Adobe', 'CEP', 'extensions', 'GEOlayers 3'));
  return out;
}
// ae = 그 판이 지원하는 AE 범위 [최소, 최대](manifest <Host Name="AEFT" Version="[13.6,26.9]"/> — 1.17.0은 AE 26.9까지, AE 27은 1.18.0부터).
// 범위 밖 AE에서는 패널이 아예 안 뜬다 — 앱 팝업 안내와 jsx 알림(geo-jsx.js)이 이 값으로 까닭을 알린다. 못 읽으면 null.
function geoCaps(dirs) {
  for (const d of dirs) {
    let x;
    try { x = fs.readFileSync(path.join(d, 'CSXS', 'manifest.xml'), 'utf8'); } catch (e) { continue; }
    const m = /ExtensionBundleVersion\s*=\s*"([0-9][0-9A-Za-z.\-]{0,31})"/.exec(x);
    const h = /<Host\s+Name\s*=\s*"AEFT"\s+Version\s*=\s*"\[\s*([0-9]{1,3}(?:\.[0-9]{1,3})?)\s*,\s*([0-9]{1,3}(?:\.[0-9]{1,3})?)\s*\]"/.exec(x);
    return { installed: true, version: m ? m[1] : null, ae: h && +h[1] <= +h[2] ? [+h[1], +h[2]] : null };
  }
  return { installed: false, version: null, ae: null };
}

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
    runFfmpeg: opts.runFfmpeg || ((args, o) => runCapture(args[0], args.slice(1), 0, o && o.signal)),   // windowsHide = CREATE_NO_WINDOW · o.signal = 렌더 취소
    spawnAe: opts.spawnAe || null,
    kmaTimeout: opts.kmaTimeout || 20000,
    kmaProxyConfig: opts.kmaProxyConfig || undefined,
    kmaCa: opts.kmaCa || undefined,
    // 기상청 빠른 길(시험용 주입): 받을 모듈(http — 로컬 가짜 서버), 빠른 길 주소 판정, 에이전트 옵션(lookup 등), 하나 더 보낼 때
    kmaModule: opts.kmaModule || https,
    kmaFast: opts.kmaFast || kmaFastUrl,
    kmaAgentOptions: opts.kmaAgentOptions || null,
    kmaHedgeAt: opts.kmaHedgeAt || KMA_HEDGE_AT,
    kmaUrlopen: opts.kmaUrlopen || urlopen,   // 옛 길(시험용 주입 — 부른 주소만 볼 때)
    tmpDir: opts.tmpDir || null,
    geoDirs: opts.geoDirs || null,   // GEOlayers 확장 폴더 후보(테스트용 주입 — 없으면 geoDirs())
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

  // 렌더 취소(POST /api/cancel — 10-12): 취소한 sid(최근 64개)와 인코딩 중인 sid → AbortController.
  // 앱은 워커를 멈춘 뒤 부르지만 이미 출발한 프레임 요청이 뒤늦게 올 수 있다 → 그 sid 의 프레임0 이 아닌 프레임·인코딩은 받지 않고(409) 폴더를 다시 지운다.
  // 같은 sid 의 프레임0(새 세션)이 오면 취소 표시를 푼다(앱의 sid 는 'wns'+시각이라 다시 쓰이지 않는다)
  const cancelled = new Set(), encoding = new Map();
  const CANCELLED = { ok: false, error: '취소된 렌더' };
  const markCancelled = (sid) => { cancelled.delete(sid); cancelled.add(sid); if (cancelled.size > 64) cancelled.delete(cancelled.values().next().value); };

  // 기상청 빠른 길(위 '기상청 받기 빠른 길') — 처음 쓸 때 만든다(연결 모음은 close() 때 닫음)
  let kmaFetcher = null;
  function kmaFetcherGet() {
    if (kmaFetcher) return kmaFetcher;
    let secureContext;
    // 파이썬(윈도)처럼 시스템 인증서도(사내 인증서) — urlopen 의 caList 와 같은 기준. 연결마다 만들지 않게 한 번만
    try { const ca = cfg.kmaCa ? [cfg.kmaCa] : PU.caList(); if (ca) secureContext = tls.createSecureContext({ ca }); } catch (e) { secureContext = undefined; }
    kmaFetcher = createDataFetcher({
      module: cfg.kmaModule, allow: (u) => u, raw: true, headers: { 'User-Agent': PY_UA, 'Accept-Encoding': 'identity' },
      failStatus: (s) => s >= 500, retries: KMA_RETRIES, deadline: true, hedgeReused: true, hedgeAt: cfg.kmaHedgeAt, maxBytes: KMA_MAX_BYTES,
      agentOptions: { maxSockets: KMA_MAX_SOCKETS, maxFreeSockets: 8, ...(secureContext && cfg.kmaModule === https ? { secureContext } : {}), ...(cfg.kmaAgentOptions || {}) },
    });
    return kmaFetcher;
  }
  // 프록시를 써야 하는 주소인가(urllib 과 같은 기준) — 그러면 옛 길 그대로
  async function kmaViaProxy(u) {
    try {
      const pc = cfg.kmaProxyConfig || await PU.systemProxyConfig();
      if (!pc || !pc.proxies || !pc.proxies.https) return false;
      return !PU.proxyBypass(new URL(u).host, pc);
    } catch (e) { return true; }   // 판정 못 하면 옛 길(지금까지와 같은 동작)
  }
  // /ping 표시: 이 PC 에서 apihub 가 빠른 길을 타는가(프록시를 써야 하면 옛 길 — 하나 더를 안 한다). 프록시 판정은 처음 한 번(레지스트리 읽기)이라
  // 시작할 때 미리 해 두고(listen), /ping 은 0.3초까지만 기다린다(데스크톱 메인의 헬퍼 확인은 0.8초 제한) — 그때까지 모르면 표시 없음(= 앱이 예전처럼).
  let kmaMarkP = null;
  const kmaMarkGet = () => kmaMarkP || (kmaMarkP = kmaViaProxy(KMA_MARK_URL).then((px) => !px, () => false));
  async function kmaMarkSoon() {
    let t = null;
    const v = await Promise.race([kmaMarkGet(), new Promise((r) => { t = setTimeout(() => r(false), 300); })]);
    clearTimeout(t);
    return v;
  }
  // 앱이 넘긴 첫 '하나 더' 시각(&hedge=ms — 태풍 급한 조회 0.9초) → 하나 더 시각 목록. 기본 첫 시각보다 이를 때만(첫 것만 바꾼다 — 보내는 수는 그대로)
  function kmaHedgeParam(q) {
    const v = Math.floor(+((q.hedge || [''])[0]));
    const base = cfg.kmaHedgeAt;
    if (!Number.isFinite(v) || v < KMA_HEDGE_MIN || !base.length || v >= base[0]) return null;
    return [v, ...base.slice(1)];
  }
  // 기상청 받기 → 본문 Buffer. 실패면 urllib 문구의 오류를 던진다. signal = 앱이 떠나면(요청 취소) 끊기. hedgeAt = 하나 더 시각(없으면 기본)
  // st = { sent: 보낸 수, fast: 빠른 길로 받았나('X-WCG-Kma: hedge' 표시) } — 던질 때도 채워 둔다.
  // 시간 한도는 처음 보낸 때부터 cfg.kmaTimeout 전체(머리·본문·넘겨주기) — 넘겨주기 다음 단계·옛 길로 넘길 때도 남은 시간만 준다.
  async function kmaGet(u, signal, st, hedgeAt) {
    const first = cfg.kmaFast(u);
    let t0 = 0;
    const rest = () => cfg.kmaTimeout - (Date.now() - t0);
    const late = () => new Error('The read operation timed out');   // 한도가 다 됨(urllib 읽기 시간 초과와 같은 글 — 앱: 기상청 응답이 너무 늦어요)
    if (first && !(await kmaViaProxy(first))) {
      t0 = Date.now();
      st.fast = true;
      let cur = first;
      for (let hop = 0; hop <= KMA_REDIRECTS; hop++) {
        if (rest() < KMA_MIN_LEG_MS) throw late();
        const x = await kmaFetcherGet().fetch(cur, { timeoutMs: rest(), signal, ...(hedgeAt ? { hedgeAt } : {}) });
        st.sent += x.sent || 0;
        if (x.err === 'aborted') { const e = new Error('앱이 요청을 취소함'); e.kmaAborted = true; throw e; }
        if (x.sent > 1 || !x.ok) cfg.log('[wns] 기상청 ' + (x.ok ? '받음' : '실패(' + x.err + (x.status ? ' ' + x.status : '') + ')') + ' — ' + x.sent + '번 보냄, ' + x.ms + 'ms');   // 주소(인증키)는 싣지 않는다
        if (!x.ok) throw new Error(kmaFailText(x));
        if (x.status >= 200 && x.status < 300) return x.body;
        if (KMA_REDIRECT_CODES.has(x.status) && x.location && hop < KMA_REDIRECTS) {
          let next = null;
          try { next = cfg.kmaFast(new URL(x.location, cur).href); } catch (e) { next = null; }
          if (next && !(await kmaViaProxy(next))) { cur = next; continue; }
        }
        if (KMA_REDIRECT_CODES.has(x.status)) break;   // 따라갈 수 없는 넘겨주기 — 옛 길(urllib)로 처음부터
        throw new Error('HTTP Error ' + x.status + ': ' + String(x.reason || '').trim());
      }
      st.fast = false;   // 옛 길로 간다(한 번만 보냄 — 하나 더 없음)
    }
    // 옛 길(urllib 흉내). 빠른 길을 거쳐 왔으면 남은 시간만(urllib 시간 제한은 읽기마다라 조금 넘을 수 있다)
    const timeout = t0 ? rest() : cfg.kmaTimeout;
    if (timeout < KMA_MIN_LEG_MS) throw late();
    st.sent++;
    return cfg.kmaUrlopen(u, { timeout, userAgent: PY_UA, proxyConfig: cfg.kmaProxyConfig, ca: cfg.kmaCa });
  }

  async function doGet(req, res, p, query) {
    req.resume();
    if (p === '/ping') { kmaHeads(res, await kmaMarkSoon()); return send(res, 200, { ok: true, ff: ffExists(), ver: cfg.helperVer, embedded: true }); }
    // AE로 보내기 'GEOlayers 지도로' — 이 헬퍼가 그 길을 알고(경로가 있음) 이 PC에 GEOlayers 3가 있는지
    if (p === '/api/geo-caps') return send(res, 200, { ok: true, geolayers: geoCaps(cfg.geoDirs || geoDirs()) });
    // 기상청 API허브 프록시 (CORS 우회). apihub.kma.go.kr 등만 허용.
    if (p === '/api/kma') {
      const q = PU.parseQs(query);
      const u = (q.u || [''])[0];
      kmaHeads(res, false);
      // 앱이 기다리다 떠나면(요청 취소·새 요청에 밀림) 빠른 길의 남은 시도를 끊는다
      const ac = new AbortController();
      res.on('close', () => { if (!res.writableEnded) ac.abort(); });
      const st = { sent: 0, fast: false };
      const marks = () => { kmaHeads(res, st.fast); res.setHeader('X-WCG-Kma-Sent', String(st.sent)); };
      try {
        if (!PU.kmaUrlAllowed(u)) return send(res, 400, { ok: false, error: '허용되지 않은 주소' });
        const body = await kmaGet(u, ac.signal, st, kmaHedgeParam(q));
        marks();
        const txt = decodeKmaBody(body);
        return send(res, 200, null, 'text/plain; charset=utf-8', Buffer.from(txt, 'utf8'));
      } catch (e) {
        if (e && e.kmaAborted) return undefined;   // 받을 사람이 없다
        marks();
        return send(res, 502, { ok: false, error: errMsg(e) });
      }
    }
    return send(res, 404, { ok: false });
  }

  async function doPost(req, res, p, query) {
    try {
      const lim = BODY_MAX.get(p);
      if (lim !== undefined) {
        const cl = req.headers['content-length'];   // 형식은 파서가 이미 확인(숫자만, 2^64-1 까지)
        if (cl === undefined) {   // 길이를 모르면 상한을 지킬 수 없다
          res.setHeader('Connection', 'close');
          return send(res, 411, { ok: false, error: '본문 길이(Content-Length)가 필요합니다' });
        }
        if (Number(cl) > lim) {
          res.setHeader('Connection', 'close');   // 본문은 읽지 않고 끊는다
          return send(res, 413, { ok: false, error: '요청이 너무 큽니다' });
        }
      }

      if (p === '/api/frame') {
        const q = PU.parseQs(query);
        const sid = safe((q.sid || ['s'])[0]);
        const idx = P.int((q.index || ['0'])[0]);
        let ext = (q.ext || ['png'])[0].toLowerCase();
        if (ext !== 'png' && ext !== 'jpg') ext = 'png';
        const d = path.join(cfg.framesDir, checkSid(sid));
        if (idx === 0n) {
          cancelled.delete(sid);   // 새 세션 — 취소 표시를 푼다
          await pruneFrames(cfg.framesDir, sid);   // 새 세션 시작 — 오래된 세션 폴더 정리(지금 sid 는 제외)
          if (isDir(d)) await rmTree(d);
        } else if (cancelled.has(sid)) {   // 취소한 렌더의 늦은 프레임 — 쓰지 않는다
          req.resume();
          return send(res, 409, CANCELLED);
        }
        await fsp.mkdir(d, { recursive: true });
        try {
          await pipeline(req, fs.createWriteStream(path.join(d, 'f_' + fmt05(idx) + '.' + ext)));   // 큰 본문도 스트리밍 저장
        } finally {
          if (cancelled.has(sid)) await rmTree(d);   // 받는 사이 취소됐으면(앱이 끊어 반쯤 쓴 파일 포함) 방금 만든 폴더째 지운다
        }
        if (cancelled.has(sid)) return send(res, 409, CANCELLED);
        return send(res, 200, { ok: true });
      }

      if (p === '/api/cancel') {
        req.resume();   // 본문은 쓰지 않는다(쌓지 않고 읽어 버림)
        const q = PU.parseQs(query);
        const sid = checkSid(safe((q.sid || ['s'])[0]));
        if (sid.startsWith('ae')) return send(res, 400, { ok: false, error: '렌더 세션만 취소할 수 있습니다' });   // AE 보내기 원본(저장한 AE 프로젝트가 참조)은 지우지 않는다
        markCancelled(sid);
        const ac = encoding.get(sid); if (ac) ac.abort();   // 인코딩 중이면 ffmpeg 를 멈춘다(finalize 가 409 로 마무리·결과 파일 지움)
        await rmTree(path.join(cfg.framesDir, sid));
        return send(res, 200, { ok: true });
      }

      if (p === '/api/finalize') {
        const obj = pyLoadsObj(await readBody(req));
        const sid = safe(P.or(obj.sid, 's'));
        if (cancelled.has(sid)) {   // 취소한 렌더 — 인코딩하지 않고 남은 프레임만 지운다
          await rmTree(path.join(cfg.framesDir, sid));
          return send(res, 409, CANCELLED);
        }
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
        const ac = new AbortController();
        encoding.set(sid, ac);
        let r;
        try { r = await cfg.runFfmpeg(args, { signal: ac.signal }); } finally { if (encoding.get(sid) === ac) encoding.delete(sid); }
        await rmTree(d);
        if (ac.signal.aborted || cancelled.has(sid)) {   // 인코딩 중 취소 — 반쯤 만든 결과 파일을 지우고 보내지 않는다
          await fsp.rm(out, { force: true }).catch(() => {});
          return send(res, 409, CANCELLED);
        }
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
        // AE 선택: (1) 앱이 고른 경로(aePath — 설치 목록에 있는 것만) → (2) 실행 중인 AE → (3) 설치 1개 → (4) 여러 개면 앱에 선택 요청
        const aePath = obj.aePath;
        let vers = typeof aePath === 'string' && aePath ? await cfg.listAfterFx() : null;
        let afx = vers && vers.length ? listedAfterFx(aePath, vers) : null;
        if (!afx) {
          afx = await cfg.findRunningAfterFx();
          if (!afx) {
            if (vers === null) vers = await cfg.listAfterFx();
            if (!vers.length) return send(res, 500, { ok: false, error: 'After Effects를 못 찾았습니다 (설치 확인)' });
            if (vers.length === 1) afx = vers[0].path;
            else return send(res, 200, { ok: false, choose: true, versions: vers });
          }
        }
        // Wanted 가변폰트는 설치 안 함(AE 폰트스캔 멈춤 원인). SUITE만 — 결과는 fontsOk 로 앱에 알림
        const fontsOk = cfg.fontsInstall ? !!(await cfg.ensureSuiteFonts(cfg.fontsDirs)) : false;
        // GEOlayers 길(mode:'geolayers' + geo) — 태풍 GeoJSON을 보내기 폴더에 파일로(jsx의 draw가 읽는다), jsx는 geo-jsx.js. 그 밖은 지금 그대로
        const GJ = require('./geo-jsx');
        const geo = GJ.isGeoSpec(obj);
        if (geo) for (const f of GJ.geoFiles(obj)) await fsp.writeFile(path.join(d, f.name), f.text, 'utf8');
        // GEOlayers 길은 설치판이 지원하는 AE 범위도 넘긴다(패널이 없을 때 '이 AE를 지원하지 않음'을 알리려고)
        const gc = geo && !cfg.buildAeJsx ? geoCaps(cfg.geoDirs || geoDirs()) : null;
        const build = cfg.buildAeJsx || (geo ? (s, dd) => GJ.buildGeoJsx(s, dd, { ae: gc.ae, ver: gc.version }) : require('./ae-jsx').buildAeJsx);
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
    // 본문 길이 머리글 — 파서가 받아 준 chunked 도 거부(출처·메서드보다 먼저, 본문은 읽지 않고 끊음). helper.py parse_request 와 같은 순서
    if (req.headers['transfer-encoding'] !== undefined) {
      res.wnsCors = [];
      res.setHeader('Connection', 'close');
      return send(res, 400, BAD_LENGTH);
    }
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
  // 파서 오류 — 본문 길이 머리글 오류는 파이썬과 같은 JSON 400(CORS 없음)을 보내고 끊는다. 그 밖은 Node 기본 응답 그대로
  srv.on('clientError', (e, sock) => {
    if (!sock.writable || (sock._httpMessage && sock._httpMessage._headerSent)) { sock.destroy(e); return; }
    if (LENGTH_ERRORS.has(e.code)) {
      const body = Buffer.from(pyDumps(BAD_LENGTH), 'utf8');
      sock.end(Buffer.concat([Buffer.from('HTTP/1.1 400 Bad Request\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: '
        + body.length + '\r\nConnection: close\r\n\r\n', 'latin1'), body]), () => sock.destroy());
      return;
    }
    const code = e.code === 'HPE_HEADER_OVERFLOW' ? 431 : e.code === 'HPE_CHUNK_EXTENSIONS_OVERFLOW' ? 413 : e.code === 'ERR_HTTP_REQUEST_TIMEOUT' ? 408 : 400;
    sock.write('HTTP/1.1 ' + code + ' ' + http.STATUS_CODES[code] + '\r\nConnection: close\r\n\r\n', 'latin1');
    sock.destroy(e);
  });
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
          kmaMarkGet();   // /ping 표시용 프록시 판정을 미리(기다리지 않음)
          resolve(boundPort);
        };
        srv.once('error', onErr);
        srv.once('listening', onOk);
        srv.listen(port, host);
      });
    },
    close() {
      if (kmaFetcher) { kmaFetcher.close(); kmaFetcher = null; }   // 기상청 연결 모음
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
  urlopen, decodeKmaBody, kmaHostOk, kmaFastUrl, kmaFailText, KMA_HEDGE_AT, pyParseQs, pyDumps, rmTree, ntJoin, resolveFfmpeg, parseRegQuery, runCapture,
  corsFor, listedAfterFx, pruneFrames, dirAlive, geoCaps, geoDirs,
  HELPER_VER, FPS, CORS, SUITE_FONTS, PY_UA, ALLOWED_ORIGINS, BODY_MAX, DEFAULT_FONTS_DIRS, PRUNE_AE_DAYS, FONT_PROBE_MS,
};
