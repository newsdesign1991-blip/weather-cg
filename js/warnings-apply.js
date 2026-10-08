/* [모듈] js/warnings-apply.js — 기상청 API 주소·키(apiKey·apiUrl — 예보·태풍도 씀), 특보 런타임 목록·순서, 특보 적용(applyWrn)·칠(paintWrn)·발효 현황·목록(buildWrnList) */
'use strict';
// ===================== API 주소 =====================
// 기상청이 주소를 바꿔도 사용자가 직접 갈아끼울 수 있게 전부 설정으로 뺐다.
// 인증키와 주소는 작업 내용이 아니라 '이 컴퓨터 설정'이라 localStorage에만 둔다
// (작업 파일에 넣으면 남에게 파일을 주는 순간 인증키까지 같이 넘어간다).
const WRN_KEY_STORE = 'wcg_apikey';
// 기본 내장 인증키 — API를 모르는 사람도 바로 쓸 수 있게 발급받은 키를 넣어 둔다.
// 직접 발급받은 키를 API 설정에 넣으면 그게 우선한다(개인 키가 있으면 할당량을 안 나눠 쓴다).
const DEFAULT_API_KEY = 'NLhz0yHAS2y4c9MhwJtsfA';
const API_SITE = 'https://apihub.kma.go.kr/';
const API_BASE = 'https://apihub.kma.go.kr/api/typ01/url/';
const API_URLS = {
  // tm을 비우면 지금, 넣으면 그 시각의 특보현황이 나온다 (과거 조회가 이걸로 된다)
  wrnNow:  API_BASE + 'wrn_now_data.php?fe=e&tm={TM}&disp=0&help=1&authKey={KEY}',   // fe=e = 실제 '발효현황'(KMA 발효현황 지도와 동일 기준). ⚠️fe=f는 같은 시각에도 발효현황이 달라짐(예: 8/3 17:00 서울 4권역→2권역) → 색칠이 KMA와 안 맞음. tm=고른시각으로 '재요청'하면 그 시각(미래 포함) 발효현황을 기상청이 계산해 준다.
  fctLand: API_BASE + 'fct_afs_dl.php?reg=&tmfc1={TM1}&tmfc2={TM2}&disp=0&help=1&authKey={KEY}',
  fctSea:  API_BASE + 'fct_afs_do.php?reg=&tmfc1={TM1}&tmfc2={TM2}&disp=0&help=1&authKey={KEY}',
  fctMedLand: API_BASE + 'fct_afs_wl.php?reg=&tmfc1={TM1}&tmfc2={TM2}&disp=0&help=1&authKey={KEY}',
  fctMedTa:   API_BASE + 'fct_afs_wc.php?reg=&tmfc1={TM1}&tmfc2={TM2}&disp=0&help=1&authKey={KEY}',
  fctReg:  API_BASE + 'fct_shrt_reg.php?tmfc=0&authKey={KEY}',
};
const apiKey = () => ((localStorage.getItem(WRN_KEY_STORE) || '').trim() || DEFAULT_API_KEY);

const apiPop = (on) => {
  $('#apiPop').classList.toggle('on', on);
  $('#apiGear').classList.toggle('on', on);
  if (on) $('#apiKey').focus();
};

// 인증키가 없으면 특보·예보 항목에 안내를 띄우고 톱니바퀴에 빨간 점을 찍는다.
// 키를 넣는 곳이 한 군데(API 설정)뿐이라, 없을 때 어디로 가야 하는지 알려주지 않으면 막힌다.
function syncKeyWarn() {
  const has = !!apiKey();
  for (const n of document.querySelectorAll('[data-nokey]')) {
    n.classList.toggle('on', !has);
    n.closest('.sec')?.classList.toggle('nokeyed', !has);
  }
  $('#apiGear').classList.toggle('warn', !has);
}

