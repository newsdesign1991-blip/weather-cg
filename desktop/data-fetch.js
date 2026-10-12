// 공공데이터포털(apis.data.go.kr — 생활기상·미세먼지 농도·미세먼지 예보) 받기 — 메인 프로세스 전용.
// 웹앱은 preload의 wcgDesktop.dataFetch(주소, { timeoutMs }) → main.js 'wcg:data-fetch'로 부른다(js/data-maps.js dataSendOnce).
// 2026-10-12부터 내장 헬퍼의 기상청 받기(desktop/wns/server.js /api/kma)도 같은 받기(createDataFetcher)를 옵션만 바꿔 쓴다(아래 '헬퍼 옵션').
//
// 왜 따로 받나(2026-10-10 실측 — 에어코리아 '느림·누락·The read operation timed out' 신고):
//   포털 게이트웨이는 '새 연결의 첫 요청' 약 1/3을 응답 없이 붙잡았다가 30초 뒤 504(길면 57초 뒤 503, 본문 SERVICETIMEOUT_ERROR 05)를 준다.
//   같은 연결을 다시 쓴 요청(keep-alive)은 63건 중 한 번도 멈추지 않았다(504를 받은 연결도 바로 다음 요청은 정상).
//   헬퍼 /api/kma(파이썬 urllib 흉내)는 요청마다 새 연결 + 'Connection: close' + 20초 제한이라 1/3이 시간 초과로 실패했다.
// 그래서 여기서는
//   ① 연결을 모아 다시 쓴다(https.Agent keepAlive — 소켓 최대 8개, 놀면 15초 뒤 닫음).
//   ② 새 연결에서 첫 응답이 hedgeMs(기본 1.5초) 안에 안 오면 다른 연결로 같은 요청을 하나 더 보내 먼저 오는 쪽을 쓴다(진 쪽은 바로 끊는다 — 최대 2번, 1.5·3초).
//      정상 응답은 0.2초 안에 온다(실측 p50 0.09초). 다시 쓴 연결이면 더 보내지 않는다(헬퍼 옵션 hedgeReused 면 보낸다).
//   ③ 첫 응답(머리)을 timeoutMs 까지만 기다리고 끊는다 — 몇 번 다시 보낼지·얼마나 기다릴지는 웹앱이 정한다(시도마다 늘려 느린 응답도 받는다).
//   ④ 놀던 연결을 서버가 이미 닫아 곧바로 끊기면(재사용 소켓 ECONNRESET 등) 다른 연결로 바로 다시(서버는 요청을 못 받았다 — 3번까지).
// 받을 수 있는 주소는 https://apis.data.go.kr/<기관>/<서비스>/<오퍼레이션>?… 뿐(그 밖은 보내지 않고 'denied').
// UA는 파이썬 기본(Python-urllib/3.13) — 포털 WAF가 다른 UA를 403으로 막는다(desktop/wns/server.js PY_UA와 같다).
// 키가 든 주소는 로그·오류 글에 싣지 않는다(오류 detail 은 소켓 오류 글만).
// Electron 없이 시험할 수 있게 모듈(http/https)·허용 검사·프록시 판정을 넘겨받는다(desktop/test/data-fetch.test.cjs).
//
// 헬퍼 옵션(기본은 모두 꺼짐 — 포털 받기는 위 동작 그대로):
//   raw          본문을 글자 대신 바이트(body: Buffer)로, 상태 문구(reason)·넘겨주기 주소(location)도 돌려준다(기상청은 EUC-KR — 헬퍼가 파이썬처럼 푼다).
//   failStatus   이 상태(예: 5xx)면 '실패한 시도'로 본다 — 이긴 쪽으로 치지 않고 다른 시도를 기다리거나 다시 보낸다(err 'status').
//   retries      실패(상태·연결 오류·본문 끊김)면 남은 시간 안에 이만큼 다시 보낸다(첫 응답 시간 초과는 다시 안 보냄 — 그땐 이미 하나 더 보냈다).
//   deadline     true 면 timeoutMs 가 '처음 보낸 때부터' 전체 시간 제한(뒤에 보낸 것도 남은 시간만 기다림, 남은 시간이 retryMinMs 보다 적으면 새로 안 보냄).
//   hedgeReused  다시 쓴 연결이어도 늦으면 하나 더(기상청 apihub 는 포털과 달리 다시 쓴 연결도 붙잡혔다 — 89건 중 4건, 2026-10-12 실측).
//   hedgeAt      하나 더 보낼 시각 목록(ms) — 있으면 hedgeMs·hedges 대신.
//   headers      보낼 머리글(기본: 파이썬 UA·identity·*/*).   signal(받기마다) — 부른 쪽이 떠나면(abort) 모든 시도를 끊고 'aborted'.
'use strict';
const https = require('https');

