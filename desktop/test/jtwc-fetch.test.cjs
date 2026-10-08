// 데스크톱 메인의 미해군(JTWC) 받기(desktop/jtwc.js) — 허용 주소 검사와 받기(시간 제한·크기 상한·넘겨주기·브라우저 UA)를 Electron·네트워크 없이 본다.
// 넘겨주기는 세션 문지기(jtwcGuardSession — webRequest)가 막는다: Electron net.fetch는 Response.url을 비워 두기 때문(가짜 세션으로 그 동작을 흉내 냄).
// main.js·preload.js 배선(메인 창 주 프레임만 부를 수 있음·문지기 건 따로 세션의 net.fetch)은 글자로 확인한다. 실제 사이트 받기는 boot-check --eval로 따로 봤다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { jtwcUrl, jtwcFetch, jtwcGuardSession, JTWC_UA } = require('../jtwc.js');

test('허용 주소 — metoc.navy.mil/jtwc 의 rss/jtwc.rss 와 products/xxNNYY.tcw(상대·전체 주소)만', () => {
  const ok = {
    'rss/jtwc.rss': 'https://www.metoc.navy.mil/jtwc/rss/jtwc.rss',
    '/rss/jtwc.rss': 'https://www.metoc.navy.mil/jtwc/rss/jtwc.rss',
    'products/wp2726.tcw': 'https://www.metoc.navy.mil/jtwc/products/wp2726.tcw',
    'products/ep1526.tcw': 'https://www.metoc.navy.mil/jtwc/products/ep1526.tcw',
    'products/sh0527.tcw': 'https://www.metoc.navy.mil/jtwc/products/sh0527.tcw',
    'https://www.metoc.navy.mil/jtwc/products/wp2726.tcw': 'https://www.metoc.navy.mil/jtwc/products/wp2726.tcw',
    'HTTPS://WWW.METOC.NAVY.MIL/jtwc/rss/jtwc.rss': 'https://www.metoc.navy.mil/jtwc/rss/jtwc.rss',   // 스킴·호스트 대소문자는 URL이 정규화
    '  products/io0326.tcw  ': 'https://www.metoc.navy.mil/jtwc/products/io0326.tcw',
  };
  for (const [p, want] of Object.entries(ok)) assert.equal(jtwcUrl(p), want, p);
  const bad = [
    '', null, undefined, 'jtwc.html', 'rss/other.rss', 'products/wp2726web.txt', 'products/wp2726.gif', 'products/wp2726.kmz', 'products/WP2726.TCW',
    'products/wp27261.tcw', 'products/w2726.tcw', 'products/wp2726.tcw?x=1', 'products/wp2726.tcw#a', 'products/../rss/jtwc.rss', '../jtwc/rss/jtwc.rss',
    'products/%2e%2e/rss/jtwc.rss', 'products\\wp2726.tcw', 'products/wp 2726.tcw',
    'http://www.metoc.navy.mil/jtwc/rss/jtwc.rss',                      // https만
    'https://metoc.navy.mil/jtwc/rss/jtwc.rss',                          // 다른 호스트
    'https://www.metoc.navy.mil.evil.example/jtwc/rss/jtwc.rss',
    'https://www.metoc.navy.mil./jtwc/rss/jtwc.rss',                     // 끝 점
    'https://www.metoc.navy.mil:8443/jtwc/rss/jtwc.rss',                 // 포트
    'https://user@www.metoc.navy.mil/jtwc/rss/jtwc.rss',                 // 사용자 정보
    'https://www.metoc.navy.mil@evil.example/jtwc/rss/jtwc.rss',
    'https://s3.amazonaws.com/www.metoc.navy.mil/jtwc/rss/jtwc.rss',
    'https://www.metoc.navy.mil/jtwc/jtwc.html', 'https://www.metoc.navy.mil/jtwc/products/abpwweb.txt',
    'file:///C:/Windows/win.ini', 'app://weathercg/main.js', 'javascript:alert(1)', 'x'.repeat(300),
  ];
  for (const p of bad) assert.equal(jtwcUrl(p), null, String(p));
});

