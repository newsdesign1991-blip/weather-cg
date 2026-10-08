/* [모듈] js/typhoon-api.js — 태풍 데이터: 기상청 typ/td 파싱, JMA·JTWC, 이름 저장, TD 가장자리 붙이기, fetchTyphoon */
'use strict';

// ── 기상청 태풍정보 API (apihub typ_now.php — 특보와 같은 authKey, WNS 헬퍼 프록시) ──
// typ_now.php는 분석(FT=0)+예측(FT=1)을 CSV로 주고 RAD15/RAD25/RAD(70%) 3종 반경 포함.
const TYP_KEY_STORE = 'wcg_typ_key';   // (구 data.go.kr 키 — 이제 apihub 기본키 사용, 미사용)
const typKey = () => (localStorage.getItem(TYP_KEY_STORE) || '').trim();
const _tnum = (o, ...ks) => { for (const k of ks) { const v = o[k]; if (v != null && v !== '') { const n = parseFloat(v); if (!isNaN(n)) return n; } } return 0; };
const _tstr = (o, ...ks) => { for (const k of ks) { const v = o[k]; if (v != null && v !== '') return String(v); } return ''; };
let typhoonRaw = null;   // { src, whichList:[{tno,name,rows}] } — API 원본(비영속)

// UTC YYYYMMDDHH(MM) -> KST "M월 D일 H시"
function fmtKST(tm) {
  const s = String(tm).replace(/\D/g, ''); if (s.length < 10) return '';
  const d = new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +s.slice(8, 10), +(s.slice(10, 12) || 0)));
  d.setUTCHours(d.getUTCHours() + 9);
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 ${d.getUTCHours()}시`;
}
const _cnum = (v) => { const n = parseFloat(v); return (isNaN(n) || n <= -900) ? 0 : n; };
// typ_now CSV 한 줄 -> 지점. 열: FT,YY,TYP,SEQ,TMD,TYP_TM,FT_TM,LAT,LON,DIR,SP,PS,WS,RAD15,RAD25,RAD,ED15,ER15,LOC,ED25,ER25
function typPointFromRow(c) {
  return { ft: +c[0], lon: _cnum(c[8]), lat: _cnum(c[7]), dir: (c[9] || '').trim(), sp: _cnum(c[10]), ps: _cnum(c[11]), ws: _cnum(c[12]),
    r15: _cnum(c[13]), r25: _cnum(c[14]), r70: _cnum(c[15]), tmef: (c[6] || '').trim(), loc: (c[18] || '').trim(),
    fcst: +c[0] === 1, label: fmtKST(c[6]) };
}
function parseTypNow(text) {
  const rows = [];
  for (const ln of String(text).split(/\r?\n/)) { if (!ln || ln.trim()[0] === '#') continue; const c = ln.split(','); if (c.length >= 19 && /^\d+$/.test((c[0] || '').trim())) rows.push(c); }
  return rows;
}
// td_now 한 줄 -> TD 지점. 열: FT,YY,TD,SEQ,TYP(연결태풍),TD_TM,FT_TM,LAT,LON,DIR,SP,PS,WS,RAD(70%),GR,LOC. (공백 또는 콤마 구분, LOC엔 공백 포함)
function typTdPointFromRow(c) {
  return { ft: +c[0], lat: _cnum(c[7]), lon: _cnum(c[8]), dir: (c[9] || '').trim(), sp: _cnum(c[10]), ps: _cnum(c[11]), ws: _cnum(c[12]),
    r15: 0, r25: 0, r70: _cnum(c[13]), tmef: (c[6] || '').trim(), loc: (c[15] || '').trim(), fcst: +c[0] === 1, label: fmtKST(c[6]),
    td: true, tdNo: (c[2] || '').trim(), typLink: (c[4] || '').trim() };
}
function parseTdRows(text) {
  const rows = [];
  for (const ln of String(text).split(/\r?\n/)) {
    if (!ln || ln.trim()[0] === '#' || !ln.trim()) continue;
    if (ln.split(',').length >= 19) continue;   // typ_now(콤마 19열+) 형식은 TD가 아님 — 건너뜀
    let c = ln.indexOf(',') >= 0 ? ln.split(',') : ln.trim().split(/\s+/);
    if (c.length < 15 || !/^\d+$/.test((c[0] || '').trim())) continue;
    if (c.length > 16) { c[15] = c.slice(15).join(' '); c.length = 16; }   // LOC(공백 포함)을 하나로
    rows.push(c);
  }
  return rows;
}

// opts.fromSel: 드롭다운 전환 — 메모리 원본(typhoonRaw, 비영속·다른 불러오기일 수 있음) 대신 S에 저장된 목록(지점 포함)으로 고른다.
function selectTyphoonFromApi(idx, opts) {
  const prev = S.typhoon || {};
  let list = null, src = '';
  if (opts && opts.fromSel) {
    const sl = prev.whichList, sw = sl && sl[idx];
    const rw = typhoonRaw && typhoonRaw.whichList && typhoonRaw.whichList[idx];
    if (sw && sw.points) { list = sl; src = prev.src || 'kma'; }
    else if (sw && rw && rw.tno === sw.tno && rw.name === sw.name && typhoonRaw.whichList.length === sl.length) { list = typhoonRaw.whichList; src = typhoonRaw.src === 'apihub' ? 'kma' : (typhoonRaw.src || 'kma'); }   // 옛 저장본(지점 없음) — 같은 불러오기일 때만
  } else if (typhoonRaw && typhoonRaw.whichList[idx]) { list = typhoonRaw.whichList; src = typhoonRaw.src === 'apihub' ? 'kma' : (typhoonRaw.src || 'kma'); }
  if (!list) {   // 전환할 지점 자료가 없으면 드롭다운 표시를 현재 태풍으로 되돌리고 안내
    buildTyphoonPanel(); if (isTyphoonCompare()) buildCompareSection();
    status('이 태풍으로 바꾸려면 다시 불러오기를 눌러 주세요', true);
    return;
  }
  if (opts && opts.fromSel) pushUndo();   // 드롭다운 전환은 되돌리기 가능(못 바꾼 경우엔 빈 단계를 남기지 않게 여기서)
  const w = list[idx];
  const rows = w.points || (w.rows ? w.rows.map(typPointFromRow) : []);
  const anal = rows.filter((r) => !r.fcst).sort((a, b) => (a.tmef > b.tmef ? 1 : (a.tmef < b.tmef ? -1 : 0)));
  const fcst = rows.filter((r) => r.fcst).sort((a, b) => (a.tmef > b.tmef ? 1 : (a.tmef < b.tmef ? -1 : 0)));
  const pts = JSON.parse(JSON.stringify(anal.concat(fcst)));   // 분석(과거~현재) + 예측(미래). nowIdx=마지막 분석 (목록 지점과 따로 복사)
  const DEF = typhoonStyleDefaults();
  const style = {};
  for (const k of TYPHOON_STYLE_KEYS) { const v = (prev[k] != null ? prev[k] : DEF[k]); if (v !== undefined) style[k] = v; }   // 아이콘/범례 등 스타일 키 모두 보존
  S.typhoon = Object.assign({
    name: w.name, issues: [{ tmfc: '', label: '실황 + 예상경로', points: pts }], sel: 0, fromApi: true,
    src,   // 반경 이름을 나라별로 바꾸는 데 씀
    // 지점까지 저장 — 새로고침·파일 열기·되돌리기 뒤에도 드롭다운 전환이 S만으로 된다
    whichList: list.map((x) => ({ tno: x.tno, year: x.year, td: x.td, name: x.name, points: JSON.parse(JSON.stringify(x.points || (x.rows ? x.rows.map(typPointFromRow) : []))) })), whichSel: idx, nowIdx: null, labelSel: null,
    compare: prev.compare || [],   // 비교 목록은 불러오기(트랙 교체)에도 보존 — 여러 기관 누적 비교 가능
    refImgs: prev.refImgs || (prev.refImg ? [prev.refImg] : []), refSel: prev.refSel,   // 대고 그리는 참고 이미지는 통보문/예보 불러와도 보존(간섭 방지)
    places: prev.places || [], placeSize: prev.placeSize,   // 지명표시(사용자 입력)도 보존
  }, style);
  autoTodayTyphoonLabel();   // 오늘 지점 라벨 하나 자동 표시
  buildTyphoonPanel(); renderTyphoon();
  // 비교 지도에서 '불러오기'(드롭다운 전환 제외)면 방금 로드한 예보를 자동으로 비교에 추가(중복 이름은 갱신).
  if (!(opts && opts.fromSwitch) && isTyphoonCompare()) addCompareForecast(true);
  if (isTyphoonCompare()) buildCompareSection();
}

// JMA 경계역/예보원 → 반경(km). {radius}(強風域·予報円) 또는 {arc:[[center,radius_m,[a0,a1]]…]}(暴風域) 둘 다 최대반경으로.
function jmaAreaRadKm(area) {
  if (!area) return 0;
  let m = +area.radius || 0;
  if (Array.isArray(area.arc)) for (const x of area.arc) { const r = +x[1] || 0; if (r > m) m = r; }
  return m ? Math.round(m / 1000) : 0;
}
// 일본 기상청(JMA) 공개 JSON(bosai) — CORS 허용이라 브라우저가 직접 fetch(헬퍼 불필요).
// 予報円(probabilityCircle)→r70(70% 확률반경), 暴風域(stormWarningArea)→r25(25m/s), 強風域(galeWarningArea)→r15(15m/s).
async function fetchJma() {
  const B = 'https://www.jma.go.jp/bosai/typhoon/data/';
  const btn = $('#typFetchJma'); if (btn) btn.disabled = true;
  status('일본 기상청(JMA) 불러오는 중…', true);
  try {
    const list = await (await fetch(B + 'targetTc.json', { cache: 'no-store' })).json();
    if (!Array.isArray(list) || !list.length) { status('JMA: 활동 중인 태풍이 없습니다', true); return; }
    const catWs = { TY: 35, STS: 28, TS: 20, TD: 12, LOW: 10 };
    const utc12 = (v) => String((v && v.UTC) || '').replace(/\D/g, '').slice(0, 12);
    const whichList = [];
    for (const tc of list) {
      const id = tc.tropicalCyclone; if (!id) continue;
      let fc; try { fc = await (await fetch(B + id + '/forecast.json', { cache: 'no-store' })).json(); } catch (e) { continue; }
      if (!Array.isArray(fc)) continue;
      const title = fc.find((p) => p.part === 'title') || {};
      const nm = (title.name && (title.name.en || title.name.jp)) || id;   // 영어 이름 우선(일본어 못 읽는 경우 대비)
      const num = title.typhoonNumber || '';
      const ws = catWs[tc.category] || 25;
      const anal = fc.find((p) => p.part === 'Analysis' || (p.part && p.part.en === 'Analysis'));
      const pts = [];
      const tk = anal && anal.track && anal.track.typhoon;   // 과거 경로 폴리라인 [[lat,lon],…]
      if (Array.isArray(tk) && tk.length > 1) {
        const step = Math.max(1, Math.round(tk.length / 24));   // 선은 촘촘히(≈24점) 유지
        let j = 0;   // 그 중 2개마다 1개꼴로 '전 발표' 아이콘(≈12개) — 선은 매끈, 아이콘은 과밀하지 않게
        for (let i = 0; i < tk.length - 1; i += step) { const q = tk[i]; if (Array.isArray(q) && q.length >= 2) pts.push({ lon: q[1], lat: q[0], ws, r15: 0, r25: 0, r70: 0, tmef: '', label: '', fcst: false, noIcon: (j++ % 2 !== 0) }); }
      }
      if (anal && Array.isArray(anal.center)) { const atm = utc12(anal.validtime); pts.push({ lon: anal.center[1], lat: anal.center[0], ws, r15: jmaAreaRadKm(anal.galeWarningArea), r25: jmaAreaRadKm(anal.stormWarningArea), r70: 0, tmef: atm, label: atm ? fmtKST(atm) : '', fcst: false }); }   // 현재 지점도 시각 라벨(안 그러면 '오늘' 라벨이 '지점 N')
      for (const p of fc) {
        if (!Array.isArray(p.center) || !(p.advancedHours > 0)) continue;
        const tmef = utc12(p.validtime);
        // 예보는 촘촘한 3시간 근접점(+1~+19h)은 아이콘 숨기고(선만) 하루 간격(+22h 이상)만 아이콘 — 안 그러면 아이콘이 뭉친다.
        pts.push({ lon: p.center[1], lat: p.center[0], ws, r15: jmaAreaRadKm(p.galeWarningArea), r25: jmaAreaRadKm(p.stormWarningArea), r70: (p.probabilityCircle ? Math.round((+p.probabilityCircle.radius || 0) / 1000) : 0), tmef, label: fmtKST(tmef), fcst: true, noIcon: !(p.advancedHours >= 22) });
      }
      if (pts.length < 2) continue;
      whichList.push({ tno: num || id, name: nm + ' (JMA' + (num && /^\d+$/.test(num) ? ' 제' + num + '호' : '') + ')', td: tc.category === 'TD', points: pts });
    }
    if (!whichList.length) { status('JMA 자료를 해석하지 못했습니다', true); return; }
    pushUndo();
    typhoonRaw = { src: 'jma', whichList };
    selectTyphoonFromApi(0);
    if (S.typhoon) S.typhoon.r15Buf = 0;   // JMA r15=실제 強風域이라 버퍼 없음
    if (S.map.s > 0.5) setTyphoonDefaultView();
    autoTodayTyphoonLabel(); renderAll();
    status(`일본 기상청(JMA) 불러옴 · ${whichList.length}개 · ${whichList[0].name}`, true);
  } catch (e) {
    status('JMA 불러오기 실패: ' + (e.message || e), true);
  } finally { if (btn) btn.disabled = false; }
}
// JTWC 통보문(.tcw / WTPN) 파싱 → whichList 항목. 압축 예보줄(T000 253N 1419E 115 R064… R050… R034…)과
// 하단 베스트트랙(1226080406 253N1419E 115)을 모두 읽어 과거+예보 한 트랙으로. 풍속 kt→m/s, 반경 NM→km(사분면 최대).
function parseJtwcTcw(text) {
  const lines = String(text).split(/\r?\n/);
  const KT = 0.514444, NM = 1.852;
  let base = '', stormNum = '', name = '';
  for (const ln of lines) { const m = ln.match(/^\s*(\d{10})\s+(\d+)[WEC]\s+([A-Z][A-Z0-9\-]*)\s+\d+/); if (m) { base = m[1]; stormNum = m[2]; name = m[3]; break; } }
  // base = SSYYMMDDHH(태풍번호2+연도2+월일시) — 연도는 slice(2,4)(베스트트랙과 같은 해석)
  const addHours = (b, h) => { const d = new Date(Date.UTC(2000 + +b.slice(2, 4), +b.slice(4, 6) - 1, +b.slice(6, 8), +b.slice(8, 10), 0)); d.setUTCHours(d.getUTCHours() + h); const p = (v) => String(v).padStart(2, '0'); return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}00`; };
  const eLon = (v, hemi) => (hemi === 'W' ? 360 - v : v);   // 날짜변경선 넘는 서경은 동경 연속값(360-)으로
  const byTm = {};
  for (const ln of lines) {   // 압축 예보줄
    const m = ln.match(/^\s*T(\d{3})\s+(\d+)([NS])\s+(\d+)([EW])\s+(\d+)(.*)$/);
    if (!m || !base) continue;
    const tau = +m[1], rest = m[7] || '';
    const rad = (tag) => { const r = rest.match(new RegExp('R' + tag + '\\s+(\\d+)\\s+NE\\s+QD\\s+(\\d+)\\s+SE\\s+QD\\s+(\\d+)\\s+SW\\s+QD\\s+(\\d+)\\s+NW\\s+QD')); return r ? Math.max(+r[1], +r[2], +r[3], +r[4]) * NM : 0; };
    const tmef = addHours(base, tau);
    byTm[tmef] = { lon: eLon((+m[4]) / 10, m[5]), lat: (+m[2]) / 10 * (m[3] === 'S' ? -1 : 1), ws: Math.round((+m[6]) * KT), r15: Math.round(rad('034')), r25: Math.round(rad('050')), r70: 0, tmef, loc: '', fcst: tau > 0, label: fmtKST(tmef) };
  }
  for (const ln of lines) {   // 하단 베스트트랙(과거) — SSYY MMDDHH latN lonE wind
    const m = ln.match(/^\s*\d{2}(\d{2})(\d{6})\s+(\d+)([NS])(\d+)([EW])\s+(\d+)\s*$/);
    if (!m) continue;
    const tmef = '20' + m[1] + m[2] + '00';
    if (byTm[tmef]) continue;   // 예보(반경 포함)가 있으면 우선
    byTm[tmef] = { lon: eLon((+m[5]) / 10, m[6]), lat: (+m[3]) / 10 * (m[4] === 'S' ? -1 : 1), ws: Math.round((+m[7]) * KT), r15: 0, r25: 0, r70: 0, tmef, loc: '', fcst: false, label: fmtKST(tmef) };
  }
  const points = Object.values(byTm).sort((a, b) => (a.tmef < b.tmef ? -1 : 1));
  if (points.length < 2) return null;
  const isTD = Math.max(...points.map((p) => p.ws)) < 17;
  return [{ tno: stormNum || 'JTWC', name: (name ? name + ' ' : '') + '(JTWC' + (stormNum ? ' ' + stormNum + 'W' : '') + ')', td: isTD, points }];
}
// ── 태풍 번호별 이름 (기상청 typ_now API엔 이름이 없어 여기 표에 직접 저장 → 라벨/제목에 자동 부착) ──
// 키 = "년도-번호"(예: "2026-13"). 브라우저 localStorage에 저장(개인·비동기화). 한 번 입력하면 다음 불러오기에도 유지.
const TYP_NAME_STORE = 'wcg_typ_names';
function typNameMap() { try { return JSON.parse(localStorage.getItem(TYP_NAME_STORE) || '{}'); } catch (e) { return {}; } }
function typNameGet(year, tno) { if (!year || !tno) return ''; return (typNameMap()[year + '-' + tno] || '').trim(); }
function typNameSet(year, tno, nm) { const m = typNameMap(); const k = year + '-' + tno; if (nm && nm.trim()) m[k] = nm.trim(); else delete m[k]; localStorage.setItem(TYP_NAME_STORE, JSON.stringify(m)); }
// 드롭다운/제목에 쓸 표시명 = "제N호 태풍" + (저장된 이름이 있으면 " 개미"). TD는 이름 안 붙임.
function typhoonDisplayName(year, tno, isTD) {
  if (isTD) return '열대저압부(TD)';
  const nm = typNameGet(year, tno);
  return '제' + tno + '호 태풍' + (nm ? ' ' + nm : '');
}
// 이름을 바꾼 뒤 whichList 라벨·드롭다운·제목을 다시 반영(불러오기 다시 안 해도 됨).
function refreshTyphoonNames() {
  const T = S.typhoon; if (!T) return;
  const fix = (arr) => { if (!arr) return; for (const w of arr) if (!w.td && w.year) w.name = typhoonDisplayName(w.year, w.tno, false); };
  fix(T.whichList); fix(typhoonRaw && typhoonRaw.whichList);
  const cur = (T.whichList || [])[T.whichSel || 0];
  if (cur && !cur.td && cur.year) T.name = cur.name;   // 제목(태풍명 예상경로)도 갱신
  const which = $('#typWhichSel'); if (which) [...which.options].forEach((o, i) => { if (T.whichList && T.whichList[i]) o.textContent = T.whichList[i].name; });
  renderTyphoon();
}

