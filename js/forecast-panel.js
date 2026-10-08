/* [모듈] js/forecast-panel.js — 예보 적용·고르기·목록, 작업 런타임 초기화(resetWorkRuntime), 예보 종류 버튼 */
'use strict';

function applyFct(txt) {
  const rows = parseFct(txt);
  if (!rows.length) {
    alert('예보를 못 읽었습니다. 새 창에 뜬 내용을 그대로 붙여넣었는지 확인해 주세요.');
    return;
  }
  // 붙여넣은 게 지금 고른 종류와 다르면 열 이름으로 알아챈다
  const has = (c) => rows.some((r) => r[c] !== undefined);
  const looks = has('MIN') || has('MAX') ? 'wc' : has('TA') ? 'dl' : has('CONF') || has('RN_ST') ? 'wl' : null;
  if (looks && looks !== fctKind) {
    if (!confirm(`고른 종류는 "${FCT_KINDS[fctKind].label}"인데 붙여넣은 건 "${FCT_KINDS[looks].label}" 같습니다.\n\n"${FCT_KINDS[looks].label}"로 바꿔서 읽을까요?`)) return;
    setFctKind(looks);
  }
  pushUndo();
  fctRows = rows;
  S.fctOff = S.fctOff || {};
  S.fctColors = S.fctColors || {};
  buildFctPickers();
  buildFctList();
  paintFct();
  syncStyleUse();
  status(`${rows.length}줄 읽음 — 발표시각과 예보 시점을 고르세요`);
  // 도착 효과(js/busy-fx.js) — 섹션 머리에 한 번 빛 + 발표·예보 시점 칸과 들어온 예보 줄이 위에서부터 떠오른다(읽기는 바로 끝나 작업 중 효과는 없음)
  fxArrive([fxSec('fct'), $('#fctPickRow'), $('#fctEfRow'), ...fxRows($('#fctList'))]);
}

// 발표시각 / 예보시점 고르는 칸을 데이터에서 만든다
function buildFctPickers() {
  const fcs = [...new Set(fctRows.map((r) => r.TM_FC))].sort();
  const sel = $('#fctTmfc');
  const keepFc = sel.value;
  sel.textContent = '';
  for (const t of fcs) {
    const o = document.createElement('option');
    o.value = t; o.textContent = tmShort(t) + ' 발표';
    sel.append(o);
  }
  sel.value = fcs.includes(keepFc) ? keepFc : fcs[fcs.length - 1]; // 기본은 가장 최근 발표
  $('#fctPickRow').style.display = fcs.length ? '' : 'none';
  buildFctEf();
}
function buildFctEf() {
  const fc = $('#fctTmfc').value;
  const efs = [...new Set(fctRows.filter((r) => r.TM_FC === fc).map((r) => r.TM_EF))].sort();
  const sel = $('#fctTmef');
  const keep = sel.value;
  sel.textContent = '';
  for (const t of efs) {
    const o = document.createElement('option');
    o.value = t; o.textContent = tmShort(t);
    sel.append(o);
  }
  sel.value = efs.includes(keep) ? keep : efs[0];
  $('#fctEfRow').style.display = efs.length ? '' : 'none';
}

// 지금 고른 발표시각 + 예보시점의 줄만
const fctPicked = () => {
  const fc = $('#fctTmfc').value, ef = $('#fctTmef').value;
  return fctRows.filter((r) => r.TM_FC === fc && r.TM_EF === ef);
};

// 예보를 칠할 지도. 예보 지도(시도군/시도) 중 지금 고른 것을 쓰고,
// 특보 지도를 보고 있으면 시도군으로 옮긴다 (특보 지도엔 예보를 칠하지 않는다).
const fctStyle = () => (S.style === 'sgg' || S.style === 'sido' ? S.style : 'sgg');

function paintFct() {
  const st = fctStyle();
  const grain = FCT_KINDS[fctKind].grain;
  const rows = fctPicked();
  const labels = fctLabelList();
  const colOf = {};
  labels.forEach((l, i) => { colOf[l.label] = S.fctColors[l.label] || fctAutoColor(l.label, i, labels.length); });

  // 먼저 '시군 -> 예보문구'로 펼친다. 어느 지도든 여기서 출발한다.
  const bySgg = {};
  let unknown = 0;
  const clash = new Set();
  for (const r of rows) {
    const label = fctLabelOf(r);
    if (label == null || S.fctOff[label]) continue;
    if (!colOf[label]) continue;
    const zones = grain === 'wide' ? FCT_ZONES.wideCity[r.REG_ID] : [fctZoneOf(r.REG_ID)].filter(Boolean);
    if (!zones || !zones.length) { unknown++; continue; }
    for (const z of zones) bySgg[z] = label;
  }

  const F = {};
  if (st === 'sgg') {
    for (const [z, label] of Object.entries(bySgg)) F[z] = colOf[label];
  } else {
    // 시도 지도: 그 시도 안 시군들의 최빈값. 값이 갈리면(강원 영서/영동 등) 알려준다 —
    // 조용히 하나만 고르면 어느 쪽이 나간 건지 알 수가 없다.
    const bySido = {};
    for (const [z, label] of Object.entries(bySgg)) {
      const sido = z.split('/')[0];
      ((bySido[sido] ||= {})[label] ||= 0);
      bySido[sido][label]++;
    }
    for (const [sido, tally] of Object.entries(bySido)) {
      const ent = Object.entries(tally).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
      if (ent.length > 1) clash.add(sido);
      F[sido] = colOf[ent[0][0]];   // 동점이면 이름순 — 응답 순서에 따라 달라지면 안 된다
    }
  }

  S.fillsByStyle[st] = F;
  fctPaintSig[st] = JSON.stringify(F);   // 이 지도의 마지막 칠이 예보였다는 표시(지도 전환 때 다시 칠해도 되는지 판단)
  if (S.style !== st) setStyle(st); else renderFills();

  const parts = [`${Object.keys(F).length}개 구역 칠함`];
  if (unknown) parts.push(`지도에 없는 예보구역 ${unknown}개`);
  if (clash.size) parts.push(`⚠ ${[...clash].join('·')}은 예보가 갈려 넓은 쪽만 — 시도군 지도 권장`);
  $('#fctInfo').textContent = parts.join(' · ');
}