// 가짜 fetch — 부른 주소·옵션을 남기고, 정한 응답을 돌려준다
function fakeFetch(make) {
  const calls = [];
  const f = async (url, init) => { calls.push({ url, init }); return make(url, init); };
  f.calls = calls;
  return f;
}
const resp = (body, o = {}) => {
  const r = new Response(body, { status: o.status || 200, headers: o.headers || {} });
  if (o.url !== undefined) Object.defineProperty(r, 'url', { value: o.url });
  return r;
};

test('받기 — 허용 주소면 브라우저 UA로 GET, 글자로 돌려준다 / 허용 밖이면 요청을 아예 안 보낸다', async () => {
  const rss = fs.readFileSync(path.join(__dirname, '..', '..', 'tests', 'fixtures', 'jtwc', 'jtwc-20261008.rss'), 'utf8');
  const f = fakeFetch((url) => resp(rss, { url }));
  const r = await jtwcFetch('rss/jtwc.rss', { fetch: f });
  assert.deepEqual({ ok: r.ok, status: r.status, url: r.url }, { ok: true, status: 200, url: 'https://www.metoc.navy.mil/jtwc/rss/jtwc.rss' });
  assert.equal(r.text, rss);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].url, 'https://www.metoc.navy.mil/jtwc/rss/jtwc.rss');
  assert.equal(f.calls[0].init.method, 'GET');
  assert.equal(f.calls[0].init.headers['User-Agent'], JTWC_UA);
  assert.match(JTWC_UA, /^Mozilla\/5\.0 \(Windows NT 10\.0; Win64; x64\) .*Chrome\/\d+/);
  assert.ok(f.calls[0].init.signal, '시간 제한용 AbortSignal');
  const d = fakeFetch(() => resp('x'));
  for (const p of ['https://evil.example/jtwc/rss/jtwc.rss', 'jtwc.html', 'products/wp2726web.txt']) {
    const x = await jtwcFetch(p, { fetch: d });
    assert.equal(x.ok, false); assert.equal(x.err, 'denied');
  }
  assert.equal(d.calls.length, 0, '거절한 주소로는 요청 0');
});

test('받기 — HTTP 오류·연결 실패·넘겨주기로 허용 밖·크기 상한(머리·본문)·시간 제한', async () => {
  let r = await jtwcFetch('products/wp2726.tcw', { fetch: fakeFetch(() => resp('Forbidden', { status: 403 })) });
  assert.deepEqual(r, { ok: false, err: 'http', status: 403 });
  r = await jtwcFetch('products/wp2726.tcw', { fetch: async () => { throw new TypeError('net::ERR_INTERNET_DISCONNECTED'); } });
  assert.deepEqual(r, { ok: false, err: 'net', detail: 'net::ERR_INTERNET_DISCONNECTED' });
  r = await jtwcFetch('products/wp2726.tcw', { fetch: fakeFetch(() => resp('x', { url: 'https://s3.amazonaws.com/www.metoc.navy.mil/jtwc/products/wp2726.tcw' })) });
  assert.deepEqual(r, { ok: false, err: 'denied', detail: 'redirect' });
  r = await jtwcFetch('products/wp2726.tcw', { fetch: fakeFetch(() => resp('ok', { url: 'https://www.metoc.navy.mil/jtwc/products/wp2726.tcw' })) });
  assert.equal(r.ok, true, '허용 안에서 넘겨준 것은 받는다');
  r = await jtwcFetch('rss/jtwc.rss', { maxBytes: 100, fetch: fakeFetch(() => resp('x'.repeat(50), { headers: { 'content-length': '5000' } })) });
  assert.equal(r.err, 'too-big', 'content-length가 크면 본문을 안 읽고');
  r = await jtwcFetch('rss/jtwc.rss', { maxBytes: 100, fetch: fakeFetch(() => resp('y'.repeat(500))) });
  assert.equal(r.err, 'too-big', '본문이 상한을 넘으면 읽다가 끊는다');
  r = await jtwcFetch('rss/jtwc.rss', { maxBytes: 100, fetch: fakeFetch(() => resp('z'.repeat(100))) });
  assert.equal(r.ok, true); assert.equal(r.text.length, 100);
  // 응답이 없으면 시간 제한에 끊는다(신호를 받아 거절하는 fetch)
  const t0 = Date.now();
  r = await jtwcFetch('rss/jtwc.rss', { timeoutMs: 60, fetch: (u, init) => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(new Error('aborted')))) });
  assert.deepEqual(r, { ok: false, err: 'timeout' });
  assert.ok(Date.now() - t0 < 2000);
  // fetch가 신호를 무시해도(응답·본문에서 멈춤) 시간 제한이 끝낸다
  r = await jtwcFetch('rss/jtwc.rss', { timeoutMs: 60, fetch: () => new Promise(() => {}) });
  assert.deepEqual(r, { ok: false, err: 'timeout' });
  let cancelled = 0;
  const stall = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('<rss>')); }, cancel() { cancelled++; } });
  r = await jtwcFetch('rss/jtwc.rss', { timeoutMs: 60, fetch: async () => new Response(stall) });
  assert.deepEqual(r, { ok: false, err: 'timeout' });
  assert.equal(cancelled, 1, '멈춘 본문은 끊어 준다');
});

