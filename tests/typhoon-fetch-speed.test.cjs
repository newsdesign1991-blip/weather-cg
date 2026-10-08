// 태풍 '기상청에서 불러오기' 속도 개선(2026-10) — 조회 줄(kmaRequest)·앞에서부터 찾기(_kmaFirst)·덮개(12시간 창 규칙)·다시 보내기.
// 핵심: 보내는 수·기다림만 줄이고 '고르는 답'은 옛 방식과 같아야 한다. 옛 방식(전부 받은 뒤 앞에서부터 고르기 / 하나씩 차례로)을
// 이 파일 안에 그대로 옮겨 두고, 기상청 응답 규칙(아래 kmaModel)을 따르는 무작위 자료에서 둘의 답을 비교한다.
// 기상청 규칙(2026-10 실측): typ_now·td_now?tm=… 은 tm(UTC로 해석) 기준 '마지막 분석이 tm 이전 12시간 안'인 스톰만,
// 그 마지막 분석까지의 자취(+그때 예보)로 준다 — 마지막 분석 12시간 뒤 tm까지 포함, 13시간 뒤 제외.
const test = require('node:test');
const assert = require('node:assert/strict');
const appSource = require('../tools/app-source.cjs');   // js/·css/로 나뉜 앱을 '한 파일' 텍스트로 합쳐 읽는다(MODULES.md)
const path = require('node:path');
const vm = require('node:vm');

const html = appSource(path.join(__dirname, '..', 'index.html'));

// 이름으로 함수/상수 정의 하나를 잘라낸다(괄호 균형으로 끝 찾기) — typhoon-cluster-c.test.cjs와 같은 방식
function pick(name) {
  const heads = [`async function ${name}(`, `function ${name}(`, `const ${name} = `, `let ${name} = `];
  let s = -1;
  for (const h of heads) { s = html.indexOf(h); if (s >= 0) break; }
  assert.ok(s >= 0, 'not found: ' + name);
  const isFn = html.startsWith('function', s) || html.startsWith('async function', s);
  let i = s, depth = 0, q = null, seenBody = false;
  for (; i < html.length; i++) {
    const ch = html[i];
    if (q) { if (ch === '\\') { i++; continue; } if (ch === q) q = null; continue; }
    if (ch === '/' && html[i + 1] === '/') { i = html.indexOf('\n', i); continue; }
    if (ch === "'" || ch === '"' || ch === '`') { q = ch; continue; }
    if (ch === '{' || ch === '(' || ch === '[') { depth++; if (ch === '{') seenBody = true; continue; }
    if (ch === '}' || ch === ')' || ch === ']') { depth--; if (isFn && depth === 0 && ch === '}' && seenBody) { i++; break; } continue; }
    if (!isFn && depth === 0 && ch === ';') { i++; break; }
  }
  return html.slice(s, i);
}

const NAMES = [
  '_tnum', '_cnum', 'fmtKST', 'typPointFromRow', 'parseTypNow', 'typTdPointFromRow', 'parseTdRows', '_dtm', '_tmBack',
  '_scanEdgeReal', '_scanEdgeBoth', 'typhoonHasRows',
  'KMA_INFLIGHT_MAX', 'KMA_HEDGE_MS', '_kmaQ', '_kmaTmMs', '_kmaTmUnseen', '_kmaTtl', 'kmaRequest', '_kmaPumpSoon', '_kmaPump',
  '_kmaFirst', '_kmaCoverTm', '_typScanRecent', '_typPastFind',
  '_kmaTm', 'typhoonApiUrlTm', 'typhoonApiUrl', 'typhoonTdUrlTm', 'typhoonTdUrl',
];
const EXPORT = ['_scanEdgeReal', '_scanEdgeBoth', 'typhoonHasRows', 'kmaRequest', '_kmaFirst', '_kmaCoverTm', '_typScanRecent', '_typPastFind',
  'typhoonApiUrl', 'typhoonTdUrl', 'typhoonApiUrlTm', 'typhoonTdUrlTm', '_kmaTm', '_tmBack', '_dtm', '_kmaTmMs', 'parseTypNow', 'parseTdRows', 'typPointFromRow', 'typTdPointFromRow'];

