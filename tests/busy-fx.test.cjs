// 작업 중·도착 효과(js/busy-fx.js) — 겹친 작업 세기, 실패해도 꺼짐(fxRun), 버튼 비활성 되돌리기, 자리표시 막대, 안전 해제(maxMs),
// 움직임 줄이기, 도착 떠오름 차례, 진행 막대 값. 그리고 불러오기·추출 함수들이 켠 효과를 finally에서 끄는지(짝).
// 앱 코드는 tools/app-source.cjs로 합쳐 읽고(MODULES.md), 작은 가짜 DOM 위 vm에서 돌린다.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const appSource = require('../tools/app-source.cjs');

const html = appSource(path.join(__dirname, '..', 'index.html'));
const START = '// ===================== 작업 중·도착 효과';
const END = '// ===================== 배치 지정하기';   // 다음 모듈(js/preset-slots.js) 첫 줄
const src = (() => {
  const a = html.indexOf(START), b = html.indexOf(END, a);
  assert.ok(a > 0 && b > a, '작업 중 효과 모듈 위치를 못 찾음');
  return html.slice(a, b);
})();

// ---- 가짜 DOM(이 모듈이 쓰는 만큼만) ----
class ClassList {
  constructor() { this.s = new Set(); }
  add(...c) { c.forEach((x) => this.s.add(x)); }
  remove(...c) { c.forEach((x) => this.s.delete(x)); }
  contains(c) { return this.s.has(c); }
}
function world({ reduced = false } = {}) {
  const all = [];
  const timers = new Map(); let tid = 0;
  const mk = (tag, { cls = [], id = '', tb = false } = {}) => {
    const el = {
      nodeType: 1, tagName: tag.toUpperCase(), id, classList: new ClassList(), attrs: {}, disabled: false, children: [], after: null, anims: [],
      style: { props: {}, setProperty(k, v) { this.props[k] = v; }, removeProperty(k) { delete this.props[k]; } },
      setAttribute(k, v) { this.attrs[k] = String(v); }, removeAttribute(k) { delete this.attrs[k]; },
      closest(sel) { return sel === '#titlebar' && tb ? {} : null; },
      append(...n) { this.children.push(...n); },
      animate(kf, o) { this.anims.push({ kf, o }); return {}; },
      get offsetWidth() { return 10; },
      set className(v) { this.classList = new ClassList(); String(v).split(/s+/).filter(Boolean).forEach((c) => this.classList.add(c)); },
    };
    el.after = (n) => { el.next = n; n.removed = false; n.remove = () => { n.removed = true; if (el.next === n) el.next = null; }; };
    cls.forEach((c) => el.classList.add(c));
    all.push(el);
    return el;
  };
  const byId = {};
  const document = {
    createElement: (t) => mk(t),
    querySelector: (sel) => byId[sel] || null,
    querySelectorAll: (sel) => (sel === '.fx-tb.fx-on' ? all.filter((e) => e.classList.contains('fx-tb') && e.classList.contains('fx-on')) : []),
  };
  const ctx = {
    document,
    window: { matchMedia: () => ({ matches: reduced }) },
    setTimeout: (fn) => { const i = ++tid; timers.set(i, fn); return i; },
    clearTimeout: (i) => { timers.delete(i); },
  };
  vm.createContext(ctx);
  vm.runInContext("'use strict';\n" + src, ctx, { filename: 'busy-fx.js' });
  const flush = () => { for (const [i, fn] of [...timers]) { timers.delete(i); fn(); } };
  const reg = (sel, el) => { byId[sel] = el; return el; };
  return { ctx, mk, reg, flush, timers };
}
const on = (el) => el.classList.contains('fx-on');
const has = (el, c) => el.classList.contains(c);

