// boot-check --eval 용 본문(async 함수 본문, return 으로 결과). tests/map-cards.test.cjs 가 WCG_BOOT_CHECK=1 일 때 돌린다.
// 장면 설정 데이터별 카드 9장 → 구분 지도 → 사이드바 데이터 섹션(맨 위·펼침) → 아트보드 배지·사이드바 구분 줄 → 옛 작업·옛 사이드바 배치를 실제 화면에서 눌러 본다.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
for (let i = 0; i < 12; i++) {
  if ($('#tourWrap.on')) $('#tourClose').click();
  const x = document.querySelector('#tossOv .tossX'); if (x) x.click();
  await sleep(150);
  if (!$('#tourWrap.on') && !document.getElementById('tossOv')) break;
}
const ovOn = () => $('#cgSetupOv').classList.contains('on');
if (!$('#startOverlay').classList.contains('on')) { const c = window.confirm; window.confirm = () => true; $('#newWork').click(); window.confirm = c; await sleep(700); }
const visSecs = () => $$('#panel > .sec').filter((n) => n.style.display !== 'none').map((n) => n.dataset.sec);
const dataSecs = () => ['wrn', 'fct', 'life', 'dust', 'dustFcst'].filter((s) => { const n = $(`#panel > .sec[data-sec="${s}"]`); return n && n.style.display !== 'none'; });
const badge = () => ($('#fctMapBtn').style.display === 'none' ? null : $('#fctMapBtn .unitTxt').textContent);
const openSetup = async () => { if (!ovOn()) ($('#startOverlay').classList.contains('on') ? $('#startSetup') : $('#cgSetupBtn')).click(); await sleep(420); };
const pick = async (card) => { await openSetup(); $('#resBtns [data-res="1920x1080"]').click(); $(`#styleBtns [data-card="${card}"]`).click(); await sleep(60); $('#cgsDone').click(); await sleep(900); };
const R = {};

