// boot-check --eval 용 본문(async 함수 본문, return 으로 결과). tests/date-picker.test.cjs 가 WCG_BOOT_CHECK=1 일 때 돌린다.
// 날짜 고르기(js/date-picker.js) 실제 흐름: 특보 '지난 날짜' 칸 → 달력 → 제목 눌러 연·월 휠 → 2019년 3월 → 15일 → #wrnDate.value·기존 리스너(syncWhen → wrnWhen),
// 휠(마우스 휠·키·누르기, 오늘 이후 막힘), 달력 키(화살표·PageUp)·Esc·바깥 누르기, 코드가 값을 바꾸면 칸이 따라감, 시각 칸(직접 입력·알약·↑↓), 태풍 과거 날짜.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
for (let i = 0; i < 12; i++) {
  if ($('#tourWrap.on')) $('#tourClose').click();
  const x = document.querySelector('#tossOv .tossX'); if (x) x.click();
  await sleep(150);
  if (!$('#tourWrap.on') && !document.getElementById('tossOv')) break;
}
// 장면 설정으로 지도 종류 바꾸기(시작 화면이면 거기서)
const scene = async (style) => {
  if ($('#startOverlay').classList.contains('on')) $('#startSetup').click(); else $('#cgSetupBtn').click();
  await sleep(500);
  $('#resBtns [data-res="1920x1080"]').click(); $(`#styleBtns [data-style="${style}"]`).click(); await sleep(80);
  $('#cgsDone').click(); await sleep(1600);
  for (let i = 0; i < 6; i++) { const x = document.querySelector('#tossOv .tossX'); if (x) { x.click(); await sleep(300); } }
};
const pop = () => document.querySelector('.dpPop:not(.closing)');
const title = () => (pop() ? pop().querySelector('.dpTitleTx').textContent : null);
const key = (el, k, o = {}) => el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...o }));
const tap = (el) => { const o = { bubbles: true, cancelable: true, button: 0, pointerId: 7, pointerType: 'mouse', clientY: 10 }; el.dispatchEvent(new PointerEvent('pointerdown', o)); el.dispatchEvent(new PointerEvent('pointerup', o)); };
const R = {};

// 0) 붙었는가 — 모든 type=date·time 이 숨겨지고 옆에 우리 칸
R.attached = {
  date: $$('input[type=date]').map((n) => ({ id: n.id || n.dataset.cmpfrom || n.dataset.cmpto || '', dp: !!n._dp, hidden: getComputedStyle(n).display === 'none', field: !!(n.nextElementSibling && n.nextElementSibling.classList.contains('dpField')) })),
  time: $$('input[type=time]').map((n) => ({ id: n.id, dpt: !!n._dpt, hidden: getComputedStyle(n).display === 'none' })),
};

await scene('warn');
revealSec('wrn'); await sleep(700);
$('#wrnWhenPast').click(); await sleep(400);
const wd = $('#wrnDate'), field = wd._dp.field;
const ev = { input: 0, change: 0 };
wd.addEventListener('input', () => ev.input++); wd.addEventListener('change', () => ev.change++);
R.start = { value: wd.value, field: field.textContent, when: wrnWhen };
// 오늘 날짜로 맞춰 두고 연다(기본값 '어제'는 1일이면 지난달이라 — 코드가 값을 바꾸는 길, change 없음)
const now = new Date(), todayDs = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
wd.value = todayDs;

