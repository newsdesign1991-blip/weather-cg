// boot-check --eval 용 본문(async 함수 본문, return 으로 결과). tests/app-update.test.cjs 가 WCG_BOOT_CHECK=1 일 때 돌린다.
// 메인은 점검 모드 + WCG_UPDATE_DIR(임시 시험 폴더 — 가짜 설치 파일 9.9.9 + latest.json) + WCG_UPDATE_DRYRUN=1(실행 직전까지) + 첫 확인 0.8초.
// 부팅 팝업(공지·둘러보기)을 닫으면 저절로 온 '새 업데이트가 있습니다' 팝업이 뜬다 → [나중에] → 설정 메뉴 [업데이트 확인]으로 다시 → [지금 설치] →
// (시작 화면이라 저장 묻기 없음) 진행 막대 → 결과 팝업. 실제 창·앱은 끄지 않는다(시험 모드).
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
const R = {};
const d = window.wcgDesktop || {};
R.api = { updateCheck: typeof d.updateCheck, onUpdate: typeof d.onUpdate, updateInstall: typeof d.updateInstall };
R.btnVisible = !!$('#updCheck') && !$('#updCheck').hidden;
// 부팅 팝업(공지·둘러보기)을 닫으며 업데이트 팝업을 기다린다(렌더·다른 팝업 뒤에 뜬다)
await until(() => {
  if ($('#tourWrap.on')) $('#tourClose').click();
  const t = titleNow();
  if (t === '새 업데이트가 있습니다') return true;
  if (t) { const x = document.querySelector('#tossOv:not(.popClosing) .tossX'); if (x) x.click(); }
  return false;
}, 25000);
R.auto = snap();
if (!R.auto || R.auto.title !== '새 업데이트가 있습니다') return R;
document.querySelector('#tossOv [data-later]').click();
await until(() => !document.getElementById('tossOv'), 3000);
R.afterLater = !!document.querySelector('#tossOv:not(.popClosing)');
// 설정 메뉴 [업데이트 확인] — 나중에 고른 판도 보여 준다
$('#updCheck').click();
await until(() => titleNow() === '새 업데이트가 있습니다', 15000);
R.manual = snap();
// [지금 설치] — 진행 막대 폭을 기록
const widths = [];
const mo = new MutationObserver(() => { const w = document.querySelector('#tossOv .updBar i'); if (w && w.style.width) widths.push(w.style.width); });
mo.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['style'] });
document.querySelector('#tossOv [data-install]').click();
await sleep(250);
R.install = { ask: !!document.querySelector('#tossOv .tossCard.closeAsk') };
await until(() => /설치 직전까지 확인했어요|업데이트하지 못했어요|설치를 시작했어요/.test(titleNow() || ''), 30000);
mo.disconnect();
const bar = document.querySelector('#tossOv .updBar i');
Object.assign(R.install, snap(), { bar: bar ? bar.style.width : '', widths, sawProgress: widths.some((w) => parseFloat(w) > 0 && parseFloat(w) < 100) || widths.length >= 2 });
const ok = document.querySelector('#tossOv [data-ok], #tossOv [data-close]');
if (ok) ok.click();
return R;
