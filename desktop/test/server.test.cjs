'use strict';
// 내장 WNS 서버(wns/server.js) 테스트 — node --test test/server.test.cjs
// 진짜 ffmpeg 로 MOV/MXF 인코딩까지 확인하고, ffmpeg 인자·safe()·AE 이름은 파이썬 helper.py 와 직접 비교한다.
// AfterFX 는 절대 실행하지 않는다(aeDryRun). 사용자 폰트 폴더/레지스트리도 건드리지 않는다(fontsInstall:false).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawnSync } = require('child_process');

const W = require('../wns/server.js');
const T = require('../wns/find-tools.js');

const HELPER_SRC = 'R:\\[F]_Util\\WNS\\_src';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'wns-test-'));
const FRAMES = path.join(TMP, 'frames');
const SRC = path.join(TMP, 'src');
const FFMPEG = T.findFfmpeg();
const FONTS_DIRS = T.findFontsDirs();
const stubJsx = (obj, d) => '// stub jsx\nvar sid = "' + obj.sid + '";\nvar dir = "' + d.replace(/\\/g, '/') + '";\n';

let srv, base;
const url = (p) => base + p;

async function post(p, body, headers) {
  const r = await fetch(url(p), { method: 'POST', body, headers });
  const buf = Buffer.from(await r.arrayBuffer());
  return { r, buf, text: () => buf.toString('utf8'), json: () => JSON.parse(buf.toString('utf8')) };
}
const postJson = (p, obj) => post(p, JSON.stringify(obj), { 'Content-Type': 'application/json' });

function pyRun(script, input) {
  const r = spawnSync('py', ['-B', '-X', 'utf8', '-c', script], {
    input: JSON.stringify(input), encoding: 'utf8', windowsHide: true,
    env: Object.assign({}, process.env, { PYTHONDONTWRITEBYTECODE: '1', PYTHONIOENCODING: 'utf-8' }),
  });
  if (r.status !== 0) throw new Error('python 실패: ' + r.stderr);
  return JSON.parse(r.stdout);
}

test.before(async () => {
  fs.mkdirSync(SRC, { recursive: true });
  if (FFMPEG) {   // 1920x1080 RGBA PNG 3장
    const g = spawnSync(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=30',
      '-frames:v', '3', '-pix_fmt', 'rgba', path.join(SRC, 'p%d.png')], { windowsHide: true });
    if (g.status !== 0) throw new Error('테스트 PNG 생성 실패: ' + g.stderr);
  }
  srv = W.createWnsServer({ ffmpegPath: FFMPEG, framesDir: FRAMES, aeDryRun: true, fontsInstall: false, buildAeJsx: stubJsx });
  const port = await srv.listen(0);
  assert.equal(srv.port, port);
  base = 'http://127.0.0.1:' + port;
});

test.after(async () => {
  if (srv) await srv.close();
  fs.rmSync(TMP, { recursive: true, force: true });
});

test('/ping — ok/ff/ver + embedded, 파이썬식 JSON', async () => {
  const r = await fetch(url('/ping'));
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('access-control-allow-origin'), '*');
  assert.equal(r.headers.get('content-type'), 'application/json; charset=utf-8');
  const t = await r.text();
  assert.equal(t, '{"ok": true, "ff": ' + (FFMPEG ? 'true' : 'false') + ', "ver": 20261008, "embedded": true}');
  assert.equal(r.headers.get('vary'), null);   // Origin 없으면 기존처럼 '*'(Vary 없음)
  const r2 = await fetch(url('/ping?x=1'));
  assert.equal(r2.status, 200);
});

test('OPTIONS 204 + CORS 4종', async () => {
  const r = await fetch(url('/api/frame'), { method: 'OPTIONS' });
  assert.equal(r.status, 204);
  assert.equal(r.headers.get('access-control-allow-origin'), '*');
  assert.equal(r.headers.get('access-control-allow-methods'), 'GET, POST, OPTIONS');
  assert.equal(r.headers.get('access-control-allow-headers'), 'Content-Type');
  assert.equal(r.headers.get('access-control-max-age'), '86400');
  assert.equal(r.headers.get('vary'), null);
});

test('없는 경로 404 / 지원 안 하는 메서드 501', async () => {
  let r = await fetch(url('/nope'));
  assert.equal(r.status, 404);
  assert.equal(await r.text(), '{"ok": false}');
  r = await fetch(url('/nope'), { method: 'POST', body: 'x' });
  assert.equal(r.status, 404);
  r = await fetch(url('/ping'), { method: 'PUT', body: 'x' });
  assert.equal(r.status, 501);
});

test('/api/kma — 허용 안 된 주소 400', async () => {
  for (const u of ['https://evil.com/', 'ftp://apihub.kma.go.kr/', 'https://apihub.kma.go.kr.evil.com/', 'https://xkma.go.kr/', 'not a url', 'file:///C:/Windows/win.ini']) {
    const r = await fetch(url('/api/kma?u=' + encodeURIComponent(u)));
    assert.equal(r.status, 400, u);
    assert.equal(await r.text(), '{"ok": false, "error": "허용되지 않은 주소"}');
  }
  const r = await fetch(url('/api/kma'));   // u 없음
  assert.equal(r.status, 400);
  for (const u of ['https://apihub.kma.go.kr/x', 'http://www.kma.go.kr/', 'https://apis.data.go.kr/1360000/x', 'https://data.go.kr/', 'HTTPS://APIHUB.KMA.GO.KR/']) assert.ok(W.kmaHostOk(u), u);
  for (const u of ['https://kma.go.kr/', 'https://evil-data.go.kr/', 'ws://apihub.kma.go.kr/']) assert.ok(!W.kmaHostOk(u), u);
});

test('urlopen — urllib 헤더·리다이렉트·euc-kr·HTTP 오류 문구', async () => {
  let seen = null;
  const loc = http.createServer((req, res) => {
    if (req.url === '/r') { res.writeHead(302, { Location: '/euckr' }); res.end(); return; }
    if (req.url === '/loop') { res.writeHead(302, { Location: '/loop' }); res.end(); return; }
    if (req.url === '/404') { res.writeHead(404); res.end('no'); return; }
    if (req.url === '/u8') { res.writeHead(200); res.end(Buffer.from('\ufeff한글 ok', 'utf8')); return; }
    seen = req.rawHeaders;
    res.writeHead(200);
    res.end(Buffer.from([0xC7, 0xD1, 0xB1, 0xDB, 0x20, 0x41]));   // euc-kr "한글 A"
  });
  await new Promise((r) => loc.listen(0, '127.0.0.1', r));
  const lb = 'http://127.0.0.1:' + loc.address().port;
  try {
    const buf = await W.urlopen(lb + '/r');
    assert.equal(W.decodeKmaBody(buf), '한글 A');
    assert.deepEqual(seen, ['Accept-Encoding', 'identity', 'Host', '127.0.0.1:' + loc.address().port, 'User-Agent', 'Python-urllib/3.13', 'Connection', 'close']);
    assert.equal(W.decodeKmaBody(await W.urlopen(lb + '/u8')), '\ufeff한글 ok');   // 파이썬 utf-8 은 BOM 을 남긴다
    await assert.rejects(W.urlopen(lb + '/404'), { message: 'HTTP Error 404: Not Found' });
    await assert.rejects(W.urlopen(lb + '/loop'), (e) => e.message.startsWith('HTTP Error 302: The HTTP server returned a redirect error that would lead to an infinite loop.\nThe last 30x error message was:\nFound'));
  } finally { loc.close(); }
});

test('/api/kma — 실제 apihub 루트 1회 (네트워크 실패면 skip)', async (t) => {
  const r = await fetch(url('/api/kma?u=' + encodeURIComponent('https://apihub.kma.go.kr/')));
  if (r.status !== 200) { const j = await r.json().catch(() => ({})); t.skip('네트워크/원격 실패: ' + r.status + ' ' + (j.error || '')); return; }
  assert.equal(r.headers.get('content-type'), 'text/plain; charset=utf-8');
  assert.ok((await r.text()).length > 0);
});

test('safe() — 파이썬 helper.safe 와 동일(한글 포함)', () => {
  const inputs = ['한글세션', 'ae1696000000', '../../etc/passwd', 'a b/c\\d:e', '', 'x'.repeat(100), '가'.repeat(100),
    '①②Ⅻ', 'émoji😀ok', 'e\u0301', 'tab\tnew\nline', '𝟘𝟙٣', 'İstanbul', 'mixed-_.ok', '日本語テスト', 'кирилл', 123, 0, true, null];
  for (const [i, o] of [['한글세션', '한글세션'], ['../../etc/passwd', '....etcpasswd'], ['', 's'], ['가'.repeat(100), '가'.repeat(80)]]) assert.equal(W.safe(i), o);
  const py = pyRun('import sys,json; sys.path.insert(0, r"' + HELPER_SRC + '"); import helper\n'
    + 'inp=json.loads(sys.stdin.read()); print(json.dumps([helper.safe(s) for s in inp], ensure_ascii=False))', inputs);
  assert.deepEqual(inputs.map(W.safe), py);
});

test('mxfArgs/movArgs/afxName — 파이썬 mxf_args/mov_args/_afx_name 과 동일', () => {
  const cases = [
    ['C:\\f\\s\\f_%05d.png', 0, 'C:\\T\\wns_s.mxf'],
    ['C:\\f\\한글\\f_%05d.jpg', 5, 'C:\\T\\wns_한글.mov'],
    ['/x/f_%05d.png', -3, '/t/o.mxf'],
    ['p', '7', 'o'],
    ['p', 2.9, 'o'],
  ];
  const names = ['C:\\Program Files\\Adobe\\Adobe After Effects 2025\\Support Files\\AfterFX.exe',
    'C:\\Program Files\\Adobe\\Adobe After Effects (Beta)\\Support Files\\AfterFX.exe',
    'C:/Program Files/Adobe/Adobe After Effects 2026/Support Files/AfterFX.exe',
    'D:\\weird\\AE\\bin\\AfterFX.exe', 'AfterFX.exe', '', 'C:\\AfterFX.exe', 'C:\\x\\AfterFX.exe',
    '\\\\srv\\share\\v\\bin\\AfterFX.exe', '\\\\srv\\share\\AfterFX.exe', 'C:\\a\\\\b\\\\AfterFX.exe', 'D:rel\\x\\AfterFX.exe'];
  const py = pyRun('import sys,json; sys.path.insert(0, r"' + HELPER_SRC + '"); import helper\n'
    + 'helper.FFMPEG = "FFMPEG"\ninp=json.loads(sys.stdin.read())\n'
    + 'print(json.dumps({"mxf":[helper.mxf_args(*c) for c in inp["cases"]], "mov":[helper.mov_args(*c) for c in inp["cases"]],'
    + ' "name":[helper._afx_name(p) for p in inp["names"]], "fps": helper.FPS, "ver": helper.HELPER_VER}, ensure_ascii=False))', { cases, names });
  assert.deepEqual(cases.map((c) => W.mxfArgs(c[0], c[1], c[2], 'FFMPEG')), py.mxf);
  assert.deepEqual(cases.map((c) => W.movArgs(c[0], c[1], c[2], 'FFMPEG')), py.mov);
  assert.deepEqual(names.map(W.afxName), py.name);
  assert.equal(W.FPS, py.fps);
  assert.equal(W.HELPER_VER, py.ver);
});

test('/api/frame — 한글 sid, index 0 리셋, ext 규칙, 잘못된 index', async () => {
  const sid = '한글세션';
  const d = path.join(FRAMES, sid);
  for (let i = 0; i < 3; i++) {
    const r = await post('/api/frame?sid=' + encodeURIComponent(sid) + '&index=' + i, Buffer.from('frame' + i));
    assert.equal(r.r.status, 200);
    assert.equal(r.text(), '{"ok": true}');
  }
  assert.deepEqual(fs.readdirSync(d).sort(), ['f_00000.png', 'f_00001.png', 'f_00002.png']);
  assert.equal(fs.readFileSync(path.join(d, 'f_00002.png'), 'utf8'), 'frame2');
  await post('/api/frame?sid=' + encodeURIComponent(sid) + '&index=0&ext=JPG', Buffer.from('new'));   // 리셋
  assert.deepEqual(fs.readdirSync(d), ['f_00000.jpg']);
  await post('/api/frame?sid=' + encodeURIComponent(sid) + '&index=1&ext=gif', Buffer.from('g'));   // gif → png
  assert.deepEqual(fs.readdirSync(d).sort(), ['f_00000.jpg', 'f_00001.png']);
  await post('/api/frame?sid=' + encodeURIComponent('a/../b c') + '&index=-1', Buffer.from('n'));   // safe + 음수 서식
  assert.deepEqual(fs.readdirSync(path.join(FRAMES, 'a..bc')), ['f_-0001.png']);
  await post('/api/frame?index=0', Buffer.from('s'));   // sid 없으면 's'
  assert.ok(fs.existsSync(path.join(FRAMES, 's', 'f_00000.png')));
  const bad = await post('/api/frame?sid=x&index=abc', Buffer.from('z'));
  assert.equal(bad.r.status, 500);
  assert.equal(bad.text(), '{"ok": false, "error": "invalid literal for int() with base 10: \'abc\'"}');
  // 큰 본문(8MB) 스트리밍 저장
  const big = Buffer.alloc(8 * 1024 * 1024, 7);
  const rb = await post('/api/frame?sid=big&index=0', big);
  assert.equal(rb.r.status, 200);
  assert.equal(fs.statSync(path.join(FRAMES, 'big', 'f_00000.png')).size, big.length);
});

test('/api/finalize — 프레임 없음 400, ffmpeg 없음 500', async () => {
  const r = await postJson('/api/finalize', { sid: 'nothing-here', mode: 'mov' });
  assert.equal(r.r.status, 400);
  assert.equal(r.text(), '{"ok": false, "error": "프레임 없음"}');
  const s2 = W.createWnsServer({ ffmpegPath: path.join(TMP, 'no-ffmpeg.exe'), framesDir: FRAMES });
  const p2 = await s2.listen(0);
  try {
    const r2 = await fetch('http://127.0.0.1:' + p2 + '/api/finalize', { method: 'POST', body: JSON.stringify({ sid: 'x' }) });
    assert.equal(r2.status, 500);
    assert.equal(await r2.text(), '{"ok": false, "error": "ffmpeg.exe 없음 (헬퍼 옆에 두세요)"}');
    const r3 = await fetch('http://127.0.0.1:' + p2 + '/ping');
    assert.equal((await r3.json()).ff, false);
  } finally { await s2.close(); }
  const r4 = await post('/api/finalize', '');   // 빈 본문 → json 오류 500
  assert.equal(r4.r.status, 500);
  assert.equal(r4.json().error, 'Expecting value: line 1 column 1 (char 0)');
});

async function uploadPngs(sid) {
  for (let i = 0; i < 3; i++) {
    const r = await post('/api/frame?sid=' + sid + '&index=' + i + '&ext=png', fs.readFileSync(path.join(SRC, 'p' + (i + 1) + '.png')));
    assert.equal(r.r.status, 200);
  }
}
async function waitGone(p, ms = 3000) {
  const t0 = Date.now();
  while (fs.existsSync(p) && Date.now() - t0 < ms) await new Promise((r) => setTimeout(r, 50));
  return !fs.existsSync(p);
}

test('/api/finalize — 진짜 ffmpeg 로 MOV(qtrle)', { skip: !FFMPEG && 'ffmpeg 없음' }, async () => {
  const sid = 'mov' + Date.now();
  await uploadPngs(sid);
  const r = await postJson('/api/finalize', { sid, mode: 'MOV', tail: 0 });
  assert.equal(r.r.status, 200, r.text().slice(0, 300));
  assert.equal(r.r.headers.get('content-type'), 'application/octet-stream');
  assert.equal(Number(r.r.headers.get('content-length')), r.buf.length);
  assert.ok(['ftyp', 'wide', 'mdat', 'moov', 'free'].includes(r.buf.subarray(4, 8).toString('latin1')), 'MOV 시그니처');
  assert.ok(!fs.existsSync(path.join(FRAMES, sid)), '프레임 폴더 삭제');
  assert.ok(await waitGone(path.join(os.tmpdir(), 'wns_' + sid + '.mov')), '임시 결과 삭제');
});

