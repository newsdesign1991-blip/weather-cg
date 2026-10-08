// 미해군(JTWC) 자동 불러오기(js/typhoon-jtwc.js) — 네트워크 없이 본다.
// 픽스처(tests/fixtures/jtwc/)는 2026-10-08 실제로 받은 원문 그대로: 활동 중인 태풍 RSS(서태평양 27W KOGUMA, 날짜변경선을 넘어온 15E NOLO,
// 동태평양 20E SIMON·18E RACHEL)와 통보문 wp2726.tcw·ep1526.tcw. 줄바꿈(CRLF·LF 섞임)까지 그대로(.gitattributes -text).
// 흐름(팝업 열기 → 목록 → 고르기 → 통보문 받아 그리기, 없음·실패·닫음·웹판)은 가짜 DOM·가짜 wcgDesktop으로 vm에서 돌린다.
// 실제 사이트 받기·그리기는 desktop/test/boot-check.cjs로 따로 봤다(이 파일 머리 아래 '확인' 참고 — 보고서).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const appSource = require('../tools/app-source.cjs');   // js/·css/로 나뉜 앱을 '한 파일' 텍스트로 합쳐 읽는다(MODULES.md)

const root = path.join(__dirname, '..');
const html = appSource(path.join(root, 'index.html'));
const FIX = path.join(__dirname, 'fixtures', 'jtwc');
const RSS = fs.readFileSync(path.join(FIX, 'jtwc-20261008.rss'), 'utf8');
const TCW_WP = fs.readFileSync(path.join(FIX, 'wp2726.tcw'), 'utf8');
const TCW_EP = fs.readFileSync(path.join(FIX, 'ep1526.tcw'), 'utf8');
const plain = (v) => JSON.parse(JSON.stringify(v));   // vm 안에서 만든 객체(다른 realm) 비교용

// 이름으로 함수/상수 정의 하나를 잘라낸다(괄호 균형 — typhoon-cluster-c.test.cjs와 같은 방식)
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
// js/typhoon-jtwc.js 본문(합친 앱에서 그 표지부터 다음 파일 panels.js 표지까지)
const MOD = (() => {
  const a = html.indexOf('// ===================== 미해군(JTWC) 자동 불러오기');
  const b = html.indexOf('// ===================== 패널 =====================', a);
  assert.ok(a > 0 && b > a, 'typhoon-jtwc 본문을 못 찾음');
  return html.slice(a, b);
})();
const EXPORTS = ['JTWC_SITE', 'JTWC_RSS', 'jtwcCanFetch', 'jtwcGet', 'jtwcRssDate', 'jtwcIssuedUtc', 'parseJtwcRss', 'jtwcErrText', 'jtwcOpenSite', 'jtwcManual',
  'jtwcSyncButtons', 'jtwcModal', 'jtwcShowFail', 'jtwcFillList', 'fetchJtwc', 'loadJtwcStorm'];