// apihub typ_now(태풍) + td_now(TD) 파싱 → S.typhoon. TD는 연결된 태풍(TYP) 앞에 붙여 하나의 트랙(TD→태풍)으로.
function applyTyphoonText(rawTyp, rawTd) {
  rawTyp = (rawTyp || '').trim();
  // JTWC 통보문(.tcw) 자동 감지 — PGTW/WTPN 헤더나 'T000 …N …E' 압축 예보줄이 있으면 JTWC로 파싱.
  if (/\bPGTW\b|\bWTPN|^\s*T\d{3}\s+\d+[NS]\s+\d+[EW]\s/m.test(rawTyp)) {
    const wl = parseJtwcTcw(rawTyp);
    if (wl) {
      typhoonRaw = { src: 'jtwc', whichList: wl };
      selectTyphoonFromApi(0);
      // JTWC '34노트 위험구역'은 풍역+오차버퍼라 실제 풍역보다 큼 → r15에 기본 여유 150km(사용자 조절 가능).
      if (S.typhoon) { S.typhoon.r15Buf = (S.typhoon.r15Buf != null && S.typhoon.r15Buf > 0) ? S.typhoon.r15Buf : 150; if (typeof buildTyphoonBands === 'function') buildTyphoonBands(); }
      if (S.map.s > 0.5) setTyphoonDefaultView();
      autoTodayTyphoonLabel(); renderAll();
      status(`JTWC 통보문 불러옴 · ${wl[0].name} · ${wl[0].points.length}개 지점`, true);
      return true;
    }
    status('JTWC 통보문을 못 읽었습니다 (형식 확인)', true); return false;
  }
  const typRows = rawTyp ? parseTypNow(rawTyp) : [];
  let tdRows = rawTd ? parseTdRows(rawTd) : [];
  if (!tdRows.length && rawTyp) tdRows = parseTdRows(rawTyp);   // 붙여넣기에 typ+TD가 섞여 있거나 TD만일 때 여기서 TD 추출
  if (!typRows.length && !tdRows.length) {
    $('#typInfo').textContent = '현재 활동 중인 태풍·열대저압부가 없습니다';
    status('태풍·TD 없음', true); return false;
  }
  const byTyp = {}; for (const c of typRows) { const t = (c[2] || '').trim(); (byTyp[t] ||= []).push(c); }
  const byTd = {}; for (const c of tdRows) { const t = (c[2] || '').trim(); (byTd[t] ||= []).push(c); }
  const tdUsed = {}, whichList = [];
  // 태풍 — 연결된 TD를 트랙에 이어붙인다. 발생(앞)·소멸(뒤) 모두. 시각순 정렬은 selectTyphoonFromApi가 한다.
  for (const tno of Object.keys(byTyp)) {
    const typPts = byTyp[tno].map(typPointFromRow);
    let tdMerge = [];
    for (const tdno of Object.keys(byTd)) {
      const rows = byTd[tdno];
      const link = (rows.map((c) => (c[4] || '').trim()).find((l) => l && +l !== 0)) || '';   // 어느 행이든 연결된 태풍번호
      if (link && +tno !== 0 && +link === +tno) { tdMerge = tdMerge.concat(rows.map(typTdPointFromRow)); tdUsed[tdno] = 1; }
    }
    const maxWs = Math.max(0, ...typPts.map((p) => p.ws));
    const isTD = !tno || +tno === 0 || maxWs < 17;
    const yr = ((byTyp[tno][0] || [])[1] || '').trim();   // c[1] = YY(년도) — 이름 표 키에 사용
    whichList.push({ tno, year: yr, name: typhoonDisplayName(yr, tno, isTD), td: isTD, points: tdMerge.concat(typPts) });
  }
  // 연결 안 된 독립 TD
  for (const tdno of Object.keys(byTd)) {
    if (tdUsed[tdno]) continue;
    whichList.push({ tno: 'TD' + tdno, name: '열대저압부(TD) ' + tdno + '호', td: true, points: byTd[tdno].map(typTdPointFromRow) });
  }
  if (!whichList.length) { $('#typInfo').textContent = '태풍 응답 형식을 인식하지 못했습니다'; status('형식 오류', true); return false; }
  typhoonRaw = { src: 'apihub', whichList };
  selectTyphoonFromApi(0);
  if (S.typhoon) S.typhoon.r15Buf = 0;   // 기상청 r15=실제 강풍반경 → JTWC 버퍼가 남지 않게 0
  if (S.map.s > 0.5) setTyphoonDefaultView();
  autoTodayTyphoonLabel();
  renderAll();
  status(`불러옴: ${whichList.map((w) => w.name).join(', ')}`);
  return true;
}

