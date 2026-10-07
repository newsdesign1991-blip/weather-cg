'use strict';
// 파이썬 urllib 흉내(CPython 3.13) — 내장 WNS 서버가 helper.py 와 같은 결과·오류 문구를 내도록.
//   urlsplit/urlparse/urljoin/quote/unquote/parse_qs, urllib.request.urlopen(GET), 프록시(환경변수·레지스트리),
//   http.client 응답 파싱(IncompleteRead·BadStatusLine 등), 기상청 응답 디코딩(utf-8 → 파이썬 euc-kr).
// WHATWG URL(new URL)은 주소를 정규화(공백 %20, \→/, 대소문자 등)해서 파이썬과 결과가 달라지므로 쓰지 않는다.
const net = require('net');
const tls = require('tls');
const url = require('url');
const { spawn } = require('child_process');
const P = require('./pyfmt');

// ── 파이썬 예외 흉내: message = str(e) ──
function pyError(type, msg) { const e = new Error(msg); e.pyType = type; return e; }
const urlError = (reason) => pyError('URLError', '<urlopen error ' + reason + '>');

// ── 문자열 도우미 ──
const PY_WS = new Set(Array.from('\t\n\x0b\x0c\r\x1c\x1d\x1e\x1f \x85\xa0                　'));
function pyStrip(s, set = PY_WS) {   // str.strip()
  let a = 0, b = s.length;
  while (a < b && set.has(s[a])) a++;
  while (b > a && set.has(s[b - 1])) b--;
  return s.slice(a, b);
}
const isAscii = (s) => /^[\x00-\x7f]*$/.test(s);
const hex = (n, w) => n.toString(16).padStart(w, '0');

// UnicodeEncodeError 문구('ascii'/'latin-1') — 연속된 못 바꾸는 글자를 한 범위로
function encodeCheck(s, codec, limit) {
  const cps = Array.from(s);
  for (let i = 0; i < cps.length; i++) {
    if (cps[i].codePointAt(0) < limit) continue;
    let j = i + 1;
    while (j < cps.length && cps[j].codePointAt(0) >= limit) j++;
    const why = 'ordinal not in range(' + limit + ')';
    if (j - i === 1) {
      const o = cps[i].codePointAt(0);
      const esc = o <= 0xff ? '\\x' + hex(o, 2) : o <= 0xffff ? '\\u' + hex(o, 4) : '\\U' + hex(o, 8);
      throw pyError('UnicodeEncodeError', "'" + codec + "' codec can't encode character '" + esc + "' in position " + i + ': ' + why);
    }
    throw pyError('UnicodeEncodeError', "'" + codec + "' codec can't encode characters in position " + i + '-' + (j - 1) + ': ' + why);
  }
}

// ── urllib.parse ──
const SCHEME_CHARS = new Set(Array.from('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+-.'));
const USES_PARAMS = new Set(['', 'ftp', 'hdl', 'prospero', 'http', 'imap', 'https', 'shttp', 'rtsp', 'rtsps', 'rtspu', 'sip', 'sips', 'mms', 'sftp', 'tel']);
const USES_NETLOC = new Set(['', 'ftp', 'http', 'gopher', 'nntp', 'telnet', 'imap', 'wais', 'file', 'mms', 'https', 'shttp', 'snews', 'prospero', 'rtsp', 'rtsps', 'rtspu', 'rsync', 'svn', 'svn+ssh', 'sftp', 'nfs', 'git', 'git+ssh', 'ws', 'wss', 'itms-services']);
const USES_RELATIVE = new Set(['', 'ftp', 'http', 'gopher', 'nntp', 'imap', 'wais', 'file', 'https', 'shttp', 'mms', 'prospero', 'rtsp', 'rtsps', 'rtspu', 'sftp', 'svn', 'svn+ssh', 'ws', 'wss']);
const C0_SPACE = new Set(Array.from({ length: 33 }, (_, i) => String.fromCharCode(i)));

function splitNetloc(u, start) {
  let delim = u.length;
  for (const c of '/?#') { const w = u.indexOf(c, start); if (w >= 0) delim = Math.min(delim, w); }
  return [u.slice(start, delim), u.slice(delim)];
}
function rpartition(s, sep) { const i = s.lastIndexOf(sep); return i < 0 ? ['', '', s] : [s.slice(0, i), sep, s.slice(i + sep.length)]; }
function partition(s, sep) { const i = s.indexOf(sep); return i < 0 ? [s, '', ''] : [s.slice(0, i), sep, s.slice(i + sep.length)]; }

