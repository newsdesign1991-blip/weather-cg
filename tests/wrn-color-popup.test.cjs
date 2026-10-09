// 특보 종류별 색 — 사이드바의 색 격자(종류마다 색 칸 + #hex 두 쌍)를 버튼 하나로 숨기고, 누르면 2분할 팝업(왼쪽 특보 종류 · 오른쪽 고른 특보의 단계별 색).
// 사용자 요청(2026-10-09): "특보 종류별 색을 이렇게 하지 말고 그냥 버튼으로 숨겨 주고, 누르면 팝업으로 각 특보의 종류와 표시되는 색을 정리 —
// 2분할로 왼쪽엔 특보 종류, 오른쪽엔 고른 특보의 세세한 분류들과 칠해지는 색".
// 소스 검사(격자 없음·버튼·팝업 구조·저장 경로를 vm으로 실행) + (WCG_BOOT_CHECK=1 일 때) 실제 앱에서 눌러 본다.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const appSource = require('../tools/app-source.cjs');   // js/·css/로 나뉜 앱을 '한 파일' 텍스트로 합쳐 읽는다(MODULES.md)

const root = path.join(__dirname, '..');
const html = appSource(path.join(root, 'index.html')).replace(/\r\n/g, '\n');

function between(startText, endText) {
  const s = html.indexOf(startText);
  assert.notEqual(s, -1, `없음: ${startText}`);
  const e = html.indexOf(endText, s);
  assert.notEqual(e, -1, `없음: ${endText}`);
  return html.slice(s, e);
}
function block(openRe, tag) {
  const m = openRe.exec(html);
  assert.ok(m, `${openRe} 를 찾지 못함`);
  const re = new RegExp(`<${tag}\\b|</${tag}>`, 'g');
  re.lastIndex = m.index + 1;
  let depth = 1, r;
  while ((r = re.exec(html))) {
    depth += r[0].startsWith('</') ? -1 : 1;
    if (depth === 0) return html.slice(m.index, r.index + r[0].length);
  }
  throw new Error(`${tag} 닫는 태그 없음`);
}
const fn = (name) => {
  const m = new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}`).exec(html);
  assert.ok(m, `function ${name} 없음`);
  return m[0];
};
const wrnSec = block(/<div class="sec special" data-sec="wrn">/, 'div');
const pop = block(/<div class="cgSetupOv wrnColOv" id="wrnColOv"[^>]*>/, 'div');

test('사이드바 — 색 격자 대신 버튼 하나(오른쪽 색 점 미리보기)', () => {
  assert.doesNotMatch(html, /id="wrnCols"/, '옛 격자 자리 없음');
  assert.doesNotMatch(wrnSec, /주의보 \/ 경보 · 위가 우선/);
  assert.doesNotMatch(wrnSec, /type="color"/, '특보 섹션 마크업에 색 칸 없음');
  assert.match(wrnSec, /<button type="button" class="wrnColBtn" id="wrnColBtn" aria-haspopup="dialog" aria-controls="wrnColOv"[^>]*>\s*<span class="wrnColBtnTxt">특보 종류별 색<\/span>\s*<span class="wrnColDots" id="wrnColDots" aria-hidden="true"><\/span>\s*<svg/);
  // 버튼은 들어온 특보 목록 아래(옛 격자 자리)
  assert.ok(wrnSec.indexOf('id="wrnInfo"') < wrnSec.indexOf('id="wrnColBtn"'));
  // buildWrnCols = 점만 그리고 칸(격자)을 만들지 않는다. 팝업이 떠 있으면 제자리 갱신
  const b = fn('buildWrnCols');
  assert.doesNotMatch(b, /type="color"|input\[type=color\]|#wrnCols/);
  assert.match(b, /\$\('#wrnColDots'\)/);
  assert.match(b, /keys\.slice\(0, 6\)/);
  assert.match(b, /wrnColorOf\(k, '경보'\)/);
  assert.match(b, /if \(wrnColPopIsOpen\(\)\) wrnColSyncPop\(\);/);
  // 되돌리기·불러오기·배치 적용 뒤에도 점·팝업이 상태를 따라온다(syncPanelFromState — applyState·loadProjectData·applyPreset이 부른다)
  assert.match(fn('syncPanelFromState'), /\n  buildWrnCols\(\);/);
  // 처음 보는 특보 안내도 버튼을 가리킨다
  assert.match(html, /회색으로 넣었어요 — 아래 ‘특보 종류별 색’ 버튼에서 바꾸세요/);
});

test('팝업 구조 — 장면 설정 창과 같은 틀(옅은 틴트 머리·유리 원 닫기·2분할·바닥 완료), body 밖 한 개', () => {
  assert.equal((html.match(/id="wrnColOv"/g) || []).length, 1);
  assert.ok(!wrnSec.includes('id="wrnColOv"'),'팝업은 섹션 밖(떼어낸 창으로 옮겨지지 않게)');
  assert.match(pop, /<div class="cgSetupCard wrnColCard" role="dialog" aria-modal="true" aria-labelledby="wrnColTitle" tabindex="-1">/);
  assert.match(pop, /<div class="cgsHead">\s*<div class="cgsHeadTxt">\s*<div class="cgsTitle" id="wrnColTitle">특보 종류별 색<\/div>\s*<div class="cgsSub">[^<]+<\/div>/);
  assert.match(pop, /<button class="cgsX" id="wrnColX" aria-label="닫기" title="닫기 \(Esc\)"><svg/);
  // 왼쪽 = 특보 종류(파란 판, tablist) + 순서 뜻 한 줄 / 오른쪽 = 고른 특보(청록 판, tabpanel) 단계 카드 + 기본색으로
  const body = pop.slice(pop.indexOf('<div class="cgsBody wrnColBody">'));
  const left = body.indexOf('cgsPaneRes wrnColPaneList'), right = body.indexOf('cgsPaneStyle wrnColPaneDet');
  assert.ok(left > 0 && right > left, '왼쪽 목록 · 오른쪽 단계');
  assert.match(pop, /<div class="wrnColList" id="wrnColList" role="tablist" aria-orientation="vertical" aria-label="특보 종류"><\/div>/);
  assert.match(pop, /위가 우선 — 겹침 표시를 켜면 여러 특보 색이 교차 띠로 보여요/);
  assert.match(pop, /id="wrnColDet" role="tabpanel"/);
  assert.match(pop, /<button type="button" class="cgsPick wrnColReset" id="wrnColReset"[^>]*>기본색으로<\/button>/);
  assert.match(pop, /<div class="wrnColLevels" id="wrnColLevels"><\/div>/);
  assert.match(pop, /<button class="cgsDone" id="wrnColDone">완료<\/button>/);
  // 단계 카드 = 큰 색 칸(type=color) + #hex + 지도 조각
  const det = fn('wrnColRenderDet');
  assert.match(det, /<input type="color" class="wrnColSw"/);
  assert.match(det, /<input type="text" class="wrnColHex" maxlength="7"/);
  assert.match(det, /<div class="wrnColChip" aria-hidden="true"><\/div>/);
  assert.match(det, /wrnColChipTpl\(k === '풍랑' \? 'sea' : 'land'\)/, '풍랑은 바다 조각');
  // 목록 줄 = 순번·이름·지도에·단계 색 점, 고른 줄 aria-selected
  const list = fn('wrnColRenderList');
  assert.match(list, /b\.setAttribute\('role', 'tab'\)/);
  assert.match(list, /b\.setAttribute\('aria-selected', on \? 'true' : 'false'\)/);
  assert.match(list, /Object\.keys\(S\.wrnColors \|\| \{\}\)/, '순서 = S.wrnColors 키 순서(위가 우선)');
});

test('팝업 공통 규칙 — class 로 여닫기(다시 만들기·body 잠금 없음), Esc·바깥 클릭·X·Tab 가두기, 데스크톱 제목줄·창 버튼', () => {
  const o = fn('openWrnColPop'), c = fn('closeWrnColPop'), s = fn('setupWrnColPop');
  for (const f of [o, c]) assert.doesNotMatch(f, /createElement|innerHTML|document\.body\.style|visualViewport|\.remove\(\)/);
  assert.match(o, /ov\.classList\.add\('on'\); ov\.setAttribute\('aria-hidden', 'false'\);/);
  assert.match(c, /ov\.classList\.remove\('on'\); ov\.setAttribute\('aria-hidden', 'true'\);/);
  assert.match(o, /document\.documentElement\.classList\.add\('wrnColOpen'\)/);
  assert.match(c, /document\.documentElement\.classList\.remove\('wrnColOpen'\)/);
  assert.match(html, /html\.isDesktop\.wrnColOpen \.titlebar \{ -webkit-app-region: no-drag; \}/);
  assert.match(html, /\['#wrnColOv\.on', 'var\(--pop-ov\)'\]/, '데스크톱 창 버튼도 같이 어둡게(막 감시 목록)');
  assert.match(c, /back\.focus\(\{ preventScroll: true \}\)/, '닫으면 연 버튼으로 포커스');
  assert.match(s, /\$\('#wrnColBtn'\)\.onclick = /, '버튼 자체에 붙인다(떼어낸 창에서도)');
  assert.match(s, /\$\('#wrnColX'\)\.onclick = closeWrnColPop;/);
  assert.match(s, /\$\('#wrnColDone'\)\.onclick = closeWrnColPop;/);
  assert.match(s, /if \(e\.target === ov && downOnOv\) closeWrnColPop\(\);/, '바깥 클릭 = 막에서 누르고 뗄 때만');
  assert.match(s, /if \(e\.key === 'Escape'\) \{ e\.preventDefault\(\); closeWrnColPop\(\); return; \}/);
  assert.match(s, /popTrapTab\(ov\.querySelector\('\.cgSetupCard'\), e\)/);
  assert.match(s, /#tossOv:not\(\.popClosing\)/, '위에 뜬 확인창이 먼저 키를 받는다');
  assert.match(s, /if \(key === 'y' \|\| e\.shiftKey\) redo\(\); else undo\(\);/, '떠 있는 동안 Ctrl+Z·Y');
  // 떠 있는 동안 뒤 지도 단축키(화살표 이동·삭제 등)는 막는다
  assert.match(html, /\n  if \(wrnColPopIsOpen\(\)\) return;   \/\/ 특보 종류별 색 팝업도/);
  assert.match(fn('wire'), /setupWrnColPop\(\);/);
  // 열고 닫는 움직임 = 장면 설정 창 그대로(.cgSetupOv·.cgSetupCard 규칙을 같이 쓴다)
  assert.match(pop, /^<div class="cgSetupOv wrnColOv"/);
});

test('스타일 — 넓은 창 2분할·좁은 창 위아래, 색은 토큰만(두 테마)', () => {
  const css = between('  /* ===== 특보 종류별 색 — 사이드바 버튼', '@media (max-width: 560px) {\n    .wrnColLv');
  assert.ok(css.length > 1000);
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/, '하드코딩 색 금지 — 토큰(var(--…))만');
  assert.match(css, /\.wrnColBody \{ grid-template-columns: minmax\(0, 320px\) minmax\(0, 1fr\);/);
  assert.match(css, /@media \(max-width: 900px\) \{\n    \.wrnColCard \{ height: auto; \}\n    \.wrnColBody \{ grid-template-columns: minmax\(0, 1fr\); overflow-y: auto; \}/);
  // 좁은 창에선 판이 내용 높이 그대로 — 넓은 창의 min-height: 0 이 남으면 줄이 눌려 마지막 단계 카드·안내가 판 밖으로 샌다(검토 때 잡음)
  assert.match(css, /@media \(max-width: 900px\) \{[\s\S]*?\.wrnColPaneList, \.wrnColPaneDet \{ min-height: auto; \}/);
});

// 저장 경로 — 옛 격자·들어온 특보 목록과 같은 자리(S.wrnColors · S.wrnLevelColors)를 쓰는지 실제로 돌려 본다
function colorCtx() {
  const state = between('const WRN_COLORS =', 'const listOf =');
  const hexHelper = between('const hex = (v) =>', '\n');
  const colors = between('const wrnColorKey =', '// ===================== API 주소');
  const pop = between('const WRN_COL_LV =', '\n// 지도 조각 미리보기 틀 — ');
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(`var wrnRows = [];\n${state}\n${hexHelper}\n${colors}\n${pop}\nglobalThis.__S = () => S; globalThis.__rows = (r) => { wrnRows = r; };`, ctx, { filename: 'wrn-color-popup.js' });
  return ctx;
}

test('색 바꾸기 — 주의보·경보 = S.wrnColors(옛 격자 자리), 그 밖 단계 = S.wrnLevelColors, 칠 = wrnColorOf', () => {
  const c = colorCtx(), S = () => c.__S();
  c.wrnColSet('폭염', '경보', '#123456');
  assert.equal(S().wrnColors['폭염'][1], '#123456');
  assert.equal(S().wrnColors['폭염'][0], '#F57C00', '주의보는 그대로');
  assert.equal(c.wrnColorOf('폭염', '경보'), '#123456');
  assert.equal(c.wrnColorOf('폭염', '중대경보'), '#8B0000', '중대경보는 따로');
  // 들어온 특보 목록에서 정한 같은 단계 색이 있으면 걷어서 고른 색이 그대로 칠해진다
  c.setWrnLevelColor('호우', '경보', '#ABCDEF');
  c.wrnColSet('호우', '경보', '#112233');
  assert.equal(S().wrnLevelColors['호우|경보'], undefined);
  assert.equal(c.wrnColorOf('호우', '경보'), '#112233');
  // 예비특보 — 따로 안 정하면 주의보 색을 따라감, 정하면 '종류|예비'
  let inf = c.wrnColLevelInfo('호우', '예비');
  assert.deepEqual([inf.tag, inf.follow, inf.col, inf.name], ['follow', '주의보', '#6485E6', '예비특보']);
  c.wrnColSet('호우', '예비', '#00FF00');
  assert.equal(S().wrnLevelColors['호우|예비'], '#00FF00');
  assert.equal(S().wrnColors['호우'][0], '#6485E6');
  inf = c.wrnColLevelInfo('호우', '예비');
  assert.deepEqual([inf.tag, inf.col], ['mine', '#00FF00']);
  assert.deepEqual(JSON.parse(JSON.stringify(c.wrnColLevelInfo('폭염', '중대경보'))).tag, 'def');
});

test('단계 목록·기본색으로 — 예비·주의보·경보 + 정해 둔·들어온 단계, 이 종류만 배포 기본색', () => {
  const c = colorCtx(), S = () => c.__S();
  assert.deepEqual([...c.wrnColLevelsOf('호우')], ['예비', '주의보', '경보']);
  assert.deepEqual([...c.wrnColLevelsOf('폭염')], ['예비', '주의보', '경보', '중대경보']);
  c.__rows([{ wrn: '대설', lvl: '중대경보', id: 'L1' }]);
  assert.deepEqual([...c.wrnColLevelsOf('대설')], ['예비', '주의보', '경보', '중대경보'], '들어온 단계도');
  assert.equal(c.wrnColLevelInfo('대설', '중대경보').follow, '경보', '이름에 경보가 들어간 단계는 경보 색을 따라감');
  assert.equal(c.wrnColLevelInfo('대설', '중대경보').now, 1, '지금 칠한 구역 수');
  assert.equal(c.wrnColIsDefault('폭염'), true);
  c.wrnColSet('폭염', '주의보', '#010203'); c.wrnColSet('폭염', '예비', '#040506'); c.wrnColSet('폭염', '중대경보', '#070809');
  c.wrnColSet('호우', '경보', '#0A0B0C');
  assert.equal(c.wrnColIsDefault('폭염'), false);
  c.wrnColResetType('폭염');
  assert.deepEqual([...S().wrnColors['폭염']], ['#F57C00', '#FA2E1E']);
  assert.equal(S().wrnLevelColors['폭염|예비'], undefined);
  assert.equal(S().wrnLevelColors['폭염|중대경보'], '#8B0000', '배포 단계색은 다시 채움');
  assert.equal(c.wrnColIsDefault('폭염'), true);
  assert.equal(S().wrnColors['호우'][1], '#0A0B0C', '다른 종류는 그대로');
  // 처음 보는 특보(회색으로 들어온 것)는 회색이 기본
  S().wrnColors['새특보'] = ['#C4C4C4', '#8C8C8C'];
  assert.equal(c.wrnColIsDefault('새특보'), true);
  // #hex 입력 — # 없이·세 자리도
  assert.equal(c.wrnColHexIn('123456'), '#123456');
  assert.equal(c.wrnColHexIn(' #abc '), '#AABBCC');
  assert.equal(c.wrnColHexIn('zz'), null);
});

test('바꾸면 되돌리기 기록·지도 칠·목록이 옛 격자와 같게 따라온다', () => {
  const det = fn('wrnColRenderDet');
  assert.match(det, /pushUndo\('wrncol\|' \+ k \+ '\|' \+ l\);\n\s*wrnColSet\(k, l, v\); wrnColChanged\(\);/, '색 칸 — 끄는 동안 한 번의 되돌리기로');
  assert.match(det, /pushUndo\(\);\n\s*wrnColSet\(k, l, v\); wrnColChanged\(\);/, '#hex');
  assert.match(fn('wrnColChanged'), /if \(wrnRows\.length\) \{ buildWrnList\(\); paintWrn\(\); \}\n\s*buildWrnCols\(\);/);
  assert.match(fn('setupWrnColPop'), /pushUndo\(\);\n\s*wrnColResetType\(k\); wrnColChanged\(\);/, '기본색으로도 되돌리기 가능');
  // 들어온 특보 목록에서 단계 색을 바꿔도 버튼 점(경보 색)이 따라온다
  assert.match(fn('buildWrnList'), /setWrnLevelColor\(a\.wrn, a\.lvl, e\.target\.value\);\n\s*paintWrn\(\); renderLegend\(\);\n\s*buildWrnCols\(\);/);
  // 배치(프리셋)·설정 옮기기·자동 저장은 S 그대로 — 두 키가 배치 키에 있다
  assert.match(html, /'wrnColors', 'wrnLevelColors'/);
  // 색 칸을 끄는 중엔 카드를 다시 만들지 않는다(색 고르기 창이 닫히지 않게) — 단계 목록이 바뀔 때만 새로
  assert.match(fn('wrnColSyncPop'), /if \(box && box\.dataset\.sig !== wrnColPick \+ '\|' \+ \(wrnColPick \? wrnColLevelsOf\(wrnColPick\) : \[\]\)\.join\(','\)\) wrnColRenderDet\(\);\n\s*else wrnColSyncDet\(\);/);
});

// ── 실제 앱(부팅 점검기) — WCG_BOOT_CHECK=1 일 때만 ──
test('부팅 점검: 특보 지도 → 버튼 → 팝업 → 폭염 경보 #123456 → 상태·지도 칠 → Ctrl+Z → Esc', { skip: process.env.WCG_BOOT_CHECK !== '1' && 'WCG_BOOT_CHECK=1 일 때만(일렉트론 필요)' }, () => {
  const raw = execFileSync(process.execPath, [path.join(root, 'desktop', 'test', 'boot-check.cjs'), root, '--wait=8000', '--size=1600x900', '--eval=' + path.join(__dirname, 'wrn-color-popup.boot-eval.js')], { encoding: 'utf8', timeout: 300000 });
  const out = JSON.parse(raw.slice(raw.indexOf('{')));
  assert.equal(out.ok, true, JSON.stringify(out.errors));
  const R = out.evalResult;
  assert.deepEqual(R.sidebar, { grid: false, btn: true, dots: 6, text: '특보 종류별 색' });
  assert.deepEqual(R.before, { state: '#FA2E1E', fill: '#FA2E1E', svg: '#FA2E1E' });
  assert.deepEqual(R.listDot, { exact: '#0000FF', dot: 'rgb(0, 0, 255)' }, '들어온 특보 목록 색 → 버튼 점');
  assert.deepEqual(R.listDotUndo, { exact: null, dot: 'rgb(250, 46, 30)' }, '지도에서 Ctrl+Z → 버튼 점도');
  assert.deepEqual([R.open.open, R.open.aria, R.open.htmlCls, R.open.focusIn, R.open.count, R.open.dim], [true, 'false', true, true, '13종', 1]);
  assert.deepEqual(R.open.items.slice(0, 4), ['호우', '대설', '폭염', '열대야'], '위가 우선 순서 그대로');
  assert.deepEqual([R.hou.name, R.hou.levels, R.hou.sel], ['호우 특보', ['예비', '주의보', '경보'], ['호우']]);
  assert.deepEqual(R.pick, { name: '폭염 특보', levels: ['예비:follow:#F57C00', '주의보:def:#F57C00', '경보:def:#FA2E1E', '중대경보:def:#8B0000'], sel: ['폭염'], ariaSel: 'true', chip: true, resetDisabled: true });
  const ch = R.changed;
  assert.deepEqual([ch.state, ch.fill, ch.svg, ch.hex, ch.sw, ch.tag, ch.chipFill], ['#123456', '#123456', '#123456', '#123456', '#123456', 'mine', '#123456'], '상태·지도 칠·팝업');
  assert.equal(ch.listDot[1], 'rgb(18, 52, 86)', '왼쪽 목록 점');
  assert.equal(ch.sideDot, 'rgb(18, 52, 86)', '사이드바 버튼 점');
  assert.deepEqual([ch.resetDisabled, ch.open, ch.other], [false, true, { 주의보: '#F57C00', 중대경보: '#8B0000' }]);
  assert.deepEqual(R.undone, { state: '#FA2E1E', fill: '#FA2E1E', svg: '#FA2E1E', hex: '#FA2E1E', tag: 'def', open: true, resetDisabled: true }, 'Ctrl+Z 로 되돌아감(팝업 열린 채)');
  assert.deepEqual(R.redone, { state: '#123456', svg: '#123456' }, 'Ctrl+Y');
  assert.deepEqual(R.preBefore, { tag: 'follow', exact: null });
  assert.deepEqual(R.preAfter, { tag: 'mine', exact: '#00FF00', warnAdv: '#F57C00', tagText: '바꾼 색' }, '예비특보만 따로');
  assert.deepEqual(R.reset, { exact: null, major: '#8B0000', disabled: true, tag: 'follow' });
  assert.deepEqual(R.resetUndo, { exact: '#00FF00', disabled: false });
  assert.deepEqual(R.allUndone, { exact: null, hou: '#6485E6,#0C46DC', pok: '#F57C00,#FA2E1E' });
  assert.deepEqual(R.keys, { mapSame: true, picked: '열대야 특보', focus: '열대야' }, '↓ 로 고르기, 지도 화살표 이동은 막힘');
  assert.deepEqual(R.trap, { fromLast: 'wrnColX', fromFirstBack: 'wrnColDone' });
  assert.deepEqual(R.esc, { open: false, aria: 'true', htmlCls: false, focusBtn: 'wrnColBtn', dim: 0 });
  assert.deepEqual(R.outside, { dragOutStaysOpen: true, closed: true });
  assert.equal(R.xClose, true);
  assert.deepEqual(R.win, { inWin: true, open: true, closed: true, docked: true }, '떼어낸 창에서도 버튼 동작');
  assert.equal(R.saved, '#F57C00,#FA2E1E', '자동 저장에도 되돌린 색');
});

test('부팅 점검: 좁은 창(820px) — 두 판 위아래, 마지막 단계 카드·안내가 판 안, 본문 스크롤', { skip: process.env.WCG_BOOT_CHECK !== '1' && 'WCG_BOOT_CHECK=1 일 때만(일렉트론 필요)' }, () => {
  const raw = execFileSync(process.execPath, [path.join(root, 'desktop', 'test', 'boot-check.cjs'), root, '--wait=8000', '--size=820x900', '--eval=' + path.join(__dirname, 'wrn-color-popup.boot-eval.js')], { encoding: 'utf8', timeout: 300000 });
  const out = JSON.parse(raw.slice(raw.indexOf('{')));
  assert.equal(out.ok, true, JSON.stringify(out.errors));
  assert.deepEqual(out.evalResult.narrow, { cols: 1, scrolls: true, lastIn: true, noteIn: true, listIn: true, closed: true });
});
