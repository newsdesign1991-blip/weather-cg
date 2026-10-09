// 드롭다운(js/dropdown.js) — 시스템 <select> 대신 버튼형 칸 + 토스 카드 목록 팝오버(값·옵션·change 계약 그대로).
// 1) 순수 도우미(가짜 select·rect): 항목 글자·목록 줄(optgroup·막힘·hidden·번호), 키 이동(막힌 줄 건너뛰기·끝에서 멈춤·처음/끝·한 쪽),
//    글자로 찾기(같은 글자 거듭·낱말·품은 글자), 자리(아래·위·둘 다 모자라면 넓은 쪽 높이 줄임·화면 안). 2) 값 계약: value·selectedIndex 접근자.
// 3) 붙이는 자리·키 처리·모양(css 토큰·#hex 없음·옛 base-select 걷어냄). 4) (WCG_BOOT_CHECK=1) 실제 앱 흐름 — tests/dropdown.boot-eval.js.
// 앱 코드는 tools/app-source.cjs로 합쳐 읽고(MODULES.md) 모듈 부분만 vm에서 돌린다.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const appSource = require('../tools/app-source.cjs');   // js/·css/로 나뉜 앱을 '한 파일' 텍스트로 합쳐 읽는다(MODULES.md)

const root = path.join(__dirname, '..');
const html = appSource(path.join(root, 'index.html')).replace(/\r\n/g, '\n');
const START = '// ===================== 드롭다운 (시스템 select';
const END = '// ===================== 날짜 고르기 (근무표 nd-cal';   // 다음 모듈(js/date-picker.js) 첫 줄
const src = (() => {
  const a = html.indexOf(START), b = html.indexOf(END, a);
  assert.ok(a > 0 && b > a, '드롭다운 모듈 위치를 못 찾음');
  return html.slice(a, b);
})();
const css = (html.match(/<style>[\s\S]*?<\/style>/g) || []).join('\n');
const dcss = css.slice(css.indexOf('/* ===== 드롭다운 — 시스템 select를 숨기고'), css.indexOf('/* ===== 날짜 고르기 — 근무표 nd-cal'));
const NAMES = ['DD_ROW', 'DD_MAX_H', 'DD_MAX_W', 'ddLabel', 'ddItems', 'ddOk', 'ddStep', 'ddFind', 'ddPlace', 'ddWatchValue'];
// 가짜 HTMLSelectElement — value·selectedIndex 접근자만(ddWatchValue 검사용)
class FakeSelect { constructor() { this._i = -1; this._opts = ['a', 'b', 'c']; } }
Object.defineProperty(FakeSelect.prototype, 'value', { configurable: true, get() { return this._opts[this._i] || ''; }, set(v) { this._i = this._opts.indexOf(String(v)); } });
Object.defineProperty(FakeSelect.prototype, 'selectedIndex', { configurable: true, get() { return this._i; }, set(v) { this._i = v >= 0 && v < this._opts.length ? v : -1; } });
const ctx = { window: { matchMedia: () => ({ matches: false }) }, HTMLSelectElement: FakeSelect, document: {}, performance: { now: () => 0 }, requestAnimationFrame: () => 0, cancelAnimationFrame() {} };
vm.createContext(ctx);
const D = vm.runInContext("'use strict';\n" + src + `\n;({ ${NAMES.join(', ')} })`, ctx, { filename: 'dropdown.js' });
const plain = (v) => JSON.parse(JSON.stringify(v));   // vm 안에서 만든 객체(다른 realm) 비교용

// 가짜 select 나무 — option·optgroup(브라우저 select.children과 같은 꼴)
const O = (text, o = {}) => ({ tagName: 'OPTION', textContent: text, label: o.label || '', value: o.value == null ? text : o.value, disabled: !!o.dis, hidden: !!o.hidden, style: o.font ? { fontFamily: o.font } : {} });
const G = (label, kids, dis) => ({ tagName: 'OPTGROUP', label, disabled: !!dis, children: kids });
const S = (kids, selectedIndex = 0) => ({ children: kids, selectedIndex });

