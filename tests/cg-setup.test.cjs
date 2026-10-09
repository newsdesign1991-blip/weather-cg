// CG 구성 창 — '출력 화면'(→ CG 종류)과 '지도 종류'를 한 창에서 고르고, 둘 다 골라 '선택 완료'를 눌러야 적용된다.
// 소스 검사 + (WCG_BOOT_CHECK=1 일 때) 실제 앱을 띄워 고르기·완료·취소·프로젝트 아이콘·추출 버튼을 눌러 본다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const appSource = require('../tools/app-source.cjs');   // js/·css/로 나뉜 앱을 '한 파일' 텍스트로 합쳐 읽는다(MODULES.md)
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const html = appSource(path.join(root, 'index.html')).replace(/\r\n/g, '\n');

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
const fn = (name) => {
  const m = new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}`).exec(html);
  assert.ok(m, `function ${name} 없음`);
  return m[0];
};
const modal = block(html, /<div class="cgSetupOv" id="cgSetupOv"[^>]*>/, 'div');
const cssRule = (sel) => {
  const i = html.indexOf(sel + ' {');
  assert.notEqual(i, -1, `${sel} 규칙 없음`);
  return html.slice(i, html.indexOf('}', i) + 1);
};

test('CG 구성 창 — 상단 컬러 헤더 + 좌(CG 종류)·우(지도 종류) 두 판 + 선택 완료', () => {
  assert.match(modal, /role="dialog" aria-modal="true"/);
  assert.match(modal, /<div class="cgsTitle" id="cgsTitle">장면 설정<\/div>/);   // 화면 이름 = 장면 설정(옛 CG 구성)
  assert.match(modal, /<div class="cgsSub">CG 종류와 지도 종류를 고른 뒤 선택 완료를 누르세요<\/div>/);
  const res = block(modal, /<section class="cgsPane cgsPaneRes"/, 'section');
  const sty = block(modal, /<section class="cgsPane cgsPaneStyle"/, 'section');
  assert.ok(modal.indexOf('cgsPaneRes') < modal.indexOf('cgsPaneStyle'), 'CG 종류가 왼쪽(먼저)');
  assert.match(res, />CG 종류<\/div>/); assert.match(res, /id="resBtns"/);
  assert.match(sty, />지도 종류<\/div>/); assert.match(sty, /id="styleBtns"/);
  // 출력 화면 드롭다운에만 있던 개인 배치 저장·초기화도 CG 종류 판으로 옮겨 남는다
  for (const id of ['presetMoreToggle', 'presetMoreBody', 'savePreset', 'restoreDefaults']) assert.match(res, new RegExp(`id="${id}"`));
  assert.match(modal, /<button class="cgsDone" id="cgsDone" disabled>선택 완료<\/button>/);
  assert.match(modal, /id="cgsCancel">취소</);
  assert.match(modal, /id="cgsX" aria-label="닫기"/);
});

test('두 판은 바탕색이 다르고(밝은·어두운 둘 다), 왼쪽 색 줄 없이 은은하게', () => {
  const dark = /:root, :root\[data-theme="dark"\] \{\s*--cgs-res:[\s\S]*?\}/.exec(html)[0];
  const light = /:root\[data-theme="light"\] \{\s*--cgs-res:[\s\S]*?\}/.exec(html)[0];
  for (const t of [dark, light]) {
    const rb = /--cgs-res-bg: ([^;]+);/.exec(t)[1], mb = /--cgs-map-bg: ([^;]+);/.exec(t)[1];
    assert.notEqual(rb, mb);
  }
  assert.match(cssRule('.cgsPaneRes'), /background: var\(--cgs-res-bg\)/);
  assert.match(cssRule('.cgsPaneStyle'), /background: var\(--cgs-map-bg\)/);
  // 사용자 요청: 박스 왼쪽 색깔 선 금지 — CG 구성 창 규칙엔 border-left 가 없다
  const cgsCss = html.slice(html.indexOf('/* ===== CG 구성 모달'), html.indexOf('@media (max-width: 560px) {\n    .cgsChoices'));
  assert.doesNotMatch(cgsCss, /border-left/);
});

test('열고 닫기 = 블러 + 스케일, 좁은 창(900px 이하)은 위아래로 쌓기, body 잠금 없음', () => {
  const card = cssRule('.cgSetupCard');
  assert.match(card, /transform: scale\(\.95\); filter: blur\(8px\)/);
  assert.match(html, /\.cgSetupOv\.on \.cgSetupCard \{ opacity: 1; transform: none; filter: none; \}/);
  assert.match(html, /@media \(max-width: 900px\) \{\n\s*\.cgSetupOv \{[^}]*\}\n\s*\.cgsBody \{ grid-template-columns: minmax\(0, 1fr\);/);
  for (const f of ['openCgSetup', 'closeCgSetup']) assert.doesNotMatch(fn(f), /document\.body\.style|position:\s*fixed|\.remove\(\)|createElement/);
  // 데스크톱: 막이 뜨면 창 버튼 자리도 같이 어둡게
  // (막 색은 테마마다 다른 --pop-ov — CSS 배경과 창 버튼 어둡게 하기가 같은 변수를 짝으로 쓴다)
  assert.match(html, /\['#cgSetupOv\.on', 'var\(--pop-ov\)'\]/);
  assert.match(cssRule('.cgSetupOv'), /background: var\(--pop-ov\)/);
  assert.match(fn('titleBarDimLayers'), /getPropertyValue\(v\[1\]\)/, '캔버스 합성 전에 var() 를 실제 값으로 바꾼다');
});

test('고르기만 하고, 둘 다 골라 선택 완료를 눌러야 적용 — 닫기는 아무것도 안 바꾼다', () => {
  const sync = fn('syncCgSetup');
  assert.match(sync, /const ok = !!\(rl && sl\);/);
  assert.match(sync, /done\.disabled = !ok/);
  const open = fn('openCgSetup');
  assert.match(open, /const fresh = startScreenOn\(\);/);
  assert.match(open, /pendingRes = fresh \? null : S\.res;/, '작업 중이면 지금 CG 종류 미리 선택');
  assert.match(open, /pendingStyle = fresh \? null : S\.style;/, '작업 중이면 지금 지도 종류 미리 선택');
  const close = fn('closeCgSetup');
  assert.doesNotMatch(close, /applyPending|setStyle|_apply\(|S\.res\s*=|S\.style\s*=/);
  const apply = fn('applyCgSetup');
  assert.match(apply, /^function applyCgSetup\(\) \{\n\s*if \(!pendingRes \|\| !pendingStyle\) return;/);
  const setup = fn('setupCgSetup');
  assert.match(setup, /\$\('#cgsDone'\)\.onclick = applyCgSetup;/);
  assert.match(setup, /\$\('#cgsCancel'\)\.onclick = closeCgSetup;/);
  assert.match(setup, /\$\('#cgsX'\)\.onclick = closeCgSetup;/);
  // 바깥 클릭 = 취소 — 누른 곳·뗀 곳이 둘 다 막일 때만(카드를 누른 채 막으로 끌고 나가 떼도 안 닫힘)
  assert.match(setup, /ov\.addEventListener\('pointerdown', \(e\) => \{ downOnOv = e\.target === ov; \}\);/);
  assert.match(setup, /if \(e\.target === ov && downOnOv\) closeCgSetup\(\);/, '바깥 클릭 = 취소');
  assert.match(setup, /e\.key !== 'Escape'/);
  // 창이 떠 있는 동안 뒤의 지도 단축키는 막는다
  assert.match(html, /if \(cgSetupIsOpen\(\) \|\| exportIsOpen\(\)\) return;   \/\/ CG 구성 창·이미지로 추출 팝업이 떠 있는 동안엔/);
  // 서울 지도(목록엔 숨김)는 시도군 카드로 표시
  assert.match(fn('markStyleBtns'), /isSeoul\(pendingStyle\)\) \? 'sgg' : pendingStyle/);
});

test('시작 화면 — CG 종류와 지도 종류를 고르세요 + CG 구성 열기, 새로 시작하면 창이 바로 뜬다', () => {
  const ov = block(html, /<div class="startOverlay" id="startOverlay">/, 'div');
  assert.match(ov, /<div class="startTitle">CG 종류와 지도 종류를 고르세요<\/div>/);
  assert.match(ov, /<button id="startSetup" class="startSetupBtn">장면 설정 열기<\/button>/);
  assert.match(ov, /data-step="res"><span class="dot"><\/span>CG 종류 선택</);
  assert.match(ov, /data-step="style"><span class="dot"><\/span>지도 종류 선택</);
  assert.match(html, /startSetupBtn\.onclick = openCgSetup;/);
  assert.match(html, /showStartScreen\(\);\n\s*status\('새로 시작'\);\n\s*setTimeout\(\(\) => \{ if \(startScreenOn\(\)\) openCgSetup\(\); \}, 160\);/);
  // 완료하면 기존 단계 표시(res/style) → 시작 화면 닫힘·wcg_pending_start 해제 경로를 그대로 탄다
  assert.match(fn('applyPendingRes'), /markStartStep\('res'\)/);
  assert.match(fn('applyPendingStyle'), /markStartStep\('style'\)/);
  assert.match(fn('markStartStep'), /localStorage\.removeItem\('wcg_pending_start'\)/);
});

test('둘러보기 — 출력 화면·지도 종류 두 단계를 CG 구성 한 단계로', () => {
  const list = fn('tourStepList');
  assert.doesNotMatch(list, /tourMenu\('(out0|style)'\)/);
  assert.match(list, /\{ title: '장면 설정', body: [^\n]*\n\s*target: \(\) => document\.querySelector\('#cgSetupOv \.cgSetupCard'\), setup: \(\) => tourCgSetup\(\)/);
  assert.match(html, /function tourMenuClose\(\) \{ if \(_closeMenu\) _closeMenu\(\); closeCgSetup\(\); \}/);
});

test('시작 화면에선 시도군 구분 = 전국 지도(지난 작업의 서울을 물려받지 않음), 작업 중엔 서울 유지', () => {
  assert.match(fn('buildStyleBtns'), /if \(k === 'sgg' && isSeoul\(S\.style\) && !startScreenOn\(\)\) pendingStyle = S\.style;/);
  assert.match(fn('syncStyleUse'), /const seoulNow = k === 'sgg' && isSeoul\(S\.style\) && !startScreenOn\(\);/);
  // 카드 onclick 로직을 그대로 돌려 본다
  const body = /b\.onclick = \(\) => \{\n\s*pendingStyle = k;[\s\S]*?\n\s*\};/.exec(fn('buildStyleBtns'))[0];
  const click = (k, style, start) => new Function('k', 'S', 'isSeoul', 'startScreenOn', 'syncCgSetup', 'cgsShowOtherPane',
    `let pendingStyle = null; const b = {}; ${body}; b.onclick(); return pendingStyle;`)(k, { style }, (s) => s === 'seoul', () => start, () => {}, () => {});
  assert.equal(click('sgg', 'seoul', true), 'sgg', '시작 화면: 시도군 구분 → 전국');
  assert.equal(click('sgg', 'seoul', false), 'seoul', '작업 중: 서울 그대로');
  assert.equal(click('warn', 'seoul', true), 'warn');
});

test('좁은 창(위아래로 쌓임) — 안내 방향은 위·아래, 고르면 아직 안 고른 판으로 스크롤', () => {
  const summary = (stacked, res, style) => {
    const sum = { textContent: '' }, done = { disabled: false };
    const ctx = { $: (id) => (id === '#cgsSummary' ? sum : id === '#cgsDone' ? done : null), RES: { r: { label: '노말 CG' } }, MAP: { styles: { s: { label: '시도' } } },
      S: { res: 'r', style: 's' }, markResBtns() {}, markStyleBtns() {}, startScreenOn: () => false, cgsStacked: () => stacked, document: {} };
    new Function('ctx', `const { $, RES, MAP, S, markResBtns, markStyleBtns, startScreenOn, cgsStacked, document } = ctx; let pendingRes = ${JSON.stringify(res)}, pendingStyle = ${JSON.stringify(style)}; ${fn('syncCgSetup')}; syncCgSetup();`)(ctx);
    return sum.textContent;
  };
  assert.equal(summary(false, 'r', null), '오른쪽에서 지도 종류도 골라 주세요');
  assert.equal(summary(false, null, 's'), '왼쪽에서 CG 종류도 골라 주세요');
  assert.equal(summary(true, 'r', null), '아래에서 지도 종류도 골라 주세요');
  assert.equal(summary(true, null, 's'), '위에서 CG 종류도 골라 주세요');
  assert.match(fn('cgsStacked'), /matchMedia\('\(max-width: 900px\)'\)\.matches/);   // CSS @media 와 같은 기준
  const show = fn('cgsShowOtherPane');
  assert.match(show, /if \(!cgSetupIsOpen\(\) \|\| !cgsStacked\(\)\) return;/);
  assert.match(show, /body\.scrollBy\(\{ top: d, behavior: 'smooth' \}\)/);
  assert.match(html, /syncCgSetup\(\);   \/\/ 카드 표시[^\n]*\n\s*cgsShowOtherPane\('res'\);/);
  assert.match(fn('buildStyleBtns'), /syncCgSetup\(\);\n\s*cgsShowOtherPane\('style'\);/);
  assert.match(fn('setupCgSetup'), /matchMedia\('\(max-width: 900px\)'\)\.addEventListener\('change'/);   // 창 크기 넘나들면 문구도 다시
  // 본문 스크롤바 — 윈도 기본 대신 앱 스크롤바(두 테마 --scrollbar)
  assert.match(cssRule('.cgsBody::-webkit-scrollbar-thumb'), /background-color: var\(--scrollbar\)/);
  assert.match(cssRule('.cgsBody::-webkit-scrollbar-track'), /background: transparent/);
});

test('선택 완료 한 번 = 되돌리기 한 칸(중간 상태 새 CG 종류 + 옛 지도 종류는 버림)', () => {
  const run = (resChanges, styleChanges, start = []) => {
    const stack = start.slice();
    const ctx = { stack, closed: 0 };
    new Function('ctx', `const undoStack = ctx.stack; let pendingRes = 'r', pendingStyle = 's';
      const applyPendingRes = () => { if (${resChanges}) undoStack.push({ k: 'beforeRes' }); pendingRes = null; };
      const applyPendingStyle = () => { if (${styleChanges}) undoStack.push({ k: 'mid' }); pendingStyle = null; };
      const updateUndoBtns = () => {}, markResBtns = () => {}, markStyleBtns = () => {}, closeCgSetup = () => { ctx.closed++; }, openAutoSec = () => {};
      ${fn('applyCgSetup')}; applyCgSetup();`)(ctx);
    return [stack.map((x) => x.k), ctx.closed];
  };
  assert.deepEqual(run(true, true, [{ k: 'old' }]), [['old', 'beforeRes'], 1]);
  assert.deepEqual(run(false, true, [{ k: 'old' }]), [['old', 'mid'], 1]);   // CG 종류 그대로 → 지도 종류 한 칸
  assert.deepEqual(run(true, false), [['beforeRes'], 1]);
});

test('바깥 막·포커스·제목줄 — Tab 가두기, 데스크톱 제목줄 끌기 끔, 꺼진 선택 완료는 취소와 다른 모양', () => {
  const setup = fn('setupCgSetup');
  assert.match(setup, /if \(e\.key !== 'Tab' \|\| !cgSetupIsOpen\(\) \|\| aboveCgs\(\)\) return;/);
  // 가두기 본체는 팝업 공통 도우미(popTrapTab) — 토스 모달·확인창·배치 지정하기·이미지 안내도 같은 걸 쓴다
  assert.match(setup, /popTrapTab\(ov\.querySelector\('\.cgSetupCard'\), e\);/);
  assert.match(fn('popTrapTab'), /\(e\.shiftKey \? last : first\)\.focus\(\);/);
  // 닫히는 중(.popClosing)인 위 창은 '위에 떠 있음'으로 안 친다 — 그 .34초 동안 Esc·Tab 이 사라지지 않게
  assert.match(setup, /const aboveCgs = \(\) => [^\n]*#tossOv:not\(\.popClosing\)[^\n]*#confirmOverlay\.on:not\(\.popClosing\)[^\n]*#slotOverlay\.on:not\(\.popClosing\)/);
  assert.match(fn('openCgSetup'), /document\.documentElement\.classList\.add\('cgsOpen'\);/);
  assert.match(fn('closeCgSetup'), /document\.documentElement\.classList\.remove\('cgsOpen'\);/);
  assert.match(html, /html\.isDesktop\.cgsOpen \.titlebar \{ -webkit-app-region: no-drag; \}/);
  // 접힌 개인 배치 묶음의 버튼엔 Tab 이 안 들어가게
  assert.match(cssRule('.presetMoreBody'), /visibility: hidden/);
  // 꺼진 '선택 완료' = 옅은 파랑(두 테마) — '취소'(--surface-hi 회색)와 다르게
  const off = html.slice(html.indexOf('.cgsDone:disabled, .cgsDone:disabled:hover {'), html.indexOf('}', html.indexOf('.cgsDone:disabled, .cgsDone:disabled:hover {')));
  assert.match(off, /background: var\(--cgs-done-off-bg\)/);
  assert.doesNotMatch(off, /surface-hi/);
  assert.match(cssRule('.cgsCancel'), /background: var\(--surface-hi\)/);
  assert.equal((html.match(/--cgs-done-off-bg: /g) || []).length, 2, '밝은·어두운 테마 둘 다');
});

test('개인 배치 저장·초기화 결과는 창이 떠 있으면 창 안 토스트로(막 뒤 #status 에 가리지 않게)', () => {
  assert.match(modal, /<div class="cgsToast" id="cgsToast" role="status" aria-live="polite"><\/div>/);
  const cs = fn('cgsStatus');
  assert.match(cs, /if \(!t \|\| !cgSetupIsOpen\(\)\) \{ status\(m\); return; \}/);
  assert.match(fn('savePreset'), /cgsStatus\(`\$\{presetLabel\(key\)\} 배치로 저장됨/);
  assert.match(html, /if \(!mine\) \{ if \(cgSetupIsOpen\(\)\) cgsStatus\('이 브라우저엔 따로 저장한 배치가 없습니다/);
  assert.match(html, /cgsStatus\('모두의 기본 배치로 되돌렸습니다'\);/);
});

test('시작 화면 부제 줄바꿈·단계 알약(고르는 대로 체크, 누르면 창 열림), 둘러보기 스포트라이트는 열리는 중 변형과 무관', () => {
  assert.match(cssRule('.startSub'), /word-break: keep-all/);
  assert.match(fn('syncCgSetup'), /classList\.toggle\('picked', s\.dataset\.step === 'res' \? !!rl : !!sl\)/);
  assert.match(fn('showStartScreen'), /classList\.remove\('done', 'picked'\)/);
  assert.match(fn('setupCgSetup'), /#startOverlay \.startStep'\)\.forEach\(\(s\) => \{ s\.title = '장면 설정 열기'; s\.onclick = openCgSetup; \}\)/);
  assert.match(fn('tourStepList'), /setup: \(\) => tourCgSetup\(\), delay: 380, rect: cgsCardRect \}/);
  assert.match(fn('tourPlace'), /const r = step\.rect \? step\.rect\(el\) : el\.getBoundingClientRect\(\);/);
  // 변형(scale .95)을 빼고 잰다 — 가짜 카드로 확인
  const rect = new Function(`${fn('cgsCardRect')}; return cgsCardRect;`)()({ offsetParent: { getBoundingClientRect: () => ({ left: 0, top: 0 }) }, offsetLeft: 421, offsetTop: 269, offsetWidth: 1080, offsetHeight: 575 });
  assert.deepEqual(rect, { left: 421, top: 269, width: 1080, height: 575, right: 1501, bottom: 844 });
});

test('새 함수는 한 번씩만 정의된다', () => {
  for (const name of ['openCgSetup', 'closeCgSetup', 'applyCgSetup', 'syncCgSetup', 'setupCgSetup', 'cgSetupIsOpen', 'startScreenOn', 'cgsIconSvg', 'cgsCardBtn', 'tourCgSetup', 'cgsStacked', 'cgsShowOtherPane', 'cgsStatus', 'cgsCardRect']) {
    assert.equal(html.split(`function ${name}(`).length - 1, 1, name);
  }
});

// ── 실제 앱(부팅 점검기) — WCG_BOOT_CHECK=1 일 때만 ──
test('부팅 점검: CG 구성 고르기·완료·취소, 프로젝트 아이콘, 추출 버튼', { skip: process.env.WCG_BOOT_CHECK !== '1' && 'WCG_BOOT_CHECK=1 일 때만(일렉트론 필요)' }, () => {
  const raw = execFileSync(process.execPath, [path.join(root, 'desktop', 'test', 'boot-check.cjs'), root, '--wait=8000', '--size=1600x900', '--eval=' + path.join(__dirname, 'cg-setup.boot-eval.js')], { encoding: 'utf8', timeout: 300000 });
  const out = JSON.parse(raw.slice(raw.indexOf('{')));
  assert.equal(out.ok, true, JSON.stringify(out.errors));
  const R = out.evalResult;
  assert.equal(R.boot.start, true);
  assert.deepEqual([R.openStart.res, R.openStart.style, R.openStart.doneDisabled], [[], [], true]);
  assert.equal(R.oneRes.doneDisabled, true, '하나만 고르면 선택 완료 꺼짐');
  assert.equal(R.both.doneDisabled, false);
  assert.deepEqual([R.afterDone.ov, R.afterDone.start, R.afterDone.work], [false, false, { res: '1920x1080', style: 'sido' }]);
  assert.deepEqual([R.reopen.res, R.reopen.style], [['1920x1080'], ['sido']], '다시 열면 지금 구성이 골라져 있다');
  assert.deepEqual(R.afterCancel.work, { res: '1920x1080', style: 'sido' }, '취소하면 그대로');
  assert.deepEqual(R.afterEscOutside.work, { res: '1920x1080', style: 'sido' }, 'Esc·바깥 클릭도 그대로');
  assert.deepEqual(R.afterChange.work, { res: '1920x1080-vf', style: 'warn' });
  assert.deepEqual(R.afterUndo, { res: '1920x1080', style: 'sido' }, '선택 완료 한 번 = 되돌리기 한 번이면 원래대로');
  assert.deepEqual([R.dragOut.ov, R.dragOut.res], [true, ['2158x1214']], '카드에서 누르고 막에서 떼면 안 닫힘');
  assert.equal(R.dragOut.realOutside, false, '막에서 누르고 떼면 닫힘');
  assert.deepEqual(R.trap, { fromLast: 'cgsX', fromFirstBack: 'cgsDone', fromOutside: 'cgsX' }, 'Tab 은 창 안에서만 돈다');
  assert.equal(R.cgsOpenClass.open, true); assert.equal(R.cgsOpenClass.closed, false);
  assert.equal(R.toast.on, true); assert.match(R.toast.text, /따로 저장한 배치가 없습니다/);
  assert.deepEqual([R.proj.drop, R.proj.shown, R.proj.hasSave], [true, ['proj'], true]);
  assert.equal(R.projClosed, true);
  assert.deepEqual(R.outPop, { open: true, drop: false, btnOn: true, cards: 14, exOpen: true, closed: true }, '이미지로 추출 팝업 열기·Esc 닫기');
  assert.deepEqual([R.tlOn.timeline, R.tlOn.pri, R.tlOff.timeline, R.tlOff.pri], [true, true, false, false]);
  assert.equal(R.ae.shown, true);
  assert.ok(R.titlebar.scroll <= R.titlebar.client && R.titlebar.navRight < R.titlebar.rightLeft, JSON.stringify(R.titlebar));
  // 사용자 요청(10-09): 플로피는 AE로 보내기 바로 오른쪽, 장면 설정은 색 있는 버튼(투명 배경 아님)
  assert.ok(R.layout.projRightOfAe && R.layout.gap >= 0 && R.layout.gap <= 10, JSON.stringify(R.layout));
  assert.ok(R.layout.projDropInView, '플로피 드롭다운이 화면 안');

});