test('겹친 작업은 센다 — 마지막 끄기에서만 꺼지고, .5초 사라짐 뒤 가상 요소 클래스까지 치운다', () => {
  const { ctx, mk, flush } = world();
  const sec = mk('div', { cls: ['sec'] });
  ctx.fxBusy(sec, true); ctx.fxBusy(sec, true);
  assert.ok(on(sec) && has(sec, 'fx-glow')); assert.equal(sec.attrs['aria-busy'], 'true');
  ctx.fxBusy(sec, false);
  assert.ok(on(sec), '한 작업이 아직 남았는데 꺼짐');
  ctx.fxBusy(sec, false);
  assert.ok(!on(sec) && has(sec, 'fx-out') && has(sec, 'fx-glow'), '끄면 사라지는 중(.fx-out)으로');
  assert.equal(sec.attrs['aria-busy'], undefined);
  flush();
  assert.ok(!has(sec, 'fx-out') && !has(sec, 'fx-glow'), '사라짐 뒤에도 클래스가 남음(애니메이션이 안 멈춤)');
  // 켜지 않은 채 끄기는 아무 일 없음 — 횟수가 음수가 되어 다음 켜기가 안 꺼지는 일이 없어야
  ctx.fxBusy(sec, false); ctx.fxBusy(sec, false);
  ctx.fxBusy(sec, true); assert.ok(on(sec));
  ctx.fxBusy(sec, false); assert.ok(!on(sec));
});

test('사라지는 중에 다시 켜면 이어서 켜짐(사라짐 타이머가 나중에 끄지 않는다)', () => {
  const { ctx, mk, flush } = world();
  const sec = mk('div', { cls: ['sec'] });
  ctx.fxBusy(sec, true); ctx.fxBusy(sec, false);
  ctx.fxBusy(sec, true);
  flush();
  assert.ok(on(sec) && has(sec, 'fx-glow') && !has(sec, 'fx-out'));
});

test('버튼: 켜면 비활성, 끄면 되돌림 — 원래 꺼져 있던 버튼·disable:false·제목줄 버튼은 건드리지 않는다', () => {
  const { ctx, mk } = world();
  const b = mk('button');
  ctx.fxBusy(b, true); assert.equal(b.disabled, true); assert.ok(has(b, 'fx-btn'));
  ctx.fxBusy(b, false); assert.equal(b.disabled, false); assert.ok(!has(b, 'fx-btn'), '버튼은 사라짐 없이 바로');
  const pre = mk('button'); pre.disabled = true;
  ctx.fxBusy(pre, true); ctx.fxBusy(pre, false); assert.equal(pre.disabled, true, '부르는 쪽이 꺼 둔 버튼을 켜 버림');
  const keep = mk('button');
  ctx.fxBusy(keep, true, { disable: false }); assert.equal(keep.disabled, false); ctx.fxBusy(keep, false);
  const tb = mk('button', { tb: true });
  ctx.fxBusy(tb, true); assert.ok(has(tb, 'fx-tb') && tb.disabled === false, '제목줄 버튼은 색 띠만(비활성 아님)');
});

test('버튼을 비활성으로 바꾸며 빠진 포커스를 끝날 때 돌려준다(다른 곳으로 옮겼으면 그대로)', () => {
  const { ctx, mk } = world();
  const doc = ctx.document; const body = mk('body'); doc.body = body;
  const b = mk('button'); b.isConnected = true; b.focus = () => { doc.activeElement = b; };
  doc.activeElement = b;
  ctx.fxBusy(b, true); doc.activeElement = body;   // 비활성 → 포커스가 body로 빠짐
  ctx.fxBusy(b, false);
  assert.equal(doc.activeElement, b, '포커스를 안 돌려줌');
  const other = mk('input');
  ctx.fxBusy(b, true); doc.activeElement = other;  // 그사이 다른 칸으로 옮김
  ctx.fxBusy(b, false);
  assert.equal(doc.activeElement, other, '사용자가 옮긴 포커스를 빼앗음');
});

