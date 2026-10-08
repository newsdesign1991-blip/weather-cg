// '이미지로 추출' 팝업·항목·저장 이름 — 소스 검사 + 함수를 vm에서 직접 돌려 본다(Electron 없이).
// 실제 화면 픽셀(항목마다 '딱 그것만'·다시 쌓기·미리보기 상태·기울기·저장 흐름)은 tests/export-render.test.cjs(WCG_BOOT_CHECK=1).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const appSource = require('../tools/app-source.cjs');   // js/·css/로 나뉜 앱을 '한 파일' 텍스트로 합쳐 읽는다(MODULES.md)

const root = path.join(__dirname, '..');
const html = appSource(path.join(root, 'index.html')).replace(/\r\n/g, '\n');
const mainJs = fs.readFileSync(path.join(root, 'desktop', 'main.js'), 'utf8').replace(/\r\n/g, '\n');
const fnSrc = (name, src = html) => {
  const m = new RegExp(`\\n(?:async )?function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}`).exec(src);
  assert.ok(m, `function ${name} 없음`);
  return m[0];
};
const constSrc = (name) => { const m = new RegExp(`\\nconst ${name} = [\\s\\S]*?;\\n`).exec(html); assert.ok(m, `const ${name} 없음`); return m[0].replace('const ', 'var '); };
function block(src, openRe, tag) {
  const m = openRe.exec(src);
  assert.ok(m, `${openRe} 를 찾지 못함`);
  const re = new RegExp(`<${tag}\\b|</${tag}>`, 'g');
  re.lastIndex = m.index + 1;
  let depth = 1, r;
  while ((r = re.exec(src))) { depth += r[0].startsWith('</') ? -1 : 1; if (depth === 0) return src.slice(m.index, r.index + r[0].length); }
  throw new Error(`${tag} 닫는 태그 없음`);
}
const pop = block(html, /<div class="cgSetupOv exOv" id="exportOv"[^>]*>/, 'div');

// 항목 정의·장 목록 함수를 가짜 상태로 돌리는 vm
function planCtx(st) {
  const ctx = Object.assign({ typ: false, labels: [], mtns: [], sea: false, fillsObj: { a: '#FF0000' }, ink: { L_legend: 1, L_title: 1, L_vfBar: 1 } }, st || {});
  ctx.S = { labels: ctx.labels, mtns: ctx.mtns, showBg: 1, sggOn: 1, realOn: 1, sidoOn: 1, res: ctx.res || '1920x1080', seaFills: {} };
  ctx.isTyphoon = () => ctx.typ;
  ctx.fills = () => ctx.fillsObj; ctx.curStyle = () => ({ sea: ctx.sea });
  ctx.$ = (s) => { const id = s.slice(1); return { style: {}, childElementCount: ctx.ink[id] ? 1 : 0, querySelectorAll: () => (ctx.ink[id] ? [{ textContent: '제목' }] : []) }; };
  ctx.document = { querySelector: () => null };
  vm.createContext(ctx);
  vm.runInContext([constSrc('EXPORT_TARGETS'), constSrc('EXPORT_STACK'), constSrc('WIN_RESERVED_NAME'), ...['safeFileName', 'exportLayerInk', 'exportHasFill', 'exportWhyNot', 'exportPlan', 'exportCount'].map((n) => fnSrc(n))].join('\n'), ctx);
  return ctx;
}