test('항목 글자 — label 속성이 먼저, 공백은 한 칸, 없으면 빈 글자', () => {
  assert.equal(D.ddLabel(O('  29.97\n (방송) ')), '29.97 (방송)');
  assert.equal(D.ddLabel(O('긴 글자', { label: '짧게' })), '짧게');
  assert.equal(D.ddLabel(O('')), '');
  assert.equal(D.ddLabel(null), '');
});

test('목록 줄 — option·optgroup 차례, i = select.options 번호(hidden도 센다), 막힌 묶음 안은 막힘, 고른 줄 on, 글꼴', () => {
  const sel = S([O('하나'), G('첫 묶음', [O('둘', { value: '2' }), O('셋', { dis: true })]), G('막힌 묶음', [O('넷')], true), O('숨김', { hidden: true }), O('다섯', { font: 'Malgun Gothic' })], 4);
  const it = plain(D.ddItems(sel));
  assert.deepEqual(it.map((x) => x.kind + ':' + x.label), ['opt:하나', 'grp:첫 묶음', 'opt:둘', 'opt:셋', 'grp:막힌 묶음', 'opt:넷', 'opt:다섯']);
  assert.deepEqual(it.filter((x) => x.kind === 'opt').map((x) => x.i), [0, 1, 2, 3, 5], 'hidden(4)은 줄이 없지만 번호는 센다');
  assert.deepEqual(it.filter((x) => x.kind === 'opt').map((x) => x.dis), [false, false, true, true, false]);
  assert.deepEqual(it.filter((x) => x.on).map((x) => x.label), [], '고른 옵션(4)이 hidden이면 고른 줄 없음');
  assert.deepEqual(plain(D.ddItems({ ...sel, selectedIndex: 5 })).filter((x) => x.on).map((x) => x.label), ['다섯']);
  assert.equal(it.find((x) => x.label === '둘').value, '2');
  assert.equal(it.find((x) => x.label === '둘').inGrp, true);
  assert.equal(it.find((x) => x.label === '하나').inGrp, false);
  assert.equal(it.find((x) => x.label === '다섯').font, 'Malgun Gothic');
  assert.deepEqual(plain(D.ddItems(S([], -1))), [], '빈 select');
});

test('키 이동 — 막힌 줄·묶음 제목은 건너뛰고 끝에서 멈춤(돌지 않음), 처음·끝, 한 쪽(n칸), 없으면 -1', () => {
  const it = D.ddItems(S([O('a'), G('g', [O('b', { dis: true }), O('c')]), O('d'), O('e', { dis: true })]));
  // 줄: 0 a, 1 g, 2 b(막힘), 3 c, 4 d, 5 e(막힘)
  assert.deepEqual([D.ddStep(it, 0, 1), D.ddStep(it, 3, 1), D.ddStep(it, 4, 1)], [3, 4, 4], '↓: a→c(b 건너뜀), d에서 멈춤');
  assert.deepEqual([D.ddStep(it, 4, -1), D.ddStep(it, 3, -1), D.ddStep(it, 0, -1)], [3, 0, 0], '↑');
  assert.deepEqual([D.ddStep(it, 4, 'first'), D.ddStep(it, 0, 'last')], [0, 4]);
  assert.deepEqual([D.ddStep(it, 0, 1, 2), D.ddStep(it, 0, 1, 9), D.ddStep(it, 4, -1, 9)], [4, 4, 0], 'PageUp·Down = n칸, 끝에서 멈춤');
  assert.deepEqual([D.ddStep(it, -1, 1), D.ddStep(it, -1, -1)], [0, 4], '활성 없음 → 처음·끝');
  assert.deepEqual([D.ddStep(it, 2, 1), D.ddStep(it, 2, -1), D.ddStep(it, 5, 1), D.ddStep(it, 1, 1)], [3, 0, 4, 3], '막힌 줄·제목에서 → 그쪽 가장 가까운 줄');
  assert.equal(D.ddStep(D.ddItems(S([O('x', { dis: true })])), -1, 1), -1, '고를 수 있는 줄 없음');
});

