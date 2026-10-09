// Isolated boot-check profile. Real fetch entry/UI/parser/paint; only network is a fixture.
const q = s => document.querySelector(s), pause = ms => new Promise(r => setTimeout(r, ms));
const check = (v, msg) => { if (!v) throw new Error(msg); };
const originalFetch = window.fetch;
const body = '* 예상 강수량(10일)\n- (수도권) 서울.인천.경기: 5~10mm\n* 예상 강수량(11일)\n- (제주도) 제주도: 20~40mm\n* 예상 적설(12일)\n- (강원도) 강원산지: 3~8cm';
const asHtml = b => '<div class="cmp-view-announce"><span>2026년 10월 10일 11:00 발표</span></div><div class="cmp-view-content"><p class="summary">' + b.split('\n').map(l => '<span class="depth_3">' + l + '</span>').join('') + '</p></div>';
let source = body, failure = false;
window.fetch = async function(url, opts) {
  const s = String(url);
  if (s.startsWith(WNS_HELPER + '/ping')) return new Response(JSON.stringify({ok:true, ff:true, ver:20261009}));
  if (s.startsWith(WNS_HELPER + '/api/kma?')) return failure ? new Response('HTTP Error 503', {status:502}) : new Response(asHtml(source));
  return originalFetch.call(this, url, opts);
};
try {
  q('#tourClose')?.click(); q('#tossOv .tossX')?.click(); q('#cgsX')?.click();
  const work = JSON.parse(JSON.stringify(stateForSave())); work.style = 'sgg'; loadProjectData(work, null);
  revealSec('fct'); await pause(600);
  check(q('#bulManual').classList.contains('closed'), '수동 메뉴 기본 접힘');
  const before = JSON.stringify(fills());
  await fetchBulletin();
  const cards = () => [...q('#bulPick').children];
  check(cards().length === 3, '세 묶음을 전부 나열');
  check(cards().map(b => b.querySelector('.bulChoiceName').textContent).join('|') === '10일 · 비|11일 · 비|12일 · 적설(cm)', '원문 순서');
  cards()[1].click();
  check(JSON.stringify(fills()) === before, '불러오기·선택만으로 지도 변경 금지');
  q('#bulPaste').value = '- (수도권) 서울: 100~200mm';
  q('#bulPaintPick').click();
  check(Object.keys(fills()).length > 0 && Object.keys(fills()).every(k => k.includes('제주')), '선택한 제주 묶음 칠하기(수동 칸 무관)');
  check(q('#bulManual').classList.contains('closed'), '수동 메뉴를 열지 않고 칠하기');
  cards()[0].click(); q('#bulPaintPick').click();
  check(Object.keys(fills()).some(k => k.includes('서울')) && !Object.keys(fills()).some(k => k.includes('제주')), '다른 묶음 선택 후 교체');
  cards()[2].click(); q('#bulPaintPick').click();
  check(S.bulKind === 'snow' && Object.keys(fills()).length > 0, '적설 묶음 칠하기');
  await fetchBulletin();
  check(cards()[2].getAttribute('aria-pressed') === 'true', '적설 기본 선택 유지');
  failure = true; const painted = JSON.stringify(fills()); await fetchBulletin();
  check(cards().length === 3 && JSON.stringify(fills()) === painted, '실패는 목록·지도 보존');
  failure = false; source = '□ (종합) 전국 맑음\n○ (오늘) 전국 맑겠습니다.'; await fetchBulletin();
  check(!cards().length && q('#bulPaintPick').disabled && q('#bulPickRow').style.display === 'none', '자료 없음은 선택·칠하기 비우기');
  source = '* 예상 강수량(13일)\n- (제주도) 제주도: 5~10mm'; await fetchBulletin();
  check(cards().length === 1 && q('#bulPickRow').style.display !== 'none' && !q('#bulPaintPick').disabled, '단일 묶음도 바로 칠하기');
  q('#bulManualHead').click(); q('#bulPaste').value = '- (수도권) 서울: 5~10mm'; q('#bulApply').click();
  check(Object.keys(fills()).some(k => k.includes('서울')), '수동 붙여넣기 유지');
  q('#bulManualHead').click(); source = body; await fetchBulletin();
  q('#bulPickRow').scrollIntoView({block:'center',behavior:'instant'}); await pause(600);
  check(q('#bulPick').scrollWidth <= q('#bulPick').clientWidth + 1, '목록 가로 넘침 없음');
  return {ok:true, groups:cards().length, directPaint:true, manualPreserved:true, snow:true, errorsPreserved:true};
} finally { window.fetch = originalFetch; }
