// 설정(렌치) 메뉴 — 제목줄 오른쪽 끝 렌치(#helperBtn)가 '설정' 드롭다운(data-sec="cfg")을 연다.
// 배치 지정하기(사이드바 맨 아래에 있던 것)·기본값 굽기·설정 옮기기(프로젝트 메뉴에 있던 것)를 '옮겨' 담고(복제 금지),
// 렌치는 더 이상 긴 기능 확장팩 안내를 바로 열지 않는다(메뉴 맨 아래 상태 한 줄에서만).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

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
const fn = (name) => {
  const m = new RegExp(`\\n(?:async )?function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}`).exec(html);
  assert.ok(m, `function ${name} 없음`);
  return m[0];
};
const cfg = block(html, /<div class="sec pinned" data-sec="cfg">/, 'div');
const proj = block(html, /<div class="sec pinned" data-sec="proj">/, 'div');

test('렌치 버튼 = 설정 메뉴 버튼(data-menu="cfg"), 오른쪽 묶음에 하나만', () => {
  const b = /<button id="helperBtn"[^>]*>/.exec(html)[0];
  assert.match(b, /class="menuBtn[^"]*"/);
  assert.match(b, /data-menu="cfg"/);
  assert.match(b, /title="설정 — 배치·설정 옮기기"/);
  assert.match(b, /aria-label="설정 — 배치·설정 옮기기"/);
  assert.equal((html.match(/<button[^>]*data-menu="cfg"/g) || []).length, 1);
  // 렌치를 눌렀을 때 긴 헬퍼 안내를 바로 여는 연결은 없어야 한다
  assert.doesNotMatch(html, /\$\('#helperBtn'\)\.onclick/);
});

test('설정 드롭다운에 배치 지정하기·굽기·설정 옮기기·확장팩 상태 줄이 순서대로', () => {
  const ids = ['cfgPresetGroup', 'slotBtn', 'bakeDefaults', 'cfgMoveGroup', 'exportSettings', 'importSettings', 'helperRow'];
  let last = -1;
  for (const id of ids) {
    const i = cfg.indexOf(`id="${id}"`);
    assert.ok(i > last, `${id} 가 설정 메뉴에 없거나 순서가 다름`);
    last = i;
    assert.equal(html.split(`id="${id}"`).length - 1, 1, `id="${id}" 는 하나만(복제 금지)`);
  }
  assert.match(cfg, /배포용: 저장해 둔 화면별 배치들을 모두의 기본값 파일로 만듭니다/);
  assert.match(cfg, /웹판과 데스크톱 앱은 저장 공간이 따로입니다/);
});

test('프로젝트 메뉴는 저장·불러오기 중심 — 옮긴 항목이 남지 않는다', () => {
  for (const id of ['save', 'load', 'recentBtn', 'newWork']) assert.match(proj, new RegExp(`id="${id}"`));
  for (const id of ['bakeDefaults', 'exportSettings', 'importSettings', 'slotBtn']) assert.doesNotMatch(proj, new RegExp(`id="${id}"`));
});

test('setupMenus — cfg 섹션을 드롭다운으로, 배치 지정하기는 footer에서 빠지고 같은 동작(openPresetSlots)', () => {
  const s = fn('setupMenus');
  assert.match(s, /\['out', 'proj', 'cfg'\]/);   // CG 종류·지도 종류는 CG 구성 창으로 빠짐
  assert.match(s, /\$\('#slotBtn'\)[\s\S]*?openPresetSlots\(\)/);
  assert.doesNotMatch(s, /slotBtn\.id = 'slotBtn'|createElement\('button'\); slotBtn/);
  // 오른쪽 끝(렌치)은 버튼 오른쪽에 맞춰 연다 + 열 때 확장팩 상태 줄 갱신
  assert.match(s, /closest\('\.tbRight'\)/);
  assert.match(s, /r\.right - dw/);
  assert.match(s, /sec === 'cfg'\) refreshHelperRow\(\)/);
  assert.match(html, /const ALWAYS_OPEN = new Set\(\[[^\]]*'cfg'/);
});

test('확장팩 상태 — 데스크톱은 빨간 점 없음, 웹판 꺼짐·구버전은 기존 안내(showHelperStatus)로', () => {
  const a = fn('applyHelperState');
  assert.match(a, /const dot = !WNS_DESKTOP && st\.up && st\.old;/);
  assert.match(a, /classList\.toggle\('hasNew', dot\)/);
  // 빨간 점의 뜻 — 점이 뜨면 렌치 툴팁이 이유를 말하고, 없어지면 원래 문구로
  assert.match(a, /dot \? '설정 — 기능 확장팩 구버전: 메뉴 맨 아래에서 다시 실행' : HELPER_BTN_TIP/);
  assert.match(html, /const HELPER_BTN_TIP = '설정 — 배치·설정 옮기기';/);
  // 메뉴 안 '구버전' 점은 렌치 빨간 점과 같은 색
  assert.match(html, /\.helperRow\[data-st="old"\] \.hrDot \{ background: #E5484D;/);
  // 밝은 테마에선 상태 줄 글자를 진하게(--on-surface-var 는 바탕과 대비 약 2.35:1)
  assert.match(html, /html\[data-theme="light"\] \.helperRow,\s*html\[data-theme="light"\] \.helperRow\.static:hover \{ color: color-mix\(in srgb, var\(--on-surface\) 75%, var\(--surface-hi\)\); \}/);
  assert.match(a, /앱에 내장됨/);
  assert.match(a, /act = showHelperStatus/);
  assert.match(fn('checkHelperFreshOnBoot'), /applyHelperState\(st\)/);
  // 다른 곳(렌더·불러오기 실패)에서 여는 기존 안내 경로는 그대로
  assert.match(html, /if \(!up\) \{ wnsHelperOffNotice\(\); return; \}/);
});

test('둘러보기 — 렌치는 설정으로 설명하고, 배치 지정하기·설정 옮기기는 설정 메뉴를 열어 비춘다', () => {
  const t = fn('tourStepList');
  assert.match(t, /title: '둘러보기 · 공지 · 설정'/);
  assert.doesNotMatch(t, /기능 확장팩을 켜는 방법/);
  assert.match(t, /title: '배치 지정하기'[\s\S]*?target: \(\) => \$\('#cfgPresetGroup'\), setup: \(\) => tourMenu\('cfg'\)/);
  assert.match(t, /title: '설정 옮기기'[\s\S]*?target: \(\) => \$\('#cfgMoveGroup'\), setup: \(\) => tourMenu\('cfg'\)/);
  assert.equal(t.split("title: '배치 지정하기'").length - 1, 1);
  // 닫기 바가 오른쪽 위 메뉴를 가리면 비킨다 — 비추는 곳뿐 아니라 열린 드롭다운 전체도 피한다
  assert.match(fn('tourPlace'), /tourBarSide\(\{ x, y, w, h \}\)/);
  assert.match(fn('tourBarSide'), /\$\('#menuDrop'\)[\s\S]*?classList\.contains\('on'\)[\s\S]*?Math\.min\(a\.x, r\.left\)/);
  // 묶음 사이 구분선은 묶음 상자 바깥(::before, 위 여백)에 — 스포트라이트 안에 선이 같이 잡히지 않게
  assert.doesNotMatch(html, /\.cfgGroup \+ \.cfgGroup \{[^}]*border-top/);
  assert.match(html, /\.cfgGroup \+ \.cfgGroup::before \{[^}]*top: -14px/);
});
