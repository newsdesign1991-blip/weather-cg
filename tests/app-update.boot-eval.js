// boot-check --eval 용 본문(async 함수 본문, return 으로 결과). tests/app-update.test.cjs 가 WCG_BOOT_CHECK=1 일 때 돌린다.
// 메인은 점검 모드 + WCG_UPDATE_DIR(임시 시험 폴더 — 가짜 설치 파일 9.9.9 + 옛 판 0.0.1 + latest.json(history)) + WCG_UPDATE_DRYRUN=1(실행 직전까지) + 첫 확인 0.8초.
// 부팅 팝업(공지·둘러보기)을 닫으면 저절로 온 '새 업데이트가 있습니다' 팝업이 뜨고 렌치가 깜빡인다 → [나중에] → 설정(렌치) 메뉴 '앱 업데이트'
// (지금 판·새 판·바뀐 점·내역·되돌리기 목록, 연 뒤에도 깜빡임 유지) → [업데이트하기] → (시작 화면이라 저장 묻기 없음) 진행 막대 → 결과 팝업 →
// 메뉴 [이 판으로 설치](0.0.1) → 확인 팝업 → 진행 → 결과. 실제 창·앱은 끄지 않는다(시험 모드).
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const $ = (s) => document.querySelector(s);
const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { if (fn()) return true; await sleep(100); } return false; };
const titleNow = () => { const t = document.querySelector('#tossOv:not(.popClosing) .tossTitle'); return t ? t.textContent : null; };
const snap = () => {
  const ov = document.querySelector('#tossOv:not(.popClosing)');
  if (!ov) return null;
  return { title: titleNow(), body: (ov.querySelector('.tossBody') || {}).innerText || '', tone: (ov.querySelector('.tossHead') || { dataset: {} }).dataset.tone || '',
    buttons: [...ov.querySelectorAll('.tossFoot button')].map((b) => b.textContent.trim()) };
};
const menuOpen = () => $('#menuDrop').classList.contains('on') && getComputedStyle($('#cfgUpdGroup')).display !== 'none';
const menuSnap = () => {
  const box = $('#updBox');
  return { pill: (box.querySelector('.updPill') || {}).textContent || '', cur: (box.querySelector('.updNowVer') || {}).textContent || '',
    newVer: (box.querySelector('.updNewHead b') || {}).textContent || '', newNotes: [...box.querySelectorAll('.updNewBox li')].map((x) => x.textContent),
    install: !!box.querySelector('[data-upd-act="install"]:not([disabled])'), hist: [...box.querySelectorAll('.updHistHead b')].map((x) => x.textContent),
    rollback: [...box.querySelectorAll('[data-upd-act="rollback"]')].map((b) => b.dataset.ver), visible: menuOpen(),
    histScroll: box.querySelector('.updHist') ? getComputedStyle(box.querySelector('.updHist')).overflowY : '' };
};
// 받기 진행 막대 폭을 기록하며 결과 팝업까지 기다린다
const runInstall = async (click) => {
  const widths = [];
  const mo = new MutationObserver(() => { const w = document.querySelector('#tossOv .updBar i'); if (w && w.style.width) widths.push(w.style.width); });
  mo.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['style'] });
  click();
  await sleep(250);
  const out = { ask: !!document.querySelector('#tossOv .tossCard.closeAsk') };
  await until(() => /설치 직전까지 확인했어요|업데이트하지 못했어요|되돌리지 못했어요|시작했어요/.test(titleNow() || ''), 30000);
  mo.disconnect();
  const bar = document.querySelector('#tossOv .updBar i');
  Object.assign(out, snap(), { bar: bar ? bar.style.width : '', widths, sawProgress: widths.some((w) => parseFloat(w) > 0 && parseFloat(w) < 100) || widths.length >= 2 });
  const ok = document.querySelector('#tossOv [data-ok], #tossOv [data-close]');
  if (ok) ok.click();
  await until(() => !document.querySelector('#tossOv:not(.popClosing)'), 3000);
  return out;
};
const R = {};
const d = window.wcgDesktop || {};
R.api = { updateCheck: typeof d.updateCheck, onUpdate: typeof d.onUpdate, updateInstall: typeof d.updateInstall };
R.groupVisible = !!$('#cfgUpdGroup') && !$('#cfgUpdGroup').hidden;
R.hiddenGroups = ['#cfgPresetGroup', '#cfgMoveGroup'].map((s) => !!$(s) && $(s).hidden);
// 부팅 팝업(공지·둘러보기)을 닫으며 업데이트 팝업을 기다린다(렌더·다른 팝업 뒤에 뜬다)
await until(() => {
  if ($('#tourWrap.on')) $('#tourClose').click();
  const t = titleNow();
  if (t === '새 업데이트가 있습니다') return true;
  if (t) { const x = document.querySelector('#tossOv:not(.popClosing) .tossX'); if (x) x.click(); }
  return false;
}, 25000);
R.auto = snap();
R.badge = { on: $('#helperBtn').classList.contains('updNew'), title: $('#helperBtn').title, anim: getComputedStyle($('#helperBtn')).animationName };
R.badge.infinite = getComputedStyle($('#helperBtn')).animationIterationCount;
R.badge.dot = getComputedStyle($('#helperBtn'), '::after').backgroundColor;
const dangerProbe = document.createElement('span');
dangerProbe.style.color = 'var(--danger)';
document.body.appendChild(dangerProbe);
R.badge.danger = getComputedStyle(dangerProbe).color;
dangerProbe.remove();
const badgeAnimation = $('#helperBtn').getAnimations().find((a) => a.animationName === 'updBreath');
if (badgeAnimation) {
  badgeAnimation.pause();
  badgeAnimation.currentTime = 0;
  R.badge.phase0 = getComputedStyle($('#helperBtn')).color;
  badgeAnimation.currentTime = 1300;
  R.badge.phase1 = getComputedStyle($('#helperBtn')).color;
  badgeAnimation.play();
}
// 애니메이션 색은 oklab, 토큰 색은 rgb로 직렬화될 수 있으므로 실제 sRGB 픽셀로 비교한다.
const badgeColorCanvas = document.createElement('canvas');
badgeColorCanvas.width = badgeColorCanvas.height = 1;
const badgeColorCtx = badgeColorCanvas.getContext('2d');
const badgePixel = (color) => {
  badgeColorCtx.clearRect(0, 0, 1, 1);
  badgeColorCtx.fillStyle = color;
  badgeColorCtx.fillRect(0, 0, 1, 1);
  return [...badgeColorCtx.getImageData(0, 0, 1, 1).data];
};
R.badge.phase1Pixel = badgePixel(R.badge.phase1);
R.badge.dangerPixel = badgePixel(R.badge.danger);
if (!R.auto || R.auto.title !== '새 업데이트가 있습니다') return R;
document.querySelector('#tossOv [data-later]').click();
await until(() => !document.getElementById('tossOv'), 3000);
R.afterLater = !!document.querySelector('#tossOv:not(.popClosing)');
// 설정(렌치) 메뉴 — 나중에 고른 판도 보이고 [업데이트하기]
$('#helperBtn').click();
await until(() => menuOpen() && /새 판/.test(menuSnap().pill), 15000);
await sleep(300);
R.menu = menuSnap();
R.badgeAfterMenu = $('#helperBtn').classList.contains('updNew');
R.install = await runInstall(() => document.querySelector('#updBox [data-upd-act="install"]').click());
R.menuClosedOnInstall = !menuOpen();
// 되돌리기 — 메뉴 [이 판으로 설치] → 확인 팝업 → [되돌리기]
$('#helperBtn').click();
await until(() => menuOpen() && !!document.querySelector('#updBox [data-upd-act="rollback"]'), 15000);
document.querySelector('#updBox [data-upd-act="rollback"]').click();
await until(() => /되돌릴까요/.test(titleNow() || ''), 5000);
R.rbAsk = snap();
R.rollback = await runInstall(() => document.querySelector('#tossOv [data-go]').click());
return R;
