/* [모듈] js/forecast-panel.js — 예보 적용·고르기·목록, 작업 런타임 초기화(resetWorkRuntime), 특보 불러오기(fetchWrn)·결과 카드·특보 열 */
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
  if (clash.size) parts.push(`⚠ ${[...clash].join('·')}은 안에서 예보가 갈려 가장 넓은 쪽만 나옵니다 — 시도군 지도를 쓰세요`);
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
  head.innerHTML = '들어온 예보 <span>· 끄면 그 구역은 안 칠합니다</span>';
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

// 특보를 '기상청에서 불러오기' — 태풍과 같은 내장 WNS 헬퍼(127.0.0.1:3720) /api/kma 프록시로 CORS 우회.
// (직접 apihub를 부르면 CORS로 막힘.) 예전 수동 프록시(S.wrnProxy)는 입력칸이 없어져 지울 수도 없으므로 읽지 않는다
// (옛 작업·남이 준 파일에 남은 주소로 헬퍼·시각(tm)을 건너뛰고 엉뚱한 특보를 받는 일 방지).
// 불러오기 결과 카드(#wrnResult) — r=null이면 숨김. r: wrnResultView 입력 + retry(다시 시도 함수).
// 정상(발효 0건 포함)은 초록 체크, 오류는 빨간 느낌표 + 원인별 '할 일' 버튼. 알림(#status)도 같은 톤 점으로 짧게 띄운다.
// quiet=true: 카드만 다시 그리고 알림은 안 띄운다(지도 종류 전환·눈 켜고 끄기로 숫자만 다시 맞출 때).
let wrnResLast = null;   // 지금 카드에 보이는 결과(정상 결과면 숫자를 다시 셀 때 쓴다)
function showWrnResult(r, quiet) {
  const box = $('#wrnResult'); if (!box) return;
  wrnResLast = r && r.kind !== 'busy' ? r : null;
  if (!r) { box.hidden = true; box.textContent = ''; delete box.dataset.tone; delete box.dataset.kind; return; }
  const v = wrnResultView({ ...r, desktop: WNS_DESKTOP });
  box.dataset.tone = v.tone; box.dataset.kind = r.kind;
  box.innerHTML = `<div class="wrnResIc">${WRN_ICON[v.tone] || WRN_ICON.info}</div>` +
    '<div class="wrnResBody"><div class="wrnResT"></div><div class="wrnResM"></div><ul class="wrnResL"></ul><div class="wrnResD"></div><div class="wrnResA"></div></div>';
  box.querySelector('.wrnResT').textContent = v.title;
  const put = (sel, txt) => { const n = box.querySelector(sel); if (txt) n.textContent = txt; else n.remove(); };
  put('.wrnResM', v.meta); put('.wrnResD', v.detail);
  const ul = box.querySelector('.wrnResL');
  for (const line of v.lines) { const li = document.createElement('li'); li.textContent = line; ul.append(li); }
  if (!v.lines.length) ul.remove();
  const acts = box.querySelector('.wrnResA');
  const run = {
    retry: () => (r.retry ? r.retry() : fetchWrn()),
    helper: () => wnsHelperOffNotice(),
    helperOld: () => wnsHelperOffNotice('old', 'kma'),   // 기상청 불러오기가 막힌 상황에 맞는 안내(‘지금도 쓸 수 있어요’ 빼고)
    api: () => apiPop(true),
    open: () => $('#wrnOpen').click(),
  };
  for (const a of v.actions) {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = a.label; b.dataset.act = a.id;
    if (a.id === v.actions[0].id) b.className = 'pri';
    b.onclick = (e) => { e.stopPropagation(); run[a.id](); };
    acts.append(b);
  }
  if (!v.actions.length) acts.remove();
  box.hidden = false;
  if (!quiet) status(v.toast, r.kind === 'busy', v.tone === 'busy' ? '' : v.tone);
}
// 정상 결과 카드의 숫자(칠한 구역·바다 구역·꺼 둔 특보·켜 둔 예비)를 지금 지도·눈 상태로 다시 센다.
// 특보 ↔ 특보 + 해상 전환이나 목록 눈 켜고 끄기 뒤에 카드와 목록 아래 안내가 서로 다른 숫자를 말하지 않게.
function wrnRefreshResult() {
  const r = wrnResLast, box = $('#wrnResult');
  if (!r || (r.kind !== 'ok' && r.kind !== 'none') || !box || box.hidden) return;
  showWrnResult({ ...r, ...wrnPaintStats() }, true);
}