// 문지기(webRequest) — Electron net.fetch는 넘겨주기를 따라가도 Response.url이 빈 글자라(2026-10-09 Electron 44 확인) 받은 뒤 검사로는 못 막는다.
// 가짜 세션: onBeforeRequest 문지기를 기억하고, fetch는 Electron처럼 '넘겨준 다음 주소마다 문지기에 묻고, 막히면 ERR_BLOCKED_BY_CLIENT,
// 끝까지 가면 url 없는 Response'를 돌려준다(실제 Electron에서 로컬 서버 302로 본 그대로 — 막힌 주소로는 요청이 나가지 않았다).
function fakeSession(routes) {
  const ses = { guard: null, sent: [], installs: 0 };
  ses.webRequest = { onBeforeRequest: (fn) => { ses.installs++; ses.guard = fn; } };
  const ask = (url) => new Promise((res) => (ses.guard ? ses.guard({ url, method: 'GET' }, (r) => res(!!(r && r.cancel))) : res(false)));
  ses.fetch = async (url) => {
    for (let hop = 0; hop < 5; hop++) {
      if (await ask(url)) throw new TypeError('net::ERR_BLOCKED_BY_CLIENT');
      ses.sent.push(url);
      const to = routes[url];
      if (to && to.redirect) { url = new URL(to.redirect, url).href; continue; }
      return new Response(to ? to.body : 'nf', { status: to ? 200 : 404 });   // url 없음(Electron과 같게)
    }
    throw new TypeError('net::ERR_TOO_MANY_REDIRECTS');
  };
  return ses;
}

test('문지기 — 따로 세션의 모든 요청(넘겨준 다음 주소 포함)을 허용 주소로 묶는다: 허용 밖 넘겨주기는 요청 없이 끊고 denied', async () => {
  const B = 'https://www.metoc.navy.mil/jtwc/';
  const routes = {
    [B + 'rss/jtwc.rss']: { body: '<rss/>' },
    [B + 'products/wp2726.tcw']: { redirect: 'https://evil.example/wp2726.tcw' },                                    // 다른 호스트
    [B + 'products/wp2826.tcw']: { redirect: 'https://s3.amazonaws.com/www.metoc.navy.mil/jtwc/products/wp2826.tcw' }, // 같은 사이트라도 허용 밖 주소
    [B + 'products/wp2926.tcw']: { redirect: '../jtwc.html' },                                                         // 같은 호스트의 다른 경로
    [B + 'products/wp3026.tcw']: { redirect: 'http://www.metoc.navy.mil/jtwc/products/wp3026.tcw' },                  // http로 내림
    [B + 'products/ep1526.tcw']: { redirect: B + 'products/ep1626.tcw' },                                             // 허용 안 넘겨주기
    [B + 'products/ep1626.tcw']: { body: 'TCW' },
    'https://evil.example/wp2726.tcw': { body: 'EVIL' },
  };
  // 문지기가 없으면 — Electron처럼 url 없는 응답이라 jtwcFetch의 res.url 검사가 못 막는다(고친 까닭)
  const raw = fakeSession(routes);
  const leak = await jtwcFetch('products/wp2726.tcw', { fetch: (u, i) => raw.fetch(u, i) });
  assert.deepEqual({ ok: leak.ok, text: leak.text }, { ok: true, text: 'EVIL' }, '문지기 없으면 새어 나감(대조)');
  // 문지기
  const ses = fakeSession(routes);
  assert.equal(jtwcGuardSession(ses), true);
  assert.equal(jtwcGuardSession(ses), false, '세션마다 한 번만 건다');
  assert.equal(ses.installs, 1);
  assert.equal(jtwcGuardSession(null), false);
  const get = (p) => jtwcFetch(p, { fetch: (u, i) => ses.fetch(u, i) });
  assert.deepEqual(await get('rss/jtwc.rss'), { ok: true, status: 200, url: B + 'rss/jtwc.rss', text: '<rss/>' });
  for (const p of ['products/wp2726.tcw', 'products/wp2826.tcw', 'products/wp2926.tcw', 'products/wp3026.tcw']) {
    assert.deepEqual(await get(p), { ok: false, err: 'denied', detail: 'redirect' }, p);
  }
  assert.equal((await get('products/ep1526.tcw')).text, 'TCW', '허용 안에서 넘겨준 것은 받는다');
  assert.ok(!ses.sent.some((u) => !jtwcUrl(u)), '허용 밖 주소로는 요청이 한 번도 안 나감: ' + ses.sent.join(' '));
  // 문지기 판정 자체 — 허용 주소만 통과
  const cancel = (url) => new Promise((res) => ses.guard({ url }, (r) => res(r.cancel)));
  for (const u of [B + 'rss/jtwc.rss', B + 'products/io0326.tcw']) assert.equal(await cancel(u), false, u);
  for (const u of ['https://evil.example/', B + 'jtwc.html', B + 'products/wp2726web.txt', 'http://www.metoc.navy.mil/jtwc/rss/jtwc.rss', '', undefined]) assert.equal(await cancel(u), true, String(u));
});