test('/api/finalize — 진짜 ffmpeg 로 MXF(XDCAM)', { skip: !FFMPEG && 'ffmpeg 없음' }, async () => {
  const sid = 'mxf' + Date.now();
  await uploadPngs(sid);
  const r = await postJson('/api/finalize', { sid, tail: 1 });   // mode 없으면 mxf
  assert.equal(r.r.status, 200, r.text().slice(0, 300));
  assert.deepEqual([...r.buf.subarray(0, 4)], [0x06, 0x0e, 0x2b, 0x34], 'MXF KLV 시그니처');
  assert.ok(r.buf.length > 100000);
  assert.ok(!fs.existsSync(path.join(FRAMES, sid)));
  assert.ok(await waitGone(path.join(os.tmpdir(), 'wns_' + sid + '.mxf')));
});

test('/api/finalize — ffmpeg 실패면 stderr 끝 700자', { skip: !FFMPEG && 'ffmpeg 없음' }, async () => {
  const sid = 'broken' + Date.now();
  await post('/api/frame?sid=' + sid + '&index=0', Buffer.from('not a png'));
  const r = await postJson('/api/finalize', { sid, mode: 'mov' });
  assert.equal(r.r.status, 500);
  const e = r.json().error;
  assert.ok(e.startsWith('ffmpeg 실패\n'));
  assert.ok(Array.from(e).length <= 700 + 'ffmpeg 실패\n'.length);
  assert.ok(!e.includes('\r'));
  assert.ok(!fs.existsSync(path.join(FRAMES, sid)));
});

test('/api/ae — dry-run 으로 jsx 생성(AfterFX 실행 안 함)', async () => {
  const nf = await postJson('/api/ae', { sid: 'ae-empty' });
  assert.equal(nf.r.status, 400);
  assert.equal(nf.text(), '{"ok": false, "error": "레이어 이미지가 없습니다 (먼저 전송하세요)"}');
  const sid = 'ae' + Date.now();
  await post('/api/frame?sid=' + sid + '&index=0&ext=png', Buffer.from('png'));
  const r = await postJson('/api/ae', { sid, aePath: process.execPath, layers: [] });
  assert.equal(r.r.status, 200, r.text());
  const j = r.json();
  assert.equal(j.ok, true);
  assert.equal(j.ae, 'dry-run');
  assert.equal(j.jsx, path.join(FRAMES, sid, '_import.jsx'));
  const body = fs.readFileSync(j.jsx, 'utf8');
  assert.equal(body, stubJsx({ sid }, path.join(FRAMES, sid)).replace(/\n/g, '\r\n'));
});

test('/api/ae — AE 선택(여러 개면 choose, 없으면 500)', async () => {
  const sid = 'aesel' + Date.now();
  const mk = (vers, running) => W.createWnsServer({ framesDir: FRAMES, aeDryRun: true, fontsInstall: false, buildAeJsx: stubJsx,
    listAfterFx: () => vers, findRunningAfterFx: async () => running });
  const vers2 = [{ path: 'C:\\Program Files\\Adobe\\Adobe After Effects 2026\\Support Files\\AfterFX.exe', name: 'After Effects 2026' },
    { path: 'C:\\Program Files\\Adobe\\Adobe After Effects 2025\\Support Files\\AfterFX.exe', name: 'After Effects 2025' }];
  const s = mk(vers2, null);
  const p = await s.listen(0);
  const b = 'http://127.0.0.1:' + p;
  try {
    await fetch(b + '/api/frame?sid=' + sid + '&index=0', { method: 'POST', body: 'x' });
    let r = await fetch(b + '/api/ae', { method: 'POST', body: JSON.stringify({ sid }) });
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { ok: false, choose: true, versions: vers2 });
    s.config.listAfterFx = () => [];
    r = await fetch(b + '/api/ae', { method: 'POST', body: JSON.stringify({ sid }) });
    assert.equal(r.status, 500);
    assert.equal(await r.text(), '{"ok": false, "error": "After Effects를 못 찾았습니다 (설치 확인)"}');
    s.config.listAfterFx = () => [vers2[1]];   // 1개면 그것(dry-run이라 실행 안 함)
    r = await fetch(b + '/api/ae', { method: 'POST', body: JSON.stringify({ sid }) });
    assert.equal((await r.json()).ae, 'dry-run');
    s.config.findRunningAfterFx = async () => process.execPath;   // 실행 중인 AE 우선
    s.config.listAfterFx = () => { throw new Error('호출되면 안 됨'); };
    r = await fetch(b + '/api/ae', { method: 'POST', body: JSON.stringify({ sid }) });
    assert.equal((await r.json()).ok, true);
  } finally { await s.close(); }
});

test('listAfterFx — 폴더 스캔·정렬·이름(가짜 폴더)', () => {
  const root = path.join(TMP, 'Adobe');
  for (const v of ['Adobe After Effects 2024', 'Adobe After Effects 2026', 'adobe after effects 2025', 'Adobe After Effects (Beta)', 'Adobe Premiere Pro 2025', 'Adobe After Effects 2023']) {
    const sf = path.join(root, v, 'Support Files');
    fs.mkdirSync(sf, { recursive: true });
    if (v !== 'Adobe After Effects 2023') fs.writeFileSync(path.join(sf, 'AfterFX.exe'), '');
  }
  const got = W.listAfterFx([root]);
  assert.deepEqual(got.map((v) => v.name), ['adobe after effects 2025', 'After Effects 2026', 'After Effects 2024', 'After Effects (Beta)']);
  assert.equal(got[0].path, root + '\\adobe after effects 2025\\Support Files\\AfterFX.exe');
  assert.ok(Array.isArray(W.listAfterFx()));   // 실제 PC 스캔(읽기만)
});

test('ensureSuiteFonts — 임시 폴더로 복사만(레지스트리 안 건드림)', { skip: !FONTS_DIRS.length && '폰트 폴더 없음' }, async () => {
  const target = path.join(TMP, 'userfonts');
  assert.equal(await W.ensureSuiteFonts(FONTS_DIRS, { targetDir: target, register: false }), true);
  assert.deepEqual(fs.readdirSync(target).sort(), W.SUITE_FONTS.map((f) => f[0]).sort());
  assert.equal(await W.ensureSuiteFonts([path.join(TMP, 'none')], { targetDir: path.join(TMP, 'uf2'), register: false }), false);
});

test('find-tools — 후보 중 첫 존재 항목', () => {
  const a = path.join(TMP, 'a.exe');
  fs.writeFileSync(a, '');
  assert.equal(T.findFfmpeg([path.join(TMP, 'x.exe'), a], { usePath: false }), a);
  assert.equal(T.findFfmpeg([path.join(TMP, 'x.exe')], { usePath: false }), null);
  assert.deepEqual(T.findFontsDirs([path.join(TMP, 'nope'), TMP, a]), [TMP]);
  assert.equal(T.findFirst([path.join(TMP, 'nope'), a]), a);
  assert.ok(FFMPEG && fs.existsSync(FFMPEG), '이 PC 에서는 ffmpeg 를 찾아야 함');
});

// ════════════════════════════════════════════════════════════════════════════════
// 적대적 검토 회귀 테스트 — helper.py 와 다르게 동작하던 지점들.
//  (1) 진짜 helper.py 의 H 핸들러를 파이썬으로 띄워(파일은 안 고침, AE 실행·폰트 설치·레지스트리는 메모리에서 가짜로 바꿈)
//      같은 요청을 두 서버에 보내 상태·사유문구·헤더·본문·저장 파일을 그대로 비교한다.
//  (2) urllib.urlopen 과 pyurl.urlopen 을 로컬 서버(HTTP/HTTPS/프록시)로 비교.
//  (3) json/utf-8/parse_qs/urlparse/euc-kr 를 무작위 입력으로 파이썬과 비교.
//  (4) 보안(출처·본문 상한·점 sid·aePath)·폴더 정리·폰트 는 helper.py 와 차등 비교 + Node 쪽 세부(임시파일, rmtree, 폰트 순서).
// ════════════════════════════════════════════════════════════════════════════════
const net = require('net');
const tls = require('tls');
const crypto = require('crypto');
const { spawn } = require('child_process');
const P = require('../wns/pyfmt.js');
const PJ = require('../wns/pyjson.js');
const PU = require('../wns/pyurl.js');

// 테스트 전용 자체서명 인증서(localhost)
const TEST_CERT = `-----BEGIN CERTIFICATE-----
MIIBljCCATugAwIBAgIUOMAcYExFQyOxFxVDJJx9WDt6y+AwCgYIKoZIzj0EAwIw
FDESMBAGA1UEAwwJbG9jYWxob3N0MCAXDTI2MTAwNzExMzQyNloYDzIxMjYwOTEz
MTEzNDI2WjAUMRIwEAYDVQQDDAlsb2NhbGhvc3QwWTATBgcqhkjOPQIBBggqhkjO
PQMBBwNCAATYtqRPJWHFEGo7tl50mAnEGYTMIJJ2t3K8Mq/5qMFgmzJgcKnztTMn
m7v01N1Ny5l39hgdH8XxNpsnproNGvgFo2kwZzAdBgNVHQ4EFgQUOz5H0pRHCZvH
o/ycQSj782rVfzMwHwYDVR0jBBgwFoAUOz5H0pRHCZvHo/ycQSj782rVfzMwDwYD
VR0TAQH/BAUwAwEB/zAUBgNVHREEDTALgglsb2NhbGhvc3QwCgYIKoZIzj0EAwID
SQAwRgIhAOApnfOBB8yAxa6dNtx9rrgrXMqzs8O+p5EstYiU4QhRAiEA8y06vjZK
N1UQyDfIdiqeqgBsqixOwwM9W1KDrdLu7B4=
-----END CERTIFICATE-----
`;
const TEST_KEY = `-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgqUvAuUJhG1sLyK81
07iNrPcNUrH0xnAavyebPWBjhP2hRANCAATYtqRPJWHFEGo7tl50mAnEGYTMIJJ2
t3K8Mq/5qMFgmzJgcKnztTMnm7v01N1Ny5l39hgdH8XxNpsnproNGvgF
-----END PRIVATE KEY-----
`;

// 파이썬을 비동기로(로컬 서버가 같은 프로세스에 있어서 spawnSync 면 교착)
function pyAsync(script, input, env, cwd) {
  return new Promise((resolve, reject) => {
    const e = Object.assign({}, process.env, { PYTHONDONTWRITEBYTECODE: '1', PYTHONIOENCODING: 'utf-8' });
    for (const k of Object.keys(e)) if (/_PROXY$/i.test(k)) delete e[k];
    Object.assign(e, env || {});
    const cp = spawn('py', ['-B', '-X', 'utf8', '-c', script], { env: e, cwd, windowsHide: true });
    let out = '', err = '';
    cp.stdout.on('data', (d) => { out += d; });
    cp.stderr.on('data', (d) => { err += d; });
    cp.on('error', reject);
    cp.on('close', (code) => { if (code !== 0) reject(new Error('python 실패: ' + err)); else { try { resolve(JSON.parse(out)); } catch (x) { reject(new Error('python 출력: ' + out + err)); } } });
    cp.stdin.end(JSON.stringify(input));
  });
}

// 요청 하나(헤더를 그대로 보내려고 fetch 대신 http.request)
function rawReq(port, { method = 'GET', path: p = '/', headers = {}, body = null } = {}) {
  return new Promise((resolve) => {
    const req = http.request({ host: '127.0.0.1', port, method, path: p, headers, agent: false }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, reason: res.statusMessage, headers: res.headers, body: Buffer.concat(chunks) }));
      res.on('error', (e) => resolve({ error: e.code || e.message }));
    });
    req.on('error', (e) => resolve({ error: e.code || e.message }));
    if (body !== null) req.end(body); else req.end();
  });
}
// 소켓으로 직접 보내고 닫힐 때까지 받은 것
function rawSock(port, data, { waitMs = 0, more = null } = {}) {
  return new Promise((resolve) => {
    const s = net.connect(port, '127.0.0.1');
    const got = [];
    s.on('data', (d) => got.push(d));
    s.on('error', () => {});
    s.on('close', () => resolve(Buffer.concat(got).toString('latin1')));
    s.write(data);
    if (more !== null) setTimeout(() => s.write(more), waitMs);
    setTimeout(() => s.destroy(), 5000);
  });
}

// ── (1) 진짜 helper.py 와 차등 비교 ──
const PY_HELPER = String.raw`
import sys, json, os, types, subprocess, threading
cfg = json.loads(sys.stdin.readline())
sys.path.insert(0, cfg['src'])
import helper
helper.FRAMES = cfg['frames']
helper.FFMPEG = cfg['ffmpeg']
STATE = {'running': None, 'vers': [], 'calls': [], 'fonts': True}
def fake_popen(args, *a, **k):
    STATE['calls'].append(['popen', [str(x) for x in args]])
helper.subprocess = types.SimpleNamespace(run=subprocess.run, Popen=fake_popen)   # AfterFX 는 절대 실행 안 함
helper.find_running_afterfx = lambda: STATE['running']
helper.list_afterfx = lambda: STATE['vers']
def fake_fonts():
    STATE['calls'].append(['fonts'])   # 사용자 폰트 폴더/레지스트리 안 건드림
    return STATE['fonts']
helper.ensure_suite_fonts = fake_fonts
helper.build_ae_jsx = lambda obj, d: '// stub\nsid=' + str(obj.get('sid')) + '\nkeys=' + ','.join(sorted(obj.keys())) + '\n'
class H2(helper.H):
    def do_POST(self):
        if self.path == '/__ctl':
            body = json.loads(self._read().decode('utf-8'))
            STATE['running'] = body.get('running'); STATE['vers'] = body.get('vers', []); STATE['fonts'] = body.get('fonts', True)
            calls = STATE['calls'][:]; STATE['calls'].clear()
            return self._send(200, {'calls': calls})
        return super().do_POST()
srv = helper.Srv(('127.0.0.1', 0), H2)
print(srv.server_address[1], flush=True)
threading.Thread(target=lambda: (sys.stdin.read(), os._exit(0)), daemon=True).start()   # 부모가 끝나면 같이 종료
srv.serve_forever()
`;
const PYF = path.join(TMP, 'pyframes'), NF = path.join(TMP, 'nframes');
const DSTATE = { running: null, vers: [], calls: [], fonts: true };
let pyHelper = null, pyPort = 0, ds = null, dsPort = 0;
const stubJsx2 = (obj, d) => '// stub\nsid=' + P.pyStr(obj.sid === undefined ? null : obj.sid) + '\nkeys=' + Object.keys(obj).sort().join(',') + '\n';