// 앱 코드를 vm에 올린다. server(url, n번째) → { text, ms | hops, fail } 로 가짜 헬퍼를 정한다. hedgeMs로 다시 보내기 대기를 줄여 시험.
// ms가 있으면 그만큼(타이머), 없으면 hops번 setImmediate 뒤에 응답(빠르게 — 도착 순서만 뒤섞는다).
function sandbox(server, o = {}) {
  const log = { sent: [], active: 0, maxActive: 0, aborted: [] };
  const fetch = (url, opts) => new Promise((resolve, reject) => {
    const u = new URL(url);
    const k = u.searchParams.get('u');
    log.sent.push(k);
    log.active++; log.maxActive = Math.max(log.maxActive, log.active);
    const r = server(k, log.sent.filter((x) => x === k).length);
    let fin = false;
    const done = (fn) => { if (fin) return; fin = true; log.active--; fn(); };
    const reply = () => done(() => {
      if (r.fail === 'net') reject(new TypeError('Failed to fetch'));
      else resolve({ ok: !r.fail, status: r.fail ? 502 : 200, text: async () => (r.fail ? '{"ok": false}' : r.text) });
    });
    let t = null;
    if (r.ms) t = setTimeout(reply, r.ms);
    else { const hop = (n) => (n <= 0 ? reply() : setImmediate(() => hop(n - 1))); hop(r.hops || 0); }
    if (opts && opts.signal) opts.signal.addEventListener('abort', () => { clearTimeout(t); log.aborted.push(k); done(() => reject(new Error('AbortError'))); });
  });
  const ctx = { fetch, WNS_HELPER: 'http://127.0.0.1:3720', apiKey: () => 'KEY', setTimeout, clearTimeout, AbortController, console, URL };
  vm.createContext(ctx);
  vm.runInContext(`
    const NOW = { v: 0 };
    class FD extends Date { constructor(...a) { if (a.length === 0) super(NOW.v); else super(...a); } static now() { return NOW.v; } }
    globalThis.Date = FD; globalThis.NOW = NOW;`, ctx);
  let src = NAMES.map(pick).join('\n');
  if (o.hedgeMs != null) src = src.replace(/KMA_HEDGE_MS = \d+, KMA_HEDGE_BG_MS = \d+/, `KMA_HEDGE_MS = ${o.hedgeMs}, KMA_HEDGE_BG_MS = ${o.bgMs || o.hedgeMs * 5}`);
  vm.runInContext(src + '\n' + EXPORT.map((n) => `globalThis.${n} = ${n};`).join('\n') + '\nglobalThis._kmaQ = _kmaQ;', ctx);
  return { ctx, log };
}

