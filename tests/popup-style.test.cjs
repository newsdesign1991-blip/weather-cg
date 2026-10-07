// 팝업 공통 스타일 — 근무표 최신 팝업(공지·투표·일정)과 같은 결을 지키는지 소스로 확인한다.
// 사용자 요청(2026-10-08): "팝업이 옛날 느낌 — 위 파란 줄이 너무 크고 전체가 너무 큼, 버튼도 약간씩 작게".
// 진한 색 띠 머리(그라디언트·꽉 찬 파랑 + 흰 글자)로 되돌아가지 않게, 크기·움직임·닫기 방식을 고정한다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
// 줄 맨 앞(들여쓰기 뒤)에서 시작하는 그 선택자 규칙 — '.confirmOverlay.on .confirmCard {' 같은 하위 규칙과 헷갈리지 않게
const rule = (sel) => {
  const i = html.indexOf('\n  ' + sel + ' {');
  assert.notEqual(i, -1, `${sel} 규칙 없음`);
  return html.slice(i + 3, html.indexOf('}', i) + 1);
};
const fn = (name) => {
  const m = new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}`).exec(html);
  assert.ok(m, `function ${name} 없음`);
  return m[0];
};
const px = (r, prop) => { const m = new RegExp(`${prop}: (\\d+(?:\\.\\d+)?)px`).exec(r); assert.ok(m, `${prop} 없음: ${r.slice(0, 60)}`); return +m[1]; };

test('공통 팝업 토큰은 어두운·밝은 테마 둘 다 정의한다', () => {
  for (const v of ['--pop-shadow', '--pop-drop-shadow', '--pop-hd', '--pop-hd-line', '--pop-hd-red', '--pop-hd-green', '--pop-x-bg', '--pop-x-line', '--pop-muted', '--pop-label']) {
    assert.equal((html.match(new RegExp(`${v}: `, 'g')) || []).length, 2, `${v} 는 두 테마에 하나씩`);
  }
  // 막 색 — 어두운 테마는 짙게, 밝은 테마는 근무표(rgba(0,0,0,.3))처럼 옅게. CG 구성 막·데스크톱 창 버튼 어둡게 하기도 같은 변수
  assert.match(html, /--pop-ov: rgba\(6, 10, 20, \.62\);/);
  assert.match(html, /:root\[data-theme="light"\] \{\n\s*--pop-ov: rgba\(15, 23, 42, \.32\);/);
  for (const sel of ['.tossOv', '#slotOverlay']) assert.match(rule(sel), /background: var\(--pop-ov\)/, `${sel} 막`);
  // 밝은 막 위 창 버튼 기호는 어둡게(흰 기호면 안 보임)
  assert.match(fn('syncTitleBarColors'), /lum\(color\) > 0\.45 \? 'rgba\(15, 23, 42, \.8\)' : 'rgba\(255, 255, 255, \.72\)'/);
});

test('머리 = 옅은 틴트 + 기본색 제목 (진한 그라디언트·꽉 찬 파랑·흰 글자 금지)', () => {
  for (const sel of ['.cgsHead', '.tossHead', '.confirmHead', '.slotHead', '.imgPopHead', '.apiHead']) {
    const r = rule(sel);
    assert.match(r, /background: var\(--pop-hd\)/, `${sel} 바탕은 옅은 틴트`);
    assert.match(r, /border-bottom: 1px solid var\(--pop-hd-line\)/, `${sel} 아래 얇은 선`);
    assert.doesNotMatch(r, /linear-gradient|var\(--primary\)|#fff\b|var\(--on-primary\)/, `${sel} 에 진한 띠·흰 글자`);
  }
  // 토스 모달은 인라인 그라디언트 대신 톤(blue·red·green) — 옛 accent 값이 남지 않는다
  assert.doesNotMatch(html, /BLUE_GRAD|accent: '?linear-gradient/);
  assert.match(fn('tossModal'), /<div class="tossHead" data-tone="\$\{tone\}">/);
  assert.doesNotMatch(fn('tossModal'), /style="background/);
  assert.match(html, /\.tossHead\[data-tone="red"\] \{ background: var\(--pop-hd-red\)/);
  assert.match(html, /\.tossHead\[data-tone="green"\] \{ background: var\(--pop-hd-green\)/);
  assert.match(rule('.confirmHead.warn'), /background: var\(--pop-hd-red\)/);
  // CG 구성 머리의 큰 아이콘 타일은 뺐다(근무표 최신 팝업 머리엔 아이콘 없음)
  assert.doesNotMatch(html, /cgsHeadIcon/);
});

test('머리·제목·버튼 크기 — 근무표 값으로 작게(되돌아가 커지지 않게)', () => {
  assert.equal(px(rule('.cgsTitle'), 'font-size'), 17);
  assert.ok(px(rule('.tossTitle'), 'font-size') <= 16);
  // 머리 위·아래 여백 합 ≤ 26px (닫기 32px 와 합쳐 약 59px — 예전 85px)
  for (const sel of ['.cgsHead', '.tossHead']) {
    const m = /padding: (\d+)px \d+px (\d+)px/.exec(rule(sel));
    assert.ok(m && +m[1] + +m[2] <= 26, `${sel} 머리 여백`);
  }
  assert.ok(px(rule('.cgsDone'), 'height') <= 40 && px(rule('.cgsCancel'), 'height') <= 40);
  assert.ok(px(rule('.tossBtn'), 'height') <= 38);
  assert.ok(px(rule('.cgsCard'), 'min-height') <= 66);
  assert.match(rule('.cgSetupCard'), /width: min\(1000px, 100%\)/);
  // 너무 작아 누르기 힘들지 않게 — 닫기·바닥 버튼은 28px 이상
  assert.ok(px(rule('.confirmBtns button'), 'height') >= 28);
  assert.ok(px(rule('.cgsX, .tossX, .tossHeadIcon, .slotHead .x, .imgPopHead button, .apiHead button'), 'width') >= 28);
});

test('카드 = 반사 테두리 + 공통 그림자, 닫기 = 유리 원(SVG X)', () => {
  for (const sel of ['.cgSetupCard', '.tossCard', '.confirmCard', '.slotCard', '.imgPopInner', '#apiPop', '.menuDrop']) {
    const r = rule(sel);
    assert.match(r, /border: 1px solid transparent/, `${sel} 반사 테두리`);
    assert.match(r, /var\(--refl\) border-box/, `${sel} 반사 테두리`);
    assert.match(r, /box-shadow: var\(--pop-(drop-)?shadow\)/, `${sel} 공통 그림자`);
  }
  const x = rule('.cgsX, .tossX, .tossHeadIcon, .slotHead .x, .imgPopHead button, .apiHead button');
  assert.match(x, /border-radius: 50%/);
  assert.match(x, /background: var\(--pop-x-bg\); border: 1px solid var\(--pop-x-line\)/);
  assert.match(x, /backdrop-filter: blur\(10px\)/);
  // 닫기 버튼 글자(× ✕) 대신 SVG
  assert.match(html, /<button class="cgsX" id="cgsX"[^>]*><svg/);
  assert.match(html, /<button id="bulHelpClose"[^>]*><svg/);
  assert.match(html, /<button id="apiClose"[^>]*><svg/);
  assert.match(fn('tossModal'), /<button class="tossX"[^>]*>\$\{POP_X_SVG\}<\/button>/);
  assert.match(fn('openPresetSlots'), /id="slotX"[^>]*>\$\{POP_X_SVG\}<\/button>/);
});

test('열기·닫기 움직임 = 근무표(막 페이드 .32초 + 카드 아래에서 48px .46초, 닫힘 .34초 34px)', () => {
  assert.match(html, /@keyframes popCardIn \{ from \{ opacity: 0; transform: translateY\(48px\); \} \}/);
  assert.match(html, /@keyframes popCardOut \{ to \{ opacity: 0; transform: translateY\(34px\); \} \}/);
  assert.match(rule('.tossCard'), /animation: popCardIn \.46s cubic-bezier\(\.16,1,\.3,1\) both/);
  for (const ov of ['.tossOv', '.confirmOverlay', '#slotOverlay', '.imgPop']) {
    assert.match(html, new RegExp(`${ov.replace('.', '\\.')}\\.popClosing \\{ animation: popOvOut \\.34s ease both; \\}`), `${ov} 닫힘 애니메이션`);
  }
  // CG 구성 = 블러+스케일은 그대로 + 아래에서 올라옴(translate)
  assert.match(rule('.cgSetupCard'), /translate: 0 34px/);
  assert.match(html, /\.cgSetupOv\.on \.cgSetupCard \{ translate: none; transition: [^}]*translate \.46s cubic-bezier\(\.16,1,\.3,1\)/);
  // 닫힘은 class 만 바꾸고 끝나면 숨김/지움 — 재생성·body 잠금 없음
  const close = fn('popAnimClose');
  assert.match(close, /classList\.add\('popClosing'\)/);
  assert.match(close, /setTimeout\(\(\) => \{[^}]*classList\.remove\('popClosing'\); done\(\); \}, 340\)/);
  assert.match(close, /prefers-reduced-motion: reduce/);
  for (const f of ['popAnimClose', 'popAnimCancel']) assert.doesNotMatch(fn(f), /createElement|innerHTML|document\.body\.style|visualViewport/);
  // 확인창·입력창·슬롯·이미지 팝업·토스 모달이 닫힘 애니메이션을 쓴다(그리고 다시 열면 취소)
  for (const f of ['tossConfirm', 'tossPrompt']) {
    assert.match(fn(f), /popAnimCancel\(ov\);[^\n]*\n\s*ov\.classList\.add\('on'\)/, `${f} 열기`);
    assert.match(fn(f), /popAnimClose\(ov, /, `${f} 닫기`);
  }
  assert.match(fn('openPresetSlots'), /const closeSlots = \(\) => popAnimClose\(ov, \(\) => ov\.classList\.remove\('on'\)\)/);
  assert.match(fn('tossModal'), /popAnimClose\(ov, \(\) => ov\.remove\(\)\)/);
  assert.match(html, /const closeBulHelp = \(\) => \{[^\n]*popAnimClose\(bulHelpPop, /);
});

test('앱 전체 버튼·입력칸 약 −12% (최소 크기 유지)', () => {
  // 기본 버튼 34→30px, 입력칸 32→28px, 사이드바 섹션 머리 43→38px
  assert.match(html, /\n  button \{\n[^}]*padding: 7px 10px;/);
  assert.match(html, /border-radius: var\(--ri\); padding: 6px 9px; font: inherit;/);
  assert.match(html, /--rc: 18px; --rb: 10px; --ri: 10px;/);
  assert.match(rule('#panel > .sec > h3'), /padding: 9px 11px;[^}]*font-size: 13\.5px/);
  // 떼어낸 창 단독 머리 높이는 두 곳이 짝(.win.solo .winbar ↔ #wins … > h3)
  const bar = /\.win\.solo \.winbar \{[^}]*height: (\d+)px/.exec(html)[1];
  const h3 = /#wins \.winbody > \.sec > h3 \{[^}]*height: (\d+)px/.exec(html)[1];
  assert.equal(bar, h3);
});

test('사이드바 버튼은 한 줄 — 좁은 칸에서 낱말 중간에 끊겨 두 줄(1.5배 높이)이 되지 않게', () => {
  // nowrap 이면 글자 폭이 최소 폭(flex: 1 이어도 긴 쪽이 조금 넓어짐), 줄보다 넓어지진 않게 max-width. overflow:hidden 금지(최소 폭이 0이 됨)
  const r = rule('#panel .btns > button, #panel .btns > a.linkBtn, #wins .btns > button, #wins .btns > a.linkBtn');
  assert.match(r, /white-space: nowrap;/);
  assert.match(r, /max-width: 100%;/);
  assert.doesNotMatch(r, /overflow/);
  // 예보 종류 3칸은 '단기 육상' 한 줄(<br> 두 줄 금지), 칸 많은 줄은 좌우 여백만 줄임
  assert.doesNotMatch(fn('buildFctKindBtns'), /<br>/);
  assert.match(html, /#fctKindBtns > button \{ padding-left: 6px; padding-right: 6px; \}/);
  assert.match(html, /#swapRamp > button \{ padding-left: 4px; padding-right: 4px; \}/);
  // 두 칸 줄에 들어가게 링크 버튼 글자를 줄였다(기상청은 title 에)
  assert.match(html, /title="기상청 단기예보 페이지 열기[^"]*">단기예보 열기<svg/);
  // 체크박스 글은 낱말 단위 줄바꿈, 글과 괄호 설명이 따로 칸을 나누지 않게 한 span 으로
  assert.match(rule('.chk'), /word-break: keep-all;/);
  assert.match(html, /<input type="checkbox" id="bulLabels" checked><span>숫자 라벨도 만들기 <span/);
});

test('검토 반영 — 팝업 글 대비·낱말 줄바꿈·경고 버튼·취소 테두리', () => {
  // 밝은 테마 보조 글자는 --pop-muted(4.8:1) — 흐린 --on-surface-var(2.5:1) 금지
  for (const sel of ['.tourBody', '.slot .slotState']) assert.match(rule(sel), /color: var\(--pop-muted\)/, sel);
  assert.match(html, /#apiPop \.hint, \.menuDrop \.hint \{ color: var\(--pop-muted\);/);
  assert.doesNotMatch(html, /var\(--on-surface-var,#778\)/);
  // 한글 낱말 중간 끊김 없게(경로 .tossPath 만 break-all)
  for (const sel of ['.tossBody', '.confirmMsg', '.slotFootHint', '.tourBody', '.hint']) assert.match(rule(sel), /word-break: keep-all;/, sel);
  assert.match(rule('.tossPath'), /word-break: break-all/);
  // 어두운 테마 경고 확인 버튼 = 흰 글자 4.5:1 이상인 진한 빨강
  assert.match(html, /:root:not\(\[data-theme="light"\]\) \.confirmBtns button\.pri\.warn \{ background: #dc3545; \}/);
  // CG 구성 취소 = 토스 모달 ghost 버튼처럼 1px 안쪽 테두리
  assert.match(rule('.cgsCancel'), /box-shadow: inset 0 0 0 1px var\(--outline-var\)/);
  assert.match(rule('.tossBtn.ghost'), /box-shadow: inset 0 0 0 1px var\(--outline-var\)/);
});

test('검토 반영 — 배치 지정하기 Esc, 포커스 가두기·돌려주기(공통 도우미)', () => {
  const slots = fn('openPresetSlots');
  assert.match(slots, /window\.addEventListener\('keydown'/, '배치 지정하기도 Esc 로 닫힌다');
  assert.match(slots, /e\.key === 'Escape'\) \{ e\.preventDefault\(\); slotClose\(\); \}/);
  assert.match(slots, /#confirmOverlay\.on:not\(\.popClosing\)/, '위에 뜬 확인·입력창이 먼저 Esc 를 받는다');
  assert.match(slots, /title="닫기 \(Esc\)"/);
  // Esc 리스너는 처음 만들 때 한 번만(열 때마다 쌓이지 않게) — if (!ov) { … } 안
  const made = slots.slice(slots.indexOf('if (!ov) {'), slots.indexOf('renderSlotStates();'));
  assert.match(made, /window\.addEventListener\('keydown'/);
  // 열면 카드로 포커스, 닫으면 연 버튼으로 — 토스 모달·확인창·입력창·배치 지정하기·이미지 안내
  for (const f of ['tossModal', 'tossConfirm', 'tossPrompt', 'openPresetSlots']) assert.match(fn(f), /popFocusIn\(/, f);
  for (const f of ['tossModal', 'tossConfirm', 'tossPrompt']) assert.match(fn(f), /popFocusBack\(ov\)/, f);
  assert.match(html, /const closeBulHelp = [^\n]*popFocusBack\(bulHelpPop\)/);
  for (const f of ['tossModal', 'tossConfirm', 'tossPrompt']) assert.match(fn(f), /popTrapTab\(/, f);
  assert.match(html, /popTrapTab\(bulHelpPop\.querySelector\('\.imgPopInner'\), e\)/);
  for (const card of ['class="tossCard', 'class="slotCard"', 'class="imgPopInner"']) assert.match(html, new RegExp(card + '[^>]*tabindex="-1"'), card);
  for (const f of ['popTrapTab', 'popFocusIn', 'popFocusBack']) assert.doesNotMatch(fn(f), /createElement|innerHTML|document\.body\.style|visualViewport/);
});

test('검토 반영 — 시작 화면·파일 놓기 안내도 약 −12%', () => {
  assert.ok(px(rule('.startSetupBtn'), 'font-size') <= 15);
  assert.match(rule('.startSetupBtn'), /padding: 13px 30px;/);
  assert.ok(px(rule('.startStep'), 'font-size') <= 13);
  assert.match(rule('.startStep'), /padding: 9px 16px;/);
  assert.match(html, /#startLoad, #startResume \{ padding: 9px 18px; font-size: 13px; \}/);
  assert.ok(px(rule('.dropHintCard'), 'font-size') <= 19);
});

test('정의되지 않은 변수(--muted·--surface-2)를 쓰지 않는다', () => {
  assert.doesNotMatch(html, /var\(--muted\b|var\(--surface-2\b/);
});

test('같은 이름 함수가 두 번 정의되지 않는다(팝업 닫기 도우미가 떼어낸 창 popOut 과 겹치지 않게)', () => {
  const seen = {};
  for (const m of html.matchAll(/(?:^|[^\w.$])function\s+([A-Za-z_$][\w$]*)\s*\(/g)) seen[m[1]] = (seen[m[1]] || 0) + 1;
  assert.deepEqual(Object.entries(seen).filter(([, n]) => n > 1), []);
  assert.match(html, /function popOut\(s, x, y\)/, '떼어낸 창 popOut 은 그대로');
});
