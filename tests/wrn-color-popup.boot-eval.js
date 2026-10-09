// boot-check --eval 용 본문(async 함수 본문, return 으로 결과). tests/wrn-color-popup.test.cjs 가 WCG_BOOT_CHECK=1 일 때 돌린다.
// '특보 종류별 색' 실제 흐름: 특보 지도 → 사이드바 버튼 → 팝업 → 왼쪽에서 '폭염' → 오른쪽 경보 #123456 → 상태·지도 칠 → Ctrl+Z → Esc,
// 색 칸(예비특보)·기본색으로·Tab 가두기·바깥 클릭·떼어낸 창에서 버튼.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
// 둘러보기·공지 등 부팅 팝업 닫기
for (let i = 0; i < 12; i++) {
  if ($('#tourWrap.on')) $('#tourClose').click();
  const x = document.querySelector('#tossOv .tossX'); if (x) x.click();
  await sleep(150);
  if (!$('#tourWrap.on') && !document.getElementById('tossOv')) break;
}
// 특보 지도로(시작 화면이면 장면 설정 열기, 작업 중이면 제목줄 장면 설정)
if ($('#startOverlay').classList.contains('on')) $('#startSetup').click(); else $('#cgSetupBtn').click();
await sleep(400);
$('#resBtns [data-res="1920x1080"]').click(); $('#styleBtns [data-style="warn"]').click(); await sleep(50);
$('#cgsDone').click(); await sleep(1500);
// 특보 붙여넣기(인터넷 없이) — 대전 폭염 경보·계룡 폭염 주의보·금산 폭염 중대경보·옥천 호우 주의보·논산 호우 예비
const rows = [
  ['L1000000', '충청', 'L1030100', '대전', '202610090600', '202610090600', '폭염', '경보', '발표'],
  ['L1000000', '충청', 'L1031700', '계룡', '202610090600', '202610090600', '폭염', '주의보', '발표'],
  ['L1000000', '충청', 'L1030600', '금산', '202610090600', '202610090600', '폭염', '중대경보', '발표'],
  ['L1000000', '충청', 'L1040600', '옥천', '202610090600', '202610090600', '호우', '주의보', '발표'],
  ['L1000000', '충청', 'L1030500', '논산', '202610090600', '202610090600', '호우', '예비', '발표'],
];
applyWrn('#START7777\n' + rows.map((r) => r.join(', ') + ', , =').join('\n') + '\n', null, 'paste');
await sleep(500);
revealSec('wrn'); await sleep(600);
const ov = $('#wrnColOv');
const isOpen = () => ov.classList.contains('on');
const zoneFill = (id) => { const p = document.querySelector(`#cg path[data-id="${id}"]`); return p ? (p.getAttribute('fill') || '').toUpperCase() : null; };
const card = (lvl) => $(`#wrnColLevels .wrnColLv[data-lvl="${lvl}"]`);
const keyOn = (target, key, o) => target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...(o || {}) }));
const R = {};
R.sidebar = { grid: !!document.getElementById('wrnCols'), btn: !!$('.sec[data-sec="wrn"] #wrnColBtn'), dots: $$('#wrnColDots i').length, text: $('#wrnColBtn').textContent.trim() };
R.before = { state: S.wrnColors['폭염'][1], fill: S.fillsByStyle.warn.L1030100, svg: zoneFill('L1030100') };
// 1) 버튼 → 팝업
$('#wrnColBtn').scrollIntoView({ block: 'center' });
$('#wrnColBtn').focus(); $('#wrnColBtn').click(); await sleep(450);   // 실제 클릭처럼 버튼에 포커스(닫으면 여기로 돌아온다)
R.open = { open: isOpen(), aria: ov.getAttribute('aria-hidden'), htmlCls: document.documentElement.classList.contains('wrnColOpen'), focusIn: ov.contains(document.activeElement),
  items: $$('#wrnColList .wrnColItem').map((b) => b.dataset.k), count: $('#wrnColCount').textContent, dim: typeof titleBarDimLayers === 'function' ? titleBarDimLayers().length : -1 };
