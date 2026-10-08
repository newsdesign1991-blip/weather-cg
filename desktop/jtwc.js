// 미해군 합동태풍경보센터(JTWC) 자료 받기 — 메인 프로세스 전용(웹앱은 preload의 wcgDesktop.jtwcFetch → main.js 'wcg:jtwc-fetch'로 부른다).
// 2026-10-09: 웹판을 접고 데스크톱 설치판 하나로 가므로, 브라우저 CORS·헬퍼 허용 목록 없이 앱(메인)이 직접 받는다.
// 받을 수 있는 주소는 딱 두 종류뿐이다(그 밖은 요청을 보내지 않고 거절 — 'denied'):
//   https://www.metoc.navy.mil/jtwc/rss/jtwc.rss            지금 활동 중인 태풍 목록(RSS — 해역별 item, 태풍마다 products/xxNNYY.tcw 링크)
//   https://www.metoc.navy.mil/jtwc/products/xxNNYY.tcw     태풍 통보문(JMV 3.0 — 예: wp2726 = 서태평양 27호 2026년)
// 웹앱은 상대 경로('rss/jtwc.rss'·'products/wp2726.tcw')나 RSS에 적힌 전체 주소를 넘긴다. 받은 글은 웹앱이 글자(데이터)로만 쓴다.
// Electron 없이 시험할 수 있게 fetch를 넘겨받는다(desktop/test/jtwc-fetch.test.cjs). main.js는 따로 세션의 net.fetch를 넘기고,
// 그 세션에 jtwcGuardSession으로 문지기를 건다(넘겨주기로 허용 밖에 가는 요청을 크로미움 단계에서 끊음 — 아래 설명).
'use strict';

const JTWC_HOST = 'www.metoc.navy.mil';
const JTWC_PATH = /^\/jtwc\/(?:rss\/jtwc\.rss|products\/[a-z]{2}\d{4}\.tcw)$/;
// jtwc.html 등은 기본 curl UA를 403으로 막는다 — 브라우저와 같은 User-Agent로 묻는다
const JTWC_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36';
const JTWC_TIMEOUT_MS = 15000;     // 응답이 없으면 15초에 끊는다(웹앱은 '다시 시도'·사이트 열기·붙여넣기를 보여 준다)
const JTWC_MAX_BYTES = 1 << 20;    // 1MB — RSS는 수 KB, .tcw는 10KB 남짓. 넘으면 끊고 'too-big'