function checkBracketedHost(h) {
  if (h.startsWith('v')) {
    if (!/^v[a-fA-F0-9]+\.[\s\S]+$/.test(h)) throw pyError('ValueError', 'IPvFuture address is invalid');
    return;
  }
  if (net.isIPv4(h)) throw pyError('ValueError', 'An IPv4 address cannot be in brackets');
  const [addr, pct, zone] = partition(h, '%');
  if (!net.isIPv6(addr) || (pct && !zone)) throw pyError('ValueError', P.pyRepr(h) + ' does not appear to be an IPv4 or IPv6 address');
}
function checkBracketedNetloc(netloc) {
  const hp = rpartition(netloc, '@')[2];
  const [before, open, bracketed] = partition(hp, '[');
  let host;
  if (open) {
    if (before) throw pyError('ValueError', 'Invalid IPv6 URL');
    const [h, , port] = partition(bracketed, ']');
    if (port && !port.startsWith(':')) throw pyError('ValueError', 'Invalid IPv6 URL');
    host = h;
  } else host = partition(hp, ':')[0];
  checkBracketedHost(host);
}
function checkNetloc(netloc) {
  if (!netloc || isAscii(netloc)) return;
  const n = netloc.replace(/[@:#?]/g, '');
  const n2 = n.normalize('NFKC');
  if (n === n2) return;
  for (const c of '/?#@:') {
    if (n2.includes(c)) throw pyError('ValueError', "netloc '" + netloc + "' contains invalid characters under NFKC normalization");
  }
}

// urlsplit(url, scheme='')
function urlsplit(u, scheme = '') {
  u = String(u);
  let i0 = 0;
  while (i0 < u.length && C0_SPACE.has(u[i0])) i0++;
  u = u.slice(i0).replace(/[\t\r\n]/g, '');
  scheme = pyStrip(String(scheme), C0_SPACE).replace(/[\t\r\n]/g, '');
  let netloc = '', query = '', fragment = '';
  const i = u.indexOf(':');
  if (i > 0 && /^[A-Za-z]/.test(u) && Array.from(u.slice(0, i)).every((c) => SCHEME_CHARS.has(c))) {
    scheme = u.slice(0, i).toLowerCase();
    u = u.slice(i + 1);
  }
  if (u.startsWith('//')) {
    [netloc, u] = splitNetloc(u, 2);
    if ((netloc.includes('[') && !netloc.includes(']')) || (netloc.includes(']') && !netloc.includes('['))) throw pyError('ValueError', 'Invalid IPv6 URL');
    if (netloc.includes('[') && netloc.includes(']')) checkBracketedNetloc(netloc);
  }
  if (u.includes('#')) { const k = u.indexOf('#'); fragment = u.slice(k + 1); u = u.slice(0, k); }
  if (u.includes('?')) { const k = u.indexOf('?'); query = u.slice(k + 1); u = u.slice(0, k); }
  checkNetloc(netloc);
  return { scheme, netloc, path: u, query, fragment };
}

function splitParams(p) {
  let i;
  if (p.includes('/')) { i = p.indexOf(';', p.lastIndexOf('/')); if (i < 0) return [p, '']; } else i = p.indexOf(';');
  return [p.slice(0, i), p.slice(i + 1)];
}
// urlparse(url, scheme='')
function urlparse(u, scheme = '') {
  const s = urlsplit(u, scheme);
  let path = s.path, params = '';
  if (USES_PARAMS.has(s.scheme) && path.includes(';')) [path, params] = splitParams(path);
  return { scheme: s.scheme, netloc: s.netloc, path, params, query: s.query, fragment: s.fragment };
}
function urlunsplit({ scheme, netloc, path, query, fragment }) {
  let u = path;
  if (netloc) { if (u && u[0] !== '/') u = '/' + u; u = '//' + netloc + u; }
  else if (u.startsWith('//')) u = '//' + u;
  else if (scheme && USES_NETLOC.has(scheme) && (!u || u[0] === '/')) u = '//' + u;
  if (scheme) u = scheme + ':' + u;
  if (query) u += '?' + query;
  if (fragment) u += '#' + fragment;
  return u;
}
function urlunparse(p) {
  let path = p.path;
  if (p.params) path = path + ';' + p.params;
  return urlunsplit({ scheme: p.scheme, netloc: p.netloc, path, query: p.query, fragment: p.fragment });
}
// urljoin(base, url)
function urljoin(base, u) {
  if (!base) return u;
  if (!u) return base;
  const b = urlparse(base, '');
  const r = urlparse(u, b.scheme);
  let { scheme, netloc, path, params, query, fragment } = r;
  if (scheme !== b.scheme || !USES_RELATIVE.has(scheme)) return u;
  if (USES_NETLOC.has(scheme)) {
    if (netloc) return urlunparse({ scheme, netloc, path, params, query, fragment });
    netloc = b.netloc;
  }
  if (!path && !params) {
    path = b.path; params = b.params;
    if (!query) query = b.query;
    return urlunparse({ scheme, netloc, path, params, query, fragment });
  }
  const baseParts = b.path.split('/');
  if (baseParts[baseParts.length - 1] !== '') baseParts.pop();
  let segs;
  if (path[0] === '/') segs = path.split('/');
  else {
    segs = baseParts.concat(path.split('/'));
    if (segs.length > 2) segs = [segs[0]].concat(segs.slice(1, -1).filter(Boolean), [segs[segs.length - 1]]);
  }
  const out = [];
  for (const seg of segs) {
    if (seg === '..') { if (out.length) out.pop(); } else if (seg !== '.') out.push(seg);
  }
  if (segs[segs.length - 1] === '.' || segs[segs.length - 1] === '..') out.push('');
  return urlunparse({ scheme, netloc, path: out.join('/') || '/', params, query, fragment });
}

// hostname 속성(_hostinfo + 소문자, 존 정보는 그대로)
function hostnameOf(netloc) {
  const hostinfo = rpartition(netloc, '@')[2];
  const [, open, bracketed] = partition(hostinfo, '[');
  const h = open ? partition(bracketed, ']')[0] : partition(hostinfo, ':')[0];
  if (!h) return null;
  const [a, pct, zone] = partition(h, '%');
  return a.toLowerCase() + pct + zone;
}

// quote(s, safe=string.punctuation, encoding='iso-8859-1') — 리다이렉트 주소 정리용
const ALWAYS_SAFE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_.-~';
const PUNCT = '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~';
const QUOTE_SAFE = new Set(Array.from(ALWAYS_SAFE + PUNCT));
function quoteLatin1(s) {
  if (!s) return s;
  encodeCheck(s, 'latin-1', 256);
  let out = '';
  for (const ch of s) {
    const o = ch.codePointAt(0);
    out += (o < 128 && QUOTE_SAFE.has(ch)) ? ch : '%' + hex(o, 2).toUpperCase();
  }
  return out;
}

// unquote(s) — ASCII 덩어리별로 %XX 를 바이트로 바꾼 뒤 utf-8(replace) 디코드
function unquoteToBytes(run) {
  const bits = run.split('%');
  const out = [Buffer.from(bits[0], 'latin1')];
  for (const item of bits.slice(1)) {
    if (/^[0-9a-fA-F]{2}/.test(item)) out.push(Buffer.from([parseInt(item.slice(0, 2), 16)]), Buffer.from(item.slice(2), 'latin1'));
    else out.push(Buffer.from('%' + item, 'latin1'));
  }
  return Buffer.concat(out);
}
function unquote(s) {
  if (!s.includes('%')) return s;
  return s.replace(/[\x00-\x7f]+/g, (run) => unquoteToBytes(run).toString('utf8'));
}
// parse_qs(qs) — 빈 값은 버림, 같은 키는 목록으로
function parseQs(qs) {
  const out = Object.create(null);
  for (const nv of String(qs || '').split('&')) {
    if (!nv) continue;
    const [name, eq, value] = partition(nv, '=');
    if (!eq || !value) continue;
    const k = unquote(name.replace(/\+/g, ' '));
    (out[k] = out[k] || []).push(unquote(value.replace(/\+/g, ' ')));
  }
  return out;
}

// ── 기상청 주소 검사(helper.py do_GET 그대로): 형식 오류는 ValueError(→502), 아니면 true/false ──
function kmaUrlAllowed(u) {
  const pu = urlparse(u);
  const host = hostnameOf(pu.netloc) || '';
  const okHost = host.endsWith('.kma.go.kr') || host === 'apihub.kma.go.kr' || host.endsWith('.data.go.kr') || host === 'data.go.kr';
  return (pu.scheme === 'http' || pu.scheme === 'https') && okHost;
}

// ── 응답 디코딩: utf-8(strict) 실패 시 파이썬 euc-kr(replace) ──
const KSX_CHO = [0, 1, -1, 2, -1, -1, 3, 4, 5, -1, -1, -1, -1, -1, -1, -1, 6, 7, 8, -1, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
const KSX_JONG = [1, 2, 3, 4, 5, 6, 7, -1, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, -1, 18, 19, 20, 21, 22, -1, 23, 24, 25, 26, 27];
let _ksx = null;
function ksxTable() {   // KS X 1001(A1~FE × A1~FE) — ICU 표에서 파이썬과 다른 칸만 고친다
  if (_ksx) return _ksx;
  const b = Buffer.alloc(94 * 94 * 2);
  for (let a = 0; a < 94; a++) for (let c = 0; c < 94; c++) { b[(a * 94 + c) * 2] = 0xa1 + a; b[(a * 94 + c) * 2 + 1] = 0xa1 + c; }
  const t = Array.from(new TextDecoder('euc-kr').decode(b)).map((ch) => (ch === '�' ? null : ch));
  if (t.length !== 94 * 94) throw new Error('euc-kr 표 생성 실패');
  for (let c = 0; c < 94; c++) { t[(0xc9 - 0xa1) * 94 + c] = null; t[(0xfe - 0xa1) * 94 + c] = null; }   // 사용자 정의 영역
  t[(0xa4 - 0xa1) * 94 + (0xd4 - 0xa1)] = null;   // 채움 문자(조합 시퀀스로만)
  t[(0xa2 - 0xa1) * 94 + (0xe6 - 0xa1)] = '€';
  t[(0xa2 - 0xa1) * 94 + (0xe7 - 0xa1)] = '®';
  _ksx = t;
  return t;
}
function pyEucKrDecode(buf) {
  const T = ksxTable();
  const n = buf.length;
  let out = '', i = 0;
  while (i < n) {
    const c = buf[i];
    if (c < 0x80) { out += String.fromCharCode(c); i++; continue; }
    if (n - i < 2) { out += '�'; break; }   // incomplete multibyte sequence → 남은 것 통째로 하나
    const t = buf[i + 1];
    if (c === 0xa4 && t === 0xd4) {   // KS X 1001:1998 부속서 3 조합 시퀀스(8바이트)
      if (n - i < 8) { out += '�'; break; }
      if (buf[i + 2] !== 0xa4 || buf[i + 4] !== 0xa4 || buf[i + 6] !== 0xa4) { out += '�'; i++; continue; }
      const b3 = buf[i + 3], b5 = buf[i + 5], b7 = buf[i + 7];
      const cho = b3 >= 0xa1 && b3 <= 0xbe ? KSX_CHO[b3 - 0xa1] : -1;
      const jung = b5 >= 0xbf && b5 <= 0xd3 ? b5 - 0xbf : -1;
      const jong = b7 === 0xd4 ? 0 : (b7 >= 0xa1 && b7 <= 0xbe ? KSX_JONG[b7 - 0xa1] : -1);
      if (cho < 0 || jung < 0 || jong < 0) { out += '�'; i++; continue; }
      out += String.fromCharCode(0xac00 + cho * 588 + jung * 28 + jong);
      i += 8; continue;
    }
    const ch = (c >= 0xa1 && c <= 0xfe && t >= 0xa1 && t <= 0xfe) ? T[(c - 0xa1) * 94 + (t - 0xa1)] : null;
    if (ch) { out += ch; i += 2; } else { out += '�'; i++; }
  }
  return out;
}
function decodeKmaBody(buf) {
  try { return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buf); } catch (e) { return pyEucKrDecode(buf); }
}

// ── 프록시(urllib getproxies / proxy_bypass) ──
// 윈도 파이썬의 os.environ 은 키가 대문자 → <SCHEME>_PROXY 만 본다(빈 값 무시). 환경변수가 하나도 없으면 레지스트리.
function envProxies(env = process.env) {
  const out = {};
  for (const name of Object.keys(env)) {
    const up = name.toUpperCase();
    if (up.length > 5 && up[up.length - 6] === '_' && up.endsWith('PROXY')) {
      const v = env[name];
      if (v) out[up.slice(0, -6).toLowerCase()] = v;
    }
  }
  if (Object.keys(env).some((k) => k.toUpperCase() === 'REQUEST_METHOD')) delete out.http;
  return out;
}
function parseRegistryProxy(enable, server) {   // getproxies_registry
  const proxies = {};
  try {
    if (!enable) return proxies;
    if (server === null || server === undefined) return proxies;
    let ps = String(server);
    if (!ps.includes('=') && !ps.includes(';')) ps = 'http=' + ps + ';https=' + ps + ';ftp=' + ps;
    for (const p of ps.split(';')) {
      const k = p.indexOf('=');
      if (k < 0) throw new Error('ValueError');
      const protocol = p.slice(0, k);
      let address = p.slice(k + 1);
      if (!/^(?:[^/:]+):\/\//.test(address)) {
        if (['http', 'https', 'ftp'].includes(protocol)) address = 'http://' + address;
        else if (protocol === 'socks') address = 'socks://' + address;
      }
      proxies[protocol] = address;
    }
    if (proxies.socks) {
      const a = proxies.socks.replace(/^socks:\/\//, 'socks4://');
      proxies.http = proxies.http || a;
      proxies.https = proxies.https || a;
    }
  } catch (e) { /* 형식 오류: 그때까지 모은 것 */ }
  return proxies;
}
function readInternetSettings() {   // HKCU Internet Settings 의 ProxyEnable/ProxyServer/ProxyOverride
  return new Promise((resolve) => {
    let cp;
    try { cp = spawn('reg', ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }); } catch (e) { resolve({}); return; }
    const chunks = [];
    const timer = setTimeout(() => { try { cp.kill(); } catch (e) { /* 무시 */ } }, 10000);
    cp.stdout.on('data', (b) => chunks.push(b));
    cp.on('error', () => { clearTimeout(timer); resolve({}); });
    cp.on('close', () => {
      clearTimeout(timer);
      const buf = Buffer.concat(chunks);
      let txt;
      try { txt = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (e) { txt = new TextDecoder('euc-kr').decode(buf); }
      const vals = {};
      for (const line of txt.split(/\r\n|\r|\n/)) {
        const m = /^ {4}(.+?) {4}(REG_[A-Z_]+)(?: {4}(.*))?$/.exec(line);
        if (!m) continue;
        let v = m[3] === undefined ? '' : m[3];
        if (m[2] === 'REG_DWORD' || m[2] === 'REG_QWORD') v = Number(BigInt(v));
        vals[m[1].toLowerCase()] = v;
      }
      resolve({ enable: vals.proxyenable, server: vals.proxyserver, override: vals.proxyoverride });
    });
  });
}
let _sysProxy = null;
// 파이썬처럼 첫 사용 때 한 번 읽어 둔다
function systemProxyConfig() {
  if (_sysProxy) return _sysProxy;
  _sysProxy = (async () => {
    const env = envProxies();
    if (Object.keys(env).length) return { env, proxies: env };
    if (process.platform !== 'win32') return { env: {}, proxies: {} };
    const r = await readInternetSettings();
    return { env: {}, proxies: parseRegistryProxy(r.enable, r.server), regEnable: r.enable, regOverride: r.override };
  })();
  return _sysProxy;
}
function splitPortPy(host) {   // _splitport
  const m = /^([\s\S]*):([0-9]*)$/.exec(host);
  if (m) { if (m[2]) return [m[1], m[2]]; return [m[1], null]; }
  return [host, null];
}
function fnmatchWin(name, pat) {   // fnmatch(대소문자 무시, / → \)
  const norm = (s) => s.toLowerCase().replace(/\//g, '\\');
  name = norm(name); pat = norm(pat);
  let re = '', i = 0;
  while (i < pat.length) {
    const c = pat[i++];
    if (c === '*') { if (!re.endsWith('[\\s\\S]*')) re += '[\\s\\S]*'; } else if (c === '?') re += '[\\s\\S]';
    else if (c === '[') {
      let j = i;
      if (pat[j] === '!') j++;
      if (pat[j] === ']') j++;
      while (j < pat.length && pat[j] !== ']') j++;
      if (j >= pat.length) re += '\\[';
      else {
        let stuff = pat.slice(i, j).replace(/\\/g, '\\\\');
        i = j + 1;
        if (!stuff) re += '(?!)';
        else if (stuff === '!') re += '[\\s\\S]';
        else { if (stuff[0] === '!') stuff = '^' + stuff.slice(1); else if (stuff[0] === '^') stuff = '\\' + stuff; re += '[' + stuff + ']'; }
      }
    } else re += c.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  }
  try { return new RegExp('^' + re + '$').test(name); } catch (e) { return false; }
}
function proxyBypass(host, cfg) {
  if (cfg.env && Object.keys(cfg.env).length) {   // proxy_bypass_environment
    const noProxy = cfg.env.no;
    if (noProxy === undefined) return false;
    if (noProxy === '*') return true;
    const h = host.toLowerCase();
    const hostonly = splitPortPy(h)[0];
    for (let name of noProxy.split(',')) {
      name = pyStrip(name);
      if (!name) continue;
      name = name.replace(/^\.+/, '').toLowerCase();
      if (hostonly === name || h === name) return true;
      name = '.' + name;
      if (hostonly.endsWith(name) || h.endsWith(name)) return true;
    }
    return false;
  }
  if (!cfg.regEnable || !cfg.regOverride) return false;   // proxy_bypass_registry
  const h = splitPortPy(host)[0];
  for (let test of String(cfg.regOverride).split(';')) {
    test = pyStrip(test);
    if (test === '<local>') { if (!h.includes('.')) return true; } else if (fnmatchWin(h, test)) return true;
  }
  return false;
}
function parseProxy(proxy) {   // _parse_proxy → [scheme, user, password, hostport]
  const m = /^([^/:]+):([\s\S]*)$/.exec(proxy);
  let scheme = m ? m[1].toLowerCase() : null;
  const rScheme = m ? m[2] : proxy;
  let authority;
  if (!rScheme.startsWith('/')) { scheme = null; authority = proxy; } else {
    if (!rScheme.startsWith('//')) throw pyError('ValueError', 'proxy URL with no authority: ' + P.pyRepr(proxy));
    let end;
    if (rScheme.includes('@')) end = rScheme.indexOf('/', rScheme.indexOf('@'));
    else end = rScheme.indexOf('/', 2);
    authority = end === -1 ? rScheme.slice(2) : rScheme.slice(2, end);
  }
  const [ui, at, hostport] = rpartition(authority, '@');
  let user = null, password = null;
  if (at) { const [u, colon, pw] = partition(ui, ':'); user = u; password = colon ? pw : null; }
  return [scheme, user, password, hostport];
}

// ── http.client ──
const MAXLINE = 65536;
const CTRL_RE = /[\x00-\x20\x7f]/;
function getHostport(host, defPort) {   // HTTPConnection._get_hostport
  let port = defPort;
  const i = host.lastIndexOf(':'), j = host.lastIndexOf(']');
  if (i > j) {
    const ps = host.slice(i + 1);
    try { port = Number(P.int(ps)); } catch (e) {
      if (ps === '') port = defPort;
      else throw pyError('InvalidURL', "nonnumeric port: '" + ps + "'");
    }
    host = host.slice(0, i);
  }
  if (host && host[0] === '[' && host[host.length - 1] === ']') host = host.slice(1, -1);
  return [host, port];
}
function validateNoCtrl(s) {
  const m = CTRL_RE.exec(s);
  if (m) throw pyError('InvalidURL', "URL can't contain control characters. " + P.pyRepr(s) + ' (found at least ' + P.pyRepr(m[0]) + ')');
}
const wrapV6 = (h) => (h.includes(':') && h[0] !== '[' ? '[' + h + ']' : h);
const idnaHost = (h) => (isAscii(h) ? h : (url.domainToASCII(h) || h));

// 윈도 소켓 오류 문구(파이썬 OSError 문자열, 끝의 마침표 제거)
const WIN_KO = { 10061: '대상 컴퓨터에서 연결을 거부했으므로 연결하지 못했습니다', 10054: '현재 연결은 원격 호스트에 의해 강제로 끊겼습니다',
  10053: '현재 연결은 사용자의 호스트 시스템의 소프트웨어의 의해 중단되었습니다', 10051: '연결할 수 없는 네트워크에서 소켓 작업을 시도했습니다',
  10065: '연결할 수 없는 호스트로 소켓 작업을 시도했습니다', 10060: '연결된 구성원으로부터 응답이 없어 연결하지 못했거나, 호스트로부터 응답이 없어 연결이 끊어졌습니다' };
const WIN_EN = { 10061: 'No connection could be made because the target machine actively refused it', 10054: 'An existing connection was forcibly closed by the remote host',
  10053: 'An established connection was aborted by the software in your host machine', 10051: 'A socket operation was attempted to an unreachable network',
  10065: 'A socket operation was attempted to an unreachable host', 10060: 'A connection attempt failed because the connected party did not properly respond after a period of time, or established connection failed because connected host has failed to respond' };
const WIN_CODE = { ECONNREFUSED: 10061, ECONNRESET: 10054, ECONNABORTED: 10053, ENETUNREACH: 10051, EHOSTUNREACH: 10065, ETIMEDOUT: 10060 };
let _ko = null;
const isKo = () => {
  if (_ko === null) { try { _ko = /^ko\b/i.test(Intl.DateTimeFormat().resolvedOptions().locale); } catch (e) { _ko = false; } }
  return _ko;
};
const winText = (n) => '[WinError ' + n + '] ' + (isKo() ? WIN_KO : WIN_EN)[n];
const SSL_LINE = '(_ssl.c:1028)';
let _caCache;
function caList() {   // 파이썬(윈도)은 시스템 인증서 저장소를 씀 → Node 기본 + 시스템
  if (_caCache !== undefined) return _caCache;
  _caCache = null;
  try {
    if (typeof tls.getCACertificates === 'function') _caCache = Array.from(new Set([...tls.getCACertificates('default'), ...tls.getCACertificates('system')]));
  } catch (e) { _caCache = null; }
  return _caCache || undefined;
}
const CERT_CODES = /^(UNABLE_TO_|CERT_|DEPTH_ZERO_|SELF_SIGNED_|INVALID_CA|PATH_LENGTH_|INVALID_PURPOSE|HOSTNAME_MISMATCH|ERROR_IN_CERT)/;

// Node 소켓 오류 → 파이썬 OSError 문자열
function osErrText(e) {
  if (e && Array.isArray(e.errors) && e.errors.length) e = e.errors[e.errors.length - 1];   // create_connection: 마지막 시도 오류
  const code = e && e.code;
  if (code === 'ENOTFOUND') return '[Errno 11001] getaddrinfo failed';
  if (code === 'EAI_AGAIN') return '[Errno 11002] getaddrinfo failed';
  if (code === 'EAI_FAIL') return '[Errno 11003] getaddrinfo failed';
  if (code === 'ENODATA' || code === 'EAI_NODATA') return '[Errno 11004] getaddrinfo failed';
  if (code && WIN_CODE[code]) return winText(WIN_CODE[code]);
  return e && e.message ? e.message : String(e);
}

// 버퍼 읽기(파이썬 socket.makefile 의 readline/read 흉내). 시간 초과는 tmo 문구로.
class SockReader {
  constructor(sock, onTimeoutText) {
    this.sock = sock; this.chunks = []; this.len = 0; this.eof = false; this.err = null; this.wait = null;
    this.timeoutText = onTimeoutText;
    this.h = {
      data: (d) => { this.chunks.push(d); this.len += d.length; this._wake(); },   // 큰 본문도 한 번만 합치도록 조각으로 모은다
      end: () => { this.eof = true; this._wake(); },
      close: () => { this.eof = true; this._wake(); },
      error: (e) => { if (!this.err) this.err = e; this._wake(); },
    };
    for (const k of Object.keys(this.h)) sock.on(k, this.h[k]);
  }
  detach() { for (const k of Object.keys(this.h)) this.sock.removeListener(k, this.h[k]); }
  _wake() { const w = this.wait; this.wait = null; if (w) w(); }
  _more() {
    if (this.err) throw this._mapErr();
    if (this.eof) return Promise.resolve(false);
    return new Promise((r) => { this.wait = r; }).then(() => { if (this.err) throw this._mapErr(); return true; });
  }
  _mapErr() {
    const e = this.err;
    if (e && e.wnsTimeout) return pyError('TimeoutError', this.timeoutText);
    if (e && e.code === 'ECONNRESET') return pyError('ConnectionResetError', winText(10054));
    return pyError('OSError', osErrText(e));
  }
  get buf() {   // 남은 바이트(필요할 때만 합침)
    if (this.chunks.length > 1) this.chunks = [Buffer.concat(this.chunks, this.len)];
    return this.chunks[0] || Buffer.alloc(0);
  }
  async readline(limit) {
    for (;;) {
      const b = this.buf;
      const nl = b.indexOf(0x0a);
      if (nl >= 0 && nl + 1 <= limit) return this._take(nl + 1);
      if (this.len >= limit) return this._take(limit);
      if (this.eof && !this.err) return this._take(this.len);
      await this._more();
    }
  }
  async read(n) {   // n 바이트(EOF 면 그보다 적게)
    while (this.len < n && !(this.eof && !this.err)) await this._more();
    return this._take(Math.min(n, this.len));
  }
  async readAll() {
    while (!(this.eof && !this.err)) await this._more();
    return this._take(this.len);
  }
  _take(n) {
    const b = this.buf;
    const out = Buffer.from(b.subarray(0, n));
    const rest = b.subarray(n);
    this.chunks = rest.length ? [rest] : [];
    this.len = rest.length;
    return out;
  }
}

function armTimeout(sock, ms) {
  sock.on('error', () => {});   // 처리 안 된 'error' 로 프로세스가 죽지 않게(실제 처리는 단계별 리스너)
  sock.setTimeout(ms);
  sock.once('timeout', () => { const e = new Error('timed out'); e.wnsTimeout = true; sock.destroy(e); });
}

// 연결 단계(실패하면 URLError 로 감싸는 구간): TCP → (CONNECT 터널) → (TLS)
async function openConnection(o) {
  const raw = net.connect({ host: o.host, port: o.port });
  armTimeout(raw, o.timeout);
  await new Promise((resolve, reject) => {
    raw.once('connect', resolve);
    raw.once('error', (e) => reject(urlError(e.wnsTimeout ? 'timed out' : osErrText(e))));
  });
  if (o.tunnel) {
    const t = o.tunnel;
    let head = 'CONNECT ' + wrapV6(idnaHost(t.host)) + ':' + t.port + ' HTTP/1.1\r\n';
    for (const [k, v] of t.headers) head += k + ': ' + v + '\r\n';
    raw.write(Buffer.from(head + '\r\n', 'latin1'));
    const rd = new SockReader(raw, 'timed out');
    let st;
    try { st = await readStatus(rd); } catch (e) {
      if (e.pyType === 'RemoteDisconnected' || e.pyType === 'ConnectionResetError' || e.pyType === 'TimeoutError' || e.pyType === 'OSError') throw urlError(e.message);
      throw e;
    }
    await readHeaderLines(rd);
    raw.pause();
    rd.detach();
    if (rd.buf.length) raw.unshift(rd.buf);
    if (st.status !== 200) { raw.destroy(); throw urlError('Tunnel connection failed: ' + st.status + ' ' + pyStrip(st.reason)); }
  }
  if (!o.tls) return raw;
  const sni = net.isIP(o.servername) ? undefined : o.servername;
  const tsock = tls.connect({ socket: raw, servername: sni, host: o.servername, ca: o.ca || caList() });
  armTimeout(tsock, o.timeout);
  let rawErr = null;
  raw.on('error', (e) => { rawErr = e; });
  await new Promise((resolve, reject) => {
    tsock.once('secureConnect', resolve);
    tsock.once('error', (e) => {
      if (e.wnsTimeout) return reject(urlError('_ssl.c:1011: The handshake operation timed out'));
      if (e.code === 'ERR_TLS_CERT_ALTNAME_INVALID') {
        const what = net.isIP(o.servername) ? 'IP address mismatch' : 'Hostname mismatch';
        return reject(urlError('[SSL: CERTIFICATE_VERIFY_FAILED] certificate verify failed: ' + what + ", certificate is not valid for '" + o.servername + "'. " + SSL_LINE));
      }
      if (e.code && CERT_CODES.test(e.code)) return reject(urlError('[SSL: CERTIFICATE_VERIFY_FAILED] certificate verify failed: ' + e.message + ' ' + SSL_LINE));
      const re = rawErr || e;
      if (re && re.code === 'ECONNRESET' && /ECONNRESET/.test(re.message || '')) return reject(urlError(winText(10054)));
      if (e.code === 'ECONNRESET') return reject(urlError('[SSL: UNEXPECTED_EOF_WHILE_READING] EOF occurred in violation of protocol ' + SSL_LINE));
      return reject(urlError(osErrText(e)));
    });
  });
  return tsock;
}

// str.split(None, maxsplit)
function pySplitWs(s, maxsplit) {
  const out = [];
  let i = 0;
  const n = s.length;
  for (;;) {
    while (i < n && PY_WS.has(s[i])) i++;
    if (i >= n) break;
    if (out.length === maxsplit) { out.push(s.slice(i)); break; }
    let j = i;
    while (j < n && !PY_WS.has(s[j])) j++;
    out.push(s.slice(i, j));
    i = j;
  }
  return out;
}
// int(line, 16) — 청크 크기
function pyInt16(s) {
  const t = pyStrip(s, new Set(Array.from(' \t\n\r\x0b\x0c')));
  if (!/^[+-]?(?:0[xX](?:_?[0-9a-fA-F])+|[0-9a-fA-F](?:_?[0-9a-fA-F])*)$/.test(t)) throw pyError('ValueError', 'invalid literal for int() with base 16');
  const neg = t[0] === '-';
  const body = t.replace(/^[+-]/, '').replace(/^0[xX]/, '').replace(/_/g, '');
  const v = BigInt('0x' + body);
  return neg ? -v : v;
}

// _read_status
async function readStatus(rd) {
  const lineB = await rd.readline(MAXLINE + 1);
  const line = lineB.toString('latin1');
  if (lineB.length > MAXLINE) throw pyError('LineTooLong', 'got more than 65536 bytes when reading status line');
  if (!line) throw pyError('RemoteDisconnected', 'Remote end closed connection without response');
  let version = '', status = '', reason = '';
  const p3 = pySplitWs(line, 2);
  if (p3.length === 3) [version, status, reason] = p3;
  else {
    const p2 = pySplitWs(line, 1);
    if (p2.length === 2) [version, status] = p2;
  }
  if (!version.startsWith('HTTP/')) throw pyError('BadStatusLine', line);
  let code;
  try { code = Number(P.int(status)); } catch (e) { throw pyError('BadStatusLine', line); }
  if (code < 100 || code > 999) throw pyError('BadStatusLine', line);
  return { version, status: code, reason };
}
// _read_headers + email 파서(compat32) 일부: 이름은 대소문자 무시, get 은 첫 값
async function readHeaderLines(rd) {
  const lines = [];
  for (;;) {
    const l = await rd.readline(MAXLINE + 1);
    if (l.length > MAXLINE) throw pyError('LineTooLong', 'got more than 65536 bytes when reading header line');
    lines.push(l.toString('latin1'));
    if (lines.length > 100) throw pyError('HTTPException', 'got more than 100 headers');
    const s = lines[lines.length - 1];
    if (s === '\r\n' || s === '\n' || s === '') break;
  }
  return lines;
}
function parseHeaderLines(lines) {
  const hdrs = [];
  const HEADER_RE = /^(From |[\x21-\x39\x3b-\x7e]*:|[\t ])/;
  let cur = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === '\r\n' || line === '\n' || line === '') break;
    if (/^[ \t]/.test(line)) { if (cur) cur.lines.push(line); continue; }
    if (i === 0 && line.startsWith('From ')) continue;
    if (!HEADER_RE.test(line)) break;   // 헤더가 아닌 줄부터는 본문 취급
    const k = line.indexOf(':');
    if (k < 0) continue;
    cur = { name: line.slice(0, k), lines: [line] };
    hdrs.push(cur);
  }
  return hdrs.map((h) => {
    const first = h.lines[0];
    const v = first.slice(first.indexOf(':') + 1).replace(/^[ \t]+/, '') + h.lines.slice(1).join('');
    return [h.name, v.replace(/[\r\n]+$/, '')];
  });
}
const hget = (hdrs, name) => { const n = name.toLowerCase(); const h = hdrs.find((x) => x[0].toLowerCase() === n); return h ? h[1] : null; };

// 응답 본문(HTTPResponse.read())
async function readBody(rd, resp) {
  if (resp.chunked) {
    const value = [];
    let got = 0;
    try {
      for (;;) {
        const lb = await rd.readline(MAXLINE + 1);
        if (lb.length > MAXLINE) throw pyError('LineTooLong', 'got more than 65536 bytes when reading chunk size');
        let line = lb.toString('latin1');
        const sc = line.indexOf(';');
        if (sc >= 0) line = line.slice(0, sc);
        let size;
        try { size = Number(pyInt16(line)); } catch (e) { throw pyError('IncompleteRead', 'x'); }
        if (size < 0) {   // fp.read(음수) = 끝까지 → 다음 CRLF 에서 IncompleteRead
          const rest = await rd.readAll();
          value.push(rest); got += rest.length;
          throw pyError('IncompleteRead', 'x');
        }
        if (size === 0) {
          for (;;) {   // 트레일러 버림
            const t = await rd.readline(MAXLINE + 1);
            if (t.length > MAXLINE) throw pyError('LineTooLong', 'got more than 65536 bytes when reading trailer line');
            const ts = t.toString('latin1');
            if (!ts || ts === '\r\n' || ts === '\n') break;
          }
          break;
        }
        const data = await rd.read(size);
        if (data.length < size) throw pyError('IncompleteRead', 'x');
        value.push(data); got += data.length;
        const crlf = await rd.read(2);
        if (crlf.length < 2) throw pyError('IncompleteRead', 'x');
      }
    } catch (e) {
      if (e.pyType === 'IncompleteRead') throw pyError('IncompleteRead', 'IncompleteRead(' + got + ' bytes read)');
      throw e;
    }
    return Buffer.concat(value);
  }
  if (resp.length === null) return rd.readAll();
  const data = await rd.read(resp.length);
  if (data.length < resp.length) throw pyError('IncompleteRead', 'IncompleteRead(' + data.length + ' bytes read, ' + (resp.length - data.length) + ' more expected)');
  return data;
}

// HTTPConnection 한 번(요청 보내고 상태·헤더까지). 본문은 resp.read()
async function httpOnce(req, cfg) {
  const isHttps = req.type === 'https';
  const [host, port0] = getHostport(req.host, isHttps ? 443 : 80);
  validateNoCtrl(host);
  const port = port0 < 0 || port0 > 65535 ? (port0 & 0xffff) : port0;
  const headers = [['Host', req.hostHeader], ['User-Agent', cfg.userAgent]];
  for (const [k, v] of req.headers) headers.push([k.replace(/\w+/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase()), v]);
  headers.push(['Connection', 'close']);
  let tunnel = null;
  if (req.tunnelHost) {
    const th = [];
    const pi = headers.findIndex((h) => h[0] === 'Proxy-Authorization');
    if (pi >= 0) { th.push(headers[pi]); headers.splice(pi, 1); }
    const [tHost, tPort] = getHostport(req.tunnelHost, 443);
    th.push(['Host', idnaHost(tHost) + ':' + tPort]);
    tunnel = { host: tHost, port: tPort, headers: th };
  }
  // putrequest / putheader 검사(연결 전)
  const target = req.selector || '/';
  validateNoCtrl(target);
  const reqLine = 'GET ' + target + ' HTTP/1.1';
  encodeCheck(reqLine, 'ascii', 128);
  const all = [['Accept-Encoding', 'identity']].concat(headers);
  for (const [, v] of all) encodeCheck(String(v), 'latin-1', 256);
  const sock = await openConnection({ host, port, tls: isHttps, servername: tunnel ? tunnel.host : host, tunnel, timeout: cfg.timeout, ca: cfg.ca });
  const rd = new SockReader(sock, isHttps ? 'The read operation timed out' : 'timed out');
  if (sock.isPaused && sock.isPaused()) sock.resume();
  let head = reqLine + '\r\n';
  for (const [k, v] of all) head += k + ': ' + v + '\r\n';
  // 보내는 중 오류는 h.request 안(OSError → URLError), 보낸 뒤 오류는 getresponse(그대로)
  await new Promise((resolve, reject) => {
    sock.write(Buffer.from(head + '\r\n', 'latin1'), (e) => (e ? reject(e) : resolve()));
  }).catch((e) => { sock.destroy(); throw urlError(e && e.wnsTimeout ? 'timed out' : osErrText(rd.err || e)); });
  try {
    let st;
    for (;;) {
      st = await readStatus(rd);
      if (st.status !== 100) break;
      await readHeaderLines(rd);
    }
    const reason = pyStrip(st.reason);
    if (!(st.version === 'HTTP/1.0' || st.version === 'HTTP/0.9' || st.version.startsWith('HTTP/1.'))) throw pyError('UnknownProtocol', st.version);
    const hdrs = parseHeaderLines(await readHeaderLines(rd));
    const te = hget(hdrs, 'transfer-encoding');
    const chunked = !!te && te.toLowerCase() === 'chunked';
    let length = null;
    const cl = hget(hdrs, 'content-length');
    if (cl && !chunked) { try { length = Number(P.int(cl)); if (length < 0) length = null; } catch (e) { length = null; } }
    if (st.status === 204 || st.status === 304 || (st.status >= 100 && st.status < 200)) length = 0;
    const resp = { status: st.status, reason, headers: hdrs, chunked, length };
    resp.read = async () => { try { return await readBody(rd, resp); } finally { sock.destroy(); } };
    resp.close = () => sock.destroy();
    return resp;
  } catch (e) { sock.destroy(); throw e; }
}

// Request(url) — unwrap/_splittag/_splittype/_splithost
function makeRequest(u, headers = [], redirected = false) {
  let full = pyStrip(String(u));
  if (full[0] === '<' && full[full.length - 1] === '>') full = pyStrip(full.slice(1, -1));
  if (full.startsWith('URL:')) full = pyStrip(full.slice(4));
  let fragment = null;
  const h = full.lastIndexOf('#');
  if (h >= 0) { fragment = full.slice(h + 1); full = full.slice(0, h); }
  const fullUrl = fragment ? full + '#' + fragment : full;
  const m = /^([^/:]+):([\s\S]*)$/.exec(full);
  if (!m) throw pyError('ValueError', 'unknown url type: ' + P.pyRepr(fullUrl));
  const type = m[1].toLowerCase();
  let host = null, selector = m[2];
  const hm = /^\/\/([^/#?]*)([\s\S]*)$/.exec(m[2]);
  if (hm) { host = hm[1]; selector = hm[2]; if (selector && selector[0] !== '/') selector = '/' + selector; }
  if (host) host = unquote(host);
  if (!redirected) urlparse(fullUrl);   // request_host(): urlparse 오류(Invalid IPv6 URL 등)는 여기서
  return { fullUrl, type, host, selector, headers: headers.slice(), tunnelHost: null, hostHeader: null };
}

// OpenerDirector.open 한 번(리다이렉트 제외)
async function openOnce(req, cfg) {
  if (req.type !== 'http' && req.type !== 'https') throw urlError('unknown url type: ' + req.type);
  if (!req.host) throw urlError('no host given');
  req.hostHeader = req.host;   // do_request_: Host = 원래 호스트(프록시 설정 전)
  const proxy = cfg.proxyConfig.proxies[req.type];
  if (proxy) {
    const origType = req.type;
    const [pt, user, pw, hp] = parseProxy(proxy);
    const ptype = pt || origType;
    if (!(req.host && proxyBypass(req.host, cfg.proxyConfig))) {
      if (user && pw) {
        const cred = Buffer.from(unquote(user) + ':' + unquote(pw), 'utf8').toString('base64');
        req.headers = req.headers.filter((x) => x[0].toLowerCase() !== 'proxy-authorization').concat([['Proxy-authorization', 'Basic ' + cred]]);
      }
      const hostport = unquote(hp);
      if (req.type === 'https' && !req.tunnelHost) req.tunnelHost = req.host;
      else { req.type = ptype; req.selector = req.fullUrl; }
      req.host = hostport;
      if (!(origType === ptype || origType === 'https') && ptype !== 'http' && ptype !== 'https') throw urlError('unknown url type: ' + ptype);
    }
  }
  return httpOnce(req, cfg);
}

const INF_MSG = 'The HTTP server returned a redirect error that would lead to an infinite loop.\nThe last 30x error message was:\n';
const REDIRECTS = new Set([301, 302, 303, 307, 308]);

// urllib.request.urlopen(u, timeout).read() — 본문 바이트. 오류 문구는 str(e) 그대로.
// o: { timeout(ms), userAgent, proxyConfig(테스트용 {env, proxies, regEnable, regOverride}), ca(테스트용) }
async function urlopen(u, o = {}) {
  const cfg = {
    timeout: o.timeout || 20000,
    userAgent: o.userAgent || 'Python-urllib/3.13',
    proxyConfig: o.proxyConfig || await systemProxyConfig(),
    ca: o.ca,
  };
  let req = makeRequest(u);
  let visited = null;
  for (;;) {
    const r = await openOnce(req, cfg);
    if (r.status >= 200 && r.status < 300) return r.read();
    const loc = hget(r.headers, 'location');
    const newRaw = loc !== null ? loc : hget(r.headers, 'uri');
    if (!REDIRECTS.has(r.status) || newRaw === null) { r.close(); throw pyError('HTTPError', 'HTTP Error ' + r.status + ': ' + r.reason); }
    let parts;
    try { parts = urlparse(newRaw); } catch (e) { r.close(); throw e; }
    if (!['http', 'https', 'ftp', ''].includes(parts.scheme)) {
      r.close();
      throw pyError('HTTPError', 'HTTP Error ' + r.status + ': ' + r.reason + " - Redirection to url '" + newRaw + "' is not allowed");
    }
    if (!parts.path && parts.netloc) parts.path = '/';
    let newurl = quoteLatin1(urlunparse(parts));
    newurl = urljoin(req.fullUrl, newurl).replace(/ /g, '%20');
    const next = makeRequest(newurl, req.headers, true);
    if (visited) {
      if ((visited.get(newurl) || 0) >= 4 || visited.size >= 10) { r.close(); throw pyError('HTTPError', 'HTTP Error ' + r.status + ': ' + INF_MSG + r.reason); }
    } else visited = new Map();
    visited.set(newurl, (visited.get(newurl) || 0) + 1);
    await r.read();   // fp.read()
    req = next;
  }
}

module.exports = {
  pyStrip, urlsplit, urlparse, urlunparse, urljoin, unquote, parseQs, quoteLatin1, hostnameOf,
  kmaUrlAllowed, decodeKmaBody, pyEucKrDecode, urlopen, makeRequest,
  envProxies, parseRegistryProxy, proxyBypass, parseProxy, fnmatchWin,
};