// (b방식) 트랙 맨 앞(발생)에 열대저압부(TD)를 붙인다 — 추정이 아니라 기상청 td_now에서 '실제 좌표'를 가져온다.
// 태풍 첫 점 시각을 기준으로 시각을 거슬러(최대 48h) td_now를 조회, 그 위치에 연결되는 TD의 분석 좌표를 붙인다. 다시 누르면 원복(토글).
const _dtm = (tm) => +String(tm || '').replace(/\D/g, '').slice(0, 12);
function _tmBack(tm12, hb) { const s = String(tm12); const d = new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +s.slice(8, 10), +(s.slice(10, 12) || 0))); d.setUTCHours(d.getUTCHours() - hb); const p = (v) => String(v).padStart(2, '0'); return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}`; }
// td_now(TD) 또는 typ_now(태풍)에서 기준점(refPt) 근처 스톰의 '실제 분석 좌표'를 시각을 거슬러(back)/앞으로(fwd) 조회.
// kind='td'면 열대저압부, 'typ'면 태풍. refT 기준 back=그 이전, fwd=그 이후 지점만(기존 트랙과 안 겹치게).
// ★위치 근접(<8°)으로 '같은 스톰'을 식별 — 번호가 바뀌어도(태풍↔TD 승격/약화) 트랙 연속성으로 이어붙는다.
async function _scanEdgeReal(refPt, refT, dir, kind) {
  const base = String(refPt.tmef).replace(/\D/g, '').slice(0, 12).padEnd(12, '0');
  const urlOf = kind === 'typ' ? typhoonApiUrlTm : typhoonTdUrlTm;
  const parse = kind === 'typ' ? parseTypNow : parseTdRows;
  const ptOf = kind === 'typ' ? typPointFromRow : typTdPointFromRow;
  let best = null;
  const hbs = []; for (let hb = 0; hb <= 48; hb += 6) hbs.push(hb);
  const raws = await Promise.all(hbs.map((hb) => kmaGet(urlOf(_tmBack(base, dir === 'back' ? hb : -hb)))));   // 병렬 조회(fwd면 미래로)
  for (let i = 0; i < raws.length && !best; i++) {   // 가까운 시각(작은 hb)부터 채택
    const rows = parse(raws[i]); if (!rows.length) continue;
    const by = {}; for (const c of rows) { (by[(c[2] || '').trim()] ||= []).push(c); }
    for (const id of Object.keys(by)) {
      const pts = by[id].map(ptOf);
      let dmin = 1e9; for (const q of pts) { if (q.fcst) continue; const d = Math.hypot(q.lon - refPt.lon, q.lat - refPt.lat); if (d < dmin) dmin = d; }
      if (dmin < 8 && (!best || dmin < best.dmin)) best = { pts, dmin };
    }
  }
  if (!best) return [];
  const seen = {};
  const out = best.pts.filter((q) => !q.fcst && q.tmef && (dir === 'back' ? _dtm(q.tmef) < refT : _dtm(q.tmef) > refT))
    .filter((q) => { const k = _dtm(q.tmef); if (seen[k]) return false; seen[k] = 1; return true; });
  out.forEach((q) => { q.td = (kind !== 'typ') && (+q.ws || 99) < 17; q._edgeTD = true; });
  return out;
}
// td_now + typ_now를 함께 역조회해 시각순으로 병합(같은 시각이면 태풍 우선). back/fwd 공용.
async function _scanEdgeBoth(refPt, refT, dir) {
  const [a, b] = await Promise.all([_scanEdgeReal(refPt, refT, dir, 'td'), _scanEdgeReal(refPt, refT, dir, 'typ')]);
  const m = new Map();
  for (const q of a) m.set(_dtm(q.tmef), q);
  for (const q of b) m.set(_dtm(q.tmef), q);   // 태풍(typ) 우선 — 같은 시각이면 태풍 분류/풍속으로
  return [...m.values()].sort((x, y) => _dtm(x.tmef) - _dtm(y.tmef));
}
// 하위호환 별칭(기존 호출부 유지)
const scanTdReal = (refPt, refT, dir) => _scanEdgeReal(refPt, refT, dir, 'td');
// 점 배열을 바꾼 뒤(TD 붙이기/원복) 지점 인덱스로 붙은 라벨·현재 지점을 '같은 실제 점'으로 옮긴다(빠진 점의 라벨은 삭제).
// 비교 지도면 이 트랙의 스냅샷(같은 지점 열인 비교 항목)도 새 트랙으로 갱신 — 비교 지도는 비교 선만 그리므로.
function _remapEdgePoints(it, oldPts) {
  const T = S.typhoon; if (!T) return;
  const newPts = it.points;
  const mapIdx = (i) => (i == null || !oldPts[i]) ? -1 : newPts.indexOf(oldPts[i]);
  const remapLabels = (arr) => arr.filter((b) => { if (b.idx == null) return true; const k = mapIdx(b.idx); if (k < 0) return false; b.idx = k; return true; });
  if (Array.isArray(T.labels)) T.labels = remapLabels(T.labels);
  if (T.nowIdx != null) { const k = mapIdx(T.nowIdx); T.nowIdx = k < 0 ? null : k; }
  if (isTyphoonCompare() && Array.isArray(T.compare)) {
    const key = (pts) => pts.map((p) => p.tmef + ',' + p.lon + ',' + p.lat).join('|');
    const ok = key(oldPts);
    const c = T.compare.find((x) => !x.manual && Array.isArray(x.points) && key(x.points) === ok);
    if (c) {
      c.points = JSON.parse(JSON.stringify(newPts));
      if (Array.isArray(c.labels)) c.labels = remapLabels(c.labels);   // 스냅샷은 같은 순서의 복사본이라 인덱스 대응이 같다
      buildCompareSection();
    }
  }
}
// 발생(앞)·소멸(뒤) 열대저압부를 실좌표로 붙인다. auto=true면 불러오기에서 조용히, false면 버튼(토글).
async function attachEdgeTD(auto) {
  const it = curTyphoonIssue();
  if (!it || !it.points || !it.points.length) { if (!auto) status('태풍 트랙이 없습니다', true); return; }
  if (!auto && it.points.some((p) => p._edgeTD)) {   // 버튼 재클릭 = 제거(토글)
    pushUndo(); const oldPts = it.points; it.points = it.points.filter((p) => !p._edgeTD);
    _remapEdgePoints(it, oldPts);
    renderTyphoon(); if (typeof buildTyphoonPanel === 'function') buildTyphoonPanel();
    status('열대저압부(발생·소멸) 제거(원복)'); return;
  }
  const core = it.points.filter((p) => !p._edgeTD);   // 기존 것(이미 붙인 edge 제외) 기준
  const times = core.map((p) => _dtm(p.tmef)).filter((v) => v > 100000000000);
  if (!times.length) { if (!auto) status('실좌표 TD는 기상청에서 불러온 태풍(발표시각 데이터)에만 붙습니다.', true); return; }
  if (!apiKey()) { if (!auto) status('apihub 인증키가 필요합니다', true); return; }
  const tMin = Math.min(...times), tMax = Math.max(...times);
  const p0 = core.find((p) => _dtm(p.tmef) === tMin) || core[0];
  const anal = core.filter((p) => !p.fcst);
  const pL = (anal.length ? anal[anal.length - 1] : core[core.length - 1]);   // 소멸은 마지막 '분석' 지점 기준
  const tL = _dtm(pL.tmef);
  const btn = $('#typAddTD'); if (btn) btn.disabled = true;
  if (!auto) status('열대저압부(실좌표) 불러오는 중…', true);
  try {
    let up = false; try { const r = await fetch(WNS_HELPER + '/ping', { cache: 'no-store' }); up = r.ok; } catch (e) { up = false; }
    if (!up) { if (!auto && typeof wnsHelperOffNotice === 'function') wnsHelperOffNotice(); return; }
    // ★td_now(TD)+typ_now(태풍) 둘 다 역/순 조회 → 태풍↔TD가 바뀐 스톰도 트랙 연속성으로 과거/미래를 이어붙인다.
    //  (예: 지금 열대저압부인데 예전엔 태풍이었던 경우 → 앞에 태풍 트랙이 통보문처럼 이어짐)
    const genesis = await _scanEdgeBoth(p0, tMin, 'back');
    const dissip = await _scanEdgeBoth(pL, tL, 'fwd');
    if (!genesis.length && !dissip.length) { if (!auto) status('연결되는 태풍·열대저압부를 못 찾았습니다 (그 시기 데이터 없음)', true); return; }
    pushUndo();
    const oldPts = it.points;
    it.points = [...genesis, ...core, ...dissip];
    _remapEdgePoints(it, oldPts);   // 라벨·현재 지점 인덱스 보정 + 비교 스냅샷 갱신
    const gTyp = genesis.filter((p) => !p.td).length, dTyp = dissip.filter((p) => !p.td).length;
    renderTyphoon(); if (typeof buildTyphoonPanel === 'function') buildTyphoonPanel();
    status(`과거·미래 트랙 붙임 — 발생 ${genesis.length}점(태풍 ${gTyp}) · 소멸 ${dissip.length}점(태풍 ${dTyp}) (버튼 다시 누르면 원복)`);
  } catch (e) {
    if (!auto) status('열대저압부 불러오기 실패: ' + (e.message || e), true);
  } finally { if (btn) btn.disabled = false; }
}
const prependGenesisTD = () => attachEdgeTD(false);   // 버튼 핸들러(토글)
// CSV 응답에 실제 데이터 행(주석 # 아닌 숫자 시작)이 있는지
function typhoonHasRows(t) { return String(t).split(/\r?\n/).some((l) => l && l[0] !== '#' && /^\s*\d/.test(l)); }
// 헬퍼 프록시로 KMA 한 건 조회 → 본문 텍스트(실패/비ok면 ''). 병렬 조회에 공용으로 쓴다.
const kmaGet = (u) => fetch(WNS_HELPER + '/api/kma?u=' + encodeURIComponent(u)).then((r) => r.ok ? r.text() : '').catch(() => '');
async function fetchTyphoon() {
  if (!apiKey()) { if (typeof apiPop === 'function') apiPop(true); status('apihub 인증키가 필요합니다 (API 설정)', true); return; }
  const btn = $('#typFetch'); if (btn) btn.disabled = true;
  status('태풍 정보 불러오는 중…', true);
  try {
    // 1) 헬퍼 살아있는지 먼저 확인 — 꺼져 있으면 설치/실행 안내 팝업
    let up = false; try { const r = await fetch(WNS_HELPER + '/ping', { cache: 'no-store' }); up = r.ok; } catch (e) { up = false; }
    if (!up) { if (typeof wnsHelperOffNotice === 'function') wnsHelperOffNotice(); else status('WNS 헬퍼가 꺼져 있습니다 (R:\\[F]_Util\\WNS 실행)', true); return; }
    // 2) 현재 시각엔 아직 발표가 없을 수 있다 → 최근 발표시각들을 '병렬로' 한 번에 조회하고
    //    데이터가 있는 것 중 가장 최근(작은 back) 것을 쓴다. (순차 되짚기보다 훨씬 빠름)
    let raw = '', found = false;
    {
      const backs = []; for (let b = 0; b <= 12; b++) backs.push(b);
      const texts = await Promise.all(backs.map((b) => kmaGet(typhoonApiUrl(b))));
      for (let i = 0; i < texts.length; i++) { if (typhoonHasRows(texts[i])) { raw = texts[i]; found = true; break; } }
    }
    // 3) 열대저압부(TD) — td_now.php도 같은 방식으로 병렬 조회. 있으면 태풍 CSV에 이어붙여 함께 표시.
    let tdRaw = '';
    {
      const backs = []; for (let b = 0; b <= 12; b++) backs.push(b);
      const texts = await Promise.all(backs.map((b) => kmaGet(typhoonTdUrl(b))));
      for (let i = 0; i < texts.length; i++) { if (typhoonHasRows(texts[i])) { tdRaw = texts[i]; break; } }
    }
    if (tdRaw) console.log('[TD raw]', tdRaw.slice(0, 2000));
    if (!found && !tdRaw) { status('현재 활동 중인 태풍·열대저압부 정보가 없습니다 (기상청)', true); return; }
    console.log('[typhoon raw]', raw.slice(0, 3000));
    const okTyp = applyTyphoonText(raw, tdRaw);   // 태풍·TD를 각자 형식으로 파싱해 병합(TD→태풍 트랙)
    // 기본값: 불러오기 때 발생·소멸 열대저압부(실좌표)를 앞뒤로 자동 부착. (실패해도 태풍만 표시)
    if (okTyp) { status('발생·소멸 열대저압부 확인 중…', true); await attachEdgeTD(true); }
  } catch (e) {
    status('태풍 API 실패: ' + (e.message || e), true);
  } finally { if (btn) btn.disabled = false; }
}
// apihub td_now.php — 열대저압부(TD) 현재+예측. typ_now와 같은 authKey·형식(CSV). disp=1로 CSV 요청.
function typhoonTdUrlTm(tm) { return `https://apihub.kma.go.kr/api/typ01/url/td_now.php?tm=${tm}&mode=1&disp=0&help=0&authKey=${encodeURIComponent(apiKey())}`; }
function typhoonTdUrl(back) { const d = new Date(); if (back) d.setHours(d.getHours() - back); return typhoonTdUrlTm(_kmaTm(d)); }
// 과거 태풍 — 고른 날짜(정오 기준) ±2일 범위의 발표시각을 훑어 데이터 있는 발표를 찾아 그린다. 이름은 별도 입력.
async function fetchTyphoonPast() {
  const inp = $('#typPastDate'); const ds = inp ? inp.value.trim() : '';
  if (!ds) { status('날짜를 먼저 고르세요 (예: 2024-07-24)', true); return; }
  if (!apiKey()) { if (typeof apiPop === 'function') apiPop(true); status('apihub 인증키가 필요합니다 (API 설정)', true); return; }
  const base = new Date((ds.length <= 10 ? ds + 'T12:00:00' : ds));
  if (isNaN(+base)) { status('날짜 형식을 확인하세요 (예: 2024-07-24)', true); return; }
  const btn = $('#typPastFetch'); if (btn) btn.disabled = true;
  status('과거 태풍 불러오는 중…', true);
  try {
    let up = false; try { const r = await fetch(WNS_HELPER + '/ping', { cache: 'no-store' }); up = r.ok; } catch (e) { up = false; }
    if (!up) { if (typeof wnsHelperOffNotice === 'function') wnsHelperOffNotice(); else status('WNS 헬퍼가 꺼져 있습니다', true); return; }
    const offs = [0, -6, 6, -12, 12, -18, 18, -24, 24, -30, 30, -36, 36, -42, 42, -48, 48];   // 정오 기준 ±(시간)
    let raw = '', usedTm = '';
    for (const off of offs) {
      const tm = _kmaTm(new Date(base.getTime() + off * 3600e3));
      try { const r = await fetch(WNS_HELPER + '/api/kma?u=' + encodeURIComponent(typhoonApiUrlTm(tm))); const t = await r.text(); if (r.ok && typhoonHasRows(t)) { raw = t; usedTm = tm; break; } } catch (e) { /* 계속 탐색 */ }
    }
    if (!raw) { status('그 날짜엔 활동 중인 태풍이 없습니다 (±2일 확인) — 다른 날짜로 시도하세요', true); return; }
    let tdRaw = '';
    try { const r = await fetch(WNS_HELPER + '/api/kma?u=' + encodeURIComponent(typhoonTdUrlTm(usedTm))); const t = await r.text(); if (r.ok && typhoonHasRows(t)) tdRaw = t; } catch (e) { /* TD 없어도 태풍만 */ }
    const ok = applyTyphoonText(raw, tdRaw);
    if (ok) { if (S.map.s > 0.5) setTyphoonDefaultView(); status(`과거 태풍 불러옴 · ${usedTm.slice(0, 4)}-${usedTm.slice(4, 6)}-${usedTm.slice(6, 8)} 발표 기준 — 이름은 '이름' 칸에 입력`, true); }
  } catch (e) {
    status('과거 태풍 실패: ' + (e.message || e), true);
  } finally { if (btn) btn.disabled = false; }
}
// apihub typ_now.php — 특보와 같은 apihub authKey 사용(apiKey). back=몇 시간 전(발표 없는 최신시각 회피), mode=1(분석+예측), disp=1(CSV).
const _kmaTm = (d) => { const p = (v) => String(v).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}00`; };
function typhoonApiUrlTm(tm) { return `https://apihub.kma.go.kr/api/typ01/url/typ_now.php?tm=${tm}&mode=1&disp=1&help=0&authKey=${encodeURIComponent(apiKey())}`; }
function typhoonApiUrl(back) { const d = new Date(); if (back) d.setHours(d.getHours() - back); return typhoonApiUrlTm(_kmaTm(d)); }