// ───────── 가짜 DOM(필요한 만큼만) ─────────
class El {
  constructor(tag) { this.tagName = String(tag || 'div').toUpperCase(); this.children = []; this.dataset = {}; this.attrs = {}; this._t = ''; this.className = ''; this.title = ''; this.value = ''; this.isConnected = true; this.focused = 0; }
  append(...ns) { for (const n of ns) this.children.push(n); }
  get textContent() { return this._t + this.children.map((c) => c.textContent).join(''); }
  set textContent(v) { this.children = []; this._t = String(v); }
  set innerHTML(v) { this.children = []; this._t = String(v).replace(/<[^>]+>/g, ''); this._html = String(v); }
  get innerHTML() { return this._html || this._t; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  focus() { this.focused++; }
}
function makeEnv(o = {}) {
  const calls = { fetch: [], open: [], status: [], fx: [], arrive: [], undo: 0, apply: [], reveal: [], typArrive: 0 };
  const els = {};
  for (const id of ['typJtwcDl', 'tycJtwcDl', 'typPaste', 'tycPaste', 'typManual']) els['#' + id] = new El(id === 'typPaste' || id === 'tycPaste' ? 'textarea' : 'button');
  const modals = [];
  const ctx = {
    console, Promise, setTimeout, clearTimeout,
    window: {
      open: (u, t, f) => calls.open.push([u, t, f]),
      wcgDesktop: o.web ? { isDesktop: false } : { isDesktop: true, jtwcFetch: async (p) => { calls.fetch.push(p); const r = (o.answer || answerFixture)(p, calls.fetch.length); if (r instanceof Error) throw r; return r; } },
    },
    document: { createElement: (t) => new El(t) },
    $: (s) => els[s] || null,
    S: { typhoon: null },
    compare: !!o.compare, typhoonMap: o.typhoonMap !== false,
    status: (m, hold, tone) => calls.status.push([m, tone || '']),
    fxSec: (n) => 'sec:' + n,
    fxBusy: (t, on, opts) => calls.fx.push([t, on, opts && opts.lines]),
    fxArrive: (t) => calls.arrive.push(t),
    fxRows: (box) => box.children.slice(),
    typBusyFx: (btn, cmpSel) => (o.compare ? ['sec:typhoonCompare', els[cmpSel], 'tycList'] : ['sec:typhoon', btn]),
    typArriveFx: () => { calls.typArrive++; },
    pushUndo: () => { calls.undo++; },
    applyTyphoonText: (t) => { calls.apply.push([t, calls.undo]); return o.applyOk !== false; },
    foldReveal: (fold, focusEl) => calls.reveal.push([fold, focusEl]),
    tossModal: (opt) => {
      for (const x of modals) x.ov.isConnected = false;   // 새 모달이 앞 모달을 치운다(onClose 없이)
      const head = new El('div'), title = new El('div'), sub = new El('div'), body = new El('div'), foot = new El('div'), list = new El('div'), note = new El('p'), ov = new El('div');
      head.dataset.tone = opt.tone || 'blue'; title.textContent = opt.title || ''; sub.textContent = opt.sub || '';
      ov.querySelector = (s) => ({ '.tossHead': head, '.tossTitle': title, '.tossSub': sub })[s] || null;
      body.querySelector = (s) => ({ '.jtwcList': list, '.jtwcNote': note })[s] || null;
      const m = { ov, body, foot, head, title, sub, closed: 0, close() { if (m.closed) return; m.closed++; ov.isConnected = false; if (opt.onClose) opt.onClose(); } };
      modals.push(m);
      return m;
    },
  };
  ctx.isTyphoonCompare = () => ctx.compare;
  ctx.isTyphoon = () => ctx.typhoonMap;
  vm.createContext(ctx);
  vm.runInContext(pick('fmtKST') + '\n' + pick('parseJtwcTcw') + '\n' + MOD + '\n' + EXPORTS.map((n) => `globalThis.${n} = ${n};`).join('\n'), ctx);
  const cur = () => modals[modals.length - 1];
  const footLabels = (m) => m.foot.children.map((b) => b.textContent);
  const press = (m, label) => { const b = m.foot.children.find((x) => x.textContent === label); assert.ok(b, `버튼 ${label} 없음 — ${footLabels(m)}`); b.onclick(); };
  return { ctx, calls, els, modals, cur, footLabels, press };
}
function answerFixture(p) {
  if (p === 'rss/jtwc.rss') return { ok: true, status: 200, text: RSS };
  if (p === 'products/wp2726.tcw') return { ok: true, status: 200, text: TCW_WP };
  if (p === 'products/ep1526.tcw') return { ok: true, status: 200, text: TCW_EP };
  return { ok: false, err: 'http', status: 404 };
}
const tick = async (n = 6) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };
// 켠 효과를 같은 배열로 다 껐는지
function fxBalanced(calls) {
  const on = calls.fx.filter((c) => c[1]), off = calls.fx.filter((c) => !c[1]);
  assert.equal(on.length, off.length, '켠 만큼 끄지 않음');
  for (const c of on) assert.ok(off.some((d) => d[0] === c[0]), '켤 때와 끌 때 대상 배열이 다름');
}