// {KEY}/{TM}/{TM1}/{TM2} 를 채워 실제 주소를 만든다
function apiUrl(which, vals) {
  let u = API_URLS[which];
  const v = Object.assign({ KEY: apiKey(), TM: '', TM1: '', TM2: '' }, vals);
  for (const k of Object.keys(v)) u = u.split('{' + k + '}').join(encodeURIComponent(v[k]));
  return u;
}

// 특보를 볼 시각. 빈 문자열이면 '지금'.
let wrnWhen = '';
const WRN_URL = () => apiUrl('wrnNow', { TM: wrnWhen });

// 마지막으로 읽어들인 특보. 목록에서 체크를 바꾸면 이걸로 다시 칠한다.
let wrnRows = [];
let wrnOrder = [];

function currentTm() {
  const d = new Date();
  const p = (v) => String(v).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}`;
}

// 겹침 우선순위 — 낮을수록 이긴다.
// 종류 순서(색 목록 순서)가 1순위, 같은 종류면 경보가 주의보를 이긴다.
// 이렇게 안 하면 "응답에 먼저 나온 것"이 이겨서 색이 들쭉날쭉해진다.
function wrnRank(r) {
  const ordered = wrnOrder.indexOf(wrnKeyOf(r));
  if (ordered >= 0) return ordered;
  const keys = Object.keys(S.wrnColors);
  const ti = keys.indexOf(r.wrn);
  return wrnOrder.length + (ti < 0 ? 999 : ti) * 10 + (/경보/.test(r.lvl) ? 0 : 1);
}

// 특보 지도 재오픈 복원 — wrnRows/wrnOrder는 런타임 변수라 저장/로드 때 사라져, 재오픈하면 특보 목록이 비고
// 색·on/off 편집이 안 먹었다. 저장된 S.wrnActive(+S.wrnOrder)로 목록·순서만 재구성한다.
// (지도에 칠해진 색은 이미 저장된 S.fillsByStyle로 renderFills가 그렸으므로 여기선 다시 칠하지 않는다 — 수동 클릭 색 보존)
function restoreWrnRuntime() {
  if (S.style !== 'warn' && S.style !== 'warnsea') return;
  if (wrnRows.length) return;                            // 이미 불러온 특보가 있으면 건드리지 않음
  const saved = S.wrnActive;
  if (!Array.isArray(saved) || !saved.length) return;
  wrnRows = saved.map((r) => ({ id: r.id, wrn: r.wrn, lvl: r.lvl, tmfc: r.tmfc, tmef: r.tmef }));
  wrnOrder = (Array.isArray(S.wrnOrder) && S.wrnOrder.length) ? S.wrnOrder.slice() : defaultWrnOrder(wrnRows, Object.keys(S.wrnColors));
  buildWrnList();   // 목록만 다시 그린다(색칠은 그대로)
}
// 실행 취소/다시 실행 뒤 — 특보·예보 목록(런타임)을 되돌린 S에 맞춘다(목록 눈·순서가 상태와 어긋나지 않게).
function syncRuntimeListsFromState() {
  if (wrnRows.length || S.style === 'warn' || S.style === 'warnsea') {
    wrnRows = Array.isArray(S.wrnActive) ? S.wrnActive.map((r) => ({ id: r.id, wrn: r.wrn, lvl: r.lvl, tmfc: r.tmfc, tmef: r.tmef })) : [];
    wrnOrder = (Array.isArray(S.wrnOrder) && S.wrnOrder.length) ? S.wrnOrder.slice() : defaultWrnOrder(wrnRows, Object.keys(S.wrnColors || {}));
    S.wrnOff = S.wrnOff || {};
    buildWrnList();
    showWrnResult(null);   // 마지막 불러오기 결과 카드는 되돌린 상태와 안 맞을 수 있어 접는다(목록·0건 카드는 S를 따라간다)
  }
  S.fctOff = S.fctOff || {}; S.fctColors = S.fctColors || {};
  buildFctList();
}

let wrnAllEvents = [];   // 불러온 모든 특보 이벤트(발표/해제 등) — 통보문 드롭다운·발표시각 재생에 쓴다
let wrnSelFc = '';       // 지금 지도에 표출 중인 '발효시각(통보문)'
let wrnLoaded = false;   // 이 작업에서 특보를 한 번이라도 읽었는지(발효 특보 0건이어도 true)
let wrnFetchSeq = 0;     // 불러오기 차례 번호 — 날짜를 빨리 바꿔 요청이 겹치면 마지막 요청만 칠한다(늦게 온 옛 응답 무시)
// 지금 지도에 칠해져 있는 특보 구역 수(이 특보 지도 기준) — 발효 0건으로 지울 때 '이전 색을 지웠다'고 알려 주려고 센다.
function wrnPaintedCount() {
  const st = S.style === 'warnsea' ? 'warnsea' : 'warn';
  return Object.keys((S.fillsByStyle || {})[st] || {}).length + (st === 'warnsea' ? Object.keys(S.seaFills || {}).length : 0);
}
// 특보 지도인데 '발효 중인 특보 없음'으로 불러와 칠이 비어 있나 — AE 보내기·타임라인 구성이 '먼저 칠하세요'(빠뜨린 것처럼) 대신 정상이라고 알리게
function wrnNoneLeftMapEmpty() {
  return (S.style === 'warn' || S.style === 'warnsea') && !!S.wrnNone && !wrnPaintedCount();
}
const wrnNoneEmptyText = (todo) => `발효 중인 기상특보가 없어 칠한 구역이 없어요 — 오류가 아니에요. 특보가 생기면 다시 불러온 뒤 ${todo}`;
// 반환: 읽어서 칠했으면(발효 0건 포함) true, 못 읽었으면 false.
// src: 'fetch'(기상청에서 불러오기) | 'paste'(붙여넣기, 기본). 결과는 #wrnResult 카드로 보여 준다(alert 안 씀).
// extra: 실패 카드에 함께 넘길 것(fetchWrn의 retry·back·defKey).
function applyWrn(txt, keepSel, src, extra) {
  src = src === 'fetch' ? 'fetch' : 'paste';
  const read = wrnReadText(txt);
  if (read.kind !== 'rows') { showWrnResult({ ...read, ...extra, src }); return false; }
  // 일부 줄을 못 읽었는데 읽은 줄엔 발효 특보가 없음 → '특보 없음'으로 지도를 비우면 안 된다(못 읽은 줄에 특보가 있을 수 있다)
  if (read.unread) {
    const at = (!keepSel || keepSel === '__NOW__') ? (wrnWhen || currentTm()) : keepSel;
    if (!wrnSummarize(read.rows, at).eff) { showWrnResult({ kind: 'format', partial: true, unread: read.unread, detail: read.sample, ...extra, src }); return false; }
  }
  // 정상 응답 — 발효 중인 특보가 0건이어도(헤더만 옴) '특보 없음'으로 칠을 비운다.
  // (오류로 끝내면 직전 시각의 특보 색이 새 시각 라벨 아래 그대로 남는다)
  const before = wrnPaintedCount();
  pushUndo();
  wrnAllEvents = read.rows; wrnLoaded = true;
  // keepSel: 목록에서 특정 시각을 골라 '그 시각으로 재요청'한 경우 — 목록은 그대로 두고 그 시각 현황만 다시 칠한다.
  if (!keepSel) buildWrnBulletins();         // 최초 불러오기만 목록을 새로 만든다 (맨 위 '발효 현황'=기본, 아래 발효시각들)
  const sum = showWrnAsOf(keepSel || '__NOW__', src);   // 기본: 지금(또는 고른 시각) 발효 중인 특보 현황
  showWrnResult({ ...sum, src, unread: read.unread || 0, sample: read.sample || '', cleared: sum.kind === 'none' && !wrnPaintedCount() ? before : 0 });
  return true;
}
// 고른 '발표시각(통보문)' 기준으로 특보를 계산·색칠. 반환: 결과 카드에 쓸 요약(kind:'ok'|'none' …). src: 'fetch'|'paste'
function showWrnAsOf(fc, src) {
  wrnSelFc = fc;
  const sel = $('#wrnBulletinSel'); if (sel && sel.value !== fc) sel.value = fc;
  // 모두 '발효현황' 기준(activeWrnRows). __NOW__=지금/고른날짜, 그 외=그 발효시각.
  const isNow = fc === '__NOW__' && !wrnWhen;
  const at = (fc === '__NOW__') ? (wrnWhen || currentTm()) : fc;
  const sum = wrnSummarize(wrnAllEvents, at);
  const rows = sum.active;
  // 초안에 없는 특보종류가 나오면 회색으로라도 잡아둔다(안 그러면 조용히 안 칠해짐).
  const added = [];
  for (const r of rows) if (!S.wrnColors[r.wrn] && r.wrn) { S.wrnColors[r.wrn] = ['#C4C4C4', '#8C8C8C']; added.push(r.wrn); }
  if (added.length) buildWrnCols();
  wrnRows = rows;
  // 활성 특보 집합을 프로젝트(S)에 저장 — wrnRows는 런타임 변수라 저장/리로드 때 사라진다.
  // 이게 없으면 프로젝트를 다시 열었을 때 겹쳐 가려진 특보(예: 폭염 밑 열대야)가 AE 내보내기에서 빠진다.
  S.wrnActive = rows.map((r) => ({ id: r.id, wrn: r.wrn, lvl: r.lvl, tmfc: r.tmfc, tmef: r.tmef }));
  // 기본 순서에, 사용자가 드래그로 바꾼 순서(이전 순서)를 그대로 얹는다 — 다시 불러와도 초기화되지 않게.
  wrnOrder = mergeWrnOrder(wrnOrder.length ? wrnOrder : S.wrnOrder, defaultWrnOrder(wrnRows, Object.keys(S.wrnColors)));
  S.wrnOrder = wrnOrder.slice();   // 겹침 우선순위를 프로젝트에 저장(재오픈·AE 쌓임순서 보존)
  S.wrnOff = S.wrnOff || {};
  // 예비특보는 기본으로 꺼둔다(한 번도 안 건드린 것만).
  for (const r of wrnRows) { const k = wrnKeyOf(r); if (isPre(r.lvl) && S.wrnOff[k] === undefined) S.wrnOff[k] = 1; }
  const kind = sum.eff ? 'ok' : 'none';
  // 발효 0건(정상) 표시는 상태(S)에 둔다 — 실행 취소·저장/다시 열기에도 목록의 '특보 없음' 카드가 맞게 따라온다.
  if (kind === 'none') S.wrnNone = { at, now: isNow, src: src === 'fetch' ? 'fetch' : 'paste', pre: sum.pre, up: sum.up, rel: sum.rel };
  else delete S.wrnNone;
  buildWrnList();
  paintWrn();
  // 칠한 구역 수·바다 구역·꺼 둔 특보·예비 켬/끔은 지금 지도 기준으로 센다(지도 종류를 바꾸거나 눈을 누르면 다시 센다)
  return { kind, at, now: isNow, types: sum.types, up: sum.up, rel: sum.rel, added, ...wrnPaintStats() };
}
// '발효 현황' 드롭다운 항목 라벨 — 날짜·시각을 고르면 그 시각 기준으로 표시.
function wrnEffLabel() { return wrnWhen ? `${tmShort(wrnWhen)} 발효 현황` : '발효 현황 (지금 유효한 특보)'; }
// 202608031600 -> '2026.08.03.16:00' (KMA 통보문 목록 형식)
function tmFull(t) { const s = String(t || ''); if (!/^\d{12}$/.test(s)) return ''; return `${s.slice(0, 4)}.${s.slice(4, 6)}.${s.slice(6, 8)}.${s.slice(8, 10)}:${s.slice(10, 12)}`; }
// 'YYYYMMDDHHMM' ↔ Date (로컬시각). KMA 특보는 KST 로컬 기준으로 비교/표시한다.
function tmToDate(tm) { const s = String(tm); return new Date(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +s.slice(8, 10), +(s.slice(10, 12) || 0)); }
function dateToTm(d) { const p = (v) => String(v).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}00`; }

