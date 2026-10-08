// 섹션 안 접이식 묶음(잘 안 쓰는 메뉴) — 특보 '자동이 안 될 때 · 수동 붙여넣기'와 '기상청 예보 API로 색칠'이 같은 부품(js/panels.js foldWire·foldReveal, css .subFold*)을 쓴다.
// 기본 접힘 · 제목 줄로 펼침/접힘(상태 기억, 저장소가 막혀도 동작) · 접힌 동안 Tab 포커스 안 들어감 · 불러오기 실패 카드에서 이번만 펼치고 보이게 스크롤.
// 함수는 tools/app-source.cjs로 합친 앱에서 잘라 가짜 DOM(vm)에서 돌린다. 실제 화면은 desktop/test/boot-check.cjs로 따로 봤다.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const appSource = require('../tools/app-source.cjs');   // js/·css/로 나뉜 앱을 '한 파일' 텍스트로 합쳐 읽는다(MODULES.md)

const html = appSource(path.join(__dirname, '..', 'index.html'));
const css = (html.match(/<style>[\s\S]*?<\/style>/g) || []).join('\n');

// 'function 이름(' 부터 짝 맞는 닫는 중괄호까지
function fnSrc(name) {
  const i = html.indexOf(`function ${name}(`);
  assert.ok(i >= 0, `${name} 함수가 없음`);
  assert.equal(html.indexOf(`function ${name}(`, i + 1), -1, `${name} 함수가 두 번 있음`);
  let d = 0;
  for (let j = html.indexOf('{', i); j < html.length; j++) {
    if (html[j] === '{') d++;
    else if (html[j] === '}' && --d === 0) return html.slice(i, j + 1);
  }
  throw new Error(`${name} 끝을 못 찾음`);
}
// id로 시작 태그 하나 / 그 요소의 바깥 HTML(같은 태그 짝 맞추기 — div만)
const tagOf = (id) => (html.match(new RegExp(`<[a-z]+[^>]*\\bid="${id}"[^>]*>`)) || [''])[0];
function divOuter(id) {
  const i = html.indexOf(`<div class="subFold closed" id="${id}">`);
  assert.ok(i >= 0, `${id} 묶음이 없음`);
  const re = /<\/?div\b[^>]*>/g; re.lastIndex = i;
  let d = 0, m;
  while ((m = re.exec(html))) { d += m[0][1] === '/' ? -1 : 1; if (d === 0) return html.slice(i, re.lastIndex); }
  throw new Error(`${id} 끝을 못 찾음`);
}
const plain = (v) => JSON.parse(JSON.stringify(v));   // vm 안에서 만든 객체(다른 realm) 비교용
const FOLD_FNS = ['foldHeadOf', 'foldIsOpen', 'foldSet', 'foldWire', 'foldReveal', 'foldScrollIntoView'];

