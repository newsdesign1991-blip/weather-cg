// boot-check --eval 용 본문(async 함수 본문, return 으로 결과). tests/close-ask.test.cjs 가 WCG_BOOT_CHECK=1 일 때 돌린다.
// 닫기 전 묻기 — 메인의 물음(preload onCloseAsk → closeAsk)을 흉내 내고 답(reply)을 모은다(실제 창은 닫지 않는다).
// 시작 화면·장면 설정만 마친 때는 안 묻고, 칠하면 팝업([저장 안 함][취소][저장]) — 취소·Esc·바깥 클릭 = stay, 저장 안 함 = close,
// [저장]은 저장 위치 고르기(showSaveFilePicker)를 흉내 내 취소 = stay·저장 = close. 끝에 팝업을 하나 띄워 둔다(--shot 이 그 화면을 찍는다).
// 화면 확인용으로 앞에 `const CLOSE_ASK_THEME = 'light';`(또는 'dark')를 붙여 돌리면 그 테마로 찍는다.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const $ = (s) => document.querySelector(s);
const closeBoot = async () => {
  for (let i = 0; i < 12; i++) {   // 둘러보기·공지 등 부팅 팝업 닫기
    if ($('#tourWrap.on')) $('#tourClose').click();
    const x = document.querySelector('#tossOv .tossX'); if (x) x.click();
    await sleep(150);
    if (!$('#tourWrap.on') && !document.getElementById('tossOv')) break;
  }
};
await closeBoot();
const R = {};
R.api = { onCloseAsk: typeof (window.wcgDesktop && window.wcgDesktop.onCloseAsk), closeReply: typeof (window.wcgDesktop && window.wcgDesktop.closeReply) };
const log = [];
const rec = (act, n) => log.push([n, act]);
const pop = () => !!document.querySelector('#tossOv .tossCard.closeAsk');
const gone = async () => { for (let i = 0; i < 30 && document.getElementById('tossOv'); i++) await sleep(60); };   // 닫힘 애니메이션(.34초)
const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { if (fn()) return true; await sleep(100); } return false; };
const step = async (id, act) => { const n0 = log.length; closeAsk(id, rec); await sleep(120); if (act) await act(); return log.slice(n0); };
const btn = (k) => document.querySelector(`#tossOv .tossFoot [data-${k}]`);
const labels = () => [...document.querySelectorAll('#tossOv .tossFoot button')].map((b) => b.textContent.trim());