// 허용 주소면 정규화한 https 주소, 아니면 null. 상대 경로('rss/jtwc.rss')·전체 주소 둘 다 받는다.
// 물음표·조각·사용자 정보·포트·http·다른 호스트(끝 점 포함)·대문자 파일 이름·../ 는 모두 거절.
function jtwcUrl(p) {
  const s = String(p == null ? '' : p).trim();
  if (!s || s.length > 200 || /[\s\\?#%@]/.test(s) || /(^|\/)\.\.?(\/|$)/.test(s)) return null;   // ./·../ 는 풀어서 허용 주소가 돼도 거절
  let u;
  try { u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${JTWC_HOST}/jtwc/${s.replace(/^\/+/, '')}`); } catch (e) { return null; }
  if (u.protocol !== 'https:' || u.hostname !== JTWC_HOST || u.port || u.username || u.password || u.search || u.hash) return null;
  if (!JTWC_PATH.test(u.pathname)) return null;
  return `https://${JTWC_HOST}${u.pathname}`;
}

// 따로 세션('jtwc')의 모든 요청을 허용 주소로 묶는다 — 넘겨주기(리디렉트)로 바뀐 다음 주소도 여기서 걸러진다(막히면 net::ERR_BLOCKED_BY_CLIENT).
// 꼭 필요한 까닭: Electron의 net.fetch(session.fetch)는 넘겨주기를 따라가도 Response.url을 빈 글자로 둔다(2026-10-09 Electron 44에서
// 로컬 서버 302로 확인 — url '', redirected false). 그래서 아래 jtwcFetch의 res.url 검사는 Node fetch에서만 듣고, 앱에서는 이 문지기가 막는다.
// redirect:'manual'은 Electron에서 'Redirect was cancelled'로 끝나 다음 주소를 볼 수 없어 쓰지 않는다. webRequest는 넘겨준 주소에도 다시 불린다.
// onBeforeRequest는 세션마다 하나라 여러 번 불러도 같은 문지기로 바뀔 뿐이다(그래도 한 번만 건다).
const _guarded = new WeakSet();
function jtwcGuardSession(ses) {
  if (!ses || !ses.webRequest || _guarded.has(ses)) return false;
  ses.webRequest.onBeforeRequest((d, cb) => cb({ cancel: !jtwcUrl(d && d.url) }));
  _guarded.add(ses);
  return true;
}

// 받기. 돌려주는 것(IPC로 그대로 넘어간다 — 평범한 객체만):
//   { ok: true, status, url, text }
//   { ok: false, err: 'denied' | 'timeout' | 'too-big' | 'http' | 'net', status?, detail? }
// opts.fetch: (url, init) => Response(웹 표준). 기본은 전역 fetch(Node 18+).
async function jtwcFetch(p, opts) {
  const o = opts || {};
  const url = jtwcUrl(p);
  if (!url) return { ok: false, err: 'denied', detail: String(p == null ? '' : p).slice(0, 120) };
  const doFetch = o.fetch || globalThis.fetch;
  const maxBytes = o.maxBytes > 0 ? o.maxBytes : JTWC_MAX_BYTES;
  const ac = new AbortController();
  let why = '';
  const timer = setTimeout(() => { why = 'timeout'; ac.abort(); }, o.timeoutMs > 0 ? o.timeoutMs : JTWC_TIMEOUT_MS);
  // 끊김 — fetch 구현이 신호를 본문까지 전하지 않더라도(본문 읽기에서 멈춤) 시간 제한이 꼭 끝내게 함께 겨룬다
  const aborted = new Promise((_, rej) => ac.signal.addEventListener('abort', () => rej(new Error('aborted')), { once: true }));
  aborted.catch(() => { /* 겨루기에서만 쓴다 */ });
  try {
    const res = await Promise.race([doFetch(url, {
      method: 'GET', redirect: 'follow', signal: ac.signal, cache: 'no-store',
      headers: { 'User-Agent': JTWC_UA, Accept: 'application/rss+xml, application/xml, text/plain, */*' },
    }), aborted]);
    // 넘겨주기(리디렉트)로 허용 밖 주소에 닿았으면 그 응답은 쓰지 않는다(Node fetch용 — 앱(Electron)은 res.url이 비어 있어 jtwcGuardSession이 막는다)
    if (res.url && !jtwcUrl(res.url)) { why = 'denied'; ac.abort(); return { ok: false, err: 'denied', detail: 'redirect' }; }
    if (!res.ok) { why = 'http'; ac.abort(); return { ok: false, err: 'http', status: res.status }; }
    const len = +(res.headers && res.headers.get && res.headers.get('content-length')) || 0;
    if (len > maxBytes) { why = 'too-big'; ac.abort(); return { ok: false, err: 'too-big', status: res.status }; }
    const chunks = []; let size = 0;
    if (res.body && typeof res.body.getReader === 'function') {
      const rd = res.body.getReader();
      ac.signal.addEventListener('abort', () => { rd.cancel().catch(() => { /* 이미 끝남 */ }); }, { once: true });
      for (;;) {
        const { done, value } = await Promise.race([rd.read(), aborted]);
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) { why = 'too-big'; try { await rd.cancel(); } catch (e) { /* 이미 끊김 */ } ac.abort(); return { ok: false, err: 'too-big', status: res.status }; }
        chunks.push(value);
      }
    } else {
      const buf = new Uint8Array(await Promise.race([res.arrayBuffer(), aborted]));
      if (buf.byteLength > maxBytes) { why = 'too-big'; return { ok: false, err: 'too-big', status: res.status }; }
      chunks.push(buf); size = buf.byteLength;
    }
    const all = new Uint8Array(size); let at = 0;
    for (const c of chunks) { all.set(c, at); at += c.byteLength; }
    return { ok: true, status: res.status, url, text: new TextDecoder('utf-8').decode(all) };
  } catch (e) {
    if (why === 'timeout') return { ok: false, err: 'timeout' };
    if (why === 'too-big') return { ok: false, err: 'too-big' };
    const msg = String((e && e.message) || e);
    if (/ERR_BLOCKED_BY_CLIENT/.test(msg)) return { ok: false, err: 'denied', detail: 'redirect' };   // 문지기(jtwcGuardSession)가 허용 밖 넘겨주기를 끊었다
    return { ok: false, err: 'net', detail: msg.slice(0, 200) };
  } finally { clearTimeout(timer); }
}

module.exports = { jtwcUrl, jtwcFetch, jtwcGuardSession, JTWC_HOST, JTWC_UA, JTWC_TIMEOUT_MS, JTWC_MAX_BYTES };