// 발효현황 드롭다운 — '정시(매 시각) 스냅샷' 목록. 최신(미래 발효예정)이 위.
// KMA는 발효현황을 임의 정시 기준(예: 15:00·17:00)으로 내는데, 그 시각들은 발효/발표시각과 안 맞을 수 있어
// 데이터의 발효시각만 나열하면 15:00 같은 게 빠진다 → base(±) 매 정시를 만들어 어떤 정시든 고를 수 있게 한다.
// 고르면 그 시각으로 기상청에 '재요청'(fetchWrn, fe=e)해서 그 정시의 발효현황을 정확히 받아 칠한다.
function buildWrnBulletins() {
  const sel = $('#wrnBulletinSel'), row = $('#wrnBulletinRow'); if (!sel) return;
  const now = currentTm();
  const base = wrnWhen || now;
  const d0 = tmToDate(base); d0.setMinutes(0, 0, 0);   // base를 정시로 내림
  const times = [];
  for (let h = 18; h >= -36; h--) times.push(dateToTm(new Date(d0.getTime() + h * 3600e3)));   // 미래 +18h ~ 과거 -36h, 최신순
  sel.innerHTML = '';
  { const o = document.createElement('option'); o.value = '__NOW__'; o.textContent = wrnEffLabel(); sel.appendChild(o); }
  for (const t of times) {
    const o = document.createElement('option');
    o.value = t; o.textContent = `${tmFull(t)} 발효${t > now ? ' 예정' : ' 현황'}`;
    sel.appendChild(o);
  }
  if (row) row.style.display = '';
  sel.value = '__NOW__';   // 기본: 지금 발효현황
}
// 드롭다운/버튼으로 고른 시각을 왼쪽 날짜·시각 picker에도 반영해 화면을 일관되게 유지.
function reflectWhenToPicker() {
  const past = !!wrnWhen;
  const pr = $('#wrnPastRow'); if (pr) pr.style.display = past ? '' : 'none';
  const nb = $('#wrnWhenNow'), pb = $('#wrnWhenPast');
  if (nb) nb.classList.toggle('pri', !past);
  if (pb) pb.classList.toggle('pri', past);
  if (past) {
    const w = wrnWhen, di = $('#wrnDate'), ti = $('#wrnTime');
    if (di) di.value = `${w.slice(0, 4)}-${w.slice(4, 6)}-${w.slice(6, 8)}`;
    if (ti) ti.value = `${w.slice(8, 10)}:${w.slice(10, 12)}`;
  }
}