// ───────── 목록(RSS) 해석 ─────────
test('RSS 해석 — 실제 원문: 서태평양(27W) 먼저, 날짜변경선을 넘어온 15E는 그다음, 동태평양은 아래. 번호·이름·등급·통보 번호·발표 시각(한국 시각)', () => {
  const { ctx } = makeEnv();
  const r = ctx.parseJtwcRss(RSS);
  assert.equal(r.valid, true);
  assert.equal(r.built, 'Thu, 08 Oct 2026 16:28:02 +0000');
  assert.equal(r.builtKo, '10월 9일 1시');
  assert.deepEqual(plain(r.storms.map((s) => s.code)), ['wp2726', 'ep1526', 'ep2026', 'ep1826']);
  const k = r.storms[0];
  assert.deepEqual(plain({ id: k.id, name: k.name, kind: k.kind, kindKo: k.kindKo, warnNo: k.warnNo, issuedUtc: k.issuedUtc, issuedKo: k.issuedKo, region: k.region, rank: k.rank, path: k.path, year: k.year, area: k.area }),
    { id: '27W', name: 'Koguma', kind: 'typhoon', kindKo: '태풍', warnNo: 15, issuedUtc: '202610081500', issuedKo: '10월 9일 0시', region: '서태평양', rank: 0, path: 'products/wp2726.tcw', year: '2026', area: 'NWPAC-NIO-WARNINGS' });
  const n = r.storms[1];
  assert.deepEqual(plain({ id: n.id, name: n.name, kindKo: n.kindKo, warnNo: n.warnNo, region: n.region, rank: n.rank }), { id: '15E', name: 'Nolo', kindKo: '열대폭풍', warnNo: 72, region: '동태평양 → 서태평양', rank: 1 });
  // 한 item에 태풍이 둘(제목 앞에 <p><b>가 겹쳐 있어도) — 각자 제목·발표 시각과 짝
  assert.deepEqual(plain(r.storms.slice(2).map((s) => [s.id, s.name, s.warnNo, s.issuedUtc, s.region, s.rank])),
    [['20E', 'Simon', 5, '202610081600', '동태평양', 2], ['18E', 'Rachel', 46, '202610081600', '동태평양', 2]]);
});

test('RSS 해석 — 태풍 없음은 정상(valid, 빈 목록), RSS가 아닌 응답(오류 페이지)은 valid=false, CDATA 없는 description도 읽는다', () => {
  const { ctx } = makeEnv();
  const none = RSS.replace(/<description><!\[CDATA\[[\s\S]*?\]\]><\/description>/g, "<description><![CDATA[<ul><li><font color='red'>No Current Tropical Cyclone Warnings.</font></li></ul>]]></description>");
  const r0 = ctx.parseJtwcRss(none);
  assert.equal(r0.valid, true); assert.equal(r0.storms.length, 0);
  const bad = ctx.parseJtwcRss('<!DOCTYPE html><html><body>403 Forbidden</body></html>');
  assert.equal(bad.valid, false); assert.equal(bad.storms.length, 0);
  assert.equal(ctx.parseJtwcRss('').valid, false);
  // 이스케이프된 description(&lt;…&gt;)
  const esc = '<rss version="2.0"><channel><lastBuildDate>Mon, 02 Nov 2026 03:00:00 +0000</lastBuildDate><item><guid>NWPAC-NIO-WARNINGS</guid><description>'
    + '&lt;p&gt;&lt;b&gt;Super Typhoon  31W (Bebinca) Warning #22 &lt;/b&gt;&lt;br&gt;&lt;b&gt;Issued at 31/2100Z&lt;b&gt;'
    + '&lt;a href=&apos;https://www.metoc.navy.mil/jtwc/products/wp3126.tcw&apos;&gt;JMV 3.0 Data&lt;/a&gt;</description></item></channel></rss>';
  const r1 = ctx.parseJtwcRss(esc);
  assert.equal(r1.storms.length, 1);
  assert.deepEqual(plain([r1.storms[0].id, r1.storms[0].kindKo, r1.storms[0].issuedUtc]), ['31W', '슈퍼태풍', '202610312100'], '월말을 넘긴 발표는 지난달');
});