test('제목줄 이미지로 추출 = 팝업(드롭다운 아님) — CG 구성 모양, 세 판·빠른 선택·바닥 요약·렌더', () => {
  assert.equal(html.split('id="exportOv"').length - 1, 1, '팝업은 한 번만 만들어 둔다');
  assert.match(html, /<button class="tbMenu tbAction" id="exportBtn" aria-haspopup="dialog"[^>]*><svg[^>]*>[\s\S]*?<\/svg><span class="tbLbl">이미지로 추출<\/span><\/button>/);
  assert.match(pop, /<div class="cgSetupCard exCard" role="dialog" aria-modal="true" aria-labelledby="exTitle" tabindex="-1">/);
  assert.match(pop, /<button class="cgsX" id="exX" aria-label="닫기"[^>]*><svg/);
  // 세 판 — 성격이 같은 것끼리(① 한 장으로 · ② 바탕·지도 레이어 · ③ 글자·표시 레이어)
  const panes = [...pop.matchAll(/<section class="cgsPane (exPane\w+)" data-group="(\w+)"/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(panes, [['exPaneOne', 'one'], ['exPaneBase', 'base'], ['exPaneMark', 'mark']]);
  for (const [t] of [['>한 장으로<'], ['>바탕·지도 레이어<'], ['>글자·표시 레이어<']]) assert.ok(pop.includes(t), t);
  for (const id of ['exChoicesOne', 'exChoicesBase', 'exChoicesMark', 'exToast', 'exSummary', 'exCancel', 'exRender']) assert.match(pop, new RegExp(`id="${id}"`));
  assert.deepEqual([...pop.matchAll(/data-quick="(\w+)"/g)].map((m) => m[1]), ['final', 'layers', 'none']);
  assert.match(pop, /<button class="cgsDone" id="exRender" disabled[^>]*><svg class="exGo"[\s\S]*?<svg class="exRing"[\s\S]*?<span class="exRenderLbl">렌더<\/span><\/button>/);
  assert.equal((pop.match(/class="cgsPick exPanePick"/g) || []).length, 3, '판 머리마다 묶음 고르기 알약');
  // 이모지 금지(아이콘은 SVG)
  assert.doesNotMatch(pop, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  assert.doesNotMatch(fnSrc('exCardBtn'), /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  // 옛 사이드바·드롭다운 추출 섹션은 없다
  for (const s of ['data-sec="out"', 'id="doExport"', 'id="exPick"', 'id="exAll"', 'id="exInfo"', 'data-menu="out"']) assert.ok(!html.includes(s), s);
  assert.doesNotMatch(html, /class="exPick|class="exItem"|\.exItem \{|\.exPick \{|function buildExportPick|async function doExport/);
});

test('항목 14개 — 묶음·아이콘·이름 = 파일 이름(안전·겹침 없음·꾸밈말 없음), 쌓는 순서', () => {
  const c = planCtx();
  const T = c.EXPORT_TARGETS;
  assert.equal(T.length, 14);
  assert.equal(new Set(T.map((t) => t.key)).size, 14);
  assert.deepEqual(JSON.parse(JSON.stringify(T.map((t) => t.key))), ['full', 'bgtext', 'map', 'bg', 'base', 'fills', 'lines', 'sidoline', 'labels', 'mtn', 'legend', 'title', 'vfbar', 'typhoon']);
  for (const t of T) {
    assert.ok(['one', 'base', 'mark'].includes(t.group), t.key);
    assert.equal(c.safeFileName(t.name), t.name, `이름이 파일 이름으로 안전해야 한다: ${t.name}`);
    assert.doesNotMatch(t.name, /투명|\(|\)/, `카드 이름에 꾸밈말 금지: ${t.name}`);
    assert.ok(t.sub && t.sub.length < 30, t.key);
  }
  assert.equal(new Set(T.map((t) => t.name)).size, 14, '이름 겹침');
  assert.deepEqual(JSON.parse(JSON.stringify(T.filter((t) => t.def).map((t) => t.key))), ['full']);
  // 아이콘 — 모든 항목에 SVG 경로(이모지 아님)
  const icon = html.match(/const EXPORT_ICON = \{[\s\S]*?\n\};/)[0];
  for (const t of T) assert.match(icon, new RegExp(`\\n  ${t.key}: '<`), `아이콘 없음: ${t.key}`);
  assert.doesNotMatch(icon, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  // 편집용 레이어 쌓는 순서 = SVG 레이어 순서, 시·도 선만은 경계선만에 들어 있어 뺀다
  assert.deepEqual(JSON.parse(JSON.stringify(c.EXPORT_STACK)),['bg', 'base', 'fills', 'lines', 'mtn', 'typhoon', 'vfbar', 'labels', 'title', 'legend']);
  assert.ok(c.EXPORT_STACK.every((k) => T.some((t) => t.key === k && t.group !== 'one')));
});

test('폴더 이름 = 연월일 8자리_날씨CG메이커(로컬 날짜)', () => {
  const ctx = {}; vm.createContext(ctx); vm.runInContext(fnSrc('exportFolderName'), ctx);
  assert.equal(ctx.exportFolderName(new Date(2026, 9, 8)), '20261008_날씨CG메이커');
  assert.equal(ctx.exportFolderName(new Date(2027, 0, 1, 0, 0, 1)), '20270101_날씨CG메이커');
  assert.equal(ctx.exportFolderName(new Date(2026, 11, 31, 23, 59, 59)), '20261231_날씨CG메이커');
  assert.match(ctx.exportFolderName(), /^\d{8}_날씨CG메이커$/);
});

test('파일 이름 안전하게 — 금지 문자·제어 문자·끝 점·예약 이름·80자·NFC', () => {
  const { safeFileName: f } = planCtx();
  assert.equal(f('a/b:c*?"<>|d\\e'), 'abcde');
  assert.equal(f('  색칠만 . . '), '색칠만');
  assert.equal(f('줄\n바꿈\t탭'), '줄 바꿈 탭');
  assert.equal(f('CON'), 'CON_'); assert.equal(f('nul'), 'nul_'); assert.equal(f('COM1'), 'COM1_');
  assert.equal(f(''), '이름없음'); assert.equal(f('///'), '이름없음');
  assert.equal([...f('가'.repeat(100))].length, 80);
  const nfd = '수치 라벨'.normalize('NFD');
  assert.notEqual(nfd, '수치 라벨');
  assert.equal(f(nfd), '수치 라벨');
  assert.equal(f('시·도 선만'), '시·도 선만'); assert.equal(f('배경 + 글자'), '배경 + 글자'); assert.equal(f('80~100'), '80~100');
});

test('장 목록(exportPlan) — 이 지도에 없는 항목은 0장·까닭, 라벨은 장마다 이름(윗줄 포함·겹치면 (2)·빈 글은 번호)', () => {
  const labels = [{ id: 'a', txt: '120' }, { id: 'b', txt: '80~100', title: '강원' }, { id: 'c', txt: '120' }, { id: 'd', txt: '9', off: 1 }, { id: 'e', txt: '' }];
  const c = planCtx({ labels, mtns: [{ id: 'm' }] });
  const files = JSON.parse(JSON.stringify(c.exportPlan(['labels', 'full', 'fills']).map((p) => p.file)));
  assert.deepEqual(files, ['전체 화면.png', '색칠만.png', '수치 라벨 - 120.png', '수치 라벨 - 강원 80~100.png', '수치 라벨 - 120 (2).png', '수치 라벨 04.png'], '카드 순서·라벨 이름 규칙');
  assert.equal(c.exportCount('vfbar'), 0); assert.match(c.exportWhyNot('vfbar'), /노말 VF/);
  assert.equal(c.exportCount('typhoon'), 0); assert.match(c.exportWhyNot('typhoon'), /태풍 지도에서만/);
  // 태풍 지도 — 한국 지도 계열·노말 라벨·산은 0장(빈 PNG 방지), 배경·태풍 경로는 있다
  c.typ = true;
  for (const k of ['map', 'base', 'fills', 'lines', 'sidoline', 'labels', 'mtn']) { assert.equal(c.exportCount(k), 0, k); assert.ok(c.exportWhyNot(k), k); }
  for (const k of ['full', 'bg', 'bgtext', 'typhoon', 'title', 'legend']) assert.equal(c.exportCount(k), 1, k);
  // 칠한 곳·경계선·범례가 없으면 흐리게
  const e = planCtx({ fillsObj: {}, ink: {} });
  assert.match(e.exportWhyNot('fills'), /칠한 곳이 없어요/);
  assert.match(e.exportWhyNot('legend'), /범례/);
  assert.match(e.exportWhyNot('title'), /제목/);
  assert.equal(e.exportPlan(['fills', 'legend', 'labels', 'mtn']).length, 0);
  e.S.sggOn = 0; e.S.realOn = 0; e.S.sidoOn = 0;
  assert.match(e.exportWhyNot('lines'), /경계선/); assert.match(e.exportWhyNot('sidoline'), /시·도/);
  e.S.showBg = 0; assert.ok(e.exportWhyNot('bg')); assert.equal(e.exportCount('full'), 1);
  // 노말 VF + 제목 바
  const v = planCtx({ res: '1920x1080-vf' }); assert.equal(v.exportCount('vfbar'), 1);
});

test('렌더 — 클릭 직후 첫 await가 폴더 창, 영상 출력 폴더(prepareOutput) 안 씀, 정지 화면에서 굽기, 작업 중 효과 짝', () => {
  const r = fnSrc('renderExport').replace(/\/\/[^\n]*/g, '');   // 주석 뺀 코드
  const firstAwait = r.indexOf('await ');
  assert.ok(firstAwait > 0 && r.slice(firstAwait, firstAwait + 30).startsWith('await exPickRoot('), '첫 await = 폴더 고르기(사용자 활성화 안)');
  const pr = fnSrc('exPickRoot');
  assert.match(pr, /\{ id: 'wcgImgOut', mode: 'readwrite' \}/);
  assert.match(pr, /startIn: last/, '지난번 폴더에서 시작');
  assert.match(r, /idbSet\('imgDir', root\)/, '고른 폴더 기억(영상 outDir과 따로)');
  assert.match(r, /root\.getDirectoryHandle\(folder, \{ create: true \}\)/);
  assert.doesNotMatch(r, /prepareOutput|getOutDir|'outDir'|showSaveFilePicker/);
  assert.match(r, /await withStaticFrame\(/);
  assert.match(r, /await awaitMapboxTilesReady\(\)/);
  assert.match(r, /if \(_exportingFrames\) \{ exToast\('영상 추출이 끝난 뒤에 할 수 있어요'\); return; \}/);
  assert.match(r, /e\.name === 'AbortError'\) \{ exToast\([^)]*\{ zip: true \}\)/, '취소·막힌 폴더 → 안내 + ZIP 받기');
  assert.match(r, /if \(!target\) target = exZipTarget\(folder\);/, '폴더 고르기가 없으면 ZIP');
  assert.match(r, /const how = await exAskOverwrite\(dup, folder\);/);
  assert.match(r, /fxBusy\(fx, true, \{ disable: false \}\)/);
  assert.match(r.slice(r.lastIndexOf('finally')), /fxBusy\(fx, false\)/);
  // 정지 화면: 재생 멈춤·태풍 애니 확인 루프 끔·미리보기 걷기 → 끝나면 그 시각으로 되살림
  const w = fnSrc('withStaticFrame');
  for (const s of ['animStop()', 'cancelAnimationFrame(typhoonRaf)', 'animOff()', 'animSeek(t)', 'L_mapBase']) assert.ok(w.includes(s), s);
  // 겹침 확인 — 덮어쓰기(주)·번호 붙여 따로·취소
  const a = fnSrc('exAskOverwrite');
  assert.match(a, /title: '같은 이름 파일이 있어요'/);
  assert.match(a, /data-cancel>취소<\/button><button class="tossBtn ghost" data-num>번호 붙여 따로 저장<\/button><button class="tossBtn pri" data-over>덮어쓰기<\/button>/);
  assert.match(fnSrc('exRenumber'), /`\$\{p\.name\} \(\$\{i\}\)`/, "번호는 ' (2)'");
  // ZIP: 안 이름에 폴더 접두어, 날짜·시각 채움
  const z = fnSrc('exZipTarget');
  assert.match(z, /name: `\$\{folder\}\/\$\{name\}`/);
  assert.match(z, /download\(zipStore\(files, new Date\(\)\), `\$\{folder\}\.zip`\)/);
});

test('ZIP 항목 날짜·시각(DOS) — mtime 을 주면 채우고, 안 주면 옛 호출 그대로 0', () => {
  const ctx = { TextEncoder, Blob, Uint8Array, DataView };
  vm.createContext(ctx);
  vm.runInContext(fnSrc('_crc32') + '\n' + fnSrc('zipStore'), ctx);
  const read = async (blob) => { const u = new Uint8Array(await blob.arrayBuffer()); const dv = new DataView(u.buffer); return { time: dv.getUint16(10, true), date: dv.getUint16(12, true), flag: dv.getUint16(6, true), name: new TextDecoder().decode(u.subarray(30, 30 + dv.getUint16(26, true))) }; };
  return (async () => {
    const d = new Date(2026, 9, 8, 14, 30, 22);
    const z = await read(ctx.zipStore([{ name: '20261008_날씨CG메이커/색칠만.png', data: new Uint8Array([1, 2, 3]) }], d));
    assert.equal(z.date, ((2026 - 1980) << 9) | (10 << 5) | 8);
    assert.equal(z.time, (14 << 11) | (30 << 5) | 11);
    assert.equal(z.flag & 0x800, 0x800, '한글 이름 UTF-8 플래그');
    assert.equal(z.name, '20261008_날씨CG메이커/색칠만.png');
    const old = await read(ctx.zipStore([{ name: 'a.png', data: new Uint8Array([1]) }]));
    assert.deepEqual([old.date, old.time], [0, 0]);
  })();
});

test('굽기 정확도 — 색칠만 선 0·이음새 메움, 미리보기 잔재 안전망, 터치 가장자리, 실시간 타일, 3D 기울기(이미지만)', () => {
  const sb = fnSrc('svgBlob');
  assert.match(sb, /clone\.setAttribute\('preserveAspectRatio', 'none'\)/);
  assert.match(sb, /stripAnimState\(clone\)/);
  assert.match(sb, /inlineMapboxTiles\(clone\)/);
  assert.match(sb, /if \(opt\.tilt && camActive3d\(\)\)/, '기울기는 opt.tilt 일 때만(AE는 기존 그대로)');
  assert.match(fnSrc('previewPng'), /preserveAspectRatio', 'none'/);
  assert.match(fnSrc('svgToImage'), /preserveAspectRatio', 'none'/);
  assert.match(fnSrc('svgToImage'), /inlineMapboxTiles\(clone\)/);
  // 영상 공용 stripExportUi 에는 애니 정리가 들어가지 않는다(영상은 그 상태를 그려야 한다)
  assert.doesNotMatch(fnSrc('stripExportUi'), /L_mapBase|bclip|L_vfWrap/);
  const sa = fnSrc('stripAnimState');
  for (const s of ["'#L_mapBase'", 'clipPath[id^="bclip"]', '[clip-path^="url(#bclip"]', '#L_vfWrap']) assert.ok(sa.includes(s), s);
  // 색칠만: 안 칠한 구역은 테두리까지 none(A), 구역선·시도선 없음, 칠한 조각은 밑판+마스크(I)
  const f = fnSrc('fillOnlyLayer');
  assert.match(f, /z\.setAttribute\('fill', col \|\| 'none'\); z\.setAttribute\('stroke', 'none'\);/);
  assert.match(f, /exRemoveAll\(c, '\.zoneLine, \.sidoLine'\)/);
  assert.match(f, /exSeamless\(c, zg, 'xFillClip'\)/);
  assert.match(f, /#seoulRiver/, '서울 한강은 칠한 동 위에만(C)');
  const sl = fnSrc('exSeamless');
  assert.match(sl, /el\('mask'/); assert.match(sl, /join\(' '\)/, '마스크는 한 path');
  assert.match(sl, /exSelfEdge\(u, it\.col, it\.sc\)/);
  // 항목 굽기: 전체 화면 = 영상 한 프레임과 같은 경로(H), 지도만에 산 없음
  const bk = fnSrc('exportBake');
  assert.match(bk, /case 'full': \{[\s\S]*?clearExportCache\(\);\n\s*try \{ await drawExportFrame\(cv\.getContext\('2d'\), W, H\); \} finally \{ clearExportCache\(\); \}/);
  assert.match(bk, /case 'map':[\s\S]*?keepLayers\(c, \['L_bg', 'L_sea', 'L_map', 'L_boxes'\]\)/);
  // AE 쪽 색칠 레이어는 그대로(2차) — 결과가 바뀌지 않게
  assert.match(fnSrc('aeFillBlob'), /z\.setAttribute\('stroke', 'none'\);/);
  assert.doesNotMatch(html.match(/async function sendToAE\(\) \{[\s\S]*?\n\}/)[0], /tilt: true/);
});

test('팝업 여닫기·키보드·데스크톱 — CG 구성과 같은 틀(body 잠금·다시 만들기 없음)', () => {
  const o = fnSrc('openExport'), c = fnSrc('closeExport'), s = fnSrc('setupExportDialog');
  for (const f of [o, c]) assert.doesNotMatch(f, /document\.body\.style|position:\s*fixed|createElement|innerHTML/);
  assert.match(o, /if \(_closeMenu\) _closeMenu\(\);/);
  assert.match(o, /classList\.add\('exOpen'\)/); assert.match(c, /classList\.remove\('exOpen'\)/);
  assert.match(c, /if \(_exBusy\) \{ exStopRequest\(\); return; \}/, '굽는 중엔 닫지 않고 중지');
  assert.match(s, /if \(e\.key === 'Escape'\) \{ e\.preventDefault\(\); if \(_exBusy\) exStopRequest\(\); else closeExport\(\); \}/);
  assert.match(s, /popTrapTab\(ov\.querySelector\('\.cgSetupCard'\), e\)/);
  assert.match(s, /#tossOv:not\(\.popClosing\)/, '겹침 확인창이 먼저 Esc·Tab 을 받는다');
  assert.match(s, /if \(e\.target === ov && downOnOv && !_exBusy\) closeExport\(\);/);
  assert.match(html, /\['#exportOv\.on', 'var\(--pop-ov\)'\]/, '데스크톱 창 버튼도 같이 어둡게');
  assert.match(html, /html\.isDesktop\.exOpen \.titlebar \{ -webkit-app-region: no-drag; \}/);
  assert.match(html, /if \(cgSetupIsOpen\(\) \|\| exportIsOpen\(\)\) return;/, '팝업이 떠 있으면 뒤 지도 단축키 막기');
  assert.match(html, /setupExportDialog\(\);   \/\/ 이미지로 추출 팝업/);
  // 고른 것 기억 — 이 PC 편의 기능(작업 S와 무관), 읽기·쓰기 모두 try
  assert.match(fnSrc('exLoadPick'), /try \{ a = JSON\.parse\(localStorage\.getItem\(EX_PICK_KEY\)/);
  assert.match(fnSrc('exSavePick'), /try \{ localStorage\.setItem\(EX_PICK_KEY/);
  assert.match(html, /const EX_PICK_KEY = 'wcg_export_pick';/);
});

test('스타일 — 보라 판 토큰(두 테마)·팝업 폭·흐린 카드·좁은 창', () => {
  const css = fs.readFileSync(path.join(root, 'css', 'export-dialog.css'), 'utf8').replace(/\r\n/g, '\n');
  for (const v of ['--cgs-mark:', '--cgs-mark-on:', '--cgs-mark-bg:', '--cgs-mark-line:']) assert.equal(css.split(v).length - 1, 2, `${v} 는 두 테마에`);
  assert.match(css, /\.exCard \{ width: min\(1080px, 100%\); \}/);
  assert.match(css, /\.exPaneOne \{[^}]*grid-column: 1 \/ -1;/);
  assert.match(css, /\.exPaneOne \.cgsChoices \{ grid-template-columns: repeat\(3, minmax\(0, 1fr\)\); \}/);
  assert.match(css, /\.cgsCard\[aria-disabled="true"\] \{ opacity: \.45; cursor: not-allowed; \}/);
  assert.match(css, /@media \(max-width: 560px\) \{\n\s*\.exPaneOne \.cgsChoices \{ grid-template-columns: minmax\(0, 1fr\); \}/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(css, /border-left/, '박스 왼쪽 색 줄 금지');
});

test('영상 저장 폴더 버튼은 타임라인 영상 추출 옆으로(id·핸들러 그대로), 이미지 추출은 쓰지 않는다', () => {
  const tl = block(html, /<div id="timeline">/, 'div');
  assert.match(tl, /<\/div>\n\s*<!--[^>]*-->\n\s*<button id="exSetDir" class="tlDirBtn"[^>]*><svg[\s\S]*?<span class="tlDirLbl">저장 폴더<\/span><\/button>/);
  assert.match(fnSrc('updateOutDirBtn'), /b\.querySelector\('\.tlDirLbl'\)/);
  assert.match(html, /\$\('#exSetDir'\)\.onclick = async \(\) => \{/);
  assert.doesNotMatch(fnSrc('renderExport').replace(/\/\/[^\n]*/g, ''), /outDir/);
});

test('데스크톱 — 폴더 고르기에서 막히는 사용자 폴더(바탕화면 자체 등)는 허락, 시스템 폴더는 다시 고르기', () => {
  assert.match(mainJs, /session\.defaultSession\.on\('file-system-access-restricted', \(_e, d, cb\) => cb\(fsPickAllowed\(d && d\.path\) \? 'allow' : 'tryAgain'\)\)/);
  assert.match(mainJs, /const \{ app, BrowserWindow, Menu, shell, protocol, ipcMain, dialog, session \} = require\('electron'\);/);
  const env = { SystemRoot: 'C:\\Windows', ProgramFiles: 'C:\\Program Files', 'ProgramFiles(x86)': 'C:\\Program Files (x86)', ProgramData: 'C:\\ProgramData', APPDATA: 'C:\\Users\\u\\AppData\\Roaming', LOCALAPPDATA: 'C:\\Users\\u\\AppData\\Local', SystemDrive: 'C:' };
  const ctx = { path: path.win32, process: { env }, require: (m) => (m === 'os' ? { homedir: () => 'C:\\Users\\u' } : null) };
  vm.createContext(ctx);
  vm.runInContext(fnSrc('fsPickAllowed', '\n' + mainJs), ctx);
  const ok = (p) => ctx.fsPickAllowed(p);
  for (const p of ['C:\\Users\\u\\Desktop', 'C:\\Users\\u\\Downloads', 'C:\\Users\\u', 'C:\\Users\\u\\Documents\\CG', 'R:\\', 'R:\\Upload', 'D:\\']) assert.equal(ok(p), true, p);
  for (const p of ['C:\\Windows', 'C:\\Windows\\System32', 'C:\\Program Files', 'C:\\ProgramData\\x', 'C:\\Users\\u\\AppData\\Roaming', 'C:\\Users\\u\\AppData\\Local\\Temp', 'C:\\', '', null]) assert.equal(ok(p), false, String(p));
});

test('새 이름은 한 번씩만 정의된다', () => {
  for (const n of ['openExport', 'closeExport', 'exportIsOpen', 'renderExport', 'withStaticFrame', 'exportFolderName', 'setupExportDialog', 'syncExport', 'exportPlan', 'exportWhyNot', 'exportBake', 'exportLabelBlob', 'fillOnlyLayer', 'exSeamless', 'exSolidUnderlay', 'exSeaUnderLand', 'safeFileName', 'stripAnimState', 'inlineMapboxTiles', 'svgCloneImage', 'exAskOverwrite', 'exRenumber', 'exZipTarget', 'exDirTarget', 'exPickRoot']) {
    assert.equal(html.split(`function ${n}(`).length - 1, 1, n);
  }
  for (const n of ['EXPORT_ICON', 'EXPORT_STACK', 'EXPORT_TARGETS', 'EX_PICK_KEY']) assert.equal(html.split(`const ${n} =`).length - 1, 1, n);
});