test('글자로 찾기 — 한 글자는 다음 줄부터(거듭 치면 차례로), 낱말은 지금 줄부터, 시작 글자가 없으면 품은 글자, 막힌 줄 빼고', () => {
  const it = D.ddItems(S(['29.97 (방송)', '30', '59.94', '60', '25 (PAL)', '24', '23.976'].map((t) => O(t))));
  assert.equal(D.ddFind(it, '2', 0), 4, '29.97에서 2 → 25 (PAL)');
  assert.equal(D.ddFind(it, '22', 4), 5, '같은 글자 거듭 → 다음 2(24)');
  assert.equal(D.ddFind(it, '222', 6), 0, '끝에서 처음으로 돈다');
  assert.equal(D.ddFind(it, '23', 0), 6, '낱말 23 → 23.976');
  assert.equal(D.ddFind(it, '29', 0), 0, '낱말은 지금 줄부터(지금 줄이 맞으면 그대로)');
  assert.equal(D.ddFind(it, 'pal', 0), 4, '대소문자 무시 + 시작이 없으면 품은 글자');
  assert.equal(D.ddFind(it, 'x', 0), -1);
  assert.equal(D.ddFind(it, '', 0), -1);
  const kr = D.ddItems(S([O('왼쪽'), O('가운데', { dis: true }), O('오른쪽')]));
  assert.equal(D.ddFind(kr, '가', -1), -1, '막힌 줄은 안 찾는다');
  assert.equal(D.ddFind(kr, '오', -1), 2, '한글 첫 글자');
});

test('목록 자리 — 칸 아래 4px, 모자라면 위, 둘 다 모자라면 넓은 쪽에 그 높이까지(cap), 가로는 칸 왼쪽·화면 안 8px', () => {
  const fr = (l, t, w = 150, h = 30) => ({ left: l, top: t, right: l + w, bottom: t + h, width: w, height: h });
  assert.deepEqual(plain(D.ddPlace(fr(100, 200), 200, 300, 1600, 900)), { side: 'down', left: 100, top: 234, cap: 0 });
  assert.deepEqual(plain(D.ddPlace(fr(100, 700), 200, 300, 1600, 900)), { side: 'up', left: 100, top: 396, cap: 0 }, '아래 모자람 → 위(칸 위 4px)');
  // 900 창에 키 800 목록: 칸이 위쪽(아래가 넓음) → 아래에 cap = 900−8−(230+4) = 658 / 칸이 아래쪽 → 위에 cap = 600−4−8 = 588, top = 8
  assert.deepEqual(plain(D.ddPlace(fr(100, 200), 200, 800, 1600, 900)), { side: 'down', left: 100, top: 234, cap: 658 });
  assert.deepEqual(plain(D.ddPlace(fr(100, 600), 200, 800, 1600, 900)), { side: 'up', left: 100, top: 8, cap: 588 });
  assert.equal(D.ddPlace(fr(1500, 200), 300, 100, 1600, 900).left, 1292, '오른쪽 넘침 → 화면 안');
  assert.equal(D.ddPlace(fr(-20, 200), 300, 100, 1600, 900).left, 8, '왼쪽 넘침 → 8px');
  assert.equal(D.ddPlace(fr(100, 200), 2000, 100, 1600, 900).left, 8, '창보다 넓으면 왼쪽 8px부터');
});

test('값 계약 — select.value·selectedIndex 읽기·쓰기는 원래 그대로, 코드가 바꾸면 칸이 따라간다(onSet), 돌려받은 쓰기는 조용히', () => {
  const s = new FakeSelect(); let n = 0;
  const raw = D.ddWatchValue(s, () => n++);
  s.value = 'b';
  assert.deepEqual([s.value, s.selectedIndex, n], ['b', 1, 1]);
  s.selectedIndex = 2;
  assert.deepEqual([s.value, s.selectedIndex, n], ['c', 2, 2]);
  raw(0);
  assert.deepEqual([s.value, s.selectedIndex, n], ['a', 0, 2], '원래 쓰기(목록에서 고를 때)는 알림 없음');
  const other = new FakeSelect(); other.value = 'c';
  assert.equal(n, 2, '다른 select는 그대로(프로토타입을 안 건드림)');
  assert.ok(Object.getOwnPropertyDescriptor(s, 'value') && !Object.getOwnPropertyDescriptor(other, 'value'));
});

