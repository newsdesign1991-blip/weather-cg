/* [모듈] js/warnings-load.js — 특보 불러오기(fetchWrn)·결과 카드(showWrnResult), 특보 열(buildWrnCols) */
'use strict';

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
  // 작업 중 효과(js/busy-fx.js) — 섹션에 흐르는 그라디언트·불러오기 버튼 흐름·특보 목록 자리에 빛 훑는 막대.
  // 겹친 요청(날짜를 빨리 바꿈)은 센다 — 버려진 요청·실패도 finally에서 끄고, 마지막 요청이 끝나야 꺼진다.
  const fx = [fxSec('wrn'), $('#wrnFetch'), $('#wrnList')];
  fxBusy(fx, true, { lines: 5, maxMs: 90000 });
  let ok = false;
  try {
    // 헬퍼가 떠 있는지 확인 — 꺼져 있으면 카드 + MXF와 같은 친절한 안내 모달
    const hp = await pingHelper();
    if (stale()) return (ok = null);
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
    if (stale()) return (ok = null);
    $('#wrnPaste').value = t.slice(0, 200000);
    const read = wrnReadText(t);
    if (read.kind !== 'rows') return fail(read);   // 기상청 오류 문구·빈 응답·형식 이상(표 형식 바뀜 포함) — 지도는 그대로
    return (ok = applyWrn(t, keepSel, 'fetch', extra));
  } finally {
    fxBusy(fx, false);
    // 도착 효과 — 칠했으면(발효 0건 포함) 섹션 머리에 한 번 빛 + 결과 카드·들어온 특보 줄이 위에서부터 떠오른다
    if (ok === true) fxArrive([fxSec('wrn'), $('#wrnResult'), ...fxRows($('#wrnList'))]);
  }
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