// 1) 칸 누르기 → 달력(칸 아래, 화면 안)
field.click(); await sleep(450);
const p1 = pop(), fr = field.getBoundingClientRect(), pr = p1 && p1.getBoundingClientRect();
R.open = {
  pop: !!p1, title: title(), expanded: field.getAttribute('aria-expanded'),
  below: !!pr && pr.top >= fr.bottom - 12, inView: !!pr && pr.left >= 0 && pr.right <= innerWidth && pr.bottom <= innerHeight,
  days: $$('.dpPop .dpDay').length, sel: ($('.dpPop .dpDay.is-sel') || {}).dataset?.d || '', today: ($('.dpPop .dpDay.is-today') || {}).dataset?.d || '', todayDs,
  futureOff: $$('.dpPop .dpDay').filter((b) => b.dataset.d > todayDs).every((b) => b.disabled) && $$('.dpPop .dpDay').filter((b) => b.dataset.d <= todayDs).every((b) => !b.disabled),
  nextOff: $('.dpPop .dpNext').disabled, sunColor: getComputedStyle($('.dpPop .dpWeek .sun')).color, satColor: getComputedStyle($('.dpPop .dpWeek .sat')).color,
  foot: $('.dpPop .dpSel').textContent, zoom: $('.dpPop .dpCard').style.zoom,
};

// 2) 제목 → 연·월 휠
$('.dpPop .dpTitle').click(); await sleep(500);
const colY = $('.dpPop .dpCol[data-k="y"]'), colM = $('.dpPop .dpCol[data-k="m"]');
R.wheel = { on: $('.dpPop .dpCard').classList.contains('wheelOn'), calHidden: $('.dpPop .dpCal').hidden, wheelShown: !$('.dpPop .dpWheel').hidden,
  years: [colY.querySelector('.dpItem').textContent, [...colY.querySelectorAll('.dpItem')].pop().textContent], lastYearDis: [...colY.querySelectorAll('.dpItem')].pop().classList.contains('dis'),
  snap: getComputedStyle(colY).scrollSnapType, title: title(), chev: getComputedStyle($('.dpPop .dpTitleChev')).transform };
// 오늘 이후는 못 감 — 달 ↓(11월 흐림), 해 마우스 휠 아래(올해+1 흐림)
key(colM, 'ArrowDown'); await sleep(120);
colY.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true })); await sleep(120);
R.blocked = title();
// 해: 마우스 휠 위 3칸(2023) + ↑ 4번(2019) → 달: '3월' 누르기
for (let i = 0; i < 3; i++) { colY.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true })); await sleep(60); }
R.afterWheel = title();
for (let i = 0; i < 4; i++) { key(colY, 'ArrowUp'); await sleep(40); }
R.afterKeys = title();
tap([...colM.querySelectorAll('.dpItem')].find((n) => n.textContent === '3월')); await sleep(300);
R.afterTap = title();
R.monthsAll = [...colM.querySelectorAll('.dpItem')].every((n) => !n.classList.contains('dis'));   // 지난 해는 12달 다 고를 수 있다
await sleep(1000);
R.scrollAligned = [colY.scrollTop / 36, colM.scrollTop / 36];   // 고른 줄(2019 = 29번째, 3월 = 2번째)이 가운데 — 맞춤 스크롤(또는 안전망)
// 3) 제목 다시 → 2019년 3월 달력 → 15일
$('.dpPop .dpTitle').click(); await sleep(500);
R.backCal = { title: title(), calShown: !$('.dpPop .dpCal').hidden, wheelOff: !$('.dpPop .dpCard').classList.contains('wheelOn'), lead: $$('.dpPop .dpGrid > *').findIndex((n) => n.textContent === '1'), next: !$('.dpPop .dpNext').disabled };
$('.dpPop .dpDay[data-d="2019-03-15"]').click(); await sleep(400);
R.picked = { value: wd.value, field: field.textContent, when: wrnWhen, ev: { ...ev }, closed: !pop(), focus: document.activeElement === field };