function fctLabelList() {
  const agg = {};
  for (const r of fctPicked()) {
    const l = fctLabelOf(r);
    if (l == null) continue;
    (agg[l] = agg[l] || { label: l, n: 0 }).n++;
  }
  const list = Object.values(agg);
  // 기온은 추운 쪽 -> 더운 쪽 순서라야 색이 자연스럽게 이어진다.
  // 예보문구는 순서가 없으니 많이 나온 것부터.
  return fctKind === 'wc'
    ? list.sort((a, b) => taSort(a.label) - taSort(b.label))
    : list.sort((a, b) => b.n - a.n);
}

function buildFctList() {
  const w = $('#fctList');
  w.textContent = '';
  const list = fctLabelList();
  if (!list.length) return;
  const head = document.createElement('div');
  head.className = 'subhead';
  head.innerHTML = '들어온 예보 <span>· 끄면 안 칠함</span>';
  w.append(head);
  list.forEach((a, i) => {
    const on = !S.fctOff[a.label];
    const col = S.fctColors[a.label] || fctAutoColor(a.label, i, list.length);
    const d = document.createElement('div');
    d.className = 'item';
    d.innerHTML = `<button class="eye${on ? '' : ' off'}"></button>` +
      `<input type="color" style="width:24px;height:20px">` +
      `<div class="nm" style="flex:1;min-width:0"></div>` +
      `<span style="color:var(--on-surface-var)">${a.n}구역</span>`;
    d.querySelector('.nm').textContent = a.label;
    d.querySelector('.nm').style.opacity = on ? '' : '.45';
    d.querySelector('input').value = col;
    d.querySelector('input').oninput = (e) => {
      pushUndo('fc' + a.label);
      S.fctColors[a.label] = e.target.value.toUpperCase();
      paintFct();
    };
    d.querySelector('.eye').onclick = () => {
      pushUndo();
      S.fctOff[a.label] = S.fctOff[a.label] ? 0 : 1;   // 지금 상태를 뒤집는다(실행 취소 뒤 헛클릭 방지)
      buildFctList(); paintFct();
    };
    w.append(d);
  });
}

// 다른 작업을 열거나 새로 시작할 때 — 특보·예보·통보문 런타임(목록·읽어둔 데이터)을 비운다.
// 안 비우면 이전 작업의 특보 목록·예보가 남아, 눈/색/지도 전환 한 번에 새 작업의 칠을 덮어쓴다.
function resetWorkRuntime() {
  wrnRows = []; wrnOrder = []; wrnAllEvents = []; wrnSelFc = ''; wrnLoaded = false;
  buildWrnList();
  { const bs = $('#wrnBulletinSel'); if (bs) bs.textContent = ''; const br = $('#wrnBulletinRow'); if (br) br.style.display = 'none'; }
  { const wi = $('#wrnInfo'); if (wi) wi.textContent = ''; }
  wrnFetchSeq++; showWrnResult(null);   // 진행 중인 불러오기는 버리고(새 작업에 칠하지 않게) 결과 카드도 비운다
  fctRows = []; fctPaintSig = {};
  for (const id of ['#fctTmfc', '#fctTmef']) { const n = $(id); if (n) n.textContent = ''; }
  for (const id of ['#fctPickRow', '#fctEfRow']) { const n = $(id); if (n) n.style.display = 'none'; }
  buildFctList();
  { const fi = $('#fctInfo'); if (fi) fi.textContent = FCT_KINDS[fctKind].hint; }
  bulSpecs = []; renderBulList(); setBulInfo('', []);
  syncStyleUse();
}

function setFctKind(k) {
  fctKind = k;
  for (const b of document.querySelectorAll('#fctKindBtns button')) b.classList.toggle('pri', b.dataset.k === k);
  $('#fctTaRow').style.display = k === 'wc' ? '' : 'none';
  $('#fctInfo').textContent = FCT_KINDS[k].hint;
  syncStyleUse();   // 종류마다 어느 지도가 정확한지가 달라진다
}

function buildFctKindBtns() {
  const w = $('#fctKindBtns');
  w.textContent = '';
  for (const [k, v] of Object.entries(FCT_KINDS)) {
    const b = document.createElement('button');
    // '단기 · 육상' -> '단기 육상' 한 줄(두 줄이면 버튼이 1.5배 높아 보인다 — 세 칸이라 좌우 여백은 CSS에서 조금 줄임)
    b.textContent = v.label.replace(/\s*·\s*/, ' ');
    b.dataset.k = k;
    b.style.cssText = 'flex:1 0 30%; text-align:center';
    b.onclick = () => setFctKind(k);
    w.append(b);
  }
  setFctKind(fctKind);
}