test('RSS 해석 — 제목 형식이 바뀌어도 .tcw 링크만 있으면 파일 이름으로 올린다, 같은 태풍이 두 번 나오면 한 번만', () => {
  const { ctx } = makeEnv();
  const x = '<rss><channel><pubDate>Fri, 09 Oct 26 00:00:00 +0000</pubDate>'
    + "<item><guid>SH-WARNINGS</guid><description><![CDATA[<a href='https://www.metoc.navy.mil/jtwc/products/sh0527.tcw'>x</a>]]></description></item>"
    + "<item><guid>NWPAC-NIO-WARNINGS</guid><description><![CDATA[<a href='https://www.metoc.navy.mil/jtwc/products/wp2826.tcw'>a</a><a href='https://www.metoc.navy.mil/jtwc/products/wp2826.tcw'>b</a>]]></description></item></channel></rss>";
  const r = ctx.parseJtwcRss(x);
  assert.deepEqual(plain(r.storms.map((s) => [s.code, s.id, s.region, s.rank, s.name, s.issuedUtc])), [['wp2826', '28W', '서태평양', 0, '', ''], ['sh0527', '05', '남반구', 2, '', '']]);
  // 남의 사이트 .tcw 주소는 목록에 올리지 않는다(메인도 거절하지만 여기서부터)
  const evil = ctx.parseJtwcRss("<rss><channel><item><description><![CDATA[Typhoon 27W (X) Warning #1 <a href='https://evil.example/jtwc/products/wp2726.tcw'>x</a>]]></description></item></channel></rss>");
  assert.equal(evil.storms.length, 0);
});

test('발표 시각 — 기준(RSS 갱신일)보다 날이 크면 지난달, 1월이면 지난해 12월', () => {
  const { ctx } = makeEnv();
  assert.equal(ctx.jtwcIssuedUtc('08', '1500', { y: 2026, m: 10, d: 8 }), '202610081500');
  assert.equal(ctx.jtwcIssuedUtc('09', '0000', { y: 2026, m: 10, d: 8 }), '202610090000', '하루 앞(시차)은 같은 달');
  assert.equal(ctx.jtwcIssuedUtc('31', '1800', { y: 2026, m: 11, d: 1 }), '202610311800');
  assert.equal(ctx.jtwcIssuedUtc('31', '1800', { y: 2027, m: 1, d: 1 }), '202612311800');
  assert.equal(ctx.jtwcIssuedUtc('8', '15', { y: 2026, m: 10, d: 8 }), '', '형식이 다르면 빈 값');
  assert.equal(ctx.jtwcIssuedUtc('08', '1500', null), '');
  assert.deepEqual(plain(ctx.jtwcRssDate('Thu, 08 Oct 26 16:28:02 +0000')), { y: 2026, m: 10, d: 8, hh: 16, mi: 28 });
  assert.equal(ctx.jtwcRssDate('어제'), null);
});

