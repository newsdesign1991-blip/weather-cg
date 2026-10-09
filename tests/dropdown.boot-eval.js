// boot-check --eval 용 본문(async 함수 본문, return 으로 결과). tests/dropdown.test.cjs 가 WCG_BOOT_CHECK=1 일 때 돌린다(일회용 점검 프로필 — 사용자 작업 아님).
// 드롭다운(js/dropdown.js) 실제 흐름: 모든 select가 숨고 옆에 칸이 붙었는가 → 타임라인 fps(#tlFps — 도구 줄, 목록이 위로)·통보문 날짜(#bulPick — 사이드바 배율)·
// 태풍 비교 카드 이름표 글꼴(다시 그린 카드)·토스 모달 안 select(optgroup·막힌 항목·겹침)에서 열기·키·고르기(input·change 1번씩 → 기존 리스너)·Esc·바깥 닫기,
// 코드가 value·selectedIndex·옵션·disabled·숨김을 바꾸면 칸이 따라가는가.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const pop = () => document.querySelector('.ddPop:not(.closing)');
const key = (el, k, o = {}) => el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...o }));
const cur = (sel) => sel._dd.field.querySelector('.ddCur').textContent;
const rows = () => $$('.ddPop:not(.closing) .ddOpt');
const act = () => { const r = $('.ddPop:not(.closing) .ddOpt.act'); return r ? r.querySelector('.ddOptTx').textContent : null; };
const counter = (sel) => { const c = { input: 0, change: 0 }; sel.addEventListener('input', () => c.input++); sel.addEventListener('change', () => c.change++); return c; };
// 숨은 창은 프레임이 안 돌아 움직임(섹션 펼침 전환·목록 여는 움직임)이 멈춰 있을 수 있다 — 끝 모양으로 맞추고 잰다(root = 그 안의 것만)
const settle = (root) => (root ? root.getAnimations({ subtree: true }) : document.getAnimations()).forEach((a) => { try { a.finish(); } catch (e) {} });
// 목록 자리 — 칸 바로 아래 또는 위에 붙고(6px 안), 화면 안, 칸 왼쪽에 맞춤, 칸보다 좁지 않음
const placeOf = (p, f) => {
  settle(p);
  const fr = f.getBoundingClientRect(), pr = p.getBoundingClientRect();
  return { side: p.dataset.side, below: pr.top >= fr.bottom - 1 && pr.top - fr.bottom <= 6, above: pr.bottom <= fr.top + 1 && fr.top - pr.bottom <= 6,
    inView: pr.top >= 0 && pr.left >= 0 && pr.right <= innerWidth && pr.bottom <= innerHeight, gap: Math.round(pr.top >= fr.bottom - 1 ? pr.top - fr.bottom : fr.top - pr.bottom), alignLeft: Math.abs(pr.left - fr.left) <= 1, minW: pr.width >= fr.width - 1 };
};
const R = {};
try {
  for (let i = 0; i < 12; i++) {
    if ($('#tourWrap.on')) $('#tourClose').click();
    const x = document.querySelector('#tossOv .tossX'); if (x) x.click();
    await sleep(150);
    if (!$('#tourWrap.on') && !document.getElementById('tossOv')) break;
  }
  const scene = async (style) => {
    if ($('#startOverlay').classList.contains('on')) $('#startSetup').click(); else $('#cgSetupBtn').click();
    await sleep(500);
    $('#resBtns [data-res="1920x1080"]').click(); $(`#styleBtns [data-style="${style}"]`).click(); await sleep(80);
    $('#cgsDone').click(); await sleep(1500);
    for (let i = 0; i < 6; i++) { const x = document.querySelector('#tossOv .tossX'); if (x) { x.click(); await sleep(300); } }
  };

  // 0) 붙었는가 — 모든 select가 숨고(.ddSrc) 바로 뒤에 칸, 시스템 드롭다운 남김 없음
  R.attached = $$('select').map((n) => ({ id: n.id || Object.keys(n.dataset).join(','), dd: !!n._dd, hidden: getComputedStyle(n).display === 'none', next: n.nextElementSibling === (n._dd && n._dd.field), role: n._dd && n._dd.field.getAttribute('role') }));
  await scene('warn');

  // 1) 타임라인 fps — 도구 줄(창 아래쪽). 키로 열고 ↓·End·Home·Enter, 글자로 찾기, 코드가 값 바꾸면 칸 갱신, 폭 고정
  if (!$('#timeline').classList.contains('on')) $('#tlToggle').click();
  await sleep(700);
  const fps = $('#tlFps'), ff = fps._dd.field, fpsEv = counter(fps);
  const fps0 = fps.value, w0 = Math.round(ff.getBoundingClientRect().width);
  settle(); ff.focus();
  key(ff, 'ArrowDown'); await sleep(260);
  const p1 = pop();
  R.fpsOpen = {
    pop: !!p1, place: p1 ? placeOf(p1, ff) : null, fieldW: w0,
    rows: rows().length, on: ($('.ddPop .ddOpt.on .ddOptTx') || {}).textContent, act: act(), expanded: ff.getAttribute('aria-expanded'),
    activedesc: !!ff.getAttribute('aria-activedescendant') && !!document.getElementById(ff.getAttribute('aria-activedescendant')),
    checkShown: getComputedStyle($('.ddPop .ddOpt.on .ddCheck')).opacity === '1', focus: document.activeElement === ff,
    z: p1 ? +getComputedStyle(p1).zIndex : 0,
  };
  key(ff, 'ArrowDown'); const actDown = act();
  key(ff, 'End'); const actEnd = act();
  key(ff, 'Home'); const actHome = act();
  key(ff, 'ArrowDown');
  key(ff, 'Enter'); await sleep(200);
  R.fpsPick = { act: [actDown, actEnd, actHome], value: fps.value, field: cur(fps), fps: anim().fps, ev: { ...fpsEv }, closed: !pop(), focus: document.activeElement === ff, w: Math.round(ff.getBoundingClientRect().width) === w0 };
  // 글자로 찾기 — 닫힌 칸에서 '2' → 열리며 '25 (PAL)'(지금 '30' 다음의 2로 시작), 한 번 더 '2' → '24'. Esc = 값 그대로 닫기
  key(ff, '2'); await sleep(200); const t1 = act();
  key(ff, '2'); const t2 = act();
  key(ff, 'Escape'); await sleep(200);
  R.fpsType = { t1, t2, closed: !pop(), value: fps.value, ev: fpsEv.change };
  // 코드가 바꾸면 칸이 따라감 — value·selectedIndex
  fps.value = '25'; const progA = cur(fps);
  fps.selectedIndex = 0; const progB = cur(fps);
  R.fpsProg = [progA, progB, fpsEv.change];
  // 마우스 — 칸 누르기 → 항목 누르기, 같은 항목을 다시 고르면 change 없음
  ff.click(); await sleep(250);
  rows().find((r) => r.textContent === '60').click(); await sleep(200);
  ff.click(); await sleep(250);
  rows().find((r) => r.textContent === '60').click(); await sleep(200);
  R.fpsMouse = { value: fps.value, fps: anim().fps, change: fpsEv.change, closed: !pop() };
  fps.value = fps0; fps.dispatchEvent(new Event('change', { bubbles: true }));
  $('#tlClose').click(); await sleep(300);

  // 2) 통보문 날짜(#bulPick) — 예보 지도(시군구)의 사이드바: 배율(zoom)을 카드가 따르고, 칸 아래로 열림. 고르면 기존 리스너(bulPickFill)가 붙여넣기 칸을 채움
  await scene('sgg');
  revealSec('fct'); await sleep(700);
  const groups = [
    { kind: 'rain', when: '10일', body: ['서울.인천.경기: 5~10mm'] },
    { kind: 'shower', when: '10일', body: ['강원영서: 5~20mm'] },
    { kind: 'rain', when: '11일 오전', body: ['충청권: 10~40mm'] },
  ];
  bulFillPick(groups); await sleep(150);
  const bp = $('#bulPick'), bf = bp._dd.field, bpEv = counter(bp);
  settle(); bf.scrollIntoView({ block: 'center', behavior: 'instant' }); await sleep(400); settle();
  R.bulStart = { field: cur(bp), opts: bp.options.length, shown: !bf.hidden && bf.getClientRects().length > 0, paste: $('#bulPaste').value.split('\n')[0] };
  bf.click(); await sleep(300);
  const p2 = pop();
  R.bulOpen = {
    pop: !!p2, place: p2 ? placeOf(p2, bf) : null,
    zoom: p2 && +p2.querySelector('.ddCard').style.zoom, fieldZoom: +(bf.currentCSSZoom || 1).toFixed(3), rows: rows().map((r) => r.textContent), act: act(),
    rowH: rows()[0] ? Math.round(rows()[0].getBoundingClientRect().height / (bf.currentCSSZoom || 1)) : 0,
  };
  rows()[3].click(); await sleep(250);
  R.bulPick = { value: bp.value, field: cur(bp), paste: $('#bulPaste').value.split('\n')[0], ev: { ...bpEv }, closed: !pop() };
  // Esc·바깥 누르기 = 닫기(값 그대로), 다시 누르면 닫기(토글)
  bf.click(); await sleep(250); key(bf, 'ArrowUp'); key(bf, 'Escape'); await sleep(200);
  const escR = { closed: !pop(), value: bp.value, focus: document.activeElement === bf };
  bf.click(); await sleep(250); document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); await sleep(200);
  const outR = { closed: !pop(), value: bp.value };
  bf.click(); await sleep(250); bf.click(); await sleep(200);
  R.bulClose = { esc: escR, outside: outR, toggle: !pop(), change: bpEv.change };
  // 옵션 다시 채우기(MutationObserver) — 다른 통보문 → 글자·폭 갱신, 열린 채 바뀌어도 목록이 따라감
  bf.click(); await sleep(250);
  bulFillPick([{ kind: 'rain', when: '12일', body: ['제주도: 5~10mm'] }, { kind: 'snow', when: '13일', body: ['강원산지: 1~5cm'] }]); await sleep(120);
  R.bulRefill = { field: cur(bp), rows: rows().map((r) => r.textContent), stillOpen: !!pop() };
  key(bf, 'Escape'); await sleep(200);
  // 막기·숨기기 — select.disabled / style.display / 줄 숨김
  bp.disabled = true; await sleep(60); bf.click(); await sleep(200);
  const dis = { field: bf.disabled, opened: !!pop() };
  bp.disabled = false; bp.style.display = 'none'; await sleep(60);
  const hid = bf.hidden && !bf.getClientRects().length;
  bp.style.display = ''; await sleep(60);
  bulResetPick(); await sleep(80);
  R.bulState = { dis, hid, back: !bf.hidden, reset: { rowHidden: $('#bulPickRow').style.display === 'none', field: cur(bp), visible: bf.getClientRects().length > 0 } };

  // 3) 토스 모달 안 select(나중에 생긴 칸 — boot 관찰자) — optgroup 제목·막힌 항목 건너뛰기·모달 위 겹침, Esc는 목록만 닫음
  tossModal({ title: '드롭다운 점검', bodyHTML: '<div class="row"><label for="ddProbe">고르기</label><select id="ddProbe"><optgroup label="첫 묶음"><option value="a">하나</option><option value="b" disabled>둘</option></optgroup><optgroup label="둘째 묶음"><option value="c">셋</option><option value="d">넷</option></optgroup></select></div>' });
  await sleep(200);
  const pr = $('#ddProbe'), pf = pr._dd && pr._dd.field, prEv = counter(pr);
  R.modal = { attached: !!pf, inModal: !!pf && !!pf.closest('#tossOv') };
  pf.click(); await sleep(300);
  R.modal.groups = $$('.ddPop:not(.closing) .ddGrp').map((g) => g.textContent);
  R.modal.dis = $$('.ddPop:not(.closing) .ddOpt.dis').map((r) => r.textContent);
  R.modal.above = +getComputedStyle(pop()).zIndex > +getComputedStyle($('#tossOv')).zIndex;
  const top = document.elementFromPoint(rows()[0].getBoundingClientRect().left + 10, rows()[0].getBoundingClientRect().top + 8);
  R.modal.hit = !!top && !!top.closest('.ddPop');
  key(pf, 'ArrowDown'); R.modal.skip = act();
  key(pf, 'Escape'); await sleep(200);
  R.modal.escOnlyList = !pop() && !!$('#tossOv:not(.popClosing)');
  // 라벨 누르기 = 칸에 포커스, 닫힌 칸 ↓ = 열기 → Enter
  $('label[for="ddProbe"]').click(); R.modal.labelFocus = document.activeElement === pf;
  key(pf, 'ArrowDown'); await sleep(200); key(pf, 'ArrowDown'); key(pf, 'Enter'); await sleep(200);
  R.modal.pick = { value: pr.value, field: cur(pr), ev: { ...prEv } };
  closeTossModal(); await sleep(100);

  // 4) 태풍 비교 카드 — 다시 그린 카드의 select(이름표 글꼴)도 붙고, 고르면 기존 리스너(c.labelFont)
  const saved = JSON.parse(JSON.stringify(stateForSave()));
  saved.style = Object.keys(MAP.styles).find((k) => MAP.styles[k].compare);
  const pts = [{ lon: 130, lat: 20, ws: 30, tmef: '202610080000', fcst: false }, { lon: 132, lat: 24, ws: 30, tmef: '202610090000', fcst: false }];
  saved.typhoon = { ...typhoonStyleDefaults(), name: '점검', issues: [{ tmfc: '202610090000', label: '점검', points: pts }], sel: 0, compare: [{ id: 'ddone', name: '점검 태풍', color: '#F05050', show: 1, showIcons: 1, iconScale: 1, points: pts }] };
  loadProjectData(saved, null); await sleep(600);
  revealSecTarget({ cmp: 'ddone' }); await sleep(600);
  const fontSel = () => $('[data-cmpsec="ddone"] [data-namefont]');
  const fs1 = fontSel(), ffo = fs1._dd.field;
  settle(); ffo.scrollIntoView({ block: 'center', behavior: 'instant' }); await sleep(400); settle();
  ffo.click(); await sleep(300);
  const fontRows = rows().map((r) => r.textContent);
  rows().find((r) => r.textContent === '맑은 고딕').click(); await sleep(250);
  const lf = S.typhoon.compare[0].labelFont;
  buildCompareSection(); await sleep(150);
  const fs2 = fontSel();
  R.cmp = { rows: fontRows, labelFont: lf, rebuilt: fs2 !== fs1, attached: !!fs2._dd && fs2.nextElementSibling === fs2._dd.field, field: cur(fs2), mode: cur($('[data-cmpsec="ddone"] [data-cmpiconmode]')) };

  // 5) 남김 없음 — 지금 문서의 모든 select
  R.final = $$('select').every((n) => n._dd && getComputedStyle(n).display === 'none' && n.nextElementSibling === n._dd.field);
  R.leftover = $$('.ddPop').length;
} catch (e) { R.error = String(e && e.stack || e); }
return R;
