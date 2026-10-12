'use strict';
// 내장 헬퍼 기상청 받기 빠른 길(GET /api/kma — 10-12 '특보 없을 때 기상청 응답이 너무 늦어요') 시험 — node --test test/server-kma.test.cjs
// 기상청 apihub 는 가끔 요청 하나를 응답 없이 붙잡는다(30초 뒤 504). 여기서는 로컬 가짜 기상청 서버로 그 모양을 흉내 내
// 연결 재사용·늦으면 다른 연결로 하나 더·5xx면 한 번 더·본문 끊김이면 다시·전체 시간 제한·앱이 떠나면 끊기·넘겨주기·프록시 PC는 옛 길을 본다.
// 진짜 기상청 주소 모양(https://apihub.kma.go.kr/…)은 kmaFastUrl 단위 시험으로, 로컬 서버는 http + 이름 풀기(lookup)로 apihub.kma.go.kr → 127.0.0.1.
// 옛 길(urllib 흉내)·파이썬 헬퍼와의 차등 시험은 server.test.cjs 그대로다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const net = require('net');

const W = require('../wns/server.js');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'wns-kma-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const EUCKR = Buffer.from([0x23, 0x53, 0x54, 0x41, 0x52, 0x54, 0x37, 0x37, 0x37, 0x37, 0x0a, 0x23, 0x20, 0xC7, 0xD1, 0xB1, 0xDB, 0x0a]);   // "#START7777\n# 한글\n"
const EUCKR_TEXT = '#START7777\n# 한글\n';