// ───────── 통보문(.tcw) — 붙여넣기·끌어놓기와 같은 파서 ─────────
test('통보문 파서 — 실제 wp2726.tcw: KOGUMA(JTWC 27W), 베스트트랙 22점 + 예보 8점, 반경·풍속 단위 변환 / ep1526: 해역 글자 E', () => {
  const { ctx } = makeEnv();
  const [k] = ctx.parseJtwcTcw(TCW_WP);
  assert.equal(k.name, 'KOGUMA (JTWC 27W)');
  assert.equal(k.tno, '27'); assert.equal(k.td, false);
  const pts = k.points;
  assert.equal(pts.length, 30);
  assert.equal(pts.filter((p) => !p.fcst).length, 22);
  assert.deepEqual(plain(pts.map((p) => p.tmef)), [...pts.map((p) => p.tmef)].sort(), '시간순');
  assert.deepEqual(plain([pts[0].tmef, pts[0].lat, pts[0].lon, pts[0].ws]), ['202610030600', 8.1, 167.9, 10]);
  const now = pts[21];   // T000(분석) — 예보줄이 베스트트랙보다 우선(반경 포함)
  assert.deepEqual(plain([now.tmef, now.lat, now.lon, now.ws, now.r15, now.r25, now.fcst]), ['202610081200', 17.7, 159, 33, 167, 93, false]);
  assert.deepEqual(plain([pts[29].tmef, pts[29].lat, pts[29].lon, pts[29].fcst]), ['202610131200', 33, 149.3, true]);
  const [n] = ctx.parseJtwcTcw(TCW_EP);
  assert.equal(n.name, 'NOLO (JTWC 15E)');
  // 동태평양(서경 108.5W)에서 생겨 날짜변경선을 넘어온 태풍 — 서경은 동경 연속값(360-)이라 선이 날짜변경선에서 튀지 않는다
  assert.ok(n.points.length > 100 && n.points.every((p) => p.lon > 140 && p.lon < 260));
  assert.ok(n.points.every((p, i) => !i || Math.abs(p.lon - n.points[i - 1].lon) < 15), '날짜변경선에서 튐');
  assert.ok(n.points[0].lon > 250 && n.points.at(-1).lon < 170);
  // 북인도양(B)·남반구(S) 머리 줄도 읽는다(예전엔 W·E·C만)
  const io = ['WTIO31 PGTW 100300', '2026101000 03B THREE 001 01 300 05 SATL 030', 'T000 150N 0880E 035', 'T012 160N 0870E 040'].join('\n');
  assert.equal(ctx.parseJtwcTcw(io)[0].name, 'THREE (JTWC 03B)');
});

// ───────── 흐름 ─────────
test('흐름 — 누르면 팝업이 바로 뜨고(자리표시) 목록이 서태평양 먼저 들어온다 → 고르면 통보문을 받아 붙여넣기와 같은 길로 그린다', async () => {
  const e = makeEnv();
  const p = e.ctx.fetchJtwc();
  const m = e.cur();
  assert.ok(m, '팝업이 바로 떠야 함');
  assert.deepEqual(plain(e.calls.fx[0]), [['sec:typhoon', plain(e.els['#typJtwcDl']), plain(m.list)], true, 3], '섹션·버튼·팝업 목록 자리(막대 3줄)');
  await p;
  assert.deepEqual(e.calls.fetch, ['rss/jtwc.rss']);
  const kids = m.list.children;
  assert.deepEqual(kids.map((c) => (c.className === 'jtwcGroup' ? '#' + c.textContent : c.children[0].textContent)), ['#서태평양 · 한국 쪽', '27W', '#다른 해역', '15E', '20E', '18E']);
  const k = kids[1];
  assert.equal(k.children[1].children[0].textContent, 'KOGUMA태풍');
  assert.equal(k.children[1].children[1].textContent, '서태평양 · 통보 15호 · 10월 9일 0시 발표');
  assert.equal(kids[3].dataset.far, '1');
  assert.deepEqual(e.footLabels(m), ['사이트 열기', '닫기']);
  assert.match(m.note.textContent, /목록 갱신 10월 9일 1시/);
  fxBalanced(e.calls);
  assert.equal(e.calls.arrive.length, 1, '목록 행 도착 효과');
  // 고르기
  e.calls.fx.length = 0;
  k.onclick();
  assert.equal(m.closed, 1, '고르면 팝업 닫힘');
  await tick();
  assert.deepEqual(e.calls.fetch, ['rss/jtwc.rss', 'products/wp2726.tcw']);
  assert.equal(e.calls.apply.length, 1);
  assert.equal(e.calls.apply[0][0], TCW_WP, '받은 원문 그대로');
  assert.equal(e.calls.apply[0][1], 1, '그리기 전에 되돌리기 기록');
  assert.equal(e.els['#typPaste'].value, TCW_WP, "'자동이 안 될 때' 칸에도 원문");
  assert.equal(e.calls.typArrive, 1);
  fxBalanced(e.calls);
  assert.deepEqual(plain(e.calls.fx[0][0]), ['sec:typhoon', plain(e.els['#typJtwcDl'])]);
});