test('섹션 머리(h3 — 뒤에서 도는 확인): 머리 띠(.fx-head)만 — 흐름 판·비활성·자리표시 없이, 끄면 .5초 사라짐 뒤 치운다', () => {
  const { ctx, mk, reg, flush } = world();
  const h3 = mk('h3');
  const sec = reg('.sec[data-sec="typhoon"]', mk('div', { cls: ['sec'] }));
  sec.querySelector = (q) => (q === ':scope > h3' ? h3 : null);
  assert.equal(ctx.fxHead('typhoon'), h3);
  assert.equal(ctx.fxHead('없음'), null);
  const job = [ctx.fxHead('typhoon')];
  ctx.fxBusy(job, true, { lines: 3, maxMs: 120000 });
  assert.ok(on(h3) && has(h3, 'fx-head') && !has(h3, 'fx-glow'), '머리 띠가 아님');
  assert.ok(!h3.next && !has(h3, 'fx-ph-hide') && h3.disabled === false, '머리에 자리표시·비활성');
  assert.ok(!on(sec), '섹션 전체가 흐름');
  ctx.fxBusy(job, false);
  assert.ok(!on(h3) && has(h3, 'fx-out') && has(h3, 'fx-head'));
  flush();
  assert.ok(!has(h3, 'fx-out') && !has(h3, 'fx-head'));
  // 섹션 흐름과 머리 띠는 따로 센다 — 불러오기(섹션)가 끝나 꺼져도 뒤에서 도는 확인(머리)은 그대로
  const load = [sec], bg = [h3];
  ctx.fxBusy(load, true); ctx.fxBusy(bg, true); ctx.fxBusy(load, false);
  assert.ok(!on(sec) && on(h3));
  ctx.fxBusy(bg, false); assert.ok(!on(h3));
});

test('결과 목록 자리: 상자 바로 뒤에 빛 훑는 막대(폭 92/68/84…%), 옛 내용 숨김 — 끄면 치운다', () => {
  const { ctx, mk } = world();
  const list = mk('div');
  ctx.fxBusy(list, true, { lines: 3 });
  const ph = list.next;
  assert.ok(ph && has(ph, 'fx-ph'), '자리표시가 없음');
  assert.equal(ph.attrs['aria-hidden'], 'true');
  assert.deepEqual(ph.children.map((i) => i.style.width), ['92%', '68%', '84%']);
  assert.ok(has(list, 'fx-ph-hide'));
  ctx.fxBusy(list, false);
  assert.ok(ph.removed && !has(list, 'fx-ph-hide'));
  ctx.fxBusy(list, true, { lines: 2, hide: false });
  assert.ok(!has(list, 'fx-ph-hide'), 'hide:false인데 숨김');
});

test('fxRun: 실패(throw)해도 꺼지고 오류는 그대로, 성공이면 결과를 돌려주고 도착 효과', async () => {
  const { ctx, mk } = world();
  const sec = mk('div', { cls: ['sec'] }), btn = mk('button');
  await assert.rejects(ctx.fxRun([sec, btn], async () => { throw new Error('네트워크'); }, { arrive: sec }), /네트워크/);
  assert.ok(!on(sec) && btn.disabled === false && !has(sec, 'fx-arrive'), '실패했는데 안 꺼졌거나 도착 효과가 남');
  const r = await ctx.fxRun([sec, btn], async () => 42, { arrive: (v) => (v === 42 ? sec : null) });
  assert.equal(r, 42);
  assert.ok(!on(sec) && has(sec, 'fx-arrive'));
  // false·null 결과(못 불러옴·버려짐)는 도착 효과 없음
  const sec2 = mk('div', { cls: ['sec'] });
  assert.equal(await ctx.fxRun(sec2, async () => false, { arrive: sec2 }), false);
  assert.ok(!has(sec2, 'fx-arrive'));
});

test('fxRun 두 개가 겹치면 둘 다 끝나야 꺼진다(먼저 끝난 쪽이 끄지 않음)', async () => {
  const { ctx, mk } = world();
  const sec = mk('div', { cls: ['sec'] });
  let release;
  const slow = ctx.fxRun(sec, () => new Promise((r) => { release = r; }));
  await ctx.fxRun(sec, async () => 1);
  assert.ok(on(sec), '느린 작업이 아직인데 꺼짐');
  release(true); await slow;
  assert.ok(!on(sec));
});

test('maxMs 안전 해제 — 응답이 없어도 꺼지고, 뒤늦은 끄기는 무해', () => {
  const { ctx, mk, flush } = world();
  const b = mk('button'), sec = mk('div', { cls: ['sec'] });
  ctx.fxBusy([sec, b], true, { maxMs: 90000 });
  flush();
  assert.ok(!on(sec) && b.disabled === false);
  ctx.fxBusy([sec, b], false);
  ctx.fxBusy(sec, true); assert.ok(on(sec));
});