// 반환: 칠했으면(발효 0건 포함) true, 못 불러왔으면 false, 더 새 요청에 밀려 버려졌으면 null.
// retry: 결과 카드 '다시 시도'가 부를 함수(통보문 목록에서 고른 경우 그 고르기를 다시 하게). 없으면 같은 인자로 다시 부른다.
// opts.back: 실패하면 호출한 쪽이 날짜·시각 표시를 되돌린다 — 되돌린 시각 표시('지금' 또는 'YYYY.MM.DD HH:MM')를 카드에 함께 쓴다.
async function fetchWrn(keepSel, retry, opts) {
  const again = retry || (() => fetchWrn(keepSel));
  // 기본 인증키를 쓰는 중인지(API 설정 칸이 비었나) — 인증키·횟수 오류 문구를 나눈다
  let defKey = false;
  try { defKey = !(localStorage.getItem(WRN_KEY_STORE) || '').trim(); } catch (e) { /* 저장소를 못 읽으면 개인 키로 본다 */ }
  const extra = { retry: again, back: (opts && opts.back) || '', defKey };
  if (!apiKey()) { if (typeof apiPop === 'function') apiPop(true); showWrnResult({ kind: 'key', noKey: true, src: 'fetch', ...extra }); return false; }
  const seq = ++wrnFetchSeq;
  const stale = () => seq !== wrnFetchSeq;
  const fail = (f) => { if (stale()) return null; showWrnResult({ ...f, ...extra, src: 'fetch' }); return false; };
  showWrnResult({ kind: 'busy' });
  // 헬퍼가 떠 있는지 확인 — 꺼져 있으면 카드 + MXF와 같은 친절한 안내 모달
  const hp = await pingHelper();
  if (stale()) return null;
  if (!hp.up) { fail({ kind: 'helperOff' }); wnsHelperOffNotice(); return false; }
  let r;
  try { r = await fetch(WNS_HELPER + '/api/kma?u=' + encodeURIComponent(WRN_URL())); }
  catch (e) { return fail(wrnHttpFail(0, e && e.message)); }   // 확인 직후 연결이 끊김(확장팩 멈춤 등)
  if (!r.ok) { let b = ''; try { b = await r.text(); } catch (e) { /* 본문 없음 */ } return fail(wrnHttpFail(r.status, b)); }
  let t;
  try {
    // 프록시는 보통 UTF-8로 변환해 준다. 혹시 EUC-KR 원문이 오면 한글이 깨지므로 반대로 한 번 더 디코드.
    const buf = await r.arrayBuffer();
    t = new TextDecoder('utf-8').decode(buf);
    if (!/[가-힣]/.test(t)) t = new TextDecoder('euc-kr').decode(buf);
  } catch (e) { return fail({ kind: 'net', detail: e && e.message }); }
  if (stale()) return null;
  $('#wrnPaste').value = t.slice(0, 200000);
  const read = wrnReadText(t);
  if (read.kind !== 'rows') return fail(read);   // 기상청 오류 문구·빈 응답·형식 이상(표 형식 바뀜 포함) — 지도는 그대로
  return applyWrn(t, keepSel, 'fetch', extra);
}

// 특보 종류별 색 편집 줄
function buildWrnCols() {
  const w = $('#wrnCols');
  w.textContent = '';
  for (const k of Object.keys(S.wrnColors)) {
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `<label>${k}</label>` +
      `<input type="color" data-w="${k}" data-i="0"><input type="text" data-wh="${k}" data-i="0">` +
      `<input type="color" data-w="${k}" data-i="1"><input type="text" data-wh="${k}" data-i="1">`;
    w.append(row);
  }
  w.querySelectorAll('input[type=color]').forEach((n) => {
    n.value = S.wrnColors[n.dataset.w][+n.dataset.i];
    n.oninput = () => {
      pushUndo('wrn' + n.dataset.w + n.dataset.i);
      S.wrnColors[n.dataset.w][+n.dataset.i] = n.value.toUpperCase();
      w.querySelector(`input[data-wh="${n.dataset.w}"][data-i="${n.dataset.i}"]`).value = n.value.toUpperCase();
      if (wrnRows.length) { buildWrnList(); paintWrn(); } // 바꾼 색이 바로 보이게
    };
  });
  w.querySelectorAll('input[type=text]').forEach((n) => {
    n.value = S.wrnColors[n.dataset.wh][+n.dataset.i];
    n.onchange = () => {
      const v = hex(n.value.trim());
      if (!v) { n.value = S.wrnColors[n.dataset.wh][+n.dataset.i]; return; }
      pushUndo();
      S.wrnColors[n.dataset.wh][+n.dataset.i] = v;
      w.querySelector(`input[data-w="${n.dataset.wh}"][data-i="${n.dataset.i}"]`).value = v;
      if (wrnRows.length) { buildWrnList(); paintWrn(); }
    };
  });
}