// 2) 왼쪽에서 호우 → 폭염
$('#wrnColList .wrnColItem[data-k="호우"]').click(); await sleep(80);
R.hou = { name: $('#wrnColDetName').textContent, levels: $$('#wrnColLevels .wrnColLv').map((c) => c.dataset.lvl), sel: $$('#wrnColList .wrnColItem.on').map((b) => b.dataset.k) };
$('#wrnColList .wrnColItem[data-k="폭염"]').click(); await sleep(80);
R.pick = { name: $('#wrnColDetName').textContent, levels: $$('#wrnColLevels .wrnColLv').map((c) => `${c.dataset.lvl}:${c.dataset.tag}:${c.querySelector('.wrnColHex').value}`),
  sel: $$('#wrnColList .wrnColItem.on').map((b) => b.dataset.k), ariaSel: $('#wrnColList .wrnColItem[data-k="폭염"]').getAttribute('aria-selected'),
  chip: !!card('경보').querySelector('.wrnColChip svg path[data-k="p"]'), resetDisabled: $('#wrnColReset').disabled };
// 3) 오른쪽 경보 색을 #123456 으로(#hex 칸 — Enter)
const hx = card('경보').querySelector('.wrnColHex');
hx.focus(); hx.value = '123456';
keyOn(hx, 'Enter'); await sleep(150);
R.changed = { state: S.wrnColors['폭염'][1], fill: S.fillsByStyle.warn.L1030100, svg: zoneFill('L1030100'), hex: hx.value, sw: card('경보').querySelector('.wrnColSw').value.toUpperCase(),
  tag: card('경보').dataset.tag, chipFill: (card('경보').querySelector('.wrnColChip svg path[data-k="p"]').getAttribute('fill') || '').toUpperCase(),
  listDot: $$('#wrnColList .wrnColItem[data-k="폭염"] .wrnColPair i').map((i) => getComputedStyle(i).backgroundColor),
  sideDot: getComputedStyle($$('#wrnColDots i')[2]).backgroundColor, resetDisabled: $('#wrnColReset').disabled, open: isOpen(),
  other: { 주의보: S.wrnColors['폭염'][0], 중대경보: wrnColorOf('폭염', '중대경보') } };