test('안전 해제 뒤 늦게 온 끄기는 그 뒤에 켠 새 작업을 끄지 않는다(켤 때·끌 때 같은 배열 = 한 작업)', () => {
  const { ctx, mk, flush } = world();
  const sec = mk('div', { cls: ['sec'] }), b = mk('button');
  const A = [sec, b];
  ctx.fxBusy(A, true, { maxMs: 90000 });
  flush();                                  // A: 응답이 없어 안전 해제로 꺼짐
  assert.ok(!on(sec) && b.disabled === false);
  const B = [sec, b];
  ctx.fxBusy(B, true);                      // 다시 눌러 새 작업 B
  ctx.fxBusy(A, false);                     // 한참 뒤 A가 끝나 끄러 옴
  assert.ok(on(sec) && b.disabled === true, '늦게 온 A의 끄기가 B를 껐다');
  ctx.fxBusy(B, false);
  assert.ok(!on(sec) && b.disabled === false, 'B가 끝났는데 안 꺼짐');
  // 같은 배열로 두 번 켜면 두 번 꺼야 꺼진다(같은 작업 배열을 다시 쓰는 경우)
  const C = [sec];
  ctx.fxBusy(C, true); ctx.fxBusy(C, true); ctx.fxBusy(C, false);
  assert.ok(on(sec));
  ctx.fxBusy(C, false); assert.ok(!on(sec));
  // 켜지 않은 배열로 끄면(배열을 새로 만들어 넘김) 예전처럼 횟수만 센다
  ctx.fxBusy([sec], true); ctx.fxBusy([sec], false); assert.ok(!on(sec));
});

test('fxClear — 센 횟수와 상관없이 바로 끈다', () => {
  const { ctx, mk } = world();
  const sec = mk('div', { cls: ['sec'] });
  ctx.fxBusy(sec, true); ctx.fxBusy(sec, true); ctx.fxBusy(sec, true);
  ctx.fxClear(sec);
  assert.ok(!on(sec));
  ctx.fxBusy(sec, true); ctx.fxBusy(sec, false); assert.ok(!on(sec));
});

test('대상 고르기 — 선택자 글자·배열·null 섞기, 같은 요소 중복은 한 번만 센다', () => {
  const { ctx, mk, reg } = world();
  const b = reg('#wrnFetch', mk('button'));
  ctx.fxBusy(['#wrnFetch', b, null, undefined, '#없음'], true);
  ctx.fxBusy(b, false);
  assert.equal(b.disabled, false, '배열 안 중복을 두 번 셌다');
});

test('움직임 줄이기 — 끄면 바로 치우고(사라짐 없음), 도착은 짧은 페이드만(떠오름·차례 없음)', () => {
  const { ctx, mk, timers } = world({ reduced: true });
  const sec = mk('div', { cls: ['sec'] });
  ctx.fxBusy(sec, true); ctx.fxBusy(sec, false);
  assert.ok(!has(sec, 'fx-glow') && !has(sec, 'fx-out') && timers.size === 0);
  const row = mk('div');
  ctx.fxArrive([row]);
  assert.equal(row.anims.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(row.anims[0].kf)), [{ opacity: 0 }, { opacity: 1 }]);
});

test('도착 — 행은 위에서부터 80ms 간격(11번째부터 같은 간격), 투명→불투명 .34초 + 14px→제자리 .42초(translate 속성)', () => {
  const { ctx, mk } = world();
  const sec = mk('div', { cls: ['sec'] }), btn = mk('button');
  const rows = Array.from({ length: 13 }, () => mk('div'));
  ctx.fxArrive([sec, btn, ...rows]);
  assert.ok(has(sec, 'fx-arrive') && has(btn, 'fx-arrive'), '섹션·버튼은 한 번 빛');
  assert.deepEqual(rows.map((r) => r.anims[0].o.delay), [0, 80, 160, 240, 320, 400, 480, 560, 640, 720, 800, 800, 800]);
  const [fade, rise] = rows[0].anims;
  assert.equal(fade.o.duration, 340); assert.equal(rise.o.duration, 420);
  assert.equal(rise.kf[0].translate, '0 14px'); assert.equal(fade.o.fill, 'backwards');
  assert.ok(!('transform' in rise.kf[0]), '요소의 transform을 덮지 않게 translate로');
});