// 가짜 기상청. plan(req, info) → 'ok' | 'stall' | '504' | '503' | '401' | 'slowbody' | 'cut' | 'redirect:<경로>' | 'destroy'
// info = { conn(연결 번호), nth(그 연결의 몇 번째), n(전체 몇 번째) }
async function upstream(plan) {
  let conn = 0, n = 0;
  const log = [], sockets = new Set();
  const srv = http.createServer((req, res) => {
    const s = req.socket;
    if (!s.wcgId) { s.wcgId = ++conn; s.wcgN = 0; }
    s.wcgN++; n++;
    const info = { conn: s.wcgId, nth: s.wcgN, n };
    const p = plan(req, info);
    log.push({ ...info, p, url: req.url, ua: req.headers['user-agent'], connection: req.headers.connection });
    if (p === 'stall') return;
    if (p === 'destroy') { s.destroy(); return; }
    if (p === '504' || p === '503') { res.writeHead(+p, { 'Content-Length': '0' }); res.end(); return; }
    if (p === '401') { res.writeHead(401, 'Unauthorized', { 'Content-Type': 'application/json' }); res.end('{"result":{"status":401}}'); return; }
    if (p.startsWith('redirect:')) { res.writeHead(302, { Location: p.slice(9), 'Content-Length': '0' }); res.end(); return; }
    if (p === 'cut') { res.writeHead(200, { 'Content-Length': '1000' }); res.write(EUCKR.subarray(0, 5)); setTimeout(() => s.destroy(), 20); return; }
    if (p === 'slowbody') {   // 머리는 바로, 본문은 0.1초 간격 조각 8개(합 0.8초) — 하나 더 보내지 않고 끝까지 받아야 한다
      res.writeHead(200, { 'Content-Type': 'text/plain;charset=EUC-KR' });
      let i = 0;
      const tick = () => { if (i < 7) { res.write(Buffer.from('#' + i + '\n')); i++; setTimeout(tick, 100); } else res.end(EUCKR); };
      tick();
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/plain;charset=EUC-KR', 'Content-Length': String(EUCKR.length) });
    res.end(EUCKR);
  });
  srv.keepAliveTimeout = 60000;
  srv.on('connection', (s) => { sockets.add(s); s.on('close', () => sockets.delete(s)); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  return {
    port, log, sockets,
    url: (p = '/api/typ01/url/wrn_now_data.php?fe=e&tm=&authKey=TEST-ONLY') => 'http://apihub.kma.go.kr:' + port + p,
    close: async () => { for (const s of sockets) s.destroy(); await new Promise((r) => srv.close(r)); },
  };
}
// 이름 풀기 — apihub.kma.go.kr 를 로컬로(진짜 기상청에 안 감)
const lookup = (host, o, cb) => (o && o.all ? cb(null, [{ address: '127.0.0.1', family: 4 }]) : cb(null, '127.0.0.1', 4));
// 시험용 헬퍼: 로컬 http 를 빠른 길로(진짜는 https 만), 하나 더 0.15·0.3초, 전체 한도 1.5초
async function helper(o = {}) {
  const logs = [];
  const srv = W.createWnsServer({
    framesDir: path.join(TMP, 'frames'), fontsInstall: false, aeDryRun: true, log: (m) => logs.push(m),
    kmaModule: http, kmaFast: (u) => (/^http:\/\/apihub\.kma\.go\.kr:\d+\/[\x21-\x7e]*$/.test(u) ? u : null), kmaAgentOptions: { lookup },
    kmaHedgeAt: [150, 300], kmaTimeout: 1500, kmaProxyConfig: { env: {}, proxies: {} }, ...o,
  });
  const port = await srv.listen(0);
  const get = async (u, init) => {
    const t0 = Date.now();
    const r = await fetch('http://127.0.0.1:' + port + '/api/kma?u=' + encodeURIComponent(u), init);
    const text = await r.text();
    return { status: r.status, text, ms: Date.now() - t0, sent: r.headers.get('x-wcg-kma-sent'), mark: r.headers.get('x-wcg-kma'), expose: r.headers.get('access-control-expose-headers') };
  };
  return { srv, port, get, logs, close: () => srv.close() };
}

test.after(() => fs.rmSync(TMP, { recursive: true, force: true }));

test('kmaFastUrl — 진짜 기상청 주소는 빠른 길, Node 와 urllib 이 다르게 보낼 수 있는 주소는 옛 길', () => {
  const ok = ['https://apihub.kma.go.kr/api/typ01/url/wrn_now_data.php?fe=e&tm=&disp=0&help=1&authKey=AbC-_9',
    'https://apihub.kma.go.kr/api/typ01/url/wrn_met_data.php?reg=0&wrn=A&tmfc1=202610110000&tmfc2=202610112359&disp=0&help=1&authKey=a%2Bb',
    'https://apihub.kma.go.kr/api/typ01/url/typ_now.php?tm=202610121200&mode=1&disp=1&help=0&authKey=x',
    'https://www.kma.go.kr/w/forecast/overall/short-term.do', 'https://www.weather.go.kr/w/forecast/overall/short-term.do',
    'https://apis.data.go.kr/B552584/ArpltnStatsSvc/getCtprvnMesureSidoLIst?serviceKey=a%2B%3D&sidoName=%EC%84%9C%EC%9A%B8&returnType=json', 'https://apihub.kma.go.kr/'];
  for (const u of ok) assert.equal(W.kmaFastUrl(u), u, u);
  const bad = ['http://apihub.kma.go.kr/x', 'https://apihub.kma.go.kr:443/x', 'https://APIHUB.KMA.GO.KR/x', 'HTTPS://apihub.kma.go.kr/x', 'https://apihub.kma.go.kr',
    'https://user@apihub.kma.go.kr/x', 'https://apihub.kma.go.kr/a b', 'https://apihub.kma.go.kr/한글', 'https://apihub.kma.go.kr/x#f', 'https://apihub.kma.go.kr/a/../b',
    'https://apihub.kma.go.kr/a/%2e%2E/b', 'https://apihub.kma.go.kr/./x', 'https://apihub.kma.go.kr/x?a=%ZZ', 'https://apihub.kma.go.kr/x?a="q"', "https://apihub.kma.go.kr/x?a='q'",
    'https://apihub.kma.go.kr/x?a=<b>', 'https://apihub.kma.go.kr\\@evil.com/', 'https://apihub.kma.go.kr/x\t', ' https://apihub.kma.go.kr/x', 'https://[::1]/x', 'https://1.2.3.4/x'.replace('1.2.3.4', ''),
    '', null, 42, 'https://apihub.kma.go.kr/' + 'x'.repeat(9000)];
  for (const u of bad) assert.equal(W.kmaFastUrl(u), null, String(u).slice(0, 80));
});

test('kmaFailText — 웹앱 판정(wrnHttpFail)이 읽는 urllib 문구', () => {
  assert.equal(W.kmaFailText({ err: 'status', status: 504, reason: 'Gateway Time-out ' }), 'HTTP Error 504: Gateway Time-out');
  assert.equal(W.kmaFailText({ err: 'timeout', stage: 'head', connected: true }), 'The read operation timed out');
  assert.equal(W.kmaFailText({ err: 'timeout', stage: 'head', connected: false }), '<urlopen error timed out>');
  assert.equal(W.kmaFailText({ err: 'timeout', stage: 'body' }), 'The read operation timed out');
  assert.equal(W.kmaFailText({ err: 'net', code: 'ENOTFOUND', detail: 'ENOTFOUND' }), '<urlopen error [Errno 11001] getaddrinfo failed>');
  assert.match(W.kmaFailText({ err: 'net', code: 'ECONNREFUSED', detail: 'ECONNREFUSED' }), /^<urlopen error \[WinError 10061\] /);
  assert.equal(W.kmaFailText({ err: 'net', stage: 'body', detail: 'closed' }), 'IncompleteRead(본문이 중간에 끊김)');
});

test('정상 — EUC-KR 을 파이썬처럼 풀어 UTF-8 글로, 표시 머리글(X-WCG-Kma·보낸 수·Expose), 두 번째는 같은 연결(keep-alive)', async () => {
  const up = await upstream(() => 'ok');
  const h = await helper();
  try {
    const a = await h.get(up.url());
    assert.equal(a.status, 200); assert.equal(a.text, EUCKR_TEXT);
    assert.equal(a.mark, 'hedge'); assert.equal(a.sent, '1'); assert.equal(a.expose, 'X-WCG-Kma, X-WCG-Kma-Sent');
    const b = await h.get(up.url());
    assert.equal(b.text, EUCKR_TEXT);
    assert.deepEqual(up.log.map((x) => [x.conn, x.nth]), [[1, 1], [1, 2]], '두 번째는 다시 쓴 연결');
    assert.equal(up.log[0].ua, 'Python-urllib/3.13');
    assert.notEqual(up.log[0].connection, 'close', '연결을 닫지 않는다(urllib 은 Connection: close)');
    const ping = await fetch('http://127.0.0.1:' + h.port + '/ping');
    assert.equal(ping.headers.get('x-wcg-kma'), 'hedge', '/ping 에도 표시(앱이 미리 안다)');
    assert.equal(ping.headers.get('access-control-expose-headers'), 'X-WCG-Kma, X-WCG-Kma-Sent');
    assert.equal(h.logs.length, 0, '한 번에 받으면 기록 안 함');
  } finally { await h.close(); await up.close(); }
});

test('새 연결 첫 요청이 멈추면 0.15초 뒤 다른 연결로 하나 더 — 먼저 온 것을 쓰고 멈춘 연결은 끊는다', async () => {
  const up = await upstream((req, i) => (i.n === 1 ? 'stall' : 'ok'));
  const h = await helper();
  try {
    const r = await h.get(up.url());
    assert.equal(r.status, 200); assert.equal(r.text, EUCKR_TEXT); assert.equal(r.sent, '2');
    assert.ok(r.ms < 1000, '전체 한도(1.5초)를 기다리지 않는다: ' + r.ms);
    await sleep(50);
    assert.equal([...up.sockets].some((s) => s.wcgId === 1), false, '멈춘 연결은 닫았다');
    assert.equal(up.log.length, 2);
    assert.ok(h.logs.some((m) => /2번 보냄/.test(m)) && !h.logs.some((m) => /TEST-ONLY/.test(m)), '기록에 보낸 수만(인증키 든 주소는 안 실음)');
  } finally { await h.close(); await up.close(); }
});

test('처음 것·하나 더 보낸 것이 다 멈추면 두 번째로 더 보낸 것(0.3초)을 쓴다', async () => {
  const up = await upstream((req, i) => (i.n <= 2 ? 'stall' : 'ok'));
  const h = await helper();
  try {
    const r = await h.get(up.url());
    assert.equal(r.status, 200); assert.equal(r.sent, '3'); assert.ok(r.ms < 1000, String(r.ms));
  } finally { await h.close(); await up.close(); }
});

test('다시 쓴 연결이 늦어도 하나 더 보낸다(apihub 는 다시 쓴 연결도 붙잡힌다 — 10-12 실측 89건 중 4건)', async () => {
  const up = await upstream((req, i) => (i.n === 2 ? 'stall' : 'ok'));
  const h = await helper();
  try {
    await h.get(up.url());
    const r = await h.get(up.url());
    assert.equal(r.status, 200); assert.equal(r.sent, '2');
    assert.deepEqual(up.log.map((x) => [x.conn, x.nth]).slice(0, 2), [[1, 1], [1, 2]]);
  } finally { await h.close(); await up.close(); }
});

test('5xx 는 남은 시간 안에 한 번 더 — 그래도 5xx 면 urllib 문구 502(웹앱: 기상청 서버 오류)', async () => {
  const up = await upstream((req, i) => (i.n === 1 ? '504' : 'ok'));
  const h = await helper();
  try {
    const r = await h.get(up.url());
    assert.equal(r.status, 200); assert.equal(r.text, EUCKR_TEXT); assert.equal(r.sent, '2');
  } finally { await h.close(); await up.close(); }
  const up2 = await upstream(() => '504');
  const h2 = await helper();
  try {
    const r = await h2.get(up2.url());
    assert.equal(r.status, 502); assert.equal(r.text, '{"ok": false, "error": "HTTP Error 504: Gateway Timeout"}');
    assert.equal(up2.log.length, 2, '처음 + 한 번 더');
  } finally { await h2.close(); await up2.close(); }
});

test('4xx(인증키·한도)는 다시 보내지 않고 urllib 문구 그대로', async () => {
  const up = await upstream(() => '401');
  const h = await helper();
  try {
    const r = await h.get(up.url());
    assert.equal(r.status, 502); assert.equal(r.text, '{"ok": false, "error": "HTTP Error 401: Unauthorized"}');
    assert.equal(up.log.length, 1);
  } finally { await h.close(); await up.close(); }
});

test('느린 본문은 머리가 왔으면 하나 더 보내지 않고 끝까지 받는다', async () => {
  const up = await upstream(() => 'slowbody');
  const h = await helper();
  try {
    const r = await h.get(up.url());
    assert.equal(r.status, 200); assert.equal(r.sent, '1');
    assert.ok(r.text.endsWith(EUCKR_TEXT) && r.text.startsWith('#0\n#1\n'), r.text.slice(0, 40));
    assert.equal(up.log.length, 1);
  } finally { await h.close(); await up.close(); }
});

test('본문이 중간에 끊기면 다시 받는다', async () => {
  const up = await upstream((req, i) => (i.n === 1 ? 'cut' : 'ok'));
  const h = await helper();
  try {
    const r = await h.get(up.url());
    assert.equal(r.status, 200); assert.equal(r.text, EUCKR_TEXT); assert.equal(r.sent, '2');
  } finally { await h.close(); await up.close(); }
});

test('모두 멈추면 전체 한도(처음 보낸 때부터)에서 끊고 시간 초과 문구 — 웹앱: 기상청 응답이 너무 늦어요', async () => {
  const up = await upstream(() => 'stall');
  const h = await helper();
  try {
    const r = await h.get(up.url());
    assert.equal(r.status, 502); assert.equal(r.text, '{"ok": false, "error": "The read operation timed out"}');
    assert.ok(r.ms >= 1400 && r.ms < 2300, '한도 1.5초: ' + r.ms);
    assert.equal(up.log.length, 3, '처음 + 하나 더 2번');
    await sleep(50);
    assert.equal(up.sockets.size, 0, '멈춘 연결을 모두 닫았다');
  } finally { await h.close(); await up.close(); }
});

test('앱이 기다리다 떠나면(요청 취소) 남은 시도를 끊고 더 보내지 않는다', async () => {
  const up = await upstream(() => 'stall');
  const h = await helper();
  try {
    const ac = new AbortController();
    setTimeout(() => ac.abort(), 200);   // 0.15초에 하나 더 보낸 뒤
    await assert.rejects(h.get(up.url(), { signal: ac.signal }));
    await sleep(400);   // 0.3초 '하나 더'·1.5초 한도가 지나도
    assert.equal(up.log.length, 2, '취소 뒤엔 보내지 않는다');
    assert.equal(up.sockets.size, 0, '기상청 쪽 연결도 닫았다');
  } finally { await h.close(); await up.close(); }
});

test('넘겨주기(302)는 다음 주소도 빠른 길이면 따라가고, 아니면 옛 길(urllib)로 처음부터', async () => {
  const up = await upstream((req) => (req.url.startsWith('/via') ? 'redirect:/page' : 'ok'));
  const h = await helper();
  try {
    const r = await h.get(up.url('/via'));
    assert.equal(r.status, 200); assert.equal(r.text, EUCKR_TEXT); assert.equal(r.sent, '2');
    assert.deepEqual(up.log.map((x) => x.url), ['/via', '/page']);
  } finally { await h.close(); await up.close(); }
  // 빠른 길 밖 주소로 넘기면 옛 길(urllib 흉내)이 처음 주소부터 — 따라가기·오류 문구가 helper.py 와 같게. 옛 길은 가짜(kmaUrlopen)로 부른 주소만 본다
  const up2 = await upstream(() => 'redirect:javascript:x');
  const calls = [];
  const h2 = await helper({ kmaUrlopen: async (u, o) => { calls.push([u, o.timeout]); return EUCKR; } });
  try {
    const r = await h2.get(up2.url('/via'));
    assert.equal(r.status, 200); assert.equal(r.text, EUCKR_TEXT); assert.equal(r.sent, '2', '빠른 길 1 + 옛 길 1');
    assert.deepEqual(calls, [[up2.url('/via'), 1500]]);
    assert.equal(up2.log.length, 1);
  } finally { await h2.close(); await up2.close(); }
});

test('프록시를 써야 하는 PC면 옛 길 그대로(urllib 흉내 — 프록시로) — 가짜 기상청에는 아무것도 안 감', async () => {
  const up = await upstream(() => 'ok');
  const px = net.createServer((sock) => {   // 절대주소 GET 을 받아 받은 요청줄을 돌려주는 가짜 프록시
    let buf = '';
    sock.on('error', () => {});
    sock.on('data', (d) => {
      buf += d.toString('latin1');
      if (!buf.includes('\r\n\r\n')) return;
      const body = Buffer.from('PROXY ' + buf.split('\r\n')[0], 'latin1');
      sock.end(Buffer.concat([Buffer.from('HTTP/1.1 200 OK\r\nContent-Length: ' + body.length + '\r\n\r\n'), body]));
    });
  });
  await new Promise((r) => px.listen(0, '127.0.0.1', r));
  const pxu = 'http://127.0.0.1:' + px.address().port;
  const h = await helper({ kmaProxyConfig: { env: { http: pxu, https: pxu }, proxies: { http: pxu, https: pxu } } });
  try {
    const r = await h.get(up.url());
    assert.equal(r.status, 200);
    assert.equal(r.text, 'PROXY GET ' + up.url() + ' HTTP/1.1');
    assert.equal(r.sent, '1');
    assert.equal(up.log.length, 0);
  } finally { await h.close(); await up.close(); px.close(); }
});

test('빠른 길 밖 주소(포트·특수 글자 등)는 옛 길 — 오류 문구도 urllib 그대로', async () => {
  const h = await helper({ kmaFast: W.kmaFastUrl });   // 진짜 판정 — http 시험 주소는 모두 옛 길
  try {
    const r = await h.get('https://x.kma.go.kr/a b');
    assert.equal(r.status, 502);
    assert.match(JSON.parse(r.text).error, /control characters|URL can't contain/);
    assert.equal(r.mark, 'hedge');
    const bad = await h.get('https://evil.com/');
    assert.equal(bad.status, 400); assert.equal(bad.mark, 'hedge');
  } finally { await h.close(); }
});
