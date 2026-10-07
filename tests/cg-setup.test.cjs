// CG 구성 창 — '출력 화면'(→ CG 종류)과 '지도 종류'를 한 창에서 고르고, 둘 다 골라 '선택 완료'를 눌러야 적용된다.
// 소스 검사 + (WCG_BOOT_CHECK=1 일 때) 실제 앱을 띄워 고르기·완료·취소·프로젝트 아이콘·추출 버튼을 눌러 본다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/\r\n/g, '\n');

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
  assert.match(modal, /<div class="cgsTitle" id="cgsTitle">CG 구성<\/div>/);
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
  assert.match(html, /\['#cgSetupOv\.on', 'rgba\(6, 10, 20, \.62\)'\]/);
  assert.match(cssRule('.cgSetupOv'), /background: rgba\(6, 10, 20, \.62\)/);
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
  assert.match(setup, /if \(e\.target === ov\) closeCgSetup\(\);/, '바깥 클릭 = 취소');
  assert.match(setup, /e\.key !== 'Escape'/);
  // 창이 떠 있는 동안 뒤의 지도 단축키는 막는다
  assert.match(html, /if \(cgSetupIsOpen\(\)\) return;   \/\/ CG 구성 창이 떠 있는 동안엔/);
  // 서울 지도(목록엔 숨김)는 시도군 카드로 표시
  assert.match(fn('markStyleBtns'), /isSeoul\(pendingStyle\)\) \? 'sgg' : pendingStyle/);
});

test('시작 화면 — CG 종류와 지도 종류를 고르세요 + CG 구성 열기, 새로 시작하면 창이 바로 뜬다', () => {
  const ov = block(html, /<div class="startOverlay" id="startOverlay">/, 'div');
  assert.match(ov, /<div class="startTitle">CG 종류와 지도 종류를 고르세요<\/div>/);
  assert.match(ov, /<button id="startSetup" class="startSetupBtn">CG 구성 열기<\/button>/);
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
  assert.match(list, /\{ title: 'CG 구성', body: [^\n]*\n\s*target: \(\) => document\.querySelector\('#cgSetupOv \.cgSetupCard'\), setup: \(\) => tourCgSetup\(\)/);
  assert.match(html, /function tourMenuClose\(\) \{ if \(_closeMenu\) _closeMenu\(\); closeCgSetup\(\); \}/);
});

test('새 함수는 한 번씩만 정의된다', () => {
  for (const name of ['openCgSetup', 'closeCgSetup', 'applyCgSetup', 'syncCgSetup', 'setupCgSetup', 'cgSetupIsOpen', 'startScreenOn', 'cgsIconSvg', 'cgsCardBtn', 'tourCgSetup']) {
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
  assert.deepEqual(R.afterUndo, { res: '1920x1080', style: 'sido' }, '되돌리기 두 번이면 원래대로');
  assert.deepEqual([R.proj.drop, R.proj.shown, R.proj.hasSave], [true, ['proj'], true]);
  assert.equal(R.projClosed, true);
  assert.deepEqual([R.outMenu.drop, R.outMenu.shown], [true, ['out']]);
  assert.deepEqual([R.tlOn.timeline, R.tlOn.pri, R.tlOff.timeline, R.tlOff.pri], [true, true, false, false]);
  assert.equal(R.ae.shown, true);
  assert.ok(R.titlebar.scroll <= R.titlebar.client && R.titlebar.navRight < R.titlebar.rightLeft, JSON.stringify(R.titlebar));
});