test('진행 막대 — 켜진 제목줄 버튼만, 0~1로 자르고 null이면 치운다. 끄면 함께 사라진다', () => {
  const { ctx, mk } = world();
  const tb = mk('button', { tb: true }), other = mk('button', { tb: true });
  ctx.fxBusy(tb, true);
  ctx.fxProgress(null, 1.7);
  assert.equal(tb.style.props['--fx-p'], '1'); assert.ok(has(tb, 'fx-has-p'));
  assert.ok(!has(other, 'fx-has-p'), '안 켠 버튼에도 막대');
  ctx.fxProgress(tb, 0.25); assert.equal(tb.style.props['--fx-p'], '0.25');
  ctx.fxProgress(tb, null); assert.ok(!has(tb, 'fx-has-p'));
  ctx.fxProgress(null, 0.5); ctx.fxBusy(tb, false);
  assert.ok(!has(tb, 'fx-has-p') && tb.style.props['--fx-p'] === undefined);
  // 대상을 줘도 켜진 요소에만 — 렌더 진행률이 함께 도는 저장 버튼·끝난 버튼에 막대를 남기지 않게
  ctx.fxProgress([tb, other], 0.4);
  assert.ok(!has(tb, 'fx-has-p') && !has(other, 'fx-has-p'), '꺼진 버튼에 막대');
  ctx.fxBusy(other, true); ctx.fxProgress([tb, other], 0.4);
  assert.ok(has(other, 'fx-has-p') && !has(tb, 'fx-has-p'));
});