// ── 기상청 응답 흉내(실측 규칙) ──
const H = 3600e3;
const p2 = (v) => String(v).padStart(2, '0');
const tmStr = (ms) => { const d = new Date(ms); return `${d.getUTCFullYear()}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}${p2(d.getUTCHours())}${p2(d.getUTCMinutes())}`; };
const tmMs = (s) => Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +s.slice(8, 10), +(s.slice(10, 12) || 0));
// storms: [{ kind:'typ'|'td', id, pts:[{ t(ms), lat, lon, ws }] }] (pts 시각순)
function kmaModel(storms) {
  return (kind, tm) => {
    const T = tmMs(tm);
    const rows = [];
    for (const s of storms) {
      if (s.kind !== kind) continue;
      const upto = s.pts.filter((p) => p.t <= T);
      if (!upto.length) continue;
      const a = upto[upto.length - 1];
      if (T - a.t > 12 * H) continue;   // 12시간 창(포함)
      const fc = [{ t: a.t + 12 * H, lat: a.lat + 1, lon: a.lon - 1, ws: a.ws }, { t: a.t + 24 * H, lat: a.lat + 2, lon: a.lon - 2, ws: a.ws }];
      upto.forEach((p, i) => rows.push(kind === 'typ'
        ? `0,2026,${s.id},${i + 1},0,${tmStr(p.t)},${tmStr(p.t)},${p.lat.toFixed(1)},${p.lon.toFixed(1)},W,20,990,${p.ws},100,50,0,SW,80,LOC,SW,40,=`
        : `0 2026 ${s.id} ${i + 1} 0 ${tmStr(p.t)} ${tmStr(p.t)} ${p.lat.toFixed(1)} ${p.lon.toFixed(1)} WNW 8 1002 ${p.ws} -9 - 괌 동쪽 해상`));
      fc.forEach((p, i) => rows.push(kind === 'typ'
        ? `1,2026,${s.id},0,${(i + 1) * 12},${tmStr(a.t)},${tmStr(p.t)},${p.lat.toFixed(1)},${p.lon.toFixed(1)},W,20,990,${p.ws},100,50,0,SW,80,LOC,SW,40,=`
        : `1 2026 ${s.id} ${upto.length} 0 ${tmStr(a.t)} ${tmStr(p.t)} ${p.lat.toFixed(1)} ${p.lon.toFixed(1)} WNW 8 1002 ${p.ws} 80 - 괌 동쪽 해상`));
    }
    return ['#START7777', '# FT YY TYP SEQ ...', ...rows, '#7777END'].join('\n');
  };
}
// 결정적 난수
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
// short: 짧게 살다 간 스톰(분석 1~3번)을 한곳(15N 140E 근처)·최근 3일에 몰아 둔다 — 덮개(12시간 창)가 틀리면 드러나는 경우
function randomWorld(seed, nowMs, short) {
  const R = rng(seed);
  const storms = [];
  const n = short ? 3 + Math.floor(R() * 6) : Math.floor(R() * 5);   // 보통 0~4개, short는 3~8개
  for (let s = 0; s < n; s++) {
    const kind = R() < 0.5 ? 'typ' : 'td';
    const step = R() < 0.25 ? 3 * H : 6 * H;
    const end = Math.floor((nowMs - R() * (short ? 3 : 4) * 24 * H) / step) * step;   // 지금 이전 0~4일 사이에 끝남(또는 진행 중)
    const len = 1 + Math.floor(R() * (short ? 3 : 16));
    let lat = short ? 12 + R() * 6 : 8 + R() * 20, lon = short ? 137 + R() * 6 : 125 + R() * 40;
    const pts = [];
    for (let i = len - 1; i >= 0; i--) { pts.push({ t: end - i * step, lat, lon, ws: 12 + Math.floor(R() * 30) }); lat += (R() - 0.3) * 1.5; lon -= R() * 2; }
    storms.push({ kind, id: kind === 'typ' ? 20 + s : 50 + s, pts });
  }
  return { storms, R };
}
const kindOf = (u) => (u.includes('td_now') ? 'td' : 'typ');
const tmOfUrl = (u) => /[?&]tm=(\d{10,12})/.exec(u)[1];

