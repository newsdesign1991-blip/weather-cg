/* [모듈] js/warnings-load.js — 특보 불러오기(fetchWrn)·결과 카드(showWrnResult), 특보 종류별 색(사이드바 버튼 점 buildWrnCols + 2분할 팝업 openWrnColPop) */
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
    // 수동 길('자동이 안 될 때' — 평소 접힘)은 이번만 펼쳐 보이게 스크롤하고 붙여넣기 칸에 포커스(js/panels.js foldReveal — 펼침 기억은 안 바꿈).
    // 새 창으로 열기도 먼저 펼친다 — 새 창에서 복사해 돌아오면 붙여넣을 칸이 보이고 Ctrl+V가 바로 들어가게.
    paste: () => foldReveal($('#wrnManual'), $('#wrnPaste')),
    open: () => { foldReveal($('#wrnManual'), $('#wrnPaste')); $('#wrnOpen').click(); },
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

// 특보 종류별 색 편집 줄 → 사이드바엔 버튼 하나(#wrnColBtn — 오른쪽 점 = 종류별 경보 색 미리보기)와 '특보 종류별 색' 팝업(#wrnColOv).
// (옛 사이드바 격자 — 종류마다 색 칸 + #hex 두 쌍이 줄줄이 — 를 팝업으로 옮겼다. 2026-10-09 사용자 요청)
// 팝업 = 장면 설정 창과 같은 모양·2분할: 왼쪽 특보 종류(S.wrnColors 키 순서 = '위가 우선' — wrnRank·defaultWrnOrder의 종류 순서),
// 오른쪽 고른 특보의 단계마다 큰 색 칸·#hex·그 색으로 칠한 지도 조각.
// 저장 자리는 옛 격자·들어온 특보 목록과 같다(되돌리기·자동 저장·배치(PRESET_KEYS)·설정 옮기기가 그대로 따라온다):
//   주의보·경보 = S.wrnColors[종류] = [주의보, 경보](옛 격자 자리) · 그 밖의 단계(예비·중대경보 …) = S.wrnLevelColors['종류|단계'](setWrnLevelColor).
//   칠은 wrnColorOf — 정확한 단계 색이 있으면 그것, 없으면 이름에 '경보'가 들어가면 경보 색, 아니면 주의보 색(예비특보 = 주의보 색).
// buildWrnCols = 버튼 점 다시 그리기 + 팝업이 떠 있으면 제자리 갱신. 부팅·배치 적용·처음 보는 특보(회색 추가)·syncPanelFromState(되돌리기·불러오기)가 부른다.
// 팝업은 한 번만 만들어 두고(index.html) class 'on'으로 열고 닫는다. 색 칸을 끄는 동안 칸을 다시 만들면 색 고르기 창이 닫히므로 값만 바꾼다.
const WRN_COL_LV = { 예비: '예비특보' };   // 단계 화면 이름(데이터 LVL '예비')
const WRN_COL_DESC = {
  예비: '발효 전 예고예요 · 들어오면 기본으로 꺼 둬요(들어온 특보에서 눈으로 켜기)',
  주의보: '주의보가 내려진 구역',
  경보: '경보가 내려진 구역 · 같은 종류 주의보보다 위',
  중대경보: '가장 높은 단계 · 경보보다 위',
};
let wrnColPick = '';          // 팝업에서 고른 특보 종류(닫았다 열어도 기억)
let _wrnColOpener = null;     // 팝업을 연 버튼(닫으면 포커스를 돌려준다)
const _wrnChipTpl = {};       // 지도 조각 미리보기 틀(land·sea) — 처음 쓸 때 한 번 만들고 복제해 쓴다
let _wrnLvDef = null;         // 배포 단계색(DEFAULTS().wrnLevelColors — 폭염 중대경보) — 색을 끄는 동안 자주 읽어서 한 번만 만든다
const wrnLvDef = () => (_wrnLvDef ||= DEFAULTS().wrnLevelColors);
function wrnColPopIsOpen() { const ov = document.getElementById('wrnColOv'); return !!(ov && ov.classList.contains('on')); }
// 종류별 배포 기본색 [주의보, 경보] — 처음 보는 특보는 회색(showWrnAsOf가 넣는 값과 같다)
const wrnColDefaultsOf = (k) => (WRN_COLORS[k] || ['#C4C4C4', '#8C8C8C']).slice();
// 이 종류에서 색을 따로 볼 단계 — 예비특보·주의보·경보 + 정해 둔 단계 색(폭염 중대경보 등)·지금 들어온 단계
function wrnColLevelsOf(k) {
  const out = ['예비', '주의보', '경보'];
  const add = (l) => { if (l && !out.includes(l)) out.push(l); };
  for (const key of Object.keys(ensureWrnLevelColors())) { const i = key.indexOf('|'); if (key.slice(0, i) === k) add(key.slice(i + 1)); }
  for (const r of wrnRows) if (r.wrn === k) add(r.lvl);
  return out;
}
// 한 단계의 지금 색·기본색·상태. tag: def(기본색) | mine(바꾼 색) | follow(따로 안 정함 — 주의보·경보 색을 따라감)
function wrnColLevelInfo(k, l) {
  const base = l === '주의보' ? 0 : l === '경보' ? 1 : -1;
  const key = wrnColorKey(k, l);
  const exact = hex(ensureWrnLevelColors()[key]);
  const col = wrnColorOf(k, l) || '#666666';
  const defs = wrnColDefaultsOf(k), defExact = hex(wrnLvDef()[key]);
  const follow = base < 0 && !exact ? (/경보/.test(l) ? '경보' : '주의보') : '';
  const def = base >= 0 ? defs[base] : (defExact || defs[/경보/.test(l) ? 1 : 0]);
  const tag = follow ? 'follow' : (col === def ? 'def' : 'mine');
  const now = wrnRows.filter((r) => r.wrn === k && r.lvl === l && !(S.wrnOff || {})[wrnKeyOf(r)]).length;   // 지금 지도에 칠한(켜 둔) 구역 수
  return { k, l, name: WRN_COL_LV[l] || l, base, col, def, follow, tag, now };
}
// 종류 전체가 배포 기본색 그대로인가(기본색으로 버튼 끄기)
function wrnColIsDefault(k) {
  const d = wrnColDefaultsOf(k), c = (S.wrnColors || {})[k] || [];
  if (hex(c[0]) !== d[0] || hex(c[1]) !== d[1]) return false;
  const defs = wrnLvDef();
  return Object.entries(ensureWrnLevelColors()).every(([key, v]) => key.split('|')[0] !== k || hex(v) === hex(defs[key]));
}
// 색 바꾸기 — 주의보·경보는 옛 격자 자리(S.wrnColors), 들어온 특보 목록에서 정한 같은 단계 색이 있으면 걷는다(고른 색이 그대로 칠해지게).
function wrnColSet(k, l, v) {
  const i = l === '주의보' ? 0 : l === '경보' ? 1 : -1;
  if (i < 0) { setWrnLevelColor(k, l, v); return; }
  if (!Array.isArray(S.wrnColors[k])) S.wrnColors[k] = wrnColDefaultsOf(k);
  S.wrnColors[k][i] = v;
  delete ensureWrnLevelColors()[wrnColorKey(k, l)];
}
// 이 종류만 배포 기본색으로 — 단계 색도 걷고, 배포 단계색(폭염 중대경보)은 ensureWrnLevelColors가 다시 채운다
function wrnColResetType(k) {
  S.wrnColors[k] = wrnColDefaultsOf(k);
  const m = ensureWrnLevelColors();
  for (const key of Object.keys(m)) if (key.split('|')[0] === k) delete m[key];
  ensureWrnLevelColors();
}
// 색을 바꾼 뒤 — 지도·들어온 특보 목록(옛 격자와 같게, paintWrn이 범례까지) + 버튼 점·팝업
function wrnColChanged() {
  if (wrnRows.length) { buildWrnList(); paintWrn(); }
  buildWrnCols();
}
// '#123456' · '123456' · '#abc' → '#123456'꼴(대문자), 아니면 null
function wrnColHexIn(v) {
  let s = String(v == null ? '' : v).trim();
  if (!s.startsWith('#')) s = '#' + s;
  if (/^#[0-9a-fA-F]{3}$/.test(s)) s = '#' + s.slice(1).split('').map((c) => c + c).join('');
  return hex(s);
}

// 지도 조각 미리보기 틀 — 실제 특보 구역 경로 몇 개를 작게(land = 대전 둘레, sea = 남해 바다 — 풍랑). 칠할 구역은 data-k="p".
function wrnColChipTpl(kind) {
  if (_wrnChipTpl[kind]) return _wrnChipTpl[kind];
  const bb = (d) => {
    const n = String(d).match(/-?\d+(?:\.\d+)?/g) || [];
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i + 1 < n.length; i += 2) { const x = +n[i], y = +n[i + 1]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    return [x0, y0, x1, y1];
  };
  const sea = kind === 'sea';
  const land = ((MAP.styles.warn || {}).zones || []).filter((z) => !z.inset).map((z) => ({ z, b: bb(z.d), sea: false }));
  const pool = sea ? (MAP.sea || []).map((z) => ({ z, b: bb(z.d), sea: true })).concat(land) : land;   // 바다 먼저(육지가 위)
  const c0 = pool.find((q) => q.z.id === (sea ? 'S1311200' : 'L1030100')) || pool[0];
  if (!c0) return null;
  const cx = (c0.b[0] + c0.b[2]) / 2, cy = (c0.b[1] + c0.b[3]) / 2;
  const W = sea ? 420 : 230, H = W * 2 / 3, R = sea ? 150 : 56;   // 조각 크기(지도 좌표)·칠할 반경
  const x0 = cx - W / 2, y0 = cy - H / 2;
  const s = document.createElementNS(svgNS, 'svg');
  s.setAttribute('viewBox', [x0, y0, W, H].map((v) => +v.toFixed(1)).join(' '));
  s.setAttribute('preserveAspectRatio', 'xMidYMid slice');
  s.append(el('rect', { 'data-k': 'bg', x: x0, y: y0, width: W, height: H }));
  for (const q of pool) {
    if (q.b[2] < x0 || q.b[0] > x0 + W || q.b[3] < y0 || q.b[1] > y0 + H) continue;
    const d = Math.hypot((q.b[0] + q.b[2]) / 2 - cx, (q.b[1] + q.b[3]) / 2 - cy);
    s.append(el('path', { d: q.z.d, 'data-k': (sea === q.sea && d < R) ? 'p' : (q.sea ? 's' : 'l'), 'vector-effect': 'non-scaling-stroke', 'stroke-width': '.7' }));
  }
  return (_wrnChipTpl[kind] = s);
}
// 조각 색 — 칠한 구역 = 단계 색, 나머지 = 지금 CG의 바다·바탕·경계선 색(실제 지도와 같은 느낌)
function wrnColPaintChip(svgEl, col) {
  for (const n of svgEl.querySelectorAll('[data-k]')) {
    const k = n.getAttribute('data-k');
    if (k === 'bg') { n.setAttribute('fill', S.seaBase || '#2A3A63'); continue; }
    n.setAttribute('fill', k === 'p' ? col : k === 's' ? 'none' : S.base);
    n.setAttribute('stroke', k === 's' ? (S.seaCol || S.stroke) : (S.cgLight && k === 'p' ? col : S.stroke));
  }
}

// 왼쪽 — 특보 종류 목록(종류가 바뀌었을 때만 새로 만들고, 고른 줄·색 점·지도 표시는 제자리 갱신)
function wrnColRenderList() {
  const list = $('#wrnColList'); if (!list) return;
  const keys = Object.keys(S.wrnColors || {});
  const sig = keys.join('\n');
  if (list.dataset.sig !== sig) {
    const had = list.contains(document.activeElement);
    list.textContent = '';
    keys.forEach((k, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'wrnColItem'; b.dataset.k = k;
      b.setAttribute('role', 'tab'); b.setAttribute('aria-controls', 'wrnColDet');
      b.innerHTML = '<span class="wrnColNo"></span><span class="wrnColNm"></span><span class="wrnColOn" hidden>지도에</span><span class="wrnColPair" aria-hidden="true"></span>';
      b.querySelector('.wrnColNo').textContent = i + 1;
      b.querySelector('.wrnColNm').textContent = k;
      b.onclick = () => wrnColSelect(k);
      list.append(b);
    });
    list.dataset.sig = sig;
    list._refocus = had;   // 새로 만들기 전에 목록에 포커스가 있었으면 아래에서 고른 줄로 돌려준다
  }
  const off = S.wrnOff || {};
  const live = new Set(wrnRows.filter((r) => !off[wrnKeyOf(r)]).map((r) => r.wrn));
  for (const b of list.querySelectorAll('.wrnColItem')) {
    const k = b.dataset.k, on = k === wrnColPick;
    b.classList.toggle('on', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
    b.tabIndex = on ? 0 : -1;   // 목록 안은 ↑↓로 옮긴다(Tab 한 번에 목록을 지나간다)
    b.querySelector('.wrnColOn').hidden = !live.has(k);
    const pair = b.querySelector('.wrnColPair'), tip = [];
    pair.textContent = '';
    for (const l of wrnColLevelsOf(k)) {
      const inf = wrnColLevelInfo(k, l);
      if (inf.follow) continue;   // 따로 안 정한 단계(예비특보 등)는 점을 안 찍는다
      const dot = document.createElement('i');
      dot.style.background = inf.col;
      pair.append(dot);
      tip.push(`${inf.name} ${inf.col}`);
    }
    b.title = `${k} — ${tip.join(' · ')}${live.has(k) ? ' · 지금 지도에 칠함' : ''}`;
  }
  if (list._refocus) { list._refocus = false; list.querySelector('.wrnColItem.on')?.focus({ preventScroll: true }); }
}
// 오른쪽 — 고른 특보의 단계 카드(종류·단계 목록이 바뀔 때만 새로 만든다)
function wrnColRenderDet() {
  const k = wrnColPick, box = $('#wrnColLevels'); if (!box) return;
  const act = document.activeElement, keepLv = box.contains(act) ? act.closest('.wrnColLv')?.dataset.lvl : null, keepCls = keepLv ? act.className : '';
  box.textContent = '';
  $('#wrnColDetName').textContent = k ? `${k} 특보` : '';
  const levels = k ? wrnColLevelsOf(k) : [];
  box.dataset.sig = k + '|' + levels.join(',');
  for (const l of levels) {
    const card = document.createElement('div');
    card.className = 'wrnColLv'; card.dataset.lvl = l;
    card.innerHTML = '<input type="color" class="wrnColSw" title="눌러서 색 고르기">' +
      '<div class="wrnColLvTxt"><div class="wrnColLvHead"><b></b><span class="wrnColTag"></span><span class="wrnColNow"></span></div>' +
      '<div class="wrnColLvDesc"></div>' +
      '<div class="wrnColLvHex"><input type="text" class="wrnColHex" maxlength="7" spellcheck="false" autocomplete="off"><span class="wrnColDef"></span></div></div>' +
      '<div class="wrnColChip" aria-hidden="true"></div>';
    const name = `${k} ${WRN_COL_LV[l] || l}`;
    card.querySelector('b').textContent = WRN_COL_LV[l] || l;
    card.querySelector('.wrnColLvDesc').textContent = WRN_COL_DESC[l] || '이 단계가 내려진 구역';
    const tpl = wrnColChipTpl(k === '풍랑' ? 'sea' : 'land');   // 풍랑은 바다에만 내린다
    if (tpl) card.querySelector('.wrnColChip').append(tpl.cloneNode(true));
    const sw = card.querySelector('.wrnColSw'), hx = card.querySelector('.wrnColHex');
    sw.setAttribute('aria-label', `${name} 색 고르기`);
    hx.setAttribute('aria-label', `${name} 색 코드 (#RRGGBB)`);
    // 색 칸 — 끄는 동안 계속 온다: 같은 단계는 한 번의 되돌리기로 묶는다(옛 격자와 같게)
    sw.oninput = () => {
      const v = hex(sw.value.toUpperCase());
      if (!v) return;
      pushUndo('wrncol|' + k + '|' + l);
      wrnColSet(k, l, v); wrnColChanged();
    };
    // #hex — Enter·포커스 이동 때. 잘못 넣으면 지금 색으로 되돌리고 잠깐 빨간 테두리
    hx.onchange = () => {
      const v = wrnColHexIn(hx.value);
      if (!v) { hx.value = hx.dataset.v || ''; hx.classList.remove('bad'); void hx.offsetWidth; hx.classList.add('bad'); clearTimeout(hx._badT); hx._badT = setTimeout(() => hx.classList.remove('bad'), 1400); return; }
      hx.value = v;
      if (v === hx.dataset.v && wrnColLevelInfo(k, l).tag !== 'follow') return;   // 같은 색(따라가던 단계는 같은 색이어도 이 단계 색으로 정한다)
      pushUndo();
      wrnColSet(k, l, v); wrnColChanged();
    };
    hx.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); hx.dispatchEvent(new Event('change')); } };
    box.append(card);
  }
  wrnColSyncDet();
  if (keepLv) box.querySelector(`.wrnColLv[data-lvl="${CSS.escape(keepLv)}"] ${keepCls.includes('wrnColHex') ? '.wrnColHex' : '.wrnColSw'}`)?.focus({ preventScroll: true });
}
// 단계 카드 값만 제자리 갱신(색 칸·#hex·상태·지도 조각) — 색 고르기 창이 열린 채로도 안전
function wrnColSyncDet() {
  const k = wrnColPick, box = $('#wrnColLevels'); if (!box || !k) return;
  for (const card of box.querySelectorAll('.wrnColLv')) {
    const inf = wrnColLevelInfo(k, card.dataset.lvl);
    card.dataset.tag = inf.tag;
    const sw = card.querySelector('.wrnColSw'), hx = card.querySelector('.wrnColHex');
    if (sw.value.toUpperCase() !== inf.col) sw.value = inf.col;
    const editing = document.activeElement === hx && hx.value.trim().toUpperCase() !== (hx.dataset.v || '');   // 고치던 글자는 그대로
    if (!editing) hx.value = inf.col;
    hx.dataset.v = inf.col;
    const tag = card.querySelector('.wrnColTag');
    tag.dataset.tag = inf.tag;
    tag.textContent = inf.tag === 'follow' ? `${inf.follow} 색 따라감` : inf.tag === 'mine' ? '바꾼 색' : '기본색';
    card.querySelector('.wrnColNow').textContent = inf.now ? `지금 ${inf.now}구역` : '';
    card.querySelector('.wrnColDef').textContent = inf.tag === 'mine' ? `기본 ${inf.def}` : inf.tag === 'follow' ? '고르면 이 단계만 따로 칠해요' : '';
    const chip = card.querySelector('.wrnColChip svg');
    if (chip) wrnColPaintChip(chip, inf.col);
  }
}
// 팝업 전체를 지금 상태에 맞춘다(열 때·색을 바꾼 뒤·되돌리기 뒤)
function wrnColSyncPop() {
  const keys = Object.keys(S.wrnColors || {});
  if (!keys.includes(wrnColPick)) {   // 처음엔 지금 지도에 칠한 특보부터
    const live = wrnRows.find((r) => keys.includes(r.wrn));
    wrnColPick = live ? live.wrn : (keys[0] || '');
  }
  wrnColRenderList();
  const box = $('#wrnColLevels');
  if (box && box.dataset.sig !== wrnColPick + '|' + (wrnColPick ? wrnColLevelsOf(wrnColPick) : []).join(',')) wrnColRenderDet();
  else wrnColSyncDet();
  const rs = $('#wrnColReset'); if (rs) rs.disabled = !wrnColPick || wrnColIsDefault(wrnColPick);
  const cnt = $('#wrnColCount'); if (cnt) cnt.textContent = `${keys.length}종`;
}
function wrnColSelect(k, focus) {
  if (!k) return;
  wrnColPick = k;
  wrnColSyncPop();
  const b = $(`#wrnColList .wrnColItem[data-k="${CSS.escape(k)}"]`);
  if (b) { b.scrollIntoView({ block: 'nearest' }); if (focus) b.focus({ preventScroll: true }); }
}