test('마크업 — 특보 수동 붙여넣기는 기본 접힘(예보 API 묶음과 같은 부품), 특보 색 지우기는 접힘 밖', () => {
  // 제목 줄 = 버튼(키보드로 열 수 있게) · 기본 접힘 · aria-controls로 묶음과 짝
  for (const [head, fold] of [['wrnManualHead', 'wrnManual'], ['fctFoldHead', 'fctFold']]) {
    const h = tagOf(head);
    assert.match(h, /^<button type="button" class="subhead subFoldHead"/, head);
    assert.match(h, /aria-expanded="false"/, head);
    assert.match(h, new RegExp(`aria-controls="${fold}"`), head);
    assert.match(divOuter(fold), /^<div class="subFold closed" id="[a-zA-Z]+">\s*<div class="subFoldInner">/, fold);
  }
  assert.match(tagOf('wrnManualHead') + html.slice(html.indexOf(tagOf('wrnManualHead'))).slice(0, 200), /자동이 안 될 때 <span>· 수동 붙여넣기<\/span>/);
  const manual = divOuter('wrnManual');
  for (const id of ['wrnOpen', 'wrnPaste', 'wrnApply']) assert.match(manual, new RegExp(`id="${id}"`), `${id}는 접힌 묶음 안`);
  // 특보 색 지우기 = 불러오기·붙여넣기 어느 쪽이든 쓰는 버튼 → 접힘 밖, 불러오기 옆
  assert.doesNotMatch(manual, /id="wrnClear"/);
  assert.match(html, /<button class="pri" id="wrnFetch"[^>]*>기상청에서 불러오기<\/button><button id="wrnClear"[^>]*>특보 색 지우기<\/button>/);
  // 결과 카드는 묶음 위(실패 카드 바로 아래에서 펼쳐진다), 특보 목록은 묶음 아래
  const sec = html.slice(html.indexOf('<div class="sec special" data-sec="wrn">'));
  assert.ok(sec.indexOf('id="wrnResult"') < sec.indexOf('id="wrnManualHead"'));
  assert.ok(sec.indexOf('id="wrnManual"') < sec.indexOf('id="wrnList"'));
  // 옛 예보 전용 이름은 남지 않는다(같은 부품 하나)
  assert.doesNotMatch(html, /class="[^"]*\bfctFold(Head|Inner)?\b/);
  assert.doesNotMatch(css, /\.fctFold/);
});