// 진짜 helper.py 의 H 를 띄운다(frames·ffmpeg 지정) → 포트. 프로세스는 테스트 끝에 모두 끈다
const PY_PROCS = [];
function spawnPy(frames, ffmpeg) {
  fs.mkdirSync(frames, { recursive: true });
  const proc = spawn('py', ['-B', '-X', 'utf8', '-c', PY_HELPER], { windowsHide: true, env: Object.assign({}, process.env, { PYTHONDONTWRITEBYTECODE: '1' }) });
  PY_PROCS.push(proc);
  proc.stdin.write(JSON.stringify({ src: HELPER_SRC, frames, ffmpeg }) + '\n');
  return new Promise((resolve, reject) => {
    let buf = '';
    proc.stdout.on('data', (d) => { buf += d; const m = /^(\d+)\s/.exec(buf); if (m) resolve(Number(m[1])); });
    proc.on('close', () => reject(new Error('파이썬 헬퍼가 꺼짐')));
    setTimeout(() => reject(new Error('파이썬 헬퍼 시작 시간 초과')), 20000);
  });
}
async function startPyHelper() {
  if (pyHelper) return;
  fs.mkdirSync(NF, { recursive: true });
  pyPort = await spawnPy(PYF, FFMPEG || path.join(TMP, 'none.exe'));
  pyHelper = PY_PROCS[PY_PROCS.length - 1];
  ds = W.createWnsServer({
    ffmpegPath: FFMPEG || path.join(TMP, 'none.exe'), framesDir: NF, fontsInstall: true, buildAeJsx: stubJsx2,
    ensureSuiteFonts: async () => { DSTATE.calls.push(['fonts']); return DSTATE.fonts; },
    spawnAe: async (afx, args) => { DSTATE.calls.push(['popen', [afx].concat(args)]); },
    listAfterFx: () => DSTATE.vers, findRunningAfterFx: async () => DSTATE.running,
    kmaProxyConfig: { env: {}, proxies: {} }, kmaTimeout: 5000,
  });
  dsPort = await ds.listen(0);
}
test.after(async () => {
  for (const p of PY_PROCS) { try { p.stdin.end(); } catch (e) { /* 무시 */ } p.kill(); }
  if (ds) await ds.close();
});
async function setAeState(running, vers, fonts = true) {
  DSTATE.running = running; DSTATE.vers = vers; DSTATE.fonts = fonts;
  const r = await rawReq(pyPort, { method: 'POST', path: '/__ctl', body: JSON.stringify({ running, vers, fonts }) });
  const pc = JSON.parse(r.body.toString('utf8')).calls;
  const nc = DSTATE.calls.splice(0);
  return { py: pc, node: nc };
}
const normCalls = (calls, frames) => calls.map((c) => (c[0] === 'popen' ? ['popen', c[1].map((x) => x.split(frames).join('<F>'))] : c));
const PICK = ['content-type', 'content-length', 'access-control-allow-origin', 'access-control-allow-methods', 'access-control-allow-headers', 'access-control-max-age', 'vary'];
function view(r, { ping = false, conn = false } = {}) {
  if (r.error) return { error: r.error };
  const h = {};
  for (const k of PICK.concat(conn ? ['connection'] : [])) if (r.headers[k] !== undefined) h[k] = r.headers[k];
  let body = r.body.toString('utf8');
  if (ping) { const j = JSON.parse(body); delete j.embedded; body = JSON.stringify(j); delete h['content-length']; }
  return { status: r.status, reason: r.reason, headers: h, body };
}
async function both(spec, o) {
  const [a, b] = await Promise.all([rawReq(pyPort, spec), rawReq(dsPort, spec)]);
  return { py: view(a, o), node: view(b, o) };
}
async function same(spec, o) {
  const r = await both(spec, o);
  assert.deepEqual(r.node, r.py, JSON.stringify(spec).slice(0, 200));
  return r;
}
function tree(root) {   // 폴더 → {상대경로: sha1}
  const out = {};
  const walk = (d, rel) => {
    let ents = [];
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; }
    for (const e of ents) {
      const p = path.join(d, e.name), r = rel ? rel + '/' + e.name : e.name;
      if (e.isSymbolicLink()) out[r] = 'link';   // 정션·링크는 따라가지 않음
      else if (e.isDirectory()) walk(p, r); else out[r] = crypto.createHash('sha1').update(fs.readFileSync(p)).digest('hex');
    }
  };
  walk(root, '');
  return out;
}
const enc = encodeURIComponent;

test('차등: GET/OPTIONS/404/501 — 경로 ;params·//·쿼리, 501 사유문구·본문(따옴표 그대로)', async () => {
  await startPyHelper();
  for (const p of ['/ping', '/ping;x', '/ping?a=1&a=2', '//ping', '///ping', '/ping;a/b']) await same({ path: p }, { ping: true });
  for (const p of ['/nope', '/ping/', '/PING', '/api/kmax']) await same({ path: p });
  await same({ method: 'POST', path: '/nope', body: 'x' });
  await same({ method: 'POST', path: '/ping', body: '' });
  await same({ method: 'OPTIONS', path: '/whatever?x=1' });
  for (const m of ['PUT', 'DELETE', 'PATCH']) await same({ method: m, path: '/ping', body: 'x' }, { conn: true });
  await same({ method: 'HEAD', path: '/ping' }, { conn: true });
  const r = await same({ method: 'PUT', path: '/x' });
  assert.equal(r.node.reason, "Unsupported method ('PUT')");
  assert.ok(r.node.body.includes("Message: Unsupported method ('PUT')."));
});

test('차등: /api/kma 주소 검사·urlparse 오류(502)·urllib 사전 검사 오류(네트워크 안 씀)', async () => {
  await startPyHelper();
  const us = ['', 'https://evil.com/', 'ftp://apihub.kma.go.kr/', 'https://apihub.kma.go.kr.evil.com/', 'HTTPS://APIHUB.KMA.GO.KR.evil/',
    'http://[::1/x', 'https://[1.2.3.4]/', 'https://[v1.x]/', 'https://x.kma.go.kr℀/', 'https://apihub.kma.go.kr\\@evil.com/',
    'https://apihub.kma.go.kr:abc/x', 'https://x.kma.go.kr/a b', 'https://x.kma.go.kr/한글', 'https://x.kma.go.kr/a\tb',
    'https://ｘ.kma.go.kr/', 'https://x.kma.go.kr/\x7f', 'https://x.kma.go.kr:/é', '<URL:https://x.kma.go.kr/a b>', 'https://x.kma.go.kr/' + 'é'.repeat(3) + 'a' + 'ü'];
  for (const u of us) await same({ path: '/api/kma?u=' + enc(u) });
  await same({ path: '/api/kma?u=https://x.kma.go.kr/a+b' });   // + → 공백 → 제어문자 오류
  await same({ path: '/api/kma?u=a&u=' + enc('https://x.kma.go.kr/a b') });   // 중복 키는 첫 값
  await same({ path: '/api/kma?u=&u=' + enc('https://x.kma.go.kr/a b') });   // 빈 값은 버려짐 → 두 번째가 첫 값
  await same({ path: '/api/kma?u=' + enc('https://user@x.kma.go.kr/') });   // getaddrinfo 오류 문구
  await same({ path: '/api/kma?u=https%3A%2F%2Fx.kma.go.kr%2F%ZZ%20' });
});

test('차등: /api/frame — sid·index·ext 파싱(유니코드 숫자·공백·밑줄·중복·빈 값), 저장 파일까지 동일', async () => {
  await startPyHelper();
  const qs = ['sid=s1&index=0', 'sid=s1&index=1&ext=JPG', 'sid=s1&index=%EF%BC%92', 'sid=s1&index=+3+', 'sid=s1&index=1_0', 'sid=s1&index=-0',
    'sid=s1&index=abc', 'sid=s1&index=0x1', 'sid=s1&index=1%00', 'sid=s1&index=%D9%A4', 'sid=s1&index=1__0', 'sid=s1&index=%E2%80%83%207',
    'sid=s2&index=', 'sid=&index=5', 'sid=a+b%2Fc&index=0', 'sid=%ED%95%9C%EA%B8%80&index=0', 'sid=x&sid=y&index=0', 'sid=s3&index=0&ext=gif',
    'sid=s3&index=1&ext=png&ext=jpg', 'sid=s3&index=99999999999999999999', 'sid=s3;q=1&index=2', 'index=7', 'sid=%FF%FE&index=0', 'sid=' + 'x'.repeat(100) + '&index=0',
    'sid=s4&index=0', 'sid=s4&index=1', 'sid=s4&index=0'];
  for (const q of qs) await same({ method: 'POST', path: '/api/frame?' + q, body: Buffer.from('body:' + q) });
  // 동시 업로드(병렬 20개, 큰 본문) — 파일이 섞이거나 잘리지 않아야 함
  await same({ method: 'POST', path: '/api/frame?sid=par&index=0', body: Buffer.from('p0') });
  const bodies = Array.from({ length: 20 }, (_, i) => crypto.randomBytes(256 * 1024 + i));
  await Promise.all(bodies.map((b, i) => same({ method: 'POST', path: '/api/frame?sid=par&index=' + (i + 1), body: b })));
  assert.deepEqual(tree(NF), tree(PYF));
  assert.ok(Object.keys(tree(NF)).length > 20);
});

test('차등: /api/finalize — json/utf-8 오류 문구, mode/tail 타입 오류, 프레임 없음', async () => {
  await startPyHelper();
  const bodies = ['', ' ', '{', '[]', '"s"', '1', '1.5', 'null', 'true', '\ufeff{}', '{"sid":"a",}', '{"sid" "a"}', '{"a":1} x', '[1,]', 'NaN', '{"a": tru}',
    '{"sid":"nothing-here"}', '{"sid":"nothing-here","mode":5}', '{"sid":"nx","mode":[1]}', '{"sid":"nx","mode":{"a":1}}', '{"sid":"nx","mode":1.5}',
    '{"sid":"nx","tail":"7x"}', '{"sid":"nx","tail":NaN}', '{"sid":"nx","tail":Infinity}', '{"sid":"nx","tail":[1]}', '{"sid":"nx","tail":{}}',
    '{"sid":"nx","tail":"٣"}', '{"sid":"nx","mode":"","tail":0}', '{"sid":"x\\u0000y"}', '{"sid": "\\ud800q"}', '{"sid": "a\\qb"}', '{"sid": "\\u12"}'];   // (sid 가 's' 로 바뀌면 앞 테스트 프레임으로 ffmpeg 가 돌아 stderr 가 달라지므로 피함)
  for (const b of bodies) await same({ method: 'POST', path: '/api/finalize', body: Buffer.from(b, 'utf8') });
  for (const hex of ['ff', 'c3', '7b22e0a0', 'eda080', 'f4908080', 'e1807b']) await same({ method: 'POST', path: '/api/finalize', body: Buffer.from(hex, 'hex') });
});

test('차등: /api/ae — 프레임 없음·aePath 가 문자열 아니면 무시·AE 선택 순서·폰트 설치 시점·fontsOk·jsx 내용', async () => {
  await startPyHelper();
  const V2 = [{ path: 'C:\\Program Files\\Adobe\\Adobe After Effects 2026\\Support Files\\AfterFX.exe', name: 'After Effects 2026' },
    { path: 'C:\\Program Files\\Adobe\\Adobe After Effects 2025\\Support Files\\AfterFX.exe', name: 'After Effects 2025' }];
  const fake = path.join(TMP, 'Adobe After Effects 2099', 'Support Files', 'AfterFX.exe');
  fs.mkdirSync(path.dirname(fake), { recursive: true });
  fs.writeFileSync(fake, '');
  const post = (obj) => same({ method: 'POST', path: '/api/ae', body: typeof obj === 'string' ? obj : JSON.stringify(obj) });
  await setAeState(null, V2);
  await post({});   // sid 'ae' 프레임 없음 400
  await post('[]');
  await same({ method: 'POST', path: '/api/frame?sid=aeT&index=0', body: 'png' });
  for (const ap of [[1], { a: 1 }, 1.5, NaN]) await post('{"sid":"aeT","aePath":' + (Number.isNaN(ap) ? 'NaN' : JSON.stringify(ap)) + '}');   // 무시 → 여러 개 → choose
  let c = await setAeState(null, V2);
  assert.deepEqual(c.node, c.py);
  assert.deepEqual(c.node, []);   // 고르기 응답에서는 폰트 설치도 실행도 없음
  await post({ sid: 'aeT', aePath: 'C:\\nope\\AfterFX.exe' });   // 없는 경로 → 여러 개 → choose
  await post({ sid: 'aeT', aePath: [] });   // 빈 목록은 거짓 → choose
  c = await setAeState(null, []);
  assert.deepEqual(c.node, c.py); assert.deepEqual(c.node, []);
  await post({ sid: 'aeT' });   // 설치 없음 → 500
  await setAeState(null, [V2[1]]);
  await post({ sid: 'aeT', layers: [1, 2] });   // 1개면 그것
  c = await setAeState('C:\\Running\\Adobe After Effects 2024\\Support Files\\AfterFX.exe', V2);
  assert.deepEqual(normCalls(c.node, NF), normCalls(c.py, PYF));
  await post({ sid: 'aeT', z: null });   // 실행 중인 AE 우선
  c = await setAeState(null, V2.concat([{ path: fake, name: 'After Effects 2099' }]));
  assert.deepEqual(normCalls(c.node, NF), normCalls(c.py, PYF));
  assert.deepEqual(c.node.map((x) => x[0]), ['fonts', 'popen']);   // 폰트 먼저, 그다음 실행
  assert.equal(c.node[1][1][0], 'C:\\Running\\Adobe After Effects 2024\\Support Files\\AfterFX.exe');
  await post({ sid: 'aeT', aePath: fake.replace(/\\/g, '/').toUpperCase() });   // 앱이 고른 AfterFX.exe(설치 목록에 있음, 대소문자·/ 달라도 목록 경로로)
  c = await setAeState(null, V2);
  assert.deepEqual(normCalls(c.node, NF), normCalls(c.py, PYF));
  assert.equal(c.node[1][1][0], fake);
  assert.deepEqual(tree(path.join(NF, 'aeT')), tree(path.join(PYF, 'aeT')));   // _import.jsx(\r\n) 동일
});

test('차등: 요청줄 64KB 초과 414 · 헤더 100줄 431 · Expect 100-continue 미응답 · 해석 불가 주소는 응답 없이 끊김', async () => {
  await startPyHelper();
  await same({ path: '/ping?x=' + 'a'.repeat(65536) }, { conn: true });
  await same({ path: '/ping?x=' + 'a'.repeat(65000) }, { ping: true });
  const hdrs = (n) => Object.fromEntries(Array.from({ length: n }, (_, i) => ['X-H' + i, 'v']));
  await same({ path: '/ping', headers: hdrs(97) }, { ping: true });   // + Host, Connection = 99줄
  await same({ path: '/ping', headers: hdrs(98) }, { conn: true });   // 100줄 → 431
  await same({ path: '/ping', headers: { 'X-Long': 'a'.repeat(65540) } }, { conn: true });
  const exp = 'POST /api/frame?sid=expc&index=0 HTTP/1.1\r\nHost: x\r\nContent-Length: 2\r\nExpect: 100-continue\r\nConnection: close\r\n\r\n';
  const [a, b] = await Promise.all([rawSock(pyPort, exp, { waitMs: 400, more: 'hi' }), rawSock(dsPort, exp, { waitMs: 400, more: 'hi' })]);
  assert.ok(!/100 Continue/.test(a) && !/100 Continue/.test(b), '100 Continue 를 보내지 않음');
  assert.ok(/\r\n\r\n\{"ok": true\}$/.test(a) && /\r\n\r\n\{"ok": true\}$/.test(b));
  for (const line of ['GET http://[::1/ping HTTP/1.1\r\nHost: x\r\n\r\n', 'POST http://[x/api/frame HTTP/1.1\r\nHost: x\r\nContent-Length: 0\r\n\r\n']) {
    const [x, y] = await Promise.all([rawSock(pyPort, line), rawSock(dsPort, line)]);
    assert.equal(x, ''); assert.equal(y, '');
  }
});

