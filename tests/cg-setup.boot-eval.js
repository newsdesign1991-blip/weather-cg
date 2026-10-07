// boot-check --eval 용 본문(async 함수 본문, return 으로 결과). tests/cg-setup.test.cjs 가 WCG_BOOT_CHECK=1 일 때 돌린다.
// CG 구성 창 고르기·완료·취소·Esc·바깥 클릭, 되돌리기, 프로젝트 아이콘 드롭다운, 추출 버튼 3개, 제목줄 넘침을 실제 화면에서 눌러 본다.
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
const ovOn = () => $('#cgSetupOv').classList.contains('on');
const picked = (sel) => $$(sel + ' .cgsCard.choicePending').map((b) => b.dataset.res || b.dataset.style);
const doneDis = () => $('#cgsDone').disabled;
const work = () => { try { const w = JSON.parse(localStorage.getItem('wcg_work') || 'null'); return w && { res: w.res, style: w.style }; } catch (e) { return null; } };
const state = () => ({ ov: ovOn(), res: picked('#resBtns'), style: picked('#styleBtns'), doneDisabled: doneDis(), summary: $('#cgsSummary').textContent, start: $('#startOverlay').classList.contains('on') });
// 시작 화면 보장(부팅 점검기의 새로고침 때문에 첫 실행 판정이 들쭉날쭉) — '새로 시작'으로 띄운다(확인창은 자동 예)
const _bootStart = $('#startOverlay').classList.contains('on');
if (!_bootStart) { const c = window.confirm; window.confirm = () => true; $('#newWork').click(); window.confirm = c; await sleep(700); }
const _autoOpened = ovOn();
const R = {};
R.boot = { start: $('#startOverlay').classList.contains('on'), tbBtn: !!$('#cgSetupBtn'), projIcon: !!$('#titlebar [data-menu="proj"] svg'), resCards: $$('#resBtns .cgsCard').length, styleCards: $$('#styleBtns .cgsCard').map((b) => b.dataset.style) };
// 1) 시작 화면 → CG 구성 열기: 아무것도 안 골라짐
if (!ovOn()) { $('#startSetup').click(); } await sleep(400);
R.openStart = state();
// 2) 하나만 고르면 선택 완료 비활성
$('#resBtns [data-res="1920x1080"]').click(); await sleep(50);
R.oneRes = state();
// 3) 둘 다 고르면 활성 → 완료
$('#styleBtns [data-style="sido"]').click(); await sleep(50);
R.both = state();
$('#cgsDone').click(); await sleep(700);
R.afterDone = { ...state(), work: work() };
// 4) 작업 중 다시 열면 지금 구성이 미리 골라져 있다
$('#cgSetupBtn').click(); await sleep(400);
R.reopen = state();
// 5) 다른 걸 골랐다가 취소 → 변화 없음
$('#resBtns [data-res="1920x1080-vf"]').click(); $('#styleBtns [data-style="warn"]').click(); await sleep(50);
R.beforeCancel = state();
$('#cgsCancel').click(); await sleep(500);
await sleep(1700);   // 자동저장 주기(1.5초) 지나도
R.afterCancel = { ...state(), work: work() };
// Esc 닫기
$('#cgSetupBtn').click(); await sleep(350);
$('#resBtns [data-res="2158x1214"]').click();
window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(450);
// 바깥 클릭 닫기
$('#cgSetupBtn').click(); await sleep(350);
$('#styleBtns [data-style="warnsea"]').click();
$('#cgSetupOv').dispatchEvent(new MouseEvent('click', { bubbles: true })); await sleep(450);
await sleep(1700);
R.afterEscOutside = { ov: ovOn(), work: work() };
// 6) 실제로 바꾸기: 노말 VF + 특보구역
$('#cgSetupBtn').click(); await sleep(350);
$('#resBtns [data-res="1920x1080-vf"]').click(); $('#styleBtns [data-style="warn"]').click(); await sleep(50);
R.changeSummary = $('#cgsSummary').textContent;
$('#cgsDone').click(); await sleep(1900);
R.afterChange = { ov: ovOn(), work: work(), vfGrip: !!document.getElementById('vfScaleGrip') };
$('#cgSetupBtn').click(); await sleep(350);
R.reopen2 = state();
$('#cgsX').click(); await sleep(400);
// 7) 되돌리기(Ctrl+Z) 두 번 → 지도 종류·CG 종류가 차례로 되돌아간다
$('#undo').click(); await sleep(200); $('#undo').click(); await sleep(1800);
R.afterUndo = work();
// 8) 프로젝트 아이콘 → 프로젝트 드롭다운
$('#titlebar [data-menu="proj"]').click(); await sleep(350);
R.proj = { drop: $('#menuDrop').classList.contains('on'), shown: $$('#menuDrop > .sec').filter((n) => n.style.display !== 'none').map((n) => n.dataset.sec), hasSave: !!$('#menuDrop #save') && $('#save').offsetParent !== null, btnOn: $('#titlebar [data-menu="proj"]').classList.contains('on') };
document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); await sleep(300);
R.projClosed = !$('#menuDrop').classList.contains('on');
// 9) 추출 3개
$('#titlebar [data-menu="out"]').click(); await sleep(350);
R.outMenu = { drop: $('#menuDrop').classList.contains('on'), shown: $$('#menuDrop > .sec').filter((n) => n.style.display !== 'none').map((n) => n.dataset.sec), btnBg: getComputedStyle($('#titlebar [data-menu="out"]')).backgroundColor };
document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); await sleep(300);
$('#tlToggle').click(); await sleep(500);
R.tlOn = { timeline: $('#timeline').classList.contains('on'), pri: $('#tlToggle').classList.contains('pri'), bg: getComputedStyle($('#tlToggle')).backgroundColor };
$('#tlToggle').click(); await sleep(500);
R.tlOff = { timeline: $('#timeline').classList.contains('on'), pri: $('#tlToggle').classList.contains('pri') };
R.ae = { shown: $('#aeSend').style.display !== 'none' && $('#aeSend').offsetParent !== null };
// 점검 중 실제 애프터이펙트가 뜨지 않게 /api/ae 요청만 가로챈다(칠한 색이 없으면 그 전에 안내로 끝난다)
const _realFetch = window.fetch;
window.fetch = (u, o) => (/\/api\/ae/.test(String(u)) ? Promise.resolve(new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } })) : _realFetch(u, o));
await $('#aeSend').onclick(); await sleep(500);
window.fetch = _realFetch;
R.ae.afterClick = { toss: !!document.getElementById('tossOv'), title: document.querySelector('#tossOv .tossTitle')?.textContent || '', status: $('#status').textContent };
document.querySelector('#tossOv .tossX')?.click(); await sleep(200);
// 10) 제목줄 겹침·가로 넘침
const tb = $('#titlebar'), nav = $('#titlebar .tbMenus').getBoundingClientRect(), right = $('#titlebar .tbRight').getBoundingClientRect();
R.titlebar = { w: innerWidth, scroll: tb.scrollWidth, client: tb.clientWidth, navRight: Math.round(nav.right), rightLeft: Math.round(right.left), rightRight: Math.round(right.right), docScroll: document.documentElement.scrollWidth };
return R;