const DATA_HOST = 'apis.data.go.kr';
const DATA_PATH = /^\/[A-Za-z0-9_]{1,64}\/[A-Za-z0-9_]{1,64}\/[A-Za-z0-9_]{1,64}$/;
const DATA_UA = 'Python-urllib/3.13';
const DATA_TIMEOUT_MS = 8000;      // 첫 응답(머리)까지 기본 기다림(웹앱이 시도마다 정해 보낸다)
const DATA_HEDGE_MS = 1500;        // 새 연결에서 이만큼 답이 없으면 다른 연결로 하나 더
const DATA_HEDGES = 2;             // 하나 더 보내기는 최대 2번(1.5초·3초) — 10-10 실키 확인에서 둘 다 멈춘 경우가 나왔다(1/9)
const DATA_BODY_IDLE_MS = 20000;   // 본문 받는 중 조각 사이 최대 쉼
const DATA_IDLE_SOCKET_MS = 15000; // 놀고 있는 연결을 닫기까지
const DATA_MAX_BYTES = 8 << 20;    // 8MB — 가장 큰 응답(경기 DAILY 1000줄)이 약 0.3MB
const RETRY_MIN_MS = 1000;         // deadline 모드: 남은 시간이 이보다 적으면 새로 보내지 않는다(정상 응답은 0.1~0.6초)
const STATUS_DRAIN_MS = 2000;      // 실패한 상태(5xx)의 본문은 이만큼만 흘려보내고(연결 다시 쓰기) 넘으면 끊는다