// ── (2) urllib.urlopen 과 pyurl.urlopen 비교(로컬 서버) ──
const EUC = Buffer.from([0xc7, 0xd1, 0xb1, 0xdb, 0x20, 0x41, 0xc9, 0xa1, 0xa4, 0xd4, 0xa4, 0xa1, 0xa4, 0xbf, 0xa4, 0xd4, 0xa2, 0xe6, 0xff]);
function rst(s) { try { s.resetAndDestroy(); } catch (e) { if (s._parent && s._parent.resetAndDestroy) s._parent.resetAndDestroy(); else s.destroy(); } }
function behave(sock) {
  let buf = '';
  sock.on('error', () => {});
  sock.on('data', (d) => {
    buf += d.toString('latin1');
    if (!buf.includes('\r\n\r\n')) return;
    const p = buf.split('\r\n')[0].split(' ')[1];
    const send = (s) => sock.end(Buffer.isBuffer(s) ? s : Buffer.from(s, 'latin1'));
    const ok = (body) => send(Buffer.concat([Buffer.from('HTTP/1.1 200 OK\r\nContent-Length: ' + body.length + '\r\n\r\n', 'latin1'), body]));
    if (p.startsWith('/echo')) return ok(Buffer.from(buf.split('\r\n\r\n')[0], 'latin1'));
    const R = (code, reason, extra) => send('HTTP/1.1 ' + code + ' ' + reason + '\r\n' + extra + 'Content-Length: 0\r\n\r\n');
    switch (p) {
      case '/hang': return undefined;
      case '/close': return sock.end();
      case '/reset': return rst(sock);
      case '/short': sock.write('HTTP/1.1 200 OK\r\nContent-Length: 10\r\n\r\nabcde'); return sock.end();
      case '/shorthang': return sock.write('HTTP/1.1 200 OK\r\nContent-Length: 10\r\n\r\nabcde');
      case '/shortreset': sock.write('HTTP/1.1 200 OK\r\nContent-Length: 10\r\n\r\nabcde'); setTimeout(() => rst(sock), 100); return undefined;
      case '/chunk': return send('HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n5;x=1\r\nabcde\r\n0x3\r\nfgh\r\n0\r\nTrailer: 1\r\n\r\n');
      case '/chunkshort': return send('HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n5\r\nabcde\r\n3\r\nfg');
      case '/chunkbad': return send('HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n5\r\nabcde\r\nzz\r\n');
      case '/chunkspace': return send('HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked \r\n\r\nraw-body');
      case '/bad': return send('garbage\r\n\r\n');
      case '/badcode': return send('HTTP/1.1 abc OK\r\n\r\n');
      case '/http2': return send('HTTP/2.0 200 OK\r\n\r\nx');
      case '/nocl': return send('HTTP/1.0 200 OK\r\n\r\nuntil-close');
      case '/cl-neg': return send('HTTP/1.1 200 OK\r\nContent-Length: -5\r\n\r\nneg-body');
      case '/cl-junk': return send('HTTP/1.1 200 OK\r\nContent-Length: abc\r\n\r\njunk-body');
      case '/cl-dup': return send('HTTP/1.1 200 OK\r\nContent-Length: 3\r\nContent-Length: 5\r\n\r\nabcde');
      case '/twostatus': return send('HTTP/1.1 100 Continue\r\nX: y\r\n\r\nHTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nhi');
      case '/s204': return send('HTTP/1.1 204 No Content\r\nContent-Length: 5\r\n\r\nzzzzz');
      case '/reason': return send('HTTP/1.1 404   Not   Found  \r\nContent-Length: 0\r\n\r\n');
      case '/noreason': return send('HTTP/1.1 500\r\nContent-Length: 0\r\n\r\n');
      case '/euckr': return ok(EUC);
      case '/u8bom': return ok(Buffer.from('\ufeff한글', 'utf8'));
      case '/r302': return R(302, 'Found', 'Location: /euckr\r\n');
      case '/rrel': return R(303, 'See Other', 'Location: ../a/./b/../echo-rel?q=1#frag\r\n');
      case '/rspace': return R(302, 'Found', 'Location: /echo sp\xe9ce?a b\r\n');
      case '/ruri': return R(307, 'TR', 'URI: /echo-uri\r\n');
      case '/rnoloc': return R(302, 'Found', '');
      case '/rfile': return R(302, 'Found', 'Location: file:///C:/x\r\n');
      case '/rjs': return R(301, 'Moved', 'Location: javascript:alert(1)\r\n');
      case '/loop': return R(302, 'Found', 'Location: /loop\r\n');
      case '/chain1': return R(302, 'Found', 'Location: /chain2\r\n');
      case '/chain2': return R(302, 'Found', 'Location: /chain1\r\n');
      case '/rbad6': return R(302, 'Found', 'Location: http://[::1/x\r\n');
      case '/r404': return R(404, 'Not Found', 'Location: /euckr\r\n');
      case '/fold': return R(302, 'Found', 'Location: /echo-\r\n fold\r\n');
      case '/hdrjunk': return send('HTTP/1.1 200 OK\r\nX: 1\r\nnot a header\r\nContent-Length: 2\r\n\r\nhello');
      case '/many': { let h = ''; for (let i = 0; i < 100; i++) h += 'X' + i + ': 1\r\n'; return send('HTTP/1.1 200 OK\r\n' + h + 'Content-Length: 1\r\n\r\nz'); }
      case '/many98': { let h = ''; for (let i = 0; i < 98; i++) h += 'X' + i + ': 1\r\n'; return send('HTTP/1.1 200 OK\r\n' + h + 'Content-Length: 1\r\n\r\nz'); }
      case '/longhdr': return send('HTTP/1.1 200 OK\r\nX: ' + 'a'.repeat(70000) + '\r\n\r\n');
      default: return ok(Buffer.from('ok'));
    }
  });
}
function proxyServer(sock) {   // 절대주소 GET 은 받은 헤더를 돌려주고, CONNECT 는 터널
  let buf = Buffer.alloc(0);
  sock.on('error', () => {});
  const onData = (d) => {
    buf = Buffer.concat([buf, d]);
    const i = buf.indexOf('\r\n\r\n');
    if (i < 0) return;
    sock.removeListener('data', onData);
    const head = buf.subarray(0, i).toString('latin1');
    const rest = buf.subarray(i + 4);
    const [method, target] = head.split(' ');
    if (/need-auth/.test(target) && !/Proxy-Authorization: Basic dXNlcjpwYXNz/.test(head)) { sock.end('HTTP/1.1 407 Proxy Authentication Required\r\n\r\n'); return; }
    if (method === 'CONNECT') {
      if (target.startsWith('deny')) { sock.end('HTTP/1.1 403 Forbidden\r\n\r\n'); return; }
      const port = Number(target.slice(target.lastIndexOf(':') + 1));
      const up = net.connect(port, '127.0.0.1', () => { sock.write('HTTP/1.1 200 Connection established\r\nX-Head: ' + encodeURIComponent(head) + '\r\n\r\n'); up.write(rest); sock.pipe(up); up.pipe(sock); });
      up.on('error', () => sock.destroy());
      return;
    }
    const body = Buffer.from('PROXY ' + head, 'latin1');
    sock.end(Buffer.concat([Buffer.from('HTTP/1.1 200 OK\r\nContent-Length: ' + body.length + '\r\n\r\n'), body]));
  };
  sock.on('data', onData);
}
const PY_URLOPEN = String.raw`
import sys, json, ssl, urllib.request
args = json.loads(sys.stdin.read())
ctx = ssl.create_default_context(cafile=args['ca'])
out = []
for u in args['urls']:
    try:
        r = urllib.request.urlopen(u, timeout=args['timeout'], context=ctx)
        out.append(['OK', r.read().hex()])
    except Exception as e:
        out.append([type(e).__name__, str(e)])
print(json.dumps(out))
`;

test('urlopen 차등: 상태줄·헤더·본문 길이·청크·리다이렉트·타임아웃·TLS 오류·주소 형식 오류 문구까지 urllib 와 동일', async () => {
  const caFile = path.join(TMP, 'test-ca.pem');
  fs.writeFileSync(caFile, TEST_CERT);
  const S = [net.createServer(behave), tls.createServer({ key: TEST_KEY, cert: TEST_CERT }, behave), net.createServer((s) => { s.on('error', () => {}); }),
    net.createServer((s) => { s.on('error', () => {}); s.end(); }), net.createServer((s) => { s.on('error', () => {}); s.resetAndDestroy(); })];
  await Promise.all(S.map((s) => new Promise((r) => s.listen(0, '127.0.0.1', r))));
  const [H, TS, HANG, CLOSE, RESET] = S.map((s) => s.address().port);
  try {
    const hp = 'http://127.0.0.1:' + H;
    const urls = ['/ok', '/hang', '/close', '/reset', '/short', '/shorthang', '/shortreset', '/chunk', '/chunkshort', '/chunkbad', '/chunkspace', '/bad', '/badcode', '/http2', '/nocl',
      '/cl-neg', '/cl-junk', '/cl-dup', '/twostatus', '/s204', '/reason', '/noreason', '/euckr', '/u8bom', '/r302', '/rrel', '/rspace', '/ruri', '/rnoloc', '/rfile', '/rjs',
      '/loop', '/chain1', '/rbad6', '/r404', '/fold', '/hdrjunk', '/many', '/many98', '/longhdr', '/echo'].map((p) => hp + p);
    for (const p of ['/ok', '/hang', '/close', '/reset', '/short', '/r302', '/euckr', '/echo']) urls.push('https://localhost:' + TS + p);
    urls.push('https://127.0.0.1:' + TS + '/ok', 'https://localhost:' + HANG + '/', 'https://localhost:' + CLOSE + '/', 'https://localhost:' + RESET + '/',
      // (접속 즉시 RST 하는 평문 서버는 보내기/받기 중 어디서 끊기는지 파이썬도 그때그때 달라서 뺀다 — '/reset' 이 받은 뒤 RST)
      'http://localhost:' + CLOSE + '/', 'http://nonexistent-host-xyz.invalid/',
      hp + 'x/', hp + '/a b', hp + '/한글', hp + '/é?x=é', hp + '/a\tb', 'http://127.0.0.1:%3' + String(H).slice(0, 1) + String(H).slice(1) + '/echo-pct',
      'http://user:pw@127.0.0.1:' + H + '/echo', ' ' + hp + '/echo-ws ', '<URL:' + hp + '/echo-wrap>', hp + '/echo#frag', hp, hp + '?q=1', 'HTTP://127.0.0.1:' + H + '/echo-up',
      'http://127.0.0.1:' + H + ':/x', 'http://127.0.0.1: ' + H + '/x', 'http://[::1/x', 'xyz://a/', 'nocolon', 'http:/x', 'http://127.0.0.1:٠' + H + '/echo-digit',
      hp + '/echo;p?q', hp + '/\x7f', hp + '/echo\u00a0', hp + '/' + 'é'.repeat(3) + 'x' + 'ü');
    const py = await pyAsync(PY_URLOPEN, { urls, ca: caFile, timeout: 1 });
    for (let i = 0; i < urls.length; i++) {
      let n;
      try { n = ['OK', (await PU.urlopen(urls[i], { timeout: 1000, ca: TEST_CERT, proxyConfig: { env: {}, proxies: {} } })).toString('hex')]; } catch (e) { n = [e.pyType || 'JS', e.message]; }
      if (n[0] === 'OK' && py[i][0] === 'OK') {   // echo 는 요청 헤더 원문 — 파이썬은 User-Agent 가 같아야 함
        assert.equal(Buffer.from(n[1], 'hex').toString('latin1'), Buffer.from(py[i][1], 'hex').toString('latin1'), urls[i]);
      } else assert.deepEqual(n, py[i], urls[i]);
    }
  } finally { S.forEach((s) => s.close()); }
});

test('urlopen 차등: 프록시(환경변수) — 절대주소 GET·CONNECT 터널·인증·NO_PROXY·터널 거부·잘못된 프록시', async () => {
  const caFile = path.join(TMP, 'test-ca.pem');
  fs.writeFileSync(caFile, TEST_CERT);
  const S = [net.createServer(behave), tls.createServer({ key: TEST_KEY, cert: TEST_CERT }, behave), net.createServer(proxyServer)];
  await Promise.all(S.map((s) => new Promise((r) => s.listen(0, '127.0.0.1', r))));
  const [H, TS, PX] = S.map((s) => s.address().port);
  try {
    const cases = [
      ['http://127.0.0.1:' + H + '/echo-p', { HTTP_PROXY: 'http://127.0.0.1:' + PX }],
      ['http://127.0.0.1:' + H + '/echo-p#f', { HTTP_PROXY: '127.0.0.1:' + PX }],
      ['http://127.0.0.1:' + H + '/need-auth', { HTTP_PROXY: 'http://user:pass@127.0.0.1:' + PX }],
      ['http://127.0.0.1:' + H + '/need-auth', { HTTP_PROXY: 'http://127.0.0.1:' + PX }],
      ['https://localhost:' + TS + '/echo-tunnel', { HTTPS_PROXY: 'http://127.0.0.1:' + PX }],
      ['https://localhost:' + TS + '/echo-tunnel', { HTTPS_PROXY: 'http://user:pass@127.0.0.1:' + PX }],
      ['https://deny:' + TS + '/x', { HTTPS_PROXY: 'http://127.0.0.1:' + PX }],
      ['http://127.0.0.1:' + H + '/echo-bypass', { HTTP_PROXY: 'http://127.0.0.1:' + PX, NO_PROXY: 'localhost, .0.1' }],
      ['http://127.0.0.1:' + H + '/echo-bypass2', { HTTP_PROXY: 'http://127.0.0.1:' + PX, NO_PROXY: '*' }],
      ['http://127.0.0.1:' + H + '/echo', { HTTP_PROXY: 'http:proxy' }],
      ['http://127.0.0.1:' + H + '/r302', { HTTP_PROXY: 'http://127.0.0.1:' + PX }],
    ];
    for (const [u, env] of cases) {
      const p = (await pyAsync(PY_URLOPEN, { urls: [u], ca: caFile, timeout: 2 }, env))[0];
      const ep = PU.envProxies(env);
      let n;
      try { n = ['OK', (await PU.urlopen(u, { timeout: 2000, ca: TEST_CERT, proxyConfig: { env: ep, proxies: ep } })).toString('hex')]; } catch (e) { n = [e.pyType || 'JS', e.message]; }
      assert.deepEqual(n, p, u + ' ' + JSON.stringify(env));
    }
  } finally { S.forEach((s) => s.close()); }
  // 레지스트리 형식(getproxies_registry)·ProxyOverride(fnmatch)
  assert.deepEqual(PU.parseRegistryProxy(1, 'proxy:8080'), { http: 'http://proxy:8080', https: 'http://proxy:8080', ftp: 'http://proxy:8080' });
  assert.deepEqual(PU.parseRegistryProxy(1, 'http=a:1;https=https://b:2;socks=c:3'), { http: 'http://a:1', https: 'https://b:2', socks: 'socks://c:3' });
  assert.deepEqual(PU.parseRegistryProxy(1, 'http=a:1;'), { http: 'http://a:1' });   // 형식 오류면 그때까지만
  assert.deepEqual(PU.parseRegistryProxy(0, 'a:1'), {});
  assert.deepEqual(PU.parseRegistryProxy(1, 'socks=c:3'), { socks: 'socks://c:3', http: 'socks4://c:3', https: 'socks4://c:3' });
  const reg = { env: {}, regEnable: 1, regOverride: '*.kma.go.kr; <local>;10.*' };
  assert.equal(PU.proxyBypass('APIHUB.KMA.GO.KR:443', reg), true);
  assert.equal(PU.proxyBypass('intranet', reg), true);
  assert.equal(PU.proxyBypass('10.1.2.3', reg), true);
  assert.equal(PU.proxyBypass('apis.data.go.kr', reg), false);
});

// ── (3) 무작위 입력으로 파이썬과 비교 ──
let seed = 20261007;
const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
const pick = (a) => a[rnd(a.length)];

