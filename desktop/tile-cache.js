// 지도 타일 디스크 캐시 — 웹앱의 지도 타일(Mapbox 실시간 그림 타일·가벼운 지도(WebGL) 벡터 타일)을 메인이 받아 이 PC에 저장하고,
// 다음엔 디스크에서 바로 준다. 버튼 없이 자동(사용자 10-10: "한 번 본 타일은 알아서 로컬에서").
// - 주소는 지도 타일 서버만(TILE_HOSTS, https). 토큰(access_token)은 열쇠·파일에 남기지 않는다(열쇠 = 토큰 뺀 주소의 sha1).
// - 보관: 타일은 30일(Mapbox 문서 — 기기 안 캐시는 성능용으로 허용, 남에게 다시 주는 것(프록시·재배포)은 금지 → 이 PC 안에서만 쓴다).
//   그 밖(TileJSON 등 목록)은 서버 max-age(없으면 1시간, 최대 30일) — 목록이 가리키는 타일 판(버전)이 바뀌면 따라가게.
// - 용량 상한(기본 2GB)을 넘으면 가장 오래 안 쓴 것부터 지운다(파일 수정 시각 = 마지막 사용 — 꺼낼 때마다 갱신).
// - 인터넷이 안 되거나 서버가 실패하면 기한 지난 타일이라도 준다(stale).
// - 같은 타일을 동시에 여러 번 달라고 하면 한 번만 받는다.
'use strict';
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');

const TILE_HOSTS = /^(tiles\.openfreemap\.org|api\.mapbox\.com|[a-d]\.tiles\.mapbox\.com)$/i;
const DAY = 86400000;
const TILE_AGE = 30 * DAY;
const LIST_AGE = 3600000;
const MAX_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_BODY = 16 * 1024 * 1024;   // 한 개 상한(타일은 보통 수십 KB)
const TIMEOUT_MS = 20000;

function tileUrlOk(u) {
  try {
    const x = new URL(String(u || ''));
    return x.protocol === 'https:' && TILE_HOSTS.test(x.hostname) && !x.username && !x.password && (!x.port || x.port === '443');
  } catch (e) { return false; }
}
// 열쇠용 주소 — 토큰을 뺀다(토큰이 바뀌어도 같은 타일, 파일에도 토큰이 안 남음)
function cacheKeyUrl(u) { const x = new URL(u); x.searchParams.delete('access_token'); x.hash = ''; return x.toString(); }
// 타일 주소인가(…/z/x/y, …/z/x/y@2x.jpg90, ….pbf 등) — 아니면 목록(TileJSON·스타일)
function isTilePath(p) { return /\/\d+\/\d+\/\d+(@\dx)?(\.\w+)?$/.test(p) || /\.(pbf|mvt|png|jpe?g|webp)$/i.test(p); }
function maxAgeOf(cc) { const m = /(?:^|[,\s])max-age=(\d+)/i.exec(String(cc || '')); return m ? +m[1] * 1000 : null; }