test('흐름 — 비교 지도: 비교 쪽 버튼·목록 자리 효과, 고르면 같은 길(비교 추가는 selectTyphoonFromApi가 한다)', async () => {
  const e = makeEnv({ compare: true });
  await e.ctx.fetchJtwc();
  assert.equal(e.calls.fx[0][0][1], e.els['#tycJtwcDl']);
  e.cur().list.children[1].onclick();
  await tick();
  assert.equal(e.calls.apply.length, 1);
  assert.deepEqual(plain(e.calls.fx.at(-1)[0]), ['sec:typhoonCompare', plain(e.els['#tycJtwcDl']), 'tycList']);
  fxBalanced(e.calls);
});

test('없음 — 활동 중인 태풍이 없으면 정상 안내(초록), 서태평양에만 없으면 그 묶음에 없음 한 줄 + 다른 해역 목록', async () => {
  const none = RSS.replace(/<description><!\[CDATA\[[\s\S]*?\]\]><\/description>/g, '<description><![CDATA[<ul><li>No Current Tropical Cyclone Warnings.</li></ul>]]></description>');
  const e = makeEnv({ answer: () => ({ ok: true, status: 200, text: none }) });
  await e.ctx.fetchJtwc();
  const m = e.cur();
  assert.equal(m.list.children.length, 1);
  assert.equal(m.list.children[0].dataset.tone, 'ok');
  assert.equal(m.list.children[0].textContent, '지금 활동 중인 태풍이 없어요(미해군 기준)');
  assert.deepEqual(e.footLabels(m), ['사이트 열기', '확인']);
  assert.deepEqual(plain(e.calls.status.at(-1)), ['지금 활동 중인 태풍이 없어요(미해군 기준)', 'ok']);
  assert.equal(e.calls.apply.length, 0);
  fxBalanced(e.calls);
  // 서태평양만 없음
  const farOnly = RSS.replace(/products\/wp2726/g, 'products/io0326');
  const e2 = makeEnv({ answer: () => ({ ok: true, status: 200, text: farOnly }) });
  await e2.ctx.fetchJtwc();
  const kids = e2.cur().list.children;
  assert.equal(kids[0].textContent, '서태평양 · 한국 쪽');
  assert.equal(kids[1].className, 'jtwcNone');
  assert.equal(kids[2].textContent, '다른 해역');
});

test('실패 — 연결 실패·시간 초과·HTTP 오류·형식 이상은 빨간 안내 + 다시 시도·사이트 열기·직접 붙여넣기(접힌 수동 묶음을 이번만 펼침)', async () => {
  const e = makeEnv({ answer: () => ({ ok: false, err: 'net', detail: 'net::ERR_INTERNET_DISCONNECTED' }) });
  await e.ctx.fetchJtwc();
  const m = e.cur();
  assert.equal(m.head.dataset.tone, 'red');
  assert.equal(m.title.textContent, '미해군(JTWC) 자료를 못 받았어요');
  assert.equal(m.list.children[0].dataset.tone, 'err');
  assert.match(m.list.children[0].textContent, /인터넷 연결을 확인해 주세요 \(net::ERR_INTERNET_DISCONNECTED\)/);
  assert.deepEqual(e.footLabels(m), ['다시 시도', '사이트 열기', '직접 붙여넣기']);
  assert.equal(e.calls.status.at(-1)[1], 'err');
  fxBalanced(e.calls);
  e.press(m, '직접 붙여넣기');
  assert.deepEqual(e.calls.reveal, [[e.els['#typManual'], e.els['#typPaste']]]);
  // 사이트 열기 — 붙여넣을 칸도 펼친다
  await e.ctx.fetchJtwc();
  e.press(e.cur(), '사이트 열기');
  assert.equal(e.calls.reveal.length, 2);
  assert.deepEqual(e.calls.open.at(-1), ['https://www.metoc.navy.mil/jtwc/jtwc.html', '_blank', 'noopener']);
  // 다시 시도 — 같은 요청을 다시
  await e.ctx.fetchJtwc();
  const n = e.calls.fetch.length;
  e.press(e.cur(), '다시 시도');
  await tick();
  assert.equal(e.calls.fetch.length, n + 1);
  // 비교 지도의 직접 붙여넣기 = 비교 쪽 붙여넣기 칸
  const c = makeEnv({ compare: true, answer: () => ({ ok: false, err: 'timeout' }) });
  await c.ctx.fetchJtwc();
  assert.match(c.cur().list.children[0].textContent, /15초 동안 응답하지 않았어요/);
  c.press(c.cur(), '직접 붙여넣기');
  assert.equal(c.els['#tycPaste'].focused, 1);
  assert.equal(c.calls.reveal.length, 0);
  // 받기 함수가 던져도(IPC 오류) 같은 안내
  const t = makeEnv({ answer: () => new Error('IPC 끊김') });
  await t.ctx.fetchJtwc();
  assert.match(t.cur().list.children[0].textContent, /IPC 끊김/);
  fxBalanced(t.calls);
  // RSS가 아니면 형식 안내(‘없음’과 구별)
  const f = makeEnv({ answer: () => ({ ok: true, status: 200, text: '<html>점검 중</html>' }) });
  await f.ctx.fetchJtwc();
  assert.match(f.cur().list.children[0].textContent, /태풍 목록\(RSS\)을 읽지 못했어요/);
});