test('무작위 비교: json.loads 오류 문구·utf-8 디코드 오류 문구', async () => {
  const B = '\\';
  const alpha = ['{', '}', '[', ']', '"', ':', ',', ' ', '\n', '1', '0', '-', '.', 'e', 'a', B, 'u', 'n', 't', 'N', 'I', '\u{1F600}', '\t', 'd8', 'f'];
  const cases = ['', '\ufeff[]', '[1,]', '{"a":1,}', '"' + B + 'ud800' + B + 'udc00"', '[NaN, Infinity, -Infinity]', '01', '1.e5', '{"__proto__": 1}'];
  for (let i = 0; i < 1500; i++) { let s = ''; const L = rnd(12); for (let k = 0; k < L; k++) s += pick(alpha); cases.push(s); }
  const encv = (x) => JSON.stringify(x, (k, v) => (typeof v === 'number' && !Number.isFinite(v) ? 'NUM:' + v : v));
  const node = cases.map((s) => { try { return ['ok', JSON.parse(encv(PJ.pyJsonLoads(s)))]; } catch (e) { return ['err', e.message]; } });
  const py = await pyAsync(String.raw`
import sys, json, math
def conv(x):
    if isinstance(x, float) and (math.isnan(x) or math.isinf(x)): return 'NUM:' + ('NaN' if math.isnan(x) else ('Infinity' if x > 0 else '-Infinity'))
    if isinstance(x, list): return [conv(y) for y in x]
    if isinstance(x, dict): return {k: conv(v) for k, v in x.items()}
    return x
out = []
for s in json.loads(sys.stdin.read()):
    try: out.append(['ok', conv(json.loads(s))])
    except Exception as e: out.append(['err', str(e)])
print(json.dumps(out))
`, cases);
  for (let i = 0; i < cases.length; i++) assert.deepEqual(node[i], py[i], JSON.stringify(cases[i]));
  const bufs = [];
  for (let i = 0; i < 1500; i++) { const L = rnd(6) + 1; const b = []; for (let k = 0; k < L; k++) { const r = rnd(10); b.push(r < 3 ? 0x41 : r < 5 ? 0x80 + rnd(64) : 0xc0 + rnd(64)); } bufs.push(Buffer.from(b)); }
  const nu = bufs.map((b) => { try { PJ.decodeUtf8Strict(b); return 'ok'; } catch (e) { return e.message; } });
  const pu = await pyAsync(String.raw`
import sys, json
out = []
for h in json.loads(sys.stdin.read()):
    try: bytes.fromhex(h).decode('utf-8'); out.append('ok')
    except Exception as e: out.append(str(e))
print(json.dumps(out))
`, bufs.map((b) => b.toString('hex')));
  assert.deepEqual(nu, pu);
});

test('무작위 비교: parse_qs·unquote·urlsplit·urlparse·hostname·기상청 주소 검사·urljoin·quote', async () => {
  const qa = ['a', 'b', '=', '&', '+', '%', '2', 'F', 'E', 'D', '9', 'c', '%E', '%ED%95%9C', '%ZZ', 'é', '한', ';', ' ', '%80', '%C3'];
  const qs = [];
  for (let i = 0; i < 1500; i++) { let s = ''; const L = rnd(10); for (let k = 0; k < L; k++) s += pick(qa); qs.push(s); }
  const pq = await pyAsync(String.raw`
import sys, json
from urllib.parse import parse_qs, unquote
print(json.dumps([[parse_qs(s), unquote(s)] for s in json.loads(sys.stdin.read())]))
`, qs);
  qs.forEach((s, i) => assert.deepEqual([Object.assign({}, PU.parseQs(s)), PU.unquote(s)], pq[i], JSON.stringify(s)));
  const ua = ['http', 'https', 'HTTPS', ':', '//', '/', 'apihub.kma.go.kr', 'x.kma.go.kr', 'data.go.kr', 'evil.com', '@', '[', ']', '::1', 'v1.x', '1.2.3.4', '?', '#', ';', ' ', '\t', '\x01', '.', '..', 'a', '%2e', 'ｋ', '℀', ':80', 'ftp', '\\'];
  const us = ['https://apihub.kma.go.kr/api/typ01/url/typ_now.php?tm=1&authKey=a+b', ' https://apihub.kma.go.kr/', 'https://apihub.kma.go.kr\\@evil.com/'];
  for (let i = 0; i < 2500; i++) { let s = ''; const L = rnd(9); for (let k = 0; k < L; k++) s += pick(ua); us.push(s); }
  const bases = ['http://a/b/c/d;p?q', 'https://apihub.kma.go.kr/x/y?z#f', 'http://h'];
  const show = (f) => { try { const v = f(); return v === undefined ? null : v; } catch (e) { return 'ERR:' + e.message; } };
  const pu = await pyAsync(String.raw`
import sys, json, string
from urllib.parse import urlsplit, urlparse, urljoin, urlunparse, quote
bases = ['http://a/b/c/d;p?q', 'https://apihub.kma.go.kr/x/y?z#f', 'http://h']
def show(f):
    try: return f()
    except Exception as e: return 'ERR:' + str(e)
def kma(u):
    pu = urlparse(u); host = (pu.hostname or "")
    ok = host.endswith(".kma.go.kr") or host == "apihub.kma.go.kr" or host.endswith(".data.go.kr") or host == "data.go.kr"
    return pu.scheme in ("http", "https") and ok
out = []
for s in json.loads(sys.stdin.read()):
    out.append([show(lambda: urlsplit(s)._asdict()), show(lambda: urlparse(s)._asdict()), show(lambda: urlsplit(s).hostname), show(lambda: kma(s)),
                show(lambda: urljoin(bases[len(s) % 3], s)), show(lambda: urlunparse(urlparse(s))), show(lambda: quote(s, encoding='iso-8859-1', safe=string.punctuation))])
print(json.dumps(out))
`, us);
  us.forEach((s, i) => {
    const n = [show(() => PU.urlsplit(s)), show(() => PU.urlparse(s)), show(() => PU.hostnameOf(PU.urlsplit(s).netloc)), show(() => PU.kmaUrlAllowed(s)),
      show(() => PU.urljoin(bases[s.length % 3], s)), show(() => PU.urlunparse(PU.urlparse(s))), show(() => PU.quoteLatin1(s))];
    assert.deepEqual(n, pu[i], JSON.stringify(s));
  });
});

test('무작위 비교: 기상청 응답 디코딩(utf-8 → 파이썬 euc-kr: ICU 와 다른 칸·조합 시퀀스·replace 단위)', async () => {
  const bufs = [Buffer.from([0xa4, 0xd4, 0xa4, 0xa1, 0xa4, 0xbf, 0xa4, 0xd4]), Buffer.from([0xa2, 0xe6, 0xa2, 0xe7, 0xc9, 0xa1, 0xfe, 0xfe]), Buffer.from('한글 ok', 'utf8'),
    Buffer.from([0xef, 0xbb, 0xbf, 0x41]), Buffer.from([0xa4, 0xd4]), Buffer.from([0x41, 0xa4, 0xd4, 0xa4, 0xa1, 0xa4, 0xbf, 0xa4]), EUC];
  for (let i = 0; i < 6000; i++) { const L = rnd(10) + 1; const b = []; for (let k = 0; k < L; k++) { const r = rnd(10); b.push(r < 2 ? 0x41 : r < 4 ? 0xa4 : r < 5 ? 0xd4 : r < 6 ? 0x80 + rnd(0x21) : 0xa1 + rnd(94)); } bufs.push(Buffer.from(b)); }
  const pd = await pyAsync(String.raw`
import sys, json
out = []
for h in json.loads(sys.stdin.read()):
    raw = bytes.fromhex(h)
    try: t = raw.decode('utf-8')
    except Exception: t = raw.decode('euc-kr', 'replace')
    out.append(t)
print(json.dumps(out))
`, bufs.map((b) => b.toString('hex')));
  bufs.forEach((b, i) => assert.equal(W.decodeKmaBody(b), pd[i], b.toString('hex')));
});

test('shutil.which·ntpath.join 과 동일(ffmpeg 를 PATH 에서 찾을 때)', async () => {
  const d1 = path.join(TMP, 'which1'), d2 = path.join(TMP, 'which2');
  fs.mkdirSync(d1, { recursive: true }); fs.mkdirSync(d2, { recursive: true });
  for (const f of ['ffmpeg', 'tool.EXE', 'x.cmd', 'y.txt', 'both.exe']) fs.writeFileSync(path.join(d1, f), '');
  fs.writeFileSync(path.join(d2, 'both.bat'), '');
  fs.mkdirSync(path.join(d2, 'dir.exe'), { recursive: true });
  const env = { PATH: '"' + d1 + '";' + d2 + ';' + d1 + ';' + d1.replace(/\\/g, '/'), PATHEXT: '.COM;.EXE;.BAT;.CMD' };
  const names = ['ffmpeg', 'tool', 'tool.exe', 'x', 'x.cmd', 'y.txt', 'y', 'both', 'dir', 'nope', d1 + '\\tool', d1 + '\\ffmpeg'];
  const py = await pyAsync(String.raw`
import sys, json, shutil, ntpath, os
a = json.loads(sys.stdin.read())
os.environ.update(a['env'])
print(json.dumps([[shutil.which(n) for n in a['names']], [ntpath.join(*p) for p in a['joins']]]))
`, { env, names, joins: [['C:/Users/x/AppData/Local', 'Microsoft', 'Windows', 'Fonts', 'SUITE-Bold.otf'], ['C:\\x\\', 'a'], ['', 'Microsoft', 'f.otf'], ['C:', 'a'], ['C:\\a', '\\b'], ['R:\\[F]_Util\\WNS\\fonts', 'SUITE-Light.otf']] }, {}, TMP);
  const cwd = process.cwd();
  process.chdir(TMP);   // shutil.which 는 현재 폴더를 먼저 본다
  try { assert.deepEqual(names.map((n) => T.whichSync(n, env)), py[0]); } finally { process.chdir(cwd); }
  assert.deepEqual([['C:/Users/x/AppData/Local', 'Microsoft', 'Windows', 'Fonts', 'SUITE-Bold.otf'], ['C:\\x\\', 'a'], ['', 'Microsoft', 'f.otf'], ['C:', 'a'], ['C:\\a', '\\b'], ['R:\\[F]_Util\\WNS\\fonts', 'SUITE-Light.otf']].map((p) => W.ntJoin(...p)), py[1]);
  // main.js 는 못 찾으면 'ffmpeg' 이름만 넘긴다 → PATH 에서 찾아 /ping ff:true (파이썬 find_ffmpeg 와 같게)
  const d3 = path.join(TMP, 'which3');
  fs.mkdirSync(d3, { recursive: true });
  fs.writeFileSync(path.join(d3, 'ffmpeg.exe'), '');
  const oldPath = process.env.PATH;
  process.env.PATH = d3 + ';' + oldPath;
  try {
    // PATHEXT 가 대문자면 파이썬도 'ffmpeg.EXE' 로 돌려준다
    assert.equal(W.resolveFfmpeg('ffmpeg').toLowerCase(), (d3 + '\\ffmpeg.exe').toLowerCase());
    const s = W.createWnsServer({ ffmpegPath: 'ffmpeg', framesDir: path.join(TMP, 'f3') });
    assert.equal(s.config.ffmpegPath.toLowerCase(), (d3 + '\\ffmpeg.exe').toLowerCase());
    assert.ok(fs.existsSync(s.config.ffmpegPath));
  } finally { process.env.PATH = oldPath; }
});

// ── (4) Node 쪽만: 보안·정리·순서 ──
test('보안: 점만으로 된 sid 는 400 — FRAMES 상위 폴더를 지우거나 쓰지 않음', async () => {
  const root = path.join(TMP, 'dotroot'), frames = path.join(root, 'frames');
  fs.mkdirSync(path.join(frames, 'keep'), { recursive: true });
  fs.writeFileSync(path.join(root, 'sentinel.txt'), 'x');
  fs.writeFileSync(path.join(frames, 'keep', 'f_00000.png'), 'k');
  const s = W.createWnsServer({ ffmpegPath: FFMPEG, framesDir: frames, aeDryRun: true, fontsInstall: false, buildAeJsx: stubJsx });
  const p = await s.listen(0);
  try {
    for (const sid of ['.', '..', '...', '%2E%2E', '.%2F.']) {
      const r = await rawReq(p, { method: 'POST', path: '/api/frame?sid=' + sid + '&index=0', body: 'evil' });
      assert.equal(r.status, 400, sid);
      assert.equal(r.body.toString('utf8'), '{"ok": false, "error": "잘못된 sid"}');
    }
    for (const sid of ['..', '...']) {
      for (const ep of ['/api/finalize', '/api/ae']) {
        const r = await rawReq(p, { method: 'POST', path: ep, body: JSON.stringify({ sid }) });
        assert.equal(r.status, 400, ep + ' ' + sid);
      }
    }
    assert.ok(fs.existsSync(path.join(root, 'sentinel.txt')));
    assert.ok(fs.existsSync(path.join(frames, 'keep', 'f_00000.png')));
    assert.ok(!fs.existsSync(path.join(root, 'f_00000.png')));
    // 한글·점 섞인 정상 sid 는 그대로
    const ok = await rawReq(p, { method: 'POST', path: '/api/frame?sid=' + enc('a.b..c') + '&index=0', body: 'ok' });
    assert.equal(ok.status, 200);
  } finally { await s.close(); }
});

test('보안: aePath 는 설치 목록의 AfterFX.exe 만 — 목록 밖(실제 AfterFX.exe 파일·실행파일·UNC·\\??\\·네트워크 드라이브·상대경로)은 무시', async () => {
  const launched = [];
  const fakeAe = path.join(TMP, 'aesec-ae', 'Support Files', 'AfterFX.exe');   // 실제 파일이지만 목록 밖
  fs.mkdirSync(path.dirname(fakeAe), { recursive: true });
  fs.writeFileSync(fakeAe, '');
  const inst = [{ path: 'C:\\Program Files\\Adobe\\Adobe After Effects 2026\\Support Files\\AfterFX.exe', name: 'After Effects 2026' },
    { path: 'C:\\Program Files\\Adobe\\Adobe After Effects 2025\\Support Files\\AfterFX.exe', name: 'After Effects 2025' }];
  const s = W.createWnsServer({ framesDir: path.join(TMP, 'aesec'), fontsInstall: false, buildAeJsx: stubJsx,
    listAfterFx: () => inst, findRunningAfterFx: async () => null, spawnAe: async (afx, args) => { launched.push(afx); } });
  const p = await s.listen(0);
  const ae = (aePath) => rawReq(p, { method: 'POST', path: '/api/ae', body: JSON.stringify({ sid: 'sec', aePath }) }).then((r) => JSON.parse(r.body.toString('utf8')));
  try {
    await rawReq(p, { method: 'POST', path: '/api/frame?sid=sec&index=0', body: 'x' });
    for (const bad of [fakeAe, process.execPath, 'C:\\Windows\\System32\\cmd.exe', '\\\\127.0.0.1\\c$\\AfterFX.exe', '//evil/share/AfterFX.exe', path.dirname(fakeAe),
      '\\??\\UNC\\127.0.0.1\\C$\\AfterFX.exe', '\\??\\' + inst[1].path, '\\\\?\\' + inst[1].path, 'R:\\[F]_Util\\WNS\\AfterFX.exe', 'AfterFX.exe', 'C:AfterFX.exe', inst[1].path + ' ']) {
      assert.deepEqual(await ae(bad), { ok: false, choose: true, versions: inst }, bad);   // 목록 밖 → 실행 없이 버전 고르기
    }
    assert.deepEqual(launched, []);
    for (const good of [inst[1].path, inst[1].path.toLowerCase(), inst[1].path.replace(/\\/g, '/'), inst[1].path.toUpperCase()]) {
      assert.deepEqual(await ae(good), { ok: true, ae: 'Adobe After Effects 2025', fontsOk: false }, good);   // fontsInstall:false
      assert.equal(launched.pop(), inst[1].path, good);   // 실행은 늘 목록의 경로로
    }
  } finally { await s.close(); }
});