// 지금 켜둔 특보만 골라 칠한다. 목록 체크를 바꾸면 다시 부른다.
function paintWrn() {
  const known = new Set(MAP.styles.warn.zones.map((z) => z.id));
  const seaKnown = new Set((MAP.sea || []).map((z) => z.id));
  const best = {}; // id -> 가장 우선순위 높은 특보

  for (const r of wrnRows) {
    if (S.wrnOff[wrnKeyOf(r)]) continue;                 // 목록에서 끈 것
    if (!wrnColorOf(r.wrn, r.lvl)) continue;
    if (!known.has(r.id) && !seaKnown.has(r.id)) continue;   // 지도에 없는 구역 — wrnPaintStats가 세어 안내한다
    const prev = best[r.id];
    if (!prev || wrnRank(r) < wrnRank(prev)) best[r.id] = r;
  }

  const F = {}, SF = {};
  for (const [id, r] of Object.entries(best)) {
    const col = wrnColorOf(r.wrn, r.lvl);
    if (id.startsWith('S')) SF[id] = col; else F[id] = col;
  }
  // 특보 지도 두 종류에 같이 넣는다 (조각 id가 같다)
  S.fillsByStyle.warn = F;
  S.fillsByStyle.warnsea = { ...F };
  S.seaFills = SF;
  renderFills(); renderSea(); renderVfBar();   // renderVfBar가 범례까지 재배치 (특보 수 → 제목 바 높이 + 범례)
  syncWrnInfo();
  return Object.keys(F).length + Object.keys(SF).length;
}
// 들어온 특보(wrnRows) 중 지금 이 지도에 실제로 칠해진 것을 센다 — 결과 카드·목록 아래 안내가 같은 숫자를 쓰게.
// 특보 지도(육상)에는 바다가 안 보인다 — 바다 구역 수를 섞어 세면 '칠했다는데 안 보인다'가 되므로 seaHidden으로 따로 센다.
// 칠이 지워졌으면(특보 색 지우기·손으로 지움) 그 구역은 안 센다.
function wrnPaintStats() {
  const known = new Set(MAP.styles.warn.zones.map((z) => z.id));
  const seaKnown = new Set((MAP.sea || []).map((z) => z.id));
  const F = (S.fillsByStyle || {}).warn || {}, SF = S.seaFills || {};
  const off = S.wrnOff || {};
  const seaShown = S.style === 'warnsea';
  const label = (r) => `${r.wrn || ''} ${r.lvl || ''}`.trim();
  const uniq = (a) => Array.from(new Set(a));
  const on = (r) => !off[wrnKeyOf(r)];
  const eff = wrnRows.filter((r) => !isPre(r.lvl));
  const land = new Set(), sea = new Set(), seaNames = [], unknown = new Map();
  for (const r of wrnRows) {
    if (!on(r) || !wrnColorOf(r.wrn, r.lvl)) continue;
    if (!known.has(r.id) && !seaKnown.has(r.id)) { unknown.set(r.id, r.ko || r.id); continue; }
    if (String(r.id).startsWith('S')) { if (SF[r.id]) { sea.add(r.id); seaNames.push(label(r)); } }
    else if (F[r.id]) land.add(r.id);
  }
  const preL = (want) => uniq(wrnRows.filter((r) => isPre(r.lvl) && on(r) === want).map(label));   // true: 켜 둔 예비 / false: 꺼 둔 예비
  return {
    painted: land.size + (seaShown ? sea.size : 0),
    seaHidden: seaShown ? 0 : sea.size,
    seaNames: uniq(seaNames),
    seaMap: (MAP.styles.warnsea && MAP.styles.warnsea.label) || '특보 + 해상',
    landEff: eff.filter((r) => !String(r.id).startsWith('S')).length,
    unknown: unknown.size, unknownNames: uniq([...unknown.values()]),
    offNames: uniq(eff.filter((r) => !on(r)).map(label)),
    offAll: eff.length > 0 && !eff.some(on),
    onCount: wrnRows.filter(on).length,
    pre: preL(false), preOn: preL(true),
  };
}
// 목록 아래 한 줄 안내(#wrnInfo) — 몇 구역 칠했는지 · 육상 지도에서 안 보이는 바다 구역 · 지도에 없는 구역
function syncWrnInfo(st) {
  const n = $('#wrnInfo'); if (!n) return;
  st = st || wrnPaintStats();
  const parts = [];
  if (!wrnRows.length || (S.wrnNone && !st.onCount)) { /* 발효 특보 0건 — 목록 자리의 '특보 없음' 카드가 설명한다 */ }
  else if (!st.onCount) parts.push('켜 둔 특보가 없어 칠한 구역이 없어요 — 목록의 눈 아이콘으로 켜세요');
  else parts.push(`${st.painted}개 구역 칠함`);
  if (st.seaHidden) parts.push(`바다 특보 ${st.seaHidden}구역은 ‘${st.seaMap}’ 지도에서 보여요`);
  if (st.unknown) parts.push(`지도에 없는 구역 ${st.unknown}개`);
  n.textContent = parts.join(' · ');
}