test('실패 — 통보문(.tcw)을 못 받거나 못 읽으면 그리지 않고(되돌리기 기록도 없이) 그 태풍으로 다시 시도', async () => {
  const e = makeEnv({ answer: (p) => (p === 'rss/jtwc.rss' ? { ok: true, status: 200, text: RSS } : { ok: false, err: 'http', status: 503 }) });
  await e.ctx.fetchJtwc();
  e.cur().list.children[1].onclick();
  await tick();
  assert.equal(e.calls.apply.length, 0); assert.equal(e.calls.undo, 0); assert.equal(e.calls.typArrive, 0);
  const m = e.cur();
  assert.equal(m.sub.textContent, '27W Koguma 통보문');
  assert.match(m.list.children[0].textContent, /응답 503/);
  fxBalanced(e.calls);
  e.press(m, '다시 시도');
  await tick();
  assert.equal(e.calls.fetch.at(-1), 'products/wp2726.tcw', '목록이 아니라 그 태풍 통보문을 다시');
  // 받았지만 통보문이 아님
  const g = makeEnv({ answer: (p) => (p === 'rss/jtwc.rss' ? { ok: true, status: 200, text: RSS } : { ok: true, status: 200, text: '<html>not found</html>' }) });
  await g.ctx.fetchJtwc();
  g.cur().list.children[1].onclick();
  await tick();
  assert.equal(g.calls.apply.length, 0); assert.equal(g.calls.undo, 0);
  assert.match(g.cur().list.children[0].textContent, /통보문\(\.tcw\)을 읽지 못했어요/);
});

test('닫음·지도 바꿈·웹판 — 받는 사이 팝업을 닫으면 버리고, 태풍 지도가 아니게 됐으면 안 그리고, 직접 받을 수 없으면 사이트를 연다', async () => {
  // 받는 사이 닫음
  let release;
  const e = makeEnv({ answer: () => new Promise((r) => { release = () => r({ ok: true, status: 200, text: RSS }); }) });
  const p = e.ctx.fetchJtwc();
  e.cur().close();
  release(); await p;
  assert.equal(e.cur().list.children.length, 0, '닫힌 팝업에 목록을 그리지 않음');
  assert.equal(e.modals.length, 1, '새 팝업도 안 띄움');
  fxBalanced(e.calls);
  // 통보문을 받는 사이 다른 지도로
  const s = makeEnv();
  await s.ctx.fetchJtwc();
  s.cur().list.children[1].onclick();
  s.ctx.typhoonMap = false;
  await tick();
  assert.equal(s.calls.apply.length, 0);
  assert.equal(s.calls.status.at(-1)[1], 'warn');
  fxBalanced(s.calls);
  // 웹판(jtwcFetch 없음) — 예전처럼 사이트 열기, 팝업 없음
  const w = makeEnv({ web: true });
  await w.ctx.fetchJtwc();
  assert.equal(w.modals.length, 0);
  assert.deepEqual(w.calls.open, [['https://www.metoc.navy.mil/jtwc/jtwc.html', '_blank', 'noopener']]);
  assert.equal(w.calls.fetch.length, 0);
});