test('finalize: 응답 도중 클라이언트가 끊어도 임시 결과 파일을 지운다(파이썬은 다 읽고 지운 뒤 보냄)', async () => {
  const tmpOut = path.join(TMP, 'fin-out');
  fs.mkdirSync(tmpOut, { recursive: true });
  const s = W.createWnsServer({ ffmpegPath: process.execPath, framesDir: path.join(TMP, 'fin-frames'), tmpDir: tmpOut,
    runFfmpeg: async (args) => { fs.writeFileSync(args[args.length - 1], Buffer.alloc(64 * 1024 * 1024, 1)); return { code: 0, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) }; } });
  const p = await s.listen(0);
  try {
    await rawReq(p, { method: 'POST', path: '/api/frame?sid=big&index=0', body: 'x' });
    const out = path.join(tmpOut, 'wns_big.mov');
    await new Promise((resolve) => {
      const req = http.request({ host: '127.0.0.1', port: p, method: 'POST', path: '/api/finalize', agent: false }, (res) => {
        assert.equal(res.statusCode, 200);
        res.pause();   // 안 읽고
        setTimeout(() => { req.destroy(); resolve(); }, 200);   // 끊는다
      });
      req.end(JSON.stringify({ sid: 'big', mode: 'mov' }));
    });
    assert.ok(await waitGone(out, 5000), '임시 결과 파일이 남음');
    // 정상 완료도 지운다
    await rawReq(p, { method: 'POST', path: '/api/frame?sid=big&index=0', body: 'x' });
    const r = await rawReq(p, { method: 'POST', path: '/api/finalize', body: JSON.stringify({ sid: 'big', mode: 'mov' }) });
    assert.equal(r.body.length, 64 * 1024 * 1024);
    assert.ok(await waitGone(out, 5000));
  } finally { await s.close(); }
});

test('rmtree(ignore_errors): 잠긴 파일 하나가 있어도 나머지는 지운다(인덱스 0 리셋 때 옛 프레임이 섞이지 않게)', async () => {
  const d = path.join(TMP, 'locked');
  fs.mkdirSync(path.join(d, 'sub'), { recursive: true });
  for (const f of ['f_00000.png', 'f_00001.png', 'f_00002.png', 'sub/a.txt']) fs.writeFileSync(path.join(d, f), 'x');
  const lockFile = path.join(d, 'f_00001.png');
  const holder = spawn('py', ['-c', 'import sys; f = open(sys.argv[1], "rb"); print("ready", flush=True); sys.stdin.read()', lockFile], { windowsHide: true });
  await new Promise((r) => holder.stdout.once('data', r));
  try {
    await W.rmTree(d);
    const left = fs.existsSync(d) ? fs.readdirSync(d) : [];
    assert.deepEqual(left, ['f_00001.png']);   // 잠긴 것만 남음
  } finally { holder.stdin.end(); holder.kill(); }
});

test('폰트: 레지스트리 값 이름 대소문자 무시·바뀐 게 있을 때만 WM_FONTCHANGE 를 보내고 끝날 때까지 기다림·경로 문자열은 ntpath.join', async () => {
  assert.equal(W.parseRegQuery('\r\nHKEY_CURRENT_USER\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Fonts\r\n    suite light (opentype)    REG_SZ    C:\\F\\SUITE-Light.otf\r\n\r\n', 'SUITE Light (OpenType)'), 'C:\\F\\SUITE-Light.otf');
  assert.equal(W.parseRegQuery('    SUITE Light (OpenType)    REG_SZ', 'SUITE Light (OpenType)'), '');
  assert.equal(W.parseRegQuery('    Other    REG_SZ    x', 'SUITE Light (OpenType)'), null);
  if (!FONTS_DIRS.length) return;
  const la = path.join(TMP, 'la').replace(/\\/g, '/');   // LOCALAPPDATA 에 / 가 섞여도 파이썬과 같은 문자열로 등록
  const reg = new Map(), order = [];
  const o = { localAppData: la, regQuery: async (k, n) => (reg.has(n.toLowerCase()) ? reg.get(n.toLowerCase()) : null),
    regSet: async (k, n, v) => { reg.set(n.toLowerCase(), v); order.push('set'); },
    broadcast: () => new Promise((r) => setTimeout(() => { order.push('broadcast'); r(); }, 150)) };
  assert.equal(await W.ensureSuiteFonts(FONTS_DIRS, o), true);
  order.push('returned');
  assert.equal(order.filter((x) => x === 'set').length, 7);
  assert.deepEqual(order.slice(-2), ['broadcast', 'returned']);   // 브로드캐스트가 끝난 뒤에 돌아온다(그다음 AE 실행)
  const want = await pyAsync(String.raw`
import sys, json, os
a = json.loads(sys.stdin.read())
fd = os.path.join(a['la'], "Microsoft", "Windows", "Fonts")
print(json.dumps([os.path.join(fd, f) for f in a['files']]))
`, { la, files: W.SUITE_FONTS.map((f) => f[0]) });
  assert.deepEqual(W.SUITE_FONTS.map((f) => reg.get(f[1].toLowerCase())), want);
  order.length = 0;
  assert.equal(await W.ensureSuiteFonts(FONTS_DIRS, o), true);
  assert.deepEqual(order, []);   // 이미 같으면 다시 쓰지도, 브로드캐스트하지도 않음
});

// ════════════════════════════════════════════════════════════════════════════════
// 20261007 서버 감사 — 출처 검사·본문 상한·aePath·점 sid(C23/C72), 세션 폴더 정리(C116), SUITE 폰트·fontsOk(C114).
// 진짜 helper.py 와 같은 요청을 보내 상태·사유문구·헤더(Vary 포함)·본문·남은 파일까지 비교한다.
// ════════════════════════════════════════════════════════════════════════════════
const MB = 1024 * 1024;
const V1 = [{ path: 'C:\\Program Files\\Adobe\\Adobe After Effects 2025\\Support Files\\AfterFX.exe', name: 'After Effects 2025' }];
const REJECT = '{"ok": false, "error": "허용되지 않은 출처"}';

// 소켓 응답 원문 → {status, reason, headers(소문자, 첫 값), body}
function parseRaw(raw) {
  const i = raw.indexOf('\r\n\r\n');
  if (!raw || i < 0) return { error: 'empty' };
  const head = raw.slice(0, i).split('\r\n');
  const m = /^HTTP\/1\.[01] (\d{3}) ?(.*)$/.exec(head[0]);
  const headers = {};
  for (const l of head.slice(1)) { const k = l.slice(0, l.indexOf(':')).toLowerCase(); if (!(k in headers)) headers[k] = l.slice(l.indexOf(':') + 1).trim(); }
  return { status: Number(m[1]), reason: m[2], headers, body: Buffer.from(raw.slice(i + 4), 'latin1').toString('utf8') };
}
const rawView = (r) => (r.error ? r : { status: r.status, reason: r.reason, body: r.body, acao: r.headers['access-control-allow-origin'], ctype: r.headers['content-type'] });

test('차등: 출처(Origin) — 허용 목록은 반사+Vary, 없으면 *, 그 밖은 모든 메서드 403(CORS 없음), 501 은 그대로', async () => {
  await startPyHelper();
  const GOOD = ['https://newsdesign1991-blip.github.io', 'app://weathercg', 'http://localhost', 'http://localhost:5500', 'https://localhost', 'https://localhost:8443',
    'http://127.0.0.1', 'http://127.0.0.1:3344', 'http://[::1]', 'http://[::1]:8080', 'http://localhost:65535', 'app://weathercg  ', 'app://weathercg\t'];
  const BAD = ['https://evil.com', 'http://localhost.evil.com', 'https://newsdesign1991-blip.github.io.evil.com', 'http://newsdesign1991-blip.github.io',
    'https://newsdesign1991-blip.github.io/', 'https://evil.github.io', 'app://weathercg/', 'app://evil', 'https://127.0.0.1', 'https://[::1]', 'http://127.0.0.2',
    'http://localhost:', 'http://localhost:123456', 'HTTP://LOCALHOST', 'http://LOCALHOST', 'http://localhost:80/x', 'http://localhost:\xb2', 'chrome-extension://abc',
    '', ' ', 'nul', 'NULL', 'null, app://weathercg', 'app://weathercg app://weathercg'];
  const kinds = (o) => [{ path: '/ping', headers: o, v: { ping: true } }, { path: '/api/kma?u=' + enc('https://evil.com/'), headers: o },
    { method: 'OPTIONS', path: '/api/ae', headers: o }, { method: 'POST', path: '/api/ae', headers: o, body: '{}' },
    { method: 'POST', path: '/api/frame?sid=orgsid&index=3', headers: o, body: 'o' }, { method: 'PUT', path: '/ping', headers: o, body: 'x', v: { conn: true } }];
  for (const o of GOOD) {
    for (const k of kinds({ Origin: o })) {
      const r = await same(k, k.v);
      if (k.method !== 'PUT') {
        assert.equal(r.node.headers['access-control-allow-origin'], o.trim(), o);
        assert.equal(r.node.headers.vary, 'Origin', o);
        assert.equal(r.node.headers['access-control-allow-methods'], 'GET, POST, OPTIONS');
      }
    }
  }
  for (const o of BAD) {
    for (const k of kinds({ Origin: o })) {
      const r = await same(k, k.v);
      if (k.method === 'PUT') { assert.equal(r.node.status, 501); continue; }
      assert.equal(r.node.status, 403, JSON.stringify(o) + ' ' + k.path);
      if (k.v && k.v.ping) assert.deepEqual(JSON.parse(r.node.body), JSON.parse(REJECT));   // ping 보기는 본문을 다시 직렬화함
      else assert.equal(r.node.body, REJECT);
      assert.deepEqual(Object.keys(r.node.headers).filter((h) => h.startsWith('access-control') || h === 'vary'), [], o);
    }
  }
  // 'null'(file://·샌드박스) — GET 만 허용, POST·OPTIONS 는 403
  for (const o of ['null', 'null ']) {
    const g = await same({ path: '/ping', headers: { Origin: o } }, { ping: true });
    assert.equal(g.node.status, 200); assert.equal(g.node.headers['access-control-allow-origin'], 'null');
    const k = await same({ path: '/api/kma?u=' + enc('ftp://x/'), headers: { Origin: o } });
    assert.equal(k.node.status, 400); assert.equal(k.node.headers['access-control-allow-origin'], 'null');
    for (const spec of [{ method: 'POST', path: '/api/frame?sid=nullsid&index=0', body: 'n' }, { method: 'POST', path: '/api/finalize', body: '{}' }, { method: 'OPTIONS', path: '/api/frame' }]) {
      const r = await same(Object.assign({ headers: { Origin: o } }, spec));
      assert.equal(r.node.status, 403); assert.equal(r.node.body, REJECT);
    }
  }
  // Origin 이 여러 줄이면 첫 줄로 판단(파이썬 headers.get)
  let r = await same({ path: '/ping', headers: { Origin: ['https://evil.com', 'app://weathercg'] } }, { ping: true });
  assert.equal(r.node.status, 403);
  r = await same({ path: '/ping', headers: { Origin: ['app://weathercg', 'https://evil.com'] } }, { ping: true });
  assert.equal(r.node.headers['access-control-allow-origin'], 'app://weathercg');
  // Origin 없음(로컬 도구·curl) — 예전처럼 '*', Vary 없음
  r = await same({ method: 'OPTIONS', path: '/api/frame' });
  assert.equal(r.node.status, 204); assert.equal(r.node.headers['access-control-allow-origin'], '*'); assert.equal(r.node.headers.vary, undefined);
  // 거부된 POST 는 아무것도 쓰지 않음
  for (const d of [NF, PYF]) { assert.ok(!fs.existsSync(path.join(d, 'nullsid'))); assert.equal(fs.readFileSync(path.join(d, 'orgsid', 'f_00003.png'), 'utf8'), 'o'); }
  assert.deepEqual(['app://weathercg', 'http://localhost:1', 'null'].map((o) => W.corsFor(o, 'GET')[0][1]), ['app://weathercg', 'http://localhost:1', 'null']);
  assert.equal(W.corsFor('null', 'POST'), null);
});

test('차등: 본문 상한 — Content-Length 가 넘으면 본문을 기다리지 않고 413(frame 256MB, finalize·ae 16MB), 경계값은 통과', async () => {
  await startPyHelper();
  const cases = [['/api/frame?sid=big413&index=0', 256 * MB + 1], ['/api/frame?sid=big413&index=0', 1e12], ['/api/finalize', 16 * MB + 1], ['/api/ae', 16 * MB + 1], ['/api/ae', 1e15]];
  for (const [p, n] of cases) {
    for (const origin of ['', 'Origin: app://weathercg\r\n']) {
      const req = 'POST ' + p + ' HTTP/1.1\r\nHost: x\r\n' + origin + 'Content-Length: ' + n + '\r\n\r\n';   // 본문은 안 보냄 — 기다리면 5초 뒤 빈 응답
      const [a, b] = await Promise.all([rawSock(pyPort, req), rawSock(dsPort, req)]);
      const pa = parseRaw(a), pb = parseRaw(b);
      assert.deepEqual(rawView(pb), rawView(pa), p + ' ' + n);
      assert.equal(pb.status, 413);
      assert.equal(pb.reason, 'Content Too Large');
      assert.equal(pb.body, '{"ok": false, "error": "요청이 너무 큽니다"}');
      assert.equal(pb.headers['access-control-allow-origin'], origin ? 'app://weathercg' : '*');
    }
  }
  // 출처 거부가 먼저(403)
  const bad = 'POST /api/ae HTTP/1.1\r\nHost: x\r\nOrigin: https://evil.com\r\nContent-Length: ' + (17 * MB) + '\r\n\r\n';
  const [a, b] = await Promise.all([rawSock(pyPort, bad), rawSock(dsPort, bad)]);
  assert.deepEqual(rawView(parseRaw(b)), rawView(parseRaw(a)));
  assert.equal(parseRaw(b).status, 403);
  for (const d of [NF, PYF]) assert.ok(!fs.existsSync(path.join(d, 'big413')));
  // 경계값(정확히 16MB)은 받아서 처리 → 프레임 없음 400, 상한 없는 경로(404)는 그대로
  const body = Buffer.alloc(16 * MB, 0x20);
  Buffer.from('{"sid":"nothing-here"}').copy(body);
  const r = await same({ method: 'POST', path: '/api/finalize', body });
  assert.equal(r.node.status, 400);
  const nf = 'POST /nope HTTP/1.1\r\nHost: x\r\nContent-Length: 0\r\nConnection: close\r\n\r\n';
  assert.equal(parseRaw(await rawSock(dsPort, nf)).status, 404);
  assert.deepEqual([...W.BODY_MAX.entries()], [['/api/frame', 256 * MB], ['/api/finalize', 16 * MB], ['/api/ae', 16 * MB]]);
});