// 결과 카드·빈 상태 카드 아이콘(흰 선, 바탕색은 CSS 톤) — 이모지 대신 SVG
const WRN_ICON = {
  ok: '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  err: '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M12 6v8" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><circle cx="12" cy="18.5" r="1.8" fill="currentColor"/></svg>',
  busy: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-opacity=".25" stroke-width="3"/><path d="M12 3a9 9 0 0 1 9 9" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>',
  info: '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><circle cx="12" cy="6.5" r="1.8" fill="currentColor"/><path d="M12 11v7.5" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>',
};
WRN_ICON.warn = WRN_ICON.err;   // 확인 필요(주황)도 느낌표 — 바탕색으로 오류(빨강)와 구분
// 목록 자리의 '발효 중인 특보 없음' 카드 — 정상 안내(파란 정보 톤). info = S.wrnNone
// 켜 둔 예비특보가 있으면 '비어 있는 게 정상'이라고 하지 않고, 오래된(1시간+) '지금' 결과면 '그때는 없었다'로 쓴다(wrnEmptyView).
function wrnEmptyCard(info) {
  const d = document.createElement('div');
  d.className = 'wrnEmpty';
  d.innerHTML = `<div class="wrnResIc">${WRN_ICON.info}</div><div style="flex:1;min-width:0"><div class="t"></div><div class="s"></div></div>`;
  const off = S.wrnOff || {};
  const v = wrnEmptyView(info, { nowTm: currentTm(), preOn: wrnRows.some((r) => isPre(r.lvl) && !off[wrnKeyOf(r)]) });
  d.querySelector('.t').textContent = v.title;
  d.querySelector('.s').textContent = v.sub;
  return d;
}