function createTileCache(opts) {
  const dir = opts.dir;
  const fetchFn = opts.fetch;
  const maxBytes = opts.maxBytes || MAX_BYTES;
  const now = opts.now || Date.now;
  const inflight = new Map();
  const stats = { hit: 0, miss: 0, stale: 0, fail: 0 };
  let total = null, scanning = null, pruning = null;

  const fileOf = (h) => { const d = path.join(dir, h.slice(0, 2)); return { d, body: path.join(d, h + '.t'), meta: path.join(d, h + '.m') }; };
  async function readEntry(f) {
    let meta;
    try { meta = JSON.parse(await fsp.readFile(f.meta, 'utf8')); } catch (e) { return null; }
    let body;
    try { body = await fsp.readFile(f.body); } catch (e) { return null; }
    if (!meta || body.length !== meta.size) return null;
    return { meta, body };
  }
  const touch = (f) => { const t = new Date(now()); fsp.utimes(f.body, t, t).catch(() => {}); };

  // 지금 쓰는 용량(처음 한 번 훑는다)
  function scan() {
    if (scanning) return scanning;
    scanning = (async () => {
      const list = [];
      let subs = [];
      try { subs = await fsp.readdir(dir); } catch (e) { subs = []; }
      for (const s of subs) {
        let names = [];
        try { names = await fsp.readdir(path.join(dir, s)); } catch (e) { continue; }
        for (const n of names) {
          if (!n.endsWith('.t')) continue;
          try { const st = await fsp.stat(path.join(dir, s, n)); list.push({ p: path.join(dir, s, n), size: st.size, t: st.mtimeMs }); } catch (e) { /* 지워짐 */ }
        }
      }
      return list;
    })();
    scanning.then((list) => { if (total == null) total = list.reduce((a, b) => a + b.size, 0); }, () => {});
    return scanning;
  }
  // 상한을 넘으면 오래 안 쓴 것부터 85%까지
  function prune() {
    if (pruning) return pruning;
    pruning = (async () => {
      scanning = null;
      const list = await scan();
      scanning = null;
      total = list.reduce((a, b) => a + b.size, 0);
      if (total <= maxBytes) return;
      list.sort((a, b) => a.t - b.t);
      for (const e of list) {
        if (total <= maxBytes * 0.85) break;
        try { await fsp.unlink(e.p); } catch (err) { /* 이미 없음 */ }
        try { await fsp.unlink(e.p.slice(0, -2) + '.m'); } catch (err) { /* 이미 없음 */ }
        total -= e.size;
      }
    })().finally(() => { pruning = null; });
    return pruning;
  }

  async function fetchStore(u, f, isTile) {
    let res;
    try { res = await fetchFn(u, { signal: AbortSignal.timeout(TIMEOUT_MS) }); }
    catch (e) { return { ok: false, err: (e && e.name === 'TimeoutError') ? 'timeout' : 'net', detail: String((e && e.message) || e).slice(0, 160) }; }
    if (!res.ok) return { ok: false, err: 'http', status: res.status };
    const type = res.headers.get('content-type') || '';
    let body;
    try { body = Buffer.from(await res.arrayBuffer()); } catch (e) { return { ok: false, err: 'net', detail: 'body' }; }
    if (body.length > MAX_BODY) return { ok: false, err: 'too-big' };
    const cc = res.headers.get('cache-control') || '';
    if (!/no-store/i.test(cc)) {
      const ma = maxAgeOf(cc);
      const age = isTile ? TILE_AGE : Math.min(TILE_AGE, ma == null ? LIST_AGE : ma);
      if (age > 0) {
        try {
          if (total == null) await scan().catch(() => {});   // 처음 한 번 — 지금 쓰는 용량(이번 파일을 쓰기 전에)
          await fsp.mkdir(f.d, { recursive: true });
          const tmp = f.body + '.' + process.pid + '.tmp';
          await fsp.writeFile(tmp, body);
          await fsp.rename(tmp, f.body);
          const t = new Date(now());
          await fsp.utimes(f.body, t, t).catch(() => {});   // 마지막 사용 시각 = 이 캐시의 시계(꺼낼 때 touch와 같은 기준)
          await fsp.writeFile(f.meta, JSON.stringify({ type, size: body.length, exp: now() + age, at: now() }));
          if (total != null) { total += body.length; if (total > maxBytes) prune().catch(() => {}); }
        } catch (e) { /* 저장 실패해도 받은 건 준다(디스크 가득 등) */ }
      }
    }
    return { ok: true, status: res.status, type, body, hit: false };
  }

  // 돌려주는 것: { ok: true, status, type, body(Buffer), hit, stale? } 또는 { ok: false, err: 'denied'|'net'|'timeout'|'http'|'too-big', status? }
  async function get(u) {
    u = String(u || '');
    if (!tileUrlOk(u)) return { ok: false, err: 'denied' };
    const key = cacheKeyUrl(u);
    const h = crypto.createHash('sha1').update(key).digest('hex');
    const f = fileOf(h);
    const isTile = isTilePath(new URL(key).pathname);
    const old = await readEntry(f);
    if (old && old.meta.exp > now()) { stats.hit++; touch(f); return { ok: true, status: 200, type: old.meta.type || '', body: old.body, hit: true }; }
    let p = inflight.get(h);
    if (!p) { p = fetchStore(u, f, isTile).finally(() => inflight.delete(h)); inflight.set(h, p); }
    const r = await p;
    if (r.ok) { stats.miss++; return r; }
    if (old) { stats.stale++; touch(f); return { ok: true, status: 200, type: old.meta.type || '', body: old.body, hit: true, stale: true }; }
    stats.fail++;
    return r;
  }
  return { get, stats, prune, dir };
}

module.exports = { createTileCache, tileUrlOk, cacheKeyUrl, isTilePath, maxAgeOf, TILE_AGE, MAX_BYTES };