// 1) 시작 화면 → 장면 설정: 카드 9장, 3열 3줄, 구분 줄 빈 안내
await openSetup();
const cards = $$('#styleBtns .cgsCard');
R.cards = cards.map((b) => b.dataset.card);
R.grid = { rows: new Set(cards.map((b) => Math.round(b.getBoundingClientRect().top))).size, cols: new Set(cards.map((b) => Math.round(b.getBoundingClientRect().left))).size };
R.unitEmpty = $('#cgsUnitVal').textContent;
// 2) 예상 강수·적설 → 구분 줄(시군 173곳) + 칩 → 시도 칩 → 완료
$('#resBtns [data-res="1920x1080"]').click();
$('#styleBtns [data-card="rain"]').click(); await sleep(60);
R.rainPick = { unit: $('#cgsUnitVal').textContent, chips: $$('#cgsUnitChips .cgsUnitChip').filter((c) => !c.hidden).map((c) => c.dataset.style), chipsShown: !$('#cgsUnitChips').hidden };
$('#cgsUnitRow .cgsUnitChip[data-style="sido"]').click(); await sleep(60);
R.sidoChip = { pick: $('#cgsStylePick').textContent, cardStyle: $('#styleBtns [data-card="rain"]').dataset.style, unit: $('#cgsUnitVal').textContent, sub: $('#styleBtns [data-card="rain"] .styleUse').textContent };
$('#cgsDone').click(); await sleep(900);
R.afterSido = { style: S.style };
// 3) 다시 열면 예상 강수·적설(시도)이 골라져 있고, 카드를 다시 눌러도 시도
await openSetup();
{
  const picked = $$('#styleBtns .cgsCard.choicePending').map((b) => b.dataset.card);
  const cardStyle = $('#styleBtns [data-card="rain"]').dataset.style;
  const on = $('#cgsUnitRow .cgsUnitChip.on');
  $('#styleBtns [data-card="rain"]').click(); await sleep(60);
  R.reopenSido = { picked, cardStyle, chipOn: on ? on.dataset.style : null, againStyle: pendingStyle };
}
// 옛 선택자([data-style="sgg"] — 기존 점검들이 쓰는 것)도 그대로 시군을 고른다
$('#styleBtns [data-style="sgg"]').click(); await sleep(60);
$('#cgsDone').click(); await sleep(900);
R.oldSelector = { style: S.style };
// 4) 서울 카드 → 서울 지도, 배지 '동', 데이터 섹션 없음
await pick('seoul');
R.seoul = { style: S.style, badge: badge(), dataSecs: dataSecs() };
// 5) 데이터 지도 3종 — 자기 섹션만·사이드바 맨 위·펼침·구분 줄·배지
R.data = {};
for (const k of ['life', 'dust', 'dustFcst']) {
  await pick(k);
  const sec = $(`#panel > .sec[data-sec="${k}"]`);
  R.data[k] = { style: S.style, dataSecs: dataSecs(), firstSec: visSecs()[0], open: !sec.classList.contains('closed'), row: sec.querySelector('[data-map-unit]').textContent, badge: badge() };
}
// 6) 배지 팝오버 — 예상 강수·적설은 시군/시도 고르기
await pick('rain');
$('#fctMapBtn').click(); await sleep(150);
{
  const opts = $$('#fctMapPop .bmOpt[data-style]').map((b) => b.dataset.style);
  $('#fctMapPop .bmOpt[data-style="sido"]').click(); await sleep(500);
  const after = S.style;
  $('#fctMapBtn').click(); await sleep(150);
  const on = $('#fctMapPop .bmOpt.on');
  R.badgeRain = { opts, after, onAfter: on ? on.dataset.style : null };
  $('#fctMapBtn').click(); await sleep(100);
}
// 사이드바 구분 줄 세그먼트(시군 | 시도)
$('#panel .sec[data-sec="fct"] .mapUnitSeg button[data-style="sgg"]').click(); await sleep(400);
const segBefore = S.style;
$('#panel .sec[data-sec="fct"] .mapUnitSeg button[data-style="sido"]').click(); await sleep(400);
R.sideSeg = { before: segBefore, after: S.style };
// 그 밖 지도는 지금 구분 한 줄 + 장면 설정 열기
await pick('life');
$('#fctMapBtn').click(); await sleep(150);
{
  const info = !!$('#fctMapPop .bmOpt.bmInfo');
  $('#fctMapPop [data-act="setup"]').click(); await sleep(450);
  R.badgeLife = { info, setupOpened: ovOn() };
  $('#cgsX').click(); await sleep(450);
}
// 7) 칠은 지도(키)마다 따로 — 생활기상에 칠한 것이 미세먼지 농도엔 없고, 돌아오면 그대로, 되돌리기
{
  const id = '서울/강남구';
  setActive('#123ABC'); pushUndo(); paint(zoneEls.get(id)[0].el); renderFills();
  const life = fills()[id];
  setStyle('dust'); await sleep(300);
  const dustEmpty = !fills()[id];
  setStyle('life'); await sleep(300);
  const back = fills()[id];
  setStyle('dust'); await sleep(300); undo(); await sleep(300);
  R.fills = { life, dustEmpty, back, undo: S.style };
}
// 7-1) 출력 스모크 — 새 지도 3종에서 이미지로 추출(색칠만·전체 화면)과 AE 보내기 스펙(색칠 레이어 — 제주 인셋 칠 포함). 헬퍼는 fetch만 가로챈 가짜
{
  const caps = [], realFetch = window.fetch;
  const json = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } });
  window.fetch = async (url, opts) => {
    const u = String(url);
    if (/\/ping(\?|$)/.test(u)) return json({ ok: true, ff: true, ver: 20261009 });
    if (u.includes('/api/frame')) return json({ ok: true });
    if (u.includes('/api/ae')) { caps.push(JSON.parse(opts.body)); return json({ ok: true, ae: 'AE test' }); }
    return realFetch(url, opts);
  };
  R.out = {};
  try {
    for (const k of ['life', 'dust', 'dustFcst']) {
      await pick(k);
      const ids = k === 'dustFcst' ? ['서울', '제주', '강원영동'] : ['서울/강남구', '제주/서귀포시', '경기/수원시'];
      pushUndo();
      setActive('#FA2E1E'); paint(zoneEls.get(ids[0])[0].el); paint(zoneEls.get(ids[1])[0].el);
      setActive('#2ECC4A'); paint(zoneEls.get(ids[2])[0].el); renderFills();
      const fl = await exportBlobs('fills'), full = await exportBlobs('full');
      const n0 = caps.length; await sendToAE(); await sleep(300);
      const spec = caps[n0];
      R.out[k] = { fillsPng: fl.length ? fl[0].blob.size > 1000 : false, fullPng: full.length ? full[0].blob.size > 1000 : false,
        ae: spec ? spec.layers.map((l) => l.name).filter((n) => /^색칠_/.test(n)).sort() : null, inset: !!document.querySelector(`#gInsets .zone[data-id="${ids[1]}"]`) };
    }
  } finally { window.fetch = realFetch; }
}
// 8) 태풍 지도엔 배지가 없다(같은 자리에 지도 배경 버튼)
await pick('typhoon');
R.typhoonBadge = { hidden: badge() === null };
// 9) 옛 작업(저장값 style 그대로) → 장면 설정에서 그 카드가 골라져 보인다
R.oldWorks = {};
for (const st of ['seoul', 'sido', 'warnsea', 'typhoon', 'sgg']) {
  const w = JSON.parse(JSON.stringify(stateForSave())); w.style = st;
  loadProjectData(w, null); await sleep(800);
  await openSetup();
  const b = $('#styleBtns .cgsCard.choicePending');
  R.oldWorks[st] = b ? b.dataset.card + (b.dataset.card === 'rain' ? ':' + b.dataset.style : '') : null;
  $('#cgsX').click(); await sleep(450);
}
// 10) 옛 사이드바 배치(secV 없음) → 데이터 섹션은 새 자리(맨 위), 범례는 제목 텍스트 밑 / 새 판 배치는 사용자 순서 그대로
const keepSide = dockSide;
localStorage.setItem('wcg_layout', JSON.stringify({ docked: ['res', 'text', 'legend', 'wrn', 'fct', 'pal', 'sea', 'label', 'mtn', 'map'], wins: [], dockSide: keepSide, toolbarV: 3 }));
loadLayout(); await sleep(100);
{
  const o = $$('#panel > .sec').map((n) => n.dataset.sec);
  saveLayout();
  R.layoutOld = { order: o, wrnBeforeRes: o.indexOf('wrn') < o.indexOf('res'), lifeBeforeRes: o.indexOf('life') < o.indexOf('res'), legendAfterText: o[o.indexOf('text') + 1] === 'legend', savedV: JSON.parse(localStorage.getItem('wcg_layout')).secV };
}
localStorage.setItem('wcg_layout', JSON.stringify({ docked: ['life', 'dust', 'dustFcst', 'fct', 'res', 'text', 'legend', 'pal', 'sea', 'label', 'mtn', 'map', 'wrn'], wins: [], dockSide: keepSide, toolbarV: 3, secV: 2 }));
loadLayout(); await sleep(100);
{
  const o = $$('#panel > .sec').map((n) => n.dataset.sec).filter((s) => SEC_ORDER.includes(s));
  R.layoutNew = { order: o, wrnLast: o[o.length - 1] === 'wrn' };
}
resetLayout(); await sleep(100);
return R;