// 1) 시작 화면에서 끄기 — 안 묻는다(부팅 점검기의 새로고침으로 시작 화면이 안 뜰 수 있어 '새로 시작'으로 띄운다, 확인창은 자동 예)
if (!$('#startOverlay').classList.contains('on')) { const c = window.confirm; window.confirm = () => true; $('#newWork').click(); window.confirm = c; await sleep(700); }
{ const n0 = log.length; closeAsk(1, rec); await sleep(80); R.start = { replies: log.slice(n0), pop: pop() }; }
// 2) 장면 설정만 마치고 끄기 — 안 묻는다
if (!$('#cgSetupOv').classList.contains('on')) { $('#startSetup').click(); await sleep(400); }
$('#resBtns [data-res="1920x1080"]').click(); $('#styleBtns [data-style="sido"]').click(); await sleep(80);
$('#cgsDone').click(); await sleep(1500);
await closeBoot();
{ const n0 = log.length; closeAsk(2, rec); await sleep(80); R.afterSetup = { replies: log.slice(n0), pop: pop() }; }
// 3) 칠하기 — 가장 큰 구역 가운데를 칠하기 모드로 누른다
const paintOnce = async () => {
  $('#mPaint').click(); await sleep(120);
  const z = [...document.querySelectorAll('#gMain > path.zone')].map((el) => ({ el, r: el.getBoundingClientRect() })).sort((a, b) => b.r.width * b.r.height - a.r.width * a.r.height)[0];
  const x = z.r.left + z.r.width / 2, y = z.r.top + z.r.height / 2;
  const pe = (type) => new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: type === 'pointerup' ? 0 : 1, pointerId: 1, isPrimary: true });
  z.el.dispatchEvent(pe('pointerdown')); window.dispatchEvent(pe('pointerup')); await sleep(200);
};
await paintOnce();
R.painted = workDirty();
// 4) 묻기 → 팝업 + wait
{ const r = await step(3); R.ask = { replies: r, title: ($('#tossOv .tossTitle') || {}).textContent, buttons: labels() }; }
// 5) 팝업이 떠 있는데 또 닫기 → 같은 팝업으로 wait
{ const r = await step(4); R.again = { replies: r, pops: document.querySelectorAll('#tossOv').length }; }
// 6) 취소 → stay, 변경은 그대로
{ const n0 = log.length; btn('cancel').click(); await gone(); R.cancel = { replies: log.slice(n0), pop: pop(), dirty: workDirty() }; }
// 7) Esc, 8) 바깥 클릭 = 취소
R.esc = { replies: await step(5, async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await gone(); }), pop: pop() };
R.outside = { replies: await step(6, async () => { const ov = $('#tossOv'); ov.dispatchEvent(new MouseEvent('click', { bubbles: true })); await gone(); }), pop: pop() };
// 9) 저장 안 함 → close
R.discard = { replies: await step(7, async () => { btn('discard').click(); await gone(); }), pop: pop() };
// 10) [저장] — 저장 위치 고르기를 취소 → stay(닫지 않음)
const pickOrig = window.showSaveFilePicker;
window.showSaveFilePicker = async () => { throw new DOMException('사용자 취소', 'AbortError'); };
{ const n0 = log.length; closeAsk(8, rec); await sleep(120); btn('save').click(); await until(() => log.length - n0 >= 2); R.saveAbort = { replies: log.slice(n0), dirty: workDirty() }; }
// 11) [저장] — 저장 → close, 저장 뒤엔 변경 없음
let wrote = false;
window.showSaveFilePicker = async (o) => ({ name: (o && o.suggestedName) || '시험.wcg.png', createWritable: async () => ({ write: async (b) => { wrote = !!(b && b.size > 0); }, close: async () => {} }) });
{ const n0 = log.length; closeAsk(9, rec); await sleep(120); btn('save').click(); await until(() => log.length - n0 >= 2); R.saveOk = { replies: log.slice(n0), dirty: workDirty(), wrote }; }
window.showSaveFilePicker = pickOrig;
await gone();
// 12) 저장 직후 끄기 — 안 묻는다
{ const n0 = log.length; closeAsk(10, rec); await sleep(80); R.afterSave = { replies: log.slice(n0), pop: pop() }; }
// 13) 칠했다 되돌려 저장 시점으로 → 변경 없음
await paintOnce();
const dirtyAfterPaint = workDirty();
$('#undo').click(); await sleep(300);
R.undoBack = { dirtyAfterPaint, dirtyAfterUndo: workDirty() };
// 13b) [저장]이 파일 쓰기에 실패해 내려받기로 넘겼으면 닫지 않는다(곧바로 끄면 받는 중인 파일이 끊긴다) — 내려받기는 흉내(숨은 창에 저장 창이 안 뜨게)
await paintOnce();
projFileHandle = null;   // 시험 프로필 — 처음 저장처럼 위치 고르기부터
const dlOrig = window.download; let dl = 0;
window.download = () => { dl++; };
window.showSaveFilePicker = async () => ({ name: '막힘.wcg.png', createWritable: async () => { throw new DOMException('쓰기 막힘', 'NotAllowedError'); } });
{ const n0 = log.length; closeAsk(13, rec); await sleep(120); btn('save').click(); await until(() => log.length - n0 >= 2); await sleep(100); R.saveDownload = { replies: log.slice(n0), downloads: dl, status: $('#status').textContent }; }
window.download = dlOrig; window.showSaveFilePicker = pickOrig; projFileHandle = null;
{ const n0 = log.length; closeAsk(14, rec); await sleep(80); R.afterDownload = { replies: log.slice(n0), pop: pop() }; }
// 13c) 이미지로 추출·영상 렌더 중 — 변경이 없어도 묻고, 렌더 가리개(#exportMask)보다 위에 뜬다
_exBusy = true;
{ const n0 = log.length; closeAsk(15, rec); await sleep(150); const t = ($('#tossOv .tossTitle') || {}).textContent, b = labels(); btn('cancel').click(); await gone(); R.imageBusy = { title: t, buttons: b, replies: log.slice(n0) }; }
_exBusy = false;
_exportingFrames = true; showExportMask(true); await sleep(400);
{
  const n0 = log.length; closeAsk(16, rec); await sleep(500);
  const c = $('#tossOv .tossCard').getBoundingClientRect(), hit = document.elementFromPoint(c.left + c.width / 2, c.top + c.height / 2);
  const t = ($('#tossOv .tossTitle') || {}).textContent;
  btn('cancel').click(); await gone();
  R.renderBusy = { title: t, onTop: !!(hit && hit.closest('#tossOv')), mask: getComputedStyle($('#exportMask')).display !== 'none', replies: log.slice(n0) };
}
_exportingFrames = false; showExportMask(false); await sleep(400);
// 14) AE로 보내는 중(버튼 잠김) — 변경이 없어도 묻는다
$('#aeSend').disabled = true;
{ const n0 = log.length; closeAsk(11, rec); await sleep(150); const t = ($('#tossOv .tossTitle') || {}).textContent, b = labels(); btn('cancel').click(); await gone(); R.busy = { title: t, buttons: b, replies: log.slice(n0) }; }
$('#aeSend').disabled = false;
// 15) 아래에 확인창(tossConfirm — 문서 캡처 단계 키)이 떠 있어도 키는 물음이 먼저 받는다 — Enter 가 확인창 '예'로 가지 않고, Esc = 물음만 취소
await paintOnce();
let confirmRes = 'pending';
tossConfirm({ title: '시험 확인', message: '시험' }).then((v) => { confirmRes = v; });
await sleep(400);
{
  const n0 = log.length; closeAsk(17, rec); await sleep(500);
  const key = (k) => (document.activeElement || document.body).dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  const focus = document.activeElement && document.activeElement.dataset ? Object.keys(document.activeElement.dataset)[0] || '' : '';
  key('Enter'); await sleep(100);
  const afterEnter = { confirm: confirmRes, pop: pop() };
  key('Escape'); await gone();
  R.keysOnTop = { focus, afterEnter, replies: log.slice(n0), pop: pop(), confirmOpen: $('#confirmOverlay').classList.contains('on'), confirm: confirmRes };
  $('#confirmCancel').click(); await sleep(450);
  R.keysOnTop.confirmAfterCancel = confirmRes;
}
// 끝: 화면 확인용 — (테마를 맞추고) 칠한 뒤 팝업을 띄워 둔다
const want = typeof CLOSE_ASK_THEME === 'string' ? CLOSE_ASK_THEME : '';
for (let i = 0; i < 2 && want && document.documentElement.dataset.theme !== want; i++) { $('#theme').click(); await sleep(300); }
await paintOnce();
if (!workDirty()) await paintOnce();   // 같은 색을 다시 칠하면 지우기 — 저장 시점과 같아졌으면 한 번 더
R.shotDirty = workDirty();
closeAsk(12, () => {}); await sleep(900);
R.shotPop = pop();
R.theme = document.documentElement.dataset.theme || '';
return R;
