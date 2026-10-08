// 타임라인 도구 줄 오른쪽 — 영상 렌더 묶음(MP4·PNG 시퀀스·MXF·알파 MOV 한 세그먼트)·저장 폴더·초기화·닫기 모양과
// 화면에 보이는 '추출' → '렌더' 문구를 소스로 확인한다(실제 화면 점검은 desktop/test/boot-check.cjs --shot).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const appSource = require('../tools/app-source.cjs');   // js/·css/로 나뉜 앱을 '한 파일' 텍스트로 합쳐 읽는다(MODULES.md)

const root = path.join(__dirname, '..');
const html = appSource(path.join(root, 'index.html')).replace(/\r\n/g, '\n');
const fnSrc = (name) => {
  const m = new RegExp(`\\n(?:async )?function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}`).exec(html);
  assert.ok(m, `function ${name} 없음`);
  return m[0];
};
function block(src, openRe, tag) {
  const m = openRe.exec(src);
  assert.ok(m, `${openRe} 를 찾지 못함`);
  const re = new RegExp(`<${tag}\\b|</${tag}>`, 'g');
  re.lastIndex = m.index + 1;
  let depth = 1, r;
  while ((r = re.exec(src))) { depth += r[0].startsWith('</') ? -1 : 1; if (depth === 0) return src.slice(m.index, r.index + r[0].length); }
  throw new Error(`${tag} 닫는 태그 없음`);
}
const noComments = (s) => s.replace(/<!--[\s\S]*?-->/g, '');
const tl = block(html, /<div id="timeline"[^>]*>/, 'div');
const group = block(tl, /<div class="tlRender" id="tlRender"[^>]*>/, 'div');

test('영상 렌더 버튼 넷(MP4·PNG 시퀀스·MXF·알파 MOV)은 한 묶음(#tlRender) — 아이콘 + 글자 span, 저장 폴더는 묶음 앞에 따로', () => {
  const btns = [...group.matchAll(/<button id="(\w+)"[^>]*>([\s\S]*?)<\/button>/g)];
  assert.deepEqual(btns.map((m) => m[1]), ['tlBake', 'tlExportPng', 'wnsMxf', 'wnsMov']);
  const labels = btns.map((m) => (m[2].match(/<span class="tlRndLbl">([^<]*)<\/span>$/) || [])[1]);
  assert.deepEqual(labels, ['MP4로 렌더', 'PNG 시퀀스로 렌더', 'MXF로 렌더', '알파MOV로 렌더']);
  for (const m of btns) {
    assert.equal((m[2].match(/<svg /g) || []).length, 1, `${m[1]}: 아이콘 하나`);
    assert.match(m[2], /^<svg viewBox="0 0 24 24" aria-hidden="true">[\s\S]*fill="currentColor"/, `${m[1]}: 채운 아이콘(currentColor)`);
  }
  assert.match(group, /<button id="wnsMxf" style="display:none"/, 'MXF·MOV는 처음엔 숨김(updateWnsButtons가 해상도 따라)');
  assert.match(group, /<button id="wnsMov" style="display:none"/);
  assert.doesNotMatch(group, /border-radius/, '버튼마다 모서리를 고치지 않는다(묶음이 양끝만 둥글게)');
  assert.ok(tl.indexOf('id="exSetDir"') < tl.indexOf('id="tlRender"'), '저장 폴더는 묶음 앞');
  assert.ok(!group.includes('exSetDir'), '저장 폴더는 묶음 밖');
  // 옛 따로 떨어진 묶음·클래스는 없다
  for (const s of ['id="wnsGroup"', 'class="exportGroup"', '.exportGroup {', '.exportGroup .tintBtn']) assert.ok(!html.includes(s), s);
});

test('MXF·MOV 보이기는 버튼만 — 묶음은 숨기지 않고, MP4 글자는 span만 바꾼다(아이콘 유지)', () => {
  const u = fnSrc('updateWnsButtons');
  assert.doesNotMatch(u, /wnsGroup|tlRender/);
  assert.match(u, /\$\('#wnsMxf'\)\.style\.display = showMxf \? '' : 'none';/);
  assert.match(u, /\$\('#wnsMov'\)\.style\.display = showMov \? '' : 'none';/);
  const n = fnSrc('tlNote');
  assert.match(n, /\(bake\.querySelector\('\.tlRndLbl'\) \|\| bake\)\.textContent = 'MP4로 렌더';/);
  assert.doesNotMatch(n, /bake\.textContent =|borderRadius/);
  // 렌더 함수 연결은 그대로
  assert.match(html, /\$\('#tlBake'\)\.onclick = bakeMp4;/);
  assert.match(html, /\$\('#tlExportPng'\)\.onclick = exportPngSeq;/);
  assert.match(html, /if \(\$\('#wnsMxf'\)\) \$\('#wnsMxf'\)\.onclick = \(\) => wnsRender\('mxf'\);/);
  assert.match(html, /if \(\$\('#wnsMov'\)\) \$\('#wnsMov'\)\.onclick = \(\) => wnsRender\('mov'\);/);
  assert.match(html, /\$\('#tlClose'\)\.onclick = \(\) => tlShow\(false\);/);
});

