// 사이드바 섹션 — (1) 열린 섹션 '눌린' 블록 (2) 화면 요소 클릭 → 섹션 자동 열기 연결 (3) 사이드바 뒤 바탕(체커) 이어짐
// (4) 박스 왼쪽 색선 없음 — 소스로 확인한다. 실제 클릭 동작은 desktop/test/boot-check.cjs 로 화면에서 따로 점검했다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
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
});

test('누르는 동안엔 열지 않고 손을 뗄 때 한 번 — 숨긴 섹션은 열지 않음 — 스크롤은 접힘 애니메이션을 따라감', () => {
  assert.match(html, /window\.addEventListener\('pointerdown', \(e\) => \{\s*_canvasPress = /);
  assert.match(fnSrc('revealSecFor'), /if \(_canvasPress\) \{ _canvasPress\.pending = /);
  assert.match(fnSrc('revealSecTarget'), /if \(secModeHidden\(target\)\) return;/);
  assert.match(fnSrc('revealSecTarget'), /if \(soft && !secClosed\(target\)\) return;/);
  const sp = fnSrc('scrollPanelToSec');
  assert.match(sp, /requestAnimationFrame\(step\)/);
  assert.match(sp, /panelStickyH\(panel\)/);               // 위에 붙은 로고 머리에 가리지 않게
  assert.match(fnSrc('openPanelSec'), /if \(wasOpen && secInView\(sec\)\)/);   // 이미 보이는 중이면 강조만
});
