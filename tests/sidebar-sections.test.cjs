// 사이드바 섹션 — (1) 열린 섹션 '눌린' 블록 (2) 화면 요소 클릭 → 섹션 자동 열기 연결 (3) 사이드바 뒤 바탕(체커) 이어짐
// (4) 박스 왼쪽 색선 없음 — 소스로 확인한다. 실제 클릭 동작은 desktop/test/boot-check.cjs 로 화면에서 따로 점검했다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const appSource = require('../tools/app-source.cjs');   // js/·css/로 나뉜 앱을 '한 파일' 텍스트로 합쳐 읽는다(MODULES.md)
const path = require('node:path');

const html = appSource(path.join(__dirname, '..', 'index.html'));
const css = (html.match(/<style>[\s\S]*?<\/style>/g) || []).join('\n');

// 'function 이름(' 부터 짝 맞는 닫는 중괄호까지
function fnSrc(name) {
  const i = html.indexOf(`function ${name}(`);
  assert.ok(i >= 0, `${name} 함수가 없음`);
  let d = 0;
  for (let j = html.indexOf('{', i); j < html.length; j++) {
    if (html[j] === '{') d++;
    else if (html[j] === '}' && --d === 0) return html.slice(i, j + 1);
  }
  throw new Error(`${name} 끝을 못 찾음`);
}

test('박스 왼쪽 색선(border-left 강조선)이 없다', () => {
  // 투명 테두리로 만드는 삼각형(화살표)만 허용 — 색이 있는 2px 이상 왼쪽 선은 없어야 한다
  const bad = css.split('\n').filter((l) => /border-left(-width)?\s*:\s*([2-9]|\d{2,})(\.\d+)?px/.test(l) && !/transparent/.test(l));
  assert.deepEqual(bad, []);
  for (const sel of ['.bulBox', '.fctBox']) {
    const rule = css.match(new RegExp(`\\${sel}\\s*\\{[^}]*\\}`));
    assert.ok(rule, `${sel} 규칙이 없음`);
    assert.doesNotMatch(rule[0], /border-left/);
    assert.match(rule[0], /border-radius/);   // 박스 자체(둥근 모서리)는 그대로
  }
});