test('모양 — 묶음은 gap 1px 세그먼트(높이 28·반경 9), 초기화는 .tlBtn 모양의 빨간 글자(꽉 찬 빨강 없음), 닫기는 공통 유리 원', () => {
  assert.match(html, /\.tlRender \{[^}]*gap: 1px;[^}]*height: 28px;[^}]*border-radius: 9px;[^}]*overflow: hidden;/);
  assert.match(html, /\.tlBtn \{ height: 28px;[^}]*border-radius: 9px;/);
  for (const v of ['--tl-rnd-bg:', '--tl-rnd-hover:', '--tl-rnd-line:']) assert.equal(html.split(v).length - 1, 2, `${v} 는 두 테마에`);
  // 초기화
  assert.match(tl, /<button id="tlReset" class="tlBtn tlResetBtn"[^>]*>초기화<\/button>/);
  const reset = (html.match(/\.tlResetBtn[^{]*\{[^}]*\}/g) || []).join('\n');
  assert.match(reset, /color: var\(--danger\)/);
  assert.doesNotMatch(reset, /#E5301F|#cf2a1a|color: #fff/i, '꽉 찬 빨강·흰 글자 안 씀');
  // 닫기 — 팝업 닫기(.cgsX·.tossX)와 같은 규칙 + 같은 얇은 X(POP_X_SVG와 같은 경로)
  assert.match(html, /\.cgsX, \.tossX, \.tossHeadIcon, \.slotHead \.x, \.imgPopHead button, \.apiHead button, \.tlClose \{[^}]*border-radius: 50%;[^}]*background: var\(--pop-x-bg\); border: 1px solid var\(--pop-x-line\);/);
  assert.match(tl, /<button class="tlClose" id="tlClose" title="닫기" aria-label="닫기"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6\.5 6\.5l11 11M17\.5 6\.5l-11 11" fill="none" stroke="currentColor" stroke-width="2\.2" stroke-linecap="round"\/><\/svg><\/button>/);
  assert.match(html, /const POP_X_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6\.5 6\.5l11 11M17\.5 6\.5l-11 11" fill="none" stroke="currentColor" stroke-width="2\.2" stroke-linecap="round"\/><\/svg>';/);
});

test("화면에 보이는 '추출'은 '렌더'로 — 제목줄·이미지 팝업 제목·타임라인 줄·안내·둘러보기·알림", () => {
  const titlebar = block(html, /<header class="titlebar" id="titlebar">/, 'header');
  assert.doesNotMatch(noComments(titlebar), /추출/);
  assert.match(titlebar, /<span class="tbLbl">이미지로 렌더<\/span>/);
  assert.match(titlebar, /<span class="tbLbl">영상으로 렌더<\/span>/);
  assert.match(titlebar, /title="영상으로 렌더 — 타임라인 열기\/닫기"/);
  assert.match(html, /<div class="cgsTitle" id="exTitle">이미지로 렌더<\/div>/);
  assert.doesNotMatch(noComments(tl), /추출/);
  assert.match(html, /<p class="hint">가이드는 화면에만 보여요\(렌더에는 안 나와요\)\.<\/p>/);
  // JS 문구(주석 뺀 코드)
  const code = (s) => s.replace(/\/\/[^\n]*/g, '');
  for (const f of ['tlNote', 'renderExport', 'bakeMp4', 'wnsRender', 'tourStepList', 'tlUpdateFootWarn']) assert.doesNotMatch(code(fnSrc(f)), /추출/, f);
});

test('타임라인 초기화는 확인창(경고색)으로 먼저 묻고, 취소하면 아무것도 안 지운다', () => {
  const i = html.indexOf("$('#tlReset').onclick = async () => {");
  assert.ok(i >= 0, '초기화 핸들러가 async 여야 한다');
  const h = html.slice(i, html.indexOf("$('#tlBake').onclick", i));
  assert.match(h, /await tossConfirm\(\{[\s\S]*?title: '타임라인 초기화'[\s\S]*?danger: true/);
  assert.match(h, /if \(!ok\) return;\s*\n\s*pushUndo\(\);/);   // 확인 뒤에야 되돌리기 기록·지우기
});