// 허용 주소면 그 주소(글자 그대로 — 키 인코딩을 다시 만지지 않는다), 아니면 null.
function dataPortalUrl(u) {
  const s = String(u == null ? '' : u).trim();
  if (!s || s.length > 4096 || /[\s\\#]/.test(s)) return null;
  let x;
  try { x = new URL(s); } catch (e) { return null; }
  if (x.protocol !== 'https:' || x.hostname !== DATA_HOST || x.port || x.username || x.password || x.hash) return null;
  if (!DATA_PATH.test(x.pathname)) return null;
  return s;
}

const clampMs = (v, lo, hi, def) => { const n = Math.floor(+v); return Number.isFinite(n) && n > 0 ? Math.min(hi, Math.max(lo, n)) : def; };
const errText = (e) => String((e && (e.code || e.message)) || e || '').slice(0, 160);
const RESET_RE = /ECONNRESET|EPIPE|socket hang up|ECONNABORTED/i;
const DEFAULT_HEADERS = { 'User-Agent': DATA_UA, 'Accept-Encoding': 'identity', Accept: '*/*' };

// o: { module(http|https — 시험용), agent, agentOptions, allow(주소 → 주소|null), proxyFor(async 주소 → true면 프록시 PC — 'proxy'로 돌려보냄),
//      hedgeMs, hedges, maxBytes, bodyIdleMs, + 위 '헬퍼 옵션' }
function createDataFetcher(opts) {
  const o = opts || {};
  const mod = o.module || https;
  const agent = o.agent || new mod.Agent({ keepAlive: true, keepAliveMsecs: 1000, maxSockets: 8, maxFreeSockets: 8,
    timeout: DATA_IDLE_SOCKET_MS, scheduling: 'lifo', ...(o.agentOptions || {}) });
  const allow = o.allow || dataPortalUrl;
  const maxBytes = o.maxBytes > 0 ? o.maxBytes : DATA_MAX_BYTES;
  const bodyIdle = o.bodyIdleMs > 0 ? o.bodyIdleMs : DATA_BODY_IDLE_MS;
  const headers = o.headers || DEFAULT_HEADERS;
  const raw = !!o.raw;
  const failStatus = typeof o.failStatus === 'function' ? o.failStatus : null;
  const retryMinMs = o.retryMinMs > 0 ? o.retryMinMs : RETRY_MIN_MS;

  // 요청 한 번. onHead(run) = 응답 머리가 왔다(이긴 쪽). 반환 run { done(Promise → 결과), abort(), reused, headed }
  function run(url, timeoutMs, onHead) {
    const r = { reused: false, headed: false, socketed: false, connected: false, over: false, abort: () => {} };
    let req = null, timer = null, why = '', finished = false, resolveDone;
    r.done = new Promise((res) => { resolveDone = res; });
    const finish = (x) => { if (finished) return; finished = true; r.over = true; clearTimeout(timer); resolveDone({ ...x, reused: r.reused }); };
    const arm = (ms, kind) => { clearTimeout(timer); timer = setTimeout(() => { why = kind; try { req.destroy(new Error(kind)); } catch (e) { /* 이미 끝남 */ } }, ms); };
    r.abort = () => { if (finished) return; why = 'aborted'; finish({ ok: false, err: 'aborted' }); try { req && req.destroy(); } catch (e) { /* 무시 */ } };
    try {
      req = mod.request(url, { method: 'GET', agent, headers }, (res) => {
        r.headed = true;
        if (finished) { res.resume(); return; }
        if (failStatus && failStatus(res.statusCode)) {
          // 실패한 상태(예: 504) — 이긴 쪽으로 치지 않는다. 본문은 잠깐 흘려보내 연결을 다시 쓸 수 있게(늦으면 끊음)
          finish({ ok: false, err: 'status', status: res.statusCode, reason: res.statusMessage || '' });
          const t = setTimeout(() => { try { req.destroy(); } catch (e) { /* 무시 */ } }, STATUS_DRAIN_MS);
          res.on('end', () => clearTimeout(t)); res.on('close', () => clearTimeout(t)); res.on('error', () => {});
          res.resume();
          return;
        }
        if (onHead) onHead(r);
        if (finished) { res.resume(); return; }
        arm(bodyIdle, 'idle');
        const len = +res.headers['content-length'] || 0;
        if (len > maxBytes) { why = 'too-big'; finish({ ok: false, err: 'too-big', status: res.statusCode }); req.destroy(); return; }
        const chunks = []; let size = 0;
        res.on('data', (c) => {
          if (finished) return;
          size += c.length;
          if (size > maxBytes) { why = 'too-big'; finish({ ok: false, err: 'too-big', status: res.statusCode }); req.destroy(); return; }
          chunks.push(c); arm(bodyIdle, 'idle');
        });
        res.on('end', () => {
          if (!res.complete) return finish({ ok: false, err: why === 'idle' ? 'timeout' : 'net', stage: 'body', detail: 'incomplete' });
          const buf = Buffer.concat(chunks, size);
          if (raw) return finish({ ok: true, status: res.statusCode, reason: res.statusMessage || '', location: res.headers.location || null, body: buf });
          finish({ ok: true, status: res.statusCode, text: new TextDecoder('utf-8').decode(buf) });
        });
        res.on('error', (e) => finish({ ok: false, err: why === 'idle' ? 'timeout' : 'net', stage: 'body', detail: errText(e) }));
        res.on('close', () => { if (!res.complete) finish({ ok: false, err: why === 'idle' ? 'timeout' : 'net', stage: 'body', detail: 'closed' }); });
      });
      req.on('socket', (s) => {
        r.socketed = true; r.reused = !!req.reusedSocket;
        if (r.reused || !s.connecting) r.connected = true; else s.once('connect', () => { r.connected = true; });
      });
      req.on('error', (e) => {
        if (why === 'timeout') return finish({ ok: false, err: 'timeout', stage: 'head', connected: r.connected });
        if (why === 'idle') return finish({ ok: false, err: 'timeout', stage: 'body' });
        finish({ ok: false, err: 'net', detail: errText(e), code: (e && e.code) || '', reset: r.reused && !r.headed && RESET_RE.test(errText(e)) });
      });
      arm(timeoutMs, 'timeout');
      req.end();
    } catch (e) { finish({ ok: false, err: 'net', detail: errText(e) }); }
    return r;
  }

  // 받기 — 반환(IPC로 그대로 넘어간다 — 평범한 객체만):
  //   { ok: true, status, text, sent, ms }  — 상태가 4xx·5xx여도 ok(본문을 웹앱이 읽는다 — 포털은 오류도 본문으로 준다)
  //   { ok: false, err: 'denied' | 'proxy' | 'timeout' | 'too-big' | 'net', detail?, sent, ms }
  //   헬퍼 옵션이면 { ok: true, status, reason, location, body } · { ok: false, err: 'status', status, reason } · { ok: false, err: 'aborted' } 도
  async function fetch(u, p) {
    const url = allow(u);
    if (!url) return { ok: false, err: 'denied', sent: 0, ms: 0 };
    if (o.proxyFor) { let px = false; try { px = await o.proxyFor(url); } catch (e) { px = false; } if (px) return { ok: false, err: 'proxy', sent: 0, ms: 0 }; }
    const q = p || {};
    const timeoutMs = clampMs(q.timeoutMs, 500, 60000, DATA_TIMEOUT_MS);
    const hedgeMs = q.hedgeMs === 0 ? 0 : clampMs(q.hedgeMs != null ? q.hedgeMs : o.hedgeMs, 200, 30000, DATA_HEDGE_MS);
    const hedges = Math.max(0, Math.min(4, Math.floor(q.hedges != null ? q.hedges : o.hedges != null ? o.hedges : DATA_HEDGES)));
    const retries = Math.max(0, Math.min(3, Math.floor(q.retries != null ? q.retries : o.retries || 0)));
    const deadline = !!(q.deadline != null ? q.deadline : o.deadline);
    const hedgeReused = !!(q.hedgeReused != null ? q.hedgeReused : o.hedgeReused);
    const hedgeAtList = Array.isArray(q.hedgeAt) ? q.hedgeAt : Array.isArray(o.hedgeAt) ? o.hedgeAt : null;
    const at = q.hedgeMs === 0 ? [] : hedgeAtList
      ? hedgeAtList.map((v) => clampMs(v, 100, 60000, 0)).filter((v) => v > 0).slice(0, 4)
      : Array.from({ length: hedgeMs > 0 ? hedges : 0 }, (_, i) => hedgeMs * (i + 1));
    const signal = q.signal || null;
    const t0 = Date.now();
    const left = () => timeoutMs - (Date.now() - t0);
    return new Promise((resolve) => {
      const runs = [], hedgeTimers = [];
      let winner = null, settled = false, resets = 0, retried = 0, lastFail = null;
      const live = () => runs.filter((y) => !y.over);
      const stopHedges = () => { for (const t of hedgeTimers) clearTimeout(t); };
      const settle = (x) => {
        if (settled) return; settled = true; stopHedges();
        if (signal) signal.removeEventListener('abort', onAbort);
        for (const r of runs) if (r !== winner) r.abort();
        resolve({ ...x, sent: runs.length, ms: Date.now() - t0 });
      };
      function onAbort() { if (settled) return; winner = null; settle({ ok: false, err: 'aborted' }); }
      const onHead = (r) => { if (winner) { if (r !== winner) r.abort(); return; } winner = r; stopHedges(); for (const x of runs) if (x !== r) x.abort(); };
      const retryable = (x) => x.err === 'status' || x.err === 'net' || (x.err === 'timeout' && x.stage === 'body');
      const start = () => {
        const r = run(url, deadline ? Math.max(1, left()) : timeoutMs, onHead);
        runs.push(r);
        r.done.then((x) => {
          if (settled) return;
          if (x.ok) return settle(x);
          if (x.err === 'aborted') return;
          lastFail = x;
          if (r === winner) winner = null;   // 이긴 쪽 본문이 끊김 — 아래에서 다시 보낼지 정한다
          if (winner) return;
          // 놀던 연결이 이미 닫혔다 — 다른 연결로 바로 다시(서버는 요청을 못 받았다 — 3번까지)
          if (x.reset && resets < 3) { resets++; start(); return; }
          if (live().length) return;   // 아직 기다리는 다른 요청이 있다
          // 실패(5xx·연결 오류·본문 끊김) — 남은 시간 안에 다시(retries 번까지)
          if (retried < retries && retryable(x) && (!deadline || left() >= retryMinMs)) { retried++; start(); return; }
          settle(lastFail);
        });
        return r;
      };
      if (signal) { if (signal.aborted) { resolve({ ok: false, err: 'aborted', sent: 0, ms: 0 }); return; } signal.addEventListener('abort', onAbort); }
      start();
      // 첫 응답이 at[k] 안에 없으면 다른 연결로 하나씩 더. 셋이 다 멈출 확률 ≈ (1/3)³ ≈ 4%.
      for (const ms of at) {
        if (ms >= timeoutMs) break;
        hedgeTimers.push(setTimeout(() => {
          if (settled || winner) return;
          const lv = live();
          if (!lv.length) return;
          if (!hedgeReused && lv.every((y) => y.socketed && y.reused)) return;   // 다시 쓴 연결은 멈추지 않았다 — 더 보내지 않는다
          if (deadline && left() < retryMinMs) return;
          start();
        }, ms));
      }
    });
  }

  return { fetch, agent, close: () => { try { agent.destroy(); } catch (e) { /* 무시 */ } } };
}

module.exports = { createDataFetcher, dataPortalUrl, DATA_HOST, DATA_UA, DATA_TIMEOUT_MS, DATA_HEDGE_MS, DATA_HEDGES, DATA_MAX_BYTES };