test('붙이는 자리 — 부팅 때 문서 전체(dpAttachAll 뒤·loadLayout 앞), 관찰자가 나중에 생긴 select도, 태풍 비교 카드는 wireCompareCard에서', () => {
  const boot = html.slice(html.indexOf('buildFrame();\nbuildZones();'));
  const iw = boot.indexOf('\nwire();'), ip = boot.indexOf('\ndpAttachAll();'), id = boot.indexOf('\nddAttachAll();'), il = boot.indexOf('\nloadLayout();');
  assert.ok(iw > 0 && ip > iw && id > ip && il > id, 'boot: wire() → dpAttachAll() → ddAttachAll() → loadLayout()');
  const mo = boot.slice(id, il);
  assert.match(mo, /const LATE = 'select,input\[type=date\],input\[type=time\],input\[type=datetime-local\]'/);
  assert.match(mo, /dpAttachAll\(node\); ddAttachAll\(node\);/);
  assert.match(mo, /node instanceof SVGElement/, '지도 SVG 노드는 훑지 않음');
  assert.match(mo, /lateFields\.observe\(document\.body, \{ childList: true, subtree: true \}\)/);
  const card = html.slice(html.indexOf('function wireCompareCard('), html.indexOf('\n}\n', html.indexOf('function wireCompareCard(')));
  assert.match(card, /q\('select'\)\.forEach\(\(n\) => ddAttach\(n\)\)/);
  // js에서 select를 만드는 파일은 ddAttach를 부른다(관찰자도 있지만 그 자리에서 바로 — 칸이 늦게 바뀌어 보이지 않게)
  for (const f of fs.readdirSync(path.join(root, 'js'))) {
    if (f === 'dropdown.js') continue;
    const t = fs.readFileSync(path.join(root, 'js', f), 'utf8').replace(/^\s*\/\/.*$/gm, '');   // 줄 주석은 빼고(설명 글의 <select> 낱말)
    if (/<select\b|createElement\(['"]select['"]\)/.test(t)) assert.match(t, /ddAttach\(/, `${f}: select를 만들면 ddAttach`);
  }
  // 뒤 팝업(태풍 불러오기 창)의 Esc는 떠 있는 목록이 먼저 — 옛 select:open 판정은 걷어냄
  assert.doesNotMatch(html, /select:open/);
  assert.match(html, /\|\| _dpNow \|\| _ddNow \|\| \$\('#tossOv'\)\) return;/);
});

test('키·포커스 — 열린 동안 창 캡처 단계에서 받아 뒤로 안 보냄(Ctrl 조합·Tab은 그대로), 닫힌 칸의 키도 지도 단축키로 안 샘, 고르면 닫고 input → change', () => {
  assert.match(src, /on\(window, 'keydown', \(e\) => \{\n\s+if \(_ddNow !== st \|\| e\.ctrlKey \|\| e\.metaKey\) return;\n\s+if \(!f\.isConnected\) \{ ddClose\(false\); return; \}[^\n]*\n\s+const k = e\.key;\n\s+if \(k === 'Tab'\) \{ ddClose\(false\); return; \}\n\s+e\.stopPropagation\(\);/);
  assert.match(src, /\}, true\);\n\s+on\(window, 'scroll'/, '창 keydown은 캡처(true)');
  assert.match(src, /if \(e\.ctrlKey \|\| e\.metaKey \|\| k === 'Tab' \|\| k === 'Escape' \|\| \/\^F\\d\+\$\/\.test\(k\)\) return;\n\s+e\.stopPropagation\(\);/, '닫힌 칸: Tab·Esc·Ctrl만 통과');
  assert.match(src, /pop\.addEventListener\('mousedown', \(e\) => e\.preventDefault\(\)\);/, '목록을 눌러도 포커스는 칸에');
  // 고르기 = 닫기 먼저, 값이 바뀐 때만 input → change(같은 항목 다시 고르기 = change 없음 — 시스템 select와 같게)
  const pick = src.slice(src.indexOf('const pick = (k) => {'), src.indexOf('st.pick = pick;'));
  assert.ok(pick.indexOf('ddClose(true)') < pick.indexOf("new Event('input'") && pick.indexOf("new Event('input'") < pick.indexOf("new Event('change'"));
  assert.match(pick, /if \(sel\.selectedIndex === it\.i\) return;/);
  assert.match(src, /new MutationObserver\(sync\)\.observe\(sel, \{ childList: true, subtree: true, characterData: true, attributes: true,/);
});

test('모양 — 원래 select 숨김, 목록 fixed·토스 모달 위·끌기 아님, 반사 카드, 줄 높이 = DD_ROW, 최대 높이 = DD_MAX_H, 색은 토큰(#hex 없음), 옛 base-select 없음', () => {
  assert.ok(dcss.length > 1500, 'css/dropdown.css 구역');
  assert.match(dcss, /\.ddSrc \{ display: none !important; \}/);
  assert.match(dcss, /\.ddField\[hidden\] \{ display: none; \}/);
  const z = +/\.ddPop \{ position: fixed;[^}]*z-index: (\d+);/.exec(dcss)[1];
  const tossZ = +/\.tossOv \{ position: fixed; inset: 0; z-index: (\d+);/.exec(css)[1];
  assert.ok(z > tossZ, `목록(${z})이 토스 모달(${tossZ}) 위`);
  assert.match(dcss, /\.ddPop \{[^}]*-webkit-app-region: no-drag;/, '제목줄 위에 떠도 누르기가 페이지로');
  assert.match(dcss, /html\.isDesktop\.ddOpen \.titlebar/);
  assert.match(dcss, /\.ddCard \{[^}]*var\(--refl\) border-box;[^}]*box-shadow: var\(--pop-drop-shadow\);/);
  assert.equal(+/\.ddOpt \{[^}]*min-height: (\d+)px;/.exec(dcss)[1], D.DD_ROW);
  assert.equal(+/\.ddList \{[^}]*max-height: (\d+)px;/.exec(dcss)[1], D.DD_MAX_H);
  assert.match(dcss, /\.ddList::-webkit-scrollbar-thumb \{[^}]*var\(--scrollbar\)/, '앱 스크롤바');
  assert.match(dcss, /\.ddField\.on \.ddChev \{ transform: rotate\(180deg\);/, '열리면 꺾쇠가 위로');
  assert.match(dcss, /\.tlNum \.ddField \{ flex: none; height: 28px;/, '타임라인 도구 줄 = .tlBtn 높이');
  assert.doesNotMatch(dcss, /#[0-9a-fA-F]{3,8}\b/, '색은 토큰으로(#hex 금지)');
  assert.doesNotMatch(css, /appearance: base-select/, '옛 시스템 select 꾸미기는 걷어냄');
  // 아이콘은 svg(이모지 없음), UI 글자는 한국어
  assert.doesNotMatch(src, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  assert.match(src, /고를 항목이 없어요/);
});

// ── 실제 앱(부팅 점검기) — WCG_BOOT_CHECK=1 일 때만 ──
test('부팅 점검: 모든 select 숨김·칸, 타임라인 fps·통보문 날짜·토스 모달·비교 카드 글꼴 — 열기·키·고르기·change·Esc·바깥·코드 변경 따라가기', { skip: process.env.WCG_BOOT_CHECK !== '1' && 'WCG_BOOT_CHECK=1 일 때만(일렉트론 필요)' }, () => {
  const raw = execFileSync(process.execPath, [path.join(root, 'desktop', 'test', 'boot-check.cjs'), root, '--wait=8000', '--size=1600x900', '--eval=' + path.join(__dirname, 'dropdown.boot-eval.js')], { encoding: 'utf8', timeout: 300000 });
  const out = JSON.parse(raw.slice(raw.indexOf('{')));
  assert.equal(out.ok, true, JSON.stringify(out.errors));
  const R = out.evalResult;
  assert.ok(!R.error, R.error);
  assert.ok(R.attached.length >= 16 && R.attached.every((a) => a.dd && a.hidden && a.next && a.role === 'combobox'), JSON.stringify(R.attached));
  const near = (p) => p && (p.below || p.above) && p.inView && p.alignLeft && p.minW;
  // 1) 타임라인 fps
  assert.ok(near(R.fpsOpen.place), JSON.stringify(R.fpsOpen.place));
  assert.deepEqual([R.fpsOpen.pop, R.fpsOpen.rows, R.fpsOpen.on, R.fpsOpen.act, R.fpsOpen.expanded, R.fpsOpen.activedesc, R.fpsOpen.checkShown, R.fpsOpen.focus], [true, 7, '29.97 (방송)', '29.97 (방송)', 'true', true, true, true]);
  assert.ok(R.fpsOpen.z >= 100010);
  assert.deepEqual(R.fpsPick, { act: ['30', '23.976', '29.97 (방송)'], value: '30', field: '30', fps: 30, ev: { input: 1, change: 1 }, closed: true, focus: true, w: true });
  assert.deepEqual(R.fpsType, { t1: '25 (PAL)', t2: '24', closed: true, value: '30', ev: 1 });
  assert.deepEqual(R.fpsProg, ['25 (PAL)', '29.97 (방송)', 1], '코드가 value·selectedIndex를 바꾸면 칸이 따라감(change 없음)');
  assert.deepEqual(R.fpsMouse, { value: '60', fps: 60, change: 2, closed: true }, '같은 항목 다시 고르기 = change 없음');
  // 2) 통보문 날짜(사이드바 배율)
  assert.deepEqual([R.bulStart.field, R.bulStart.opts, R.bulStart.shown], ['10일 · 비+소나기', 4, true]);
  assert.ok(near(R.bulOpen.place), JSON.stringify(R.bulOpen.place));
  assert.ok(R.bulOpen.fieldZoom > 1 && Math.abs(R.bulOpen.zoom - R.bulOpen.fieldZoom) < 0.01, `카드가 사이드바 배율을 따름 ${R.bulOpen.zoom} / ${R.bulOpen.fieldZoom}`);
  assert.deepEqual(R.bulOpen.rows, ['10일 · 비+소나기', '10일 · 비', '10일 · 소나기', '11일 오전 · 비']);
  assert.equal(R.bulOpen.rowH, 34);
  assert.deepEqual(R.bulPick, { value: '3', field: '11일 오전 · 비', paste: '* 예상 강수량(11일)', ev: { input: 1, change: 1 }, closed: true });
  assert.deepEqual(R.bulClose, { esc: { closed: true, value: '3', focus: true }, outside: { closed: true, value: '3' }, toggle: true, change: 1 });
  assert.deepEqual(R.bulRefill, { field: '12일 · 비', rows: ['12일 · 비', '13일 · 적설(cm)'], stillOpen: true }, '옵션을 다시 채우면 열린 목록도 따라감');
  assert.deepEqual(R.bulState, { dis: { field: true, opened: false }, hid: true, back: true, reset: { rowHidden: true, field: '—', visible: false } });
  // 3) 토스 모달 안 select
  assert.deepEqual(R.modal, { attached: true, inModal: true, groups: ['첫 묶음', '둘째 묶음'], dis: ['둘'], above: true, hit: true, skip: '셋', escOnlyList: true, labelFocus: true, pick: { value: 'c', field: '셋', ev: { input: 1, change: 1 } } });
  // 4) 태풍 비교 카드(다시 그린 카드)
  assert.deepEqual(R.cmp, { rows: ['SUITE(기본)', 'Wanted Sans', '맑은 고딕'], labelFont: 'Malgun Gothic', rebuilt: true, attached: true, field: '맑은 고딕', mode: '등간격(약 10개)' });
  assert.deepEqual([R.final, R.leftover], [true, 0]);
});