// ── 옛 방식(2026-10-08 이전 코드의 고르는 규칙) ──
const oldRecent = (get, urlOf) => { for (let b = 0; b <= 12; b++) { const t = get(urlOf(b)); if (S_hasRows(t)) return { i: b, text: t }; } return null; };
const S_hasRows = (t) => String(t).split(/\r?\n/).some((l) => l && l[0] !== '#' && /^\s*\d/.test(l));
function oldEdge(C, get, refPt, refT, dir, kind) {
  const base = String(refPt.tmef).replace(/\D/g, '').slice(0, 12).padEnd(12, '0');
  const urlOf = kind === 'typ' ? C.typhoonApiUrlTm : C.typhoonTdUrlTm;
  const parse = kind === 'typ' ? C.parseTypNow : C.parseTdRows;
  const ptOf = kind === 'typ' ? C.typPointFromRow : C.typTdPointFromRow;
  let best = null;
  const raws = []; for (let hb = 0; hb <= 48; hb += 6) raws.push(get(urlOf(C._tmBack(base, dir === 'back' ? hb : -hb))));
  for (let i = 0; i < raws.length && !best; i++) {
    const rows = parse(raws[i]); if (!rows.length) continue;
    const by = {}; for (const c of rows) { (by[(c[2] || '').trim()] ||= []).push(c); }
    for (const id of Object.keys(by)) {
      const pts = by[id].map(ptOf);
      let dmin = 1e9; for (const q of pts) { if (q.fcst) continue; const d = Math.hypot(q.lon - refPt.lon, q.lat - refPt.lat); if (d < dmin) dmin = d; }
      if (dmin < 8 && (!best || dmin < best.dmin)) best = { pts, dmin };
    }
  }
  if (!best) return [];
  const seen = {};
  const out = best.pts.filter((q) => !q.fcst && q.tmef && (dir === 'back' ? C._dtm(q.tmef) < refT : C._dtm(q.tmef) > refT))
    .filter((q) => { const k = C._dtm(q.tmef); if (seen[k]) return false; seen[k] = 1; return true; });
  out.forEach((q) => { q.td = (kind !== 'typ') && (+q.ws || 99) < 17; q._edgeTD = true; });
  return out;
}
function oldPast(C, get, base) {
  const offs = [0, -6, 6, -12, 12, -18, 18, -24, 24, -30, 30, -36, 36, -42, 42, -48, 48];
  for (const off of offs) {
    const tm = C._kmaTm(new Date(base.getTime() + off * H));
    const t = get(C.typhoonApiUrlTm(tm));
    if (S_hasRows(t)) { const td = get(C.typhoonTdUrlTm(tm)); return { raw: t, usedTm: tm, tdRaw: S_hasRows(td) ? td : '' }; }
  }
  return null;
}
const plain = (v) => JSON.parse(JSON.stringify(v));

// 무작위 세계 하나로 앱(sandbox)과 옛 방식 비교 준비. failRate: 일부 주소를 늘 실패(502·끊김)하게.
function world(seed, failRate = 0, short = false) {
  const nowMs = Date.UTC(2026, 7, 1) + Math.floor(rng(seed * 7 + 1)() * 60 * 24) * H + 37 * 60e3;   // 2026-08~10 아무 때(분 37)
  const { storms, R } = randomWorld(seed, nowMs, short);
  const model = kmaModel(storms);
  const failing = new Map();
  const failOf = (u) => { if (!failRate) return null; if (!failing.has(u)) { const r = rng([...u].reduce((a, c) => a * 31 + c.charCodeAt(0) | 0, seed))(); failing.set(u, r < failRate ? (r < failRate / 2 ? 'net' : 'http') : null); } return failing.get(u); };
  const get = (u) => (failOf(u) ? '' : model(kindOf(u), tmOfUrl(u)));
  const server = (u) => { const f = failOf(u); return { hops: Math.floor(R() * 6), fail: f, text: f ? '' : model(kindOf(u), tmOfUrl(u)) }; };
  const sb = sandbox(server);
  sb.ctx.NOW.v = nowMs;
  return { ...sb, storms, nowMs, get };
}

test('지금 태풍·TD 찾기(_typScanRecent): 무작위 200세계에서 옛 방식(13개 다 받고 가장 최근)과 같은 시각·본문을 고르고, 덜 묻는다', async () => {
  let sentNew = 0, sentOld = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const W = world(seed);
    for (const [urlOf, lane, a0, lazy] of [[W.ctx.typhoonApiUrl, 0, 3, false], [W.ctx.typhoonTdUrl, 1, 1, true]]) {
      const n0 = W.log.sent.length;
      const got = await W.ctx._typScanRecent(urlOf, lane, a0, lazy);
      const want = oldRecent(W.get, urlOf);
      assert.deepEqual(got && { i: got.i, text: got.text }, want && { i: want.i, text: want.text }, `seed ${seed} lane ${lane}`);
      sentNew += W.log.sent.length - n0; sentOld += 13;
    }
    assert.ok(W.log.maxActive <= 6, '동시 6개 넘게 보냄');
  }
  assert.ok(sentNew < sentOld * 0.5, `보낸 수 ${sentNew} / 옛 ${sentOld}`);
});