// 4) 키보드 — 다시 열면 고른 날에 포커스, → = 16일, PageUp = 2월, Shift+PageUp = 한 해 전, 누르기 = 고르기
field.click(); await sleep(450);
R.kbFocus0 = document.activeElement.dataset.d;
key(document.activeElement, 'ArrowRight'); await sleep(50);
R.kbRight = document.activeElement.dataset.d;
key(document.activeElement, 'PageUp'); await sleep(80);
R.kbPgUp = [document.activeElement.dataset.d, title()];
key(document.activeElement, 'PageUp', { shiftKey: true }); await sleep(80);
R.kbYear = [document.activeElement.dataset.d, title()];
document.activeElement.click(); await sleep(400);
R.kbPick = [wd.value, wrnWhen];
// 5) Esc·바깥 누르기 = 닫기(값 그대로)
field.click(); await sleep(400);
key(document.activeElement, 'Escape'); await sleep(300);
R.esc = { closed: !pop(), value: wd.value };
field.click(); await sleep(400);
document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
await sleep(300);
R.outside = { closed: !pop(), value: wd.value };
// 6) 코드가 값을 바꾸면(통보문 고르기 등 reflectWhenToPicker) 칸 글자가 따라감
wd.value = '2020-01-05';
R.programmatic = field.textContent;
// 7) 시각 칸 — 시 '14' → 분 '37'(10분 단위 → 30) → change, 알약 18:00, ↑ = 18:10
const wt = $('#wrnTime'), tb = wt._dpt.box, H = tb.querySelector('.dpTH'), M = tb.querySelector('.dpTM');
let tch = 0; wt.addEventListener('change', () => tch++);
// 숨김 창은 포커스 이벤트를 안 보낼 때가 있다 — 실제 창처럼 focusin/focusout을 직접 보낸다(이미 왔으면 두 번째는 아무 일 없음)
H.focus(); if (!document.querySelector('.dpTimePop')) H.dispatchEvent(new FocusEvent('focusin', { bubbles: true })); await sleep(300);
R.timePop = !!document.querySelector('.dpTimePop:not(.closing)');
H.value = '14'; H.dispatchEvent(new Event('input', { bubbles: true })); await sleep(50);
R.timeAdv = document.activeElement === M;
M.value = '37'; M.dispatchEvent(new Event('input', { bubbles: true })); await sleep(50);
R.timeTyped = { value: wt.value, shown: H.value + ':' + M.value, change: tch, ampm: $('.dpTimePop .dpTAmpm').textContent, when: wrnWhen };
$('.dpTimePop .dpTChip[data-t="18:00"]').click(); await sleep(50);
R.timeChip = { value: wt.value, change: tch, on: ($('.dpTimePop .dpTChip.on') || {}).dataset?.t };
key(M, 'ArrowUp'); await sleep(700);
R.timeUp = { value: wt.value, change: tch };
M.blur(); M.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: null })); await sleep(300);
R.timeClosed = !document.querySelector('.dpTimePop:not(.closing)');

// 8) 태풍 '과거 태풍 불러오기' 날짜
await scene('typhoon');
revealSec('typhoon'); await sleep(700);
const det = [...document.querySelectorAll('details.typOther')].find((d) => d.contains($('#typPastDate'))); det.open = true; await sleep(300);
const tp = $('#typPastDate'), tf = tp._dp.field;
let tpc = 0; tp.addEventListener('change', () => tpc++);
tf.scrollIntoView({ block: 'center' }); await sleep(300);
R.typBefore = { value: tp.value, field: tf.textContent };
tf.click(); await sleep(450);
$('.dpPop .dpTitle').click(); await sleep(500);
const ty = $('.dpPop .dpCol[data-k="y"]');
tap([...ty.querySelectorAll('.dpItem')].find((n) => n.textContent === '2019년')); await sleep(200);
const tm = $('.dpPop .dpCol[data-k="m"]');
tap([...tm.querySelectorAll('.dpItem')].find((n) => n.textContent === '9월')); await sleep(200);
$('.dpPop .dpTitle').click(); await sleep(500);
$('.dpPop .dpDay[data-d="2019-09-07"]').click(); await sleep(400);
R.typ = { value: tp.value, field: tf.textContent, change: tpc, closed: !pop() };
return R;
