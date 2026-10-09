// 맨 위 제목줄(#titlebar) — 플로팅 바의 메뉴들을 제목줄로 '옮긴' 구조가 유지되는지 소스로 확인한다.
// (플로팅 바엔 칠하기·브러쉬·이동·되돌리기·다시만, 나머지는 제목줄. 같은 id를 두 군데 만들지 않는다.)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const appSource = require('../tools/app-source.cjs');   // js/·css/로 나뉜 앱을 '한 파일' 텍스트로 합쳐 읽는다(MODULES.md)
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = appSource(path.join(root, 'index.html'));
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
  assert.match(titlebar, /class="menuBtn[^"]*" data-menu="proj"/);
  // 이미지로 추출 = 드롭다운이 아니라 팝업(#exportOv) — menuBtn 이 아니다(setupMenus 가 드롭다운으로 묶지 않게)
  assert.match(titlebar, /<button class="tbMenu tbAction" id="exportBtn" aria-haspopup="dialog"/);
  assert.equal(html.split('data-menu="out"').length - 1, 0, '옛 추출 드롭다운 버튼이 남아 있음');
  for (const id of ['cgSetupBtn', 'exportBtn', 'tlToggle', 'aeSend', 'zoomV', 'theme', 'tourBtn', 'noticeBtn', 'helperBtn', 'menubar', 'exportGroup', 'tbInfoGroup']) {
    assert.match(titlebar, new RegExp(`id="${id}"`), `${id} 가 제목줄에 없음`);
  }
  // 글자 메뉴 — 아이콘 SVG 없이 글자만. 예외: 프로젝트(플로피 디스크 아이콘 버튼), 추출 3버튼(.tbAction)·장면 설정(.tbScene) = 채운 아이콘 + 글자
  for (const b of titlebar.match(/<button[^>]*class="[^"]*tbMenu[^"]*"[^>]*>[\s\S]*?<\/button>/g)) {
    if (/data-menu="proj"/.test(b)) continue;
    if (/class="[^"]*\b(tbAction|tbScene)\b/.test(b)) {
      assert.equal((b.match(/<svg/g) || []).length, 1, '추출 버튼엔 아이콘이 딱 하나: ' + b.slice(0, 80));
      assert.match(b, /<\/svg><span class="tbLbl">[^<]*[^<\s][^<]*<\/span><\/button>$/, '추출 버튼은 아이콘 뒤에 글자(.tbLbl span)가 있어야 한다');
      continue;
    }
    assert.doesNotMatch(b, /<svg/, b.slice(0, 80));
    assert.match(b, />[^<\s][^<]*<\/button>$/, '글자 메뉴엔 글자가 있어야 한다');
  }
});

test('장면 설정(옛 CG 구성) — 출력 화면·지도 종류 두 글자 메뉴를 하나로 합쳤다', () => {
  assert.match(titlebar, /<button class="tbMenu tbScene" id="cgSetupBtn"[^>]*>[\s\S]*?<span class="tbLbl">장면 설정<\/span><\/button>/);
  // 화면에 보이는 글(주석 뺀)엔 옛 이름 'CG 구성'이 남지 않는다
  const shown = html.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1');
  assert.doesNotMatch(shown, /CG 구성/);
  // 옛 두 메뉴와 그 드롭다운 카드·따로 적용 버튼은 없다
  for (const m of ['out0', 'style']) assert.equal(html.split(`data-menu="${m}"`).length - 1, 0, `data-menu="${m}" 이 남아 있음`);
  assert.doesNotMatch(html, /data-sec="out0"|<div class="sec[^"]*" data-sec="style"|id="resApply"|id="styleApply"/);
  // 사용자에게 보이는 글(주석 뺀)에 '출력 화면'이 남지 않는다 — 이름은 'CG 종류'
  const visible = html.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.doesNotMatch(visible, /출력 ?화면/);
});