test('차등: 본문 길이 머리글 — chunked·잘못된/중복/넘치는 Content-Length 는 모든 요청 400(출처·메서드보다 먼저, CORS 없음, 본문 안 읽음), 상한 경로에 길이 없으면 411', async () => {
  await startPyHelper();
  const BADLEN = '{"ok": false, "error": "잘못된 본문 길이"}';
  const go = async (req) => {
    const [a, b] = await Promise.all([rawSock(pyPort, req), rawSock(dsPort, req)]);
    const pa = parseRaw(a), pb = parseRaw(b);
    assert.deepEqual(rawView(pb), rawView(pa), JSON.stringify(req));
    return pb;
  };
  const BAD = ['Transfer-Encoding: chunked', 'Transfer-Encoding: Chunked', 'Transfer-Encoding: gzip, chunked', 'Transfer-Encoding: gzip', 'Transfer-Encoding: identity',
    'Transfer-Encoding: chunked, gzip', 'Transfer-Encoding: ', 'Transfer-Encoding: chunked\r\nTransfer-Encoding: chunked', 'Transfer-Encoding: chunked\r\nContent-Length: 5',
    'Content-Length: 5\r\nTransfer-Encoding: chunked', 'Content-Length: -1', 'Content-Length: +5', 'Content-Length: 1_0', 'Content-Length: abc', 'Content-Length: 0x5',
    'Content-Length: 5 5', 'Content-Length: 5,5', 'Content-Length: 5\t', 'Content-Length: ', 'Content-Length:', 'Content-Length: 5\r\nContent-Length: 5',
    'Content-Length: 5\r\ncontent-length: 6', 'Content-Length: 18446744073709551616', 'Content-Length: 99999999999999999999999', 'Content-Length: ٣', 'Content-Length: ５'];
  const kinds = ['POST /api/frame?sid=badlen&index=0', 'POST /api/ae', 'POST /api/finalize', 'POST /nope', 'GET /ping', 'OPTIONS /api/ae', 'PUT /ping'];
  for (const h of BAD) {
    for (const k of kinds) {
      for (const origin of ['', 'Origin: https://evil.com\r\n', 'Origin: app://weathercg\r\n']) {
        const r = await go(k + ' HTTP/1.1\r\nHost: x\r\n' + origin + h + '\r\n\r\n');   // 본문은 안 보냄 — 기다리면 5초 뒤 빈 응답
        assert.equal(r.status, 400, h + ' / ' + k);
        assert.equal(r.reason, 'Bad Request');
        assert.equal(r.body, BADLEN, h + ' / ' + k);
        assert.equal(r.headers['access-control-allow-origin'], undefined);
      }
    }
  }
  // chunked 본문을 실제로 보내도 읽지 않고 400 — 프레임 파일을 쓰지 않는다(예전 Node 는 끝까지 받아 디스크에 씀)
  const chunked = 'POST /api/frame?sid=chunky&index=0 HTTP/1.1\r\nHost: x\r\nTransfer-Encoding: chunked\r\n\r\n5\r\nhello\r\n0\r\n\r\n';
  assert.equal((await go(chunked)).status, 400);
  for (const d of [NF, PYF]) { assert.ok(!fs.existsSync(path.join(d, 'chunky'))); assert.ok(!fs.existsSync(path.join(d, 'badlen'))); }
  // 길이 없음 → 상한 있는 경로만 411(출처 검사 뒤라 CORS 있음, 거부 출처는 403), 상한 없는 경로는 그대로
  for (const p of ['/api/frame?sid=nolen&index=0', '/api/finalize', '/api/ae']) {
    for (const [origin, acao] of [['', '*'], ['Origin: app://weathercg\r\n', 'app://weathercg']]) {
      const r = await go('POST ' + p + ' HTTP/1.1\r\nHost: x\r\n' + origin + 'Connection: close\r\n\r\n');
      assert.deepEqual([r.status, r.reason, r.body, r.headers['access-control-allow-origin']], [411, 'Length Required', '{"ok": false, "error": "본문 길이(Content-Length)가 필요합니다"}', acao], p);
    }
    assert.equal((await go('POST ' + p + ' HTTP/1.1\r\nHost: x\r\nOrigin: https://evil.com\r\nConnection: close\r\n\r\n')).status, 403);
  }
  assert.equal((await go('POST /nope HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n')).status, 404);
  for (const d of [NF, PYF]) assert.ok(!fs.existsSync(path.join(d, 'nolen')));
  // 2^64-1 은 올바른 길이 → 상한 넘음 413
  const r = await go('POST /api/ae HTTP/1.1\r\nHost: x\r\nContent-Length: 18446744073709551615\r\n\r\n');
  assert.equal(r.status, 413);
  // 앞 공백·탭, 끝 공백, 앞자리 0 은 올바른 길이 — 같은 파일을 쓴다
  const okHeads = ['Content-Length: 5 ', 'Content-Length:\t 5', 'Content-Length:   05', 'content-length: 5'];
  for (let i = 0; i < okHeads.length; i++) {
    const ok = await go('POST /api/frame?sid=lenok&index=' + (i + 1) + ' HTTP/1.1\r\nHost: x\r\n' + okHeads[i] + '\r\nConnection: close\r\n\r\nhello');
    assert.equal(ok.status, 200, okHeads[i]);
  }
  assert.deepEqual(tree(path.join(NF, 'lenok')), tree(path.join(PYF, 'lenok')));
  assert.equal(Object.keys(tree(path.join(NF, 'lenok'))).length, okHeads.length);
  // 길이 오류가 아닌 파서 오류는 Node 기본 응답 그대로(빈 본문 400)
  const raw = await rawSock(dsPort, 'GE T /ping HTTP/1.1\r\nHost: x\r\n\r\n');
  assert.equal(raw, 'HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
});

test('차등: aePath — 설치 목록의 경로와 같을 때만(ASCII 대소문자·/ 무시) 목록 경로로 실행, UNC·\\??\\·네트워크 드라이브·상대경로·목록 밖 파일·문자열 아님은 무시', async () => {
  await startPyHelper();
  const fake = path.join(TMP, 'Adobe After Effects 2098', 'Support Files', 'AfterFX.exe');
  const offList = path.join(TMP, 'AE off list', 'Support Files', 'AfterFX.exe');   // 실제 파일이지만 목록 밖
  for (const f of [fake, offList]) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, ''); }
  const VL = [{ path: fake, name: 'After Effects 2098' }, V1[0]];
  const drv = fake.slice(0, 1);
  const inputs = [fake, fake.toLowerCase(), fake.toUpperCase(), fake.replace(/\\/g, '/'), V1[0].path, V1[0].path.toLowerCase(), V1[0].path.replace(/\\/g, '/'),
    offList, process.execPath, 'C:\\Windows\\System32\\cmd.exe', '\\\\?\\' + fake, '//?/' + fake.replace(/\\/g, '/'), '\\??\\' + fake,
    '\\??\\UNC\\localhost\\' + drv + '$' + fake.slice(2), '\\\\localhost\\' + drv + '$' + fake.slice(2), '\\\\127.0.0.1\\c$\\AfterFX.exe', '//evil/share/AfterFX.exe',
    'R:\\[F]_Util\\WNS\\AfterFX.exe', 'R:AfterFX.exe', 'AfterFX.exe', 'Support Files\\AfterFX.exe', 'C:AfterFX.exe', drv + ':' + path.relative(drv + ':\\', fake),
    path.dirname(fake), fake + '\u0000', fake + ' ', ' ' + fake, fake + '.bak', V1[0].path.replace('Files', 'FİLES'), V1[0].path.replace('Adobe\\', 'Adobe\\\\'),
    '', 1, 0, true, false, null, [fake], { path: fake }, 1.5];
  const py = pyRun('import sys,json; sys.path.insert(0, r"' + HELPER_SRC + '"); import helper\n'
    + 'a=json.loads(sys.stdin.read()); print(json.dumps([helper.listed_afterfx(p, a["vers"]) for p in a["inputs"]]))', { inputs, vers: VL });
  assert.deepEqual(inputs.map((p) => W.listedAfterFx(p, VL)), py);
  assert.deepEqual(py.slice(0, 7), [fake, fake, fake, fake, V1[0].path, V1[0].path, V1[0].path]);   // 목록 경로(원래 철자)로
  assert.ok(py.slice(7).every((x) => x === null));
  await same({ method: 'POST', path: '/api/frame?sid=aeP&index=0', body: 'png' });
  await setAeState(null, VL);
  for (const ap of inputs) {
    const r = await same({ method: 'POST', path: '/api/ae', body: JSON.stringify({ sid: 'aeP', aePath: ap }) });
    assert.equal(r.node.status, 200, String(ap));
    const c = await setAeState(null, VL);
    assert.deepEqual(normCalls(c.node, NF), normCalls(c.py, PYF), String(ap));
    const want = W.listedAfterFx(ap, VL);
    if (want) assert.equal(c.node[1][1][0], want, String(ap));
    else { assert.deepEqual(c.node, [], String(ap)); assert.equal(JSON.parse(r.node.body).choose, true); }   // 목록 밖 → 실행 없이 버전 고르기
  }
  // 목록 밖 경로 + 실행 중인 AE → 실행 중인 것으로
  await setAeState('C:\\Running\\Adobe After Effects 2024\\Support Files\\AfterFX.exe', VL);
  await same({ method: 'POST', path: '/api/ae', body: JSON.stringify({ sid: 'aeP', aePath: offList }) });
  const c = await setAeState(null, VL);
  assert.deepEqual(normCalls(c.node, NF), normCalls(c.py, PYF));
  assert.equal(c.node[1][1][0], 'C:\\Running\\Adobe After Effects 2024\\Support Files\\AfterFX.exe');
});

test('차등: 점으로 끝나는 sid·윈도 장치 이름 sid — 두 헬퍼 모두 400(폴더 안 만듦), 비슷한 보통 이름은 그대로 저장', async () => {
  const A = path.join(TMP, 'devpy', 'frames'), B = path.join(TMP, 'devnode', 'frames');
  const pport = await spawnPy(A, FFMPEG || path.join(TMP, 'none.exe'));
  const s = W.createWnsServer({ ffmpegPath: FFMPEG || path.join(TMP, 'none.exe'), framesDir: B, aeDryRun: true, fontsInstall: false, buildAeJsx: stubJsx });
  const nport = await s.listen(0);
  const BAD = ['a..', 'x.', 'a.b.', 'NUL', 'nul', 'Con', 'aUx', 'PRN', 'COM1', 'com9', 'COM0', 'LPT1', 'lpt0', 'COM%C2%B9', 'lpt%C2%B3', 'LPT%C2%B2.log',
    'NUL.txt', 'con.tar.gz', 'NUL..x', 'PRN.', 'nul%20', 'C%3AO%2FN', 'AUX%2E', 'COM1.%2E'];
  const OK = ['COM10', 'CONX', 'NULL', 'xNUL', 'COM', 'LPT', 'a.b', '.hidden', 'CON_1', 'COM1x', 'COMa', 'LPT%C2%B9%C2%B9', 'COM%C2%B5', 'CON-', 'nul_.txt', '%EF%BC%AEUL'];
  try {
    const run = async (spec) => {
      const [a, b] = await Promise.all([rawReq(pport, spec), rawReq(nport, spec)]);
      assert.deepEqual(view(b), view(a), JSON.stringify(spec));
      return view(b);
    };
    for (const sid of BAD) {
      const r = await run({ method: 'POST', path: '/api/frame?sid=' + sid + '&index=0', body: 'evil' });
      assert.equal(r.status, 400, sid); assert.equal(r.body, '{"ok": false, "error": "잘못된 sid"}');
    }
    for (const sid of ['a..', 'NUL', 'COM1.txt', 'x.']) {
      for (const ep of ['/api/finalize', '/api/ae']) assert.equal((await run({ method: 'POST', path: ep, body: JSON.stringify({ sid }) })).status, 400, ep + ' ' + sid);
    }
    for (const sid of OK) assert.equal((await run({ method: 'POST', path: '/api/frame?sid=' + sid + '&index=0', body: 'ok:' + sid })).status, 200, sid);
    assert.deepEqual(tree(B), tree(A));
    assert.equal(Object.keys(tree(B)).length, OK.length);
    for (const d of [A, B]) assert.deepEqual(fs.readdirSync(d).filter((n) => /\.$/.test(n) || /^(?:CON|PRN|AUX|NUL|COM[0-9¹²³]|LPT[0-9¹²³])(?:\.|$)/i.test(n)), [], d);
  } finally { await s.close(); }
});

test('차등: 점만으로 된 sid — 두 헬퍼 모두 400, FRAMES 와 상위 폴더를 지우거나 쓰지 않음', async () => {
  const mkRoot = (name) => {
    const root = path.join(TMP, name), frames = path.join(root, 'frames');
    fs.mkdirSync(path.join(frames, 'keep'), { recursive: true });
    fs.writeFileSync(path.join(root, 'sentinel.txt'), 'x');
    fs.writeFileSync(path.join(frames, 'keep', 'f_00000.png'), 'k');
    return { root, frames };
  };
  const A = mkRoot('dotpy'), B = mkRoot('dotnode');
  const pport = await spawnPy(A.frames, FFMPEG || path.join(TMP, 'none.exe'));
  const s = W.createWnsServer({ ffmpegPath: FFMPEG || path.join(TMP, 'none.exe'), framesDir: B.frames, aeDryRun: true, fontsInstall: false, buildAeJsx: stubJsx });
  const nport = await s.listen(0);
  try {
    const reqs = [];
    for (const sid of ['.', '..', '...', '%2E%2E', '.%2F.']) reqs.push({ method: 'POST', path: '/api/frame?sid=' + sid + '&index=0', body: 'evil' });
    for (const sid of ['..', '...']) for (const ep of ['/api/finalize', '/api/ae']) reqs.push({ method: 'POST', path: ep, body: JSON.stringify({ sid }) });
    for (const spec of reqs) {
      const [a, b] = await Promise.all([rawReq(pport, spec), rawReq(nport, spec)]);
      assert.deepEqual(view(b), view(a), JSON.stringify(spec));
      assert.equal(view(b).status, 400);
      assert.equal(view(b).body, '{"ok": false, "error": "잘못된 sid"}');
    }
    for (const X of [A, B]) {
      assert.ok(fs.existsSync(path.join(X.root, 'sentinel.txt')));
      assert.ok(fs.existsSync(path.join(X.frames, 'keep', 'f_00000.png')));
      assert.ok(!fs.existsSync(path.join(X.root, 'f_00000.png')) && !fs.existsSync(path.join(X.frames, 'f_00000.png')));
    }
  } finally { await s.close(); }
});