test('실패 응답이 끼어도 옛 방식과 같은 답(덮개로 건너뛰지 않고 직접 묻는다)', async () => {
  for (let seed = 1; seed <= 150; seed++) {
    const W = world(seed, 0.25);
    for (const [urlOf, lane, a0, lazy] of [[W.ctx.typhoonApiUrl, 0, 3, false], [W.ctx.typhoonTdUrl, 1, 1, true]]) {
      const got = await W.ctx._typScanRecent(urlOf, lane, a0, lazy);
      const want = oldRecent(W.get, urlOf);
      assert.deepEqual(got && { i: got.i, text: got.text }, want && { i: want.i, text: want.text }, `seed ${seed} lane ${lane}`);
    }
  }
});

test('0·12시간 전이 둘 다 비면 1~11시간 전은 안 묻는다(태풍 없는 철: 태풍·TD 합쳐 26번 → 6번 이하)', async () => {
  const W = world(0);
  W.ctx.NOW.v = Date.UTC(2026, 8, 10, 3);
  const [t, d] = await Promise.all([W.ctx._typScanRecent(W.ctx.typhoonApiUrl, 0, 3, false), W.ctx._typScanRecent(W.ctx.typhoonTdUrl, 1, 1, true)]);
  assert.equal(t, null); assert.equal(d, null);
  assert.ok(W.log.sent.length <= 6, '보낸 수 ' + W.log.sent.length);
  assert.ok(W.log.sent.filter((u) => u.includes('td_now')).length === 2, 'TD는 0·12시간 전 두 번만');
});

test('발생·소멸 TD 찾기(_scanEdgeReal): 무작위 세계·기준점에서 옛 방식과 같은 점들을 붙인다(짝수 시각 먼저, 홀수는 필요할 때만)', async () => {
  let sentNew = 0, sentOld = 0, nonEmpty = 0;
  for (let seed = 1; seed <= 160; seed++) {
    const W = world(seed, seed % 5 === 0 ? 0.2 : 0);
    const R = rng(seed * 13);
    const all = W.storms.flatMap((s) => s.pts);
    for (let k = 0; k < 4; k++) {
      // 기준점: 스톰의 첫/마지막 분석(실제 쓰임) 또는 근처 아무 점
      const s = W.storms.length ? W.storms[Math.floor(R() * W.storms.length)] : null;
      const p = s ? (R() < 0.5 ? s.pts[0] : s.pts[s.pts.length - 1]) : { t: W.nowMs - 24 * H, lat: 15, lon: 140 };
      const refPt = { tmef: tmStr(Math.floor(p.t / H) * H), lat: p.lat + (R() - 0.5) * 4, lon: p.lon + (R() - 0.5) * 4 };
      const refT = W.ctx._dtm(refPt.tmef);
      for (const dir of ['back', 'fwd']) {
        for (const kind of ['td', 'typ']) {
          const n0 = W.log.sent.length;
          const got = await W.ctx._scanEdgeReal(refPt, refT, dir, kind);
          const want = oldEdge(W.ctx, W.get, refPt, refT, dir, kind);
          assert.deepEqual(plain(got), plain(want), `seed ${seed} ${dir} ${kind}`);
          if (want.length) nonEmpty++;
          sentNew += W.log.sent.length - n0; sentOld += 9;
        }
      }
    }
    void all;
  }
  assert.ok(nonEmpty > 50, '붙는 경우도 충분히 시험됨: ' + nonEmpty);
  assert.ok(sentNew < sentOld * 0.6, `보낸 수 ${sentNew} / 옛 ${sentOld}`);
});