// 4) Ctrl+Z(#hex 칸에 포커스 그대로) → 되돌아감, 팝업도 따라옴
keyOn(document.activeElement, 'z', { ctrlKey: true }); await sleep(250);
R.undone = { state: S.wrnColors['폭염'][1], fill: S.fillsByStyle.warn.L1030100, svg: zoneFill('L1030100'), hex: card('경보').querySelector('.wrnColHex').value, tag: card('경보').dataset.tag, open: isOpen(), resetDisabled: $('#wrnColReset').disabled };
// 4-1) Ctrl+Y(다시 실행) → 다시 #123456, Ctrl+Z 로 되돌려 둔다
keyOn(document.activeElement, 'y', { ctrlKey: true }); await sleep(200);
R.redone = { state: S.wrnColors['폭염'][1], svg: zoneFill('L1030100') };
keyOn(document.activeElement, 'z', { ctrlKey: true }); await sleep(200);
// 5) 색 칸 — 예비특보(주의보 색을 따라감)를 따로 정하면 정확한 단계 색('폭염|예비')으로, 주의보 색은 그대로
const sw = card('예비').querySelector('.wrnColSw');
R.preBefore = { tag: card('예비').dataset.tag, exact: S.wrnLevelColors['폭염|예비'] || null };
sw.value = '#00ff00'; sw.dispatchEvent(new Event('input', { bubbles: true })); await sleep(120);
R.preAfter = { tag: card('예비').dataset.tag, exact: S.wrnLevelColors['폭염|예비'] || null, warnAdv: S.wrnColors['폭염'][0], tagText: card('예비').querySelector('.wrnColTag').textContent };
// 6) 기본색으로 → 이 종류만 기본(예비 단계 색도 걷힘), Ctrl+Z 로 되돌리면 다시 나타남
$('#wrnColReset').click(); await sleep(150);
R.reset = { exact: S.wrnLevelColors['폭염|예비'] || null, major: S.wrnLevelColors['폭염|중대경보'], disabled: $('#wrnColReset').disabled, tag: card('예비').dataset.tag };
$('#wrnColReset').focus();
keyOn(document.activeElement, 'z', { ctrlKey: true }); await sleep(200);
R.resetUndo = { exact: S.wrnLevelColors['폭염|예비'] || null, disabled: $('#wrnColReset').disabled };
keyOn(document.activeElement, 'z', { ctrlKey: true }); await sleep(200);   // 예비 색 정하기도 되돌림
R.allUndone = { exact: S.wrnLevelColors['폭염|예비'] || null, hou: S.wrnColors['호우'].join(','), pok: S.wrnColors['폭염'].join(',') };
// 7) 지도 단축키는 막힘(화살표로 지도가 움직이지 않음) · ↑↓ 로 목록 고르기
const mapX = S.map.x;
$('#wrnColList .wrnColItem.on').focus();
keyOn(document.activeElement, 'ArrowDown'); await sleep(80);
R.keys = { mapSame: S.map.x === mapX, picked: $('#wrnColDetName').textContent, focus: document.activeElement.dataset ? document.activeElement.dataset.k : '' };
keyOn(document.activeElement, 'ArrowUp'); await sleep(80);
// 8) Tab 가두기 — 마지막(완료)에서 Tab → 처음(X), 처음에서 Shift+Tab → 마지막
$('#wrnColDone').focus(); keyOn(document.activeElement, 'Tab'); const t1 = document.activeElement.id;
$('#wrnColX').focus(); keyOn(document.activeElement, 'Tab', { shiftKey: true }); const t2 = document.activeElement.id;
R.trap = { fromLast: t1, fromFirstBack: t2 };
// 9) Esc 닫기 → 버튼으로 포커스 돌려줌, 제목줄 끌기 클래스 걷힘
keyOn(document.activeElement, 'Escape'); await sleep(450);
R.esc = { open: isOpen(), aria: ov.getAttribute('aria-hidden'), htmlCls: document.documentElement.classList.contains('wrnColOpen'), focusBtn: document.activeElement && document.activeElement.id, dim: typeof titleBarDimLayers === 'function' ? titleBarDimLayers().length : -1 };
// 10) 바깥 클릭 닫기(막에서 누르고 막에서 뗌) · 카드에서 누르고 막에서 떼면 안 닫힘 · X 닫기
$('#wrnColBtn').click(); await sleep(350);
$('#wrnColTitle').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
ov.dispatchEvent(new MouseEvent('click', { bubbles: true })); await sleep(100);
const dragOut = isOpen();
ov.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
ov.dispatchEvent(new MouseEvent('click', { bubbles: true })); await sleep(400);
R.outside = { dragOutStaysOpen: dragOut, closed: !isOpen() };
$('#wrnColBtn').click(); await sleep(300);
$('#wrnColX').click(); await sleep(400);
R.xClose = !isOpen();
// 11) 떼어낸 창(#wins)에서도 버튼이 동작
const w = popOut('wrn', 700, 160); await sleep(500);
const winBtn = document.querySelector('#wins .win #wrnColBtn');
R.win = { inWin: !!winBtn };
if (winBtn) { winBtn.click(); await sleep(400); R.win.open = isOpen(); $('#wrnColDone').click(); await sleep(400); R.win.closed = !isOpen(); }
closeWin(w); await sleep(300);
R.win.docked = !!$('#panel > .sec[data-sec="wrn"] #wrnColBtn');
await sleep(1700);   // 자동 저장(1.5초) 뒤에도 되돌린 색 그대로
try { const work = JSON.parse(localStorage.getItem('wcg_work') || 'null'); R.saved = work && work.wrnColors ? work.wrnColors['폭염'].join(',') : null; } catch (e) { R.saved = 'err'; }
return R;