test('프로젝트 = 플로피 디스크 아이콘 버튼, 추출 3개 = 파란 둥근 사각형 버튼', () => {
  const proj = /<button[^>]*data-menu="proj"[^>]*>[\s\S]*?<\/button>/.exec(titlebar)[0];
  assert.match(proj, /class="menuBtn tbMenu tbIconMenu"/);
  assert.match(proj, /aria-label="프로젝트 — 저장·불러오기"/);
  assert.match(proj, /<svg viewBox="0 0 24 24"/);
  assert.doesNotMatch(proj, />\s*프로젝트\s*</, '글자 대신 아이콘');
  for (const sel of ['id="exportBtn"', 'id="tlToggle"', 'id="aeSend"']) {
    const b = new RegExp(`<button[^>]*${sel}[^>]*>`).exec(titlebar)[0];
    assert.match(b, /class="[^"]*\btbAction\b/, b);
  }
  assert.match(html, /#titlebar \.tbAction \{[^}]*border-radius: 8px;[^}]*background: var\(--tb-act-bg\); color: var\(--tb-act-fg\)/);
  // 열림(.on)·타임라인 켜짐(.pri)은 꽉 찬 파랑
  assert.match(html, /#titlebar \.tbAction\.on, #titlebar \.tbAction\.pri \{[^}]*background: var\(--primary\)/);
  // 밝은 테마는 파란 글자를 한 단계 진하게(대비)
  assert.match(html, /:root\[data-theme="light"\] \{ --tb-act-fg: #1b56d2;/);
});

test('사용자 요청(10-09): 저장(플로피)은 AE로 보내기 오른쪽, 장면 설정은 아이콘 + 색 있는 버튼', () => {
  // 플로피 = 오른쪽 묶음(.tbRight)에서 렌더 버튼 묶음 바로 뒤, 왼쪽 메뉴(.tbMenus)엔 없다
  const right = block(titlebar, /<div class="tbRight">/, 'div');
  const nav = block(titlebar, /<nav class="tbMenus"[^>]*>/, 'nav');
  assert.doesNotMatch(nav, /data-menu="proj"/);
  const afterGroup = right.slice(right.indexOf(block(right, /<div class="tbGroup" id="exportGroup">/, 'div')) + block(right, /<div class="tbGroup" id="exportGroup">/, 'div').length);
  assert.match(afterGroup, /^\s*(<!--[\s\S]*?-->\s*)?<button class="menuBtn tbMenu tbIconMenu" data-menu="proj"/, '렌더 버튼 묶음 바로 다음이 플로피');
  // 오른쪽 묶음이라 드롭다운은 버튼 오른쪽 끝에 맞춰 연다(화면 밖으로 안 나가게)
  assert.match(html, /const alignR = !!btn\.closest\('\.tbRight'\);/);
  // 장면 설정 = 채운 아이콘 하나 + 글자, 다른 글자 메뉴와 같은 모양(사용자 요청 10-09: 버튼 모양·색 없이)
  const scene = /<button[^>]*id="cgSetupBtn"[^>]*>[\s\S]*?<\/button>/.exec(titlebar)[0];
  const svg = /<svg[^>]*>[\s\S]*?<\/svg>/.exec(scene)[0];
  assert.match(svg, /fill="currentColor"/); assert.doesNotMatch(svg, /stroke=/); assert.match(svg, /aria-hidden="true"/);
  assert.match(html, /#titlebar \.tbScene \{ gap: 6px; padding: 0 10px 0 8px; \}/);
  assert.doesNotMatch(html, /--tb-scene-|\.tbScene\.on/, '보라 틴트·그라데이션 없음');
  // 되돌리기·다시 = 장면 설정 바로 오른쪽(제목줄)
  assert.match(titlebar, /id="cgSetupBtn"[\s\S]*?<\/button>\s*(<!--[\s\S]*?-->\s*)?<button id="undo" class="tbHist"[^>]*>[\s\S]*?<\/button>\s*<button id="redo" class="tbHist"/);
  // 장면 설정 버튼 글자를 통째로 덮는 코드가 없다(아이콘이 지워지지 않게)
  assert.doesNotMatch(html, /\$\('#cgSetupBtn'\)\.(textContent|innerText|innerHTML) =/);
});

test('렌더 3버튼 — 한 묶음(세그먼트, 같은 폭), 아이콘 + 글자, 채운 아이콘(currentColor)·AE는 에펙 로고 모양, 맨 왼쪽 앱 아이콘 없음', () => {
  // 사용자 요청(10-09): 세 버튼을 한 묶음으로(글자는 그대로), AE는 에펙 로고 모양을 우리 색으로 — Ae 글자는 마스크로 뚫어 가운데
  assert.match(html, /#titlebar #exportGroup \{ display: inline-grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 1px;[^}]*border: 1px solid var\(--tb-act-ring\);[^}]*overflow: hidden; background: var\(--tb-act-ring\) padding-box;/);
  assert.match(html, /#titlebar #exportGroup \.tbAction \{[^}]*border-radius: 0;/);
  assert.doesNotMatch(html, /#exportGroup \.tbLbl \{/, '글자는 보인다');
  assert.match(html, /#titlebar \.tbAction \{[^}]*justify-content: center;/);
  const aeSvg = /<button[^>]*id="aeSend"[^>]*>(<svg[\s\S]*?<\/svg>)/.exec(titlebar)[1];
  assert.match(aeSvg, /class="aeLogo"/); assert.match(aeSvg, /<mask id="aeLogoCut">/); assert.match(aeSvg, /fill="currentColor" mask="url\(#aeLogoCut\)"/); assert.match(aeSvg, /aria-hidden="true"/);
  assert.doesNotMatch(aeSvg, /#00005b|#9999ff/i, '어도비 색 대신 우리 색');
  for (const sel of ['id="exportBtn"', 'id="tlToggle"']) {
    const b = new RegExp(`<button[^>]*${sel}[^>]*>[\\s\\S]*?<\\/button>`).exec(titlebar)[0];
    const svg = /<svg[^>]*>[\s\S]*?<\/svg>/.exec(b)[0];
    assert.match(svg, /fill="currentColor"/, '채운 아이콘(글자색을 따라감)');
    assert.doesNotMatch(svg, /stroke=/, '선 아이콘이 아니라 채운 아이콘');
    assert.match(svg, /aria-hidden="true"/);
  }
  // 글자를 잠깐 바꿔도 아이콘이 남게 — 추출 버튼은 버튼 전체 textContent/innerText 를 덮지 않고 .tbLbl span 만 바꾼다
  const ae = /async function sendToAE\(\) \{[\s\S]*?\n\}/.exec(html)[0];
  assert.doesNotMatch(ae, /\bbtn\.(textContent|innerText|innerHTML) =/, 'AE 보내기 버튼 글자를 통째로 덮으면 svg 가 지워진다');
  assert.match(ae, /btn\.querySelector\('\.tbLbl'\)/);
  assert.doesNotMatch(html, /\$\('#(aeSend|tlToggle)'\)\.(textContent|innerText|innerHTML) =/);
  // 이모지 금지 — 버튼 글자에 그림 문자가 없다
  assert.doesNotMatch(titlebar, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  // 맨 왼쪽 작은 앱 아이콘(파비콘)은 뺐다
  assert.doesNotMatch(titlebar, /tbAppIcon|<img/);
  assert.doesNotMatch(html, /\.tbAppIcon/);
});

test('플로팅 바엔 손잡이 + 칠하기·브러쉬·이동(아이콘 + 글자)만 — 되돌리기·다시는 제목줄로, 버튼이 바를 꽉 채운다', () => {
  for (const id of ['tbGrip', 'mPaint', 'mBrush', 'mMove']) assert.match(topbar, new RegExp(`id="${id}"`));
  for (const id of ['mPaint', 'mBrush', 'mMove']) assert.match(topbar, new RegExp(`<button id="${id}"[^>]*><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor"`), id + ' 아이콘');
  assert.doesNotMatch(topbar, /menuBtn|id="(undo|redo|tlToggle|aeSend|zoomV|theme|tourBtn|noticeBtn|helperBtn)"/);
  assert.match(html, /\.topbar \{[^}]*padding: 4px; z-index: 10;/);
  assert.match(html, /\.topbar \.mode \{ display: grid; grid-template-columns: repeat\(3, 1fr\);/, '세 버튼 같은 폭');
});

test('옮긴 요소는 하나씩만 있다(복제 금지)', () => {
  for (const id of ['cgSetupBtn', 'cgSetupOv', 'exportBtn', 'exportOv', 'exRender', 'resBtns', 'styleBtns', 'cgsDone', 'tlToggle', 'aeSend', 'zoomV', 'theme', 'tourBtn', 'noticeBtn', 'helperBtn', 'exportGroup', 'tbInfoGroup', 'menubar', 'undo', 'redo']) {
    assert.equal(html.split(`id="${id}"`).length - 1, 1, `id="${id}" 개수`);
  }
  for (const m of ['proj']) assert.equal(html.split(`data-menu="${m}"`).length - 1, 1, `data-menu="${m}" 개수`);
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
  const pop = /function tlPlacePopover\(\) \{[\s\S]*?\n\}/.exec(html)[0];   // 카메라 키 팝오버 배치(openCamKeyPopover가 부른다)
  assert.match(pop, /titleBarH\(\) \+ 8/);
  const guide = /function syncCamGuidePos\(\) \{[\s\S]*?\n\}/.exec(html)[0];
  assert.match(guide, /titleBarH\(\)/);
  assert.match(html, /window\.innerHeight - titleBarH\(\) - 160/);   // 타임라인 최대 높이(무대가 그만큼 줄어든다)
});