test('_scanEdgeBoth: TD·태풍 합치기(같은 시각이면 태풍 우선)도 옛 방식과 같다', async () => {
  for (let seed = 400; seed < 480; seed++) {
    const W = world(seed);
    if (!W.storms.length) continue;
    const s = W.storms[0];
    for (const [p, dir] of [[s.pts[0], 'back'], [s.pts[s.pts.length - 1], 'fwd']]) {
      const refPt = { tmef: tmStr(p.t), lat: p.lat, lon: p.lon };
      const refT = W.ctx._dtm(refPt.tmef);
      const got = await W.ctx._scanEdgeBoth(refPt, refT, dir);
      const a = oldEdge(W.ctx, W.get, refPt, refT, dir, 'td'), b = oldEdge(W.ctx, W.get, refPt, refT, dir, 'typ');
      const m = new Map(); for (const q of a) m.set(W.ctx._dtm(q.tmef), q); for (const q of b) m.set(W.ctx._dtm(q.tmef), q);
      assert.deepEqual(plain(got), plain([...m.values()].sort((x, y) => W.ctx._dtm(x.tmef) - W.ctx._dtm(y.tmef))), `seed ${seed} ${dir}`);
    }
  }
});

test('지난 날짜 찾기(_typPastFind): 옛 방식(17개 시각을 하나씩 차례로)과 같은 발표·TD를 고른다', async () => {
  let sentNew = 0, sentOld = 0;
  for (let seed = 1; seed <= 150; seed++) {
    const W = world(seed, seed % 4 === 0 ? 0.2 : 0);
    const R = rng(seed * 31);
    // 고른 날짜(정오) — 스톰 근처 또는 아무 날
    const s = W.storms.length && R() < 0.7 ? W.storms[Math.floor(R() * W.storms.length)] : null;
    const at = s ? s.pts[Math.floor(R() * s.pts.length)].t + (R() - 0.5) * 5 * 24 * H : W.nowMs - R() * 10 * 24 * H;
    const d = new Date(at);
    const base = new W.ctx.Date(`${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T12:00:00`);
    const n0 = W.log.sent.length;
    const got = await W.ctx._typPastFind(base);
    const want = oldPast(W.ctx, W.get, base);
    assert.deepEqual(got && plain(got), want, `seed ${seed}`);
    sentNew += W.log.sent.length - n0;
    sentOld += want ? 17 : 17;   // 옛 방식은 최악 17(+TD 1)
  }
  assert.ok(sentNew < sentOld, `보낸 수 ${sentNew} / 옛(최악) ${sentOld}`);
});

test('짧게 살다 간 스톰이 몰린 세계(덮개가 틀리면 드러남)에서도 세 가지 찾기 모두 옛 방식과 같다', async () => {
  let edgeHits = 0;
  for (let seed = 1000; seed < 1150; seed++) {
    const W = world(seed, 0, true);
    const R = rng(seed * 17);
    // 지금 태풍·TD
    for (const [urlOf, lane, a0, lazy] of [[W.ctx.typhoonApiUrl, 0, 3, false], [W.ctx.typhoonTdUrl, 1, 1, true]]) {
      const got = await W.ctx._typScanRecent(urlOf, lane, a0, lazy);
      const want = oldRecent(W.get, urlOf);
      assert.deepEqual(got && { i: got.i, text: got.text }, want && { i: want.i, text: want.text }, `recent seed ${seed} lane ${lane}`);
    }
    // 발생·소멸: 몰린 곳 근처 기준점, 최근 3일 아무 시각(6시간 격자)
    for (let k = 0; k < 4; k++) {
      const t = Math.floor((W.nowMs - R() * 3 * 24 * H) / (6 * H)) * 6 * H;
      const refPt = { tmef: tmStr(t), lat: 12 + R() * 6, lon: 137 + R() * 6 };
      const refT = W.ctx._dtm(refPt.tmef);
      for (const dir of ['back', 'fwd']) for (const kind of ['td', 'typ']) {
        const got = await W.ctx._scanEdgeReal(refPt, refT, dir, kind);
        const want = oldEdge(W.ctx, W.get, refPt, refT, dir, kind);
        assert.deepEqual(plain(got), plain(want), `edge seed ${seed} ${dir} ${kind}`);
        if (want.length) edgeHits++;
      }
    }
    // 지난 날짜
    const d = new Date(W.nowMs - R() * 3 * 24 * H);
    const base = new W.ctx.Date(`${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T12:00:00`);
    const got = await W.ctx._typPastFind(base);
    assert.deepEqual(got && plain(got), oldPast(W.ctx, W.get, base), `past seed ${seed}`);
  }
  assert.ok(edgeHits > 50, '붙는 경우: ' + edgeHits);
});

