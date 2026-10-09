'use strict';
// 공공데이터포털 받기(desktop/data-fetch.js) — 네트워크 없이 로컬 http 서버로 본다.
// 실제 포털의 모양(2026-10-10 실측): 새 연결의 첫 요청 약 1/3이 30초 넘게 멈춤(504/503 SERVICETIMEOUT), 다시 쓴 연결은 안 멈춤.
// 여기서는 그 모양을 흉내 내 연결 재사용·늦은 새 연결에 하나 더 보내기·첫 응답 시간 제한·본문 멈춤·크기 상한·끊긴 재사용 소켓·허용 주소를 확인한다.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { createDataFetcher, dataPortalUrl } = require('../data-fetch');

const OK_BODY = JSON.stringify({ response: { header: { resultCode: '00' }, body: { items: [{ a: 1 }], totalCount: 1 } } });
const GW_TIMEOUT = JSON.stringify({ OpenAPI_ServiceResponse: { cmmMsgHeader: { errMsg: 'SERVICETIMEOUT_ERROR', returnAuthMsg: '서비스 연결실패 에러', returnReasonCode: '05' } } });

// plan(req, info) → 'ok' | 'stall' | 'destroy' | 'slow:<ms>' | 'head-only' | 'big' | '504'. info = { conn(연결 번호), nth(그 연결의 몇 번째 요청) }
async function withServer(plan, fn) {
  let conn = 0;
  const log = [];
  const sockets = new Set();
  const srv = http.createServer((req, res) => {
    const s = req.socket;
    if (!s.wcgId) { s.wcgId = ++conn; s.wcgN = 0; }
    s.wcgN++;
    const info = { conn: s.wcgId, nth: s.wcgN };
    const p = plan(req, info);
    log.push({ ...info, p, url: req.url, ua: req.headers['user-agent'] });
    if (p === 'stall') return;   // 답하지 않는다(포털 게이트웨이 흉내)
    if (p === 'destroy') { s.destroy(); return; }
    if (p === 'head-only') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.write('{'); return; }
    if (p === 'big') { res.writeHead(200, { 'Content-Length': String(10 << 20) }); res.write('x'); return; }
    if (p === '504') { res.writeHead(504, { 'Content-Type': 'application/json;charset=UTF-8' }); res.end(GW_TIMEOUT); return; }
    const send = () => { res.writeHead(200, { 'Content-Type': 'application/json;charset=UTF-8' }); res.end(OK_BODY); };
    if (/^slow:/.test(p)) setTimeout(send, +p.slice(5)); else send();
  });
  srv.keepAliveTimeout = 60000;
  srv.on('connection', (s) => { sockets.add(s); s.on('close', () => sockets.delete(s)); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}/B552584/Svc/getOp?serviceKey=TEST-ONLY&x=1`;
  try { return await fn({ base, log, sockets }); } finally {
    for (const s of sockets) s.destroy();
    await new Promise((r) => srv.close(r));
  }
}
const local = (o = {}) => createDataFetcher({ module: http, allow: (u) => (/^http:\/\/127\.0\.0\.1:\d+\//.test(u) ? u : null), hedgeMs: 150, ...o });

test('허용 주소 — https://apis.data.go.kr/<기관>/<서비스>/<오퍼레이션>?… 만', () => {
  const ok = 'https://apis.data.go.kr/B552584/ArpltnStatsSvc/getCtprvnMesureSidoLIst?serviceKey=TEST-ONLY%2B%3D&sidoName=%EC%84%9C%EC%9A%B8';
  assert.equal(dataPortalUrl(ok), ok, '글자 그대로(키 인코딩을 다시 만지지 않는다)');
  assert.ok(dataPortalUrl('https://apis.data.go.kr/1360000/LivingWthrIdxServiceV5/getUVIdxV5?time=2026101006'));
  for (const bad of ['http://apis.data.go.kr/B552584/ArpltnStatsSvc/getCtprvnMesureSidoLIst', 'https://apis.data.go.kr.evil.example/B552584/A/b',
    'https://data.go.kr/B552584/A/b', 'https://www.data.go.kr/B552584/A/b', 'https://apis.data.go.kr:8443/B552584/A/b', 'https://u:p@apis.data.go.kr/B552584/A/b',
    'https://apis.data.go.kr/B552584/A/b#x', 'https://apis.data.go.kr/B552584/A', 'https://apis.data.go.kr/B552584/A/b/c', 'https://apis.data.go.kr/B552584/../A/b',
    'https://apis.data.go.kr/B552584/A/b.json', 'https://apis.data.go.kr/B552584/A/b ?x', 'https://apis.data.go.kr\\B552584/A/b', '', null, 'x'.repeat(5000)]) {
    assert.equal(dataPortalUrl(bad), null, String(bad).slice(0, 80));
  }
});

test('거절·프록시 PC는 요청을 보내지 않는다', async () => {
  await withServer(() => 'ok', async ({ base, log }) => {
    const f = local();
    try {
      assert.deepEqual(await f.fetch('https://evil.example/B/A/b'), { ok: false, err: 'denied', sent: 0, ms: 0 });
      const px = local({ proxyFor: async () => true });
      assert.equal((await px.fetch(base)).err, 'proxy'); px.close();
      const pxErr = local({ proxyFor: async () => { throw new Error('reg'); } });
      assert.equal((await pxErr.fetch(base)).ok, true, '프록시 판정이 실패하면 그냥 받는다'); pxErr.close();
      assert.equal(log.length, 1);
    } finally { f.close(); }
  });
});

test('연결을 다시 쓴다 — 두 번째 요청은 같은 연결(keep-alive), UA는 파이썬 기본', async () => {
  await withServer(() => 'ok', async ({ base, log }) => {
    const f = local();
    try {
      const a = await f.fetch(base, { timeoutMs: 2000 }), b = await f.fetch(base, { timeoutMs: 2000 });
      assert.equal(a.ok && b.ok, true);
      assert.equal(a.status, 200); assert.equal(a.text, OK_BODY);
      assert.equal(b.reused, true, '두 번째는 다시 쓴 연결');
      assert.deepEqual(log.map((x) => x.conn), [1, 1]);
      assert.equal(log[0].ua, 'Python-urllib/3.13');
    } finally { f.close(); }
  });
});

test('새 연결이 멈추면 다른 연결로 하나 더 보내 먼저 온 것을 쓰고, 멈춘 연결은 끊는다', async () => {
  await withServer((req, i) => (i.conn === 1 ? 'stall' : 'ok'), async ({ base, log, sockets }) => {
    const f = local();
    try {
      const t0 = Date.now();
      const r = await f.fetch(base, { timeoutMs: 5000 });
      assert.equal(r.ok, true); assert.equal(r.sent, 2);
      assert.ok(Date.now() - t0 < 1500, '5초를 기다리지 않는다: ' + (Date.now() - t0));
      await new Promise((res) => setTimeout(res, 50));
      assert.equal([...sockets].some((s) => s.wcgId === 1), false, '멈춘 연결은 닫았다');
      assert.equal(log.length, 2);
    } finally { f.close(); }
  });
});

test('처음 것과 하나 더 보낸 것이 다 멈추면 두 번째로 더 보낸 것을 쓴다(셋까지)', async () => {
  await withServer((req, i) => (i.conn <= 2 ? 'stall' : 'ok'), async ({ base, log }) => {
    const f = local();
    try {
      const t0 = Date.now();
      const r = await f.fetch(base, { timeoutMs: 5000 });
      assert.equal(r.ok, true); assert.equal(r.sent, 3); assert.ok(Date.now() - t0 < 1500);
      assert.equal(log.length, 3);
      assert.equal((await f.fetch(base, { timeoutMs: 5000 })).reused, true, '이긴 연결은 다시 쓴다');
    } finally { f.close(); }
  });
});

test('다시 쓴 연결은 늦어도 하나 더 보내지 않는다(멈추지 않으므로) — 느린 응답은 시간 제한 안이면 받는다', async () => {
  await withServer((req, i) => (i.nth === 2 ? 'slow:400' : 'ok'), async ({ base, log }) => {
    const f = local();
    try {
      await f.fetch(base);
      const r = await f.fetch(base, { timeoutMs: 3000 });
      assert.equal(r.ok, true); assert.equal(r.sent, 1); assert.equal(r.reused, true);
      assert.equal(log.length, 2);
    } finally { f.close(); }
  });
});

test('첫 응답 시간 제한 — 모두 멈추면 timeout(하나 더 보낸 것까지), 상태 504 본문은 그대로 넘긴다', async () => {
  await withServer(() => 'stall', async ({ base, log }) => {
    const f = local();
    try {
      const t0 = Date.now();
      const r = await f.fetch(base, { timeoutMs: 600 });
      assert.equal(r.ok, false); assert.equal(r.err, 'timeout'); assert.equal(r.sent, 3, '처음 것 + 하나 더 2번(150·300ms)');
      assert.ok(Date.now() - t0 < 2000);
      const n = log.length;
      const r2 = await f.fetch(base, { timeoutMs: 600, hedgeMs: 0 });
      assert.equal(r2.err, 'timeout'); assert.equal(log.length, n + 1, 'hedgeMs 0 이면 하나만');
    } finally { f.close(); }
  });
  await withServer(() => '504', async ({ base }) => {
    const f = local();
    try {
      const r = await f.fetch(base);
      assert.equal(r.ok, true); assert.equal(r.status, 504); assert.match(r.text, /SERVICETIMEOUT_ERROR/);
    } finally { f.close(); }
  });
});

test('본문이 멈추면 timeout, 너무 크면 too-big', async () => {
  await withServer(() => 'head-only', async ({ base }) => {
    const f = local({ bodyIdleMs: 300 });
    try { const r = await f.fetch(base, { timeoutMs: 2000 }); assert.equal(r.err, 'timeout'); assert.equal(r.stage, 'body'); } finally { f.close(); }
  });
  await withServer(() => 'big', async ({ base }) => {
    const f = local({ maxBytes: 1 << 20 });
    try { assert.equal((await f.fetch(base)).err, 'too-big'); } finally { f.close(); }
  });
});

test('다시 쓴 연결이 곧바로 끊기면(서버가 놀던 연결을 닫음) 새 연결로 바로 다시', async () => {
  await withServer((req, i) => (i.nth === 2 ? 'destroy' : 'ok'), async ({ base, log }) => {
    const f = local();
    try {
      await f.fetch(base);
      const r = await f.fetch(base, { timeoutMs: 2000 });
      assert.equal(r.ok, true); assert.equal(r.sent, 2);
      assert.deepEqual(log.map((x) => [x.conn, x.nth]), [[1, 1], [1, 2], [2, 1]]);
    } finally { f.close(); }
  });
});

test('연결 실패는 net(키가 든 주소를 오류 글에 싣지 않는다)', async () => {
  const f = local();
  try {
    const r = await f.fetch('http://127.0.0.1:9/B552584/Svc/getOp?serviceKey=TEST-ONLY-SECRET', { timeoutMs: 2000 });
    assert.equal(r.ok, false); assert.equal(r.err, 'net');
    assert.ok(!JSON.stringify(r).includes('TEST-ONLY-SECRET'));
  } finally { f.close(); }
});

test('배선 — main.js: 메인 창 주 프레임만·점검 모드는 WCG_TEST_DATA_FETCH=1 때만 · preload: dataFetch', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
  const h = main.slice(main.indexOf("ipcMain.handle('wcg:data-fetch'"));
  assert.match(h, /if \(!privateKeyCallerOk\(e, win\)\) return \{ ok: false, err: 'denied', detail: 'sender' \};/);
  assert.match(h, /if \(TEST_MODE && process\.env\.WCG_TEST_DATA_FETCH !== '1'\) return \{ ok: false, err: 'off' \};/);
  assert.match(main, /proxyFor: async \(\) => \{ const cfg = await PU\.systemProxyConfig\(\);/);
  assert.match(main, /dataFetcher && dataFetcher\.close\(\)/);
  const pre = fs.readFileSync(path.join(__dirname, '..', 'preload.js'), 'utf8');
  assert.match(pre, /dataFetch: \(u, o\) => ipcRenderer\.invoke\('wcg:data-fetch', String\(u \|\| ''\), \{ timeoutMs: Math\.floor\(\+\(o && o\.timeoutMs\)\) \|\| 0 \}\),/);
});