test('CSS — 접힌 동안 Tab 포커스 안 들어감(visibility), 섹션과 같은 grid-rows 접힘, 상자는 예보 API 상자와 같은 모양', () => {
  assert.match(css, /\.subFold \{ display: grid; grid-template-rows: 1fr; \}/);
  assert.match(css, /\.subFold\.closed \{ grid-template-rows: 0fr; \}/);
  assert.match(css, /\.subFoldInner \{ min-height: 0; overflow: hidden;/);
  assert.match(css, /\.subFold\.closed > \.subFoldInner \{ opacity: 0; visibility: hidden;/);
  assert.match(css, /\.subFoldHead\[aria-expanded="false"\]::after \{ transform: rotate\(-45deg\); \}/);
  assert.match(css, /\.subFoldHead:focus-visible \{/);
  assert.match(css, /\.fctBox, \.subFoldBox \{/);
  assert.match(css, /:root\[data-theme="light"\] \.fctBox, :root\[data-theme="light"\] \.subFoldBox \{/);
});

// ───────── 가짜 DOM ─────────
function makeEnv(o = {}) {
  const store = new Map(Object.entries(o.store || {}));
  const writes = [];
  const localStorage = o.blocked
    ? { getItem() { throw new Error('막힘'); }, setItem() { throw new Error('막힘'); } }
    : { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => { writes.push([k, v]); store.set(k, String(v)); } };
  const classes = (init) => { const s = new Set(init); return { toggle(c, on) { if (on) s.add(c); else s.delete(c); }, contains: (c) => s.has(c), add: (c) => s.add(c), remove: (c) => s.delete(c) }; };
  const K = o.zoom || 1.5;   // 사이드바 zoom — 화면 px ÷ 배율 = scrollTop 단위
  const body = { tag: 'body' };
  const scrolls = [];
  const panel = {
    id: 'panel', parentElement: body, offsetWidth: 288, clientTop: 0, clientHeight: 600, scrollTop: 100, style: {},
    getBoundingClientRect: () => ({ top: 50, width: 288 * K }),
    scrollTo(x) { scrolls.push(x); },
  };
  const bodyInner = { parentElement: panel, overflowY: 'hidden' };   // 섹션 접기용 클리퍼 — 스크롤 칸으로 잡으면 안 된다
  const pad = { parentElement: bodyInner };
  const at = (y) => 50 + y * K;   // 스크롤 칸 위 끝에서 y(scrollTop 단위)인 요소의 화면 위치
  const attrs = {};
  const head = {
    getAttribute: (k) => attrs[k], setAttribute: (k, v) => { attrs[k] = v; },
    getBoundingClientRect: () => ({ top: at(o.headY ?? 400) }),
  };
  const inner = { scrollHeight: o.innerH ?? 250 };
  const fold = {
    id: 'wrnManual', parentElement: pad, offsetParent: o.hidden ? null : pad, offsetHeight: 0, firstElementChild: inner,
    classList: classes(['subFold', 'closed']),
    getBoundingClientRect: () => ({ top: at((o.headY ?? 400) + 30) }),
  };
  const focused = [];
  const ta = { focus(opt) { focused.push(opt); } };
  const timers = [];
  const ctx = {
    localStorage,
    document: { body, querySelector: (s) => (s === '[aria-controls="wrnManual"]' ? head : null) },
    getComputedStyle: (n) => ({ overflowY: n === panel ? 'auto' : n.overflowY || 'visible' }),
    setTimeout: (f, ms) => { timers.push([f, ms]); return timers.length; },
    panelStickyH: () => 64, panelFooterH: () => 60,
    fxReduced: () => !!o.reduced,
  };
  vm.createContext(ctx);
  vm.runInContext(FOLD_FNS.map(fnSrc).join('\n') + '\n' + FOLD_FNS.map((n) => `globalThis.${n} = ${n};`).join('\n'), ctx);
  return { ctx, fold, head, attrs, store, writes, scrolls, focused, ta, timers, panel };
}

test('foldWire — 기본 접힘, 제목 줄로 펼침/접힘하고 그 상태를 기억, 기억한 펼침으로 시작', () => {
  const e = makeEnv();
  e.ctx.foldWire(e.fold, 'wcg_wrn_manual_open');
  assert.equal(e.fold.classList.contains('closed'), true, '처음엔 접힘');
  assert.equal(e.attrs['aria-expanded'], 'false');
  assert.deepEqual(e.writes, [], '배선만으로는 저장 안 함');
  e.head.onclick();
  assert.equal(e.fold.classList.contains('closed'), false, '누르면 펼침');
  assert.equal(e.attrs['aria-expanded'], 'true');
  assert.deepEqual(e.writes.at(-1), ['wcg_wrn_manual_open', '1']);
  e.head.onclick();
  assert.equal(e.fold.classList.contains('closed'), true, '다시 누르면 접힘');
  assert.deepEqual(e.writes.at(-1), ['wcg_wrn_manual_open', '0']);
  // 다음 실행 — 기억한 '펼침'으로 시작
  const e2 = makeEnv({ store: { wcg_wrn_manual_open: '1' } });
  e2.ctx.foldWire(e2.fold, 'wcg_wrn_manual_open');
  assert.equal(e2.fold.classList.contains('closed'), false);
  assert.equal(e2.attrs['aria-expanded'], 'true');
  // 다른 묶음의 기억과 섞이지 않는다(키가 따로)
  const e3 = makeEnv({ store: { wcg_fct_api_open: '1' } });
  e3.ctx.foldWire(e3.fold, 'wcg_wrn_manual_open');
  assert.equal(e3.fold.classList.contains('closed'), true);
});

test('foldWire — 저장소가 막혀도(시크릿·로드 실패 가드) 접힌 채 시작하고 눌러서 펼칠 수 있다', () => {
  const e = makeEnv({ blocked: true });
  assert.doesNotThrow(() => e.ctx.foldWire(e.fold, 'wcg_wrn_manual_open'));
  assert.equal(e.fold.classList.contains('closed'), true);
  assert.doesNotThrow(() => e.head.onclick());
  assert.equal(e.fold.classList.contains('closed'), false);
});

test('foldReveal — 이번만 펼치고(기억 안 바꿈) 붙여넣기 칸에 포커스, 머리·다 펼친 묶음이 보이게 스크롤', () => {
  const e = makeEnv({ store: { wcg_wrn_manual_open: '0' } });
  e.ctx.foldWire(e.fold, 'wcg_wrn_manual_open');
  e.ctx.foldReveal(e.fold, e.ta);
  assert.equal(e.fold.classList.contains('closed'), false, '펼침');
  assert.equal(e.attrs['aria-expanded'], 'true');
  assert.deepEqual(e.writes, [], '실패 카드로 연 건 기억하지 않는다');
  assert.equal(e.store.get('wcg_wrn_manual_open'), '0');
  assert.deepEqual(plain(e.focused), [{ preventScroll: true }], '포커스는 스크롤 없이(스크롤은 묶음 기준으로 따로)');
  // 머리 400 · 묶음 끝 = 430 + 250(다 펼친 높이) = 680. 보이는 띠 = 64+8 ~ 600-60-10 = 530 → 150만큼 내린다(scrollTop 100 → 250)
  assert.deepEqual(plain(e.scrolls), [{ top: 250, behavior: 'smooth' }]);
  // 다 펼친 뒤(.34s) 한 번 더 맞춘다 — 스크롤 칸이 짧아 덜 갔을 때
  assert.equal(e.timers.length, 1);
  assert.ok(e.timers[0][1] >= 340);
});

test('foldReveal — 묶음이 화면보다 크면 머리 기준, 이미 보이면 그대로, 움직임 줄이기면 바로, 숨은 섹션이면 스크롤 안 함', () => {
  const tall = makeEnv({ innerH: 900 });
  tall.ctx.foldReveal(tall.fold);
  assert.deepEqual(plain(tall.scrolls), [{ top: 100 + (400 - 72), behavior: 'smooth' }], '머리가 로고 머리 바로 아래');
  const shown = makeEnv({ headY: 120, innerH: 200 });
  shown.ctx.foldReveal(shown.fold);
  assert.deepEqual(plain(shown.scrolls), [], '이미 다 보이면 스크롤 안 함');
  const reduced = makeEnv({ reduced: true });
  reduced.ctx.foldReveal(reduced.fold);
  assert.equal(reduced.scrolls[0].behavior, 'instant');
  const hidden = makeEnv({ hidden: true });
  hidden.ctx.foldReveal(hidden.fold);
  assert.equal(hidden.fold.classList.contains('closed'), false);
  assert.deepEqual(plain(hidden.scrolls), []);
});

test('배선 — 두 묶음 모두 공용 foldWire(키 따로), 실패 카드의 직접 붙여넣기·새 창 열기는 묶음을 이번만 펼친다', () => {
  const wire = fnSrc('wire');
  assert.match(wire, /foldWire\(\$\('#wrnManual'\), 'wcg_wrn_manual_open'\);/);
  assert.match(wire, /foldWire\(\$\('#fctFold'\), 'wcg_fct_api_open'\);/);
  assert.doesNotMatch(wire, /const setOpen = /, '예보 API 묶음의 옛 전용 배선은 공용으로 바뀌었다');
  const show = fnSrc('showWrnResult');
  assert.match(show, /paste: \(\) => foldReveal\(\$\('#wrnManual'\), \$\('#wrnPaste'\)\),/);
  assert.match(show, /open: \(\) => \{ foldReveal\(\$\('#wrnManual'\), \$\('#wrnPaste'\)\); \$\('#wrnOpen'\)\.click\(\); \},/);
  // 카드가 쓰는 행동은 모두 run에 있다(없는 id면 눌러도 아무 일 없음)
  const ids = [...new Set([...html.slice(html.indexOf('const WRN_FAIL = {'), html.indexOf('// \'YYYYMMDDHHMM\'')).matchAll(/'(\w+)'/g)].map((m) => m[1]))]
    .filter((id) => /^(retry|helper|helperOld|api|open|paste)$/.test(id));
  for (const id of ids) assert.match(show, new RegExp(`\\b${id}: \\(\\) =>`), id);
  // 구버전 확장팩 안내(데스크톱 · 기상청 불러오기가 막힘)도 접힌 묶음을 여는 길을 알려 준다
  assert.match(html, /특보 칸의 <b>‘자동이 안 될 때’<\/b>를 펼쳐\(결과 카드의 ‘직접 붙여넣기’\)/);
});