// 사이드바 버튼의 점(앞 6종의 경보 색) + 팝업이 떠 있으면 제자리 갱신
function buildWrnCols() {
  const dots = $('#wrnColDots');
  const keys = Object.keys(S.wrnColors || {});
  if (dots) {
    dots.textContent = '';
    for (const k of keys.slice(0, 6)) { const d = document.createElement('i'); d.style.background = wrnColorOf(k, '경보') || '#666666'; dots.append(d); }
  }
  const b = $('#wrnColBtn'); if (b) b.title = `특보 ${keys.length}종의 단계별 색을 보고 바꿔요`;
  if (wrnColPopIsOpen()) wrnColSyncPop();
}
function openWrnColPop(k) {
  const ov = $('#wrnColOv'); if (!ov) return;
  if (_closeMenu) _closeMenu();   // 열려 있던 드롭다운(프로젝트·설정)은 닫는다
  if (k && (S.wrnColors || {})[k]) wrnColPick = k;
  if (!wrnColPopIsOpen()) _wrnColOpener = document.activeElement;
  ov.classList.add('on'); ov.setAttribute('aria-hidden', 'false');
  document.documentElement.classList.add('wrnColOpen');   // 데스크톱: 막 아래 제목줄을 창 끌기 영역에서 뺀다(바깥 클릭 = 닫기)
  $('#wrnColBtn')?.classList.add('on');
  wrnColSyncPop();
  $(`#wrnColList .wrnColItem.on`)?.scrollIntoView({ block: 'nearest' });
  setTimeout(() => { if (!wrnColPopIsOpen()) return; const f = $('#wrnColList .wrnColItem.on') || ov.querySelector('.cgSetupCard'); try { f.focus({ preventScroll: true }); } catch (e) {} }, 40);
}
function closeWrnColPop() {
  const ov = $('#wrnColOv'); if (!ov || !ov.classList.contains('on')) return;
  ov.classList.remove('on'); ov.setAttribute('aria-hidden', 'true');
  document.documentElement.classList.remove('wrnColOpen');
  $('#wrnColBtn')?.classList.remove('on');
  const back = _wrnColOpener; _wrnColOpener = null;
  if (back && back.focus && document.contains(back) && !$('#tourWrap')?.classList.contains('on')) { try { back.focus({ preventScroll: true }); } catch (e) {} }
}
// 배선(wire()에서 한 번) — 사이드바·떼어낸 창 어디에 있든 버튼 자체에 붙인다(섹션은 옮겨 담을 뿐 다시 만들지 않는다)
function setupWrnColPop() {
  const ov = $('#wrnColOv'); if (!ov) return;
  $('#wrnColBtn').onclick = (e) => { e.stopPropagation(); openWrnColPop(); };
  $('#wrnColX').onclick = closeWrnColPop;
  $('#wrnColDone').onclick = closeWrnColPop;
  $('#wrnColReset').onclick = () => {
    const k = wrnColPick;
    if (!k || wrnColIsDefault(k)) return;
    pushUndo();
    wrnColResetType(k); wrnColChanged();
  };
  // 목록 안 ↑↓·Home·End — 고르면서 옮긴다
  $('#wrnColList').onkeydown = (e) => {
    const items = [...$('#wrnColList').querySelectorAll('.wrnColItem')];
    const i = items.findIndex((b) => b.dataset.k === wrnColPick);
    const to = e.key === 'ArrowDown' ? i + 1 : e.key === 'ArrowUp' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : null;
    if (to == null || !items.length) return;
    e.preventDefault();
    wrnColSelect(items[Math.max(0, Math.min(items.length - 1, to))].dataset.k, true);
  };
  // 바깥(어두운 막) 클릭 = 닫기 — 누른 곳·뗀 곳이 둘 다 막일 때만(장면 설정과 같게)
  let downOnOv = false;
  ov.addEventListener('pointerdown', (e) => { downOnOv = e.target === ov; });
  ov.addEventListener('click', (e) => { if (e.target === ov && downOnOv) closeWrnColPop(); downOnOv = false; });
  // 위에 떠 있는 다른 창(확인창·토스 모달 등)이 먼저 키를 받는다 — 닫히는 중(.popClosing)인 창은 빼고
  const above = () => $('#tourWrap')?.classList.contains('on') || document.querySelector('#tossOv:not(.popClosing)') || $('#confirmOverlay.on:not(.popClosing)') || $('#slotOverlay.on:not(.popClosing)');
  window.addEventListener('keydown', (e) => {
    if (!wrnColPopIsOpen() || above()) return;
    if (e.key === 'Escape') { e.preventDefault(); closeWrnColPop(); return; }
    if (e.key === 'Tab') { popTrapTab(ov.querySelector('.cgSetupCard'), e); return; }
    // Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y — 떠 있는 동안 뒤의 지도 단축키는 막혀 있으므로(pointer-drag) 되돌리기·다시 실행만 여기서.
    // #hex 칸에 고치던 글자가 있으면 그 글자 되돌리기(브라우저 기본)에 맡긴다
    const key = String(e.key || '').toLowerCase();
    if (!(e.ctrlKey || e.metaKey) || (key !== 'z' && key !== 'y')) return;
    const t = e.target;
    if (t && t.classList && t.classList.contains('wrnColHex') && t.value.trim().toUpperCase() !== (t.dataset.v || '')) return;
    e.preventDefault();
    if (key === 'y' || e.shiftKey) redo(); else undo();
  });
}