test('버튼 이름 — 데스크톱은 불러오기, 직접 받을 수 없으면 예전 사이트 링크(→)', () => {
  const d = makeEnv();
  d.ctx.jtwcSyncButtons();
  assert.equal(d.els['#typJtwcDl'].textContent, '미해군(JTWC)에서 불러오기');
  assert.equal(d.els['#tycJtwcDl'].textContent, '미해군(JTWC)');
  const w = makeEnv({ web: true });
  w.ctx.jtwcSyncButtons();
  assert.equal(w.els['#typJtwcDl'].textContent, '미해군(JTWC) 자료 받기 →');
  assert.equal(w.els['#tycJtwcDl'].textContent, '미해군(JTWC) →');
  // 버튼 라벨에 이모지 없음
  for (const t of [d, w]) for (const id of ['#typJtwcDl', '#tycJtwcDl']) assert.doesNotMatch(t.els[id].textContent, /\p{Extended_Pictographic}/u);
});

test('오류 문구 — 종류별 한 줄', () => {
  const { ctx } = makeEnv();
  assert.match(ctx.jtwcErrText({ err: 'timeout' }), /15초/);
  assert.match(ctx.jtwcErrText({ err: 'http', status: 403 }), /응답 403/);
  assert.match(ctx.jtwcErrText({ err: 'too-big' }), /너무 커서/);
  assert.match(ctx.jtwcErrText({ err: 'format', what: 'tcw' }), /통보문/);
  assert.match(ctx.jtwcErrText({ err: 'format' }), /RSS/);
  assert.match(ctx.jtwcErrText({ err: 'denied' }), /허용되지 않은 주소/);
  assert.equal(ctx.jtwcErrText({ err: 'net' }), '인터넷 연결을 확인해 주세요.');
  assert.equal(ctx.jtwcErrText(null), '인터넷 연결을 확인해 주세요.');
});

// ───────── 마크업·배선 ─────────
test('마크업·배선 — 두 버튼이 fetchJtwc, 태풍 수동 붙여넣기는 접이식 묶음(기본 접힘·특보와 같은 부품), 목록 글은 textContent로만', () => {
  assert.match(pick('wireTyphoonPanel'), /const jtwcDl = \$\('#typJtwcDl'\); if \(jtwcDl\) jtwcDl\.onclick = \(\) => fetchJtwc\(\);/);
  assert.match(pick('wireTyphoonPanel'), /jtwcSyncButtons\(\);/);
  assert.match(pick('wireCompareSection'), /const dl = \$\('#tycJtwcDl'\); if \(dl\) dl\.onclick = \(\) => fetchJtwc\(\);/);
  assert.doesNotMatch(html.slice(html.indexOf('function wireCompareSection('), html.indexOf('function wireTyphoonPanel(')), /metoc\.navy\.mil/, '사이트 주소는 JTWC_SITE 하나');
  assert.match(html, /<button id="typJtwcDl"[^>]*>미해군\(JTWC\)에서 불러오기<\/button>/);
  assert.match(html, /<button id="tycJtwcDl"[^>]*>미해군\(JTWC\)<\/button>/);
  assert.match(html, /<button type="button" class="subhead subFoldHead" id="typManualHead" aria-expanded="false" aria-controls="typManual">자동이 안 될 때 <span>· 수동 붙여넣기<\/span><\/button>\s*<div class="subFold closed" id="typManual">\s*<div class="subFoldInner">/);
  assert.match(pick('wire'), /foldWire\(\$\('#typManual'\), 'wcg_typ_manual_open'\);/);
  // 바깥 글(RSS)은 innerHTML로 넣지 않는다 — innerHTML은 고정 문구(실패 안내 덧말)만
  const inner = [...MOD.matchAll(/\.innerHTML = ([^;]+);/g)].map((x) => x[1]);
  assert.deepEqual(inner, ["'대신 사이트에서 통보문(<b>.tcw</b>)을 받아 <b>창에 끌어다 놓거나</b> 붙여넣어도 돼요.'"]);
});