test('덮개(_kmaCoverTm): 6시간 홀수 배 시각만 ±6시간 이웃이 덮고, 간격이 어긋나면 덮지 않는다', () => {
  const { ctx } = sandbox(() => ({ text: '' }));
  const tms = [0, -6, 6, -12, 12, -18].map((h) => tmStr(Date.UTC(2026, 9, 1, 12) + h * H));
  const cov = ctx._kmaCoverTm(tms);
  assert.equal(cov(0), null);
  assert.deepEqual(plain(cov(1)), [3, 0]);   // -6시간 ← -12·0시간
  assert.deepEqual(plain(cov(2)), [0, 4]);   // +6시간 ← 0·+12시간
  assert.equal(cov(3), null);                // -12시간(짝수 배)
  assert.equal(cov(5), null);                // -18시간: -24시간이 목록에 없다
  const odd = [0, 7, 14].map((h) => tmStr(Date.UTC(2026, 9, 1, 12) + h * H));   // 6시간 배수가 아님
  const cov2 = ctx._kmaCoverTm(odd);
  assert.equal(cov2(1), null); assert.equal(cov2(2), null);
});

test('조회 줄: 동시 6개까지·우선순위 순서·같은 주소는 한 번·지난 시각은 기억(다시 안 물음)·취소한 대기 요청은 안 보냄', async () => {
  const W = sandbox(() => ({ text: '#START7777\n#7777END', ms: 5 }));
  W.ctx.NOW.v = Date.UTC(2026, 9, 8, 4);
  const U = (h) => W.ctx.typhoonApiUrlTm(tmStr(Date.UTC(2026, 9, 7, 0) - h * H));   // 모두 지난 시각
  const hs = [];
  for (let i = 0; i < 12; i++) hs.push(W.ctx.kmaRequest(U(i), 50 - i));   // 뒤에 넣은 것이 더 급함
  const dup = W.ctx.kmaRequest(U(0), 100);
  const dropped = W.ctx.kmaRequest(U(99), 999); dropped.cancel();
  await Promise.all(hs.map((h) => h.p));
  assert.equal(await dup.p, await hs[0].p);
  assert.ok(W.log.maxActive <= 6, 'maxActive ' + W.log.maxActive);
  assert.equal(W.log.sent.filter((u) => u === U(0)).length, 1, '같은 주소는 한 번');
  assert.ok(!W.log.sent.includes(U(99)), '취소한 대기 요청은 안 보냄');
  assert.deepEqual(W.log.sent.slice(0, 6), [11, 10, 9, 8, 7, 6].map(U), '급한 것부터');
  const n = W.log.sent.length;
  const again = W.ctx.kmaRequest(U(3), 0); await again.p;
  assert.equal(W.log.sent.length, n, '지난 시각은 10분 동안 다시 안 묻는다');
  W.ctx.NOW.v += 11 * 60e3;
  await W.ctx.kmaRequest(U(3), 0).p;
  assert.equal(W.log.sent.length, n + 1, '10분 지나면 다시 묻는다');
});