// ---- 연결: 켠 효과를 반드시 끄는지(함수 본문 안 켜기·끄기 짝 + finally) ----
function bodyOf(name) {
  const m = new RegExp(`\\n(?:async )?function ${name}\\(`).exec(html);
  assert.ok(m, `${name} 함수를 못 찾음`);
  const end = html.indexOf('\n}\n', m.index + 1);
  return html.slice(m.index, end + 3);
}
test('연결 — 불러오기·추출·저장 함수가 켠 작업 중 효과를 finally에서 끈다', () => {
  const cases = {
    fetchWrn: 'fx', renderExport: 'fx', bakeMp4: 'fx', exportPngSeq: 'fx', wnsRender: 'fx', saveProject: 'fx', openRecent: 'fx', bakeDefaults: 'fx',
    fetchTyphoon: 'fx', fetchTyphoonPast: 'fx', fetchJma: 'fx', attachEdgeTD: 'fx', fetchBulletin: 'fx', fetchJtwc: 'fx', loadJtwcStorm: 'fx',
  };
  for (const [fn, v] of Object.entries(cases)) {
    const b = bodyOf(fn);
    assert.ok(new RegExp(`fxBusy\\(${v}, true`).test(b), `${fn}: 켜기 없음`);
    const fin = b.lastIndexOf('finally');
    assert.ok(fin > 0 && new RegExp(`fxBusy\\(${v}, false\\)`).test(b.slice(fin)), `${fn}: finally에서 끄지 않음`);
  }
  // AE 보내기: 실패·취소면 finally에서, 성공이면 재전송 잠금(9초)이 풀릴 때 끈다
  const ae = bodyOf('sendToAE');
  assert.ok(/fxBusy\(btn, true/.test(ae) && /finally[\s\S]*fxBusy\(btn, false\)/.test(ae) && /setTimeout\([^\n]*fxBusy\(btn, false\)/.test(ae));
  // 렌더 진행률이 제목줄 렌더·AE 버튼 막대로도 간다(대상을 정해서 — 저장 플로피엔 안 붙게)
  assert.ok(/fxProgress\(\['#tlToggle', '#aeSend'\], /.test(bodyOf('exportProgress')));
  // 예보 읽기는 바로 끝나므로 도착 효과만
  assert.ok(/fxArrive\(/.test(bodyOf('applyFct')));

  // 태풍 — 그렸을 때만 도착 효과(실패·태풍 없음·헬퍼 꺼짐은 finally에서 끄기만), 끈 뒤에 도착
  for (const [fn, v] of [['fetchTyphoon', 'okTyp'], ['fetchTyphoonPast', 'ok'], ['fetchJma', 'ok'], ['loadJtwcStorm', 'ok']]) {
    const fin = bodyOf(fn).slice(bodyOf(fn).lastIndexOf('finally'));
    assert.ok(new RegExp(`fxBusy\\(fx, false\\); if \\(${v}\\) typArriveFx\\(\\);`).test(fin), `${fn}: 성공일 때만, 끈 뒤에 도착 효과`);
  }
  assert.ok(/let ok = false;/.test(bodyOf('fetchJma')) && /ok = true;\s*\} catch/.test(bodyOf('fetchJma')), 'JMA: 그린 뒤에만 성공');
  // 미해군(JTWC) — 목록 받기는 섹션·버튼·팝업 목록 자리(막대)를 함께 켜고, 목록이 들어왔을 때만 행 도착 / 통보문은 그린 뒤에만 성공
  const jl = bodyOf('fetchJtwc');
  assert.ok(/const fx = \[fxSec\([^\n]*\), btn, m\.list\];/.test(jl), 'JTWC 목록: 섹션·버튼·목록 자리');
  assert.ok(/fxBusy\(fx, false\);\s*if \(shown && m\.alive\(\)\) fxArrive\(fxRows\(m\.list\)\);/.test(jl.slice(jl.lastIndexOf('finally'))), 'JTWC 목록: 끈 뒤에, 보였을 때만 도착');
  assert.ok(/pushUndo\(\); ok = applyTyphoonText\(r\.text\);\s*\} finally/.test(bodyOf('loadJtwcStorm')), 'JTWC 통보문: 그린 뒤에만 성공');
  // 발생·소멸 TD — 불러오기 뒤 자동 확인은 섹션 머리에만(fxHead — 섹션 흐름·버튼 잠금 없이), 버튼은 섹션 + 버튼, 붙였을 때만 도착
  const edge = bodyOf('attachEdgeTD');
  assert.ok(/const fx = auto \? \[fxHead\(secName\)\] : \[fxSec\(secName\), btn\];/.test(edge));
  assert.ok(/joined = true;\s*\} catch/.test(edge) && /if \(joined\) fxArrive\(/.test(edge.slice(edge.lastIndexOf('finally'))));
  // 붙여넣기·파일 끌어놓기(바로 끝남)는 그렸을 때만 도착 효과
  assert.equal((html.match(/pushUndo\(\); if \(applyTyphoonText\((?:t\.value|txt)\)\) typArriveFx\(\);/g) || []).length, 3, '태풍 붙여넣기 2곳 + 끌어놓기 1곳');
  assert.ok(!/pushUndo\(\); applyTyphoonText\(/.test(html), '도착 효과 없이 그리는 붙여넣기가 남음');

  // 통보문 — 불러오기·창 기다림 효과는 '불러오는 중' 카드와 함께 산다(카드가 바뀌면 showBulResult가 먼저 끈다)
  assert.ok(/function showBulResult\(r, quiet\) \{\n\s*bulFxOff\(\);/.test(bodyOf('showBulResult')), 'showBulResult 첫 줄에서 앞 효과 끄기');
  const fb = bodyOf('fetchBulletin');
  assert.ok(fb.indexOf("showBulResult({ kind: 'busy', src: 'fetch' })") < fb.indexOf('fxBusy(fx, true'), '카드를 띄운 뒤 켠다(카드가 끄지 않게)');
  assert.ok(/const fx = bulLoadFx = \[/.test(fb) && /if \(got\) bulArriveFx\(/.test(fb.slice(fb.lastIndexOf('finally'))));
  const op = bodyOf('bulOpenPage');
  assert.ok(op.indexOf("showBulResult({ kind: 'busy', src: 'wnd' })") < op.indexOf('fxBusy(fx, true') && /const fx = bulLoadFx = \[/.test(op) && /maxMs: \d+/.test(op), '창 기다림: 카드 뒤에 켜고 안전 해제');
  assert.ok(/if \(bulShowPage\(page, 'wnd'\)\) bulArriveFx\(/.test(bodyOf('bulFromWnuri')));
  assert.ok(/if \(bulShowPage\(page, 'paste'\)\) bulArriveFx\(/.test(bodyOf('bulOnPaste')));
  // 통보문으로 색칠은 바로 끝나므로 도착 효과만 — 실패 return 뒤 맨 끝에
  const ab = bodyOf('applyBulletin');
  assert.ok(/fxArrive\(\[fxSec\('fct'\), '#bulApply', \$\('#bulInfo'\), \.\.\.fxRows\(\$\('#bulList'\)\)\]\);\s*\}\s*$/.test(ab));
});