test('배선 — main.js는 메인 창 주 프레임(app://)만 받아 주고 문지기 건 따로 세션의 net.fetch로, preload는 jtwcFetch 하나만 노출', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
  const h = main.slice(main.indexOf("ipcMain.handle('wcg:jtwc-fetch'"));
  assert.ok(h.length > 0, 'wcg:jtwc-fetch 핸들러 없음');
  const body = h.slice(0, h.indexOf('\n});') + 4);
  assert.match(body, /if \(!jtwcCallerOk\(e\)\) return \{ ok: false, err: 'denied', detail: 'sender' \};/, '부르는 쪽 검사가 맨 앞');
  const caller = main.slice(main.indexOf('function jtwcCallerOk('), main.indexOf("ipcMain.handle('wcg:jtwc-fetch'"));
  assert.match(caller, /e\.sender\.id !== win\.webContents\.id\) return false;/, '메인 창(웹앱)만');
  assert.match(caller, /const f = e\.senderFrame; return !!f && !f\.parent && String\(f\.url \|\| ''\)\.startsWith\(`\$\{APP_ORIGIN\}\/`\);/, '주 프레임 · app:// 주소만');
  assert.match(caller, /catch \(err\) \{ return false; \}/, '프레임이 사라졌으면 거절');
  const sesFn = main.slice(main.indexOf('function jtwcSession('), main.indexOf('function jtwcCallerOk('));
  assert.match(sesFn, /jtwcSes = session\.fromPartition\('jtwc'\); jtwcGuardSession\(jtwcSes\);/, '따로 세션(메모리 — 앱 쿠키와 안 섞임) + 문지기');
  assert.match(body, /const ses = jtwcSession\(\);\s*return jtwcFetch\(String\(p \|\| ''\), \{ fetch: \(u, init\) => ses\.fetch\(u, init\) \}\);/);
  assert.match(main, /const \{ jtwcFetch, jtwcGuardSession \} = require\('\.\/jtwc'\);/);
  assert.equal((main.match(/session\.fromPartition\('jtwc'\)/g) || []).length, 1, "'jtwc' 세션은 문지기 거는 한 곳에서만 만든다");
  const pre = fs.readFileSync(path.join(__dirname, '..', 'preload.js'), 'utf8');
  assert.match(pre, /jtwcFetch: \(p\) => ipcRenderer\.invoke\('wcg:jtwc-fetch', String\(p \|\| ''\)\),/);
  assert.equal((pre.match(/wcg:jtwc-fetch/g) || []).length, 1);
});