test('최근 시각(새 발표가 나올 수 있음)은 30초만 기억한다', async () => {
  const W = sandbox(() => ({ text: 'x', ms: 1 }));
  W.ctx.NOW.v = Date.UTC(2026, 9, 8, 4);
  const u = W.ctx.typhoonApiUrl(0);   // 지금 시각
  await W.ctx.kmaRequest(u, 0).p;
  await W.ctx.kmaRequest(u, 0).p;
  assert.equal(W.log.sent.length, 1);
  W.ctx.NOW.v += 31e3;
  await W.ctx.kmaRequest(u, 0).p;
  assert.equal(W.log.sent.length, 2);
});

test('다시 보내기: 늦으면 같은 주소를 한 번 더 보내 먼저 온 쪽을 쓰고 늦은 쪽은 끊는다(급한 조회는 빨리, 발생·소멸 확인은 더 기다렸다가)', async () => {
  const W = sandbox((u, nth) => ({ text: 'ok-' + u.slice(-4), ms: nth === 1 ? 1500 : 10 }), { hedgeMs: 30, bgMs: 300 });
  W.ctx.NOW.v = Date.UTC(2026, 9, 8, 4);
  const u1 = W.ctx.typhoonApiUrlTm('202610010000'), u2 = W.ctx.typhoonApiUrlTm('202610010600');
  const t0 = Date.now();
  const at = {};
  const [a, b] = await Promise.all([
    W.ctx.kmaRequest(u1, 0).p.then((t) => { at.a = Date.now() - t0; return t; }),
    W.ctx.kmaRequest(u2, 150).p.then((t) => { at.b = Date.now() - t0; return t; }),
  ]);
  assert.equal(a, 'ok-' + u1.slice(-4));
  assert.equal(b, 'ok-' + u2.slice(-4));
  assert.equal(W.log.sent.filter((x) => x === u1).length, 2, '급한 조회는 다시 보냄');
  assert.equal(W.log.sent.filter((x) => x === u2).length, 2, '발생·소멸 확인도 다시 보냄');
  assert.ok(W.log.aborted.includes(u1) && W.log.aborted.includes(u2), '늦은 쪽은 끊음');
  assert.ok(at.a < 250, '급한 쪽은 곧 다시 보내 빨리 받음: ' + at.a);
  assert.ok(at.b >= 280 && at.b < 900, '발생·소멸 쪽은 더 기다렸다가 다시 보냄: ' + at.b);
});

test('다시 보내기: 한쪽이 실패해도 다른 쪽 성공을 기다려 쓴다 / 둘 다 실패면 null', async () => {
  const W = sandbox((u, nth) => (u.includes('0000') ? { fail: nth === 1 ? 'net' : null, ms: nth === 1 ? 60 : 80, text: 'good' } : { fail: 'http', ms: 5 }), { hedgeMs: 20 });
  W.ctx.NOW.v = Date.UTC(2026, 9, 8, 4);
  assert.equal(await W.ctx.kmaRequest(W.ctx.typhoonApiUrlTm('202610010000'), 0).p, 'good');
  assert.equal(await W.ctx.kmaRequest(W.ctx.typhoonApiUrlTm('202610010600'), 0).p, null);
});

test('헬퍼가 실패를 주면(502·끊김) 조회 결과는 null — 옛 kmaGet처럼 빈 본문으로 판정되고 기억하지 않는다', async () => {
  let fail = true;
  const W = sandbox(() => ({ fail: fail ? 'http' : null, text: 'data', ms: 1 }));
  W.ctx.NOW.v = Date.UTC(2026, 9, 8, 4);
  const u = W.ctx.typhoonApiUrlTm('202610010000');
  assert.equal(await W.ctx.kmaRequest(u, 200).p, null);
  fail = false;
  assert.equal(await W.ctx.kmaRequest(u, 200).p, 'data');
});