test('열린 섹션은 사이드바보다 어두운 바탕의 한 블록(두 테마 모두)', () => {
  assert.match(css, /:root, :root\[data-theme="dark"\] \{\s*--sec-well:/);
  assert.match(css, /:root\[data-theme="light"\] \{\s*--sec-well:/);
  assert.match(css, /#panel > \.sec::before \{[^}]*background: var\(--sec-well\)[^}]*box-shadow: var\(--sec-well-sh\)/);
  assert.match(css, /#panel > \.sec:not\(\.closed\)::before \{ opacity: 1; \}/);
  assert.match(css, /#panel > \.sec:not\(\.closed\) > h3 \{ background: var\(--nav-active-bg\); color: var\(--nav-active-fg\); \}/);   // 머리 활성 표시 유지
});

test('사이드바 뒤·옆 바탕 = 작업 영역 체커(창 기준으로 맞물림), 레이아웃은 그대로', () => {
  const rule = css.match(/\.app, \.stage, \.startOverlay \{[^}]*\}/);
  assert.ok(rule, '.app/.stage/.startOverlay 공용 바탕 규칙이 없음');
  assert.match(rule[0], /background-attachment: fixed/);
  assert.match(rule[0], /var\(--stage-check\)/);
  const stage = css.match(/\n  \.stage \{[^}]*\}/)[0];
  assert.doesNotMatch(stage, /background/);              // 무늬는 공용 규칙 하나만 — 따로 그리면 칸이 어긋난다
  assert.match(stage, /flex: 1; display: flex; align-items: center; justify-content: center;/);   // 중앙 맞춤 그대로
  assert.match(stage, /padding: 26px 74px; overflow: hidden;/);
});

test('화면 요소 → 섹션 연결표 (지도 종류별)', () => {
  const make = (cmp) => new Function('isTyphoonCompare', `${fnSrc('secForKind')}; return secForKind;`)(() => cmp);
  const n = make(false), c = make(true);
  assert.equal(n('text'), 'text');
  assert.equal(n('vfBar'), 'text');
  assert.equal(n('label'), 'label');
  assert.equal(n('mtn'), 'mtn');
  assert.equal(n('legend'), 'legend');
  assert.equal(n('map'), 'map');
  assert.equal(n('bg'), 'res');                           // 배경 그림 → 배경 · 가이드
  assert.equal(n('paint'), 'pal');
  assert.equal(n('place'), 'typhoonPlaces');
  assert.equal(n('typhoon'), 'typhoon');
  assert.equal(c('label'), null);                         // 비교 지도엔 기본 수치라벨 탭이 없다
  assert.equal(c('legend'), 'typhoonCompare');            // 범례 토글이 '태풍 비교' 안
  assert.deepEqual(c('typhoon', 'cmp1'), { cmp: 'cmp1' }); // 예보선 → 그 태풍 탭
  assert.deepEqual(c('cmp', 'cmp2'), { cmp: 'cmp2' });
  assert.equal(c('refImg'), 'typhoonCompare');
  assert.equal(n('nothing'), null);
});

test('캔버스 요소 핸들러가 모두 공통 함수(revealSecFor)로 연결되고, 칠하기는 접혀 있을 때만', () => {
  assert.match(fnSrc('select'), /revealSecFor\(/);
  assert.match(fnSrc('startPlaceLabelDrag'), /revealSecFor\('place'\)/);
  assert.match(fnSrc('startPlaceDotDrag'), /revealSecFor\('place'\)/);
  assert.match(fnSrc('drawCompareLabels'), /revealSecFor\('cmp', c\.id\)/);
  assert.match(fnSrc('drawPointHandles'), /revealSecFor\('cmp', c\.id\)/);
  assert.match(fnSrc('renderRefImg'), /addEventListener\('pointerdown', \(e\) => \{ if \(e\.button === 0\) revealSecFor\('refImg'\); \}, true\)/);
  for (const g of ['vfScaleGrip', 'vfBarGrip', 'vfBarHit']) assert.match(html, new RegExp(`closest\\('#${g}'\\)\\) \\{ [^}]*revealSecFor\\('vfBar'\\)`));
  assert.match(html, /closest\('#L_typhoon'\)\) \{ [^}]*revealSecFor\('typhoon', [^)]*'click'\)/);
  // 칠하기·브러쉬·스포이드·브러쉬 모드 → 'soft'(이미 펴져 있으면 아무것도 안 함)
  assert.doesNotMatch(html, /revealSec\('pal'\)/);
  assert.ok((html.match(/revealSecFor\('paint', null, 'soft'\)/g) || []).length >= 5);
  // 선택된 글자·라벨·산의 크기 손잡이(.selGrip)도 그 섹션 — select()와 같은 연결
  assert.match(html, /closest\('\.selGrip'\)\) \{ if \(sel\.length === 1\) revealSecFor\(sel\[0\]\.kind === 'text' \|\| sel\[0\]\.kind === 'mtn' \? sel\[0\]\.kind : 'label'\); startResizeSel\(e\); return; \}/);
});

test('이동 모드: 지도·도서 박스를 끌면 지도 위치(끌 때만·접혀 있을 때만), 배경 그림 딱 클릭은 배경 · 가이드', () => {
  // 'drag' = 끌었을 때만 + soft
  assert.match(fnSrc('revealSecTarget'), /const soft = how === 'soft' \|\| how === 'drag';/);
  assert.match(html, /\(r\.how === 'click' \? !p\.moved : r\.how === 'drag' \? p\.moved : true\)/);
  assert.match(html, /revealSecFor\('map', null, 'drag'\); startResizeInset\(e, grip\.dataset\.inset\)/);
  assert.match(html, /revealSecFor\('map', null, 'drag'\); startDragInset\(e, box\.dataset\.inset\)/);
  assert.match(html, /revealSecFor\('map', null, 'drag'\);   \/\/ 끌어서 옮기면 → 지도 위치\(놓을 때\)\r?\n\s*startDragMap\(e\);/);
  // 배경: 태풍 지도의 바다·광역 육지(지도)는 빼고, 이동 모드에서 딱 클릭만
  assert.match(html, /if \(e\.target\.id === 'bgImg' && !isTyphoon\(\)\) revealSecFor\('bg', null, 'click'\);/);
  // 같은 누름에 둘(클릭이면 배경, 끌면 지도 위치)을 걸고 놓을 때 조건 맞는 마지막 하나만 — 실제로 골라 보기
  const endSrc = /const endPress = \(\) => \{[\s\S]*?\n  \};/.exec(html)[0];
  const run = (moved, pending) => {
    const opened = [];
    const env = { _canvasPress: { moved, pending }, setTimeout: (f) => f(), revealSecTarget: (t, h) => opened.push([t, h]) };
    new Function('env', `let _canvasPress = env._canvasPress; const setTimeout = env.setTimeout, revealSecTarget = env.revealSecTarget; ${endSrc}; endPress();`)(env);
    return opened;
  };
  const both = [{ target: 'res', how: 'click' }, { target: 'map', how: 'drag' }];
  assert.deepEqual(run(false, both), [['res', 'click']]);   // 딱 클릭 → 배경 · 가이드
  assert.deepEqual(run(true, both), [['map', 'drag']]);     // 끌기 → 지도 위치
  assert.deepEqual(run(false, [{ target: 'map', how: 'drag' }]), []);   // 지도 빈 곳 딱 클릭(선택 해제) → 사이드바 그대로
});

test('누르는 동안엔 열지 않고 손을 뗄 때 한 번 — 숨긴 섹션은 열지 않음 — 스크롤은 접힘 애니메이션을 따라감', () => {
  assert.match(html, /window\.addEventListener\('pointerdown', \(e\) => \{\s*_canvasPress = /);
  assert.match(fnSrc('revealSecFor'), /if \(_canvasPress\) \{ \(_canvasPress\.pending \|\|= \[\]\)\.push\(\{ target, how \}\); return; \}/);
  assert.match(fnSrc('revealSecTarget'), /if \(secModeHidden\(target\)\) return;/);
  assert.match(fnSrc('revealSecTarget'), /if \(soft && !secClosed\(target\)\) return;/);
  const sp = fnSrc('scrollPanelToSec');
  assert.match(sp, /requestAnimationFrame\(step\)/);
  assert.match(sp, /panelStickyH\(panel\)/);               // 위에 붙은 로고 머리에 가리지 않게
  assert.match(fnSrc('openPanelSec'), /if \(wasOpen && secInView\(sec\)\)/);   // 이미 보이는 중이면 강조만
});