test('차등: 오래된 세션 폴더 정리 — index 0 때·시작 때, ae… 90일(저장한 AE 프로젝트 원본)/그 밖 1일, 지금 sid·파일·정션은 그대로', async () => {
  await startPyHelper();
  const DAY = 86400 * 1000;
  assert.equal(W.PRUNE_AE_DAYS, 90);
  const plan = [['aeOld91', 91 * DAY], ['ae89d', 89 * DAY], ['ae15d', 15 * DAY], ['mov2d', 2 * DAY], ['wns20h', 20 * 3600 * 1000], ['AEcase2d', 2 * DAY], ['prunesid', 120 * DAY]];
  const outside = path.join(TMP, 'prune-outside');
  fs.mkdirSync(outside, { recursive: true });
  fs.writeFileSync(path.join(outside, 'precious.txt'), 'p');
  const seed = (root) => {
    const now = Date.now();
    fs.mkdirSync(root, { recursive: true });
    for (const [nm] of plan) { fs.mkdirSync(path.join(root, nm), { recursive: true }); fs.writeFileSync(path.join(root, nm, 'f_00000.png'), nm); }
    fs.writeFileSync(path.join(root, 'old-file.txt'), 'f');
    const lnk = path.join(root, 'movlink');
    if (!fs.existsSync(lnk)) fs.symlinkSync(outside, lnk, 'junction');
    for (const [nm, age] of plan) { const t = new Date(now - age); fs.utimesSync(path.join(root, nm), t, t); }
    const t = new Date(now - 30 * DAY);
    fs.utimesSync(path.join(root, 'old-file.txt'), t, t);
    fs.utimesSync(outside, t, t);
    fs.lutimesSync(lnk, t, t);
  };
  const expectLeft = (root, sidKept) => {
    const has = (nm) => fs.existsSync(path.join(root, nm));
    assert.deepEqual(plan.map(([nm]) => [nm, has(nm)]), [['aeOld91', false], ['ae89d', true], ['ae15d', true], ['mov2d', false], ['wns20h', true], ['AEcase2d', false], ['prunesid', sidKept]], root);
    assert.ok(has('old-file.txt') && has('movlink'), root);
    assert.equal(fs.readFileSync(path.join(outside, 'precious.txt'), 'utf8'), 'p');
  };
  // (1) index 0 업로드 때 — 지금 sid(prunesid, 30일)는 지우지 않고 리셋만
  seed(PYF); seed(NF);
  await same({ method: 'POST', path: '/api/frame?sid=prunesid&index=0', body: 'new' });
  for (const root of [PYF, NF]) {
    expectLeft(root, true);
    assert.deepEqual(fs.readdirSync(path.join(root, 'prunesid')), ['f_00000.png']);
    assert.equal(fs.readFileSync(path.join(root, 'prunesid', 'f_00000.png'), 'utf8'), 'new');
  }
  assert.deepEqual(tree(NF), tree(PYF));
  // index 0 이 아니면 정리 안 함
  seed(PYF); seed(NF);
  await same({ method: 'POST', path: '/api/frame?sid=prunesid&index=1', body: 'x' });
  for (const root of [PYF, NF]) assert.ok(fs.existsSync(path.join(root, 'aeOld91')));
  // (2) 시작 때 — 파이썬 main() 의 prune_frames() 와 Node listen() 이 같은 결과
  const P1 = path.join(TMP, 'prune-py'), N1 = path.join(TMP, 'prune-node');
  seed(P1); seed(N1);
  await pyAsync('import sys,json; sys.path.insert(0, r"' + HELPER_SRC + '"); import helper\n'
    + 'a=json.loads(sys.stdin.read()); helper.FRAMES=a["d"]; helper.prune_frames(); print("[]")', { d: P1 });
  const s = W.createWnsServer({ framesDir: N1, fontsInstall: false });
  await s.listen(0);
  await s.pruned;
  await s.close();
  expectLeft(P1, false); expectLeft(N1, false);
  assert.deepEqual(tree(N1), tree(P1));
  // FRAMES 가 없어도 오류 없이 넘어감
  await W.pruneFrames(path.join(TMP, 'no-such-frames'));
});

test('차등: ffmpeg 없음으로 finalize 가 실패해도 그 세션 폴더는 지운다(다른 세션·점 sid 는 그대로)', async () => {
  const PF = path.join(TMP, 'noff-py', 'frames'), NFF = path.join(TMP, 'noff-node', 'frames');
  const none = path.join(TMP, 'none.exe');
  const pport = await spawnPy(PF, none);
  const s = W.createWnsServer({ ffmpegPath: none, framesDir: NFF });
  const nport = await s.listen(0);
  try {
    const run = async (spec) => {
      const [a, b] = await Promise.all([rawReq(pport, spec), rawReq(nport, spec)]);
      assert.deepEqual(view(b), view(a), JSON.stringify(spec));
      return view(b);
    };
    for (const [sid, i] of [['sess1', 0], ['sess1', 1], ['other', 0]]) await run({ method: 'POST', path: '/api/frame?sid=' + sid + '&index=' + i, body: sid + i });
    const r = await run({ method: 'POST', path: '/api/finalize', body: JSON.stringify({ sid: 'sess1', mode: 'mov' }) });
    assert.equal(r.status, 500);
    assert.equal(r.body, '{"ok": false, "error": "ffmpeg.exe 없음 (헬퍼 옆에 두세요)"}');
    for (const d of [PF, NFF]) { assert.ok(!fs.existsSync(path.join(d, 'sess1'))); assert.ok(fs.existsSync(path.join(d, 'other', 'f_00000.png'))); }
    await run({ method: 'POST', path: '/api/finalize', body: JSON.stringify({ sid: '..' }) });   // 점 sid 는 지우지 않고 ffmpeg 오류만
    await run({ method: 'POST', path: '/api/finalize', body: JSON.stringify({}) });   // sid 없으면 's'
    await run({ method: 'POST', path: '/api/finalize', body: '[1]' });   // dict 아님 → 같은 AttributeError
    for (const d of [PF, NFF]) assert.ok(fs.existsSync(path.join(d, 'other', 'f_00000.png')));
    assert.deepEqual(tree(NFF), tree(PF));
  } finally { await s.close(); }
});

test('차등: fontsOk — SUITE 설치 결과를 /api/ae 응답에 싣는다(true/false)', async () => {
  await startPyHelper();
  await same({ method: 'POST', path: '/api/frame?sid=aeF&index=0', body: 'png' });
  let fonts = true;
  await setAeState(null, V1, fonts);
  for (const next of [false, true, true]) {
    const r = await same({ method: 'POST', path: '/api/ae', body: JSON.stringify({ sid: 'aeF' }) });
    assert.deepEqual(JSON.parse(r.node.body), { ok: true, ae: 'Adobe After Effects 2025', fontsOk: fonts });
    const c = await setAeState(null, V1, next);
    assert.deepEqual(c.node.map((x) => x[0]), ['fonts', 'popen']);   // 폰트 설치 결과와 상관없이 AE 는 실행
    assert.deepEqual(normCalls(c.node, NF), normCalls(c.py, PYF));
    fonts = next;
  }
});

// 파이썬 ensure_suite_fonts 를 가짜 winreg/ctypes 로 돌린다(사용자 폰트 폴더·레지스트리는 안 건드림)
const PY_FONTS = String.raw`
import sys, json, os, types
a = json.loads(sys.stdin.read())
sys.path.insert(0, a['src'])
import helper
dirs = helper.suite_font_dirs()
reg, calls = {}, []
def qv(k, n):
    if n in reg: return (reg[n], 1)
    raise FileNotFoundError(n)
sys.modules['winreg'] = types.SimpleNamespace(HKEY_CURRENT_USER=1, REG_SZ=1, CreateKey=lambda *x: object(), CloseKey=lambda k: None,
    QueryValueEx=qv, SetValueEx=lambda k, n, r, t, v: reg.__setitem__(n, v))
sys.modules['ctypes'] = types.SimpleNamespace(windll=types.SimpleNamespace(user32=types.SimpleNamespace(SendMessageTimeoutW=lambda *x: calls.append(1))))
os.environ['LOCALAPPDATA'] = a['la']
runs = []
for ds in a['cases']:
    ok = helper.ensure_suite_fonts(ds)
    runs.append([ok, dict(reg), len(calls)])
print(json.dumps({'dirs': dirs, 'runs': runs}))
`;

test('차등: SUITE 폰트 — 후보 폴더 목록이 같고, SUITE-*.otf 만 설치(Wanted 가변폰트 제외), 7종 다 되면 true', async () => {
  const fd = (name, files) => { const d = path.join(TMP, 'fsrc', name); fs.mkdirSync(d, { recursive: true }); for (const f of files) fs.writeFileSync(path.join(d, f), name + ':' + f); return d; };
  const names = W.SUITE_FONTS.map((f) => f[0]);
  const empty = fd('empty', []), part = fd('part', names.slice(0, 3).concat(['WantedSansVariable.ttf'])), full = fd('full', names.concat(['WantedSansVariable.ttf']));
  const cases = [[empty], [part], [path.join(TMP, 'fsrc', 'nope'), part, full], [part, full]];
  const laP = path.join(TMP, 'la-py'), laN = path.join(TMP, 'la-node');
  const py = await pyAsync(PY_FONTS, { src: HELPER_SRC, la: laP, cases });
  // 후보 폴더: 헬퍼 옆 fonts → %LOCALAPPDATA%\WNS_Helper\fonts → R: → \\10.10.105.25\cg (R: 와 같은 곳)
  assert.deepEqual(py.dirs.slice(1), T.defaultFontsCandidates().slice(1));
  assert.deepEqual(py.dirs.slice(2), ['R:\\[F]_Util\\WNS\\fonts', '\\\\10.10.105.25\\cg\\[F]_Util\\WNS\\fonts']);
  assert.equal(py.dirs[0], HELPER_SRC + '\\fonts');
  assert.equal(T.defaultFontsCandidates()[0], path.join(__dirname, '..', 'helper', 'fonts'));
  assert.deepEqual(W.DEFAULT_FONTS_DIRS, T.defaultFontsCandidates());
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8'), /defaultFontsCandidates\(__dirname\)/);   // 데스크톱 셸도 같은 목록
  const reg = new Map();
  let bc = 0;
  const o = { localAppData: laN, regQuery: async (k, n) => (reg.has(n) ? reg.get(n) : null), regSet: async (k, n, v) => { reg.set(n, v); }, broadcast: async () => { bc++; } };
  const norm = (obj, la) => JSON.parse(JSON.stringify(obj).split(JSON.stringify(la).slice(1, -1)).join('<LA>'));
  for (let i = 0; i < cases.length; i++) {
    const ok = await W.ensureSuiteFonts(cases[i], o);
    assert.deepEqual([ok, norm(Object.fromEntries(reg), laN), bc], [py.runs[i][0], norm(py.runs[i][1], laP), py.runs[i][2]], 'case ' + i);
  }
  assert.deepEqual(py.runs.map((x) => x[0]), [false, false, true, true]);
  assert.deepEqual(py.runs.map((x) => x[2]), [0, 1, 2, 2]);   // 바뀐 게 없으면 브로드캐스트 안 함
  const fP = path.join(laP, 'Microsoft', 'Windows', 'Fonts'), fN = path.join(laN, 'Microsoft', 'Windows', 'Fonts');
  assert.deepEqual(tree(fN), tree(fP));
  assert.deepEqual(fs.readdirSync(fN).sort(), names.slice().sort());   // WantedSansVariable.ttf 없음
  assert.equal(fs.readFileSync(path.join(fN, names[0]), 'utf8'), 'part:' + names[0]);   // 앞 후보 우선
  assert.equal(fs.readFileSync(path.join(fN, names[6]), 'utf8'), 'full:' + names[6]);
});

// 원본 폴더 확인을 기록·지연시키는 파이썬 쪽(os.path.isdir/exists 를 감싸 mark 아래 경로만 기록, slow 는 10초 멈춤)
const PY_FONTS2 = String.raw`
import sys, json, os, types, time
a = json.loads(sys.stdin.read())
sys.path.insert(0, a['src'])
import helper
reg = {}
def qv(k, n):
    if n in reg: return (reg[n], 1)
    raise FileNotFoundError(n)
sys.modules['winreg'] = types.SimpleNamespace(HKEY_CURRENT_USER=1, REG_SZ=1, CreateKey=lambda *x: object(), CloseKey=lambda k: None,
    QueryValueEx=qv, SetValueEx=lambda k, n, r, t, v: reg.__setitem__(n, v))
sys.modules['ctypes'] = types.SimpleNamespace(windll=types.SimpleNamespace(user32=types.SimpleNamespace(SendMessageTimeoutW=lambda *x: None)))
os.environ['LOCALAPPDATA'] = a['la']
default_probe = helper.FONT_PROBE_SEC
helper.FONT_PROBE_SEC = a['probe']
seen = []
isdir0, exists0 = os.path.isdir, os.path.exists
def isdir(p):
    if str(p).startswith(a['mark']):
        seen.append(['isdir', p])
        if p == a['slow']: time.sleep(10)
    return isdir0(p)
def exists(p):
    if str(p).startswith(a['mark']): seen.append(['exists', p])
    return exists0(p)
os.path.isdir, os.path.exists = isdir, exists
fd = os.path.join(a['la'], 'Microsoft', 'Windows', 'Fonts')
runs = []
for c in a['cases']:
    for f in c['rm']: os.remove(os.path.join(fd, f))
    seen.clear()
    t0 = time.time()
    ok = helper.ensure_suite_fonts(c['dirs'])
    runs.append({'ok': ok, 'ms': (time.time() - t0) * 1000, 'seen': list(seen), 'reg': dict(reg), 'files': sorted(os.listdir(fd))})
print(json.dumps({'default': default_probe, 'runs': runs}))
`;

test('차등: SUITE 폰트 — 이미 설치된 폰트는 원본(네트워크)을 보지 않고 true, 원본 폴더 확인은 시간 한도·폴더마다 한 번·확인 중이면 재사용', async () => {
  const names = W.SUITE_FONTS.map((f) => f[0]);
  const full = path.join(TMP, 'fsrc2', 'full');
  fs.mkdirSync(full, { recursive: true });
  for (const f of names) fs.writeFileSync(path.join(full, f), 'full2:' + f);
  const mark = path.join(TMP, 'fmark'), slow = path.join(mark, 'slow-unc'), nope = path.join(mark, 'nope');
  const cases = [
    { rm: [], dirs: [full] },                       // 0: 처음 설치
    { rm: [], dirs: [nope] },                       // 1: 다 설치됨 + 원본 없음 → true, 원본 확인 0번 (예전엔 false)
    { rm: [names[6]], dirs: [slow, full] },          // 2: 하나 빠짐 → 닿지 않는 폴더는 시간 한도 뒤 건너뛰고 다음 후보에서
    { rm: [names[6]], dirs: [slow] },                // 3: 앞 확인이 아직 안 끝남 → 새로 확인하지 않고 기다림(한도 뒤 false)
    { rm: [names[0]], dirs: [nope, full] },          // 4: 두 개 빠짐(0·6) — 없는 폴더는 한 번만 확인
  ];
  const laP = path.join(TMP, 'la2-py'), laN = path.join(TMP, 'la2-node');
  const py = await pyAsync(PY_FONTS2, { src: HELPER_SRC, la: laP, cases, mark, slow, probe: 0.5 });
  assert.equal(py.default * 1000, W.FONT_PROBE_MS);
  assert.equal(W.FONT_PROBE_MS, 3000);
  const reg = new Map(), seen = [];
  const o = { localAppData: laN, regQuery: async (k, n) => (reg.has(n) ? reg.get(n) : null), regSet: async (k, n, v) => { reg.set(n, v); }, broadcast: async () => {},
    probeMs: 500,
    stat: (d) => {
      if (d.startsWith(mark)) seen.push(['isdir', d]);
      if (d === slow) return new Promise((resolve) => { setTimeout(resolve, 10000, { isDirectory: () => true }).unref(); });
      return fs.promises.stat(d);
    },
    exists: (p) => { if (p.startsWith(mark)) seen.push(['exists', p]); return fs.promises.access(p).then(() => true, () => false); } };
  const fN = path.join(laN, 'Microsoft', 'Windows', 'Fonts');
  const norm = (obj, la) => JSON.parse(JSON.stringify(obj).split(JSON.stringify(la).slice(1, -1)).join('<LA>'));
  for (let i = 0; i < cases.length; i++) {
    for (const f of cases[i].rm) fs.rmSync(path.join(fN, f));
    seen.length = 0;
    const t0 = Date.now();
    const ok = await W.ensureSuiteFonts(cases[i].dirs, o);
    const ms = Date.now() - t0;
    const p = py.runs[i];
    assert.deepEqual([ok, seen, norm(Object.fromEntries(reg), laN), fs.readdirSync(fN).sort()], [p.ok, p.seen, norm(p.reg, laP), p.files], 'case ' + i);
    assert.ok(ms < 3000 && p.ms < 3000, 'case ' + i + ' 시간 ' + ms + '/' + p.ms);   // 10초 멈춘 확인을 기다리지 않음
  }
  assert.deepEqual(py.runs.map((r) => r.ok), [true, true, true, false, true]);
  assert.deepEqual(py.runs.map((r) => r.seen), [[], [], [['isdir', slow]], [], [['isdir', nope]]]);
  assert.ok(py.runs[2].ms >= 400 && py.runs[3].ms >= 400);   // 한도(0.5초)까지는 기다림
  assert.equal(fs.readFileSync(path.join(fN, names[6]), 'utf8'), 'full2:' + names[6]);
});