// 들어온 특보 목록 — 무엇이 몇 구역인지 보여주고, 켜고 끌 수 있게.
function buildWrnList() {
  const w = $('#wrnList');
  w.textContent = '';
  // 정상 응답인데 발효 중인 특보가 0건(예비특보만 있거나 아예 없음) — 빈 목록 대신 '특보 없음' 카드로 정상임을 알린다
  const none = !!S.wrnNone && !wrnRows.some((r) => !isPre(r.lvl));
  if (!wrnRows.length && !none) return;
  if (none) {
    const h = document.createElement('div');
    h.className = 'subhead';
    h.innerHTML = wrnRows.length ? '들어온 특보 <span>· 발효 중 0건 · 예비특보만</span>' : '들어온 특보 <span>· 발효 중 0건</span>';
    w.append(h, wrnEmptyCard(S.wrnNone));
    if (!wrnRows.length) return;
  }

  // 종류 × 수준별로 센다. 발표시각은 구역마다 다를 수 있어서 가장 이른/늦은 것을 함께 본다.
  const agg = {};
  for (const r of wrnRows) {
    const k = r.wrn + ' ' + r.lvl;
    const a = (agg[k] = agg[k] || { wrn: r.wrn, lvl: r.lvl, n: 0, fc0: '999999999999', fc1: '' });
    a.n++;
    if (r.tmfc && r.tmfc < a.fc0) a.fc0 = r.tmfc;
    if (r.tmfc && r.tmfc > a.fc1) a.fc1 = r.tmfc;
  }
  const list = Object.values(agg).sort((a, b) => wrnRank(a) - wrnRank(b));

  const head = document.createElement('div');
  head.className = 'subhead';
  head.innerHTML = '들어온 특보 <span>· 위에 있을수록 우선 (겹치면 이김)</span>';
  if (!none) w.append(head);   // 0건 카드가 이미 머리를 달았다
  w.ondragleave = (e) => {
    if (!e.relatedTarget || !w.contains(e.relatedTarget)) clearWrnDragFeedback(w);
  };

  for (const [listIndex, a] of list.entries()) {
    const key = wrnKeyOf(a);
    const on = !S.wrnOff[key];
    const d = document.createElement('div');
    d.className = 'item wrnItem';
    // 발표시각이 구역마다 다르면 범위로 보여준다 ("7/12 16:00~7/15 10:00")
    const fc = a.fc0 === a.fc1 ? tmShort(a.fc0) : tmShort(a.fc0) + '~' + tmShort(a.fc1);
    // 이름(폭염경보 등)을 윗줄에 온전히, 발표시각은 아랫줄에 — 한 줄에 다 넣으면 이름이 1글자로 잘린다.
    d.innerHTML = `<span class="wrnDrag" draggable="true" title="드래그해서 겹침 순서 바꾸기" style="cursor:grab;user-select:none;font-size:16px;color:var(--on-surface-var)">☰</span>` +
      `<button class="eye${on ? '' : ' off'}"></button>` +
      `<input type="color" class="wrnCol" style="width:24px;height:20px;flex:none" title="이 특보 색 바꾸기 (같은 종류·단계 구역만 바뀜)">` +
      `<div style="flex:1;min-width:0">` +
        `<div class="nm" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis"></div>` +
        `<div class="fc" style="color:var(--on-surface-var);font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"></div>` +
      `</div>` +
      `<span style="color:var(--on-surface-var);white-space:nowrap;font-size:11px">${a.n}구역</span>`;
    d.querySelector('.nm').textContent = a.wrn + ' ' + a.lvl;
    d.querySelector('.fc').textContent = fc;
    d.title = (fc ? `발표 ${fc}` : '') + (isPre(a.lvl) ? '\n예비특보 — 아직 발효된 게 아닙니다' : '');
    d.querySelector('.nm').style.opacity = on ? '' : '.45';
    const ci = d.querySelector('.wrnCol');
    ci.value = wrnColorOf(a.wrn, a.lvl) || '#666666';
    ci.oninput = (e) => {   // 들어온 특보의 정확한 종류×단계 색만 바꾼다
      pushUndo('wrncol' + key);
      setWrnLevelColor(a.wrn, a.lvl, e.target.value);
      paintWrn(); renderLegend();
    };
    d.querySelector('.eye').onclick = () => {
      pushUndo();
      S.wrnOff[key] = S.wrnOff[key] ? 0 : 1;   // 그려 둔 값(on) 말고 지금 상태를 뒤집는다(실행 취소 뒤 헛클릭 방지)
      buildWrnList(); paintWrn(); renderLegend();   // 범례 자동 모드면 눈 상태에 맞춰 갱신
      wrnRefreshResult();   // 결과 카드의 '몇 구역 칠함·켜 둔 예비' 숫자도 눈 상태에 맞춘다
    };
    const drag = d.querySelector('.wrnDrag');
    if (drag) {
      drag.ondragstart = (e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(listIndex));
        d.classList.add('dragging');
      };
      drag.ondragend = () => clearWrnDragFeedback(w);
      d.ondragover = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        w.querySelectorAll('.drop-before,.drop-after').forEach((node) => node.classList.remove('drop-before', 'drop-after'));
        const rect = d.getBoundingClientRect();
        d.classList.add(e.clientY >= rect.top + rect.height / 2 ? 'drop-after' : 'drop-before');
      };
      d.ondrop = (e) => {
        e.preventDefault();
        const from = Number(e.dataTransfer.getData('text/plain'));
        const rect = d.getBoundingClientRect();
        const to = wrnDropIndex(from, listIndex, e.clientY >= rect.top + rect.height / 2, list.length);
        clearWrnDragFeedback(w);
        if (!Number.isInteger(from) || from === to) return;
        pushUndo();
        wrnOrder = moveWrnOrder(list.map(wrnKeyOf), from, to);
        S.wrnOrder = wrnOrder.slice();   // 바꾼 우선순위를 저장(재오픈·AE 순서 보존)
        buildWrnList(); paintWrn();
      };
    }
    w.append(d);
  }
}
