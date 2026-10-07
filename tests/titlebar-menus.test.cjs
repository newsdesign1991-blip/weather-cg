// 맨 위 제목줄(#titlebar) — 플로팅 바의 메뉴들을 제목줄로 '옮긴' 구조가 유지되는지 소스로 확인한다.
// (플로팅 바엔 칠하기·브러쉬·이동·되돌리기·다시만, 나머지는 제목줄. 같은 id를 두 군데 만들지 않는다.)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const mainJs = fs.readFileSync(path.join(root, 'desktop', 'main.js'), 'utf8');
const preloadJs = fs.readFileSync(path.join(root, 'desktop', 'preload.js'), 'utf8');

// 여는 태그부터 짝이 맞는 닫는 태그까지 (같은 태그 중첩 고려)
function block(src, openRe, tag) {
  const m = openRe.exec(src);
  assert.ok(m, `${openRe} 를 찾지 못함`);
  const re = new RegExp(`<${tag}\\b|</${tag}>`, 'g');
  re.lastIndex = m.index + 1;
  let depth = 1, r;
  while ((r = re.exec(src))) {
    depth += r[0].startsWith('</') ? -1 : 1;
    if (depth === 0) return src.slice(m.index, r.index + r[0].length);
  }
  throw new Error(`${tag} 닫는 태그 없음`);
}
const titlebar = block(html, /<header class="titlebar" id="titlebar">/, 'header');
const topbar = block(html, /<div class="topbar" id="topbar">/, 'div');

test('제목줄은 .app 앞에 있고 메뉴·추출·보기 버튼을 모두 담는다', () => {
  assert.ok(html.indexOf('id="titlebar"') < html.indexOf('<div class="app">'));
  for (const m of ['out0', 'style', 'proj', 'out']) assert.match(titlebar, new RegExp(`class="menuBtn[^"]*" data-menu="${m}"`));
  for (const id of ['tlToggle', 'aeSend', 'zoomV', 'theme', 'tourBtn', 'noticeBtn', 'helperBtn', 'menubar', 'exportGroup', 'tbInfoGroup']) {
    assert.match(titlebar, new RegExp(`id="${id}"`), `${id} 가 제목줄에 없음`);
  }
  // 글자 메뉴 — 아이콘 SVG 없이 글자만
  for (const b of titlebar.match(/<button[^>]*class="[^"]*tbMenu[^"]*"[^>]*>[\s\S]*?<\/button>/g)) assert.doesNotMatch(b, /<svg/);
});

test('플로팅 바엔 칠하기·브러쉬·이동·되돌리기·다시만 남는다', () => {
  for (const id of ['tbGrip', 'mPaint', 'mBrush', 'mMove', 'undo', 'redo']) assert.match(topbar, new RegExp(`id="${id}"`));
  assert.doesNotMatch(topbar, /menuBtn|id="(tlToggle|aeSend|zoomV|theme|tourBtn|noticeBtn|helperBtn)"/);
});

test('옮긴 요소는 하나씩만 있다(복제 금지)', () => {
  for (const id of ['tlToggle', 'aeSend', 'zoomV', 'theme', 'tourBtn', 'noticeBtn', 'helperBtn', 'exportGroup', 'tbInfoGroup', 'menubar', 'undo', 'redo']) {
    assert.equal(html.split(`id="${id}"`).length - 1, 1, `id="${id}" 개수`);
  }
  for (const m of ['out0', 'style', 'proj', 'out']) assert.equal(html.split(`data-menu="${m}"`).length - 1, 1, `data-menu="${m}" 개수`);
});

test('데스크톱 창 제목표시줄 — 높이·창 버튼 색 연동', () => {
  const css = /--tbH:\s*(\d+)px/.exec(html);
  const js = /const TITLEBAR_H = (\d+);/.exec(mainJs);
  assert.ok(css && js);
  assert.equal(css[1], js[1], 'CSS --tbH 와 main.js TITLEBAR_H 가 같아야 창 버튼 높이가 맞는다');
  assert.match(mainJs, /titleBarStyle: 'hidden', titleBarOverlay:/);
  assert.match(mainJs, /ipcMain\.on\('wcg:titlebar'/);
  assert.match(preloadJs, /setTitleBar:/);
  assert.match(html, /-webkit-app-region: drag/);
  assert.match(html, /env\(titlebar-area-width/);
  assert.match(html, /function syncTitleBarColors\(\)/);
});

test('제목줄 검토 수정 — 메뉴 열림 중 끌기 해제·창 버튼 어둡게·제목줄 위로 안 올라가기', () => {
  // 드롭다운이 열려 있으면 제목줄 전체 no-drag(빈 곳 클릭으로 닫히게), 닫히면 다시 drag
  assert.match(html, /html\.isDesktop\.menuOpen \.titlebar \{ -webkit-app-region: no-drag; \}/);
  assert.match(html, /classList\.add\('menuOpen'\)/);
  assert.match(html, /classList\.remove\('menuOpen'\)/);
  // 모달·둘러보기 막이 뜨면 창 버튼 자리도 같이 어둡게 (막 감시 → syncTitleBarColors)
  assert.match(html, /function watchTitleBarDim\(\)/);
  assert.match(html, /watchTitleBarDim\(\);/);
  assert.match(html, /\['#tourWrap\.on', 'rgba\(6, 8, 12, \.76\)'\]/);
  assert.match(html, /0 0 0 9999px rgba\(6, 8, 12, \.76\)/, '둘러보기 막 색은 .tourSpot 그림자와 같아야 한다');
  // 둘러보기 카드는 닫기 바(.tourBar)를 비켜 놓는다
  const place = /function tourPlace\(step\) \{[\s\S]*?\n\}/.exec(html)[0];
  assert.match(place, /\.tourBar/);
  // 카메라 키 팝오버·카메라 안내·타임라인 최대 높이는 제목줄 높이를 뺀다
  const pop = /function openCamKeyPopover\(id\) \{[\s\S]*?\n\}/.exec(html)[0];
  assert.match(pop, /titleBarH\(\) \+ 8/);
  const guide = /function syncCamGuidePos\(\) \{[\s\S]*?\n\}/.exec(html)[0];
  assert.match(guide, /titleBarH\(\)/);
  assert.match(html, /window\.innerHeight - titleBarH\(\) - 120/);
});
